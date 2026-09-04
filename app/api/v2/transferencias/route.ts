export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict, badRequest } from "@/lib/api-route";

const getSchema = z.object({
  cuentaOrigenId: z.coerce.number().int().positive().optional(),
  estado: z.enum(["pendiente", "completada", "rechazada", "anulada"]).optional(),
});

// Una transferencia es interna (cuentaDestinoId) o externa a un beneficiario
// cargado (beneficiarioId) — exactamente uno de los dos. El CHECK de la tabla
// dice lo mismo; acá se valida antes para devolver un 400 legible.
const postSchema = z.object({
  cuentaOrigenId: z.coerce.number().int().positive(),
  cuentaDestinoId: z.coerce.number().int().positive().optional(),
  beneficiarioId: z.coerce.number().int().positive().optional(),
  monto: z.number().positive(),
  concepto: z.string().optional(),
});

export const GET = apiRoute({
  curso: 2,
  inputSchema: getSchema,
  handler: async ({ cuentaOrigenId, estado }) => {
    const { rows } = await getQaApiV2Pool().query(
      `SELECT * FROM transferencias
        WHERE activo = true
          AND ($1::bigint IS NULL OR cuenta_origen_id = $1)
          AND ($2::text IS NULL OR estado = $2)
        ORDER BY id
        LIMIT 100`,
      [cuentaOrigenId ?? null, estado ?? null],
    );
    return { body: { data: rows } };
  },
});

// Débito en origen + crédito en destino (si es interna) + la transferencia +
// sus movimientos, todo en una transacción. FOR UPDATE sobre la cuenta origen
// (ordenado por id cuando hay dos cuentas, para no deadlockear con la
// transferencia inversa corriendo en paralelo).
export const POST = apiRoute({
  curso: 2,
  inputSchema: postSchema,
  handler: async ({ cuentaOrigenId, cuentaDestinoId, beneficiarioId, monto, concepto }) => {
    if ((cuentaDestinoId == null) === (beneficiarioId == null)) {
      return badRequest("Indicá exactamente uno: cuentaDestinoId (interna) o beneficiarioId (externa).");
    }
    if (cuentaDestinoId === cuentaOrigenId) {
      return badRequest("La cuenta destino no puede ser la misma que la de origen.");
    }

    return withTransaction(getQaApiV2Pool(), async (client) => {
      const ids = [cuentaOrigenId, cuentaDestinoId].filter((v): v is number => v != null).sort((a, b) => a - b);
      const { rows: cuentas } = await client.query(
        "SELECT * FROM cuentas WHERE id = ANY($1::bigint[]) AND activa = true ORDER BY id FOR UPDATE",
        [ids],
      );
      const origen = cuentas.find((c) => Number(c.id) === cuentaOrigenId);
      if (!origen) return notFound("Cuenta origen no encontrada.");
      if (origen.estado !== "activa") {
        return conflict(`La cuenta origen está ${origen.estado}: no admite transferencias.`);
      }
      if (Number(origen.saldo) < monto) return conflict("Saldo insuficiente en la cuenta origen.");

      let destino;
      if (cuentaDestinoId != null) {
        destino = cuentas.find((c) => Number(c.id) === cuentaDestinoId);
        if (!destino) return notFound("Cuenta destino no encontrada.");
        if (destino.estado !== "activa") {
          return conflict(`La cuenta destino está ${destino.estado}: no admite acreditaciones.`);
        }
        if (destino.moneda !== origen.moneda) {
          return conflict("Las cuentas deben tener la misma moneda.");
        }
      } else {
        const { rows: benef } = await client.query(
          "SELECT id FROM beneficiarios WHERE id = $1 AND activo = true",
          [beneficiarioId],
        );
        if (!benef[0]) return notFound("Beneficiario no encontrado.");
      }

      const { rows: origenRows } = await client.query(
        "UPDATE cuentas SET saldo = saldo - $1 WHERE id = $2 RETURNING *",
        [monto, cuentaOrigenId],
      );
      const { rows: trfRows } = await client.query(
        `INSERT INTO transferencias
           (cuenta_origen_id, cuenta_destino_id, beneficiario_id, monto, moneda, concepto, referencia, estado)
         VALUES ($1, $2, $3, $4, $5, $6, 'TRF-' || to_char(now(), 'YYYYMMDDHH24MISSMS') || '-' || $1, 'completada')
         RETURNING *`,
        [cuentaOrigenId, cuentaDestinoId ?? null, beneficiarioId ?? null, monto, origen.moneda, concepto ?? null],
      );
      const transferencia = trfRows[0];

      await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
         VALUES ($1, 'debito', $2, $3, 'transferencia', $4, $5)`,
        [cuentaOrigenId, monto, origenRows[0].saldo, transferencia.id, concepto ?? "Transferencia enviada"],
      );

      let destinoActualizado = null;
      if (cuentaDestinoId != null) {
        const { rows: destinoRows } = await client.query(
          "UPDATE cuentas SET saldo = saldo + $1 WHERE id = $2 RETURNING *",
          [monto, cuentaDestinoId],
        );
        destinoActualizado = destinoRows[0];
        await client.query(
          `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
           VALUES ($1, 'credito', $2, $3, 'transferencia', $4, $5)`,
          [cuentaDestinoId, monto, destinoRows[0].saldo, transferencia.id, concepto ?? "Transferencia recibida"],
        );
      }

      return {
        status: 201,
        body: {
          data: { ...transferencia, cuenta_origen: origenRows[0], cuenta_destino: destinoActualizado },
        },
      };
    });
  },
});
