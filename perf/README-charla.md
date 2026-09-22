# Guion de la charla — rendimiento y monitoreo

Cada punto del temario con la demo concreta que lo sostiene. El setup está en
[README.md](./README.md).

Números relevados contra la instancia real (`hocryhxndegslzfiwlnx`, Postgres
17.6, us-east-1) el 2026-09-22 — volver a correr las consultas si cambió el
tamaño de la instancia:

| Qué | Valor |
|---|---|
| `max_connections` | **60** |
| `shared_buffers` | 224 MB |
| `work_mem` | 2.1 MB |
| `pg_stat_statements` | instalado, ~3.3k statements / 270k llamadas acumuladas |
| `pg_stat_statements.track_planning` | **off** |
| `plan_cache_mode` | `auto` |
| Pooler | pgbouncer, modo transacción, puerto 6543 |
| Pool de la app | `max: 1` por instancia |

---

## 1. La importancia del monitoreo

**Demo:** correr JMeter dos veces. La primera sin mirar nada: termina, el
reporte dice "1200 requests, 0.2% error" y todo parece bien. La segunda con los
dos dashboards al lado.

**El remate:** en la primera corrida el 0.2% de error eran 429, y el throughput
"logrado" estaba topeado por el rate limit, no por la capacidad. Sin métricas,
la pregunta *"¿aguanta?"* no tiene respuesta — tiene opinión.

---

## 2. Fine tuning de la base: el *hard parse*

"Hard parse" es vocabulario de Oracle. El equivalente en Postgres es el ciclo
parse → plan que ocurre por ejecución cuando no hay un plan que reusar. Y hay
tres formas de mostrarlo, las tres en vivo:

**a) SQL concatenado destruye la caché de planes.**

```bash
# parametrizada: UNA entrada en pg_stat_statements
curl "$BASE/api/perf/db?mode=parametrizada" -H "x-api-key: $KEY"
# literal: una entrada NUEVA POR REQUEST
curl "$BASE/api/perf/db?mode=literal" -H "x-api-key: $KEY"
```

Poné JMeter con `-JdbMode=literal` y mirá el panel **"Entradas en
pg_stat_statements"** dispararse. Ese es el hard parse, visible.

> `track_planning` está en `off` en esta instancia, así que `total_plan_time`
> da 0 y no se puede graficar el tiempo de planificación directamente. El
> conteo de entradas cuenta la misma historia y no depende de esa config.

**b) Planning Time contra Execution Time, a mano.**

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM qa_training.perf_carga WHERE categoria = 'cat_7' LIMIT 50;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM qa_training.perf_carga WHERE codigo = 'cod_54321';
```

El segundo es un Seq Scan sobre 100k filas: `codigo` no tiene índice a
propósito. Mirá también `Buffers: shared read` contra `shared hit` — eso es
`shared_buffers` (224 MB) haciendo o no su trabajo.

**c) Plan genérico contra plan custom.**

```sql
SET plan_cache_mode = force_generic_plan;
SET plan_cache_mode = force_custom_plan;
```

**El remate — y esto está en esta misma aplicación:** `lib/db.ts` se conecta
por el **pooler en modo transacción** (puerto 6543, obligatorio porque el host
directo es IPv6-only y Vercel no tiene egress IPv6). pgbouncer en modo
transacción **no sostiene prepared statements con nombre**. Es decir: aunque
todo el código usa `$1` correctamente, cada `pool.query` se vuelve a parsear y
planificar del lado del servidor. El antipatrón no es hipotético — es una
consecuencia de una decisión de infraestructura tomada por otra razón
completamente distinta.

---

## 3. Sizing de un cluster de k8s por aplicación

**Demo:** el contenedor arranca con `cpus: "0.5"`. Corré JMeter con 20 hilos,
mostrá el p95 estable. Después editá `perf/docker-compose.yml` a `"0.25"`,
`docker compose up -d api`, y repetí la misma corrida.

En el panel **"CPU del contenedor"**,
`container_cpu_cfs_throttled_periods_total` empieza a subir *antes* de que
falle ninguna request: el throttling de CFS aparece como latencia, no como
error. Es exactamente el modo en que un pod mal dimensionado degrada sin que
salte ninguna alarma de disponibilidad.

**El contraste:** el mismo código en Vercel no tiene pod. El panel de
auto-reporte muestra varios `instance_id` distintos apareciendo y
desapareciendo. No hay una instancia que crezca; hay N que nacen, atienden y
mueren — con cold start. Dimensionar eso es otra conversación: no es cuánta CPU
por pod, es cuántas conexiones a la base va a abrir la enésima instancia.

---

## 4. Red y rate limit

**Demo:** el mismo plan de JMeter, cambiando una sola propiedad.

```bash
jmeter -n -t perf/jmeter/aiquaa-perf.jmx ... -JendpointEcho=/api/perf/echo          # 3000/min
jmeter -n -t perf/jmeter/aiquaa-perf.jmx ... -JendpointEcho=/api/perf/echo-limited  # 10/min
```

Los dos endpoints son **el mismo handler**. Lo único distinto es el límite.

Mostrá en la respuesta: `Retry-After`, `X-RateLimit-Remaining`,
`X-RateLimit-Reset` — también en las respuestas 200, no solo en el 429.

**El remate:** el assertion del plan rechaza el 429 a propósito. Un plan que
cuenta los 429 como "respuesta recibida" reporta un throughput que el sistema
nunca entregó. El rate limit no es un detalle de implementación: es parte del
contrato, y la prueba tiene que medirlo como tal.

---

## 5. Apoyarse en la IA para conocer la arquitectura

**Demo:** [Archify](file:///Z:/Proyectos/archify) (`Z:\Proyectos\archify`)
genera un mapa interactivo del sistema a partir del código: nodos, aristas,
rutas reales, comparación antes/después.

Generalo en vivo sobre este repo y mostrá el resultado: dos pipelines
compartidos (`lib/api-route.ts` y `lib/handle-sql-request.ts`), cuatro roles de
Postgres con propósitos distintos, dos schemas aislados por cohorte.

**El remate:** el QA que va a estresar un sistema que no escribió necesita
saber, *antes*, dónde están los cuellos y qué comparte recursos con qué. Antes
eso eran dos semanas de leer código o una reunión con alguien que quizás ya no
está. Es el paso previo a diseñar la prueba, no un lujo.

---

## 6. JMeter con variables dinámicas

**Demo:** abrir `perf/jmeter/aiquaa-perf.jmx` y recorrer cuatro cosas:

1. **CSV Data Set** (`grupos.csv`): cada hilo toma un grupo distinto.
2. **Once Only Controller + JSON Extractor**: cada hilo hace login con *su*
   usuario y extrae *su* JWT a `${token}`, que después va en el header
   `Authorization: Bearer`.
3. **`__Random` / `__UUID`** en ids, montos y payloads.
4. **`Idempotency-Key` = `${__UUID}`** por iteración.

**El remate:** un plan que pega siempre al mismo `id=1` con el mismo token
mide la caché, no el sistema. Se ve en el panel de cache hit ratio: se clava en
1.00 y el p95 queda irrealmente bajo. La carga tiene que parecerse al tráfico,
o el número que sale no sirve para dimensionar nada.

---

## 7. Cadena de conexión, réplicas y pool

**Demo:** abrir `.env.example` y `lib/db.ts`, y hacer la aritmética en el
pizarrón:

- `max_connections = 60`, compartido con **datos de producción ajenos** que
  viven fuera de `qa_training`.
- `lib/db.ts` usa `max: 1` por instancia. Con 7 pools posibles por proceso, una
  instancia puede abrir hasta 7 conexiones lógicas.
- Si alguien "optimiza" el pool a `max: 20`: la tercera réplica ya no conecta.

Mostrá el panel **"Conexiones por estado"** durante una corrida, y explicá
`idle in transaction`: una transacción abierta que no hace nada sigue ocupando
una de las 60.

**El remate:** en serverless el pool no se dimensiona por instancia sino por
*cantidad de instancias × pool*, un número que no controlás. Por eso el pooler
en modo transacción es obligatorio y por eso `max: 1` es correcto aunque parezca
absurdamente bajo.

Y el otro detalle de la cadena de conexión, ya documentado en el repo porque
costó producción: el host directo de este proyecto es **IPv6-only** y Vercel
serverless **no tiene egress IPv6**. La cadena "correcta" del panel de Supabase
falla con `getaddrinfo ENOTFOUND` desde Vercel y funciona perfecto desde tu
laptop. Un detalle de red que no aparece en ninguna prueba de carga.

---

## 8. Control de idempotencia

**Demo:**

```bash
KEY=$(uuidgen)
curl -X POST "$BASE/api/perf/db" -H "x-api-key: $APIKEY" \
  -H "Idempotency-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"categoria":"demo","monto":500}' -i
