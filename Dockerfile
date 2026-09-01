FROM node:24-bookworm-slim AS build

WORKDIR /app

ARG MIFTAH_BUILD_SHA
ENV VERCEL_GIT_COMMIT_SHA=$MIFTAH_BUILD_SHA

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN set -a \
  && . ./.env.production \
  && set +a \
  && npm run build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static

USER node
EXPOSE 3000

CMD ["node", "server.js"]
