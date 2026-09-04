// Spec OpenAPI 3.1 del curso 2 (Productos Bancarios), hand-authored igual que
// lib/openapi.ts. Archivo separado a propósito: el sidebar de Scalar de cada
// curso muestra solo sus propias rutas, y un cambio en el temario de una
// cohorte no puede romper la documentación de la otra. /docs carga los dos
// specs y deja elegir con un selector.
function errRef(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  };
}

// Todas las rutas pasan por apiRoute(): autentican, chequean que la key sea del
// curso 2 y aplican rate limit antes de ejecutar el handler.
const authRateLimitErrors = {
  "401": errRef("API key inválida, inactiva o ausente"),
  "403": errRef("La API key pertenece a otro curso"),
  "429": errRef("Límite de requests excedido"),
};

const notFoundError = { "404": errRef("Recurso no encontrado") };
const validationError = { "400": errRef("Body/query inválido o error de ejecución") };
const conflictError = {
  "409": errRef("Conflicto: regla de negocio o constraint unique violada"),
};
const noContentResponse = { "204": { description: "Eliminado (soft-delete) — sin body" } };

// Azúcar para no repetir el envoltorio { data: ... } en cada respuesta.
function dataOf(ref: string, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: { type: "object", properties: { data: { $ref: `#/components/schemas/${ref}` } } },
      },
    },
  };
}

function listOf(ref: string, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: `#/components/schemas/${ref}` } },
          },
        },
      },
    },
  };
}

function body(required: string[], properties: Record<string, unknown>) {
  return {
    required: true,
    content: { "application/json": { schema: { type: "object", required, properties } } },
  };
}

const idPath = { name: "id", in: "path", required: true, schema: { type: "integer" } };
const usuarioIdQuery = {
  name: "usuarioId",
  in: "query",
  required: false,
  schema: { type: "integer" },
};

const G1 = "Grupo 1 - Cuentas Bancarias";
const G2 = "Grupo 2 - Tarjetas de Crédito/Débito";
const G3 = "Grupo 3 - Préstamos";
const G4 = "Grupo 4 - Transferencias y Pagos";
const G5 = "Grupo 5 - Ahorros y Depósitos";
const SOPORTE = "Soporte - Usuarios";
const SANDBOX = "SQL Sandbox (v2)";