# 201, Idempotent-Replay: false

curl -X POST "$BASE/api/perf/db" -H "x-api-key: $APIKEY" \
  -H "Idempotency-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"categoria":"demo","monto":500}' -i
# 200, Idempotent-Replay: true, MISMO id
```

Después quitá el header: **400**. Es obligatorio a propósito.

**El remate:** bajo carga los reintentos no son un caso raro, son el caso
normal — el cliente da timeout, el balanceador reintenta, el SDK tiene retry
automático. Sin clave de idempotencia, una prueba de carga sobre un endpoint de
pagos no mide rendimiento: genera transacciones duplicadas. Y la clave es por
*operación lógica*, no por intento.

---

## 9. El QA releva el máximo de transacciones ANTES de probar

**Demo:** empezar por acá, no terminar.

```bash
curl "$BASE/api/perf/limits" -H "x-api-key: $APIKEY" | jq
```

Devuelve `max_connections: 60`, `shared_buffers`, el modo del pooler,
`poolMaxPorInstancia: 1`, los rate limits por ruta y las conexiones vivas.

**El remate:** con esos números, el diseño de la prueba se cae solo:

- Más de ~50 conexiones concurrentes contra la base no mide la aplicación, mide
  el agotamiento del pool.
- Más de 3000 req/min contra `/api/perf/echo` mide el rate limit.
- El throughput objetivo hay que fijarlo **antes**, y hay que poder justificarlo.

Un QA que llega a la prueba sin estos números va a reportar un cuello de
botella que en realidad es un límite de configuración. Y eso es peor que no
probar: es una conclusión equivocada con un gráfico al lado.

---

## Orden sugerido y tiempos

| Bloque | Min | Demo en vivo |
|---|---|---|
| 9 — relevar techos primero | 5 | `GET /api/perf/limits` |
| 1 — por qué monitorear | 5 | JMeter a ciegas vs con dashboards |
| 6 — JMeter realista | 10 | recorrer el `.jmx` |
| 4 — red y rate limit | 8 | echo vs echo-limited |
| 2 — hard parse y tuning | 12 | `mode=literal` + `EXPLAIN ANALYZE` |
| 7 — conexión y réplicas | 8 | aritmética de las 60 conexiones |
| 3 — sizing de k8s | 10 | bajar el límite a 0.25 CPU |
| 8 — idempotencia | 5 | doble POST con la misma clave |
| 5 — IA y arquitectura | 7 | Archify sobre este repo |

**Ensayar la corrida completa antes del día.** Todo lo de arriba depende de que
Grafana Cloud esté recibiendo datos, y eso no se arregla en vivo.
