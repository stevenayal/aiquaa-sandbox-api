# aiquaa Sandbox API

API sandbox en Next.js (App Router) para que los alumnos del curso de Automatización de
Pruebas de Software practiquen consumo de APIs REST y obtención de datos dinámicos vía
Postman. Se conecta a un schema aislado (`qa_training`) en Supabase Postgres, separado de
cualquier dato de producción.

Los alumnos envían SQL (`SELECT` o `UPDATE`) en el body de la request; el API valida el AST
antes de ejecutar — un único statement, tablas dentro de `qa_training`, placeholders
parametrizados (`$1, $2, ...`), y WHERE obligatorio en los UPDATE.

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
   `qa_reader` (solo SELECT), `qa_writer` (solo UPDATE+SELECT — ver nota abajo) y `app_meta`
   (bookkeeping interno), y las tablas `api_keys` / `sql_audit_log`. **Reemplaza las
   contraseñas `CHANGE_ME_...` antes de correrlo.** Si ya habías corrido una versión anterior
   del script (con solo 3 tablas), corré `DROP SCHEMA IF EXISTS qa_training CASCADE;` antes de
   re-ejecutarlo — es un sandbox sin datos de producción, y `seed-data.sql` trunca todo igual.
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

Alternativa desde la terminal (requiere `psql` y `DATABASE_URL_ADMIN` en el entorno):

```bash
npm run db:setup
npm run db:seed
```

### 3. Variables de entorno

```bash
cp .env.example .env.local
```

Completa `DATABASE_URL_READER` / `DATABASE_URL_WRITER` / `DATABASE_URL_META` con las
connection strings del **transaction pooler** de Supabase (puerto `6543`) para cada rol
creado en el paso anterior, y las credenciales de Upstash Redis.

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

### 4. Crear API keys para los alumnos

Inserta una fila en `public.api_keys` por alumno:

```sql
INSERT INTO public.api_keys (api_key, label) VALUES
  ('sbx_alumno01_xxxxxxxxxxxx', 'alumno01');
```

Distribuye cada `api_key` al alumno correspondiente — la usarán en el header `x-api-key`.

### 5. Instalar y correr localmente

```bash
npm install
npm run dev
```

### 6. Tests

```bash
npm test
```

### 7. Build (verificación de que está listo para Vercel)

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

## Colección Postman

Importa [`postman_collection.json`](./postman_collection.json), configura las variables de
colección `baseUrl` y `apiKey`, y corre los ejemplos de las carpetas SELECT / UPDATE / Docs.

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
