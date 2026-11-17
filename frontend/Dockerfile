# Frontend em container (docker-compose.yml na raiz): build do Vite servido
# pelo nginx, que também faz o papel do proxy /api do Cloudflare Pages
# (same-origin, cookie de sessão first-party).
FROM node:24.22.1-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Variáveis VITE_* entram no bundle em tempo de build.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_LEGAL_CONTROLLER_NAME=
ARG VITE_LEGAL_CONTACT_EMAIL=
ENV VITE_API_URL=/api \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_LEGAL_CONTROLLER_NAME=$VITE_LEGAL_CONTROLLER_NAME \
    VITE_LEGAL_CONTACT_EMAIL=$VITE_LEGAL_CONTACT_EMAIL
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
