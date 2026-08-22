export const grupo = {
  n: 8,
  slug: "grupo-08-reservas-y-turnos",
  titulo: "Reservas y Turnos",
  modulo: "Módulo: Sistema de reserva de citas",

  alcance:
    "Cubre la agenda de turnos: la creación de una reserva para un servicio en una fecha y hora determinadas, su consulta y las transiciones de confirmación y cancelación.",
  fueraDeAlcance:
    "Disponibilidad de agenda, duración del turno, control de solapamientos, recursos o profesionales asignados, recordatorios y reprogramación: la reserva es un registro libre sobre una fecha declarada.",

  endpoints: [
    { ruta: "GET /api/v1/reservas", rf: "RF-G8-01", desc: "Lista reservas, opcionalmente filtradas por titular." },
    { ruta: "POST /api/v1/reservas", rf: "RF-G8-02", desc: "Crea una reserva en estado pendiente." },
    { ruta: "PATCH /api/v1/reservas/{id}/confirmar", rf: "RF-G8-03", desc: "Confirma una reserva." },
    { ruta: "PATCH /api/v1/reservas/{id}/cancelar", rf: "RF-G8-04", desc: "Cancela una reserva." },
  ],

  precondiciones: [
    "La creación requiere un titular existente; el `usuarioId` se obtiene del alta de cliente (RF-G4-01) o de los datos sembrados.",
    "La fecha y hora conviene enviarla en formato ISO 8601 con zona horaria (por ejemplo `2026-09-01T14:30:00-03:00`), que es el formato que produce la pantalla web.",
  ],

  tablas: [
    {
      nombre: "reservas",
      desc: "Turnos agendados por un titular. Es la única tabla que toca el módulo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`servicio`", "`text`, obligatorio; texto libre"],
        ["`fecha_hora`", "`timestamptz`, obligatorio"],
        [
          "`estado`",
          "`text`, uno de `pendiente` / `confirmada` / `cancelada` / `completada`; por defecto `pendiente`",
        ],
        ["`notas`", "`text`, opcional"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
  ],

  notaDatos:
    "El estado `completada` existe en el modelo y aparece en los datos sembrados, pero ningún endpoint lo produce: no hay operación de cierre del turno.",

  rf: [
    {
      id: "RF-G8-01",
      nombre: "Listar reservas",
      endpoint: "GET /api/v1/reservas",
      descripcion:
        "Devuelve las reservas del sandbox, con la posibilidad de acotar el resultado a un titular determinado. Es la agenda sobre la que operan la confirmación y la cancelación.",
      entradas: ["`usuarioId` (opcional, por query): número entero positivo."],
      reglas: [
        "Con `usuarioId`, devuelve todas las reservas de ese titular ordenadas por identificador ascendente.",
        "Sin `usuarioId`, devuelve las primeras 100 reservas del sandbox.",
        "El listado incluye reservas en cualquier estado, incluidas las canceladas.",
        "No hay filtro por rango de fechas ni ordenamiento por fecha del turno: el orden es por identificador.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de reservas, cada una con `id`, `usuario_id`, `servicio`, `fecha_hora`, `estado`, `notas` y `created_at`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "`usuarioId` presente pero no numérico, cero o negativo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/reservas/route.ts`",
      criterios: [
        "Al listar reservas filtrando por un titular, todos los elementos devueltos tienen ese `usuario_id`.",
        "El listado incluye reservas canceladas junto a las pendientes y confirmadas.",
        "Al filtrar por un titular sin reservas, la respuesta es 200 con `data` vacío.",
        "Una reserva recién creada aparece en el listado de su titular.",
      ],
    },
    {
      id: "RF-G8-02",
      nombre: "Crear una reserva",
      endpoint: "POST /api/v1/reservas",
      descripcion:
        "Agenda un turno para un titular, sobre un servicio y una fecha y hora determinados. El turno queda pendiente de confirmación.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo del titular.",
        "`servicio` (obligatorio): texto no vacío; no está restringido a una lista de servicios.",
        "`fechaHora` (obligatorio): fecha y hora en formato ISO 8601 con zona horaria. La validación de entrada también admite cualquier texto no vacío, en cuyo caso la base de datos es la que decide si puede interpretarlo.",
        "`notas` (opcional): texto libre; si se omite se guarda vacío.",
      ],
      reglas: [
        "La reserva se crea siempre con `estado = 'pendiente'`; el cliente no puede elegir el estado inicial.",
        "**No se valida que la fecha sea futura:** se admite agendar un turno en el pasado.",
        "**No se valida disponibilidad ni solapamiento:** dos reservas del mismo servicio, a la misma hora y para el mismo titular son ambas aceptadas.",
        "El texto de fecha y hora que la base no logra interpretar produce un error de ejecución, no un error de validación.",
        "El titular debe existir: un `usuarioId` inexistente falla como error de ejecución por violación de clave foránea.",
      ],
      respuesta: ["`201 Created` con `data` conteniendo la reserva creada."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, o `servicio` o `fechaHora` están vacíos."],
        ["`EXECUTION_ERROR`", "400", "El titular no existe, o la fecha y hora enviadas no son interpretables como fecha."],
      ],
      fuente: "`app/api/v1/reservas/route.ts`",
      criterios: [
        "Al crear una reserva con datos válidos, la respuesta es 201 y `data.estado` es `pendiente`.",
        "La fecha y hora devueltas corresponden al instante enviado, expresadas con zona horaria.",
        "Al crear una reserva sin `notas`, la operación es aceptada y el campo queda vacío.",
        "Al crear una reserva con una fecha ya pasada, la respuesta es 201: el sandbox no valida la vigencia.",
        "Al crear dos reservas con el mismo servicio, titular y horario, ambas son aceptadas: no hay control de solapamiento.",
        "Al enviar `fechaHora` con un texto no interpretable como fecha, la respuesta es 400 `EXECUTION_ERROR`.",
        "Al crear una reserva para un `usuarioId` inexistente, la respuesta es 400 `EXECUTION_ERROR`.",
      ],
    },
    {
      id: "RF-G8-03",
      nombre: "Confirmar una reserva",
      endpoint: "PATCH /api/v1/reservas/{id}/confirmar",
      descripcion:
        "Confirma un turno agendado, dejándolo en firme.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo de la reserva."],
      reglas: [
        "El estado de la reserva pasa a `confirmada` sin verificar el estado anterior.",
        "La operación es idempotente: confirmar una reserva ya confirmada devuelve el mismo resultado.",
        "**Una reserva cancelada puede confirmarse**, porque no hay máquina de estados que lo impida.",
        "No se registra quién confirma ni cuándo se confirmó, más allá de la bitácora general de requests.",
        "Si la reserva no existe, responde 404 y no modifica nada.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la reserva ya confirmada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una reserva con ese identificador (mensaje: \"Reserva no encontrada.\")."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/reservas/[id]/confirmar/route.ts`",
      criterios: [
        "Dada una reserva pendiente, al confirmarla la respuesta es 200 y `data.estado` es `confirmada`.",
        "Al confirmar dos veces la misma reserva, ambas respuestas son 200 y el estado final es `confirmada`.",
        "Al confirmar una reserva previamente cancelada, la respuesta es 200 y la reserva vuelve a estar confirmada.",
        "Al confirmar una reserva inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Reserva no encontrada.\".",
      ],
    },
    {
      id: "RF-G8-04",
      nombre: "Cancelar una reserva",
      endpoint: "PATCH /api/v1/reservas/{id}/cancelar",
      descripcion: "Cancela un turno agendado, liberando la intención de asistir.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo de la reserva."],
      reglas: [
        "El estado de la reserva pasa a `cancelada` sin verificar el estado anterior.",
        "La operación es idempotente: cancelar una reserva ya cancelada devuelve el mismo resultado.",
        "La cancelación no borra la reserva: la fila permanece y sigue apareciendo en los listados.",
        "No hay plazo mínimo de antelación ni penalidad por cancelar: una reserva puede cancelarse en cualquier momento, incluso pasada su fecha.",
        "Si la reserva no existe, responde 404 y no modifica nada.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la reserva ya cancelada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe una reserva con ese identificador (mensaje: \"Reserva no encontrada.\")."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/reservas/[id]/cancelar/route.ts`",
      criterios: [
        "Dada una reserva confirmada, al cancelarla la respuesta es 200 y `data.estado` es `cancelada`.",
        "Tras la cancelación, la reserva sigue apareciendo en el listado del titular con estado `cancelada`.",
        "Al cancelar dos veces la misma reserva, ambas respuestas son 200.",
        "Al cancelar una reserva cuya fecha ya pasó, la respuesta es 200: no hay plazo que lo impida.",
        "Al cancelar una reserva inexistente, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/reservas` — Agenda",
        "Tabla con servicio, fecha y hora, notas y estado, con filtro por titular y botones de confirmar y cancelar por fila. Ejecuta RF-G8-01, RF-G8-03 y RF-G8-04.",
      ],
      [
        "`/reservas/new` — Nueva reserva",
        "Formulario con titular, servicio, fecha y hora y notas opcionales. Ejecuta RF-G8-02 y, al crearse, vuelve a la agenda.",
      ],
    ],
    notas: [
      "El campo de fecha y hora del formulario es un selector del navegador, que envía un valor con formato válido: los escenarios de fecha inválida requieren llamar la API directamente.",
      "Las acciones de confirmar y cancelar refrescan la agenda, de modo que el nuevo estado se ve sin recargar la página.",
    ],
  },

  anexo: [
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), constancia de la contratación",
      expectativa:
        "El consumidor debe recibir constancia del turno reservado con servicio, fecha y hora.",
      estado:
        "Cubierto: la respuesta devuelve la reserva completa y la agenda muestra el estado actualizado.",
    },
    {
      norma: "Ley 1334/98, condiciones de cancelación",
      expectativa:
        "Las condiciones, plazos y penalidades de cancelación deben informarse previamente y aplicarse de forma clara.",
      estado:
        "No implementado: la cancelación no tiene plazo ni penalidad, y las condiciones no forman parte del modelo.",
    },
    {
      norma: "Ley 4868/2013 de Comercio Electrónico, confirmación de la operación",
      expectativa:
        "La confirmación del turno debe ser un acto verificable y trazable.",
      estado:
        "Parcial: existe la operación de confirmación y queda auditada como request, pero no se registra quién confirmó ni cuándo dentro de la reserva.",
    },
    {
      norma: "Buenas prácticas de agenda de servicios",
      expectativa:
        "El sistema debe impedir turnos superpuestos y turnos en horarios no disponibles.",
      estado:
        "No implementado: no hay disponibilidad, duración ni control de solapamiento.",
    },
    {
      norma: "Ley 6534/2020 de protección de datos personales",
      expectativa:
        "Los datos de la agenda de un titular solo deben ser accesibles para ese titular.",
      estado:
        "No implementado: el listado sin filtro devuelve reservas de todos los titulares y cualquiera puede confirmarlas o cancelarlas.",
    },
  ],

  brechas: [
    "Las transiciones de estado no validan el estado previo: una reserva cancelada puede volver a confirmarse.",
    "El estado `completada` nunca se produce por API.",
    "No se valida que la fecha del turno sea futura ni que haya disponibilidad; no existe control de solapamiento.",
    "El campo `servicio` es texto libre, sin catálogo de servicios ofrecidos.",
    "No hay recordatorios ni notificaciones asociadas a la reserva, pese a que el sandbox tiene un módulo de notificaciones.",
    "El listado no admite filtro por fecha ni por estado, y está limitado a 100 registros sin paginación.",
  ],
};
