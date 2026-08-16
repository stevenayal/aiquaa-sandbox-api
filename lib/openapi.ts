// Hand-authored OpenAPI 3.1 spec. Only three endpoints exist, so a
// zod-to-openapi generator would be more machinery than the spec is worth —
// this plain object is the entire source of truth for /docs.
export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "aiquaa Sandbox API",
    version: "1.0.0",
    description:
      "API sandbox de práctica para el curso de Automatización de Pruebas de Software. " +
      "Permite ejecutar sentencias SELECT y UPDATE contra un schema aislado (qa_training) " +
      "en Postgres. Todo el SQL enviado debe ser un único statement, referenciar únicamente " +
      "tablas del schema qa_training (ver /docs o el README del repo para el listado " +
      "completo de tablas), y usar placeholders " +
      "parametrizados ($1, $2, ...) — nunca concatenar valores directamente en el SQL.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
      },
    },
    schemas: {
      SqlRequest: {
        type: "object",
        required: ["sql"],
        properties: {
          sql: { type: "string", description: "Un único statement SQL." },
          params: {
            type: "array",
            items: {},
            description: "Valores posicionales para los placeholders $1, $2, ...",
          },
        },
      },
      SqlSuccessResponse: {
        type: "object",
        properties: {
          data: { type: "array", items: { type: "object" } },
          rowCount: { type: "integer", nullable: true },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: [
                  "UNAUTHORIZED",
                  "RATE_LIMITED",
                  "VALIDATION_ERROR",
                  "EXECUTION_ERROR",
                  "INTERNAL_ERROR",
                ],
              },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/api/v1/sql/select": {
      post: {
        summary: "Ejecuta un statement SELECT",
        description:
          "Acepta exactamente un statement SELECT sobre las tablas del schema qa_training " +
          "(ver README del repo para el listado completo). Límite: 30 requests/minuto por " +
          "API key.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SqlRequest" } },
          },
        },
        responses: {
          "200": {
            description: "Resultado de la consulta",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SqlSuccessResponse" },
              },
            },
          },
          "400": {
            description: "SQL inválido o error de ejecución",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
          "401": {
            description: "API key inválida, inactiva o ausente",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
          "429": {
            description: "Límite de requests excedido",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
      },
    },
    "/api/v1/sql/update": {
      post: {
        summary: "Ejecuta un statement UPDATE (requiere WHERE)",
        description:
          "Acepta exactamente un statement UPDATE con cláusula WHERE obligatoria, sobre las " +
          "tablas del schema qa_training (ver README del repo para el listado completo). " +
          "Límite: 30 requests/minuto por API key.",
        requestBody: {
          required: true,
          content: {
            "application/json": { schema: { $ref: "#/components/schemas/SqlRequest" } },
          },
        },
        responses: {
          "200": {
            description: "Resultado del UPDATE",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SqlSuccessResponse" },
              },
            },
          },
          "400": {
            description: "SQL inválido (incluye UPDATE sin WHERE) o error de ejecución",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
          "401": {
            description: "API key inválida, inactiva o ausente",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
          "429": {
            description: "Límite de requests excedido",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
            },
          },
        },
      },
    },
  },
} as const;
