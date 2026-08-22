// Metadatos y secciones compartidas por los 10 documentos.

export const META = {
  curso: "Curso de Automatización de Pruebas de Software",
  institucion: "Universidad Nacional de Asunción — CIT",
  profesor: "Steven Gracia",
  version: "1.0",
  fecha: "22 de agosto de 2026",
  aviso:
    "Documento derivado del código fuente de aiquaa-sandbox-api y aiquaa-sandbox-web. " +
    "Describe el comportamiento realmente implementado en el sandbox de práctica, no un " +
    "sistema bancario productivo. El anexo normativo es material de referencia orientativo.",
};

export const COMUN = {
  actores: [
    [
      "Alumno / QA automatizador",
      "Consume la API con su propia API key y automatiza escenarios BDD sobre el módulo de su grupo.",
    ],
    [
      "Usuario de negocio (fila de `usuarios`)",
      "Identidad de dominio sobre la que operan los endpoints: es dueño de cuentas, facturas, tarjetas, órdenes, reservas, notificaciones y roles.",
    ],
    [
      "API REST (aiquaa-sandbox-api)",
      "Ejecuta la lógica de negocio con SQL fijo bajo el rol de base de datos `qa_api` (SELECT + INSERT + UPDATE, sin DELETE).",
    ],
    [
      "Aplicación web (aiquaa-sandbox-web)",
      "Interfaz que consume la API a través del proxy `/api/proxy/{path}`; nunca llama al backend directamente desde el navegador.",
    ],
  ],

  precondiciones: [
    "Toda request a la API debe enviar el header `x-api-key` con una clave existente y con `active = true` en la tabla `public.api_keys`; sin header o con clave inválida/inactiva la respuesta es `401 UNAUTHORIZED` con el mensaje genérico \"Invalid or inactive API key.\".",
    "Cada API key admite un máximo de **30 requests por minuto** (ventana deslizante). Superado el límite la API responde `429 RATE_LIMITED` con los headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset`.",
    "Los datos de práctica viven en el schema aislado `qa_training` y se cargan con `scripts/seed-data.sql`; la data es determinística, por lo que un escenario puede apoyarse en los registros sembrados.",
    "La API no expone borrado físico: el rol `qa_api` no tiene permiso `DELETE`, y las operaciones que \"eliminan\" hacen baja lógica (`activo = false`).",
    "En la aplicación web el acceso tiene dos capas: capa 1 la API key (pantalla `/login`, se valida contra `GET /api/v1/roles` antes de guardarse) y capa 2 el usuario de negocio (pantalla `/auth/login`). Con `NEXT_PUBLIC_DEMO_MODE=true` la capa 1 se omite y el proxy inyecta una key demo del servidor.",
    "Las rutas `/usuarios/*` de la web son la excepción al guard de capa 2: se pueden usar solo con la API key, porque son el punto de partida para obtener un `usuarioId`.",
  ],

  transversalIntro:
    "Todas las rutas REST comparten el mismo pipeline: autenticación → control de caudal → validación de entrada → ejecución del SQL fijo → auditoría. Estas reglas aplican a cada requerimiento del documento y no se repiten en cada uno.",

  transversales: [
    "**Envoltura de respuesta:** las respuestas exitosas devuelven `{ \"data\": ... }` y las fallidas `{ \"error\": { \"code\", \"message\", \"details?\" } }`.",
    "**Validación de entrada:** cada ruta define un esquema; los parámetros de query, el cuerpo JSON y los parámetros de ruta se combinan en un único objeto con precedencia query < body < path (un `{id}` de la URL siempre gana sobre un `id` del cuerpo).",
    "**Coerción de tipos:** los identificadores y montos que llegan por query o por path se convierten de texto a número automáticamente; los campos numéricos de un cuerpo JSON deben enviarse como número, no como texto, salvo que el requerimiento indique lo contrario.",
    "**Cuerpo JSON malformado:** un cuerpo que no parsea como JSON devuelve `400 VALIDATION_ERROR` con el mensaje \"Invalid JSON body.\".",
    "**Errores de base de datos:** una violación de restricción (CHECK, UNIQUE, clave foránea) no aborta el servicio: se traduce a `400 EXECUTION_ERROR` con el mensaje que devuelve PostgreSQL.",
    "**Auditoría:** toda request, exitosa o fallida, deja un registro en `public.sql_audit_log` con la clave usada, el método y la ruta, la entrada validada, el resultado y la IP de origen. Un fallo de auditoría nunca convierte una respuesta exitosa en error.",
    "**Idempotencia de las transiciones de estado:** los endpoints que fijan un estado (`bloquear`, `activar`, `confirmar`, `cancelar`, `leer`) escriben el valor destino sin verificar el estado previo, por lo que repetir la llamada devuelve el mismo resultado.",
  ],

  errores: [
    ["`UNAUTHORIZED`", "401", "Falta el header `x-api-key`, o la clave no existe o está inactiva."],
    ["`RATE_LIMITED`", "429", "Se superaron las 30 requests por minuto de esa API key."],
    ["`VALIDATION_ERROR`", "400", "La entrada no cumple el esquema de la ruta, o el JSON es inválido."],
    ["`EXECUTION_ERROR`", "400", "La consulta falló en la base de datos (restricción violada, tipo inválido)."],
    ["`NOT_FOUND`", "404", "El recurso indicado no existe, o no está en un estado que admita la operación."],
    ["`INTERNAL_ERROR`", "500", "Fallo inesperado del servidor (por ejemplo, no se pudo verificar la API key)."],
  ],

  webIntro:
    "La aplicación web consume exactamente los mismos endpoints a través del proxy `/api/proxy/{path}`, que agrega la API key del lado del servidor y reenvía los headers de límite de caudal. El menú de navegación muestra únicamente los módulos del grupo del alumno cuando su email figura en el roster del curso; si no figura, muestra los diez módulos. Los errores de la API se muestran en pantalla con el mensaje que devolvió el backend, y un `401` cierra la sesión local.",

  criteriosIntro:
    "Criterios de aceptación redactados en prosa, uno o más por requerimiento, cubriendo el camino feliz y los caminos negativos. Son la base para derivar escenarios BDD.",

  avisoNormativo:
    "Este anexo es material de referencia orientativo para dar contexto de negocio a los escenarios de prueba. Las normas citadas del Banco Central del Paraguay (BCP) y de la Secretaría de Defensa del Consumidor y el Usuario (SEDECO) se mencionan de forma general y deben validarse con su texto vigente antes de usarse como criterio de cumplimiento. El sandbox es un entorno didáctico y no pretende cumplir ninguna de ellas.",
};
