# Two stages: build with the full toolchain, ship only what runs.
#
# Node 22 is required, not preferred. The server stores everything through
# node:sqlite, which is built into Node from 22 — there is no database driver in
# package.json and nothing to compile at install time.
FROM node:22-slim AS build
WORKDIR /app

# Dependencies first, so a code change does not re-install node_modules.
COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
# Builds the browser app into dist/ and the server into dist-server/, and copies
# schema.sql alongside the compiled server — tsc emits .js only, and a server
# without its schema starts and then fails on the first query.
RUN npm run build && npm run build:server

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production

# Only the production dependencies. The build toolchain does not ship.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

# The database lives on the mounted volume, not in the image layer, or every
# deploy would wipe the pilot. See fly.toml.
ENV DB_PATH=/data/carpool.db
ENV PORT=8080
EXPOSE 8080

# Fly terminates TLS at its edge and forwards over the private network, so the
# process itself serves plain HTTP and is told the connection was secure.
ENV TRUST_PROXY=1

# Unprivileged. The node image ships a `node` user; /data is chowned by the
# volume mount, so only the app directory needs it here.
USER node

CMD ["node", "dist-server/server/index.js"]
