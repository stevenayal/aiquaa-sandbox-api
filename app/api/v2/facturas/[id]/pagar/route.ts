export const runtime = "nodejs";

import { z } from "zod";
import { getQaApiV2Pool, withTransaction } from "@/lib/db";
import { apiRoute, notFound, conflict } from "@/lib/api-route";

const schema = z.object({
  id: z.coerce.number().int().positive(),
  cuentaId: z.coerce.number().int().positive(),
});

// Débito en la cuenta + movimiento + factura 'pagada', todo en una
// transacción. FOR UPDATE sobre la factura (dos requests no pueden pagarla a
// la vez) y sobre la cuenta (dos pagos simultáneos no pueden leer el mismo
// saldo y dejarla en negativo). Las facturas son en guaraníes: solo se pagan
// desde una cuenta PYG del mismo titular.
export const POST = apiRoute({
  curso: 2,
  inputSchema: schema,
  handler: async ({ id, cuentaId }) => {
    return withTransaction(getQaApiV2Pool(), async (client) => {
      const { rows: facturaRows } = await client.query(
        "SELECT * FROM facturas WHERE id = $1 AND activo = true FOR UPDATE",
        [id],
      );
      const factura = facturaRows[0];
      if (!factura) return notFound("Factura no encontrada.");
      if (factura.estado === "pagada") return conflict("La factura ya está pagada.");

      const { rows: cuentaRows } = await client.query(
        "SELECT * FROM cuentas WHERE id = $1 AND activa = true FOR UPDATE",
        [cuentaId],
      );
      const cuenta = cuentaRows[0];
      if (!cuenta) return notFound("Cuenta no encontrada.");
      if (Number(cuenta.usuario_id) !== Number(factura.usuario_id)) {
        return conflict("La cuenta no pertenece al titular de la factura.");
      }
      if (cuenta.estado !== "activa") {
        return conflict(`La cuenta está ${cuenta.estado}: no admite débitos.`);
      }
      if (cuenta.moneda !== "PYG") return conflict("Las facturas se pagan desde una cuenta en PYG.");
      if (Number(cuenta.saldo) < Number(factura.monto)) {
        return conflict("Saldo insuficiente para pagar la factura.");
      }

      // $1::numeric explícito: mismo motivo que en /cuentas/{id}/movimientos.
      const { rows: cuentaActualizada } = await client.query(
        "UPDATE cuentas SET saldo = saldo - $1::numeric WHERE id = $2 RETURNING *",
        [factura.monto, cuentaId],
      );
      await client.query(
        `INSERT INTO movimientos (cuenta_id, tipo, monto, saldo_posterior, referencia_tipo, referencia_id, descripcion)
         VALUES ($1, 'debito', $2, $3, 'factura', $4, $5)`,
        [
          cuentaId,
          factura.monto,
          cuentaActualizada[0].saldo,
          factura.id,
          `Pago factura ${factura.proveedor} ${factura.numero_factura}`,
        ],
      );
      const { rows: pagada } = await client.query(
        `UPDATE facturas SET estado = 'pagada', cuenta_pago_id = $1, pagada_at = now()
          WHERE id = $2 RETURNING *`,
        [cuentaId, id],
      );

      return { body: { data: { factura: pagada[0], cuenta: cuentaActualizada[0] } } };
    });
  },
});
