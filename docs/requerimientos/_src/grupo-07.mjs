export const grupo = {
  n: 7,
  slug: "grupo-07-carrito-de-compras-ecommerce",
  titulo: "Carrito de Compras / E-commerce",
  modulo: "Módulo: Checkout de un e-commerce",

  alcance:
    "Cubre el cierre de compra: la creación de una orden a partir de un conjunto de ítems, el cálculo del importe total del lado del servidor y la consulta de la orden con su detalle. La orden y sus ítems se escriben dentro de una misma transacción.",
  fueraDeAlcance:
    "Catálogo de productos, control de existencias, carrito persistente antes del cierre, cupones y descuentos, costos de envío, cobro del importe y cambios de estado posteriores de la orden.",

  endpoints: [
    { ruta: "GET /api/v1/ordenes", rf: "RF-G7-01", desc: "Lista órdenes activas, opcionalmente filtradas por comprador." },
    { ruta: "POST /api/v1/ordenes", rf: "RF-G7-02", desc: "Cierra la compra: crea la orden con sus ítems." },
    { ruta: "GET /api/v1/ordenes/{id}", rf: "RF-G7-03", desc: "Devuelve una orden con el detalle de sus ítems." },
    { ruta: "PUT /api/v1/ordenes/{id}", rf: "RF-G7-04", desc: "Recalcula producto/monto de la orden a partir de ítems (no toca `items_orden`)." },
    { ruta: "DELETE /api/v1/ordenes/{id}", rf: "RF-G7-05", desc: "Da de baja (soft-delete) una orden." },
  ],

  precondiciones: [
    "El cierre de compra requiere un comprador existente; el `usuarioId` se obtiene del alta de cliente (RF-G4-01) o de los datos sembrados.",
    "Los importes de los ítems deben enviarse como números en el cuerpo JSON, no como texto entre comillas: este endpoint no convierte textos numéricos.",
  ],

  tablas: [
    {
      nombre: "ordenes",
      desc: "Cabecera de la compra: comprador, producto representativo, importe total y estado.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`producto`", "`text`, obligatorio; la API guarda el producto del primer ítem"],
        ["`monto`", "`numeric(10,2)`, obligatorio; lo calcula el servidor"],
        [
          "`estado`",
          "`text`, uno de `pendiente` / `pagada` / `enviada` / `cancelada`; por defecto `pendiente`",
        ],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; lo usan `GET`/`PUT`/`DELETE` para filtrar/operar"],
      ],
    },
    {
      nombre: "items_orden",
      desc: "Detalle de la compra: una fila por producto comprado.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`orden_id`", "`bigint`, obligatorio, referencia a `ordenes(id)`"],
        ["`producto`", "`text`, obligatorio"],
        ["`cantidad`", "`integer`, obligatorio, la base exige que sea mayor que cero"],
        ["`precio_unitario`", "`numeric(10,2)`, obligatorio"],
        ["`subtotal`", "`numeric(10,2)`, obligatorio; lo calcula el servidor"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
  ],

  notaDatos:
    "El importe total de la orden y el subtotal de cada ítem los calcula el servidor a partir de la cantidad y el precio unitario recibidos. Un total enviado por el cliente sería ignorado: no existe ese campo en la entrada.",

  rf: [
    {
      id: "RF-G7-01",
      nombre: "Listar órdenes",
      endpoint: "GET /api/v1/ordenes",
      descripcion:
        "Devuelve las órdenes del sandbox, con la posibilidad de acotar el resultado a un comprador determinado. La lista no incluye el detalle de ítems.",
      entradas: ["`usuarioId` (opcional, por query): número entero positivo."],
      reglas: [
        "Devuelve únicamente órdenes con `activo = true`; una dada de baja con RF-G7-05 deja de aparecer.",
        "Con `usuarioId`, devuelve todas las órdenes de ese comprador ordenadas por identificador ascendente.",
        "Sin `usuarioId`, devuelve las primeras 100 órdenes del sandbox.",
        "La respuesta contiene solo las cabeceras: para ver los ítems hay que consultar la orden puntual (RF-G7-03).",
        "Un comprador sin órdenes devuelve una lista vacía.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de órdenes, cada una con `id`, `usuario_id`, `producto`, `monto`, `estado` y `created_at`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/ordenes/route.ts`",
      criterios: [
        "Al listar órdenes filtrando por un comprador, todos los elementos devueltos tienen ese `usuario_id`.",
        "Los elementos del listado no incluyen el arreglo de ítems.",
        "Al filtrar por un comprador sin órdenes, la respuesta es 200 con `data` vacío.",
        "Una orden recién creada aparece en el listado de su comprador.",
      ],
    },
    {
      id: "RF-G7-02",
      nombre: "Cerrar la compra (checkout)",
      endpoint: "POST /api/v1/ordenes",
      descripcion:
        "Crea una orden a partir de la lista de ítems comprados. El sistema calcula los subtotales y el importe total, y guarda la cabecera y el detalle en una sola operación indivisible.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo del comprador.",
        "`items` (obligatorio): arreglo con al menos un elemento.",
        "`items[].producto` (obligatorio): texto no vacío.",
        "`items[].cantidad` (obligatorio): número entero mayor que cero, enviado como número.",
        "`items[].precioUnitario` (obligatorio): número mayor que cero, enviado como número.",
      ],
      reglas: [
        "El subtotal de cada ítem se calcula como cantidad por precio unitario; el cliente no lo envía.",
        "El importe total de la orden es la suma de los subtotales de todos los ítems: **nunca se confía en un total enviado por el cliente**.",
        "El campo `producto` de la cabecera se completa con el producto del primer ítem del arreglo, como resumen de la compra.",
        "La orden se crea siempre con `estado = 'pendiente'`.",
        "La cabecera y todos los ítems se escriben dentro de una misma transacción: si falla la inserción de un ítem, tampoco queda la orden.",
        "Una compra sin ítems es rechazada: el arreglo debe tener al menos un elemento.",
        "Cantidad y precio unitario deben ser números en el cuerpo JSON; enviados como texto entrecomillado, la compra se rechaza por validación.",
        "**No hay control de existencias, ni catálogo, ni precios de referencia:** el producto es texto libre y el precio lo fija quien compra.",
        "El cierre de compra no cobra el importe ni descuenta saldo de ninguna cuenta o tarjeta.",
      ],
      respuesta: [
        "`201 Created` con `data` conteniendo la orden creada y, dentro de la propiedad `items`, cada ítem con su `subtotal` ya calculado.",
      ],
      errores: [
        [
          "`VALIDATION_ERROR`",
          "400",
          "Falta `usuarioId`, el arreglo de ítems está vacío o ausente, un ítem tiene cantidad o precio no positivos o enviados como texto, o el comprador indicado no existe.",
        ],
        ["`EXECUTION_ERROR`", "400", "El importe total supera la capacidad numérica del campo `monto`."],
      ],
      fuente: "`app/api/v1/ordenes/route.ts`",
      criterios: [
        "Al cerrar una compra con dos ítems, la respuesta es 201 y `data.monto` es igual a la suma de cantidad por precio unitario de ambos ítems.",
        "Cada elemento de `data.items` trae su `subtotal` calculado por el servidor, coincidente con su cantidad por su precio unitario.",
        "El campo `data.producto` de la cabecera coincide con el producto del primer ítem enviado.",
        "La orden creada queda en estado `pendiente`.",
        "Al cerrar una compra con el arreglo de ítems vacío, la respuesta es 400 `VALIDATION_ERROR` y no se crea ninguna orden.",
        "Al enviar un ítem con cantidad cero o negativa, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al enviar la cantidad como texto (por ejemplo `\"2\"`), la respuesta es 400 `VALIDATION_ERROR`.",
        "Al cerrar la compra para un comprador inexistente, la respuesta es 400 `VALIDATION_ERROR` y no queda ni la cabecera ni ítem alguno.",
      ],
    },
    {
      id: "RF-G7-03",
      nombre: "Consultar una orden con su detalle",
      endpoint: "GET /api/v1/ordenes/{id}",
      descripcion:
        "Devuelve la cabecera de una orden junto con todos sus ítems, para verificar el contenido de la compra.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve la orden cuyo identificador coincide exactamente, junto con sus ítems ordenados por identificador ascendente.",
        "Si la orden no existe, responde 404 con el mensaje \"Orden no encontrada.\".",
        "Una orden sin ítems (posible solo en datos cargados a mano) devuelve la cabecera con un arreglo de ítems vacío.",
      ],
      respuesta: [
        "`200 OK` con `data` conteniendo los campos de la orden más la propiedad `items` con el detalle completo.",
      ],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una orden con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/ordenes/[id]/route.ts`",
      criterios: [
        "Dada una orden recién creada, al consultarla la respuesta es 200 y la cantidad de elementos de `data.items` coincide con la cantidad de ítems enviados en el cierre de compra.",
        "La suma de los subtotales de `data.items` es igual a `data.monto`.",
        "Al consultar una orden inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Orden no encontrada.\".",
        "El orden de los ítems devueltos es estable entre consultas sucesivas.",
      ],
    },
    {
      id: "RF-G7-04",
      nombre: "Recalcular una orden",
      endpoint: "PUT /api/v1/ordenes/{id}",
      descripcion:
        "Recalcula el producto representativo y el importe total de una orden a partir de una lista de ítems enviada de nuevo. **No modifica las filas de `items_orden`**: el rol `qa_api` no tiene permiso `DELETE`, así que no hay forma de reemplazar el detalle sin dejar filas huérfanas, y este endpoint no inserta ítems nuevos tampoco. Solo actualiza los dos campos propios de la cabecera.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`items` (obligatorio): arreglo con al menos un elemento, con la misma forma que en el checkout (`producto`, `cantidad`, `precioUnitario`).",
      ],
      reglas: [
        "El `monto` se recalcula como la suma de cantidad por precio unitario de los ítems enviados, igual que en el checkout.",
        "El `producto` de la cabecera se reemplaza por el del primer ítem del arreglo enviado.",
        "**Los ítems enviados nunca se guardan en `items_orden`:** tras este `PUT`, `GET /ordenes/{id}` sigue devolviendo el detalle de ítems original de la compra, que ya no coincide con el nuevo `monto` de la cabecera.",
        "Solo puede recalcular una orden con `activo = true`; una dada de baja responde 404.",
        "`estado` no forma parte del cuerpo: no cambia por este reemplazo.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la cabecera de la orden ya actualizada (sin la propiedad `items`)."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una orden vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta `items`, el arreglo está vacío, o algún ítem tiene cantidad o precio no positivos."],
      ],
      fuente: "`app/api/v1/ordenes/[id]/route.ts`",
      criterios: [
        "Dada una orden existente, al recalcularla con ítems distintos la respuesta es 200 y `data.monto` coincide con la suma de los nuevos ítems.",
        "Al consultar luego la orden con RF-G7-03, `data.items` sigue mostrando los ítems originales del checkout, no los enviados en el `PUT`, aunque `data.monto` ya sea el nuevo — una inconsistencia real a documentar, no a \"corregir\" en el escenario de prueba.",
        "Al recalcular con el arreglo de ítems vacío, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al recalcular una orden inexistente o dada de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G7-05",
      nombre: "Dar de baja una orden",
      endpoint: "DELETE /api/v1/ordenes/{id}",
      descripcion: "Da de baja lógica una orden, quitándola de los listados y consultas por id.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "No borra ni afecta las filas de `items_orden` asociadas: quedan huérfanas (ya no accesibles por `GET /ordenes/{id}`, que responde 404).",
        "Una orden en cualquier `estado` de negocio puede darse de baja.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una orden vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/ordenes/[id]/route.ts`",
      criterios: [
        "Dada una orden vigente, al darla de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /ordenes/{id}` sobre esa orden responde 404, y deja de aparecer en RF-G7-01.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/ordenes` — Listado de órdenes",
        "Tabla con producto, importe y estado, con filtro por comprador. Ejecuta RF-G7-01.",
      ],
      [
        "`/ordenes/new` — Nueva orden",
        "Formulario con el comprador y una tabla editable de ítems (producto, cantidad, precio unitario), donde se pueden agregar filas. Ejecuta RF-G7-02 y, al confirmarse, navega al detalle de la orden.",
      ],
      [
        "`/ordenes/{id}` — Detalle de la orden",
        "Muestra la cabecera y la tabla de ítems con su subtotal. Ejecuta RF-G7-03.",
      ],
    ],
    notas: [
      "El formulario convierte a número la cantidad y el precio antes de enviarlos, de modo que el error por enviarlos como texto solo puede provocarse llamando la API directamente.",
      "El total de la compra no se edita en la pantalla: se ve recién en el detalle, ya calculado por el servidor.",
      "No hay pantalla de edición ni baja: `PUT` y `DELETE /ordenes/{id}` (RF-G7-04/05) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Ley 4868/2013 de Comercio Electrónico, información previa y confirmación de la operación",
      expectativa:
        "Antes de confirmar, el consumidor debe conocer el detalle de lo que compra y el importe total; luego debe recibir constancia de la operación.",
      estado:
        "Cubierto: la respuesta del cierre de compra devuelve el detalle completo con subtotales y total, y el detalle de la orden queda consultable.",
    },
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), precio cierto y veraz",
      expectativa:
        "El precio cobrado debe corresponder al precio informado del producto ofertado.",
      estado:
        "No implementado: no hay catálogo ni precio de referencia; el precio unitario lo fija la propia request.",
    },
    {
      norma: "Ley 1334/98, garantía de disponibilidad del producto",
      expectativa:
        "No debe venderse un producto sin existencias disponibles.",
      estado: "No implementado: no hay control de existencias ni verificación de que el producto exista.",
    },
    {
      norma: "Ley 4868/2013, derecho de retracto y cancelación",
      expectativa:
        "El consumidor debe poder cancelar la compra dentro del plazo previsto.",
      estado:
        "No implementado: el estado `cancelada` existe en el modelo pero no hay endpoint que lo aplique.",
    },
    {
      norma: "Marco del BCP sobre pagos en comercio electrónico",
      expectativa:
        "El cobro debe realizarse con un instrumento de pago válido y quedar conciliado con la orden.",
      estado:
        "No implementado: el cierre de compra no cobra; la orden nunca pasa a `pagada`.",
    },
  ],

  brechas: [
    "No hay catálogo, existencias ni precios de referencia: producto y precio son datos libres de la request.",
    "La orden nace `pendiente` y no existe ningún endpoint que la mueva a `pagada`, `enviada` o `cancelada`.",
    "El cierre de compra no cobra el importe ni se vincula con tarjetas, cuentas ni pagos.",
    "El campo `producto` de la cabecera duplica el primer ítem, lo que puede inducir a error cuando la compra tiene varios productos distintos.",
    "No existen descuentos, impuestos ni costos de envío en el cálculo del total.",
    "El listado de órdenes está limitado a 100 registros sin paginación.",
    "`PUT /ordenes/{id}` recalcula `producto`/`monto` de la cabecera pero nunca toca `items_orden`: tras un reemplazo, el detalle de ítems que devuelve `GET /ordenes/{id}` queda desincronizado del nuevo monto.",
    "Dar de baja una orden (`DELETE`) no borra ni marca sus `items_orden`, que quedan huérfanos e inaccesibles desde la API.",
  ],
};
