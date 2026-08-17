-- =============================================================================
-- aiquaa-sandbox-api: setup-db.sql
--
-- Run ONCE per Supabase project via the SQL Editor (or `psql`), as the
-- Postgres superuser/owner. NOT executed by the application itself.
--
-- IMPORTANT: replace every 'CHANGE_ME_...' password below before running,
-- then copy the final values into your Vercel / .env.local environment
-- variables. Never commit real passwords to git.
--
-- If you already ran an earlier version of this script against this
-- project (before the qa_training schema covered all 10 course-group
-- modules), `CREATE TABLE IF NOT EXISTS` will NOT retrofit the new KYC
-- columns onto an existing `usuarios` table. Since this is a training
-- sandbox with no production data, the simplest fix is to drop and
-- recreate the schema first:
--   DROP SCHEMA IF EXISTS qa_training CASCADE;
-- (re-run seed-data.sql afterwards either way, since it truncates everything.)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Isolated training schema + tables — one (or more) per course-group module
--
-- Grupo 1  Autenticación y Acceso            -> usuarios, sesiones
-- Grupo 2  Transferencias entre Cuentas      -> cuentas, transferencias
-- Grupo 3  Pagos de Servicios                -> facturas, pagos
-- Grupo 4  Registro de Usuario / Onboarding  -> usuarios (columnas KYC)
-- Grupo 5  Tarjetas de Crédito/Débito        -> tarjetas
-- Grupo 6  Notificaciones y Alertas          -> notificaciones
-- Grupo 7  Carrito de Compras / E-commerce   -> ordenes, items_orden
-- Grupo 8  Reservas / Turnos                 -> reservas
-- Grupo 9  Reportes y Dashboard              -> movimientos (+ agregados sobre el resto)
-- Grupo 10 Administración de Roles           -> roles, usuario_roles
-- (sin grupo, soporte general)               -> tickets
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS qa_training;

