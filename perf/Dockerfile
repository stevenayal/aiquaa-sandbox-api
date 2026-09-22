# Imagen de la API para la demo de rendimiento LOCAL. No es como se despliega
# en produccion (eso es Vercel serverless, sin contenedor): existe justamente
# para tener un proceso con limites de CPU y memoria observables, que es lo que
# Vercel no ofrece y lo que hace falta para la parte de sizing de la charla.
#
# Se construye desde la raiz del repo:
#   docker compose -f perf/docker-compose.yml up --build
FROM node:22-alpine

WORKDIR /app

# Capa de dependencias aparte para que un cambio de codigo no reinstale todo.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# El build es tambien el type-check del proyecto (no hay script `tsc`).
RUN npm run build

EXPOSE 3000

# Sin --max-old-space-size a proposito: queremos ver a Node chocar contra el
# limite de memoria del contenedor, no contra uno propio de V8.
CMD ["npm", "start"]
