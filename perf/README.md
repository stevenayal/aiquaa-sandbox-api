# Suite de rendimiento y monitoreo

Todo lo necesario para estresar esta API en vivo y mirar qué le pasa: endpoints
diseñados para ser golpeados, un plan de JMeter con variables dinámicas, y dos
dashboards de Grafana Cloud.

El guion de la charla está en [README-charla.md](./README-charla.md).

---

## Lo primero: dónde se puede medir qué

Esta es la decisión de diseño que condiciona todo lo demás.

| Quiero ver | Dónde | Por qué |
|---|---|---|
| CPU y memoria **reales** de la API, con límites | **Docker local** (`docker-compose.yml`) | Vercel serverless no tiene pod ni cgroup. Sus métricas de función salen por Observability / log drains, que son de plan Pro. |
| Cómo se comporta el **deploy real** bajo carga | Vercel + `/api/perf/metrics` | Auto-reporte: el proceso publica su propio `rss`/`heap`/`cpu` con un `instance_id`. No se pueden sumar entre lambdas. |
| Estado de **Postgres** | `postgres_exporter` + datasource Postgres | `pg_stat_*` es puntual; el exporter le da historia. |
| CPU/disco de la **instancia** de Postgres | Endpoint Prometheus de Supabase | Depende del plan — **verificar antes** (ver abajo). |

No es una limitación que haya que esconder en la charla: *es* el tema. El
modelo de un pod de k8s con `requests`/`limits` y el modelo de N lambdas
efímeras se dimensionan distinto, y aquí se ven los dos al lado.

---

## Endpoints

Documentados en **`/docs/perf`** (Scalar). Spec en `lib/openapi-perf.ts`.

| Ruta | Límite | Para qué |
|---|---|---|
| `GET /api/perf/echo` | 3000/min | Baseline sin DB. `?delayMs=`, `?bytes=`, `?errorRate=` |
| `GET /api/perf/echo-limited` | **10/min** | Gemelo exacto. La pared de 429. |
| `GET /api/perf/db` | 1000/min | `?mode=parametrizada\|literal`, `?indexed=true\|false` |
| `POST /api/perf/db` | 300/min | Escritura con `Idempotency-Key` obligatorio |
| `GET /api/perf/limits` | 30/min | Los techos del sistema |
| `GET /api/perf/metrics` | 30/min | p50/p95/p99, errores, proceso. `?format=prometheus` |

Cada ruta tiene su **propio bucket de Redis**: estresar `/echo` a 3000/min no
toca el presupuesto de 30/min de las 72 rutas del curso.

`/api/perf/**` no declara `curso`, así que acepta cualquier API key válida de
cualquiera de las dos cohortes. Conviene crear una key dedicada:

```sql
INSERT INTO public.api_keys (api_key, label) VALUES ('sbx_perf_demo_xxxxxxxx', 'perf_demo');
```

---

## Preparar la base

```bash
npm run db:setup          # crea perf_carga, perf_idempotencia y las columnas nuevas de sql_audit_log
npm run db:seed:perf      # 100k filas sinteticas (aparte de db:seed a proposito)
npm run db:setup:monitoring   # rol de solo lectura qa_monitor + vista public.v_api_metrics
```

Antes de `db:setup:monitoring`, cambiá `CHANGE_ME_MONITOR_PASSWORD` en
`scripts/setup-monitoring.sql`.

> **`npm run db:setup` corre contra la base compartida de producción.** Es
> aditivo e idempotente, pero ese proyecto Supabase aloja datos ajenos fuera de
> `qa_training`. Revisá el diff antes de correrlo.

---

## Grafana Cloud

### 1. Datasource Postgres

Grafana Cloud → **Connections → Data sources → PostgreSQL**:

```
Host:     aws-1-us-east-1.pooler.supabase.com:6543
Database: postgres
User:     qa_monitor.hocryhxndegslzfiwlnx
Password: (el de setup-monitoring.sql)
TLS/SSL:  require
Version:  15+
```

El puerto es el **6543 del pooler**, no el host directo (que es IPv6-only). Y
**sin `?sslmode=require`** en ninguna cadena: el TLS se configura en la UI.

### 2. Métricas por `remote_write`