CREATE TABLE IF NOT EXISTS qa_training.usuarios (
  id                bigserial PRIMARY KEY,
  nombre            text NOT NULL,
  email             text NOT NULL UNIQUE,
  activo            boolean NOT NULL DEFAULT true,
  documento_tipo    text NOT NULL DEFAULT 'CI'
                    CHECK (documento_tipo IN ('CI', 'pasaporte', 'RUC')),
  documento_numero  text NOT NULL UNIQUE,
  fecha_nacimiento  date,
  direccion         text,
  kyc_estado        text NOT NULL DEFAULT 'pendiente'
                    CHECK (kyc_estado IN ('pendiente', 'verificado', 'rechazado')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.sesiones (
  id           bigserial PRIMARY KEY,
  usuario_id   bigint NOT NULL REFERENCES qa_training.usuarios (id),
  tipo_evento  text NOT NULL
               CHECK (tipo_evento IN (
                 'login', 'logout', 'password_reset_solicitado', 'password_reset_completado'
               )),
  exitoso      boolean NOT NULL DEFAULT true,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.cuentas (
  id             bigserial PRIMARY KEY,
  usuario_id     bigint NOT NULL REFERENCES qa_training.usuarios (id),
  numero_cuenta  text NOT NULL UNIQUE,
  tipo_cuenta    text NOT NULL DEFAULT 'ahorro'
                 CHECK (tipo_cuenta IN ('ahorro', 'corriente')),
  moneda         text NOT NULL DEFAULT 'PYG'
                 CHECK (moneda IN ('PYG', 'USD')),
  saldo          numeric(14, 2) NOT NULL DEFAULT 0,
  activa         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.transferencias (
  id                 bigserial PRIMARY KEY,
  cuenta_origen_id   bigint NOT NULL REFERENCES qa_training.cuentas (id),
  cuenta_destino_id  bigint NOT NULL REFERENCES qa_training.cuentas (id)
                     CHECK (cuenta_destino_id <> cuenta_origen_id),
  monto              numeric(14, 2) NOT NULL CHECK (monto > 0),
  descripcion        text,
  estado             text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'completada', 'rechazada')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.facturas (
  id                 bigserial PRIMARY KEY,
  usuario_id         bigint NOT NULL REFERENCES qa_training.usuarios (id),
  proveedor          text NOT NULL
                     CHECK (proveedor IN ('ANDE', 'ESSAP', 'COPACO', 'Tigo', 'Personal')),
  numero_factura     text NOT NULL UNIQUE,
  monto              numeric(12, 2) NOT NULL,
  fecha_vencimiento  date NOT NULL,
  estado             text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'pagada', 'vencida')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.pagos (
  id            bigserial PRIMARY KEY,
  factura_id    bigint NOT NULL REFERENCES qa_training.facturas (id),
  usuario_id    bigint NOT NULL REFERENCES qa_training.usuarios (id),
  monto         numeric(12, 2) NOT NULL,
  metodo_pago   text NOT NULL DEFAULT 'tarjeta'
                CHECK (metodo_pago IN ('tarjeta', 'cuenta', 'efectivo')),
  estado        text NOT NULL DEFAULT 'procesado'
                CHECK (estado IN ('procesado', 'fallido', 'pendiente')),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.tarjetas (
  id                  bigserial PRIMARY KEY,
  usuario_id          bigint NOT NULL REFERENCES qa_training.usuarios (id),
  tipo                text NOT NULL DEFAULT 'debito'
                      CHECK (tipo IN ('credito', 'debito')),
  marca               text NOT NULL DEFAULT 'visa'
                      CHECK (marca IN ('visa', 'mastercard')),
  numero_enmascarado  text NOT NULL,
  limite_credito      numeric(12, 2),
  saldo_actual        numeric(12, 2) NOT NULL DEFAULT 0,
  estado              text NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa', 'bloqueada', 'vencida')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.notificaciones (
  id           bigserial PRIMARY KEY,
  usuario_id   bigint NOT NULL REFERENCES qa_training.usuarios (id),
  canal        text NOT NULL DEFAULT 'email'
               CHECK (canal IN ('push', 'email', 'sms')),
  asunto       text NOT NULL,
  mensaje      text NOT NULL,
  leido        boolean NOT NULL DEFAULT false,
  estado       text NOT NULL DEFAULT 'enviada'
               CHECK (estado IN ('enviada', 'fallida', 'pendiente')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ordenes: checkout de e-commerce (Grupo 7).
CREATE TABLE IF NOT EXISTS qa_training.ordenes (
  id           bigserial PRIMARY KEY,
  usuario_id   bigint NOT NULL REFERENCES qa_training.usuarios (id),
  producto     text NOT NULL,
  monto        numeric(10, 2) NOT NULL,
  estado       text NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'pagada', 'enviada', 'cancelada')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.items_orden (
  id               bigserial PRIMARY KEY,
  orden_id         bigint NOT NULL REFERENCES qa_training.ordenes (id),
  producto         text NOT NULL,
  cantidad         integer NOT NULL CHECK (cantidad > 0),
  precio_unitario  numeric(10, 2) NOT NULL,
  subtotal         numeric(10, 2) NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.reservas (
  id           bigserial PRIMARY KEY,
  usuario_id   bigint NOT NULL REFERENCES qa_training.usuarios (id),
  servicio     text NOT NULL,
  fecha_hora   timestamptz NOT NULL,
  estado       text NOT NULL DEFAULT 'pendiente'
               CHECK (estado IN ('pendiente', 'confirmada', 'cancelada', 'completada')),
  notas        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.roles (
  id           bigserial PRIMARY KEY,
  nombre       text NOT NULL UNIQUE
               CHECK (nombre IN ('admin', 'soporte', 'auditor', 'operador')),
  descripcion  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training.usuario_roles (
  id           bigserial PRIMARY KEY,
  usuario_id   bigint NOT NULL REFERENCES qa_training.usuarios (id),
  role_id      bigint NOT NULL REFERENCES qa_training.roles (id),
  activo       boolean NOT NULL DEFAULT true,
  asignado_en  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, role_id)
);

-- movimientos: ledger cross-dominio para reportes/agregados (Grupo 9).
-- referencia_id es intencionalmente SIN foreign key: según tipo_movimiento
-- apunta a transferencias, pagos, ordenes o tarjetas — una sola columna FK
-- no puede apuntar a cuatro tablas distintas. Las consultas de este grupo
-- son agregaciones (SUM/COUNT/GROUP BY) sobre esta tabla, con join opcional
-- a usuarios.
CREATE TABLE IF NOT EXISTS qa_training.movimientos (
  id               bigserial PRIMARY KEY,
  usuario_id       bigint NOT NULL REFERENCES qa_training.usuarios (id),
  tipo_movimiento  text NOT NULL
                   CHECK (tipo_movimiento IN (
                     'transferencia', 'pago_factura', 'compra_ecommerce', 'cargo_tarjeta'
                   )),
  monto            numeric(14, 2) NOT NULL,
  referencia_id    bigint,
  descripcion      text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- tickets: soporte general, no ligado a un grupo específico.
CREATE TABLE IF NOT EXISTS qa_training.tickets (
  id           bigserial PRIMARY KEY,
  usuario_id   bigint NOT NULL REFERENCES qa_training.usuarios (id),
  orden_id     bigint REFERENCES qa_training.ordenes (id),
  asunto       text NOT NULL,
  estado       text NOT NULL DEFAULT 'abierto'
               CHECK (estado IN ('abierto', 'en_progreso', 'cerrado')),
  prioridad    text NOT NULL DEFAULT 'media'
               CHECK (prioridad IN ('baja', 'media', 'alta')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Sandbox roles: qa_reader (SELECT-only), qa_writer (UPDATE-only),
--    qa_api (SELECT+INSERT+UPDATE, for the fixed-SQL REST endpoints only —
--    never used by the raw-SQL sandbox), app_meta (internal bookkeeping —
--    api_keys / sql_audit_log only)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  CREATE ROLE qa_reader LOGIN PASSWORD 'CHANGE_ME_READER_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE qa_writer LOGIN PASSWORD 'CHANGE_ME_WRITER_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE qa_api LOGIN PASSWORD 'CHANGE_ME_API_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE ROLE app_meta LOGIN PASSWORD 'CHANGE_ME_META_PASSWORD';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Belt-and-suspenders alongside the `options=-c search_path=qa_training`
-- connection parameter set in lib/db.ts.
ALTER ROLE qa_reader SET search_path TO qa_training;
ALTER ROLE qa_writer SET search_path TO qa_training;
ALTER ROLE qa_api SET search_path TO qa_training;

-- Sandbox roles must not be able to see anything outside qa_training, even
-- if the application's SQL AST whitelist ever has a gap.
REVOKE ALL ON SCHEMA public FROM qa_reader;
REVOKE ALL ON SCHEMA public FROM qa_writer;
REVOKE ALL ON SCHEMA public FROM qa_api;

GRANT USAGE ON SCHEMA qa_training TO qa_reader, qa_writer, qa_api;

-- These two GRANT/ALTER DEFAULT PRIVILEGES pairs run after every CREATE
-- TABLE above, so they cover all 15 qa_training tables (and any future
-- ones created by this same role) automatically — no per-table GRANTs
-- needed when adding a table later.
GRANT SELECT ON ALL TABLES IN SCHEMA qa_training TO qa_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training GRANT SELECT ON TABLES TO qa_reader;

GRANT UPDATE ON ALL TABLES IN SCHEMA qa_training TO qa_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training GRANT UPDATE ON TABLES TO qa_writer;
-- qa_writer intentionally has no INSERT / DELETE / TRUNCATE / DDL grants.

-- Postgres requires SELECT privilege on any columns referenced in an
-- UPDATE's WHERE clause or RETURNING list, in addition to UPDATE
-- privilege on the SET columns. Every UPDATE this app allows has a
-- mandatory WHERE clause (enforced by lib/sql-validator.ts), so
-- qa_writer needs SELECT too, or every UPDATE fails with
-- "permission denied for table X" (confirmed via a live connection
-- test — this is not optional). This does not let qa_writer run
-- arbitrary SELECT statements through the app: the AST validator
-- rejects any non-UPDATE statement type on the /sql/update endpoint
-- before a query ever reaches this pool.
GRANT SELECT ON ALL TABLES IN SCHEMA qa_training TO qa_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training GRANT SELECT ON TABLES TO qa_writer;

-- qa_api: SELECT+INSERT+UPDATE (still no DELETE/TRUNCATE/DDL), used
-- exclusively by the fixed-SQL REST endpoints under app/api/v1/** (auth,
-- cuentas, transferencias, facturas, usuarios, tarjetas, notificaciones,
-- ordenes, reservas, reportes, roles). Those routes run SQL fixed at
-- code-authoring time, never student-supplied — unlike qa_reader/qa_writer,
-- which back the raw-SQL sandbox and are deliberately left exactly as
-- restrictive as before this addition.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA qa_training TO qa_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training GRANT SELECT, INSERT, UPDATE ON TABLES TO qa_api;

-- Every INSERT into a bigserial PK column calls nextval() on its owned
-- sequence — without this, every INSERT from qa_api fails with
-- "permission denied for sequence qa_training.<table>_id_seq". Neither
-- qa_reader nor qa_writer ever needed this since neither can INSERT.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA qa_training TO qa_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training GRANT USAGE, SELECT ON SEQUENCES TO qa_api;

-- If this Supabase project's API exposes the qa_training schema (or if
-- you're not sure), the Postgres GRANTs above are not enough on their own
-- — Supabase's PostgREST layer uses separate anon/authenticated roles that
-- bypass table-level GRANTs unless RLS blocks them. Enable RLS with
-- policies scoped to qa_reader/qa_writer only, so anon/authenticated get
-- the default-deny (no matching policy = no rows), matching whatever
-- other tables in this project already do.
--
-- qa_writer gets a FOR ALL policy, not FOR UPDATE-only: Postgres RLS
-- requires an UPDATE to also satisfy a SELECT-type (or ALL-type) policy,
-- since UPDATE implicitly performs a SELECT under the hood to find the
-- rows to update. A FOR UPDATE-only policy left qa_writer seeing zero
-- rows even with the table-level SELECT grant above (confirmed live).
-- The table-level GRANTs (SELECT, UPDATE only) still gate which verbs
-- qa_writer can actually use — the broader RLS policy doesn't grant
-- INSERT/DELETE on its own.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'qa_training'
  LOOP
    EXECUTE format('ALTER TABLE qa_training.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS qa_reader_select ON qa_training.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_reader_select ON qa_training.%I FOR SELECT TO qa_reader USING (true)', t
    );
    EXECUTE format('DROP POLICY IF EXISTS qa_writer_update ON qa_training.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS qa_writer_all ON qa_training.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_writer_all ON qa_training.%I FOR ALL TO qa_writer USING (true) WITH CHECK (true)', t
    );
    -- Same FOR ALL reasoning as qa_writer above: an INSERT/UPDATE role
    -- needs a SELECT-type (or ALL-type) RLS policy too, or it sees zero
    -- rows even with the correct table-level GRANTs.
    EXECUTE format('DROP POLICY IF EXISTS qa_api_all ON qa_training.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_api_all ON qa_training.%I FOR ALL TO qa_api USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 3. Internal bookkeeping tables: api_keys, sql_audit_log
--    (public schema, reachable only by app_meta — never by qa_reader/qa_writer)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.api_keys (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key     text NOT NULL UNIQUE,
  label       text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sql_audit_log (
  id          bigserial PRIMARY KEY,
  api_key_id  uuid REFERENCES public.api_keys (id),
  sql         text NOT NULL,
  params      jsonb,
  success     boolean NOT NULL,
  error       text,
  ip          text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sql_audit_log_api_key_id_idx ON public.sql_audit_log (api_key_id);
CREATE INDEX IF NOT EXISTS sql_audit_log_created_at_idx ON public.sql_audit_log (created_at);

GRANT SELECT ON public.api_keys TO app_meta;
GRANT SELECT, INSERT ON public.sql_audit_log TO app_meta;
GRANT USAGE, SELECT ON SEQUENCE public.sql_audit_log_id_seq TO app_meta;

-- Same reasoning as the qa_training RLS block above: if `public` is an
-- exposed schema in this Supabase project's API settings (it usually is,
-- by default), api_keys/sql_audit_log would otherwise be reachable by
-- anon/authenticated. Neither role is ever granted anything on these two
-- tables, but RLS + a policy scoped to app_meta only is cheap
-- defense-in-depth and matches this project's existing convention of
-- every public table having RLS enabled.
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_meta_all_access ON public.api_keys;
CREATE POLICY app_meta_all_access ON public.api_keys FOR ALL TO app_meta USING (true) WITH CHECK (true);

ALTER TABLE public.sql_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_meta_all_access ON public.sql_audit_log;
CREATE POLICY app_meta_all_access ON public.sql_audit_log FOR ALL TO app_meta USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. Seed API keys for students (example — generate one row per student,
--    once the course roster's Nombre/Email columns are filled in).
--    Keys are stored in plaintext: this is a non-production pedagogical
--    sandbox with only dummy data, and plaintext keeps distribution/rotation
--    of ~50 keys trivial. Upgrade path if ever reused for something more
--    sensitive: add a key_hash column and compare SHA-256 hashes in auth.ts.
-- -----------------------------------------------------------------------------

-- INSERT INTO public.api_keys (api_key, label) VALUES
--   ('sbx_alumno01_xxxxxxxxxxxx', 'alumno01'),
--   ('sbx_alumno02_xxxxxxxxxxxx', 'alumno02');
