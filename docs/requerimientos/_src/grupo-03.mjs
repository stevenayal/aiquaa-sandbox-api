export const grupo = {
  n: 3,
  slug: "grupo-03-pagos-de-servicios",
  titulo: "Pagos de Servicios",
  modulo: "Módulo: Pago de facturas (ANDE, ESSAP, telefonía)",

  alcance:
    "Cubre el CRUD de facturas de servicios de un titular y el pago de una factura pendiente. El pago es la única operación del sandbox que ejecuta dos escrituras dentro de una misma transacción: registra el pago y marca la factura como pagada, todo o nada.",
  fueraDeAlcance:
    "Cálculo de intereses o recargos por mora, pagos parciales, anulación o reverso de un pago, y la validación real del medio de pago elegido.",

  endpoints: [
    { ruta: "GET /api/v1/facturas", rf: "RF-G3-01", desc: "Lista facturas activas, con filtros por titular y estado." },
    { ruta: "POST /api/v1/facturas", rf: "RF-G3-04", desc: "Crea una factura nueva en estado pendiente." },
    { ruta: "GET /api/v1/facturas/{id}", rf: "RF-G3-02", desc: "Devuelve el detalle de una factura." },
    { ruta: "PUT /api/v1/facturas/{id}", rf: "RF-G3-05", desc: "Reemplaza proveedor, número, importe y vencimiento de una factura." },
    { ruta: "DELETE /api/v1/facturas/{id}", rf: "RF-G3-06", desc: "Da de baja (soft-delete) una factura." },
    { ruta: "POST /api/v1/facturas/{id}/pagar", rf: "RF-G3-03", desc: "Paga una factura pendiente y registra el pago." },
  ],

  precondiciones: [
    "Los escenarios de pago necesitan al menos una factura en estado `pendiente`; los datos sembrados incluyen facturas pendientes, pagadas y vencidas de los proveedores ANDE, ESSAP, COPACO, Tigo y Personal.",
    "Una factura solo se puede pagar una vez: los escenarios que repiten el pago deben usar una factura pendiente distinta o esperar el error de la segunda llamada.",
  ],

  tablas: [
    {
      nombre: "facturas",
      desc: "Facturas de servicios emitidas a un titular. El módulo las lee y actualiza su estado al pagarlas.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        [
          "`proveedor`",
          "`text`, obligatorio, uno de `ANDE` / `ESSAP` / `COPACO` / `Tigo` / `Personal`",
        ],
        ["`numero_factura`", "`text`, obligatorio y único"],
        ["`monto`", "`numeric(12,2)`, obligatorio"],
        ["`fecha_vencimiento`", "`date`, obligatorio"],
        ["`estado`", "`text`, uno de `pendiente` / `pagada` / `vencida`; por defecto `pendiente`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; lo usan `GET`/`PUT`/`DELETE` para filtrar/operar"],
      ],
    },
    {
      nombre: "pagos",
      desc: "Pagos aplicados a facturas. El módulo inserta una fila por cada pago aceptado.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`factura_id`", "`bigint`, obligatorio, referencia a `facturas(id)`"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`monto`", "`numeric(12,2)`, obligatorio"],
        ["`metodo_pago`", "`text`, uno de `tarjeta` / `cuenta` / `efectivo`"],
        ["`estado`", "`text`, uno de `procesado` / `fallido` / `pendiente`; por defecto `procesado`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
  ],

  notaDatos:
    "El importe del pago no lo elige quien paga: el sistema lo toma de la factura. Tampoco se elige el titular del pago, que se copia del titular de la factura. Una factura en estado `vencida` sí puede pagarse: la única condición es que no esté ya `pagada`.",

  rf: [
    {
      id: "RF-G3-01",
      nombre: "Listar facturas",
      endpoint: "GET /api/v1/facturas",
      descripcion:
        "Devuelve las facturas del sandbox, con filtros combinables por titular y por estado, para ubicar las facturas que quedan por pagar.",
      entradas: [
        "`usuarioId` (opcional, por query): número entero positivo.",
        "`estado` (opcional, por query): uno de `pendiente`, `pagada` o `vencida`. Cualquier otro valor es rechazado.",
      ],
      reglas: [
        "Devuelve únicamente facturas con `activo = true`; una dada de baja con RF-G3-06 deja de aparecer aunque se filtre por su `estado`.",
        "Los dos filtros son opcionales y se combinan con Y lógico: enviando ambos se obtienen las facturas de ese titular en ese estado.",
        "El resultado se ordena por identificador ascendente y está limitado a 100 registros, con o sin filtros.",
        "Una combinación de filtros sin coincidencias devuelve una lista vacía, no un error.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de facturas; cada elemento incluye `id`, `usuario_id`, `proveedor`, `numero_factura`, `monto`, `fecha_vencimiento`, `estado` y `created_at`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`estado` con un valor fuera de la lista permitida, o `usuarioId` no numérico."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/facturas/route.ts`",
      criterios: [
        "Al listar facturas filtrando por `estado=pendiente`, todos los elementos devueltos tienen ese estado.",
        "Al combinar `usuarioId` y `estado`, todos los elementos cumplen ambas condiciones simultáneamente.",
        "Al filtrar por `estado=anulada`, la respuesta es 400 `VALIDATION_ERROR` porque el valor no pertenece a la lista permitida.",
        "Al filtrar por un titular sin facturas, la respuesta es 200 con `data` vacío.",
      ],
    },
    {
      id: "RF-G3-02",
      nombre: "Consultar una factura",
      endpoint: "GET /api/v1/facturas/{id}",
      descripcion:
        "Devuelve el detalle de una factura puntual: proveedor, número, importe, vencimiento y estado actual.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve la factura cuyo identificador coincide exactamente, sin importar su `estado` (`pendiente`/`pagada`/`vencida`), siempre que siga `activo = true`.",
        "Si no existe o ya está dada de baja, responde 404 con el mensaje \"Factura no encontrada.\".",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la factura completa."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una factura con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/facturas/[id]/route.ts`",
      criterios: [
        "Dada una factura existente, al consultarla la respuesta es 200 y `data.numero_factura` coincide con el de la factura.",
        "Al consultar una factura inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Factura no encontrada.\".",
        "Después de pagar una factura, al consultarla nuevamente su `estado` es `pagada`.",
      ],
    },
    {
      id: "RF-G3-03",
      nombre: "Pagar una factura",
      endpoint: "POST /api/v1/facturas/{id}/pagar",
      descripcion:
        "Paga una factura que aún no fue pagada: registra el pago con el medio elegido y marca la factura como pagada. Ambas escrituras ocurren dentro de una misma transacción.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo de la factura.",
        "`metodoPago` (obligatorio, en el cuerpo): uno de `tarjeta`, `cuenta` o `efectivo`.",
      ],
      reglas: [
        "Solo se puede pagar una factura que no esté en estado `pagada`. Una factura `pendiente` o `vencida` es pagable.",
        "La factura se bloquea durante la operación, de modo que dos pagos simultáneos de la misma factura no puedan prosperar los dos: uno gana y el otro encuentra la factura ya pagada.",
        "El importe del pago se copia del importe de la factura; el cliente no puede pagar de más ni de menos, ni hacer pagos parciales.",
        "El titular del pago se copia del titular de la factura.",
        "El pago se registra siempre con `estado = 'procesado'`: no hay medio de pago que pueda rechazarlo.",
        "Acto seguido, y dentro de la misma transacción, la factura pasa a `estado = 'pagada'`. Si algo falla, ninguna de las dos escrituras queda aplicada.",
        "Una factura ya pagada no se distingue de una inexistente: ambas responden 404 con el mismo mensaje.",
        "**No se valida el vencimiento, ni la existencia de fondos, tarjeta o cuenta asociada al medio de pago elegido.**",
      ],
      respuesta: [
        "`200 OK` con `data` conteniendo dos objetos: `factura` (ya con `estado = 'pagada'`) y `pago` (con `id`, `factura_id`, `usuario_id`, `monto`, `metodo_pago`, `estado` y `created_at`).",
      ],
      errores: [
        [
          "`NOT_FOUND`",
          "404",
          "La factura no existe o ya está pagada (mensaje: \"Factura no encontrada o ya pagada.\").",
        ],
        ["`VALIDATION_ERROR`", "400", "`metodoPago` ausente o con un valor fuera de la lista permitida."],
        ["`EXECUTION_ERROR`", "400", "Fallo de base de datos al registrar el pago o actualizar la factura."],
      ],
      fuente: "`app/api/v1/facturas/[id]/pagar/route.ts`",
      criterios: [
        "Dada una factura pendiente, al pagarla con un medio válido la respuesta es 200, `data.factura.estado` es `pagada` y `data.pago.estado` es `procesado`.",
        "El importe de `data.pago.monto` es igual al importe de la factura, sin que el cliente lo haya enviado.",
        "El `usuario_id` del pago coincide con el titular de la factura.",
        "Al pagar por segunda vez la misma factura, la respuesta es 404 `NOT_FOUND` con el mensaje \"Factura no encontrada o ya pagada.\", y no se registra un segundo pago.",
        "Al pagar una factura en estado `vencida`, la operación es aceptada y la factura queda `pagada`.",
        "Al pagar con `metodoPago=cripto`, la respuesta es 400 `VALIDATION_ERROR` y la factura conserva su estado anterior.",
        "Al pagar una factura inexistente, la respuesta es 404 y no se crea ninguna fila en `pagos`.",
      ],
    },
    {
      id: "RF-G3-04",
      nombre: "Crear una factura",
      endpoint: "POST /api/v1/facturas",
      descripcion: "Registra una factura de servicio nueva para un titular, en estado pendiente de pago.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo del titular.",
        "`proveedor` (obligatorio): uno de `ANDE`, `ESSAP`, `COPACO`, `Tigo`, `Personal`.",
        "`numeroFactura` (obligatorio): texto no vacío, único en todo el sandbox.",
        "`monto` (obligatorio): número mayor que cero.",
        "`fechaVencimiento` (obligatorio): texto no vacío (fecha).",
      ],
      reglas: [
        "La factura se crea siempre con `estado = 'pendiente'`; el cliente no puede elegir el estado inicial.",
        "`numeroFactura` debe ser único: repetirlo (incluso para otro titular) es rechazado por la base de datos.",
        "El titular debe existir: un `usuarioId` inexistente falla como error de ejecución por violación de clave foránea.",
        "No se valida que `fechaVencimiento` sea una fecha futura: se acepta cualquier fecha interpretable, incluida una ya pasada.",
      ],
      respuesta: ["`201 Created` con `data` conteniendo la factura creada."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, `proveedor` tiene un valor fuera de la lista permitida, o el `usuarioId` indicado no existe."],
        ["`EXECUTION_ERROR`", "400", "`fechaVencimiento` no es una fecha interpretable."],
        ["`CONFLICT`", "409", "Ya existe una factura con ese `numeroFactura`."],
      ],
      fuente: "`app/api/v1/facturas/route.ts`",
      criterios: [
        "Al crear una factura con datos válidos, la respuesta es 201 y `data.estado` es `pendiente`.",
        "La factura creada aparece en el listado de RF-G3-01 filtrando por ese titular.",
        "Al crear con un `numeroFactura` ya usado por otra factura, la respuesta es 409 `CONFLICT`.",
        "Al crear con `proveedor=Claro`, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al crear para un `usuarioId` inexistente, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al crear con una `fechaVencimiento` ya pasada, la operación es aceptada: el sandbox no valida vigencia al crear.",
      ],
    },
    {
      id: "RF-G3-05",
      nombre: "Reemplazar una factura",
      endpoint: "PUT /api/v1/facturas/{id}",
      descripcion:
        "Reemplaza proveedor, número, importe y vencimiento de una factura existente. El estado queda fuera de este reemplazo.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`proveedor` (obligatorio): uno de `ANDE`, `ESSAP`, `COPACO`, `Tigo`, `Personal`.",
        "`numeroFactura` (obligatorio): texto no vacío, único.",
        "`monto` (obligatorio): número mayor que cero.",
        "`fechaVencimiento` (obligatorio): texto no vacío.",
      ],
      reglas: [
        "Solo puede reemplazar una factura con `activo = true`; una dada de baja responde 404.",
        "`estado` no forma parte del cuerpo: pasar una factura a `pagada` sigue siendo responsabilidad exclusiva de RF-G3-03; este reemplazo nunca cambia el estado.",
        "Reemplazar el `numeroFactura` por uno ya usado en otra factura es rechazado por unicidad.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la factura ya actualizada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una factura vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio o tiene un valor fuera de la lista permitida."],
        ["`CONFLICT`", "409", "El `numeroFactura` ya pertenece a otra factura."],
      ],
      fuente: "`app/api/v1/facturas/[id]/route.ts`",
      criterios: [
        "Dada una factura pendiente, al reemplazar su `monto` la respuesta es 200 y el `estado` sigue en `pendiente`.",
        "Al reemplazar el `numeroFactura` por el de otra factura existente, la respuesta es 409 `CONFLICT`.",
        "Al reemplazar una factura inexistente o dada de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G3-06",
      nombre: "Dar de baja una factura",
      endpoint: "DELETE /api/v1/facturas/{id}",
      descripcion: "Da de baja lógica una factura, quitándola de los listados y consultas por id.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "No verifica si la factura tiene pagos asociados: una factura ya pagada también puede darse de baja.",
        "Distinto del 404 de RF-G3-03 (\"ya pagada\"): este endpoint da de baja la factura sin importar su `estado`.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una factura vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/facturas/[id]/route.ts`",
      criterios: [
        "Dada una factura vigente, al darla de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /facturas/{id}` sobre esa factura responde 404, y deja de aparecer en RF-G3-01.",
        "Dar de baja una factura ya pagada es aceptado igual (204), sin afectar los pagos ya registrados.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/facturas` — Listado de facturas",
        "Tabla con proveedor, número, importe, vencimiento y estado, con filtros por titular y por estado. Ejecuta RF-G3-01.",
      ],
      [
        "`/facturas/{id}` — Detalle de factura",
        "Muestra los datos de la factura y, cuando corresponde, el bloque \"Pagar factura\" con el selector de medio de pago. Ejecuta RF-G3-02 y RF-G3-03.",
      ],
    ],
    notas: [
      "Tras un pago exitoso la pantalla de detalle actualiza la factura en pantalla con el estado devuelto por la API, sin necesidad de recargar.",
      "El selector de medio de pago ofrece exactamente las tres opciones aceptadas por la API, de modo que el error de valor inválido solo puede provocarse llamando la API directamente.",
      "No hay pantalla de alta, edición ni baja de facturas: `POST`/`PUT`/`DELETE /facturas` (RF-G3-04/05/06) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), constancia de pago",
      expectativa:
        "El consumidor debe recibir comprobante del pago con importe, fecha y medio utilizado.",
      estado:
        "Cubierto: la respuesta devuelve el pago completo con importe, medio y fecha, y la web lo refleja en el detalle.",
    },
    {
      norma: "Ley 1334/98, prohibición de cobros indebidos",
      expectativa:
        "No debe cobrarse dos veces el mismo concepto ni un importe distinto al facturado.",
      estado:
        "Cubierto: el importe se toma de la factura y el bloqueo transaccional impide el doble pago de la misma factura.",
    },
    {
      norma: "Marco del BCP sobre medios de pago electrónicos",
      expectativa:
        "El medio de pago debe validarse y la operación debe poder rechazarse si el instrumento no es válido o no tiene fondos.",
      estado:
        "No implementado: el medio de pago es una etiqueta; el pago siempre se registra como procesado.",
    },
    {
      norma: "Ley 4868/2013 de Comercio Electrónico, información previa a la transacción",
      expectativa:
        "El usuario debe conocer el importe exacto y las condiciones antes de confirmar el pago.",
      estado:
        "Cubierto: el detalle de la factura muestra importe y vencimiento antes de habilitar el pago.",
    },
    {
      norma: "Reglas de mora y recargos de los prestadores de servicios",
      expectativa:
        "Una factura vencida debería liquidarse con los recargos correspondientes.",
      estado:
        "No implementado: pagar una factura vencida se registra por el importe original, sin recargo.",
    },
  ],

  brechas: [
    "El pago no valida la fecha de vencimiento ni calcula recargos: una factura vencida se paga por el importe original.",
    "El medio de pago no se verifica contra ninguna tarjeta o cuenta del titular; nunca hay pagos `fallidos` ni `pendientes` generados por la API.",
    "No existen pagos parciales ni anulación o reverso de un pago ya registrado.",
    "Una factura ya pagada devuelve el mismo 404 que una inexistente, lo que impide distinguir ambas situaciones desde la respuesta.",
    "El estado `vencida` nunca se asigna automáticamente: no hay proceso que marque como vencidas las facturas cuyo plazo expiró.",
    "El listado está limitado a 100 registros sin paginación.",
    "Dar de baja una factura (`DELETE`) no verifica sus pagos asociados ni bloquea si ya fue pagada.",
    "`PUT /facturas/{id}` permite reemplazar el `monto` de una factura ya pagada sin que eso reabra ni afecte el pago ya registrado en `pagos`.",
  ],
};
