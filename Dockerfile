# Portable alternative to Render's native Node runtime (render.yaml) — use
# this if deploying to Fly.io, Railway, or anywhere else that expects a
# container. Not required for the Render Blueprint deployment.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/migrations ./src/db/migrations

EXPOSE 3000

# Migrations run before the server starts on every deploy. node-pg-migrate
# tracks applied migrations in its own table, so re-running this on a
# container restart (not just a fresh deploy) is a safe no-op.
CMD ["sh", "-c", "npx node-pg-migrate up -m src/db/migrations && node dist/index.js"]
