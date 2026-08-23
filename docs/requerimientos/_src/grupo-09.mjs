export const grupo = {
  n: 9,
  slug: "grupo-09-reportes-y-dashboard",
  titulo: "Reportes y Dashboard",
  modulo: "Módulo: Panel de control / reportes financieros",

  alcance:
    "Cubre los dos reportes agregados del sandbox sobre el libro de movimientos (desglose por tipo y resumen general) y, desde la incorporación del CRUD, el alta, consulta, reemplazo y baja de movimientos individuales sobre esa misma tabla.",
  fueraDeAlcance:
    "Exportación a archivo, gráficos, comparación entre períodos, agregados sobre otras tablas (transferencias, pagos, órdenes) y reportes por moneda: los reportes leen únicamente la tabla de movimientos.",

  endpoints: [
    {
      ruta: "GET /api/v1/reportes/movimientos",
      rf: "RF-G9-01",
      desc: "Desglose por tipo de movimiento, con cantidad y total, filtrable por titular y por rango de fechas.",
    },
    {
      ruta: "GET /api/v1/reportes/resumen",
      rf: "RF-G9-02",
      desc: "Resumen general: cantidad, total y fechas del primer y del último movimiento.",
    },
    { ruta: "GET /api/v1/movimientos", rf: "RF-G9-03", desc: "Lista movimientos activos, opcionalmente por titular." },
    { ruta: "POST /api/v1/movimientos", rf: "RF-G9-04", desc: "Crea un movimiento individual." },
    { ruta: "GET /api/v1/movimientos/{id}", rf: "RF-G9-05", desc: "Devuelve el detalle de un movimiento." },
    { ruta: "PUT /api/v1/movimientos/{id}", rf: "RF-G9-06", desc: "Reemplaza un movimiento existente." },
    { ruta: "DELETE /api/v1/movimientos/{id}", rf: "RF-G9-07", desc: "Da de baja (soft-delete) un movimiento." },
  ],

  precondiciones: [
    "Los reportes se calculan sobre la tabla `movimientos`, que se carga con los datos sembrados y, desde el CRUD, también con lo que cree `POST /movimientos`.",
    "Las fechas de los filtros se envían como texto en la URL y las interpreta la base de datos; el formato recomendado es `AAAA-MM-DD` o una marca de tiempo ISO 8601.",
    "**Los dos reportes (RF-G9-01/02) no se tocaron al agregar el CRUD y no filtran por `activo`:** agregan absolutamente todos los movimientos, incluidos los dados de baja con `DELETE /movimientos/{id}`. Un escenario que dé de baja un movimiento y espere verlo desaparecer del reporte fallará.",
  ],

  tablas: [
    {
      nombre: "movimientos",
      desc: "Libro de movimientos que atraviesa los distintos dominios del sandbox. Es la única fuente de los dos reportes.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        [
          "`tipo_movimiento`",
          "`text`, uno de `transferencia` / `pago_factura` / `compra_ecommerce` / `cargo_tarjeta`",
        ],
        ["`monto`", "`numeric(14,2)`, obligatorio"],
        [
          "`referencia_id`",
          "`bigint`, opcional y deliberadamente **sin** clave foránea: según el tipo, apunta a una transferencia, un pago, una orden o una tarjeta",
        ],
        ["`descripcion`", "`text`, opcional"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; lo usan `GET`/`PUT`/`DELETE` del CRUD (RF-G9-03/06/07) para filtrar/operar — **los reportes lo ignoran**"],
      ],
    },
  ],

  notaDatos:
    "La tabla de movimientos sigue sin alimentarse automáticamente: registrar una transferencia, pagar una factura o cerrar una compra **no** agrega un movimiento. Con el CRUD, un movimiento puede crearse a mano con `POST /movimientos` (RF-G9-04), pero eso tampoco enlaza con la operación real: `referenciaId` es un número libre que nadie valida contra la tabla que dice referenciar.",

  rf: [
    {
      id: "RF-G9-01",
      nombre: "Reporte de movimientos por tipo",
      endpoint: "GET /api/v1/reportes/movimientos",
      descripcion:
        "Devuelve, para cada tipo de movimiento, cuántos movimientos hay y cuál es su importe acumulado, sobre el universo que definen los filtros aplicados.",
      entradas: [
        "`usuarioId` (opcional, por query): número entero positivo.",
        "`desde` (opcional, por query): fecha de inicio del período; incluye los movimientos con fecha igual o posterior.",
        "`hasta` (opcional, por query): fecha de fin del período; incluye los movimientos con fecha igual o anterior.",
      ],
      reglas: [
        "Los tres filtros son opcionales y se combinan con Y lógico; sin ninguno, el reporte abarca todos los movimientos del sandbox.",
        "El resultado agrupa por `tipo_movimiento` y devuelve una fila por tipo presente en el universo filtrado, ordenada alfabéticamente por tipo.",
        "Un tipo de movimiento sin registros en el período **no aparece** con cantidad cero: simplemente no figura en el resultado.",
        "La cantidad se devuelve como número entero y el total como valor numérico exacto (texto con decimales).",
        "**Las fechas no se validan en la entrada:** viajan como texto y las interpreta la base de datos. Un texto no interpretable produce un error de ejecución.",
        "Tampoco se valida la coherencia del rango: enviar `desde` posterior a `hasta` es aceptado y devuelve un resultado vacío.",
        "No hay límite de filas ni paginación, porque la cantidad de tipos posibles es acotada.",
        "**Agrega también los movimientos dados de baja (`activo = false`)** con `DELETE /movimientos/{id}`: este reporte no filtra por esa columna.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de filas, cada una con `tipo_movimiento`, `cantidad` y `total`.",
        "Si ningún movimiento cumple los filtros, `data` es un arreglo vacío.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`EXECUTION_ERROR`", "400", "`desde` o `hasta` con un texto que la base no puede interpretar como fecha."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/reportes/movimientos/route.ts`",
      criterios: [
        "Al pedir el reporte sin filtros, la respuesta es 200 y cada elemento de `data` tiene `tipo_movimiento`, `cantidad` y `total`.",
        "Los tipos devueltos están ordenados alfabéticamente y no se repiten.",
        "Al filtrar por un titular, la suma de las cantidades del reporte coincide con la cantidad de movimientos de ese titular.",
        "Al acotar el período a un rango sin movimientos, la respuesta es 200 con `data` vacío.",
        "Al enviar `desde` posterior a `hasta`, la respuesta es 200 con `data` vacío, no un error.",
        "Al enviar `desde=ayer`, la respuesta es 400 `EXECUTION_ERROR`, porque la validación de fechas la hace la base de datos.",
        "Registrar una transferencia nueva no cambia el resultado del reporte: el libro de movimientos no se alimenta automáticamente.",
        "Dar de baja un movimiento con RF-G9-07 **no** lo saca de este reporte: sigue sumando en su `tipo_movimiento`.",
      ],
    },
    {
      id: "RF-G9-02",
      nombre: "Resumen general de movimientos",
      endpoint: "GET /api/v1/reportes/resumen",
      descripcion:
        "Devuelve los indicadores del panel de control: cuántos movimientos hay, cuánto suman, y las fechas del primero y del último.",
      entradas: ["`usuarioId` (opcional, por query): número entero positivo."],
      reglas: [
        "Con `usuarioId`, los indicadores se calculan sobre los movimientos de ese titular; sin él, sobre todos los movimientos del sandbox.",
        "Devuelve siempre un único objeto, nunca un arreglo.",
        "Si no hay movimientos que cumplan el filtro, `cantidad_movimientos` es cero, `total` es cero, y las fechas del primero y del último quedan vacías.",
        "El total se devuelve como cero (y no vacío) cuando no hay movimientos, para que el panel pueda mostrarlo sin conversiones.",
        "Este reporte no acepta filtros de fecha: siempre abarca toda la historia del titular.",
        "**Agrega también los movimientos dados de baja**, por la misma razón que RF-G9-01: no filtra por `activo`.",
      ],
      respuesta: [
        "`200 OK` con `data` conteniendo `cantidad_movimientos` (entero), `total` (numérico), `primero` (fecha del movimiento más antiguo) y `ultimo` (fecha del más reciente).",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/reportes/resumen/route.ts`",
      criterios: [
        "Al pedir el resumen sin filtro, la respuesta es 200 y `data` es un objeto con las cuatro propiedades del indicador.",
        "Al pedir el resumen de un titular con movimientos, `data.cantidad_movimientos` coincide con la suma de las cantidades del reporte por tipo del mismo titular.",
        "Al pedir el resumen de un titular sin movimientos, la respuesta es 200 con `cantidad_movimientos` en cero, `total` en cero y las fechas vacías.",
        "La fecha de `primero` nunca es posterior a la de `ultimo`.",
        "Al enviar `usuarioId=0`, la respuesta es 400 `VALIDATION_ERROR`.",
      ],
    },
    {
      id: "RF-G9-03",
      nombre: "Listar movimientos",
      endpoint: "GET /api/v1/movimientos",
      descripcion:
        "Devuelve los movimientos individuales del sandbox, con la posibilidad de acotar el resultado a un titular. Es el recurso CRUD genérico sobre la misma tabla que agregan los reportes de arriba.",
      entradas: ["`usuarioId` (opcional, por query): número entero positivo."],
      reglas: [
        "Devuelve únicamente movimientos con `activo = true`; uno dado de baja con RF-G9-07 deja de aparecer aquí (aunque siga contando en los reportes).",
        "Con `usuarioId`, devuelve todos los movimientos activos de ese titular ordenados por identificador ascendente; sin filtro, los primeros 100 del sandbox.",
      ],
      respuesta: ["`200 OK` con `data` como arreglo de movimientos."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/movimientos/route.ts`",
      criterios: [
        "Al listar movimientos filtrando por un titular, todos los elementos devueltos tienen ese `usuario_id`.",
        "Un movimiento dado de baja con RF-G9-07 deja de aparecer en este listado, aunque siga sumando en RF-G9-01/02.",
      ],
    },
    {
      id: "RF-G9-04",
      nombre: "Crear un movimiento",
      endpoint: "POST /api/v1/movimientos",
      descripcion:
        "Registra un movimiento individual en el libro, con su tipo, importe y una referencia opcional a la operación que lo originó.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo.",
        "`tipoMovimiento` (obligatorio): uno de `transferencia`, `pago_factura`, `compra_ecommerce`, `cargo_tarjeta`.",
        "`monto` (obligatorio): número mayor que cero.",
        "`referenciaId` (opcional): número entero positivo.",
        "`descripcion` (opcional): texto libre.",
      ],
      reglas: [
        "`referenciaId` **no tiene clave foránea**: acepta cualquier número entero positivo, exista o no como identificador en la tabla que el `tipoMovimiento` sugiere (transferencias, pagos, órdenes o tarjetas). No hay forma de que la base rechace una referencia inventada.",
        "El titular debe existir: un `usuarioId` inexistente falla como error de ejecución por violación de clave foránea.",
        "El movimiento creado aparece de inmediato en los reportes de RF-G9-01/02, sumando a su `tipo_movimiento`.",
      ],
      respuesta: ["`201 Created` con `data` conteniendo el movimiento creado."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, `tipoMovimiento` tiene un valor fuera de la lista permitida, o el `usuarioId` indicado no existe."],
      ],
      fuente: "`app/api/v1/movimientos/route.ts`",
      criterios: [
        "Al crear un movimiento con datos válidos, la respuesta es 201 y el movimiento aparece en el listado de RF-G9-03.",
        "Tras crearlo, el reporte de RF-G9-01 filtrado por ese titular incluye el nuevo movimiento en su `tipo_movimiento`.",
        "Al crear con un `referenciaId` que no corresponde a ninguna fila real, la operación es aceptada igual: no hay validación cruzada.",
        "Al crear con `tipoMovimiento=deposito`, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al crear para un `usuarioId` inexistente, la respuesta es 400 `VALIDATION_ERROR`.",
      ],
    },
    {
      id: "RF-G9-05",
      nombre: "Consultar un movimiento",
      endpoint: "GET /api/v1/movimientos/{id}",
      descripcion: "Devuelve el detalle de un movimiento puntual.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve el movimiento cuyo identificador coincide exactamente, siempre que siga `activo = true`.",
        "Si no existe o ya está dado de baja, responde 404 con el mensaje \"Movimiento no encontrado.\".",
      ],
      respuesta: ["`200 OK` con `data` conteniendo el movimiento completo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un movimiento vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/movimientos/[id]/route.ts`",
      criterios: [
        "Dado un movimiento creado con RF-G9-04, al consultarlo por su `id` la respuesta es 200 y los datos coinciden con los enviados.",
        "Al consultar un movimiento inexistente o dado de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G9-06",
      nombre: "Reemplazar un movimiento",
      endpoint: "PUT /api/v1/movimientos/{id}",
      descripcion: "Reemplaza el tipo, importe, referencia y descripción de un movimiento existente.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`tipoMovimiento` (obligatorio): uno de `transferencia`, `pago_factura`, `compra_ecommerce`, `cargo_tarjeta`.",
        "`monto` (obligatorio): número mayor que cero.",
        "`referenciaId` (opcional): número entero positivo.",
        "`descripcion` (opcional): texto libre.",
      ],
      reglas: [
        "Solo puede reemplazar un movimiento con `activo = true`; uno dado de baja responde 404.",
        "`usuarioId` no forma parte del cuerpo: el titular del movimiento no puede cambiarse por este reemplazo.",
        "El nuevo `monto` se refleja de inmediato en los reportes de RF-G9-01/02.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo el movimiento ya actualizado."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un movimiento vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio o tiene un valor fuera de la lista permitida."],
      ],
      fuente: "`app/api/v1/movimientos/[id]/route.ts`",
      criterios: [
        "Dado un movimiento existente, al reemplazar su `monto` la respuesta es 200 y el reporte de RF-G9-01 refleja el nuevo importe.",
        "Al reemplazar un movimiento inexistente o dado de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G9-07",
      nombre: "Dar de baja un movimiento",
      endpoint: "DELETE /api/v1/movimientos/{id}",
      descripcion:
        "Da de baja lógica un movimiento, quitándolo de los listados y consultas por id del CRUD. **No lo quita de los reportes**: RF-G9-01 y RF-G9-02 no filtran por `activo` y lo siguen sumando.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "Es la única baja del sandbox cuyo efecto es visible en el CRUD pero invisible en los reportes que agregan la misma tabla — una inconsistencia real, no un comportamiento a validar como correcto.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un movimiento vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/movimientos/[id]/route.ts`",
      criterios: [
        "Dado un movimiento vigente, al darlo de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /movimientos/{id}` responde 404 y el movimiento deja de aparecer en RF-G9-03.",
        "Tras la baja, el mismo movimiento **sigue sumando** en el reporte de RF-G9-01 y en el resumen de RF-G9-02 para ese titular.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/reportes` — Panel de control",
        "Una sola pantalla con filtros de titular, fecha desde y fecha hasta, la tarjeta de indicadores del resumen y la tabla del desglose por tipo de movimiento. Ejecuta RF-G9-01 y RF-G9-02.",
      ],
    ],
    notas: [
      "Los filtros de fecha aplican solo al desglose por tipo: el resumen general no los usa, porque el endpoint no los acepta.",
      "Con filtros que no arrojan resultados, la pantalla muestra el estado vacío en lugar de una tabla sin filas.",
      "No hay pantalla para el CRUD de movimientos: `GET`/`POST /movimientos` y `GET`/`PUT`/`DELETE /movimientos/{id}` (RF-G9-03 a 07) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Marco del BCP sobre información de operaciones al cliente",
      expectativa:
        "El cliente debe poder consultar el detalle y el resumen de sus operaciones por período.",
      estado:
        "Parcial: existe el desglose y el resumen, pero el resumen no admite acotar el período y el detalle operación por operación no se expone.",
    },
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), derecho a la información",
      expectativa:
        "La información debe ser cierta, clara y suficiente para que el consumidor entienda su actividad.",
      estado:
        "Parcial: los indicadores son claros, pero el libro de movimientos no refleja automáticamente las operaciones que el propio usuario realiza en el sandbox, y un movimiento dado de baja sigue apareciendo en los totales.",
    },
    {
      norma: "Integridad y trazabilidad de la información contable",
      expectativa:
        "Los agregados deben poder reconciliarse contra los registros de origen que los componen, y una baja debe excluirse de los totales.",
      estado:
        "No implementado: `referencia_id` no tiene clave foránea, no hay endpoint que permita ir del movimiento a la operación que lo originó, y dar de baja un movimiento no lo excluye de los reportes que lo agregan.",
    },
    {
      norma: "Ley 6534/2020 de protección de datos personales",
      expectativa: "Los reportes de un titular solo deben ser accesibles para ese titular.",
      estado:
        "No implementado: sin filtro, los reportes agregan la actividad de todos los titulares del sandbox.",
    },
    {
      norma: "Presentación de importes en moneda",
      expectativa: "Los totales deben expresarse indicando la moneda a la que corresponden.",
      estado:
        "No implementado: `movimientos` no tiene columna de moneda; los totales suman importes sin distinguirla.",
    },
  ],

  brechas: [
    "El libro de movimientos sigue sin alimentarse automáticamente con las operaciones del sandbox: transferencias, pagos y órdenes no generan movimientos por sí solas.",
    "**Los reportes (RF-G9-01/02) no filtran por `activo`: un movimiento dado de baja con `DELETE /movimientos/{id}` desaparece del CRUD pero sigue sumando en ambos reportes.** Es la inconsistencia más notable introducida por el CRUD y la más fácil de pasar por alto al automatizar escenarios.",
    "`referenciaId` no tiene clave foránea ni en el reporte ni en el CRUD: acepta cualquier número, exista o no la fila referenciada.",
    "Los filtros de fecha de los reportes no se validan en la entrada; un texto inválido llega hasta la base y se reporta como error de ejecución.",
    "El resumen no acepta rango de fechas, por lo que no puede compararse un período contra otro.",
    "Un tipo de movimiento sin registros no aparece con cantidad cero, lo que obliga al consumidor del reporte a completar los faltantes.",
    "No hay columna de moneda: los importes se suman sin distinguirla.",
    "No hay exportación ni paginación en los reportes.",
  ],
};
