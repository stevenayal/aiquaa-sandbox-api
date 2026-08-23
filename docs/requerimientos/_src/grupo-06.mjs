export const grupo = {
  n: 6,
  slug: "grupo-06-notificaciones-y-alertas",
  titulo: "Notificaciones y Alertas",
  modulo: "Módulo: Sistema de notificaciones (push / email / SMS)",

  alcance:
    "Cubre la creación de notificaciones dirigidas a un titular por alguno de los tres canales disponibles, su consulta con filtros por titular y por estado de lectura, y el marcado como leída. El sandbox registra la notificación y la da por enviada: no existe integración con ningún proveedor real de correo, SMS o push.",
  fueraDeAlcance:
    "Envío efectivo del mensaje, reintentos ante fallo, plantillas, programación diferida, preferencias de contacto del titular y baja de suscripción.",

  endpoints: [
    { ruta: "GET /api/v1/notificaciones", rf: "RF-G6-01", desc: "Lista notificaciones activas con filtros por titular y por leídas / no leídas." },
    { ruta: "POST /api/v1/notificaciones", rf: "RF-G6-02", desc: "Crea una notificación y la deja como enviada." },
    { ruta: "GET /api/v1/notificaciones/{id}", rf: "RF-G6-04", desc: "Devuelve el detalle de una notificación." },
    { ruta: "PUT /api/v1/notificaciones/{id}", rf: "RF-G6-05", desc: "Reemplaza canal, asunto y mensaje de una notificación." },
    { ruta: "DELETE /api/v1/notificaciones/{id}", rf: "RF-G6-06", desc: "Da de baja (soft-delete) una notificación." },
    { ruta: "PATCH /api/v1/notificaciones/{id}/leer", rf: "RF-G6-03", desc: "Marca una notificación como leída." },
  ],

  precondiciones: [
    "La creación requiere un titular existente; el `usuarioId` se obtiene del alta de cliente (RF-G4-01) o de los datos sembrados.",
    "Los datos sembrados incluyen notificaciones leídas y no leídas en los tres canales, suficientes para probar los filtros.",
  ],

  tablas: [
    {
      nombre: "notificaciones",
      desc: "Mensajes dirigidos a un titular. Es la única tabla que toca el módulo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`canal`", "`text`, uno de `push` / `email` / `sms`; por defecto `email`"],
        ["`asunto`", "`text`, obligatorio"],
        ["`mensaje`", "`text`, obligatorio"],
        ["`leido`", "`boolean`, obligatorio, por defecto `false`"],
        ["`estado`", "`text`, uno de `enviada` / `fallida` / `pendiente`; por defecto `enviada`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; lo usan `GET`/`PUT`/`DELETE` para filtrar/operar"],
      ],
    },
  ],

  notaDatos:
    "Conviene no confundir las dos dimensiones de estado: `estado` describe el envío (siempre `enviada` para lo que crea la API) y `leido` describe la lectura por parte del destinatario. Solo la segunda cambia con el uso.",

  rf: [
    {
      id: "RF-G6-01",
      nombre: "Listar notificaciones",
      endpoint: "GET /api/v1/notificaciones",
      descripcion:
        "Devuelve las notificaciones del sandbox, con filtros combinables por titular y por condición de lectura. Es el requerimiento que alimenta la bandeja del usuario.",
      entradas: [
        "`usuarioId` (opcional, por query): número entero positivo.",
        "`leido` (opcional, por query): exactamente el texto `true` o el texto `false`. No se aceptan otras formas de expresar el valor booleano (`1`, `0`, `sí`, `no`).",
      ],
      reglas: [
        "Devuelve únicamente notificaciones con `activo = true`; una dada de baja con RF-G6-06 deja de aparecer.",
        "Los dos filtros son opcionales y se combinan con Y lógico.",
        "El filtro de lectura acepta únicamente los textos `true` y `false`; cualquier otro valor es rechazado como error de validación, en lugar de interpretarse como verdadero.",
        "El resultado se ordena por identificador ascendente y está limitado a 100 registros.",
        "Sin filtros, devuelve las notificaciones de todos los titulares: la lista no está acotada al usuario en sesión.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de notificaciones, cada una con `id`, `usuario_id`, `canal`, `asunto`, `mensaje`, `leido`, `estado` y `created_at`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`leido` con un valor distinto de `true` o `false`, o `usuarioId` no numérico."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/notificaciones/route.ts`",
      criterios: [
        "Al listar con `leido=false`, todos los elementos devueltos tienen `leido` en falso.",
        "Al listar con `leido=true`, todos los elementos devueltos tienen `leido` en verdadero.",
        "Al combinar `usuarioId` y `leido`, todos los elementos cumplen ambas condiciones.",
        "Al listar con `leido=1`, la respuesta es 400 `VALIDATION_ERROR`: el filtro no acepta otras formas del valor booleano.",
        "Al filtrar por un titular sin notificaciones, la respuesta es 200 con `data` vacío.",
      ],
    },
    {
      id: "RF-G6-02",
      nombre: "Crear una notificación",
      endpoint: "POST /api/v1/notificaciones",
      descripcion:
        "Registra una notificación dirigida a un titular por un canal determinado, con su asunto y su mensaje. Queda marcada como enviada y sin leer.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo del destinatario.",
        "`canal` (obligatorio): uno de `push`, `email` o `sms`.",
        "`asunto` (obligatorio): texto no vacío.",
        "`mensaje` (obligatorio): texto no vacío.",
      ],
      reglas: [
        "La notificación se crea siempre con `estado = 'enviada'` y `leido = false`; ninguno de los dos puede enviarse desde el cliente.",
        "**No hay envío real:** el estado `enviada` describe el registro, no una entrega confirmada por un proveedor.",
        "Los estados `fallida` y `pendiente` existen en el modelo pero la API nunca los produce.",
        "El destinatario debe existir: un `usuarioId` inexistente falla como error de ejecución por violación de clave foránea.",
        "No se valida que el titular tenga un dato de contacto para el canal elegido (por ejemplo, un teléfono para `sms`), porque el modelo no los almacena.",
        "El asunto y el mensaje deben tener al menos un carácter, pero no tienen tope de longitud.",
      ],
      respuesta: ["`201 Created` con `data` conteniendo la notificación creada."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, `canal` no está permitido, asunto/mensaje están vacíos, o el destinatario indicado no existe."],
      ],
      fuente: "`app/api/v1/notificaciones/route.ts`",
      criterios: [
        "Al crear una notificación con datos válidos, la respuesta es 201, `data.estado` es `enviada` y `data.leido` es falso.",
        "La notificación recién creada aparece en el listado del titular filtrando por `leido=false`.",
        "Al crear con `canal=whatsapp`, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al crear con `asunto` vacío, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al crear para un `usuarioId` inexistente, la respuesta es 400 `VALIDATION_ERROR` y no se registra ninguna notificación.",
        "Al crear dos notificaciones idénticas seguidas, ambas son aceptadas y se registran por separado: no hay control de duplicados.",
      ],
    },
    {
      id: "RF-G6-04",
      nombre: "Consultar una notificación",
      endpoint: "GET /api/v1/notificaciones/{id}",
      descripcion: "Devuelve el detalle de una notificación puntual.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve la notificación cuyo identificador coincide exactamente, siempre que siga `activo = true`.",
        "Si no existe o ya está dada de baja, responde 404 con el mensaje \"Notificación no encontrada.\".",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la notificación completa."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una notificación vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/notificaciones/[id]/route.ts`",
      criterios: [
        "Dada una notificación existente, al consultarla por su `id` la respuesta es 200 y los datos coinciden con los de la creación.",
        "Al consultar una notificación inexistente o dada de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G6-05",
      nombre: "Reemplazar una notificación",
      endpoint: "PUT /api/v1/notificaciones/{id}",
      descripcion:
        "Reemplaza el canal, el asunto y el mensaje de una notificación existente. La condición de lectura y el estado de envío quedan fuera de este reemplazo.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`canal` (obligatorio): uno de `push`, `email`, `sms`.",
        "`asunto` (obligatorio): texto no vacío.",
        "`mensaje` (obligatorio): texto no vacío.",
      ],
      reglas: [
        "Solo puede reemplazar una notificación con `activo = true`; una dada de baja responde 404.",
        "`leido` y `estado` no forman parte del cuerpo: marcar como leída sigue siendo exclusivo de RF-G6-03.",
        "Reemplazar una notificación ya leída no la vuelve a marcar como no leída.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la notificación ya actualizada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una notificación vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, o `canal` tiene un valor fuera de la lista permitida."],
      ],
      fuente: "`app/api/v1/notificaciones/[id]/route.ts`",
      criterios: [
        "Dada una notificación existente, al reemplazar su `mensaje` la respuesta es 200 y el cambio se refleja al consultarla.",
        "El campo `leido` de una notificación ya leída no cambia al reemplazarla.",
        "Al reemplazar una notificación inexistente o dada de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G6-06",
      nombre: "Dar de baja una notificación",
      endpoint: "DELETE /api/v1/notificaciones/{id}",
      descripcion: "Da de baja lógica una notificación, quitándola de los listados y consultas por id.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "Una notificación ya leída también puede darse de baja.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una notificación vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/notificaciones/[id]/route.ts`",
      criterios: [
        "Dada una notificación vigente, al darla de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /notificaciones/{id}` sobre esa notificación responde 404, y deja de aparecer en RF-G6-01.",
      ],
    },
    {
      id: "RF-G6-03",
      nombre: "Marcar una notificación como leída",
      endpoint: "PATCH /api/v1/notificaciones/{id}/leer",
      descripcion:
        "Registra que el destinatario leyó la notificación, para que deje de figurar entre las pendientes de lectura.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo de la notificación."],
      reglas: [
        "La notificación pasa a `leido = true` sin verificar su valor anterior.",
        "La operación es idempotente: marcar como leída una notificación ya leída devuelve el mismo resultado, sin error.",
        "**No se verifica quién marca la lectura:** cualquier portador de una API key válida puede marcar como leída una notificación de cualquier titular.",
        "No existe la operación inversa: una vez leída, la notificación no puede volver a marcarse como no leída por API.",
        "No se registra la fecha de lectura, solo el hecho de que fue leída.",
        "**No filtra por `activo`:** a diferencia de `GET`/`PUT`/`DELETE`, este endpoint no se tocó al agregar el CRUD, así que puede marcar como leída una notificación ya dada de baja con RF-G6-06, aunque esa notificación ya no aparezca en ningún listado.",
        "Si la notificación no existe (ID inexistente), responde 404 y no modifica nada.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la notificación ya marcada como leída."],
      errores: [
        [
          "`NOT_FOUND`",
          "404",
          "No existe una notificación con ese identificador (mensaje: \"Notificación no encontrada.\").",
        ],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/notificaciones/[id]/leer/route.ts`",
      criterios: [
        "Dada una notificación no leída, al marcarla la respuesta es 200 y `data.leido` es verdadero.",
        "Tras marcarla, deja de aparecer en el listado filtrado por `leido=false` y aparece en el de `leido=true`.",
        "Al marcar dos veces la misma notificación, ambas respuestas son 200 y el resultado final es el mismo.",
        "Al marcar una notificación inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Notificación no encontrada.\".",
        "El campo `estado` de la notificación no cambia al marcarla como leída: sigue siendo `enviada`.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/notificaciones` — Bandeja",
        "Tabla con canal, asunto, mensaje y condición de lectura, con filtros por titular y por leídas / no leídas, y un botón por fila para marcar como leída. Ejecuta RF-G6-01 y RF-G6-03.",
      ],
      [
        "`/notificaciones/new` — Nueva notificación",
        "Formulario con destinatario, canal, asunto y mensaje. Ejecuta RF-G6-02 y, al crearse, vuelve a la bandeja.",
      ],
    ],
    notas: [
      "El filtro de lectura de la pantalla ofrece tres opciones (todas, leídas, no leídas) y envía exactamente los textos `true` y `false` que acepta la API.",
      "Marcar una notificación como leída refresca la bandeja, por lo que la fila cambia de estado sin recargar la página.",
      "No hay pantalla de detalle, edición ni baja individual: `GET`, `PUT` y `DELETE /notificaciones/{id}` (RF-G6-04/05/06) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), deber de información",
      expectativa:
        "El proveedor debe informar al consumidor sobre hechos relevantes de su servicio de manera oportuna y comprobable.",
      estado:
        "Parcial: la notificación queda registrada y es consultable, pero no hay entrega real ni constancia de recepción.",
    },
    {
      norma: "Ley 4868/2013 de Comercio Electrónico, comunicaciones al usuario",
      expectativa:
        "Las comunicaciones deben identificar al remitente y permitir al destinatario dejar de recibirlas.",
      estado:
        "No implementado: no hay remitente en el modelo ni mecanismo de baja de suscripción.",
    },
    {
      norma: "Marco del BCP sobre alertas de operaciones en canales electrónicos",
      expectativa:
        "Las operaciones sensibles deben disparar una alerta al titular por un canal previamente registrado.",
      estado:
        "No implementado: ninguna operación del sandbox (transferencia, pago, emisión de tarjeta) genera una notificación automática.",
    },
    {
      norma: "Ley 6534/2020 de protección de datos personales crediticios",
      expectativa:
        "El contenido dirigido a un titular solo debe ser accesible para ese titular.",
      estado:
        "No implementado: el listado sin filtro devuelve notificaciones de todos los titulares y cualquiera puede marcarlas como leídas.",
    },
    {
      norma: "Preferencias de contacto del titular",
      expectativa:
        "El canal utilizado debe corresponder a un dato de contacto validado y consentido por el titular.",
      estado:
        "No implementado: el canal se elige en la request y el modelo no guarda teléfono ni preferencias.",
    },
  ],

  brechas: [
    "No hay envío real por ningún canal: `estado = 'enviada'` describe el registro, no una entrega.",
    "Los estados `fallida` y `pendiente` nunca se producen, por lo que no hay escenarios de reintento.",
    "Cualquier portador de una API key puede leer y marcar notificaciones de cualquier titular: no hay aislamiento por destinatario.",
    "No se puede desmarcar una notificación leída ni se registra la fecha de lectura.",
    "Ninguna operación de negocio del sandbox genera notificaciones automáticas.",
    "El listado está limitado a 100 registros sin paginación.",
    "`PATCH .../leer` no filtra por `activo`: puede marcar como leída una notificación ya dada de baja con `DELETE`.",
  ],
};
