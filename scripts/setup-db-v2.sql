-- =============================================================================
-- aiquaa-sandbox-api: setup-db-v2.sql  (Curso 2 - Productos Bancarios)
--
-- Corre UNA vez por proyecto Supabase, como superusuario/owner (SQL Editor o
-- psql). NO lo ejecuta la aplicacion.
--
-- Por que un schema aparte y no columnas nuevas en qa_training: el curso 1
-- (10 grupos) y el curso 2 (5 grupos de productos bancarios) comparten tres
-- recursos por nombre -- cuentas, tarjetas, transferencias -- y ambas cohortes
-- automatizan tests que insertan, actualizan y hacen soft-delete sobre ellos.
-- Con un solo schema se pisan entre si. Con dos schemas el aislamiento lo
-- impone Postgres via search_path (ver lib/db.ts), no un WHERE que se puede
-- olvidar en una ruta.
--
-- Este script NO toca qa_training ni ninguna de sus tablas.
--
-- Grupo 1  Cuentas Bancarias           -> cuentas, movimientos
-- Grupo 2  Tarjetas de Credito/Debito  -> tarjetas
-- Grupo 3  Prestamos                   -> prestamos, cuotas_prestamo
-- Grupo 4  Transferencias y Pagos      -> beneficiarios, transferencias
-- Grupo 5  Ahorros y Depositos         -> ahorros, depositos
-- (soporte, sin grupo)                 -> usuarios
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS qa_training_v2;

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS qa_training_v2.usuarios (
  id                bigserial PRIMARY KEY,
  nombre            text NOT NULL,
  email             text NOT NULL UNIQUE,
  documento_tipo    text NOT NULL DEFAULT 'CI'
                    CHECK (documento_tipo IN ('CI', 'pasaporte', 'RUC')),
  documento_numero  text NOT NULL UNIQUE,
  telefono          text,
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Grupo 1: cuentas + su ledger de movimientos.
-- `estado` (activa/bloqueada/cerrada) es el estado de negocio que testean los
-- alumnos; `activa` es el flag de soft-delete del DELETE del API. Son cosas
-- distintas a proposito: bloquear una cuenta no la borra.
CREATE TABLE IF NOT EXISTS qa_training_v2.cuentas (
  id             bigserial PRIMARY KEY,
  usuario_id     bigint NOT NULL REFERENCES qa_training_v2.usuarios (id),
  numero_cuenta  text NOT NULL UNIQUE,
  tipo_cuenta    text NOT NULL DEFAULT 'ahorro'
                 CHECK (tipo_cuenta IN ('ahorro', 'corriente')),
  moneda         text NOT NULL DEFAULT 'PYG'
                 CHECK (moneda IN ('PYG', 'USD')),
  saldo          numeric(14, 2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  estado         text NOT NULL DEFAULT 'activa'
                 CHECK (estado IN ('activa', 'bloqueada', 'cerrada')),
  activa         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training_v2.movimientos (
  id               bigserial PRIMARY KEY,
  cuenta_id        bigint NOT NULL REFERENCES qa_training_v2.cuentas (id),
  tipo             text NOT NULL CHECK (tipo IN ('debito', 'credito')),
  monto            numeric(14, 2) NOT NULL CHECK (monto > 0),
  saldo_posterior  numeric(14, 2) NOT NULL,
  referencia_tipo  text NOT NULL DEFAULT 'manual'
                   CHECK (referencia_tipo IN (
                     'manual', 'transferencia', 'prestamo', 'ahorro', 'deposito', 'tarjeta'
                   )),
  referencia_id    bigint,
  descripcion      text,
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS movimientos_cuenta_id_idx ON qa_training_v2.movimientos (cuenta_id);

-- Grupo 2: tarjetas. `disponible` NO se almacena -- se calcula
-- (limite_credito - saldo_utilizado) en el SELECT, para que no pueda quedar
-- desincronizado del saldo tras un UPDATE parcial.
CREATE TABLE IF NOT EXISTS qa_training_v2.tarjetas (
  id                  bigserial PRIMARY KEY,
  usuario_id          bigint NOT NULL REFERENCES qa_training_v2.usuarios (id),
  cuenta_id           bigint REFERENCES qa_training_v2.cuentas (id),
  tipo                text NOT NULL DEFAULT 'debito'
                      CHECK (tipo IN ('credito', 'debito')),
  marca               text NOT NULL DEFAULT 'visa'
                      CHECK (marca IN ('visa', 'mastercard', 'amex')),
  numero_enmascarado  text NOT NULL,
  limite_credito      numeric(12, 2) NOT NULL DEFAULT 0 CHECK (limite_credito >= 0),
  saldo_utilizado     numeric(12, 2) NOT NULL DEFAULT 0 CHECK (saldo_utilizado >= 0),
  estado              text NOT NULL DEFAULT 'activa'
                      CHECK (estado IN ('activa', 'bloqueada', 'vencida')),
  fecha_vencimiento   date NOT NULL,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tarjetas_saldo_no_supera_limite CHECK (saldo_utilizado <= limite_credito)
);

-- Grupo 3: prestamos y su plan de cuotas.
CREATE TABLE IF NOT EXISTS qa_training_v2.prestamos (
  id                bigserial PRIMARY KEY,
  usuario_id        bigint NOT NULL REFERENCES qa_training_v2.usuarios (id),
  cuenta_id         bigint REFERENCES qa_training_v2.cuentas (id),
  monto_solicitado  numeric(14, 2) NOT NULL CHECK (monto_solicitado > 0),
  tasa_interes      numeric(5, 2) NOT NULL CHECK (tasa_interes >= 0),
  plazo_meses       integer NOT NULL CHECK (plazo_meses BETWEEN 1 AND 120),
  saldo_pendiente   numeric(14, 2) NOT NULL DEFAULT 0 CHECK (saldo_pendiente >= 0),
  estado            text NOT NULL DEFAULT 'solicitado'
                    CHECK (estado IN ('solicitado', 'aprobado', 'rechazado', 'pagado')),
  activo            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training_v2.cuotas_prestamo (
  id                 bigserial PRIMARY KEY,
  prestamo_id        bigint NOT NULL REFERENCES qa_training_v2.prestamos (id),
  numero_cuota       integer NOT NULL CHECK (numero_cuota > 0),
  monto              numeric(14, 2) NOT NULL CHECK (monto > 0),
  fecha_vencimiento  date NOT NULL,
  estado             text NOT NULL DEFAULT 'pendiente'
                     CHECK (estado IN ('pendiente', 'pagada', 'vencida')),
  fecha_pago         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prestamo_id, numero_cuota)
);

-- Grupo 4: beneficiarios + transferencias.
-- Una transferencia es interna (cuenta_destino_id) o externa a un beneficiario
-- registrado (beneficiario_id) -- exactamente uno de los dos, nunca ambos ni
-- ninguno.
CREATE TABLE IF NOT EXISTS qa_training_v2.beneficiarios (
  id             bigserial PRIMARY KEY,
  usuario_id     bigint NOT NULL REFERENCES qa_training_v2.usuarios (id),
  nombre         text NOT NULL,
  banco          text NOT NULL,
  numero_cuenta  text NOT NULL,
  alias          text,
  activo         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (usuario_id, numero_cuenta)
);

CREATE TABLE IF NOT EXISTS qa_training_v2.transferencias (
  id                 bigserial PRIMARY KEY,
  cuenta_origen_id   bigint NOT NULL REFERENCES qa_training_v2.cuentas (id),
  cuenta_destino_id  bigint REFERENCES qa_training_v2.cuentas (id),
  beneficiario_id    bigint REFERENCES qa_training_v2.beneficiarios (id),
  monto              numeric(14, 2) NOT NULL CHECK (monto > 0),
  moneda             text NOT NULL DEFAULT 'PYG' CHECK (moneda IN ('PYG', 'USD')),
  concepto           text,
  referencia         text NOT NULL UNIQUE,
  estado             text NOT NULL DEFAULT 'completada'
                     CHECK (estado IN ('pendiente', 'completada', 'rechazada', 'anulada')),
  activo             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transferencias_un_solo_destino CHECK (
    (cuenta_destino_id IS NOT NULL AND beneficiario_id IS NULL)
    OR (cuenta_destino_id IS NULL AND beneficiario_id IS NOT NULL)
  ),
  CONSTRAINT transferencias_destino_distinto_origen CHECK (
    cuenta_destino_id IS NULL OR cuenta_destino_id <> cuenta_origen_id
  )
);

-- Grupo 5: ahorro programado (meta + aportes) y deposito a plazo fijo.
CREATE TABLE IF NOT EXISTS qa_training_v2.ahorros (
  id               bigserial PRIMARY KEY,
  usuario_id       bigint NOT NULL REFERENCES qa_training_v2.usuarios (id),
  cuenta_id        bigint NOT NULL REFERENCES qa_training_v2.cuentas (id),
  nombre_meta      text NOT NULL,
  meta_monto       numeric(14, 2) NOT NULL CHECK (meta_monto > 0),
  aporte_mensual   numeric(14, 2) NOT NULL CHECK (aporte_mensual > 0),
  saldo_acumulado  numeric(14, 2) NOT NULL DEFAULT 0 CHECK (saldo_acumulado >= 0),
  tasa_anual       numeric(5, 2) NOT NULL DEFAULT 0 CHECK (tasa_anual >= 0),
  estado           text NOT NULL DEFAULT 'activo'
                   CHECK (estado IN ('activo', 'completado', 'cancelado')),
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qa_training_v2.depositos (
  id                 bigserial PRIMARY KEY,
  usuario_id         bigint NOT NULL REFERENCES qa_training_v2.usuarios (id),
  cuenta_id          bigint NOT NULL REFERENCES qa_training_v2.cuentas (id),
  monto              numeric(14, 2) NOT NULL CHECK (monto > 0),
  tasa_anual         numeric(5, 2) NOT NULL CHECK (tasa_anual >= 0),
  plazo_dias         integer NOT NULL CHECK (plazo_dias BETWEEN 30 AND 1095),
  fecha_inicio       date NOT NULL DEFAULT current_date,
  fecha_vencimiento  date NOT NULL,
  interes_generado   numeric(14, 2) NOT NULL DEFAULT 0 CHECK (interes_generado >= 0),
  estado             text NOT NULL DEFAULT 'activo'
                     CHECK (estado IN ('activo', 'vencido', 'cancelado')),
  activo             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT depositos_vencimiento_posterior CHECK (fecha_vencimiento > fecha_inicio)
);

-- -----------------------------------------------------------------------------
-- 2. Migracion aditiva sobre `public`: cohorte de cada API key / alumno.
--    Segura de re-correr; toda fila existente queda en curso 1.
-- -----------------------------------------------------------------------------

ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS curso smallint NOT NULL DEFAULT 1;
ALTER TABLE public.roster   ADD COLUMN IF NOT EXISTS curso smallint NOT NULL DEFAULT 1;

-- El CHECK existente de roster (grupo BETWEEN 1 AND 10) ya cubre los grupos
-- 1-5 del curso 2, no hace falta tocarlo.

-- -----------------------------------------------------------------------------
-- 3. GRANTs para los roles ya existentes (creados por setup-db.sql).
--    No se crean roles ni se cambian passwords: los pools de curso 2 usan las
--    mismas connection strings, solo con otro search_path (lib/db.ts).
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA qa_training_v2 TO qa_reader, qa_writer, qa_api;

GRANT SELECT ON ALL TABLES IN SCHEMA qa_training_v2 TO qa_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training_v2 GRANT SELECT ON TABLES TO qa_reader;

-- qa_writer necesita SELECT ademas de UPDATE: Postgres lo exige para resolver
-- el WHERE/RETURNING de cualquier UPDATE (mismo motivo que en setup-db.sql).
GRANT UPDATE, SELECT ON ALL TABLES IN SCHEMA qa_training_v2 TO qa_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training_v2 GRANT UPDATE, SELECT ON TABLES TO qa_writer;

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA qa_training_v2 TO qa_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training_v2 GRANT SELECT, INSERT, UPDATE ON TABLES TO qa_api;

-- Un INSERT sobre una PK bigserial llama nextval() sobre su secuencia: sin
-- esto todo INSERT de qa_api falla con "permission denied for sequence ...",
-- aunque el GRANT de tabla este bien.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA qa_training_v2 TO qa_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training_v2 GRANT USAGE, SELECT ON SEQUENCES TO qa_api;

-- -----------------------------------------------------------------------------
-- 4. RLS -- mismo bloque que setup-db.sql pero filtrando por qa_training_v2.
--    Ojo: si se copia el loop original tal cual (schemaname = 'qa_training')
--    estas tablas quedan con RLS habilitada y SIN politicas, y qa_api ve cero
--    filas pese a tener los GRANTs correctos.
--    Las politicas son FOR ALL (no FOR UPDATE/INSERT): un rol que escribe
--    necesita tambien "ver" la fila via una politica de tipo SELECT.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'qa_training_v2'
  LOOP
    EXECUTE format('ALTER TABLE qa_training_v2.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS qa_reader_select ON qa_training_v2.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_reader_select ON qa_training_v2.%I FOR SELECT TO qa_reader USING (true)', t
    );
    EXECUTE format('DROP POLICY IF EXISTS qa_writer_all ON qa_training_v2.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_writer_all ON qa_training_v2.%I FOR ALL TO qa_writer USING (true) WITH CHECK (true)', t
    );
    EXECUTE format('DROP POLICY IF EXISTS qa_api_all ON qa_training_v2.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_api_all ON qa_training_v2.%I FOR ALL TO qa_api USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Alta de alumnos del curso 2 (ejecutar a mano; datos personales reales
--    nunca se commitean a este repo, igual que el roster del curso 1).
-- -----------------------------------------------------------------------------

-- INSERT INTO public.api_keys (api_key, label, curso) VALUES
--   ('sbx_c2_alumno01_xxxxxxxxxxxx', 'c2_alumno01', 2);
-- INSERT INTO public.roster (nombre, email, grupo, curso) VALUES
--   ('Nombre Apellido', 'alumno@email.com', 1, 2);
