export const grupo = {
  n: 5,
  slug: "grupo-05-tarjetas-credito-debito",
  titulo: "Tarjetas de Crédito y Débito",
  modulo: "Módulo: Gestión de tarjetas",

  alcance:
    "Cubre el CRUD de tarjetas emitidas a un titular y el ciclo de bloqueo y desbloqueo. El número de tarjeta que devuelve el sistema es siempre un número enmascarado: el sandbox no guarda datos reales de tarjeta.",
  fueraDeAlcance:
    "Consumos y autorizaciones de compra, cálculo de límites disponibles, fecha de expiración, renovación, reposición por robo o extravío y estado de cuenta: ninguna de estas operaciones existe en el sandbox.",

  endpoints: [
    { ruta: "GET /api/v1/tarjetas", rf: "RF-G5-01", desc: "Lista tarjetas activas, opcionalmente filtradas por titular." },
    { ruta: "POST /api/v1/tarjetas", rf: "RF-G5-02", desc: "Emite una tarjeta nueva, activa desde el momento de la emisión." },
    { ruta: "GET /api/v1/tarjetas/{id}", rf: "RF-G5-05", desc: "Devuelve el detalle de una tarjeta." },
    { ruta: "PUT /api/v1/tarjetas/{id}", rf: "RF-G5-06", desc: "Reemplaza tipo, marca y límite de crédito de una tarjeta." },
    { ruta: "DELETE /api/v1/tarjetas/{id}", rf: "RF-G5-07", desc: "Da de baja (soft-delete) una tarjeta." },
    { ruta: "PATCH /api/v1/tarjetas/{id}/bloquear", rf: "RF-G5-03", desc: "Bloquea una tarjeta." },
    { ruta: "PATCH /api/v1/tarjetas/{id}/activar", rf: "RF-G5-04", desc: "Activa (o reactiva) una tarjeta." },
  ],

  precondiciones: [
    "La emisión requiere un titular existente; el `usuarioId` se obtiene del alta de cliente (RF-G4-01) o de los datos sembrados.",
    "Los datos sembrados incluyen tarjetas en los tres estados posibles (`activa`, `bloqueada`, `vencida`), útiles para los escenarios de transición.",
  ],

  tablas: [
    {
      nombre: "tarjetas",
      desc: "Plásticos emitidos a los titulares. Es la única tabla que toca el módulo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`tipo`", "`text`, `credito` o `debito`; por defecto `debito`"],
        ["`marca`", "`text`, `visa` o `mastercard`; por defecto `visa`"],
        ["`numero_enmascarado`", "`text`, obligatorio; formato `**** **** **** NNNN`"],
        ["`limite_credito`", "`numeric(12,2)`, opcional; la emisión por API lo deja vacío"],
        ["`saldo_actual`", "`numeric(12,2)`, obligatorio, por defecto 0"],
        ["`estado`", "`text`, uno de `activa` / `bloqueada` / `vencida`; por defecto `activa`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; lo usan `GET`/`PUT`/`DELETE` para filtrar/operar"],
      ],
    },
  ],

  notaDatos:
    "Los cuatro últimos dígitos del número enmascarado se generan al azar en cada emisión: no son estables entre ejecuciones y ningún escenario debe esperar un valor concreto. Sí es estable el formato `**** **** **** ` seguido de cuatro dígitos.",

  rf: [
    {
      id: "RF-G5-01",
      nombre: "Listar tarjetas",
      endpoint: "GET /api/v1/tarjetas",
      descripcion:
        "Devuelve las tarjetas del sandbox, con la posibilidad de acotar el resultado a un titular determinado.",
      entradas: ["`usuarioId` (opcional, por query): número entero positivo."],
      reglas: [
        "Devuelve únicamente tarjetas con `activo = true`; una dada de baja con RF-G5-07 deja de aparecer.",
        "Con `usuarioId`, devuelve todas las tarjetas activas de ese titular ordenadas por identificador ascendente.",
        "Sin `usuarioId`, devuelve las primeras 100 tarjetas activas del sandbox.",
        "El listado incluye tarjetas en cualquier `estado` de negocio (activa/bloqueada/vencida): no filtra por eso, solo por `activo`.",
        "Un titular sin tarjetas devuelve una lista vacía.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de tarjetas, cada una con `id`, `usuario_id`, `tipo`, `marca`, `numero_enmascarado`, `limite_credito`, `saldo_actual`, `estado` y `created_at`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/tarjetas/route.ts`",
      criterios: [
        "Al listar tarjetas filtrando por un titular, todos los elementos devueltos tienen ese `usuario_id`.",
        "El listado incluye tarjetas bloqueadas y vencidas junto a las activas.",
        "Al filtrar por un titular sin tarjetas, la respuesta es 200 con `data` vacío.",
        "Ninguna tarjeta expone un número completo: todas devuelven el formato enmascarado.",
      ],
    },
    {
      id: "RF-G5-02",
      nombre: "Emitir una tarjeta",
      endpoint: "POST /api/v1/tarjetas",
      descripcion:
        "Emite una tarjeta nueva para un titular, del tipo y la marca indicados. La tarjeta queda activa y operativa desde su emisión.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo del titular.",
        "`tipo` (obligatorio): `credito` o `debito`.",
        "`marca` (obligatorio): `visa` o `mastercard`.",
      ],
      reglas: [
        "La tarjeta se emite siempre con `estado = 'activa'`; el cliente no puede elegir el estado inicial.",
        "El número enmascarado lo genera el sistema con el formato `**** **** **** NNNN`, donde los cuatro dígitos finales son aleatorios.",
        "El saldo inicial es cero y el límite de crédito queda vacío, incluso para tarjetas de tipo `credito`.",
        "El titular debe existir: un `usuarioId` inexistente falla como error de ejecución por violación de clave foránea.",
        "**No hay tope de tarjetas por titular ni control de duplicados:** el mismo titular puede emitir cuantas tarjetas quiera, del mismo tipo y marca.",
        "No se verifica el estado de KYC del titular antes de emitir.",
      ],
      respuesta: ["`201 Created` con `data` conteniendo la tarjeta emitida."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, `tipo`/`marca` tienen un valor fuera de la lista permitida, o el titular indicado no existe."],
      ],
      fuente: "`app/api/v1/tarjetas/route.ts`",
      criterios: [
        "Al emitir una tarjeta para un titular existente, la respuesta es 201, `data.estado` es `activa` y `data.saldo_actual` es cero.",
        "El `numero_enmascarado` devuelto empieza con `**** **** **** ` y termina en cuatro dígitos.",
        "Al emitir una tarjeta de crédito, `limite_credito` queda vacío: la emisión no asigna límite.",
        "Al emitir dos tarjetas seguidas para el mismo titular con el mismo tipo y marca, ambas respuestas son 201 y se crean dos tarjetas distintas.",
        "Al emitir con `marca=amex`, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al emitir para un `usuarioId` inexistente, la respuesta es 400 `VALIDATION_ERROR` y no se crea ninguna tarjeta.",
        "Al emitir para un titular con KYC pendiente, la operación es aceptada: la emisión no consulta el estado de verificación.",
      ],
    },
    {
      id: "RF-G5-05",
      nombre: "Consultar una tarjeta",
      endpoint: "GET /api/v1/tarjetas/{id}",
      descripcion: "Devuelve el detalle de una tarjeta puntual.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve la tarjeta cuyo identificador coincide exactamente, siempre que siga `activo = true`.",
        "Si no existe o ya está dada de baja, responde 404 con el mensaje \"Tarjeta no encontrada.\".",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la tarjeta completa."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una tarjeta vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/tarjetas/[id]/route.ts`",
      criterios: [
        "Dada una tarjeta existente, al consultarla por su `id` la respuesta es 200 y los datos coinciden con los de la emisión.",
        "Al consultar una tarjeta inexistente o dada de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G5-06",
      nombre: "Reemplazar una tarjeta",
      endpoint: "PUT /api/v1/tarjetas/{id}",
      descripcion:
        "Reemplaza el tipo, la marca y, opcionalmente, el límite de crédito de una tarjeta existente. Es la única forma de asignarle un límite de crédito, algo que la emisión (RF-G5-02) no permite.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`tipo` (obligatorio): `credito` o `debito`.",
        "`marca` (obligatorio): `visa` o `mastercard`.",
        "`limiteCredito` (opcional): número mayor que cero.",
      ],
      reglas: [
        "Solo puede reemplazar una tarjeta con `activo = true`; una dada de baja responde 404.",
        "`numeroEnmascarado` y `saldoActual` no forman parte del cuerpo: quedan fuera del control del cliente.",
        "`estado` tampoco forma parte del cuerpo: bloquear/activar sigue siendo exclusivo de RF-G5-03/04.",
        "Omitir `limiteCredito` lo deja vacío (`null`), aunque la tarjeta ya tuviera uno asignado: es un reemplazo completo, no un parche.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la tarjeta ya actualizada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una tarjeta vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, o tiene un valor fuera de la lista permitida."],
      ],
      fuente: "`app/api/v1/tarjetas/[id]/route.ts`",
      criterios: [
        "Dada una tarjeta de crédito sin límite, al reemplazarla enviando `limiteCredito`, la respuesta es 200 y `data.limite_credito` refleja el nuevo valor.",
        "El `estado` de la tarjeta no cambia por este reemplazo.",
        "Al reemplazar sin enviar `limiteCredito` una tarjeta que ya tenía uno asignado, el límite queda vacío.",
        "Al reemplazar una tarjeta inexistente o dada de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G5-07",
      nombre: "Dar de baja una tarjeta",
      endpoint: "DELETE /api/v1/tarjetas/{id}",
      descripcion: "Da de baja lógica una tarjeta, quitándola de los listados y consultas por id.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "Es distinta de bloquear (RF-G5-03): bloquear cambia el `estado` de negocio mientras la tarjeta sigue existiendo para el CRUD; dar de baja la saca del CRUD sin importar su `estado` de negocio.",
        "Una tarjeta ya bloqueada o vencida también puede darse de baja.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una tarjeta vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/tarjetas/[id]/route.ts`",
      criterios: [
        "Dada una tarjeta vigente, al darla de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /tarjetas/{id}` sobre esa tarjeta responde 404, y deja de aparecer en RF-G5-01.",
        "Dar de baja una tarjeta bloqueada es aceptado igual (204).",
      ],
    },
    {
      id: "RF-G5-03",
      nombre: "Bloquear una tarjeta",
      endpoint: "PATCH /api/v1/tarjetas/{id}/bloquear",
      descripcion:
        "Deja una tarjeta fuera de servicio, por ejemplo ante un extravío. El bloqueo es inmediato y no requiere motivo.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo de la tarjeta."],
      reglas: [
        "El estado de la tarjeta pasa a `bloqueada` sin verificar el estado anterior.",
        "La operación es idempotente: bloquear una tarjeta ya bloqueada devuelve el mismo resultado, sin error.",
        "También puede bloquearse una tarjeta en estado `vencida`.",
        "No se registra motivo, ni fecha de bloqueo distinta de la de la bitácora de requests, ni quién lo solicitó.",
        "Si la tarjeta no existe, responde 404 y no modifica nada.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la tarjeta ya bloqueada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una tarjeta con ese identificador (mensaje: \"Tarjeta no encontrada.\")."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/tarjetas/[id]/bloquear/route.ts`",
      criterios: [
        "Dada una tarjeta activa, al bloquearla la respuesta es 200 y `data.estado` es `bloqueada`.",
        "Al bloquear dos veces la misma tarjeta, ambas respuestas son 200 y el estado final sigue siendo `bloqueada`.",
        "Al bloquear una tarjeta inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Tarjeta no encontrada.\".",
        "Al listar las tarjetas del titular después del bloqueo, la tarjeta figura con estado `bloqueada`.",
      ],
    },
    {
      id: "RF-G5-04",
      nombre: "Activar una tarjeta",
      endpoint: "PATCH /api/v1/tarjetas/{id}/activar",
      descripcion:
        "Vuelve a poner en servicio una tarjeta, revirtiendo un bloqueo previo.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo de la tarjeta."],
      reglas: [
        "El estado de la tarjeta pasa a `activa` sin verificar el estado anterior.",
        "La operación es idempotente: activar una tarjeta ya activa devuelve el mismo resultado.",
        "**Una tarjeta en estado `vencida` también puede activarse**, lo que en un sistema real requeriría reemisión del plástico.",
        "El bloqueo y la activación pueden alternarse indefinidamente sin límite de intentos.",
        "Si la tarjeta no existe, responde 404 y no modifica nada.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la tarjeta ya activa."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una tarjeta con ese identificador (mensaje: \"Tarjeta no encontrada.\")."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/tarjetas/[id]/activar/route.ts`",
      criterios: [
        "Dada una tarjeta bloqueada, al activarla la respuesta es 200 y `data.estado` es `activa`.",
        "Al bloquear y activar la misma tarjeta de forma alternada varias veces, todas las respuestas son 200 y el estado final es el de la última operación.",
        "Al activar una tarjeta en estado `vencida`, la respuesta es 200 y la tarjeta queda `activa`: el sandbox no impide la transición.",
        "Al activar una tarjeta inexistente, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/tarjetas` — Listado de tarjetas",
        "Tabla con tipo, marca, número enmascarado, saldo y estado, con filtro por titular y botones de bloqueo y activación por fila. Ejecuta RF-G5-01, RF-G5-03 y RF-G5-04.",
      ],
      [
        "`/tarjetas/new` — Emisión de tarjeta",
        "Formulario con titular, tipo y marca. Ejecuta RF-G5-02 y, al emitirse, vuelve al listado.",
      ],
    ],
    notas: [
      "Los botones de acción de cada fila refrescan el listado tras la operación, de modo que el nuevo estado se ve sin recargar la página.",
      "El campo de titular del formulario se completa por defecto con el usuario en sesión, pero puede cambiarse a mano.",
      "No hay pantalla de detalle, edición ni baja individual: `GET`, `PUT` y `DELETE /tarjetas/{id}` (RF-G5-05/06/07) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Ley 4595/2012 de tarjetas de crédito",
      expectativa:
        "El contrato debe fijar un límite de crédito explícito y las condiciones de uso antes de la emisión.",
      estado:
        "No implementado: la emisión de una tarjeta de crédito deja el límite vacío y no registra condición alguna.",
    },
    {
      norma: "Ley 4595/2012, bloqueo por denuncia del titular",
      expectativa:
        "El titular puede denunciar el extravío y el emisor debe bloquear el plástico de inmediato, dejando constancia de la denuncia.",
      estado:
        "Parcial: el bloqueo es inmediato, pero no se registra motivo ni denuncia, y cualquier portador de una API key válida puede bloquear cualquier tarjeta.",
    },
    {
      norma: "Estándares de la industria de medios de pago sobre datos de tarjeta",
      expectativa:
        "El número completo de la tarjeta no debe almacenarse ni exponerse; solo los últimos dígitos.",
      estado:
        "Cubierto: el sandbox nunca guarda un número real y solo devuelve el formato enmascarado.",
    },
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), reversión de operaciones",
      expectativa:
        "El consumidor debe poder revertir la baja o el bloqueo y conocer el estado de su instrumento.",
      estado:
        "Cubierto en cuanto al estado: el listado muestra el estado actual y la activación revierte el bloqueo.",
    },
    {
      norma: "Marco del BCP sobre vencimiento y reemisión de instrumentos de pago",
      expectativa:
        "Una tarjeta vencida no puede volver a ponerse en servicio sin reemisión.",
      estado:
        "No implementado: activar una tarjeta vencida es una operación aceptada.",
    },
  ],

  brechas: [
    "Las transiciones de estado no validan el estado previo: una tarjeta vencida puede activarse.",
    "El estado `vencida` nunca se asigna automáticamente: no hay fecha de expiración en el modelo.",
    "La emisión no asigna límite de crédito ni distingue el tratamiento de una tarjeta de crédito respecto de una de débito.",
    "`saldo_actual` nunca cambia: no hay consumos, autorizaciones ni pagos que lo muevan.",
    "No hay tope de tarjetas por titular ni control de duplicados.",
    "El bloqueo no registra motivo ni solicitante, y no existe un historial de cambios de estado.",
    "`PATCH .../bloquear` y `.../activar` no filtran por `activo`: una tarjeta dada de baja con `DELETE` (RF-G5-07) ya no aparece en `GET`, pero igual puede bloquearse o activarse.",
    "El límite de crédito solo puede asignarse vía `PUT` (RF-G5-06), nunca en la emisión (RF-G5-02): una tarjeta de crédito recién emitida siempre nace sin límite.",
  ],
};
