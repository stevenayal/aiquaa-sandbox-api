# aiquaa Sandbox API

API sandbox en Next.js (App Router) para que los alumnos del curso de Automatización de
Pruebas de Software practiquen consumo de APIs REST y obtención de datos dinámicos vía
Postman. Se conecta a un schema aislado (`qa_training`) en Supabase Postgres, separado de
cualquier dato de producción.

Hay dos superficies, pensadas para objetivos distintos:

- **Sandbox de SQL crudo** (`/api/v1/sql/select`, `/api/v1/sql/update`): los alumnos envían SQL
  en el body de la request; el API valida el AST antes de ejecutar — un único statement, tablas
  dentro de `qa_training`, placeholders parametrizados (`$1, $2, ...`), y WHERE obligatorio en
  los UPDATE.
- **Endpoints REST fijos, por grupo/producto** (`/api/v1/auth/login`, `/api/v1/transferencias`,
  etc. — ver [Endpoints REST](#endpoints-rest-por-grupo)): una API REST realista, con SQL fijo
  escrito de antemano, para que los alumnos practiquen **automatización de tests** (BDD/Gherkin)
  contra rutas de recursos en vez de escribir SQL a mano.

## Stack

Next.js 14+ (App Router) · TypeScript estricto · `pg` (node-postgres) · `node-sql-parser` ·
Zod · Scalar (docs UI, vía CDN — ver nota en `app/docs/route.ts`) · Upstash Redis (rate limiting) · Vitest.

## Setup

### 1. Crear el proyecto en Supabase

Crea (o reusa) un proyecto de Supabase Postgres.

### 2. Ejecutar los scripts SQL

Vía el SQL Editor de Supabase (o `psql`), en orden:

1. `scripts/setup-db.sql` — crea el schema `qa_training` con las 15 tablas (una o más por
   cada uno de los 10 grupos del curso, ver sección de tablas más abajo), los roles
   `qa_reader` (solo SELECT), `qa_writer` (solo UPDATE+SELECT — ver nota abajo), `qa_api`
   (SELECT+INSERT+UPDATE, sin DELETE — ver nota abajo) y `app_meta` (bookkeeping interno), y
   las tablas `api_keys` / `sql_audit_log`. **Reemplaza las contraseñas `CHANGE_ME_...` antes
   de correrlo.** Si ya habías corrido una versión anterior del script (con solo 3 tablas),
   corré `DROP SCHEMA IF EXISTS qa_training CASCADE;` antes de re-ejecutarlo — es un sandbox
   sin datos de producción, y `seed-data.sql` trunca todo igual.
2. `scripts/seed-data.sql` — datos de ejemplo determinísticos para las 15 tablas.

> **Ya aplicado en el proyecto `hocryhxndegslzfiwlnx` ("aiquaa-test-management")** vía el MCP
> de Supabase — schema, roles, RLS y seed data ya están cargados y verificados con una
> conexión real (SELECT/UPDATE de punta a punta). Estos pasos son para replicar en otro
> proyecto Supabase si hiciera falta.
>
> **Nota sobre `qa_writer`**: además de UPDATE necesita SELECT — Postgres lo exige para poder
> resolver el WHERE/RETURNING de cualquier UPDATE (que en este API siempre lleva WHERE). Sin
> ese grant, todo UPDATE falla con "permission denied". Además, la RLS policy de `qa_writer`
> es `FOR ALL` (no solo `FOR UPDATE`): Postgres necesita que el rol también "vea" la fila
> (equivalente a una policy de SELECT) para poder actualizarla, o ve 0 filas incluso con el
> GRANT correcto. El GRANT de tabla (solo SELECT+UPDATE, sin INSERT/DELETE) sigue limitando
> qué puede hacer en la práctica.
>
> **Nota sobre `qa_api`**: es un rol separado de `qa_reader`/`qa_writer`, usado **solo** por
> los endpoints REST de SQL fijo (nunca por el sandbox de SQL crudo que escriben los alumnos).
> Tiene SELECT+INSERT+UPDATE, sin DELETE (las rutas `DELETE` del API, como revocar un rol,
> hacen soft-delete vía UPDATE). Un INSERT sobre una PK `bigserial` llama a `nextval()` sobre
> la secuencia — sin `GRANT USAGE, SELECT ON ALL SEQUENCES ... TO qa_api` cada INSERT falla con
> "permission denied for sequence ...", aunque el GRANT de tabla esté bien.

Alternativa desde la terminal (requiere `psql` y `DATABASE_URL_ADMIN` en el entorno):

```bash
npm run db:setup
npm run db:seed
```

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Completa `DATABASE_URL_READER` / `DATABASE_URL_WRITER` / `DATABASE_URL_API` /
`DATABASE_URL_META` con las connection strings del **transaction pooler** de Supabase (puerto
`6543`) para cada rol creado en el paso anterior, y las credenciales de Upstash Redis.

Detalles verificados con conexiones reales contra `hocryhxndegslzfiwlnx`, incluyendo un test
real contra el deploy de Vercel (ver comentarios en `.env.example`):

- **Usá siempre el pooler, nunca la conexión directa** (`db.<project-ref>.supabase.co`) en
  producción. La conexión directa de este proyecto es **IPv6-only** (sin registro A, solo
  AAAA) — anduvo bien en pruebas locales (entorno con salida IPv6) pero falló en Vercel con
  `getaddrinfo ENOTFOUND`, porque las funciones serverless de Vercel no tienen salida IPv6.
- **Host del pooler**: `aws-<N>-<region>.pooler.supabase.com` — el número de cluster (`N`) es
  específico de cada proyecto, **no asumas que es `aws-0`**. Para este proyecto es
  `aws-1-us-east-1`; `aws-0-us-east-1` dio "tenant/user not found". Si te pasa lo mismo, probá
  otro número de cluster o sacá el host exacto de Dashboard → Project Settings → Connect →
  "Transaction pooler".
- **Username**: a través del pooler es obligatorio el sufijo `<rol>.<project-ref>` (ej.
  `qa_reader.hocryhxndegslzfiwlnx`), no el rol pelado.
- **Password**: es el password del rol Postgres (definido en `setup-db.sql`, o el de
  `postgres` reseteable en Project Settings → Database), **no** las keys `anon`/`service_role`
  de la API — esas son para el SDK/PostgREST, no sirven para conectar directo a Postgres.
- **No le agregues `?sslmode=require` a la URL.** `lib/db.ts` ya pasa
  `ssl: { rejectUnauthorized: false }` al Pool (y desde este commit lo sanitiza igual si se
  cuela), pero versiones recientes de `pg-connection-string` tratan `sslmode=require` como
  alias de `verify-full`, que gana sobre esa config y rompe con "self-signed certificate in
  certificate chain" contra el pooler de Supabase. Confirmado con una conexión real.

### 4. Crear API keys para los alumnos

Inserta una fila en `public.api_keys` por alumno:

```sql
INSERT INTO public.api_keys (api_key, label) VALUES
  ('sbx_alumno01_xxxxxxxxxxxx', 'alumno01');
```

Distribuye cada `api_key` al alumno correspondiente — la usarán en el header `x-api-key`.

### 5. Sembrar el roster (opcional, para el frontend)

`public.roster` mapea el email real de cada alumno a su grupo de curso (1-10) — lo usa
`aiquaa-sandbox-web` para filtrar el menú y saludar por nombre real. Es data personal real:
**no se commitea a este repo** (es público en GitHub), se siembra a mano una vez:

```sql
INSERT INTO public.roster (nombre, email, grupo) VALUES
  ('Nombre Apellido', 'alumno@email.com', 1);
```

Sin filas en `roster`, `GET /api/v1/roster?email=...` devuelve `404` para cualquier email —
el frontend cae de vuelta a mostrar los 10 módulos completos (sin filtrar), así que este paso
es opcional.

### 6. Instalar y correr localmente

```bash
npm install
npm run dev
```

### 7. Tests

```bash
npm test
```

### 8. Build (verificación de que está listo para Vercel)

```bash
npm run build
```

## Deploy en Vercel

Configura las mismas variables de `.env.example` en el dashboard de Vercel (Project
Settings → Environment Variables) y despliega. Las rutas de SQL corren en runtime Node.js
(`export const runtime = "nodejs"`) — `pg` y `node-sql-parser` no funcionan en Edge.

## Endpoints

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/v1/sql/select` | POST | Ejecuta un statement SELECT |
| `/api/v1/sql/update` | POST | Ejecuta un statement UPDATE (WHERE obligatorio) |
| `/api/v1/docs` | GET | Spec OpenAPI en JSON |
| `/docs` | — | UI interactiva (Scalar) sobre el spec |

Todas las requests a `/sql/*` requieren el header `x-api-key` y tienen un límite de 30
requests/minuto por key.

### Body

```json
{ "sql": "SELECT * FROM usuarios WHERE id = $1", "params": [1] }
```

### Respuesta exitosa

```json
{ "data": [ { "id": 1, "nombre": "Ana Torres" } ], "rowCount": 1 }
```

### Respuesta de error

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

## Endpoints REST por grupo

Rutas REST fijas (rol `qa_api`), organizadas por recurso — pensadas para que cada grupo
automatice tests (BDD/Gherkin) contra su propio módulo, sin escribir SQL. Todas requieren el
header `x-api-key` y comparten el mismo límite de 30 requests/minuto por key. Body en JSON;
query/path params se coercionan automáticamente (ej. `?usuarioId=1` → `number`).

| Grupo | Módulo | Método + Ruta | Descripción |
|---|---|---|---|
| 1 | Autenticación y Acceso | `POST /api/v1/auth/login` | Valida email de usuario activo, registra sesión |
| 1 | Autenticación y Acceso | `POST /api/v1/auth/logout` | Registra evento de logout |
| 1 | Autenticación y Acceso | `POST /api/v1/auth/forgot-password` | Registra solicitud de reset |
| 1 | Autenticación y Acceso | `POST /api/v1/auth/reset-password` | Registra reset completado |
| 2 | Transferencias entre Cuentas | `GET /api/v1/cuentas` | Lista cuentas (`?usuarioId=`) |
| 2 | Transferencias entre Cuentas | `GET /api/v1/cuentas/{id}` | Obtiene una cuenta |
| 2 | Transferencias entre Cuentas | `POST /api/v1/transferencias` | Crea transferencia (`estado='pendiente'`) |
| 2 | Transferencias entre Cuentas | `GET /api/v1/transferencias/{id}` | Obtiene una transferencia |
| 3 | Pagos de Servicios | `GET /api/v1/facturas` | Lista facturas (`?usuarioId=&estado=`) |
| 3 | Pagos de Servicios | `GET /api/v1/facturas/{id}` | Obtiene una factura |
| 3 | Pagos de Servicios | `POST /api/v1/facturas/{id}/pagar` | Paga una factura (transacción: pago + estado) |
| 4 | Registro de Usuario / Onboarding | `POST /api/v1/usuarios` | Crea usuario (`kyc_estado='pendiente'`) |
| 4 | Registro de Usuario / Onboarding | `GET /api/v1/usuarios/{id}` | Obtiene un usuario |
| 4 | Registro de Usuario / Onboarding | `PATCH /api/v1/usuarios/{id}/kyc` | Actualiza `kyc_estado` |
| 5 | Tarjetas de Crédito/Débito | `GET /api/v1/tarjetas` | Lista tarjetas (`?usuarioId=`) |
| 5 | Tarjetas de Crédito/Débito | `POST /api/v1/tarjetas` | Emite tarjeta (`estado='activa'`) |
| 5 | Tarjetas de Crédito/Débito | `PATCH /api/v1/tarjetas/{id}/bloquear` | Bloquea tarjeta |
| 5 | Tarjetas de Crédito/Débito | `PATCH /api/v1/tarjetas/{id}/activar` | Activa tarjeta |
| 6 | Notificaciones y Alertas | `GET /api/v1/notificaciones` | Lista notificaciones (`?usuarioId=&leido=`) |
| 6 | Notificaciones y Alertas | `POST /api/v1/notificaciones` | Crea notificación |
| 6 | Notificaciones y Alertas | `PATCH /api/v1/notificaciones/{id}/leer` | Marca como leída |
| 7 | Carrito de Compras / E-commerce | `GET /api/v1/ordenes` | Lista órdenes (`?usuarioId=`) |
| 7 | Carrito de Compras / E-commerce | `POST /api/v1/ordenes` | Checkout (transacción: orden + items) |
| 7 | Carrito de Compras / E-commerce | `GET /api/v1/ordenes/{id}` | Obtiene orden con items |
| 8 | Reservas / Turnos | `GET /api/v1/reservas` | Lista reservas (`?usuarioId=`) |
| 8 | Reservas / Turnos | `POST /api/v1/reservas` | Crea reserva (`estado='pendiente'`) |
| 8 | Reservas / Turnos | `PATCH /api/v1/reservas/{id}/confirmar` | Confirma reserva |
| 8 | Reservas / Turnos | `PATCH /api/v1/reservas/{id}/cancelar` | Cancela reserva |
| 9 | Reportes y Dashboard | `GET /api/v1/reportes/movimientos` | Agregado por tipo (`?usuarioId=&desde=&hasta=`) |
| 9 | Reportes y Dashboard | `GET /api/v1/reportes/resumen` | Resumen (count/sum/min/max) (`?usuarioId=`) |
| 10 | Administración de Roles y Permisos | `GET /api/v1/roles` | Lista los 4 roles disponibles |
| 10 | Administración de Roles y Permisos | `GET /api/v1/usuarios/{id}/roles` | Lista roles activos de un usuario |
| 10 | Administración de Roles y Permisos | `POST /api/v1/usuarios/{id}/roles` | Asigna rol (upsert) |
| 10 | Administración de Roles y Permisos | `DELETE /api/v1/usuarios/{id}/roles/{roleId}` | Revoca rol (soft-delete) |

Detalle completo de cada ruta (schemas de request/response, códigos de error) en `/docs`.

Además de las 29 rutas de arriba, `GET /api/v1/roster?email=` (fuera del catálogo por grupo)
devuelve el grupo de curso asignado a un email real de alumno — ver sección 5 más arriba.

## Colección Postman

Importa [`postman_collection.json`](./postman_collection.json), configura las variables de
colección `baseUrl` y `apiKey`, y corre los ejemplos: las carpetas `Grupo N - ...` (sandbox de
SQL crudo) y las carpetas `REST - Grupo N - ...` (endpoints REST fijos).

## Tablas de práctica (`qa_training`)

Las 15 tablas cubren los 10 módulos del curso (`inscripcion-grupos-bdd2.xlsx`); cada grupo
tiene al menos una tabla "propia" para practicar SELECT/UPDATE, aunque todos los alumnos
pueden consultar las 15 vía los mismos roles `qa_reader`/`qa_writer`.

| Tabla | Columnas | Grupo(s) |
|---|---|---|
| `usuarios` | `id, nombre, email, activo, documento_tipo, documento_numero, fecha_nacimiento, direccion, kyc_estado, created_at` | 1 (Auth) y 4 (Onboarding/KYC) |
| `sesiones` | `id, usuario_id, tipo_evento, exitoso, ip, user_agent, created_at` | 1 (Autenticación y Acceso) |
| `cuentas` | `id, usuario_id, numero_cuenta, tipo_cuenta, moneda, saldo, activa, created_at` | 2 (Transferencias entre Cuentas) |
| `transferencias` | `id, cuenta_origen_id, cuenta_destino_id, monto, descripcion, estado, created_at` | 2 (Transferencias entre Cuentas) |
| `facturas` | `id, usuario_id, proveedor, numero_factura, monto, fecha_vencimiento, estado, created_at` | 3 (Pagos de Servicios) |
| `pagos` | `id, factura_id, usuario_id, monto, metodo_pago, estado, created_at` | 3 (Pagos de Servicios) |
| `tarjetas` | `id, usuario_id, tipo, marca, numero_enmascarado, limite_credito, saldo_actual, estado, created_at` | 5 (Tarjetas de Crédito/Débito) |
| `notificaciones` | `id, usuario_id, canal, asunto, mensaje, leido, estado, created_at` | 6 (Notificaciones y Alertas) |
| `ordenes` | `id, usuario_id, producto, monto, estado, created_at` | 7 (Carrito de Compras / E-commerce) |
| `items_orden` | `id, orden_id, producto, cantidad, precio_unitario, subtotal, created_at` | 7 (Carrito de Compras / E-commerce) |
| `reservas` | `id, usuario_id, servicio, fecha_hora, estado, notas, created_at` | 8 (Reservas / Turnos) |
| `movimientos` | `id, usuario_id, tipo_movimiento, monto, referencia_id, descripcion, created_at` | 9 (Reportes y Dashboard — agregaciones) |
| `roles` | `id, nombre, descripcion, created_at` | 10 (Administración de Roles y Permisos) |
| `usuario_roles` | `id, usuario_id, role_id, activo, asignado_en` | 10 (Administración de Roles y Permisos) |
| `tickets` | `id, usuario_id, orden_id, asunto, estado, prioridad, created_at` | Soporte general, sin grupo asignado |
