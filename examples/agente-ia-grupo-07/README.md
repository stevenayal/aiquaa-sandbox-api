# Ejemplo de Agente de IA — Carrito de Compras (Grupo 07)

Implementación de ejemplo de un **agente de IA** que opera el módulo de Carrito de
Compras del sandbox (`app/api/v1/ordenes`, RF-G7-01..05) mediante *function calling*.

## Qué contiene

| Archivo | Descripción |
| --- | --- |
| `agent.mjs` | Bucle del agente: recibe una intención en lenguaje natural, elige el `tool` adecuado y lo ejecuta. Incluye un **LLM mock** para correr sin claves. |
| `tools/carrito-tools.mjs` | Definición de los 5 `tools` (JSON Schema + `execute()` vía `fetch`) listos para enchufar a OpenAI/Anthropic. |
| `grupo-07-carrito-de-compras.feature` | Análisis funcional BDD (Gherkin) de los 5 RFs — happy path + casos borde/regresión. |
| `grupo-07-carrito-regression.json` | Colección Postman ejecutable (Newman) con `pm.test` para regresión de los 5 RFs. |

## Cómo correr el agente (demo)

```bash
# API en vivo + esquema qa_training
BASE_URL=http://localhost:3000 API_KEY=tu_api_key node agent.mjs
```

Sin servidor corriendo, el demo igual arranca y reporta el `networkError` de cada
llamada en vez de crashear (el `request()` de `carrito-tools.mjs` lo captura).

## Usar un LLM real

Reemplaza `callLLM(messages)` en `agent.mjs` por la llamada a tu proveedor,
devolviendo `{ tool, args }` a partir de las funciones de `carritoTools`
(pásalas como `tools`/`functions` del modelo). El resto del bucle no cambia.

## Regresión (Postman / Newman)

```bash
npm i -g newman
newman run grupo-07-carrito-regression.json \
  --env-var "baseUrl=http://localhost:3000" \
  --env-var "apiKey=tu_api_key"
```

## Notas del diseño (capturadas por la regresión)

- El `monto` y los `subtotal` los calcula siempre el servidor; un total del cliente se ignora.
- `PUT /ordenes/{id}` recalcula `producto`/`monto` pero **no** toca `items_orden`: tras un
  recálculo, `GET /ordenes/{id}` muestra el detalle original desincronizado del nuevo monto.
- `DELETE /ordenes/{id}` es soft-delete (`activo=false`); deja `items_orden` huérfanos.
