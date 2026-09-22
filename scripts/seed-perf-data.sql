-- =============================================================================
-- aiquaa-sandbox-api: seed-perf-data.sql
--
-- Carga sintetica para la suite de rendimiento (/api/perf/db). Va APARTE de
-- seed-data.sql a proposito: son 100k filas y no tienen por que re-insertarse
-- en cada `npm run db:seed`.
--
--   psql "$DATABASE_URL_ADMIN" -f scripts/seed-perf-data.sql
--
-- Deterministico (sin random()), igual que el resto de los seeds: una demo
-- tiene que dar los mismos numeros en el ensayo y en la charla.
--
-- No toca ninguna tabla del curso.
-- =============================================================================

TRUNCATE TABLE qa_training.perf_carga RESTART IDENTITY;
TRUNCATE TABLE qa_training.perf_idempotencia;

INSERT INTO qa_training.perf_carga (categoria, codigo, monto, payload)
SELECT
  -- 100 categorias -> ~1000 filas por categoria. Columna CON indice: el lado
  -- rapido de ?indexed=true.
  'cat_' || (i % 100),
  -- Codigo unico por fila. Columna SIN indice: el lado lento (Seq Scan sobre
  -- 100k filas) de ?indexed=false.
  'cod_' || i,
  ((i * 37) % 1000000)::numeric / 100,
  -- ~128 bytes por fila para que la tabla no entre entera en cache trivial.
  repeat(md5(i::text), 4)
FROM generate_series(1, 100000) AS s(i);

-- Sin ANALYZE el planner trabaja con estadisticas vacias y elige mal — que es
-- justamente uno de los temas de la charla (fine tuning / estadisticas).
ANALYZE qa_training.perf_carga;

-- Comprobacion rapida de que quedo como se espera:
--   SELECT count(*) FROM qa_training.perf_carga;                       -- 100000
--   EXPLAIN ANALYZE SELECT * FROM qa_training.perf_carga
--     WHERE categoria = 'cat_7' LIMIT 50;                              -- Index Scan
--   EXPLAIN ANALYZE SELECT * FROM qa_training.perf_carga
--     WHERE codigo = 'cod_54321';                                      -- Seq Scan
