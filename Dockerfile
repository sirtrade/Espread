## Builds the Mini App (webapp/dist) and the API/bot/scheduler server
## (server/dist) into a single runtime image that serves everything on
## one port (Traefik/nginx terminates TLS in front of it — see README).

FROM node:22-slim AS webapp-build
WORKDIR /app
COPY webapp/package.json webapp/package-lock.json ./
RUN npm ci
COPY webapp/ ./
RUN npm run build

FROM node:22-slim AS server-build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npm run build

# better-sqlite3 needs to compile its native binding; do that with build
# tools present, then copy the resulting node_modules into the slim
# runtime stage below so the final image stays small.
FROM node:22-slim AS server-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-build /app/dist ./dist
COPY --from=server-build /app/drizzle ./drizzle
COPY --from=server-build /app/package.json ./package.json
COPY --from=server-build /app/scripts ./scripts
COPY --from=webapp-build /app/dist ./webapp-dist

ENV NODE_ENV=production
ENV DB_PATH=/data/lector.db
ENV STATIC_DIR=/app/webapp-dist
ENV PORT=3000

VOLUME /data
EXPOSE 3000

CMD ["node", "dist/main.js"]
