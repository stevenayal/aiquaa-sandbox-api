// Hand-authored OpenAPI 3.1 spec. Grew from 3 endpoints (raw-SQL sandbox) to
// 29 fixed REST endpoints (qa_api role) — a zod-to-openapi generator would
// still be more machinery than this file is worth, so it stays a plain
// object; this plain object is the entire source of truth for /docs.
function errRef(description: string) {
  return {
    description,
    content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } },
  };
}

// Reused on every REST endpoint (all go through apiRoute(), which always
// authenticates + rate-limits before the handler runs).
const authRateLimitErrors = {
  "401": errRef("API key inválida, inactiva o ausente"),
  "429": errRef("Límite de requests excedido"),
};

const notFoundError = { "404": errRef("Recurso no encontrado") };
const validationError = { "400": errRef("Body/query inválido o error de ejecución") };
const conflictError = { "409": errRef("Conflicto: violación de una constraint unique (valor duplicado)") };
// 204 No Content no lleva body — a diferencia de errRef(), no tiene `content`.
const noContentResponse = { "204": { description: "Eliminado (soft-delete) — sin body" } };

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
  // Orden explícito del sidebar de Scalar: Scalar agrupa y ordena los
  // endpoints según el orden en que los tags aparecen acá, no alfabético
  // ni por orden de aparición en `paths`.
  tags: [
    { name: "SQL Sandbox", description: "Sandbox de SQL crudo (SELECT/UPDATE validado por AST), común a los 10 grupos." },
    { name: "Grupo 1 - Autenticación y Acceso", description: "Login, logout, reset de password." },
    { name: "Grupo 2 - Transferencias entre Cuentas", description: "Cuentas y transferencias." },
    { name: "Grupo 3 - Pagos de Servicios", description: "Facturas y pagos." },
    { name: "Grupo 4 - Registro de Usuario / Onboarding", description: "Alta de usuarios y verificación KYC." },
    { name: "Grupo 5 - Tarjetas de Crédito/Débito", description: "Emisión, bloqueo y activación de tarjetas." },
    { name: "Grupo 6 - Notificaciones y Alertas", description: "Notificaciones por canal (push/email/sms)." },
    { name: "Grupo 7 - Carrito de Compras / E-commerce", description: "Órdenes e items de orden (checkout)." },
    { name: "Grupo 8 - Reservas / Turnos", description: "Reservas de servicios." },
    { name: "Grupo 9 - Reportes y Dashboard", description: "Agregados de solo lectura sobre movimientos." },
    { name: "Grupo 10 - Roles y Permisos", description: "Roles disponibles y asignación a usuarios." },
    { name: "Roster", description: "Mapea el email real de un alumno a su grupo de curso asignado — metadata del curso, no uno de los 10 grupos pedagógicos." },
  ],
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

      // --- Endpoints REST (SQL fijo, rol qa_api) — entidades por grupo ---
      Usuario: {
        type: "object",
        properties: {
          id: { type: "integer" },
          nombre: { type: "string" },
          email: { type: "string" },
          activo: { type: "boolean" },
          documento_tipo: { type: "string", enum: ["CI", "pasaporte", "RUC"] },
          documento_numero: { type: "string" },
          fecha_nacimiento: { type: "string", format: "date", nullable: true },
          direccion: { type: "string", nullable: true },
          kyc_estado: { type: "string", enum: ["pendiente", "verificado", "rechazado"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Sesion: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          tipo_evento: {
            type: "string",
            enum: ["login", "logout", "password_reset_solicitado", "password_reset_completado"],
          },
          exitoso: { type: "boolean" },
          ip: { type: "string", nullable: true },
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
          saldo: { type: "number" },
          activa: { type: "boolean" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Transferencia: {
        type: "object",
        properties: {
          id: { type: "integer" },
          cuenta_origen_id: { type: "integer" },
          cuenta_destino_id: { type: "integer" },
          monto: { type: "number" },
          descripcion: { type: "string", nullable: true },
          estado: { type: "string", enum: ["pendiente", "completada", "rechazada"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Factura: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          proveedor: {
            type: "string",
            enum: ["ANDE", "ESSAP", "COPACO", "Tigo", "Personal"],
          },
          numero_factura: { type: "string" },
          monto: { type: "number" },
          fecha_vencimiento: { type: "string", format: "date" },
          estado: { type: "string", enum: ["pendiente", "pagada", "vencida"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Pago: {
        type: "object",
        properties: {
          id: { type: "integer" },
          factura_id: { type: "integer" },
          usuario_id: { type: "integer" },
          monto: { type: "number" },
          metodo_pago: { type: "string", enum: ["tarjeta", "cuenta", "efectivo"] },
          estado: { type: "string", enum: ["procesado", "fallido", "pendiente"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Tarjeta: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          tipo: { type: "string", enum: ["credito", "debito"] },
          marca: { type: "string", enum: ["visa", "mastercard"] },
          numero_enmascarado: { type: "string" },
          limite_credito: { type: "number", nullable: true },
          saldo_actual: { type: "number" },
          estado: { type: "string", enum: ["activa", "bloqueada", "vencida"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Notificacion: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          canal: { type: "string", enum: ["push", "email", "sms"] },
          asunto: { type: "string" },
          mensaje: { type: "string" },
          leido: { type: "boolean" },
          estado: { type: "string", enum: ["enviada", "fallida", "pendiente"] },
          created_at: { type: "string", format: "date-time" },
        },
      },
      ItemOrden: {
        type: "object",
        properties: {
          id: { type: "integer" },
          orden_id: { type: "integer" },
          producto: { type: "string" },
          cantidad: { type: "integer" },
          precio_unitario: { type: "number" },
          subtotal: { type: "number" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Orden: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          producto: { type: "string", description: "Producto del primer item de la orden." },
          monto: { type: "number", description: "Suma de cantidad*precio_unitario de todos los items." },
          estado: { type: "string", enum: ["pendiente", "pagada", "enviada", "cancelada"] },
          created_at: { type: "string", format: "date-time" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ItemOrden" },
            description: "Presente en POST /ordenes y GET /ordenes/{id}.",
          },
        },
      },
      Reserva: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          servicio: { type: "string" },
          fecha_hora: { type: "string", format: "date-time" },
          estado: {
            type: "string",
            enum: ["pendiente", "confirmada", "cancelada", "completada"],
          },
          notas: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      Rol: {
        type: "object",
        properties: {
          id: { type: "integer" },
          nombre: { type: "string", enum: ["admin", "soporte", "auditor", "operador"] },
          descripcion: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      UsuarioRol: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          role_id: { type: "integer" },
          activo: { type: "boolean" },
          asignado_en: { type: "string", format: "date-time" },
          nombre: { type: "string", description: "Solo en GET (join con roles)." },
          descripcion: { type: "string", nullable: true, description: "Solo en GET (join con roles)." },
        },
      },
      Movimiento: {
        type: "object",
        properties: {
          id: { type: "integer" },
          usuario_id: { type: "integer" },
          tipo_movimiento: {
            type: "string",
            enum: ["transferencia", "pago_factura", "compra_ecommerce", "cargo_tarjeta"],
          },
          monto: { type: "number" },
          referencia_id: { type: "integer", nullable: true },
          descripcion: { type: "string", nullable: true },
          created_at: { type: "string", format: "date-time" },
        },
      },
      MovimientoAgregado: {
        type: "object",
        properties: {
          tipo_movimiento: {
            type: "string",
            enum: ["transferencia", "pago_factura", "compra_ecommerce", "cargo_tarjeta"],
          },
          cantidad: { type: "integer" },
          total: { type: "number" },
        },
      },
      ResumenMovimientos: {
        type: "object",
        properties: {
          cantidad_movimientos: { type: "integer" },
          total: { type: "number" },
          primero: { type: "string", format: "date-time", nullable: true },
          ultimo: { type: "string", format: "date-time", nullable: true },
        },
      },
      RosterEntry: {
        type: "object",
        properties: {
          nombre: { type: "string" },
          email: { type: "string" },
          grupo: { type: "integer", minimum: 1, maximum: 10 },
        },
      },
    },
  },
  security: [{ ApiKeyAuth: [] }],
  paths: {
    "/api/v1/sql/select": {
      post: {
        tags: ["SQL Sandbox"],
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
        tags: ["SQL Sandbox"],
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

    // --- Grupo 1: Autenticación y Acceso ---
    "/api/v1/auth/login": {
      post: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Login (Grupo 1)",
        description:
          "Valida que el email corresponda a un usuario activo y registra un evento de " +
          "sesión. No hay columna de password en el schema: 400 (no 401) si el usuario no " +
          "existe o está inactivo.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } },
            },
          },
        },
        responses: {
          "200": { description: "Login exitoso", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Usuario" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Logout (Grupo 1)",
        description: "Registra un evento de logout para el usuario.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["usuarioId"], properties: { usuarioId: { type: "integer" } } } } },
        },
        responses: {
          "200": { description: "Logout registrado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Sesion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/auth/forgot-password": {
      post: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Solicitar reset de password (Grupo 1)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } },
        },
        responses: {
          "200": { description: "Solicitud registrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Sesion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/auth/reset-password": {
      post: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Completar reset de password (Grupo 1)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["usuarioId"], properties: { usuarioId: { type: "integer" } } } } },
        },
        responses: {
          "200": { description: "Reset completado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Sesion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 1 (cont.): sesiones — recurso CRUD genérico, aparte del flujo
    // realista de /auth/login|logout|forgot-password|reset-password ---
    "/api/v1/sesiones": {
      get: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Listar sesiones (Grupo 1)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Listado de sesiones", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Sesion" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Crear evento de sesión genérico (Grupo 1)",
        description:
          "Ejemplo didáctico de CRUD completo sobre sesiones. Para flujos realistas usar " +
          "/auth/login, /auth/logout, etc.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "tipoEvento"],
                properties: {
                  usuarioId: { type: "integer" },
                  tipoEvento: {
                    type: "string",
                    enum: ["login", "logout", "password_reset_solicitado", "password_reset_completado"],
                  },
                  exitoso: { type: "string", enum: ["true", "false"] },
                  ip: { type: "string" },
                  userAgent: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Sesión creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Sesion" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/sesiones/{id}": {
      get: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Obtener sesión por id (Grupo 1)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Sesión encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Sesion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Reemplazar metadatos de sesión (Grupo 1)",
        description:
          "Un evento de sesión es esencialmente un log — usuarioId/tipoEvento/exitoso quedan " +
          "fijos al crearse; PUT solo reemplaza ip/userAgent.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { ip: { type: "string" }, userAgent: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "Sesión actualizada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Sesion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 1 - Autenticación y Acceso"],
        summary: "Eliminar sesión (soft-delete) (Grupo 1)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 2: Transferencias entre Cuentas ---
    "/api/v1/cuentas": {
      get: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Listar cuentas (Grupo 2)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Listado de cuentas", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Cuenta" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Crear cuenta (Grupo 2)",
        description: "numero_cuenta es decorativo (generado al azar); saldo queda en 0.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "tipoCuenta", "moneda"],
                properties: {
                  usuarioId: { type: "integer" },
                  tipoCuenta: { type: "string", enum: ["ahorro", "corriente"] },
                  moneda: { type: "string", enum: ["PYG", "USD"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Cuenta creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Cuenta" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/cuentas/{id}": {
      get: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Obtener cuenta por id (Grupo 2)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Cuenta encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Cuenta" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Reemplazar cuenta (Grupo 2)",
        description: "numeroCuenta y saldo son inmutables vía PUT; activa sigue gobernado por DELETE.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tipoCuenta", "moneda"],
                properties: {
                  tipoCuenta: { type: "string", enum: ["ahorro", "corriente"] },
                  moneda: { type: "string", enum: ["PYG", "USD"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Cuenta reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Cuenta" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Eliminar cuenta (soft-delete) (Grupo 2)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/transferencias": {
      get: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Listar transferencias (Grupo 2)",
        parameters: [
          { name: "cuentaOrigenId", in: "query", required: false, schema: { type: "integer" } },
          { name: "cuentaDestinoId", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: {
          "200": { description: "Listado de transferencias", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Transferencia" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Crear transferencia (Grupo 2)",
        description:
          "Registra la transferencia con estado 'pendiente'. No muta cuentas.saldo en esta " +
          "iteración del sandbox (no hay regla de fondos insuficientes en el schema).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cuentaOrigenId", "cuentaDestinoId", "monto"],
                properties: {
                  cuentaOrigenId: { type: "integer" },
                  cuentaDestinoId: { type: "integer" },
                  monto: { type: "number" },
                  descripcion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Transferencia creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Transferencia" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/transferencias/{id}": {
      get: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Obtener transferencia por id (Grupo 2)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Transferencia encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Transferencia" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Reemplazar transferencia (Grupo 2)",
        description: "estado sigue en 'pendiente' vía default; no es reemplazable por PUT.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cuentaOrigenId", "cuentaDestinoId", "monto"],
                properties: {
                  cuentaOrigenId: { type: "integer" },
                  cuentaDestinoId: { type: "integer" },
                  monto: { type: "number" },
                  descripcion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Transferencia reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Transferencia" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 2 - Transferencias entre Cuentas"],
        summary: "Eliminar transferencia (soft-delete) (Grupo 2)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 3: Pagos de Servicios ---
    "/api/v1/facturas": {
      get: {
        tags: ["Grupo 3 - Pagos de Servicios"],
        summary: "Listar facturas (Grupo 3)",
        parameters: [
          { name: "usuarioId", in: "query", required: false, schema: { type: "integer" } },
          { name: "estado", in: "query", required: false, schema: { type: "string", enum: ["pendiente", "pagada", "vencida"] } },
        ],
        responses: {
          "200": { description: "Listado de facturas", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Factura" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 3 - Pagos de Servicios"],
        summary: "Crear factura (Grupo 3)",
        description: "estado queda en 'pendiente' (default) — pasar a 'pagada' sigue siendo solo POST .../pagar.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "proveedor", "numeroFactura", "monto", "fechaVencimiento"],
                properties: {
                  usuarioId: { type: "integer" },
                  proveedor: { type: "string", enum: ["ANDE", "ESSAP", "COPACO", "Tigo", "Personal"] },
                  numeroFactura: { type: "string" },
                  monto: { type: "number" },
                  fechaVencimiento: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Factura creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Factura" } } } } } },
          ...validationError,
          ...conflictError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/facturas/{id}": {
      get: {
        tags: ["Grupo 3 - Pagos de Servicios"],
        summary: "Obtener factura por id (Grupo 3)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Factura encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Factura" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 3 - Pagos de Servicios"],
        summary: "Reemplazar factura (Grupo 3)",
        description: "estado no es reemplazable por PUT — sigue gobernado por POST .../pagar.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["proveedor", "numeroFactura", "monto", "fechaVencimiento"],
                properties: {
                  proveedor: { type: "string", enum: ["ANDE", "ESSAP", "COPACO", "Tigo", "Personal"] },
                  numeroFactura: { type: "string" },
                  monto: { type: "number" },
                  fechaVencimiento: { type: "string", format: "date" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Factura reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Factura" } } } } } },
          ...notFoundError,
          ...validationError,
          ...conflictError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 3 - Pagos de Servicios"],
        summary: "Eliminar factura (soft-delete) (Grupo 3)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/facturas/{id}/pagar": {
      post: {
        tags: ["Grupo 3 - Pagos de Servicios"],
        summary: "Pagar factura (Grupo 3)",
        description:
          "Transaccional: SELECT...FOR UPDATE sobre la factura, INSERT en pagos, UPDATE de " +
          "facturas.estado a 'pagada'. 404 si la factura no existe o ya está pagada.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["metodoPago"], properties: { metodoPago: { type: "string", enum: ["tarjeta", "cuenta", "efectivo"] } } } } },
        },
        responses: {
          "200": {
            description: "Factura pagada",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        factura: { $ref: "#/components/schemas/Factura" },
                        pago: { $ref: "#/components/schemas/Pago" },
                      },
                    },
                  },
                },
              },
            },
          },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 4: Registro de Usuario / Onboarding ---
    "/api/v1/usuarios": {
      get: {
        tags: ["Grupo 4 - Registro de Usuario / Onboarding"],
        summary: "Listar usuarios (Grupo 4)",
        responses: {
          "200": { description: "Listado de usuarios activos", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Usuario" } } } } } } },
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 4 - Registro de Usuario / Onboarding"],
        summary: "Crear usuario (Grupo 4)",
        description: "kyc_estado queda en 'pendiente' (default de la tabla).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nombre", "email", "documentoTipo", "documentoNumero"],
                properties: {
                  nombre: { type: "string" },
                  email: { type: "string", format: "email" },
                  documentoTipo: { type: "string", enum: ["CI", "pasaporte", "RUC"] },
                  documentoNumero: { type: "string" },
                  fechaNacimiento: { type: "string", format: "date" },
                  direccion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Usuario creado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Usuario" } } } } } },
          ...validationError,
          ...conflictError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/usuarios/{id}": {
      get: {
        tags: ["Grupo 4 - Registro de Usuario / Onboarding"],
        summary: "Obtener usuario por id (Grupo 4)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Usuario encontrado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Usuario" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 4 - Registro de Usuario / Onboarding"],
        summary: "Reemplazar usuario (Grupo 4)",
        description:
          "Full-replace de los campos de negocio únicamente — kyc_estado sigue gobernado " +
          "por PATCH .../kyc y activo por DELETE, nunca por PUT.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nombre", "email", "documentoTipo", "documentoNumero"],
                properties: {
                  nombre: { type: "string" },
                  email: { type: "string", format: "email" },
                  documentoTipo: { type: "string", enum: ["CI", "pasaporte", "RUC"] },
                  documentoNumero: { type: "string" },
                  fechaNacimiento: { type: "string", format: "date" },
                  direccion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Usuario reemplazado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Usuario" } } } } } },
          ...notFoundError,
          ...validationError,
          ...conflictError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 4 - Registro de Usuario / Onboarding"],
        summary: "Eliminar usuario (soft-delete) (Grupo 4)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/usuarios/{id}/kyc": {
      patch: {
        tags: ["Grupo 4 - Registro de Usuario / Onboarding"],
        summary: "Actualizar estado KYC (Grupo 4)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["kycEstado"], properties: { kycEstado: { type: "string", enum: ["pendiente", "verificado", "rechazado"] } } } } },
        },
        responses: {
          "200": { description: "KYC actualizado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Usuario" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 5: Tarjetas de Crédito/Débito ---
    "/api/v1/tarjetas": {
      get: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Listar tarjetas (Grupo 5)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Listado de tarjetas", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Tarjeta" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Emitir tarjeta (Grupo 5)",
        description: "numero_enmascarado es decorativo (no hay datos reales de tarjeta en el sandbox).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "tipo", "marca"],
                properties: {
                  usuarioId: { type: "integer" },
                  tipo: { type: "string", enum: ["credito", "debito"] },
                  marca: { type: "string", enum: ["visa", "mastercard"] },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Tarjeta emitida", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Tarjeta" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/tarjetas/{id}": {
      get: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Obtener tarjeta por id (Grupo 5)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Tarjeta encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Tarjeta" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Reemplazar tarjeta (Grupo 5)",
        description: "numeroEnmascarado/saldoActual son server-owned; estado sigue gobernado por PATCH .../activar y .../bloquear.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tipo", "marca"],
                properties: {
                  tipo: { type: "string", enum: ["credito", "debito"] },
                  marca: { type: "string", enum: ["visa", "mastercard"] },
                  limiteCredito: { type: "number" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Tarjeta reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Tarjeta" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Eliminar tarjeta (soft-delete) (Grupo 5)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/tarjetas/{id}/bloquear": {
      patch: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Bloquear tarjeta (Grupo 5)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Tarjeta bloqueada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Tarjeta" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/tarjetas/{id}/activar": {
      patch: {
        tags: ["Grupo 5 - Tarjetas de Crédito/Débito"],
        summary: "Activar tarjeta (Grupo 5)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Tarjeta activada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Tarjeta" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 6: Notificaciones y Alertas ---
    "/api/v1/notificaciones": {
      get: {
        tags: ["Grupo 6 - Notificaciones y Alertas"],
        summary: "Listar notificaciones (Grupo 6)",
        parameters: [
          { name: "usuarioId", in: "query", required: false, schema: { type: "integer" } },
          { name: "leido", in: "query", required: false, schema: { type: "string", enum: ["true", "false"] } },
        ],
        responses: {
          "200": { description: "Listado de notificaciones", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Notificacion" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 6 - Notificaciones y Alertas"],
        summary: "Crear notificación (Grupo 6)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "canal", "asunto", "mensaje"],
                properties: {
                  usuarioId: { type: "integer" },
                  canal: { type: "string", enum: ["push", "email", "sms"] },
                  asunto: { type: "string" },
                  mensaje: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Notificación creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Notificacion" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/notificaciones/{id}": {
      get: {
        tags: ["Grupo 6 - Notificaciones y Alertas"],
        summary: "Obtener notificación por id (Grupo 6)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Notificación encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Notificacion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 6 - Notificaciones y Alertas"],
        summary: "Reemplazar notificación (Grupo 6)",
        description: "leido/estado no son reemplazables por PUT — leido sigue gobernado por PATCH .../leer.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["canal", "asunto", "mensaje"],
                properties: {
                  canal: { type: "string", enum: ["push", "email", "sms"] },
                  asunto: { type: "string" },
                  mensaje: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Notificación reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Notificacion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 6 - Notificaciones y Alertas"],
        summary: "Eliminar notificación (soft-delete) (Grupo 6)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/notificaciones/{id}/leer": {
      patch: {
        tags: ["Grupo 6 - Notificaciones y Alertas"],
        summary: "Marcar notificación como leída (Grupo 6)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Notificación actualizada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Notificacion" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 7: Carrito de Compras / E-commerce ---
    "/api/v1/ordenes": {
      get: {
        tags: ["Grupo 7 - Carrito de Compras / E-commerce"],
        summary: "Listar órdenes (Grupo 7)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Listado de órdenes", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Orden" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 7 - Carrito de Compras / E-commerce"],
        summary: "Crear orden (checkout) (Grupo 7)",
        description:
          "Transaccional: INSERT en ordenes + N×INSERT en items_orden. monto/subtotal se " +
          "calculan server-side a partir de cantidad*precioUnitario, nunca se confía en un " +
          "total mandado por el body.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "items"],
                properties: {
                  usuarioId: { type: "integer" },
                  items: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["producto", "cantidad", "precioUnitario"],
                      properties: {
                        producto: { type: "string" },
                        cantidad: { type: "integer", minimum: 1 },
                        precioUnitario: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Orden creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Orden" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/ordenes/{id}": {
      get: {
        tags: ["Grupo 7 - Carrito de Compras / E-commerce"],
        summary: "Obtener orden por id, con items (Grupo 7)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Orden encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Orden" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 7 - Carrito de Compras / E-commerce"],
        summary: "Reemplazar orden (Grupo 7)",
        description:
          "Recalcula producto/monto a partir de los items enviados, igual que el POST. " +
          "IMPORTANTE: no reemplaza las filas existentes de items_orden (qa_api no tiene " +
          "GRANT de DELETE) — quedan como historial append-only; este PUT solo actualiza " +
          "los campos propios de la orden.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["items"],
                properties: {
                  items: {
                    type: "array",
                    minItems: 1,
                    items: {
                      type: "object",
                      required: ["producto", "cantidad", "precioUnitario"],
                      properties: {
                        producto: { type: "string" },
                        cantidad: { type: "integer", minimum: 1 },
                        precioUnitario: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Orden reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Orden" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 7 - Carrito de Compras / E-commerce"],
        summary: "Eliminar orden (soft-delete) (Grupo 7)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 8: Reservas / Turnos ---
    "/api/v1/reservas": {
      get: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Listar reservas (Grupo 8)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Listado de reservas", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Reserva" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Crear reserva (Grupo 8)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "servicio", "fechaHora"],
                properties: {
                  usuarioId: { type: "integer" },
                  servicio: { type: "string" },
                  fechaHora: { type: "string", format: "date-time" },
                  notas: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Reserva creada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Reserva" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/reservas/{id}": {
      get: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Obtener reserva por id (Grupo 8)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Reserva encontrada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Reserva" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Reemplazar reserva (Grupo 8)",
        description: "estado no es reemplazable por PUT — sigue gobernado por PATCH .../confirmar y .../cancelar.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["servicio", "fechaHora"],
                properties: {
                  servicio: { type: "string" },
                  fechaHora: { type: "string", format: "date-time" },
                  notas: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Reserva reemplazada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Reserva" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Eliminar reserva (soft-delete) (Grupo 8)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/reservas/{id}/confirmar": {
      patch: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Confirmar reserva (Grupo 8)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Reserva confirmada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Reserva" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/reservas/{id}/cancelar": {
      patch: {
        tags: ["Grupo 8 - Reservas / Turnos"],
        summary: "Cancelar reserva (Grupo 8)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Reserva cancelada", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Reserva" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 9: Reportes (agregados de solo lectura sobre movimientos) ---
    "/api/v1/reportes/movimientos": {
      get: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Movimientos agrupados por tipo (Grupo 9)",
        parameters: [
          { name: "usuarioId", in: "query", required: false, schema: { type: "integer" } },
          { name: "desde", in: "query", required: false, schema: { type: "string", format: "date-time" } },
          { name: "hasta", in: "query", required: false, schema: { type: "string", format: "date-time" } },
        ],
        responses: {
          "200": { description: "Agregado por tipo_movimiento", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/MovimientoAgregado" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/reportes/resumen": {
      get: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Resumen de movimientos (Grupo 9)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Resumen agregado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/ResumenMovimientos" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 9 (cont.): movimientos — recurso CRUD genérico sobre la
    // misma tabla que consultan los agregados de solo lectura de arriba ---
    "/api/v1/movimientos": {
      get: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Listar movimientos (Grupo 9)",
        parameters: [{ name: "usuarioId", in: "query", required: false, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Listado de movimientos", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Movimiento" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Crear movimiento (Grupo 9)",
        description: "Ejemplo didáctico de CRUD completo sobre la tabla que /reportes/* agrega.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["usuarioId", "tipoMovimiento", "monto"],
                properties: {
                  usuarioId: { type: "integer" },
                  tipoMovimiento: {
                    type: "string",
                    enum: ["transferencia", "pago_factura", "compra_ecommerce", "cargo_tarjeta"],
                  },
                  monto: { type: "number" },
                  referenciaId: { type: "integer" },
                  descripcion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Movimiento creado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Movimiento" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/movimientos/{id}": {
      get: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Obtener movimiento por id (Grupo 9)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Movimiento encontrado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Movimiento" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Reemplazar movimiento (Grupo 9)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tipoMovimiento", "monto"],
                properties: {
                  tipoMovimiento: {
                    type: "string",
                    enum: ["transferencia", "pago_factura", "compra_ecommerce", "cargo_tarjeta"],
                  },
                  monto: { type: "number" },
                  referenciaId: { type: "integer" },
                  descripcion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Movimiento reemplazado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Movimiento" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 9 - Reportes y Dashboard"],
        summary: "Eliminar movimiento (soft-delete) (Grupo 9)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Grupo 10: Roles y Permisos ---
    "/api/v1/roles": {
      get: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Listar roles disponibles (Grupo 10)",
        responses: {
          "200": { description: "Listado de roles activos", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/Rol" } } } } } } },
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Crear rol (Grupo 10)",
        description: "nombre es un CHECK cerrado a 4 valores — duplicar uno existente devuelve 409.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nombre"],
                properties: {
                  nombre: { type: "string", enum: ["admin", "soporte", "auditor", "operador"] },
                  descripcion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Rol creado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Rol" } } } } } },
          ...validationError,
          ...conflictError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/roles/{id}": {
      get: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Obtener rol por id (Grupo 10)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Rol encontrado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Rol" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      put: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Reemplazar rol (Grupo 10)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["nombre"],
                properties: {
                  nombre: { type: "string", enum: ["admin", "soporte", "auditor", "operador"] },
                  descripcion: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Rol reemplazado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Rol" } } } } } },
          ...notFoundError,
          ...validationError,
          ...conflictError,
          ...authRateLimitErrors,
        },
      },
      delete: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Eliminar rol (soft-delete) (Grupo 10)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/usuarios/{id}/roles": {
      get: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Listar roles activos de un usuario (Grupo 10)",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": { description: "Roles activos", content: { "application/json": { schema: { type: "object", properties: { data: { type: "array", items: { $ref: "#/components/schemas/UsuarioRol" } } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
      post: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Asignar rol a usuario (Grupo 10)",
        description:
          "UPSERT sobre UNIQUE(usuario_id, role_id): si el rol ya estaba asignado y revocado, " +
          "lo reactiva en vez de fallar por la constraint. 201 si se creó la asignación por " +
          "primera vez, 200 si el upsert reactivó una fila existente.",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["roleId"], properties: { roleId: { type: "integer" } } } } },
        },
        responses: {
          "201": { description: "Rol asignado por primera vez", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/UsuarioRol" } } } } } },
          "200": { description: "Rol reactivado (ya existía, estaba revocado)", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/UsuarioRol" } } } } } },
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
    "/api/v1/usuarios/{id}/roles/{roleId}": {
      delete: {
        tags: ["Grupo 10 - Roles y Permisos"],
        summary: "Revocar rol de usuario (Grupo 10)",
        description:
          "Soft-revoke (UPDATE activo=false): el rol qa_api no tiene GRANT de DELETE en " +
          "ninguna tabla, a propósito.",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "integer" } },
          { name: "roleId", in: "path", required: true, schema: { type: "integer" } },
        ],
        responses: {
          ...noContentResponse,
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },

    // --- Roster: email real de alumno -> grupo de curso asignado ---
    "/api/v1/roster": {
      get: {
        tags: ["Roster"],
        summary: "Buscar el grupo asignado a un alumno por su email",
        parameters: [{ name: "email", in: "query", required: true, schema: { type: "string", format: "email" } }],
        responses: {
          "200": { description: "Alumno encontrado", content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/RosterEntry" } } } } } },
          ...notFoundError,
          ...validationError,
          ...authRateLimitErrors,
        },
      },
    },
  },
} as const;
