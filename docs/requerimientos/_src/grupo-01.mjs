export const grupo = {
  n: 1,
  slug: "grupo-01-autenticacion-y-acceso",
  titulo: "Autenticación y Acceso",
  modulo: "Módulo: Login / Logout / Recuperación de contraseña",

  alcance:
    "Cubre el ingreso y la salida de un usuario de negocio del sandbox y el circuito de recuperación de acceso. El sandbox no almacena contraseñas: la identidad se prueba con el email de un usuario existente y activo, y cada evento del circuito queda registrado como una fila de bitácora en la tabla `sesiones`.",
  fueraDeAlcance:
    "Verificación de contraseña, tokens de sesión, expiración, segundo factor y bloqueo por intentos fallidos: ninguno está implementado. La autenticación del canal es la API key, no el login de usuario.",

  endpoints: [
    { ruta: "POST /api/v1/auth/login", rf: "RF-G1-01", desc: "Valida el email de un usuario activo y registra el evento de login." },
    { ruta: "POST /api/v1/auth/logout", rf: "RF-G1-02", desc: "Registra el evento de cierre de sesión de un usuario." },
    { ruta: "POST /api/v1/auth/forgot-password", rf: "RF-G1-03", desc: "Registra la solicitud de recuperación de contraseña." },
    { ruta: "POST /api/v1/auth/reset-password", rf: "RF-G1-04", desc: "Registra el reseteo de contraseña como completado." },
  ],

  precondiciones: [
    "Los escenarios de login necesitan al menos un usuario con `activo = true` y otro con `activo = false` para cubrir el camino negativo; ambos existen en los datos sembrados.",
    "Los endpoints de logout y de reset completado identifican al usuario por `usuarioId` numérico, no por email.",
  ],

  tablas: [
    {
      nombre: "usuarios",
      desc: "Identidad de negocio. Este módulo solo lee de esta tabla; nunca la modifica.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`nombre`", "`text`, obligatorio"],
        ["`email`", "`text`, obligatorio y único"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`"],
        ["`kyc_estado`", "`text`, uno de `pendiente` / `verificado` / `rechazado`"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
    {
      nombre: "sesiones",
      desc: "Bitácora de eventos de acceso. Es el resultado observable de los cuatro requerimientos del módulo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        [
          "`tipo_evento`",
          "`text`, obligatorio, uno de `login` / `logout` / `password_reset_solicitado` / `password_reset_completado`",
        ],
        ["`exitoso`", "`boolean`, obligatorio, por defecto `true`"],
        ["`ip`", "`text`, opcional; la API la toma de los headers de la request"],
        ["`user_agent`", "`text`, opcional; la API no lo completa"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
      ],
    },
  ],

  notaDatos:
    "La API solo escribe filas con `exitoso = true`: un intento de login rechazado devuelve error pero **no** deja registro en `sesiones`. Un escenario que espere ver el intento fallido en la bitácora fallará.",

  rf: [
    {
      id: "RF-G1-01",
      nombre: "Iniciar sesión",
      endpoint: "POST /api/v1/auth/login",
      descripcion:
        "Permite iniciar sesión en el sandbox indicando el email de un usuario. Al ser aceptado, el sistema devuelve la identidad del usuario y registra el ingreso en la bitácora de sesiones.",
      entradas: [
        "`email` (obligatorio): texto con formato de correo electrónico válido. Un valor sin formato de email es rechazado antes de consultar la base de datos.",
      ],
      reglas: [
        "El sistema busca un único usuario cuyo `email` coincida exactamente con el enviado (la comparación distingue mayúsculas y minúsculas y no recorta espacios).",
        "El ingreso solo se acepta si el usuario existe **y** tiene `activo = true`.",
        "Un usuario inexistente y un usuario inactivo producen exactamente el mismo error, con el mismo mensaje: el sistema no revela cuál de las dos situaciones ocurrió.",
        "El rechazo se comunica como error de validación (HTTP 400), no como error de autenticación (HTTP 401), para no confundirlo con un problema de la API key.",
        "Aceptado el ingreso, se inserta una fila en `sesiones` con `tipo_evento = 'login'`, `exitoso = true` y la IP de origen de la request.",
      ],
      respuesta: [
        "`200 OK` con `data` conteniendo `id`, `nombre`, `email` y `activo` del usuario. No se devuelve token alguno.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "El email no existe o el usuario está inactivo (mensaje: \"Usuario no encontrado o inactivo.\")."],
        ["`VALIDATION_ERROR`", "400", "Falta el campo `email` o no tiene formato de correo válido."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/auth/login/route.ts`",
      criterios: [
        "Dado un usuario activo del sandbox, al iniciar sesión con su email la respuesta es 200 y `data.email` coincide con el email enviado.",
        "Tras un login exitoso, existe una nueva fila en `sesiones` para ese usuario con `tipo_evento = 'login'` y `exitoso = true`.",
        "Al iniciar sesión con el email de un usuario inactivo, la respuesta es 400 con código `VALIDATION_ERROR` y el mensaje \"Usuario no encontrado o inactivo.\".",
        "Al iniciar sesión con un email que no existe, la respuesta es idéntica a la del usuario inactivo (mismo código, mismo mensaje) y no se crea ninguna fila en `sesiones`.",
        "Al enviar un email sin formato válido, la respuesta es 400 `VALIDATION_ERROR` y el detalle indica el campo `email`.",
        "Al llamar el endpoint sin header `x-api-key`, la respuesta es 401 `UNAUTHORIZED`, aunque el email sea válido.",
      ],
    },
    {
      id: "RF-G1-02",
      nombre: "Cerrar sesión",
      endpoint: "POST /api/v1/auth/logout",
      descripcion:
        "Registra el cierre de sesión de un usuario identificado por su número interno. Es la contraparte del login en la bitácora.",
      entradas: [
        "`usuarioId` (obligatorio): número entero positivo. Se acepta también como texto numérico, que el sistema convierte.",
      ],
      reglas: [
        "El sistema verifica que exista un usuario con ese identificador; a diferencia del login, **no** exige que esté activo.",
        "Si el usuario existe, inserta una fila en `sesiones` con `tipo_evento = 'logout'`, `exitoso = true` y la IP de origen.",
        "La operación puede repetirse: cada llamada agrega una fila nueva a la bitácora, sin estado que impida el segundo cierre.",
      ],
      respuesta: [
        "`200 OK` con `data` conteniendo la fila de `sesiones` recién creada (incluye `id`, `usuario_id`, `tipo_evento`, `exitoso`, `ip` y `created_at`).",
      ],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un usuario con ese `usuarioId` (mensaje: \"Usuario no encontrado.\")."],
        ["`VALIDATION_ERROR`", "400", "`usuarioId` ausente, cero, negativo o no numérico."],
      ],
      fuente: "`app/api/v1/auth/logout/route.ts`",
      criterios: [
        "Dado un usuario existente, al cerrar sesión la respuesta es 200 y `data.tipo_evento` es `logout`.",
        "Al cerrar sesión dos veces seguidas para el mismo usuario, ambas respuestas son 200 y se crean dos filas distintas en `sesiones`.",
        "Al cerrar sesión con un `usuarioId` inexistente, la respuesta es 404 `NOT_FOUND` con el mensaje \"Usuario no encontrado.\".",
        "Al enviar `usuarioId` con valor cero o negativo, la respuesta es 400 `VALIDATION_ERROR`.",
        "El cierre de sesión de un usuario inactivo es aceptado y devuelve 200, a diferencia del login.",
      ],
    },
    {
      id: "RF-G1-03",
      nombre: "Solicitar recuperación de contraseña",
      endpoint: "POST /api/v1/auth/forgot-password",
      descripcion:
        "Registra que un usuario solicitó recuperar su acceso. El sandbox no genera ni envía ningún token: la solicitud queda asentada en la bitácora y habilita el paso de confirmación.",
      entradas: ["`email` (obligatorio): texto con formato de correo electrónico válido."],
      reglas: [
        "El sistema busca al usuario por email exacto.",
        "A diferencia del login, este endpoint **no** verifica que el usuario esté activo: un usuario inactivo puede solicitar la recuperación.",
        "Si el usuario no existe, la respuesta es un 404 explícito — es decir, el endpoint sí revela si un email está registrado.",
        "Si existe, se inserta una fila en `sesiones` con `tipo_evento = 'password_reset_solicitado'`, `exitoso = true` y la IP de origen.",
        "La fila devuelta contiene el `usuario_id`, que es el dato con el que después se confirma el reseteo (RF-G1-04).",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la fila de `sesiones` creada."],
      errores: [
        ["`NOT_FOUND`", "404", "El email no corresponde a ningún usuario (mensaje: \"Usuario no encontrado.\")."],
        ["`VALIDATION_ERROR`", "400", "Falta el campo `email` o no tiene formato de correo válido."],
      ],
      fuente: "`app/api/v1/auth/forgot-password/route.ts`",
      criterios: [
        "Dado un usuario registrado, al solicitar la recuperación la respuesta es 200 y `data.tipo_evento` es `password_reset_solicitado`.",
        "La respuesta incluye `data.usuario_id`, y ese valor permite completar el reseteo en el paso siguiente.",
        "Al solicitar la recuperación con un email inexistente, la respuesta es 404 `NOT_FOUND`; el contraste con el login (que devuelve 400 y no distingue) es una diferencia deliberada del sandbox.",
        "Un usuario inactivo puede solicitar la recuperación y obtiene 200.",
      ],
    },
    {
      id: "RF-G1-04",
      nombre: "Completar el reseteo de contraseña",
      endpoint: "POST /api/v1/auth/reset-password",
      descripcion:
        "Cierra el circuito de recuperación registrando que el reseteo se completó. No cambia ninguna credencial, porque el sandbox no las almacena.",
      entradas: ["`usuarioId` (obligatorio): número entero positivo."],
      reglas: [
        "El sistema verifica que el usuario exista; no exige que esté activo.",
        "No verifica que exista una solicitud previa (`password_reset_solicitado`): el reseteo puede completarse sin haberlo pedido.",
        "No hay token, ni verificación de vigencia, ni un solo uso: la operación puede repetirse tantas veces como se llame, agregando una fila por vez.",
        "Se inserta una fila en `sesiones` con `tipo_evento = 'password_reset_completado'`, `exitoso = true` y la IP de origen.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la fila de `sesiones` creada."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un usuario con ese `usuarioId` (mensaje: \"Usuario no encontrado.\")."],
        ["`VALIDATION_ERROR`", "400", "`usuarioId` ausente, cero, negativo o no numérico."],
      ],
      fuente: "`app/api/v1/auth/reset-password/route.ts`",
      criterios: [
        "Dado el `usuario_id` obtenido al solicitar la recuperación, al completar el reseteo la respuesta es 200 y `data.tipo_evento` es `password_reset_completado`.",
        "Al completar el reseteo sin haber solicitado antes la recuperación, la respuesta sigue siendo 200: el sistema no exige la solicitud previa.",
        "Al completar el reseteo con un `usuarioId` inexistente, la respuesta es 404 `NOT_FOUND`.",
        "Después de completar el reseteo, el usuario puede iniciar sesión con normalidad; el login no se ve afectado por el reseteo.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/login` — Acceso con API key",
        "Formulario de una sola entrada donde el alumno pega su API key. La clave se valida contra la API antes de guardarse; solo si la validación pasa se almacena y se habilita la navegación.",
      ],
      [
        "`/auth/login` — Ingreso de usuario",
        "Formulario de email que ejecuta RF-G1-01. Con el ingreso aceptado se guarda el usuario en la sesión local y se navega al inicio.",
      ],
      [
        "`/auth/login` — Bloque \"Recuperar acceso\"",
        "Se despliega con el enlace \"¿Olvidaste tu contraseña?\". Primero ejecuta RF-G1-03 con un email; cuando obtiene respuesta habilita el botón de confirmación, que ejecuta RF-G1-04 y muestra el mensaje de reseteo completado.",
      ],
      [
        "Barra de navegación — \"Cerrar sesión\"",
        "Ejecuta RF-G1-02 con el usuario en sesión y luego limpia la sesión local. Si la llamada al backend falla, la sesión local igual se cierra.",
      ],
    ],
    notas: [
      "El guard de la aplicación redirige a `/login` mientras no haya API key, y a `/auth/login` mientras no haya usuario de negocio; las rutas `/usuarios/*` son la única excepción a esta segunda barrera.",
      "El Grupo 1 no tiene un módulo propio en el menú: sus pantallas son las de acceso, comunes a todos los alumnos.",
      "Una respuesta 401 desde cualquier pantalla dispara el cierre de la sesión local y la vuelta a `/login`.",
    ],
  },

  anexo: [
    {
      norma: "Ley 1015/97 de prevención de lavado de dinero y sus modificatorias (marco supervisado por SEPRELAD y el BCP)",
      expectativa:
        "Identificación fehaciente del cliente antes de operar y trazabilidad de los accesos a los servicios financieros.",
      estado:
        "Parcial: existe bitácora de accesos con IP y fecha, pero la identificación se reduce a un email sin credencial ni segundo factor.",
    },
    {
      norma: "Marco del BCP sobre seguridad de canales electrónicos y banca digital",
      expectativa:
        "Autenticación robusta del usuario, control de intentos fallidos y bloqueo preventivo de la cuenta.",
      estado:
        "No implementado: no hay contraseña, ni conteo de intentos, ni bloqueo; los intentos rechazados ni siquiera se registran.",
    },
    {
      norma: "Ley 6534/2020 de protección de datos personales crediticios",
      expectativa:
        "Minimizar la exposición de datos personales y evitar que los mensajes de error confirmen la existencia de un titular.",
      estado:
        "Parcial: el login no distingue entre usuario inexistente e inactivo, pero la recuperación de contraseña sí devuelve 404 y revela si el email está registrado.",
    },
    {
      norma: "Ley 1334/98 de Defensa del Consumidor (SEDECO), deber de información",
      expectativa:
        "Mensajes de error claros y comprensibles para el usuario ante un rechazo de acceso.",
      estado:
        "Cubierto: la API devuelve mensajes en español y la web los muestra tal cual en el formulario correspondiente.",
    },
  ],

  brechas: [
    "No existe columna de contraseña ni almacenamiento de credenciales: el \"login\" es una validación de existencia y estado del usuario.",
    "Los intentos de acceso rechazados no se registran en `sesiones`, por lo que la bitácora no sirve para detectar ataques de fuerza bruta.",
    "El circuito de recuperación no emite token, no vence y no exige la solicitud previa: cualquier `usuarioId` válido puede marcarse como reseteado.",
    "`forgot-password` responde 404 ante un email desconocido, lo que permite enumerar usuarios registrados.",
    "La columna `user_agent` de `sesiones` existe pero la API nunca la completa.",
    "No hay cierre de sesión del lado del servidor: `logout` solo agrega una fila a la bitácora, sin invalidar nada.",
  ],
};
