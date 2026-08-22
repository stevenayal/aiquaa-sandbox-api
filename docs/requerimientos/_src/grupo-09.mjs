export const grupo = {
  n: 9,
  slug: "grupo-09-reportes-y-dashboard",
  titulo: "Reportes y Dashboard",
  modulo: "Módulo: Panel de control / reportes financieros",

  alcance:
    "Cubre los dos reportes agregados del sandbox sobre el libro de movimientos: el desglose por tipo de movimiento y el resumen general de actividad. Ambos aceptan filtros y devuelven valores calculados por la base de datos, no listados de registros.",
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
  ],

  precondiciones: [
    "Los reportes se calculan sobre la tabla `movimientos`, que se carga con los datos sembrados. Ninguna operación de los demás módulos escribe en ella: el volumen de datos es estable entre ejecuciones.",
    "Las fechas de los filtros se envían como texto en la URL y las interpreta la base de datos; el formato recomendado es `AAAA-MM-DD` o una marca de tiempo ISO 8601.",
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
      ],
    },
  ],

  notaDatos:
    "La tabla de movimientos no se alimenta automáticamente: registrar una transferencia, pagar una factura o cerrar una compra **no** agrega un movimiento. Los reportes reflejan únicamente lo sembrado, por lo que un escenario no debe esperar que sus propias operaciones alteren los totales.",

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
        "Parcial: los indicadores son claros, pero el libro de movimientos no refleja las operaciones que el propio usuario realiza en el sandbox.",
    },
    {
      norma: "Integridad y trazabilidad de la información contable",
      expectativa:
        "Los agregados deben poder reconciliarse contra los registros de origen que los componen.",
      estado:
        "No implementado: `referencia_id` no tiene clave foránea y no hay endpoint que permita ir del movimiento a la operación que lo originó.",
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
    "El libro de movimientos no se alimenta con las operaciones del sandbox: transferencias, pagos y órdenes no generan movimientos.",
    "Los filtros de fecha no se validan en la entrada; un texto inválido llega hasta la base y se reporta como error de ejecución.",
    "El resumen no acepta rango de fechas, por lo que no puede compararse un período contra otro.",
    "Un tipo de movimiento sin registros no aparece con cantidad cero, lo que obliga al consumidor del reporte a completar los faltantes.",
    "No hay columna de moneda: los importes se suman sin distinguirla.",
    "No hay exportación ni paginación, y `referencia_id` no permite navegar hasta la operación de origen.",
  ],
};