export const openApiSpecV2 = {
  openapi: "3.1.0",
  info: {
    title: "aiquaa Sandbox API — Curso 2 (Productos Bancarios)",
    version: "2.0.0",
    description:
      "API sandbox del curso 2 (Productos Bancarios). Corre sobre el mismo deploy que la v1 " +
      "pero contra un schema Postgres separado (qa_training_v2): los datos del curso 1 y del " +
      "curso 2 no se tocan entre sí. Cada API key pertenece a un curso — una key del curso 1 " +
      "contra estas rutas recibe 403, y viceversa. Header obligatorio: x-api-key. " +
      "Límite de 30 requests/minuto por key.",
  },
  servers: [{ url: "/" }],
  tags: [
    { name: SANDBOX, description: "SQL crudo (SELECT/UPDATE validado por AST) sobre qa_training_v2." },
    { name: SOPORTE, description: "Clientes del banco: dueños de cuentas, tarjetas, préstamos y depósitos." },
    { name: G1, description: "Cuentas, saldos, estados y movimientos." },
    { name: G2, description: "Tarjetas: límites, disponible, estado y vencimiento." },
    { name: G3, description: "Préstamos: aprobación, cuotas, saldo y vencimientos." },
    { name: G4, description: "Beneficiarios y transferencias (importes y estados)." },
    { name: G5, description: "Ahorro programado y depósitos a plazo (tasas, plazos, vencimientos)." },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
    },
    schemas: {
      SqlRequest: {
        type: "object",
        required: ["sql"],
        properties: {
          sql: { type: "string", description: "Un único statement SQL sobre qa_training_v2." },
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
                  "FORBIDDEN",
                  "RATE_LIMITED",
                  "VALIDATION_ERROR",
                  "EXECUTION_ERROR",
                  "NOT_FOUND",
                  "CONFLICT",
                  "INTERNAL_ERROR",
                ],
              },
              message: { type: "string" },
              details: {},
            },
          },
        },
      },
      Usuario: {
        type: "object",
        properties: {
          id: { type: "integer" },
          nombre: { type: "string" },
          email: { type: "string" },
          documento_tipo: { type: "string", enum: ["CI", "pasaporte", "RUC"] },
          documento_numero: { type: "string" },
          telefono: { type: "string", nullable: true },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Cuenta: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          numero_cuenta: { type: "string" },
          tipo_cuenta: { type: "string", enum: ["ahorro", "corriente"] },
          moneda: { type: "string", enum: ["PYG", "USD"] },
          saldo: { type: "string", description: "numeric(14,2) — pg lo serializa como string." },
          estado: { type: "string", enum: ["activa", "bloqueada", "cerrada"] },
          activa: { type: "boolean", description: "Flag de soft-delete, distinto de `estado`." },
          created_at: { type: "string", format: "date-time" },
        },
      },
      SaldoCuenta: {
        type: "object",
        properties: {
          cuenta_id: { type: "integer" },
          numero_cuenta: { type: "string" },
          moneda: { type: "string" },
          saldo: { type: "string" },
          estado: { type: "string" },
          ultimo_movimiento: { type: "string", format: "date-time", nullable: true },
        },
      },
      Movimiento: {
        type: "object",
        properties: {
          id: { type: "integer" },
          cuenta_id: { type: "integer" },
          tipo: { type: "string", enum: ["debito", "credito"] },
          monto: { type: "string" },
          saldo_posterior: { type: "string" },
          referencia_tipo: {
            type: "string",
            enum: ["manual", "transferencia", "prestamo", "ahorro", "deposito", "tarjeta"],
          },
          referencia_id: { type: "integer", nullable: true },
          descripcion: { type: "string", nullable: true },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Tarjeta: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          cuenta_id: { type: "integer", nullable: true },
          tipo: { type: "string", enum: ["credito", "debito"] },
          marca: { type: "string", enum: ["visa", "mastercard", "amex"] },
          numero_enmascarado: { type: "string" },
          limite_credito: { type: "string" },
          saldo_utilizado: { type: "string" },
          disponible: {
            type: "string",
            description: "Calculado: limite_credito - saldo_utilizado. No es una columna.",
          },
          estado: { type: "string", enum: ["activa", "bloqueada", "vencida"] },
          fecha_vencimiento: { type: "string", format: "date" },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Prestamo: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          cuenta_id: { type: "integer", nullable: true },
          monto_solicitado: { type: "string" },
          tasa_interes: { type: "string" },
          plazo_meses: { type: "integer" },
          saldo_pendiente: { type: "string" },
          estado: { type: "string", enum: ["solicitado", "aprobado", "rechazado", "pagado"] },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      CuotaPrestamo: {
        type: "object",
        properties: {
          id: { type: "integer" },
          prestamo_id: { type: "integer" },
          numero_cuota: { type: "integer" },
          monto: { type: "string" },
          fecha_vencimiento: { type: "string", format: "date" },
          estado: { type: "string", enum: ["pendiente", "pagada", "vencida"] },
          fecha_pago: { type: "string", format: "date-time", nullable: true },
        },
      },
      Beneficiario: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          nombre: { type: "string" },
          banco: { type: "string" },
          numero_cuenta: { type: "string" },
          alias: { type: "string", nullable: true },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Transferencia: {
        type: "object",
        properties: {
          id: { type: "integer" },
          cuenta_origen_id: { type: "integer" },
          cuenta_destino_id: { type: "integer", nullable: true },
          beneficiario_id: { type: "integer", nullable: true },
          monto: { type: "string" },
          moneda: { type: "string", enum: ["PYG", "USD"] },
          concepto: { type: "string", nullable: true },
          referencia: { type: "string" },
          estado: {
            type: "string",
            enum: ["pendiente", "completada", "rechazada", "anulada"],
          },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Ahorro: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          cuenta_id: { type: "integer" },
          nombre_meta: { type: "string" },
          meta_monto: { type: "string" },
          aporte_mensual: { type: "string" },
          saldo_acumulado: { type: "string" },
          falta_para_meta: { type: "string", description: "Calculado: meta_monto - saldo_acumulado." },
          tasa_anual: { type: "string" },
          estado: { type: "string", enum: ["activo", "completado", "cancelado"] },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Deposito: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          cuenta_id: { type: "integer" },
          monto: { type: "string" },
          tasa_anual: { type: "string" },
          plazo_dias: { type: "integer" },
          fecha_inicio: { type: "string", format: "date" },
          fecha_vencimiento: { type: "string", format: "date" },
          interes_generado: { type: "string" },
          interes_proyectado: {
            type: "string",
            description: "Calculado: monto * tasa_anual/100 * plazo_dias/365 (interés simple).",
          },
          dias_restantes: { type: "integer" },
          estado: { type: "string", enum: ["activo", "vencido", "cancelado"] },
          activo: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    // --- SQL sandbox del curso 2 ---
    "/api/v2/sql/select": {
      post: {
        tags: [SANDBOX],
        summary: "Ejecuta un statement SELECT sobre qa_training_v2",
        description:
          "Un único statement SELECT sobre las tablas de qa_training_v2 (usuarios, cuentas, " +
          "movimientos, tarjetas, prestamos, cuotas_prestamo, beneficiarios, transferencias, " +
          "ahorros, depositos), con placeholders $1, $2, ... Nombrar el schema qa_training " +
          "(curso 1) se rechaza en la validación del AST.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SqlRequest" } } },
        },
        responses: {
          "200": {
            description: "Filas devueltas por el SELECT",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SqlSuccessResponse" } },
            },
          },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/sql/update": {
      post: {
        tags: [SANDBOX],
        summary: "Ejecuta un statement UPDATE sobre qa_training_v2 (WHERE obligatorio)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/SqlRequest" } } },
        },
        responses: {
          "200": {
            description: "Filas afectadas por el UPDATE",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SqlSuccessResponse" } },
            },
          },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Soporte: usuarios (dueños de todos los productos) ---
    "/api/v2/usuarios": {
      get: {
        tags: [SOPORTE],
        summary: "Listar usuarios",
        parameters: [{ name: "email", in: "query", required: false, schema: { type: "string" } }],
        responses: {
          "200": listOf("Usuario", "Listado de usuarios"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [SOPORTE],
        summary: "Crear usuario",
        requestBody: body(["nombre", "email", "documentoNumero"], {
          nombre: { type: "string" },
          email: { type: "string", format: "email" },
          documentoTipo: { type: "string", enum: ["CI", "pasaporte", "RUC"] },
          documentoNumero: { type: "string" },
          telefono: { type: "string" },
        }),
        responses: {
          "201": dataOf("Usuario", "Usuario creado"),
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/usuarios/{id}": {
      get: {
        tags: [SOPORTE],
        summary: "Obtener usuario por id",
        parameters: [idPath],
        responses: {
          "200": dataOf("Usuario", "Usuario encontrado"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: [SOPORTE],
        summary: "Reemplazar datos de contacto del usuario",
        description: "documento_numero es identidad: no se edita.",
        parameters: [idPath],
        requestBody: body(["nombre", "email"], {
          nombre: { type: "string" },
          email: { type: "string", format: "email" },
          telefono: { type: "string" },
        }),
        responses: {
          "200": dataOf("Usuario", "Usuario actualizado"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: [SOPORTE],
        summary: "Eliminar usuario (soft-delete)",
        parameters: [idPath],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 1: Cuentas Bancarias ---
    "/api/v2/cuentas": {
      get: {
        tags: [G1],
        summary: "Listar cuentas (Grupo 1)",
        parameters: [
          usuarioIdQuery,
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["activa", "bloqueada", "cerrada"] },
          },
        ],
        responses: {
          "200": listOf("Cuenta", "Listado de cuentas"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G1],
        summary: "Abrir cuenta (Grupo 1)",
        description:
          "numero_cuenta es decorativo (generado al azar) y el saldo arranca en 0: se mueve " +
          "solo vía POST /cuentas/{id}/movimientos o una transferencia.",
        requestBody: body(["usuarioId", "tipoCuenta", "moneda"], {
          usuarioId: { type: "integer" },
          tipoCuenta: { type: "string", enum: ["ahorro", "corriente"] },
          moneda: { type: "string", enum: ["PYG", "USD"] },
        }),
        responses: {
          "201": dataOf("Cuenta", "Cuenta creada"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/cuentas/{id}": {
      get: {
        tags: [G1],
        summary: "Obtener cuenta por id (Grupo 1)",
        parameters: [idPath],
        responses: {
          "200": dataOf("Cuenta", "Cuenta encontrada"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: [G1],
        summary: "Reemplazar tipo/moneda de la cuenta (Grupo 1)",
        description: "El saldo y el estado no se tocan por PUT: tienen sus propios endpoints.",
        parameters: [idPath],
        requestBody: body(["tipoCuenta", "moneda"], {
          tipoCuenta: { type: "string", enum: ["ahorro", "corriente"] },
          moneda: { type: "string", enum: ["PYG", "USD"] },
        }),
        responses: {
          "200": dataOf("Cuenta", "Cuenta actualizada"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: [G1],
        summary: "Eliminar cuenta (soft-delete) (Grupo 1)",
        description: "409 si la cuenta todavía tiene saldo.",
        parameters: [idPath],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/cuentas/{id}/saldo": {
      get: {
        tags: [G1],
        summary: "Consultar saldo de la cuenta (Grupo 1)",
        parameters: [idPath],
        responses: {
          "200": dataOf("SaldoCuenta", "Saldo actual"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/cuentas/{id}/movimientos": {
      get: {
        tags: [G1],
        summary: "Listar movimientos de la cuenta (Grupo 1)",
        parameters: [
          idPath,
          {
            name: "tipo",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["debito", "credito"] },
          },
        ],
        responses: {
          "200": listOf("Movimiento", "Listado de movimientos"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G1],
        summary: "Registrar depósito o retiro (Grupo 1)",
        description:
          "Transaccional: actualiza el saldo de la cuenta y registra el movimiento con el " +
          "saldo posterior. 409 si la cuenta no está activa o el saldo no alcanza para el débito.",
        parameters: [idPath],
        requestBody: body(["tipo", "monto"], {
          tipo: { type: "string", enum: ["debito", "credito"] },
          monto: { type: "number", exclusiveMinimum: 0 },
          descripcion: { type: "string" },
        }),
        responses: {
          "201": dataOf("Movimiento", "Movimiento registrado (incluye la cuenta actualizada)"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/cuentas/{id}/estado": {
      patch: {
        tags: [G1],
        summary: "Cambiar estado de la cuenta (Grupo 1)",
        description:
          "activa | bloqueada | cerrada. `cerrada` es terminal y exige saldo 0. PATCH y no PUT: " +
          "cambia un solo campo, no reemplaza el recurso.",
        parameters: [idPath],
        requestBody: body(["estado"], {
          estado: { type: "string", enum: ["activa", "bloqueada", "cerrada"] },
        }),
        responses: {
          "200": dataOf("Cuenta", "Estado actualizado"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 2: Tarjetas ---
    "/api/v2/tarjetas": {
      get: {
        tags: [G2],
        summary: "Listar tarjetas (Grupo 2)",
        description: "Cada tarjeta incluye `disponible` (limite_credito - saldo_utilizado).",
        parameters: [
          usuarioIdQuery,
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["activa", "bloqueada", "vencida"] },
          },
        ],
        responses: {
          "200": listOf("Tarjeta", "Listado de tarjetas"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G2],
        summary: "Emitir tarjeta (Grupo 2)",
        description: "Una tarjeta de débito siempre nace con límite 0.",
        requestBody: body(["usuarioId", "tipo", "marca", "fechaVencimiento"], {
          usuarioId: { type: "integer" },
          cuentaId: { type: "integer" },
          tipo: { type: "string", enum: ["credito", "debito"] },
          marca: { type: "string", enum: ["visa", "mastercard", "amex"] },
          limiteCredito: { type: "number", minimum: 0 },
          fechaVencimiento: { type: "string", format: "date", examples: ["2029-12-31"] },
        }),
        responses: {
          "201": dataOf("Tarjeta", "Tarjeta emitida"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/tarjetas/{id}": {
      get: {
        tags: [G2],
        summary: "Obtener tarjeta por id (Grupo 2)",
        parameters: [idPath],
        responses: {
          "200": dataOf("Tarjeta", "Tarjeta encontrada"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: [G2],
        summary: "Reemplazar marca/vencimiento de la tarjeta (Grupo 2)",
        description: "El límite va por PATCH /limite y el estado por /bloquear y /activar.",
        parameters: [idPath],
        requestBody: body(["marca", "fechaVencimiento"], {
          marca: { type: "string", enum: ["visa", "mastercard", "amex"] },
          fechaVencimiento: { type: "string", format: "date" },
        }),
        responses: {
          "200": dataOf("Tarjeta", "Tarjeta actualizada"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: [G2],
        summary: "Eliminar tarjeta (soft-delete) (Grupo 2)",
        description: "409 si queda saldo utilizado pendiente.",
        parameters: [idPath],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/tarjetas/{id}/bloquear": {
      post: {
        tags: [G2],
        summary: "Bloquear tarjeta (Grupo 2)",
        description: "409 si ya está bloqueada o si está vencida.",
        parameters: [idPath],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", properties: { motivo: { type: "string" } } },
            },
          },
        },
        responses: {
          "200": dataOf("Tarjeta", "Tarjeta bloqueada"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/tarjetas/{id}/activar": {
      post: {
        tags: [G2],
        summary: "Activar tarjeta (Grupo 2)",
        description: "Solo desde `bloqueada` y con fecha_vencimiento vigente.",
        parameters: [idPath],
        responses: {
          "200": dataOf("Tarjeta", "Tarjeta activada"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/tarjetas/{id}/limite": {
      patch: {
        tags: [G2],
        summary: "Cambiar límite de crédito (Grupo 2)",
        description:
          "400 si el nuevo límite es menor al saldo ya utilizado; 409 si la tarjeta es de débito.",
        parameters: [idPath],
        requestBody: body(["limiteCredito"], { limiteCredito: { type: "number", minimum: 0 } }),
        responses: {
          "200": dataOf("Tarjeta", "Límite actualizado"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 3: Préstamos ---
    "/api/v2/prestamos": {
      get: {
        tags: [G3],
        summary: "Listar préstamos (Grupo 3)",
        parameters: [
          usuarioIdQuery,
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["solicitado", "aprobado", "rechazado", "pagado"] },
          },
        ],
        responses: {
          "200": listOf("Prestamo", "Listado de préstamos"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G3],
        summary: "Solicitar préstamo (Grupo 3)",
        description: "Nace en `solicitado`, sin cuotas: las genera POST /prestamos/{id}/aprobar.",
        requestBody: body(["usuarioId", "montoSolicitado", "tasaInteres", "plazoMeses"], {
          usuarioId: { type: "integer" },
          cuentaId: { type: "integer" },
          montoSolicitado: { type: "number", exclusiveMinimum: 0 },
          tasaInteres: { type: "number", minimum: 0 },
          plazoMeses: { type: "integer", minimum: 1, maximum: 120 },
        }),
        responses: {
          "201": dataOf("Prestamo", "Préstamo solicitado"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/prestamos/{id}": {
      get: {
        tags: [G3],
        summary: "Obtener préstamo por id (Grupo 3)",
        parameters: [idPath],
        responses: {
          "200": dataOf("Prestamo", "Préstamo encontrado"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: [G3],
        summary: "Reemplazar condiciones del préstamo (Grupo 3)",
        description: "Solo mientras sigue en `solicitado`: después ya hay cuotas emitidas (409).",
        parameters: [idPath],
        requestBody: body(["montoSolicitado", "tasaInteres", "plazoMeses"], {
          montoSolicitado: { type: "number", exclusiveMinimum: 0 },
          tasaInteres: { type: "number", minimum: 0 },
          plazoMeses: { type: "integer", minimum: 1, maximum: 120 },
        }),
        responses: {
          "200": dataOf("Prestamo", "Préstamo actualizado"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: [G3],
        summary: "Eliminar préstamo (soft-delete) (Grupo 3)",
        description: "409 si tiene saldo pendiente.",
        parameters: [idPath],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/prestamos/{id}/aprobar": {
      post: {
        tags: [G3],
        summary: "Aprobar préstamo y generar cuotas (Grupo 3)",
        description:
          "Transaccional. Cuota = monto * (1 + tasa/100) / plazo_meses, con vencimientos " +
          "mensuales desde hoy; la última cuota absorbe el redondeo. 409 si el préstamo ya no " +
          "está en `solicitado`.",
        parameters: [idPath],
        responses: {
          "200": {
            description: "Préstamo aprobado, con su plan de cuotas",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/Prestamo" },
                        {
                          type: "object",
                          properties: {
                            cuotas: {
                              type: "array",
                              items: { $ref: "#/components/schemas/CuotaPrestamo" },
                            },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/prestamos/{id}/cuotas": {
      get: {
        tags: [G3],
        summary: "Listar cuotas del préstamo (Grupo 3)",
        parameters: [
          idPath,
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["pendiente", "pagada", "vencida"] },
          },
        ],
        responses: {
          "200": listOf("CuotaPrestamo", "Plan de cuotas"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/prestamos/{id}/cuotas/{numero}/pagar": {
      post: {
        tags: [G3],
        summary: "Pagar una cuota (Grupo 3)",
        description:
          "Marca la cuota como pagada y descuenta su monto del saldo pendiente; al llegar a 0 " +
          "el préstamo pasa a `pagado`. 409 si la cuota ya estaba pagada.",
        parameters: [
          idPath,
          { name: "numero", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          "200": {
            description: "Cuota pagada",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        cuota: { $ref: "#/components/schemas/CuotaPrestamo" },
                        prestamo: { $ref: "#/components/schemas/Prestamo" },
                      },
                    },
                  },
                },
              },
            },
          },
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 4: Transferencias y Pagos ---
    "/api/v2/beneficiarios": {
      get: {
        tags: [G4],
        summary: "Listar beneficiarios (Grupo 4)",
        parameters: [usuarioIdQuery],
        responses: {
          "200": listOf("Beneficiario", "Listado de beneficiarios"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G4],
        summary: "Registrar beneficiario (Grupo 4)",
        description: "409 si el usuario ya tiene cargado ese número de cuenta.",
        requestBody: body(["usuarioId", "nombre", "banco", "numeroCuenta"], {
          usuarioId: { type: "integer" },
          nombre: { type: "string" },
          banco: { type: "string" },
          numeroCuenta: { type: "string" },
          alias: { type: "string" },
        }),
        responses: {
          "201": dataOf("Beneficiario", "Beneficiario creado"),
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/beneficiarios/{id}": {
      get: {
        tags: [G4],
        summary: "Obtener beneficiario por id (Grupo 4)",
        parameters: [idPath],
        responses: {
          "200": dataOf("Beneficiario", "Beneficiario encontrado"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: [G4],
        summary: "Reemplazar datos del beneficiario (Grupo 4)",
        parameters: [idPath],
        requestBody: body(["nombre", "banco", "numeroCuenta"], {
          nombre: { type: "string" },
          banco: { type: "string" },
          numeroCuenta: { type: "string" },
          alias: { type: "string" },
        }),
        responses: {
          "200": dataOf("Beneficiario", "Beneficiario actualizado"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: [G4],
        summary: "Eliminar beneficiario (soft-delete) (Grupo 4)",
        parameters: [idPath],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/transferencias": {
      get: {
        tags: [G4],
        summary: "Listar transferencias (Grupo 4)",
        parameters: [
          { name: "cuentaOrigenId", in: "query", required: false, schema: { type: "integer" } },
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["pendiente", "completada", "rechazada", "anulada"] },
          },
        ],
        responses: {
          "200": listOf("Transferencia", "Listado de transferencias"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G4],
        summary: "Transferir (Grupo 4)",
        description:
          "Interna (cuentaDestinoId) o externa a un beneficiario (beneficiarioId) — exactamente " +
          "uno de los dos, o 400. Transaccional: debita el origen, acredita el destino cuando es " +
          "interna y escribe los movimientos correspondientes. 409 por saldo insuficiente, " +
          "cuenta no activa o monedas distintas.",
        requestBody: body(["cuentaOrigenId", "monto"], {
          cuentaOrigenId: { type: "integer" },
          cuentaDestinoId: { type: "integer" },
          beneficiarioId: { type: "integer" },
          monto: { type: "number", exclusiveMinimum: 0 },
          concepto: { type: "string" },
        }),
        responses: {
          "201": dataOf("Transferencia", "Transferencia ejecutada"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/transferencias/{id}": {
      get: {
        tags: [G4],
        summary: "Obtener transferencia por id (Grupo 4)",
        description:
          "Sin PUT ni DELETE: una transferencia ejecutada es un hecho contable. Para revertirla, " +
          "POST /transferencias/{id}/anular.",
        parameters: [idPath],
        responses: {
          "200": dataOf("Transferencia", "Transferencia encontrada"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/transferencias/{id}/anular": {
      post: {
        tags: [G4],
        summary: "Anular transferencia (Grupo 4)",
        description:
          "Contraasiento: revierte los saldos y deja la transferencia en `anulada` (no la borra). " +
          "409 si no está `completada` o si el destino ya no tiene saldo para devolver.",
        parameters: [idPath],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: { type: "object", properties: { motivo: { type: "string" } } },
            },
          },
        },
        responses: {
          "200": dataOf("Transferencia", "Transferencia anulada"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 5: Ahorros y Depósitos ---
    "/api/v2/ahorros": {
      get: {
        tags: [G5],
        summary: "Listar planes de ahorro (Grupo 5)",
        parameters: [
          usuarioIdQuery,
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["activo", "completado", "cancelado"] },
          },
        ],
        responses: {
          "200": listOf("Ahorro", "Listado de planes de ahorro"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G5],
        summary: "Crear plan de ahorro (Grupo 5)",
        requestBody: body(["usuarioId", "cuentaId", "nombreMeta", "metaMonto", "aporteMensual"], {
          usuarioId: { type: "integer" },
          cuentaId: { type: "integer" },
          nombreMeta: { type: "string" },
          metaMonto: { type: "number", exclusiveMinimum: 0 },
          aporteMensual: { type: "number", exclusiveMinimum: 0 },
          tasaAnual: { type: "number", minimum: 0 },
        }),
        responses: {
          "201": dataOf("Ahorro", "Plan creado"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/ahorros/{id}": {
      get: {
        tags: [G5],
        summary: "Obtener plan de ahorro por id (Grupo 5)",
        parameters: [idPath],
        responses: {
          "200": dataOf("Ahorro", "Plan encontrado"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: [G5],
        summary: "Reemplazar condiciones del plan (Grupo 5)",
        description: "409 si el plan no está activo o si la nueva meta es menor a lo acumulado.",
        parameters: [idPath],
        requestBody: body(["nombreMeta", "metaMonto", "aporteMensual"], {
          nombreMeta: { type: "string" },
          metaMonto: { type: "number", exclusiveMinimum: 0 },
          aporteMensual: { type: "number", exclusiveMinimum: 0 },
          tasaAnual: { type: "number", minimum: 0 },
        }),
        responses: {
          "200": dataOf("Ahorro", "Plan actualizado"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: [G5],
        summary: "Eliminar plan de ahorro (soft-delete) (Grupo 5)",
        parameters: [idPath],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/ahorros/{id}/aportar": {
      post: {
        tags: [G5],
        summary: "Aportar al plan de ahorro (Grupo 5)",
        description:
          "Debita la cuenta asociada y suma al saldo acumulado; al alcanzar la meta el plan pasa " +
          "a `completado`. Sin `monto` en el body se usa el aporte_mensual del plan.",
        parameters: [idPath],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { monto: { type: "number", exclusiveMinimum: 0 } },
              },
            },
          },
        },
        responses: {
          "201": dataOf("Ahorro", "Aporte registrado (incluye la cuenta actualizada)"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/depositos": {
      get: {
        tags: [G5],
        summary: "Listar depósitos a plazo (Grupo 5)",
        parameters: [
          usuarioIdQuery,
          {
            name: "estado",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["activo", "vencido", "cancelado"] },
          },
        ],
        responses: {
          "200": listOf("Deposito", "Listado de depósitos"),
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: [G5],
        summary: "Constituir depósito a plazo (Grupo 5)",
        description:
          "Debita la cuenta: el dinero queda inmovilizado hasta el vencimiento (o hasta la " +
          "cancelación anticipada). 409 por saldo insuficiente o cuenta no activa.",
        requestBody: body(["usuarioId", "cuentaId", "monto", "tasaAnual", "plazoDias"], {
          usuarioId: { type: "integer" },
          cuentaId: { type: "integer" },
          monto: { type: "number", exclusiveMinimum: 0 },
          tasaAnual: { type: "number", minimum: 0 },
          plazoDias: { type: "integer", minimum: 30, maximum: 1095 },
        }),
        responses: {
          "201": dataOf("Deposito", "Depósito constituido"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/depositos/{id}": {
      get: {
        tags: [G5],
        summary: "Obtener depósito por id (Grupo 5)",
        description:
          "Sin PUT ni DELETE: las condiciones de un plazo fijo son inmutables una vez " +
          "constituido. Para deshacerlo, POST /depositos/{id}/cancelar.",
        parameters: [idPath],
        responses: {
          "200": dataOf("Deposito", "Depósito encontrado"),
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v2/depositos/{id}/cancelar": {
      post: {
        tags: [G5],
        summary: "Cancelar depósito anticipadamente (Grupo 5)",
        description:
          "Acredita capital + interés prorrateado por los días transcurridos (interés simple), " +
          "no el interés del plazo completo. 409 si el depósito ya no está `activo`.",
        parameters: [idPath],
        responses: {
          "200": dataOf("Deposito", "Depósito cancelado (incluye la cuenta actualizada)"),
          ...notFoundError,
          ...conflictError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
  },
} as const;
