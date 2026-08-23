export const grupo = {
  n: 10,
  slug: "grupo-10-administracion-de-roles-y-permisos",
  titulo: "Administración de Roles y Permisos",
  modulo: "Módulo: Gestión de usuarios internos (backoffice)",

  alcance:
    "Cubre el CRUD del catálogo de roles del backoffice y la asignación y revocación de roles a un usuario. La revocación de una asignación es una baja lógica: la asignación permanece registrada y se reactiva si el rol vuelve a otorgarse.",
  fueraDeAlcance:
    "Definición de permisos concretos por rol, verificación de permisos al ejecutar operaciones, jerarquías y aprobación de asignaciones por un superior.",

  endpoints: [
    { ruta: "GET /api/v1/roles", rf: "RF-G10-01", desc: "Devuelve el catálogo de roles activos." },
    { ruta: "POST /api/v1/roles", rf: "RF-G10-05", desc: "Crea un rol nuevo (dentro de los 4 nombres permitidos)." },
    { ruta: "GET /api/v1/roles/{id}", rf: "RF-G10-06", desc: "Devuelve el detalle de un rol." },
    { ruta: "PUT /api/v1/roles/{id}", rf: "RF-G10-07", desc: "Reemplaza nombre y descripción de un rol." },
    { ruta: "DELETE /api/v1/roles/{id}", rf: "RF-G10-08", desc: "Da de baja (soft-delete) un rol del catálogo." },
    { ruta: "GET /api/v1/usuarios/{id}/roles", rf: "RF-G10-02", desc: "Lista los roles vigentes de un usuario." },
    { ruta: "POST /api/v1/usuarios/{id}/roles", rf: "RF-G10-03", desc: "Asigna un rol a un usuario, o reactiva una asignación revocada." },
    {
      ruta: "DELETE /api/v1/usuarios/{id}/roles/{roleId}",
      rf: "RF-G10-04",
      desc: "Revoca un rol de un usuario mediante baja lógica.",
    },
  ],

  precondiciones: [
    "El catálogo de roles solo admite cuatro nombres posibles (`admin`, `soporte`, `auditor`, `operador`, restringidos por una restricción `CHECK`), pero desde el CRUD la API sí permite crear, reemplazar y dar de baja filas del catálogo dentro de esos cuatro nombres.",
    "Un mismo usuario no puede tener dos asignaciones del mismo rol: la base lo impide con una restricción de unicidad, y la asignación la contempla reactivando la fila existente.",
  ],

  tablas: [
    {
      nombre: "roles",
      desc: "Catálogo de roles del backoffice. Desde el CRUD, el módulo también lo escribe.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        [
          "`nombre`",
          "`text`, **único** (restricción `UNIQUE` de tabla, no parcial), uno de `admin` / `soporte` / `auditor` / `operador`",
        ],
        ["`descripcion`", "`text`, opcional"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; lo usan `GET`/`PUT`/`DELETE` del catálogo"],
      ],
    },
    {
      nombre: "usuario_roles",
      desc: "Asignaciones de rol a usuario. Es la tabla que escribe el módulo.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`usuario_id`", "`bigint`, obligatorio, referencia a `usuarios(id)`"],
        ["`role_id`", "`bigint`, obligatorio, referencia a `roles(id)`"],
        ["`activo`", "`boolean`, obligatorio, por defecto `true`; es lo que distingue vigente de revocada"],
        ["`asignado_en`", "`timestamptz`, por defecto `now()`; **no** se actualiza al reactivar"],
        ["Restricción", "La combinación de usuario y rol es única: una sola fila por par"],
      ],
    },
  ],

  notaDatos:
    "El recurso `roles` de este módulo (permisos de backoffice) no tiene relación con el grupo de curso del alumno, que se consulta por separado con `GET /api/v1/roster?email=`. Son dos conceptos distintos que comparten un nombre parecido.",

  rf: [
    {
      id: "RF-G10-01",
      nombre: "Consultar el catálogo de roles",
      endpoint: "GET /api/v1/roles",
      descripcion:
        "Devuelve todos los roles disponibles para asignar, con su nombre y su descripción. Es también el endpoint más liviano de la API, por lo que la aplicación web lo usa para comprobar que una API key es válida.",
      entradas: ["No recibe parámetros."],
      reglas: [
        "Devuelve únicamente roles con `activo = true`, ordenados por identificador ascendente, sin filtros ni paginación.",
        "Un rol dado de baja con RF-G10-08 deja de aparecer aquí, aunque sus asignaciones existentes en `usuario_roles` no se ven afectadas.",
        "Los identificadores de rol que devuelve este endpoint son los que se usan para asignar y revocar en `/usuarios/{id}/roles`.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo de roles, cada uno con `id`, `nombre`, `descripcion` y `created_at`.",
      ],
      errores: [["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."]],
      fuente: "`app/api/v1/roles/route.ts`",
      criterios: [
        "Al consultar el catálogo con una API key válida, la respuesta es 200 y `data` contiene los cuatro roles del sandbox.",
        "Los nombres devueltos pertenecen al conjunto `admin`, `soporte`, `auditor` y `operador`.",
        "Al consultar el catálogo sin API key, la respuesta es 401 `UNAUTHORIZED`; este es el mismo control que usa la pantalla de acceso de la web para validar la clave.",
        "Consultas sucesivas devuelven el mismo catálogo: no hay endpoint que lo modifique.",
      ],
    },
    {
      id: "RF-G10-02",
      nombre: "Listar los roles vigentes de un usuario",
      endpoint: "GET /api/v1/usuarios/{id}/roles",
      descripcion:
        "Devuelve los roles actualmente vigentes de un usuario, con el nombre y la descripción de cada rol.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo del usuario."],
      reglas: [
        "Devuelve únicamente las asignaciones vigentes (`activo = true`): las revocadas quedan fuera del resultado.",
        "Cada elemento combina los datos de la asignación con el nombre y la descripción del rol.",
        "El resultado se ordena por identificador de asignación ascendente.",
        "Un usuario sin roles vigentes, y también un usuario inexistente, devuelven una lista vacía con estado 200: **este endpoint no distingue ambos casos**.",
      ],
      respuesta: [
        "`200 OK` con `data` como arreglo; cada elemento incluye `id`, `usuario_id`, `role_id`, `activo`, `asignado_en`, `nombre` y `descripcion`.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "El identificador de usuario no es un entero positivo."],
        ["`UNAUTHORIZED`", "401", "Falta la API key o es inválida."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/roles/route.ts`",
      criterios: [
        "Dado un usuario con un rol asignado, al listar sus roles la respuesta es 200 y el rol figura con `activo` en verdadero y su `nombre` resuelto.",
        "Tras revocar ese rol, el listado deja de incluirlo.",
        "Al listar los roles de un usuario inexistente, la respuesta es 200 con `data` vacío, no un 404.",
        "Al listar con un identificador no numérico, la respuesta es 400 `VALIDATION_ERROR`.",
      ],
    },
    {
      id: "RF-G10-03",
      nombre: "Asignar un rol a un usuario",
      endpoint: "POST /api/v1/usuarios/{id}/roles",
      descripcion:
        "Otorga un rol del catálogo a un usuario. Si ese rol ya le había sido otorgado y luego revocado, la asignación original se reactiva en lugar de crearse una nueva.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo del usuario.",
        "`roleId` (obligatorio, en el cuerpo): número entero positivo del rol.",
      ],
      reglas: [
        "Si el usuario no tenía ese rol, se crea la asignación con `activo = true`.",
        "Si ya existía una asignación de ese rol (vigente o revocada), la misma fila se marca como vigente: no se duplica y conserva su identificador original.",
        "Al reactivar, la fecha de asignación original **no** se actualiza: sigue reflejando el primer otorgamiento.",
        "**El código de estado distingue alta de reactivación:** `201` si la asignación es nueva, `200` si existía (vigente o revocada) y se reactivó. Internamente se usa el truco `xmax = 0` de Postgres sobre el `RETURNING` del `INSERT ... ON CONFLICT DO UPDATE` para saberlo con certeza, no una heurística.",
        "Volver a asignar un rol ya vigente es una operación aceptada, con estado 200 y sin efecto observable.",
        "El usuario y el rol deben existir: si alguno no existe, la operación falla por violación de clave foránea, que se traduce a `400 VALIDATION_ERROR`.",
        "**No se verifica quién asigna:** cualquier portador de una API key válida puede otorgar el rol `admin` a cualquier usuario.",
      ],
      respuesta: [
        "`201 Created` con `data` conteniendo la asignación resultante (`id`, `usuario_id`, `role_id`, `activo`, `asignado_en`) cuando la asignación es nueva.",
        "`200 OK` con el mismo `data` cuando la asignación ya existía y se reactivó (o ya estaba vigente).",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta `roleId`, alguno de los identificadores no es un entero positivo, o el usuario o el rol indicados no existen."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/roles/route.ts`",
      criterios: [
        "Al asignar un rol nuevo a un usuario, la respuesta es 201 y `data.activo` es verdadero.",
        "Al asignar dos veces el mismo rol al mismo usuario, la segunda respuesta es 200, no 201, y el listado sigue mostrando una única asignación de ese rol.",
        "Al revocar un rol y volver a asignarlo, la respuesta es 200 (reactivación) y la asignación conserva el mismo `id` que tenía antes de la revocación.",
        "Tras esa reactivación, `asignado_en` conserva la fecha del primer otorgamiento.",
        "Al asignar un `roleId` inexistente, la respuesta es 400 `VALIDATION_ERROR` y no se crea ninguna asignación.",
        "Al asignar un rol a un usuario inexistente, la respuesta es 400 `VALIDATION_ERROR`.",
      ],
    },
    {
      id: "RF-G10-04",
      nombre: "Revocar un rol de un usuario",
      endpoint: "DELETE /api/v1/usuarios/{id}/roles/{roleId}",
      descripcion:
        "Quita un rol a un usuario. La asignación no se borra: se marca como no vigente, de modo que quede registro de que existió.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo del usuario.",
        "`roleId` (obligatorio, en la ruta): número entero positivo del rol.",
      ],
      reglas: [
        "La revocación es una baja lógica: la fila permanece con `activo = false`. El sistema nunca borra físicamente la asignación.",
        "Solo se revoca la asignación que corresponde exactamente a ese usuario y ese rol, y que esté vigente (`activo = true`).",
        "Si el par usuario-rol nunca existió, la operación responde 404 con el mensaje \"Asignación de rol no encontrada.\".",
        "**Revocar una asignación ya revocada también responde 404, no 204**: la condición `AND activo = true` del `UPDATE` hace que la segunda revocación no encuentre ninguna fila para actualizar. A diferencia de asignar (RF-G10-03), revocar **no es idempotente**.",
        "La revocación no elimina ningún dato del usuario ni afecta sus otros roles.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        [
          "`NOT_FOUND`",
          "404",
          "No existe una asignación vigente de ese rol para ese usuario (nunca existió, o ya estaba revocada).",
        ],
        ["`VALIDATION_ERROR`", "400", "Alguno de los identificadores no es un entero positivo."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/roles/[roleId]/route.ts`",
      criterios: [
        "Dado un usuario con un rol vigente, al revocarlo la respuesta es 204 sin cuerpo.",
        "Tras la revocación, el rol ya no aparece en el listado de roles vigentes del usuario.",
        "Al revocar dos veces el mismo rol, la segunda respuesta es 404 `NOT_FOUND`, no 204: revocar no es idempotente.",
        "Al revocar un rol que el usuario nunca tuvo, la respuesta es 404 `NOT_FOUND` con el mensaje \"Asignación de rol no encontrada.\".",
        "Revocar un rol no afecta a los demás roles vigentes del usuario.",
      ],
    },
    {
      id: "RF-G10-05",
      nombre: "Crear un rol",
      endpoint: "POST /api/v1/roles",
      descripcion: "Agrega una fila al catálogo de roles, dentro de los cuatro nombres permitidos por la restricción `CHECK`.",
      entradas: [
        "`nombre` (obligatorio): uno de `admin`, `soporte`, `auditor`, `operador`.",
        "`descripcion` (opcional): texto libre.",
      ],
      reglas: [
        "`nombre` tiene una restricción `UNIQUE` de tabla completa (no parcial por `activo`): si ya existe una fila con ese nombre, **incluso si está dada de baja**, el alta es rechazada por duplicado.",
        "No hay forma de reemplazar los cuatro roles sembrados de fábrica salvo dándolos de baja primero (y entonces ese nombre queda inutilizable para un alta futura, ver brechas).",
      ],
      respuesta: ["`201 Created` con `data` conteniendo el rol creado."],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta `nombre`, o tiene un valor fuera de la lista permitida."],
        ["`CONFLICT`", "409", "Ya existe una fila con ese `nombre` (vigente o dada de baja)."],
      ],
      fuente: "`app/api/v1/roles/route.ts`",
      criterios: [
        "Si los cuatro nombres del catálogo sembrado siguen vigentes, crear cualquiera de ellos de nuevo responde 409 `CONFLICT`.",
        "Al crear con `nombre=supervisor`, la respuesta es 400 `VALIDATION_ERROR`.",
        "El rol creado aparece de inmediato en el listado de RF-G10-01.",
      ],
    },
    {
      id: "RF-G10-06",
      nombre: "Consultar un rol",
      endpoint: "GET /api/v1/roles/{id}",
      descripcion: "Devuelve el detalle de un rol puntual del catálogo.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Devuelve el rol cuyo identificador coincide exactamente, siempre que siga `activo = true`.",
        "Si no existe o ya está dado de baja, responde 404 con el mensaje \"Rol no encontrado.\".",
      ],
      respuesta: ["`200 OK` con `data` conteniendo el rol completo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un rol vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/roles/[id]/route.ts`",
      criterios: [
        "Dado un rol del catálogo sembrado, al consultarlo por su `id` la respuesta es 200.",
        "Al consultar un rol dado de baja, la respuesta es 404, aunque siga existiendo como fila en la base.",
      ],
    },
    {
      id: "RF-G10-07",
      nombre: "Reemplazar un rol",
      endpoint: "PUT /api/v1/roles/{id}",
      descripcion: "Reemplaza el nombre y la descripción de un rol existente del catálogo.",
      entradas: [
        "`id` (obligatorio, en la ruta): número entero positivo.",
        "`nombre` (obligatorio): uno de `admin`, `soporte`, `auditor`, `operador`.",
        "`descripcion` (opcional): texto libre.",
      ],
      reglas: [
        "Solo puede reemplazar un rol con `activo = true`; uno dado de baja responde 404 (y no hay forma de reactivarlo por este medio, porque la condición `AND activo = true` del `UPDATE` no encuentra la fila).",
        "Reemplazar el `nombre` por uno ya usado en otra fila (vigente o de baja) es rechazado por unicidad.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo el rol ya actualizado."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un rol vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "Falta `nombre` o tiene un valor fuera de la lista permitida."],
        ["`CONFLICT`", "409", "El nuevo `nombre` ya pertenece a otra fila del catálogo."],
      ],
      fuente: "`app/api/v1/roles/[id]/route.ts`",
      criterios: [
        "Dado un rol existente, al reemplazar su `descripcion` la respuesta es 200 y el cambio se refleja al consultarlo.",
        "Al reemplazar el `nombre` por el de otro rol existente, la respuesta es 409 `CONFLICT`.",
        "Al reemplazar un rol dado de baja, la respuesta es 404 `NOT_FOUND`: `PUT` no sirve para reactivarlo.",
      ],
    },
    {
      id: "RF-G10-08",
      nombre: "Dar de baja un rol",
      endpoint: "DELETE /api/v1/roles/{id}",
      descripcion: "Da de baja lógica un rol del catálogo.",
      entradas: ["`id` (obligatorio, en la ruta): número entero positivo."],
      reglas: [
        "Marca `activo = false`; la fila permanece en la base, nunca se borra físicamente.",
        "No verifica si el rol tiene asignaciones vigentes en `usuario_roles`: un rol con usuarios asignados puede darse de baja igual, y esas asignaciones siguen existiendo (el usuario sigue viendo el rol en RF-G10-02, aunque el rol ya no aparezca en el catálogo de RF-G10-01).",
        "**No existe forma de reactivar un rol dado de baja** (ni `PUT` ni ningún otro endpoint lo permite), y su `nombre` queda inutilizable para un alta futura por la restricción `UNIQUE` no parcial.",
      ],
      respuesta: ["`204 No Content`, sin cuerpo."],
      errores: [
        ["`NOT_FOUND`", "404", "No existe un rol vigente con ese identificador."],
        ["`VALIDATION_ERROR`", "400", "El identificador no es un entero positivo."],
      ],
      fuente: "`app/api/v1/roles/[id]/route.ts`",
      criterios: [
        "Dado un rol vigente sin usuarios asignados, al darlo de baja la respuesta es 204 sin cuerpo.",
        "Tras la baja, `GET /roles/{id}` responde 404 y el rol deja de aparecer en RF-G10-01.",
        "Dar de baja un rol con usuarios asignados no quita el rol del listado de roles vigentes de esos usuarios (RF-G10-02).",
        "Tras dar de baja el rol `operador`, crear un rol nuevo con `nombre=operador` responde 409 `CONFLICT`: el nombre queda inutilizable.",
      ],
    },
  ],

  web: {
    pantallas: [
      [
        "`/roles` — Roles del usuario",
        "Tabla con el catálogo de roles y, para cada uno, si está vigente para el usuario en sesión, con las acciones de asignar y revocar. Ejecuta los cuatro requerimientos del módulo.",
      ],
    ],
    notas: [
      "La pantalla opera siempre sobre el usuario que está en sesión: no hay selector de usuario, por lo que probar la asignación a otro usuario requiere llamar la API directamente.",
      "Después de asignar o revocar, la pantalla vuelve a consultar el estado y refleja el cambio sin recargar.",
      "El catálogo de roles es además la comprobación que hace la pantalla de acceso para validar una API key.",
      "No hay pantalla para el CRUD del catálogo: `POST /roles` y `GET`/`PUT`/`DELETE /roles/{id}` (RF-G10-05 a 08) solo se pueden ejercitar llamando la API directamente.",
    ],
  },

  anexo: [
    {
      norma: "Marco del BCP sobre control interno y seguridad de la información en entidades financieras",
      expectativa:
        "Los accesos privilegiados deben otorgarse bajo aprobación, con segregación de funciones y revisión periódica.",
      estado:
        "No implementado: cualquier portador de una API key válida puede otorgarse o quitar cualquier rol, sin aprobación ni segregación.",
    },
    {
      norma: "Principio de mínimo privilegio",
      expectativa:
        "Cada usuario debe tener únicamente los permisos necesarios para su función.",
      estado:
        "No implementado: los roles son etiquetas; ninguna operación del sandbox verifica el rol del usuario antes de ejecutarse.",
    },
    {
      norma: "Trazabilidad de altas y bajas de accesos",
      expectativa:
        "Debe quedar registro de quién otorgó o revocó cada permiso y cuándo, y el estado de éxito de la operación debe ser semánticamente correcto.",
      estado:
        "Parcial: la baja lógica conserva la asignación y toda request queda auditada, la asignación no guarda quién la ejecutó y la fecha no se actualiza al reactivarla, pero desde esta actualización sí se distingue correctamente alta (201) de reactivación (200), y la revocación devuelve el 204 estándar.",
    },
    {
      norma: "Ley 6534/2020 de protección de datos personales",
      expectativa:
        "El acceso a datos personales debe estar restringido según el rol del funcionario.",
      estado:
        "No implementado: todos los endpoints exponen los mismos datos a cualquier API key, con independencia de los roles asignados.",
    },
    {
      norma: "Revisión periódica de accesos (recertificación)",
      expectativa:
        "Los permisos vigentes deben revisarse periódicamente y revocarse los innecesarios.",
      estado:
        "Parcial: el listado de roles vigentes permite la revisión, pero no hay vencimiento ni proceso de recertificación.",
    },
  ],

  brechas: [
    "Los roles no otorgan ni restringen nada: ningún endpoint verifica el rol del usuario antes de operar.",
    "Cualquier API key válida puede asignar el rol `admin` a cualquier usuario, incluido a sí mismo.",
    "El listado de roles de un usuario inexistente devuelve una lista vacía con estado 200, en lugar de 404.",
    "La asignación no registra quién la realizó, y al reactivar una asignación revocada no se actualiza la fecha de otorgamiento.",
    "El catálogo de roles sigue sin un modelo de permisos asociado: crear un rol nuevo no le da ningún efecto sobre las operaciones de la API.",
    "No hay vencimiento de asignaciones ni proceso de recertificación de accesos.",
    "Un rol dado de baja no puede reactivarse por ningún medio, y su `nombre` queda inutilizable para siempre porque la restricción `UNIQUE` de `roles.nombre` no es parcial (no ignora las filas con `activo = false`).",
    "Dar de baja un rol no afecta ni notifica a los usuarios que ya lo tenían asignado: siguen viéndolo en `GET /usuarios/{id}/roles` aunque haya desaparecido del catálogo.",
    "A diferencia de la mayoría de los `DELETE` del sandbox, revocar una asignación de rol (RF-G10-04) no es idempotente: repetirlo da 404, no 204.",
  ],
};
