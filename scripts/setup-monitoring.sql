-- =============================================================================
-- aiquaa-sandbox-api: setup-monitoring.sql
--
-- Rol de SOLO LECTURA para el datasource Postgres de Grafana Cloud, mas la
-- vista que expone las metricas de la API sin exponer las API keys.
--
--   psql "$DATABASE_URL_ADMIN" -f scripts/setup-monitoring.sql
--
-- Correr DESPUES de setup-db.sql (necesita public.sql_audit_log con las
-- columnas duration_ms/status_code/method/route/subject).
--
-- Es aditivo e idempotente. No toca `qa_training`, `qa_training_v2` ni ningun
-- otro schema de este proyecto Supabase compartido.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rol de monitoreo
--
--    CONNECTION LIMIT 3: max_connections en esta instancia es 60 y es un
--    recurso GLOBAL compartido con datos de produccion ajenos. Grafana
--    consultando en loop no puede comerse el presupuesto de conexiones que la
--    prueba de carga necesita — que seria arruinar la medicion con el
--    instrumento de medicion.
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  CREATE ROLE qa_monitor LOGIN PASSWORD 'CHANGE_ME_MONITOR_PASSWORD' CONNECTION LIMIT 3;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'El rol qa_monitor ya existe, no se re-crea.';
END $$;

-- pg_monitor da acceso a las estadisticas completas (incluido el texto de las
-- queries de otros roles en pg_stat_statements y pg_stat_activity). En
-- Supabase el rol `postgres` no es superusuario, asi que este GRANT puede
-- fallar segun el plan: si falla, el rol sigue sirviendo, solo que el texto de
-- las queries ajenas aparece como "<insufficient privilege>" — los tiempos,
-- los conteos y las conexiones se siguen viendo.
DO $$
BEGIN
  GRANT pg_monitor TO qa_monitor;
EXCEPTION WHEN insufficient_privilege OR undefined_object THEN
  RAISE NOTICE 'No se pudo otorgar pg_monitor a qa_monitor (hace falta superusuario). '
               'El dashboard funciona igual, con el texto de las queries ajenas redactado.';
END $$;

-- -----------------------------------------------------------------------------
-- 2. pg_stat_statements — el panel del "hard parse"
--
--    Ya esta instalado en este proyecto, en el schema `extensions`.
--
--    OJO: pg_stat_statements.track_planning esta en `off`, por eso
--    total_plan_time da 0 y NO se puede graficar tiempo de planificacion. El
--    panel que si funciona es el CONTEO de entradas: con SQL parametrizado se
--    mantiene plano y con SQL concatenado (/api/perf/db?mode=literal) se
--    dispara, porque cada valor distinto crea un statement nuevo.
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA extensions TO qa_monitor;
GRANT SELECT ON extensions.pg_stat_statements TO qa_monitor;

-- -----------------------------------------------------------------------------
-- 3. Vista de metricas de la API
--
--    qa_monitor NO recibe SELECT sobre public.api_keys: esa tabla guarda las
--    keys de los alumnos en texto plano. La vista hace el join y expone solo
--    la etiqueta y el curso.
--
--    Dos sutilezas que hacen que esto funcione:
--      - La vista NO es security_invoker, asi que se ejecuta con los permisos
--        de su dueno (el rol admin que corre este script). Por eso qa_monitor
--        puede leerla sin tener permisos sobre api_keys.
--      - public.sql_audit_log tiene RLS con una unica politica para app_meta.
--        El dueno de una tabla ignora RLS (salvo FORCE ROW LEVEL SECURITY), asi
--        que la vista ve todas las filas. Si en algun momento se activa
--        FORCE en esa tabla, este dashboard se queda en cero sin dar error —
--        es el modo de falla a vigilar.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_api_metrics AS
SELECT
  l.created_at,
  l.route,
  l.method,
  l.status_code,
  l.duration_ms,
  l.success,
  l.error,
  l.ip,
  -- `subject` cuando el sujeto fue un JWT de grupo, la etiqueta de la key si no.
  coalesce(k.label, l.subject) AS sujeto,
  k.curso
FROM public.sql_audit_log l
LEFT JOIN public.api_keys k ON k.id = l.api_key_id;

GRANT USAGE ON SCHEMA public TO qa_monitor;
GRANT SELECT ON public.v_api_metrics TO qa_monitor;

-- Explicitamente NO:
--   GRANT SELECT ON public.api_keys TO qa_monitor;   -- keys en texto plano
--   GRANT ... ON qa_training / qa_training_v2        -- datos del curso

-- -----------------------------------------------------------------------------
-- 4. Verificacion
-- -----------------------------------------------------------------------------

-- Que ve qa_monitor:
--   SELECT has_table_privilege('qa_monitor', 'public.v_api_metrics', 'SELECT');        -- t
--   SELECT has_table_privilege('qa_monitor', 'extensions.pg_stat_statements', 'SELECT'); -- t
--   SELECT has_table_privilege('qa_monitor', 'public.api_keys', 'SELECT');             -- f
--
-- Y con las credenciales de qa_monitor (conectando DIRECTO con psql, no por el
-- MCP de Supabase, que corre con su propio rol y no puede hacer SET ROLE):
--   SELECT count(*) FROM public.v_api_metrics WHERE created_at > now() - interval '1 hour';
--   SELECT count(*) FROM extensions.pg_stat_statements;
--
-- Cadena de conexion para el datasource de Grafana Cloud (pooler, puerto 6543,
-- usuario con sufijo de project-ref, SIN ?sslmode=require):
--   Host: aws-1-us-east-1.pooler.supabase.com:6543
--   User: qa_monitor.hocryhxndegslzfiwlnx
--   DB:   postgres
--   TLS:  require (configurado en la UI de Grafana, no en la cadena)
