export const grupo = {
  n: 2,
  slug: "grupo-02-transferencias-entre-cuentas",
  titulo: "Transferencias entre Cuentas",
  modulo: "Módulo: Transferencias internas (mismo banco)",

  alcance:
    "Cubre la consulta de las cuentas de un titular y el registro de transferencias internas entre dos cuentas del sandbox. La transferencia se registra como una instrucción en estado `pendiente`: queda asentada con su importe, sus cuentas y su descripción, y puede consultarse por su identificador.",
  fueraDeAlcance:
    "Liquidación de la transferencia: el sandbox no descuenta ni acredita saldos, no valida fondos disponibles ni el estado de las cuentas, y no expone endpoints de confirmación, rechazo o reversa. Tampoco hay transferencias a otras entidades ni conversión de moneda.",

  endpoints: [
    { ruta: "GET /api/v1/cuentas", rf: "RF-G2-01", desc: "Lista cuentas, opcionalmente filtradas por titular." },
    { ruta: "GET /api/v1/cuentas/{id}", rf: "RF-G2-02", desc: "Devuelve el detalle de una cuenta." },
    { ruta: "POST /api/v1/transferencias", rf: "RF-G2-03", desc: "Registra una transferencia entre dos cuentas." },
    { ruta: "GET /api/v1/transferencias/{id}", rf: "RF-G2-04", desc: "Devuelve el detalle de una transferencia." },
  ],

  precondiciones: [
    "Para los escenarios de transferencia se necesitan al menos dos cuentas distintas ya existentes; los datos sembrados incluyen varias cuentas por titular, en guaraníes y en dólares.",
    "Las cuentas se identifican por su número interno (`id`), no por el número de cuenta comercial.",
  ],

  tablas: [
    {
      nombre: "cuentas",
      desc: "Cuentas de los titulares. Este módulo solo las lee: ningún endpoint modifica el saldo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`numero_cuenta`", "`text`, obligatorio y único"],
        ["`tipo_cuenta`", "`text`, `ahorro` o `corriente` (por defecto `ahorro`)"],
        ["`moneda`", "`text`, `PYG` o `USD` (por defecto `PYG`)"],
        ["`saldo`", "`numeric(14,2)`, obligatorio, por defecto 0"],
        ["`activa`", "`boolean`, obligatorio, por defecto `true`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
    {
      nombre: "transferencias",
      desc: "Instrucciones de transferencia registradas. Es la tabla que escribe el módulo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`cuenta_origen_id`", "`bigint`, obligatorio, referencia a `cuentas(id)`"],
        [
          "`cuenta_destino_id`",
          "`bigint`, obligatorio, referencia a `cuentas(id)`; la base impide que sea igual a la cuenta de origen",
        ],
        ["`monto`", "`numeric(14,2)`, obligatorio, la base exige que sea mayor que cero"],
        ["`descripcion`", "`text`, opcional"],
        ["`estado`", "`text`, uno de `pendiente` / `completada` / `rechazada`; por defecto `pendiente`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
  ],

  notaDatos:
    "El saldo de las cuentas es informativo para este módulo: registrar una transferencia por un importe mayor al saldo disponible es aceptado por el sistema. Los escenarios no deben esperar que el saldo cambie después de transferir.",

  rf: [
    {
      id: "RF-G2-01",
      nombre: "Listar cuentas",
      endpoint: "GET /api/v1/cuentas",
      descripcion:
        "Devuelve las cuentas del sandbox, con la posibilidad de acotar el resultado a un titular determinado. Es el paso previo para elegir cuenta de origen y de destino.",
      entradas: [
        "`usuarioId` (opcional, por query): número entero positivo. Se envía como texto en la URL y el sistema lo convierte.",
      ],
      reglas: [
        "Con `usuarioId`, devuelve todas las cuentas de ese titular ordenadas por identificador ascendente, sin límite de cantidad.",
        "Sin `usuarioId`, devuelve las primeras 100 cuentas del sandbox ordenadas por identificador ascendente.",
        "Un titular sin cuentas, o un `usuarioId` inexistente, devuelve una lista vacía y no un error.",
        "No hay paginación: el resultado sin filtro está acotado por el tope fijo de 100 registros.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de cuentas; cada elemento incluye `id`, `usuario_id`, `numero_cuenta`, `tipo_cuenta`, `moneda`, `saldo`, `activa` y `created_at`.",
        "El campo `saldo` viaja como texto con dos decimales, por ser un valor numérico exacto de la base.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/cuentas/route.ts`",
      criterios: [
        "Al listar cuentas sin filtro, la respuesta es 200 y `data` es un arreglo con como máximo 100 elementos ordenados por `id` ascendente.",
        "Al listar cuentas filtrando por un titular con cuentas, todos los elementos devueltos tienen ese `usuario_id`.",
        "Al filtrar por un `usuarioId` que no tiene cuentas, la respuesta es 200 y `data` es un arreglo vacío.",
        "Al enviar `usuarioId=abc`, la respuesta es 400 `VALIDATION_ERROR`.",
      ],
    },
    {
      id: "RF-G2-02",
      nombre: "Consultar una cuenta",
      endpoint: "GET /api/v1/cuentas/{id}",
      descripcion: "Devuelve el detalle de una cuenta puntual, identificada por su número interno.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve la cuenta cuyo identificador coincide exactamente.",
        "Si no existe, responde 404 con el mensaje \"Cuenta no encontrada.\".",
        "El identificador de la ruta tiene prioridad sobre cualquier `id` enviado por query o en el cuerpo.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la cuenta completa."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una cuenta con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/cuentas/[id]/route.ts`",
      criterios: [
        "Dada una cuenta existente, al consultarla por su identificador la respuesta es 200 y `data.id` coincide con el solicitado.",
        "Al consultar un identificador inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Cuenta no encontrada.\".",
        "Al consultar con un identificador no numérico, la respuesta es 400 `VALIDATION_ERROR`.",
      ],
    },
    {
      id: "RF-G2-03",
      nombre: "Registrar una transferencia",
      endpoint: "POST /api/v1/transferencias",
      descripcion:
        "Registra una instrucción de transferencia entre dos cuentas del sandbox por un importe determinado. La instrucción nace en estado `pendiente` y no altera los saldos.",
      entradas: [
        "`cuentaOrigenId` (obligatorio): número entero positivo.",
        "`cuentaDestinoId` (obligatorio): número entero positivo.",
        "`monto` (obligatorio): número mayor que cero. Se acepta como texto numérico y el sistema lo convierte.",
        "`descripcion` (opcional): texto libre; si se omite se guarda vacío.",
      ],
      reglas: [
        "La transferencia se registra siempre con `estado = 'pendiente'`; el cliente no puede elegir el estado.",
        "La cuenta de destino debe ser distinta de la de origen: la base rechaza el registro si coinciden.",
        "El importe debe ser mayor que cero, validado tanto en la entrada como en la base de datos.",
        "Ambas cuentas deben existir; si alguna no existe, la operación falla como error de ejecución por violación de clave foránea.",
        "**No se valida saldo suficiente, ni que las cuentas estén activas, ni que compartan moneda, ni que pertenezcan al mismo titular.** Una transferencia por un importe superior al saldo, entre monedas distintas o desde una cuenta inactiva es aceptada.",
        "Los saldos de origen y destino quedan intactos: la operación es puramente registral.",
      ],
      respuesta: [
        "`201 Created` con `data` conteniendo la transferencia creada: `id`, cuentas, `monto`, `descripcion`, `estado` (`pendiente`) y `created_at`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, el importe no es positivo o un identificador no es entero positivo."],
        ["`EXECUTION_ERROR`", "400", "La cuenta de origen o de destino no existe, o ambas son la misma cuenta."],
      ],
      fuente: "`app/api/v1/transferencias/route.ts` y las restricciones de `scripts/setup-db.sql`",
      criterios: [
        "Dadas dos cuentas distintas existentes, al registrar una transferencia válida la respuesta es 201 y `data.estado` es `pendiente`.",
        "Después de registrar la transferencia, el saldo de la cuenta de origen consultado con RF-G2-02 es el mismo que antes de la operación.",
        "Al registrar una transferencia con la misma cuenta como origen y destino, la respuesta es 400 `EXECUTION_ERROR`.",
        "Al registrar una transferencia con importe cero o negativo, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al registrar una transferencia contra una cuenta de destino inexistente, la respuesta es 400 `EXECUTION_ERROR` y ninguna transferencia queda registrada.",
        "Al registrar una transferencia por un importe mayor al saldo de la cuenta de origen, la respuesta es 201: el sandbox no controla fondos.",
        "La transferencia recién creada puede consultarse con RF-G2-04 usando el `id` devuelto.",
      ],
    },
    {
      id: "RF-G2-04",
      nombre: "Consultar una transferencia",
      endpoint: "GET /api/v1/transferencias/{id}",
      descripcion:
        "Devuelve el detalle de una transferencia registrada, para verificar su importe, sus cuentas y su estado.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve la transferencia cuyo identificador coincide exactamente.",
        "Si no existe, responde 404 con el mensaje \"Transferencia no encontrada.\".",
        "El estado devuelto es siempre `pendiente` para las transferencias creadas por la API; los datos sembrados incluyen además ejemplos en `completada` y `rechazada`.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la transferencia completa."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una transferencia con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/transferencias/[id]/route.ts`",
      criterios: [
        "Dada una transferencia recién registrada, al consultarla la respuesta es 200 y su `monto` y cuentas coinciden con los enviados al crearla.",
        "Al consultar una transferencia inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Transferencia no encontrada.\".",
        "Consultar dos veces la misma transferencia devuelve exactamente el mismo estado: no hay procesamiento diferido que lo cambie.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/cuentas` — Listado de cuentas",
        "Tabla con número, tipo, moneda, saldo y estado de cada cuenta, con un filtro por titular. Ejecuta RF-G2-01.",
      ],
      [
        "`/cuentas/{id}` — Detalle de cuenta",
        "Muestra los datos de una cuenta puntual. Ejecuta RF-G2-02.",
      ],
      [
        "`/transferencias` — Nueva transferencia",
        "La raíz del módulo es directamente el formulario de creación: cuenta de origen, cuenta de destino, importe y descripción opcional. Ejecuta RF-G2-03 y, al confirmarse, navega al detalle de la transferencia creada.",
      ],
      [
        "`/transferencias/{id}` — Detalle de transferencia",
        "Muestra el comprobante de la transferencia registrada. Ejecuta RF-G2-04.",
      ],
    ],
    notas: [
      "El formulario web pide los identificadores numéricos de las cuentas, no los números de cuenta comerciales.",
      "El campo de importe del formulario exige un valor mínimo de 0,01, por lo que el rechazo de un importe cero ocurre en el navegador antes de llegar a la API.",
      "Si la API rechaza la transferencia, el mensaje de error del backend se muestra dentro del formulario y no se navega al detalle.",
    ],
  },

  anexo: [
    {
      norma: "Reglamentación del BCP sobre el Sistema de Pagos del Paraguay (SIPAP) y transferencias electrónicas",
      expectativa:
        "Toda orden de transferencia debe tener identificación unívoca, trazabilidad de origen y destino y un estado final de liquidación.",
      estado:
        "Parcial: la orden se identifica y se traza (incluida la auditoría de la request), pero nunca alcanza un estado final: no hay liquidación.",
    },
    {
      norma: "Marco del BCP sobre disponibilidad de fondos en cuentas de depósito",
      expectativa:
        "Una orden solo puede ejecutarse si la cuenta ordenante tiene fondos suficientes y se encuentra operativa.",
      estado:
        "No implementado: no se valida saldo, ni que la cuenta esté activa; el saldo nunca se debita.",
    },
    {
      norma: "Ley 1015/97 y debida diligencia de operaciones (SEPRELAD)",
      expectativa:
        "Registro de las operaciones con datos suficientes para su monitoreo y detección de operaciones inusuales.",
      estado:
        "Parcial: cada transferencia queda registrada con importe, cuentas y fecha, pero no hay control de umbrales ni alertas.",
    },
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), deber de información",
      expectativa:
        "El usuario debe recibir constancia de la operación con importe, destino y estado.",
      estado:
        "Cubierto: la API devuelve el comprobante completo y la web lo muestra en la pantalla de detalle.",
    },
    {
      norma: "Reglas de conversión de moneda del BCP",
      expectativa: "Una transferencia entre cuentas de distinta moneda requiere un tipo de cambio explícito.",
      estado: "No implementado: se admite transferir entre cuentas en guaraníes y en dólares sin conversión alguna.",
    },
  ],

  brechas: [
    "El registro de la transferencia no modifica `cuentas.saldo`: no hay débito ni crédito.",
    "No existe validación de fondos suficientes ni endpoint que complete o rechace una transferencia pendiente.",
    "No se valida que las cuentas estén activas ni que compartan moneda; tampoco que pertenezcan a titulares distintos o al mismo titular.",
    "El estado `completada` y `rechazada` solo aparece en los datos sembrados: la API nunca los produce.",
    "No hay límites por operación ni por período, ni control de duplicados (dos transferencias idénticas seguidas son aceptadas).",
    "El listado de cuentas sin filtro está limitado a 100 registros sin paginación ni indicación de que hubo recorte.",
  ],
};
