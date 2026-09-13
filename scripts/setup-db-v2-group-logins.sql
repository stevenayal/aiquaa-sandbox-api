-- =============================================================================
-- aiquaa-sandbox-api: setup-db-v2-group-logins.sql
--
-- Logins Postgres directos (psql / DBeaver / pgAdmin) para los 5 grupos del
-- curso 2 — Productos Bancarios. Se corre UNA vez, despues de setup-db-v2.sql.
--
-- IMPORTANTE: reemplaza cada 'CHANGE_ME_...' por un password real antes de
-- correrlo, y reparti esos passwords por fuera del repo (planilla de clase).
-- Nunca commitear los valores reales — este repo es publico.
--
-- Diferencia con qa_g01..qa_g10 (los logins del curso 1, migracion
-- create_qa_training_student_group_logins): aquellos son miembros de `qa_api`,
-- que tiene permisos sobre AMBOS schemas, y su search_path apunta a
-- qa_training. Un alumno del curso 2 con esas credenciales que escriba
-- `SELECT * FROM cuentas` estaria leyendo — y con UPDATE, escribiendo — los
-- datos del curso 1 sin darse cuenta.
--
-- Estos roles, en cambio, cuelgan de un rol de grupo propio (`qa_c2_group`)
-- que solo tiene GRANTs y politicas RLS sobre qa_training_v2: el curso 1 les
-- queda fuera de alcance a nivel de Postgres, no por convencion.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rol de grupo (NOLOGIN): concentra permisos y politicas RLS.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  CREATE ROLE qa_c2_group NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT USAGE ON SCHEMA qa_training_v2 TO qa_c2_group;

-- SELECT+INSERT+UPDATE, sin DELETE: mismo criterio que `qa_api`. Los alumnos
-- practican altas y modificaciones; borrar de verdad les dejaria el sandbox
-- inservible para el resto de la clase.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA qa_training_v2 TO qa_c2_group;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training_v2 GRANT SELECT, INSERT, UPDATE ON TABLES TO qa_c2_group;

-- Un INSERT sobre una PK bigserial llama nextval() sobre su secuencia: sin
-- esto falla con "permission denied for sequence ...".
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA qa_training_v2 TO qa_c2_group;
ALTER DEFAULT PRIVILEGES IN SCHEMA qa_training_v2 GRANT USAGE, SELECT ON SEQUENCES TO qa_c2_group;

-- Las tablas tienen RLS habilitada: sin una politica propia, el rol ve cero
-- filas aunque los GRANTs esten bien. FOR ALL y no FOR SELECT porque un rol
-- que escribe necesita ademas "ver" la fila para resolver WHERE/RETURNING.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'qa_training_v2' LOOP
    EXECUTE format('DROP POLICY IF EXISTS qa_c2_group_all ON qa_training_v2.%I', t);
    EXECUTE format(
      'CREATE POLICY qa_c2_group_all ON qa_training_v2.%I FOR ALL TO qa_c2_group USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Un login por grupo. CONNECTION LIMIT 10 = mismo cupo que los logins del
--    curso 1 (3 integrantes por grupo, con margen para IDEs que abren varias
--    conexiones).
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  CREATE ROLE qa_c2_g01 LOGIN PASSWORD 'CHANGE_ME_G01' CONNECTION LIMIT 10 IN ROLE qa_c2_group;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE qa_c2_g01 LOGIN PASSWORD 'CHANGE_ME_G01' CONNECTION LIMIT 10;
  GRANT qa_c2_group TO qa_c2_g01;
END $$;

DO $$
BEGIN
  CREATE ROLE qa_c2_g02 LOGIN PASSWORD 'CHANGE_ME_G02' CONNECTION LIMIT 10 IN ROLE qa_c2_group;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE qa_c2_g02 LOGIN PASSWORD 'CHANGE_ME_G02' CONNECTION LIMIT 10;
  GRANT qa_c2_group TO qa_c2_g02;
END $$;

DO $$
BEGIN
  CREATE ROLE qa_c2_g03 LOGIN PASSWORD 'CHANGE_ME_G03' CONNECTION LIMIT 10 IN ROLE qa_c2_group;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE qa_c2_g03 LOGIN PASSWORD 'CHANGE_ME_G03' CONNECTION LIMIT 10;
  GRANT qa_c2_group TO qa_c2_g03;
END $$;

DO $$
BEGIN
  CREATE ROLE qa_c2_g04 LOGIN PASSWORD 'CHANGE_ME_G04' CONNECTION LIMIT 10 IN ROLE qa_c2_group;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE qa_c2_g04 LOGIN PASSWORD 'CHANGE_ME_G04' CONNECTION LIMIT 10;
  GRANT qa_c2_group TO qa_c2_g04;
END $$;

DO $$
BEGIN
  CREATE ROLE qa_c2_g05 LOGIN PASSWORD 'CHANGE_ME_G05' CONNECTION LIMIT 10 IN ROLE qa_c2_group;
EXCEPTION WHEN duplicate_object THEN
  ALTER ROLE qa_c2_g05 LOGIN PASSWORD 'CHANGE_ME_G05' CONNECTION LIMIT 10;
  GRANT qa_c2_group TO qa_c2_g05;
END $$;

-- El search_path a nivel de rol es lo que hace que un `SELECT * FROM cuentas`
-- sin calificar el schema lea las tablas del curso 2 y no las del curso 1.
ALTER ROLE qa_c2_g01 SET search_path TO qa_training_v2, public;
ALTER ROLE qa_c2_g02 SET search_path TO qa_training_v2, public;
ALTER ROLE qa_c2_g03 SET search_path TO qa_training_v2, public;
ALTER ROLE qa_c2_g04 SET search_path TO qa_training_v2, public;
ALTER ROLE qa_c2_g05 SET search_path TO qa_training_v2, public;

-- -----------------------------------------------------------------------------
-- 3. Verificacion (deberia dar true/true/true/false/false para cada rol)
-- -----------------------------------------------------------------------------

-- SELECT r.rolname,
--        has_table_privilege(r.rolname, 'qa_training_v2.cuentas', 'SELECT') AS v2_select,
--        has_table_privilege(r.rolname, 'qa_training_v2.cuentas', 'INSERT') AS v2_insert,
--        has_table_privilege(r.rolname, 'qa_training_v2.cuentas', 'UPDATE') AS v2_update,
--        has_table_privilege(r.rolname, 'qa_training_v2.cuentas', 'DELETE') AS v2_delete,
--        has_schema_privilege(r.rolname, 'qa_training', 'USAGE')            AS v1_usage
--   FROM pg_roles r WHERE r.rolname LIKE 'qa_c2_g0%' ORDER BY r.rolname;
