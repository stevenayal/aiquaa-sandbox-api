// tools/carrito-tools.mjs
// Herramientas (tools) del agente de IA para el Carrito de Compras (Grupo 07).
// Cada tool tiene: name, description, parameters (JSON Schema) y execute().
// Listas para enchufar a cualquier LLM con function-calling (OpenAI, Anthropic, etc.).
//
// Requiere la API en vivo + esquema qa_training. Configura:
//   BASE_URL  (default http://localhost:3000)
//   API_KEY   (cabecera x-api-key)

const BASE = process.env.BASE_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "REEMPLAZAR_CON_API_KEY_VALIDA";

async function request(method, path, body) {
  try {
    const res = await fetch(`${BASE}/api/v1/ordenes${path}`, {
      method,
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: res.status, data };
  } catch (err) {
    // La API no esta corriendo o no hay red: lo reportamos sin romper el agente.
    return { status: 0, data: null, networkError: String(err && err.message ? err.message : err) };
  }
}

export const carritoTools = [
  {
    name: "listar_ordenes",
    description:
      "RF-G7-01: Lista las ordenes activas del carrito. Sin usuarioId devuelve hasta 100 ordenes; con usuarioId filtra por comprador.",
    parameters: {
      type: "object",
      properties: { usuarioId: { type: "integer", description: "Opcional. Comprador a filtrar." } },
      required: [],
    },
    execute: async ({ usuarioId }) =>
      request("GET", usuarioId ? `?usuarioId=${usuarioId}` : ""),
  },
  {
    name: "checkout_orden",
    description:
      "RF-G7-02: Cierra la compra (checkout). Crea la orden y sus items en una transaccion. El servidor calcula subtotales y el monto total; ignora cualquier total enviado por el cliente.",
    parameters: {
      type: "object",
      properties: {
        usuarioId: { type: "integer" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              producto: { type: "string" },
              cantidad: { type: "integer", description: "Mayor que cero." },
              precioUnitario: { type: "number", description: "Mayor que cero." },
            },
            required: ["producto", "cantidad", "precioUnitario"],
          },
        },
      },
      required: ["usuarioId", "items"],
    },
    execute: async ({ usuarioId, items }) => request("POST", "", { usuarioId, items }),
  },
  {
    name: "consultar_orden",
    description:
      "RF-G7-03: Devuelve una orden con el detalle de sus items. 404 si no existe o fue dada de baja.",
    parameters: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
    execute: async ({ id }) => request("GET", `/${id}`),
  },
  {
    name: "recalcular_orden",
    description:
      "RF-G7-04: Recalcula producto y monto de la cabecera a partir de items. NO modifica items_orden (el detalle original queda desincronizado del nuevo monto).",
    parameters: {
      type: "object",
      properties: {
        id: { type: "integer" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              producto: { type: "string" },
              cantidad: { type: "integer" },
              precioUnitario: { type: "number" },
            },
            required: ["producto", "cantidad", "precioUnitario"],
          },
        },
      },
      required: ["id", "items"],
    },
    execute: async ({ id, items }) => request("PUT", `/${id}`, { items }),
  },
  {
    name: "dar_de_baja_orden",
    description:
      "RF-G7-05: Da de baja (soft-delete) una orden. Marca activo=false; no borra filas ni afecta items_orden.",
    parameters: {
      type: "object",
      properties: { id: { type: "integer" } },
      required: ["id"],
    },
    execute: async ({ id }) => request("DELETE", `/${id}`),
  },
];

export function findTool(name) {
  return carritoTools.find((t) => t.name === name);
}
