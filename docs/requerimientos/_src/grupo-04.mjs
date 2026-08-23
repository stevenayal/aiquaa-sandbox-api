export const grupo = {
  n: 4,
  slug: "grupo-04-registro-de-usuario-onboarding",
  titulo: "Registro de Usuario / Onboarding",
  modulo: "Módulo: Alta de nuevo cliente (KYC básico)",

  alcance:
    "Cubre el CRUD completo de clientes (alta, listado, consulta, reemplazo y baja) y la actualización del estado de verificación de identidad (KYC). Es el módulo que da origen a todos los demás: el `usuarioId` que devuelve el alta es la entrada de cuentas, tarjetas, facturas, órdenes, reservas, notificaciones y roles.",
  fueraDeAlcance:
    "Carga de documentos respaldatorios, validación contra fuentes externas, puntaje de riesgo, y flujo de aprobación con revisor: el estado de KYC se fija directamente por API.",

  endpoints: [
    { ruta: "GET /api/v1/usuarios", rf: "RF-G4-04", desc: "Lista los clientes activos del sandbox." },
    { ruta: "POST /api/v1/usuarios", rf: "RF-G4-01", desc: "Da de alta un cliente nuevo con KYC pendiente." },
    { ruta: "GET /api/v1/usuarios/{id}", rf: "RF-G4-02", desc: "Devuelve la ficha de un cliente." },
    { ruta: "PUT /api/v1/usuarios/{id}", rf: "RF-G4-05", desc: "Reemplaza los datos de identificación de un cliente." },
    { ruta: "DELETE /api/v1/usuarios/{id}", rf: "RF-G4-06", desc: "Da de baja (soft-delete) un cliente." },
    { ruta: "PATCH /api/v1/usuarios/{id}/kyc", rf: "RF-G4-03", desc: "Actualiza el estado de verificación de identidad." },
  ],

  precondiciones: [
    "El email y el número de documento son únicos en todo el sandbox: cada ejecución de un escenario de alta debe generar valores nuevos (por ejemplo, con un sufijo aleatorio o la marca de tiempo), o el segundo intento fallará.",
    "El alta es la única operación del sandbox que puede ejecutarse desde la web con la sola API key, sin haber iniciado sesión como usuario de negocio.",
  ],

  tablas: [
    {
      nombre: "usuarios",
      desc: "Ficha del cliente. Este módulo la crea, la consulta y actualiza su estado de KYC.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`nombre`", "`text`, obligatorio"],
        ["`email`", "`text`, obligatorio y único en todo el sandbox"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`"],
        ["`documento_tipo`", "`text`, uno de `CI` / `pasaporte` / `RUC`; por defecto `CI`"],
        ["`documento_numero`", "`text`, obligatorio y único en todo el sandbox"],
        ["`fecha_nacimiento`", "`date`, opcional"],
        ["`direccion`", "`text`, opcional"],
        [
          "`kyc_estado`",
          "`text`, uno de `pendiente` / `verificado` / `rechazado`; por defecto `pendiente`",
        ],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
  ],

  notaDatos:
    "El alta no permite elegir el estado de KYC ni el estado de actividad: todo cliente nuevo nace con `kyc_estado = 'pendiente'` y `activo = true`. Como el login del Grupo 1 solo exige que el usuario esté activo, un cliente recién dado de alta puede iniciar sesión aunque su identidad no esté verificada.",

  rf: [
    {
      id: "RF-G4-01",
      nombre: "Dar de alta un cliente",
      endpoint: "POST /api/v1/usuarios",
      descripcion:
        "Registra un cliente nuevo con sus datos de identificación mínimos. El cliente queda operativo de inmediato, con su verificación de identidad pendiente.",
      entradas: [
        "`nombre` (obligatorio): texto no vacío.",
        "`email` (obligatorio): texto con formato de correo electrónico válido.",
        "`documentoTipo` (obligatorio): uno de `CI`, `pasaporte` o `RUC`.",
        "`documentoNumero` (obligatorio): texto no vacío.",
        "`fechaNacimiento` (opcional): fecha; si se omite se guarda vacía.",
        "`direccion` (opcional): texto libre; si se omite se guarda vacía.",
      ],
      reglas: [
        "El email y el número de documento deben ser únicos: un valor repetido es rechazado por la base de datos con `409 CONFLICT`.",
        "El cliente nuevo queda siempre con `kyc_estado = 'pendiente'` y `activo = true`; ninguno de los dos puede enviarse en el alta.",
        "El tipo de documento se limita a las tres opciones válidas, tanto en la entrada como en la base.",
        "La fecha de nacimiento no se valida contra ninguna edad mínima: se acepta cualquier fecha, incluso futura, mientras sea una fecha reconocible.",
        "No se valida coherencia entre el tipo y el formato del número de documento.",
      ],
      respuesta: [
        "`201 Created` con `data` conteniendo la ficha completa del cliente creado, incluido su `id` y su `kyc_estado` en `pendiente`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio, el email no tiene formato válido o el tipo de documento no está permitido."],
        ["`CONFLICT`", "409", "El email o el número de documento ya pertenecen a otro cliente."],
        ["`EXECUTION_ERROR`", "400", "La fecha de nacimiento no es una fecha válida."],
      ],
      fuente: "`app/api/v1/usuarios/route.ts`",
      criterios: [
        "Al dar de alta un cliente con datos válidos y únicos, la respuesta es 201, `data.id` es un número y `data.kyc_estado` es `pendiente`.",
        "El cliente creado queda con `activo = true`, por lo que puede iniciar sesión con RF-G1-01 usando el email registrado.",
        "Al dar de alta un cliente con un email ya existente, la respuesta es 409 `CONFLICT` y no se crea ninguna ficha.",
        "Al dar de alta un cliente con un número de documento ya existente, la respuesta es 409 `CONFLICT`, aunque el email sea nuevo.",
        "Al omitir el nombre, o al enviar un email sin formato válido, la respuesta es 400 `VALIDATION_ERROR`.",
        "Al enviar `documentoTipo=DNI`, la respuesta es 400 `VALIDATION_ERROR` porque el valor no pertenece a la lista permitida.",
        "El alta sin `fechaNacimiento` ni `direccion` es aceptada y esos campos quedan vacíos en la ficha.",
      ],
    },
    {
      id: "RF-G4-02",
      nombre: "Consultar la ficha de un cliente",
      endpoint: "GET /api/v1/usuarios/{id}",
      descripcion:
        "Devuelve la ficha completa de un cliente, incluidos sus datos de identificación y su estado de verificación.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve el cliente cuyo identificador coincide exactamente, siempre que siga `activo = true` (dado de baja con RF-G4-06 responde 404).",
        "Si no existe o ya está dado de baja, responde 404 con el mensaje \"Usuario no encontrado.\".",
        "La ficha se devuelve completa, sin enmascarar el número de documento.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la ficha completa del cliente."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un cliente con ese identificador, o ya está dado de baja."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/route.ts`",
      criterios: [
        "Dado el `id` devuelto por un alta, al consultar la ficha la respuesta es 200 y los datos coinciden con los enviados en el alta.",
        "Al consultar un identificador inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Usuario no encontrado.\".",
        "Al consultar la ficha de un cliente dado de baja con RF-G4-06, la respuesta es 404, no 200.",
      ],
    },
    {
      id: "RF-G4-03",
      nombre: "Actualizar el estado de verificación (KYC)",
      endpoint: "PATCH /api/v1/usuarios/{id}/kyc",
      descripcion:
        "Fija el estado de verificación de identidad de un cliente, para reflejar el resultado de la revisión de sus datos.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`kycEstado` (obligatorio, en el cuerpo): uno de `pendiente`, `verificado` o `rechazado`.",
      ],
      reglas: [
        "El estado enviado se escribe tal cual, sin verificar el estado anterior: **cualquier transición está permitida**, incluidas `verificado` → `pendiente` y `rechazado` → `verificado`.",
        "Fijar el mismo estado que ya tenía el cliente es aceptado y devuelve la ficha sin cambios visibles.",
        "El cambio de estado no altera `activo`: un cliente con KYC rechazado sigue pudiendo iniciar sesión y operar.",
        "Si el cliente no existe, la operación responde 404 y no modifica nada.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la ficha completa ya actualizada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un cliente con ese identificador (mensaje: \"Usuario no encontrado.\")."],
        ["`VALIDATION_ERROR`", "400", "`kycEstado` ausente o con un valor fuera de la lista permitida."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/kyc/route.ts`",
      criterios: [
        "Dado un cliente con KYC pendiente, al fijar `verificado` la respuesta es 200 y `data.kyc_estado` es `verificado`.",
        "Al consultar luego la ficha con RF-G4-02, el estado persiste como `verificado`.",
        "Al fijar `rechazado` sobre un cliente ya verificado, la respuesta es 200: el sistema no impide el retroceso.",
        "Un cliente con KYC `rechazado` sigue pudiendo iniciar sesión con RF-G1-01, porque el login solo mira `activo`.",
        "Al enviar `kycEstado=aprobado`, la respuesta es 400 `VALIDATION_ERROR` y el estado no cambia.",
        "Al actualizar el KYC de un cliente inexistente, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G4-04",
      nombre: "Listar clientes",
      endpoint: "GET /api/v1/usuarios",
      descripcion: "Devuelve la lista de clientes activos del sandbox.",
      entradas: ["No recibe parámetros de filtro."],
      reglas: [
        "Devuelve únicamente clientes con `activo = true`, ordenados por identificador ascendente, limitados a 100 registros.",
        "No admite filtro por `usuarioId`, `email`, `kycEstado` ni ningún otro campo: es un listado plano.",
      ],
      respuesta: ["`200 OK` con `data` como arreglo de fichas de cliente."],
      errores: [["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."]],
      fuente: "`app/api/v1/usuarios/route.ts`",
      criterios: [
        "Al listar clientes, la respuesta es 200 y `data` contiene como máximo 100 elementos.",
        "Un cliente recién dado de alta aparece en este listado.",
        "Un cliente dado de baja con RF-G4-06 deja de aparecer en este listado.",
      ],
    },
    {
      id: "RF-G4-05",
      nombre: "Reemplazar la ficha de un cliente",
      endpoint: "PUT /api/v1/usuarios/{id}",
      descripcion:
        "Reemplaza los datos de identificación de un cliente existente. El estado de KYC y el estado de actividad quedan fuera de este reemplazo.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`nombre` (obligatorio): texto no vacío.",
        "`email` (obligatorio): texto con formato de correo electrónico válido.",
        "`documentoTipo` (obligatorio): uno de `CI`, `pasaporte`, `RUC`.",
        "`documentoNumero` (obligatorio): texto no vacío.",
        "`fechaNacimiento` (opcional): fecha.",
        "`direccion` (opcional): texto libre.",
      ],
      reglas: [
        "Solo puede reemplazar un cliente con `activo = true`; uno dado de baja responde 404.",
        "`kycEstado` no forma parte del cuerpo: sigue gobernado exclusivamente por `PATCH .../kyc` (RF-G4-03).",
        "`activo` tampoco forma parte del cuerpo: darlo de baja sigue siendo exclusivo de `DELETE` (RF-G4-06).",
        "Reemplazar el `email` o el `documentoNumero` por uno usado en otro cliente es rechazado por unicidad.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la ficha ya actualizada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un cliente vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta un campo obligatorio o tiene un formato inválido."],
        ["`CONFLICT`", "409", "El nuevo `email` o `documentoNumero` ya pertenecen a otro cliente."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/route.ts`",
      criterios: [
        "Dado un cliente existente, al reemplazar su `direccion` la respuesta es 200 y el cambio se refleja al consultarlo.",
        "El `kyc_estado` del cliente no cambia por este reemplazo.",
        "Al reemplazar el `email` por el de otro cliente existente, la respuesta es 409 `CONFLICT`.",
        "Al reemplazar un cliente inexistente o dado de baja, la respuesta es 404 `NOT_FOUND`.",
      ],
    },
    {
      id: "RF-G4-06",
      nombre: "Dar de baja un cliente",
      endpoint: "DELETE /api/v1/usuarios/{id}",
      descripcion: "Da de baja lógica un cliente, quitándolo de los listados y consultas por id.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "No verifica si el cliente tiene cuentas, tarjetas, facturas, órdenes, reservas o roles asociados: todos esos recursos siguen existiendo y siendo consultables por su propio id después de la baja.",
        "Un cliente dado de baja por este endpoint ya no puede iniciar sesión: RF-G1-01 exige `activo = true`.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un cliente vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/route.ts`",
      criterios: [
        "Dado un cliente vigente, al darlo de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /usuarios/{id}` sobre ese cliente responde 404, y el login de RF-G1-01 con su email responde 400 (usuario no encontrado o inactivo).",
        "Dar de baja a un cliente no elimina ni oculta sus cuentas o tarjetas existentes, consultables por su propio id.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/usuarios/new` — Alta de cliente",
        "Formulario con nombre, email, tipo y número de documento, y los campos opcionales de fecha de nacimiento y dirección. Ejecuta RF-G4-01 y, al crearse la ficha, navega a su detalle.",
      ],
      [
        "`/usuarios/{id}` — Ficha del cliente",
        "Muestra los datos del cliente y el bloque \"Actualizar KYC\" con el selector de estado. Ejecuta RF-G4-02 y RF-G4-03.",
      ],
    ],
    notas: [
      "Las pantallas de este módulo son accesibles con solo la API key, sin usuario de negocio en sesión: son el punto de partida para conseguir un `usuarioId` con el que operar el resto de los módulos.",
      "Por esa razón, el enlace \"Usuarios\" aparece siempre en el menú, cualquiera sea el grupo del alumno.",
      "Tras actualizar el KYC, la ficha en pantalla se refresca con el estado devuelto por la API.",
      "No hay pantalla de listado, edición ni baja de clientes: `GET /usuarios` (lista), `PUT` y `DELETE /usuarios/{id}` (RF-G4-04/05/06) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Ley 1015/97 y sus modificatorias — debida diligencia del cliente (SEPRELAD, supervisión del BCP)",
      expectativa:
        "Identificación y verificación del cliente antes de habilitarlo a operar, con documentos respaldatorios.",
      estado:
        "Parcial: se registran tipo y número de documento, pero el cliente queda operativo con la verificación pendiente y sin respaldos.",
    },
    {
      norma: "Debida diligencia ampliada y perfil de riesgo del cliente",
      expectativa:
        "Clasificar al cliente por riesgo y restringir su operatoria mientras la verificación no esté aprobada.",
      estado:
        "No implementado: no hay perfil de riesgo, y un cliente con KYC pendiente o rechazado puede operar todos los módulos.",
    },
    {
      norma: "Ley 6534/2020 de protección de datos personales crediticios",
      expectativa:
        "Tratar los datos personales con finalidad determinada y limitar su exposición.",
      estado:
        "No implementado: la ficha se devuelve completa, con el número de documento sin enmascarar, a cualquier portador de una API key válida.",
    },
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), información al contratar",
      expectativa:
        "El cliente debe conocer qué datos se le solicitan y con qué finalidad al darse de alta.",
      estado:
        "Parcial: el formulario indica qué campos son obligatorios y cuáles opcionales, pero no hay aviso de privacidad ni consentimiento.",
    },
    {
      norma: "Capacidad legal para contratar",
      expectativa: "Verificar la edad mínima del titular antes del alta.",
      estado: "No implementado: la fecha de nacimiento es opcional y no se valida contra ninguna edad mínima.",
    },
  ],

  brechas: [
    "El estado de KYC puede moverse en cualquier dirección, sin máquina de estados ni registro de quién lo cambió ni cuándo.",
    "No existe traza de auditoría específica del cambio de KYC más allá de la bitácora general de requests.",
    "El KYC no condiciona ninguna otra operación del sandbox: no bloquea login, transferencias, tarjetas ni pagos.",
    "No hay verificación de unicidad previa al alta: el duplicado se descubre recién al insertar, aunque desde la actualización de CRUD ya se traduce a `409 CONFLICT` en vez de un `400` genérico.",
    "No se valida coherencia entre tipo y formato del documento (por ejemplo, un RUC con formato de cédula es aceptado).",
    "Dar de baja un cliente (`DELETE`) no verifica ni bloquea sus cuentas, tarjetas, facturas, órdenes, reservas ni roles asociados: todos siguen existiendo y siendo consultables por su propio id.",
    "El reemplazo (`PUT`) no valida coherencia entre `documentoTipo` y `documentoNumero`, igual que el alta.",
  ],
};