Grafana Cloud → **Connections → Add new connection → Hosted Prometheus
metrics**. Copiá URL, usuario y token a tu `.env.local`:

```
GRAFANA_CLOUD_PROM_URL=https://prometheus-prod-XX-...grafana.net/api/prom/push
GRAFANA_CLOUD_PROM_USER=123456
GRAFANA_CLOUD_PROM_TOKEN=glc_xxxxx
DATABASE_URL_MONITOR=postgresql://qa_monitor.hocryhxndegslzfiwlnx:PASSWORD@aws-1-us-east-1.pooler.supabase.com:6543/postgres
PERF_METRICS_API_KEY=sbx_perf_demo_xxxxxxxx
```

### 3. Levantar el stack local

```bash
docker compose -f perf/docker-compose.yml --env-file .env.local up --build
```

Arranca la API con límite de **0.5 vCPU / 512 MB**, cAdvisor, postgres_exporter
y Alloy empujando todo a Grafana Cloud.

### 4. Importar los dashboards

Grafana Cloud → **Dashboards → New → Import** → subí los dos JSON de
`perf/grafana/`. Al importar te pide elegir los datasources (`DS_PROMETHEUS` y
`DS_POSTGRES`).

- **`aiquaa - Postgres bajo carga`** — conexiones vs 60, cache hit ratio,
  entradas de `pg_stat_statements` (el panel del hard parse), tps, esperas,
  bloat, top queries.
- **`aiquaa - API bajo carga`** — CPU y throttling del contenedor, memoria vs
  límite, p50/p95/p99, respuestas por clase de status, auto-reporte por
  instancia de Vercel, desglose por ruta.

### 5. Verificar el endpoint de Supabase (hacerlo antes de la charla)

```bash
curl -u "service_role:$SUPABASE_SERVICE_ROLE_KEY" \
  https://hocryhxndegslzfiwlnx.supabase.co/customer/v1/privileged/metrics | head
```

Si responde métricas, descomentá el bloque `prometheus.scrape "supabase"` de
`perf/alloy/config.alloy`. Si devuelve 401/404, no está en este plan: el único
panel que queda vacío es "CPU y memoria de la instancia de Postgres". Todo lo
demás sigue funcionando.

---

## JMeter

```bash
jmeter -n -t perf/jmeter/aiquaa-perf.jmx -l resultados.jtl -e -o reporte/ \
  -Jhost=localhost -Jprotocol=http -Jport=3000 \
  -Japikey=sbx_perf_demo_xxxx -Jthreads=20 -Jrampup=30 -Jduration=180
```

Nunca en modo GUI: la ventana de JMeter consume más que la carga que genera.

Qué lo hace realista, que es el punto de la charla:

- Cada hilo toma una fila distinta de `grupos.csv`, **se loguea con su usuario**
  y extrae **su** token con un JSON Extractor. Nada de un token pegado a mano.
- `__Random` y `__UUID` en ids, montos y payloads. Golpear siempre el mismo id
  no mide la aplicación: mide la caché.
- `Idempotency-Key` es un UUID por iteración, como en un cliente real.
- El assertion **no acepta 429**. Un plan que cuenta los 429 como éxito miente
  sobre el throughput.

Propiedades útiles: `-JendpointEcho=/api/perf/echo-limited` para la demo del
429, `-JdbMode=literal` para la del hard parse.

---

## Antes de reventar nada

1. **`max_connections` es 60 y es global.** Ese proyecto Supabase aloja datos
   de producción ajenos fuera de `qa_training`. Una corrida agresiva puede
   dejar sin conexiones al resto. Acordá una ventana, arrancá con 10 hilos y
   subí mirando el panel de conexiones. Tené a mano:

   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE usename = 'qa_api' AND state = 'idle in transaction';
   ```

2. **`mode=literal` ensucia `pg_stat_statements`** de toda la instancia por
   evicción. Usalo solo en la demo y después:

   ```sql
   SELECT extensions.pg_stat_statements_reset();
   ```

3. **Upstash cobra por comando.** A 3000 req/min cada request es un comando a
   Redis. Revisá la cuota antes.

4. **Consultá `GET /api/perf/limits` primero.** Es, literalmente, el punto de
   la charla sobre relevar los techos antes de diseñar la prueba.
