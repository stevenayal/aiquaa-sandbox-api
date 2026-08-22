export const grupo = {
  n: 10,
  slug: "grupo-10-administracion-de-roles-y-permisos",
  titulo: "Administración de Roles y Permisos",
  modulo: "Módulo: Gestión de usuarios internos (backoffice)",

  alcance:
    "Cubre el catálogo de roles del backoffice y la asignación y revocación de roles a un usuario. La revocación es una baja lógica: la asignación permanece registrada y se reactiva si el rol vuelve a otorgarse.",
  fueraDeAlcance:
    "Definición de permisos concretos por rol, verificación de permisos al ejecutar operaciones, alta y baja de roles del catálogo, jerarquías y aprobación de asignaciones por un superior.",

  endpoints: [
    { ruta: "GET /api/v1/roles", rf: "RF-G10-01", desc: "Devuelve el catálogo completo de roles." },
    { ruta: "GET /api/v1/usuarios/{id}/roles", rf: "RF-G10-02", desc: "Lista los roles vigentes de un usuario." },
    { ruta: "POST /api/v1/usuarios/{id}/roles", rf: "RF-G10-03", desc: "Asigna un rol a un usuario, o reactiva una asignación revocada." },
    {
      ruta: "DELETE /api/v1/usuarios/{id}/roles/{roleId}",
      rf: "RF-G10-04",
      desc: "Revoca un rol de un usuario mediante baja lógica.",
    },
  ],

  precondiciones: [
    "El catálogo de roles es fijo y se carga con los datos sembrados: `admin`, `soporte`, `auditor` y `operador`. La API no permite crear ni eliminar roles.",
    "Un mismo usuario no puede tener dos asignaciones del mismo rol: la base lo impide con una restricción de unicidad, y la asignación la contempla reactivando la fila existente.",
  ],

  tablas: [
    {
      nombre: "roles",
      desc: "Catálogo de roles del backoffice. El módulo solo lo lee.",
      columnas: [
        ["`id`", "`bigserial`, clave primaria"],
        ["`nombre`", "`text`, único, uno de `admin` / `soporte` / `auditor` / `operador`"],
        ["`descripcion`", "`text`, opcional"],
        ["`created_at`", "`timestamptz`, por defecto `now()`"],
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
        "Devuelve el catálogo completo ordenado por identificador ascendente, sin filtros ni paginación.",
        "El catálogo es fijo: la API no permite crear, modificar ni eliminar roles.",
        "Los identificadores de rol que devuelve este endpoint son los que se usan para asignar y revocar.",
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
        "Volver a asignar un rol ya vigente es una operación aceptada, sin efecto observable.",
        "El usuario y el rol deben existir: si alguno no existe, la operación falla como error de ejecución por violación de clave foránea.",
        "**No se verifica quién asigna:** cualquier portador de una API key válida puede otorgar el rol `admin` a cualquier usuario.",
      ],
      respuesta: [
        "`201 Created` con `data` conteniendo la asignación resultante (`id`, `usuario_id`, `role_id`, `activo`, `asignado_en`). El estado es 201 tanto en el alta como en la reactivación.",
      ],
      errores: [
        ["`VALIDATION_ERROR`", "400", "Falta `roleId`, o alguno de los identificadores no es un entero positivo."],
        ["`EXECUTION_ERROR`", "400", "El usuario o el rol indicados no existen."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/roles/route.ts`",
      criterios: [
        "Al asignar un rol nuevo a un usuario, la respuesta es 201, `data.activo` es verdadero y el rol aparece en el listado de roles vigentes.",
        "Al asignar dos veces el mismo rol al mismo usuario, la segunda respuesta también es 201 y el listado sigue mostrando una única asignación de ese rol.",
        "Al revocar un rol y volver a asignarlo, la asignación conserva el mismo `id` que tenía antes de la revocación.",
        "Tras esa reactivación, `asignado_en` conserva la fecha del primer otorgamiento.",
        "Al asignar un `roleId` inexistente, la respuesta es 400 `EXECUTION_ERROR` y no se crea ninguna asignación.",
        "Al asignar un rol a un usuario inexistente, la respuesta es 400 `EXECUTION_ERROR`.",
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
        "Solo se revoca la asignación que corresponde exactamente a ese usuario y ese rol.",
        "Si el par usuario-rol nunca existió, la operación responde 404 con el mensaje \"Asignación de rol no encontrada.\".",
        "Revocar una asignación ya revocada devuelve 200: la fila existe, y se vuelve a marcar como no vigente.",
        "La revocación no elimina ningún dato del usuario ni afecta sus otros roles.",
      ],
      respuesta: ["`200 OK` con `data` conteniendo la asignación con `activo` en falso."],
      errores: [
        [
          "`NOT_FOUND`",
          "404",
          "No existe una asignación de ese rol para ese usuario (mensaje: \"Asignación de rol no encontrada.\").",
        ],
        ["`VALIDATION_ERROR`", "400", "Alguno de los identificadores no es un entero positivo."],
      ],
      fuente: "`app/api/v1/usuarios/[id]/roles/[roleId]/route.ts`",
      criterios: [
        "Dado un usuario con un rol vigente, al revocarlo la respuesta es 200 y `data.activo` es falso.",
        "Tras la revocación, el rol ya no aparece en el listado de roles vigentes del usuario.",
        "Al revocar dos veces el mismo rol, la segunda respuesta también es 200: la asignación sigue existiendo como fila.",
        "Al revocar un rol que el usuario nunca tuvo, la respuesta es 404 `NOT_FOUND` con el mensaje \"Asignación de rol no encontrada.\".",
        "Revocar un rol no afecta a los demás roles vigentes del usuario.",
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
        "Debe quedar registro de quién otorgó o revocó cada permiso y cuándo.",
      estado:
        "Parcial: la baja lógica conserva la asignación y toda request queda auditada, pero la asignación no guarda quién la ejecutó, y la fecha no se actualiza al reactivarla.",
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
    "El catálogo de roles es fijo: no hay alta, baja ni edición de roles, ni un modelo de permisos asociado.",
    "No hay vencimiento de asignaciones ni proceso de recertificación de accesos.",
  ],
};
