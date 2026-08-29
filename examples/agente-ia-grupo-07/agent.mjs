// agent.mjs
// Ejemplo de AGENTE DE IA para el Carrito de Compras (Grupo 07).
//
// El agente expone las 5 operaciones del carrito como "tools" (function-calling)
// y resuelve intenciones en lenguaje natural eligiendo y ejecutando el tool adecuado.
//
// Incluye un LLM MOCK (callLLM) para que el ejemplo corra SIN claves externas.
// Para usarlo con un LLM real, reemplaza callLLM por la llamada a OpenAI/Anthropic
// devolviendo { tool, args } a partir de las funciones definidas en carrito-tools.mjs.
//
// Uso:
//   BASE_URL=http://localhost:3000 API_KEY=tu_api_key node agent.mjs

import { carritoTools, findTool } from "./tools/carrito-tools.mjs";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// LLM MOCK: enruta la intencion a un tool. Sustituir por un LLM real.
// ---------------------------------------------------------------------------
async function callLLM(messages) {
  const last = messages[messages.length - 1].content.toLowerCase();

  if (last.includes("comprar") || last.includes("checkout")) {
    const m = last.match(/usuario (\d+)/);
    const usuarioId = m ? Number(m[1]) : 1;
    return {
      tool: "checkout_orden",
      args: {
        usuarioId,
        items: [
          { producto: "Teclado", cantidad: 2, precioUnitario: 10.5 },
          { producto: "Mouse", cantidad: 1, precioUnitario: 5.25 },
        ],
      },
    };
  }
  if (last.includes("recalcul")) {
    const m = last.match(/orden (\d+)/);
    return {
      tool: "recalcular_orden",
      args: { id: m ? Number(m[1]) : 1, items: [{ producto: "B", cantidad: 3, precioUnitario: 7 }] },
    };
  }
  if (last.includes("baja") || last.includes("elimina") || last.includes("dar de baja")) {
    const m = last.match(/orden (\d+)/);
    return { tool: "dar_de_baja_orden", args: { id: m ? Number(m[1]) : 1 } };
  }
  if (last.includes("consulta") || last.includes("detalle")) {
    const m = last.match(/orden (\d+)/);
    return { tool: "consultar_orden", args: { id: m ? Number(m[1]) : 1 } };
  }
  if (last.includes("lista") || last.includes("ordenes")) {
    const m = last.match(/usuario (\d+)/);
    return { tool: "listar_ordenes", args: m ? { usuarioId: Number(m[1]) } : {} };
  }
  return { reply: "No entendi la intencion. Prueba: 'lista las ordenes', 'checkout usuario 2', 'consulta orden 1', 'recalcula orden 1', 'da de baja orden 1'." };
}

// ---------------------------------------------------------------------------
// Bucle del agente: elegir tool -> ejecutar -> devolver resultado.
// ---------------------------------------------------------------------------
export async function runAgent(prompt) {
  const messages = [{ role: "user", content: prompt }];
  const decision = await callLLM(messages);

  if (decision.reply) return { reply: decision.reply };

  const tool = findTool(decision.tool);
  if (!tool) return { error: `Herramienta desconocida: ${decision.tool}` };

  const result = await tool.execute(decision.args);
  return { tool: decision.tool, args: decision.args, ...result };
}

// ---------------------------------------------------------------------------
// Demo (solo se ejecuta al correr `node agent.mjs` directamente).
// ---------------------------------------------------------------------------
const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const ejemplos = [
    "Lista las ordenes del usuario 1",
    "Haz un checkout para el usuario 2",
    "Consulta la orden 1",
    "Recalcula la orden 1",
    "Da de baja la orden 1",
  ];
  for (const p of ejemplos) {
    console.log(`\n> PROMPT: ${p}`);
    const out = await runAgent(p);
    console.log(JSON.stringify(out, null, 2));
  }
}
