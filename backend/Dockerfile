# Backend em container (docker-compose.yml na raiz). Build em dois estágios:
# o primeiro compila o TypeScript, o segundo leva só dist/ e as dependências
# de produção.
FROM node:24.22.1-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

FROM node:24.22.1-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]
