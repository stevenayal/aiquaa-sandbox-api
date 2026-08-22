# Requerimientos funcionales por grupo (BDD)

Un PDF por cada uno de los 10 grupos del curso de Automatización de Pruebas (CIT), con la
lógica de negocio del módulo que le toca a ese grupo. Sirven de fuente para escribir los
escenarios Gherkin y los casos de prueba automatizados.

| Grupo | Módulo | Archivo |
|---|---|---|
| 1 | Autenticación y Acceso | [grupo-01-autenticacion-y-acceso.pdf](./grupo-01-autenticacion-y-acceso.pdf) |
| 2 | Transferencias entre Cuentas | [grupo-02-transferencias-entre-cuentas.pdf](./grupo-02-transferencias-entre-cuentas.pdf) |
| 3 | Pagos de Servicios | [grupo-03-pagos-de-servicios.pdf](./grupo-03-pagos-de-servicios.pdf) |
| 4 | Registro de Usuario / Onboarding | [grupo-04-registro-de-usuario-onboarding.pdf](./grupo-04-registro-de-usuario-onboarding.pdf) |
| 5 | Tarjetas de Crédito/Débito | [grupo-05-tarjetas-credito-debito.pdf](./grupo-05-tarjetas-credito-debito.pdf) |
| 6 | Notificaciones y Alertas | [grupo-06-notificaciones-y-alertas.pdf](./grupo-06-notificaciones-y-alertas.pdf) |
| 7 | Carrito de Compras / E-commerce | [grupo-07-carrito-de-compras-ecommerce.pdf](./grupo-07-carrito-de-compras-ecommerce.pdf) |
| 8 | Reservas / Turnos | [grupo-08-reservas-y-turnos.pdf](./grupo-08-reservas-y-turnos.pdf) |
| 9 | Reportes y Dashboard | [grupo-09-reportes-y-dashboard.pdf](./grupo-09-reportes-y-dashboard.pdf) |
| 10 | Administración de Roles y Permisos | [grupo-10-administracion-de-roles-y-permisos.pdf](./grupo-10-administracion-de-roles-y-permisos.pdf) |

## Qué contiene cada documento

Alcance y actores · precondiciones de acceso (API key, límite de caudal, doble capa del
front) · modelo de datos del módulo · requerimientos funcionales `RF-G{n}-{nn}` con entradas,
reglas, respuesta y errores · reglas transversales de la API · flujo en la aplicación web ·
criterios de aceptación en prosa · anexo normativo (BCP / SEDECO) con las brechas del sandbox.

Los documentos describen **lo que el código hace hoy**, incluidas las simplificaciones
deliberadas del sandbox (por ejemplo: una transferencia no mueve saldos, el login no valida
contraseña). Esas simplificaciones están listadas como brechas en la sección 8, para que
nadie escriba un escenario esperando un comportamiento que no existe.

El anexo normativo es material de referencia **orientativo** para dar contexto de negocio: las
normas citadas se mencionan de forma general y deben validarse con su texto vigente antes de
usarse como criterio de cumplimiento. El sandbox es un entorno didáctico y no pretende cumplir
ninguna de ellas.

## Regenerar los PDFs

Las fuentes viven en `_src/`: `comun.mjs` (metadatos y secciones compartidas), `grupo-NN.mjs`
(contenido de cada grupo), `plantilla.mjs` (HTML + estilos) y `build.mjs` (generador).

```bash
node docs/requerimientos/_src/build.mjs
```

Con argumentos, regenera solo esos grupos:

```bash
node docs/requerimientos/_src/build.mjs 3 7
```

El generador arma el HTML en `_src/html/` y lo imprime a PDF con Chrome (o Edge) en modo
headless, vía el protocolo DevTools, para agregar la cabecera (logo del CIT, curso y docente)
y el pie de página (numeración) en cada página impresa. Si ese canal no levanta, cae
automáticamente a `--print-to-pdf`, que produce el mismo documento sin cabecera ni pie de
página. No requiere instalar dependencias.

El logo institucional vive en `_src/assets/cit-logo.png` y se embebe como base64 tanto en la
portada (grande, centrado) como en la cabecera de cada página (chico, junto al nombre del
curso y el docente).

Al cambiar el comportamiento de una ruta de `app/api/v1/**`, actualizá el `grupo-NN.mjs`
correspondiente y volvé a generar el PDF de ese grupo.
