FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    DEVOPEN_ROOT=/workspace \
    DEVOPEN_WEB_PORT=8787 \
    DEVOPEN_CONTAINER=true

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --ignore-scripts

COPY index.js ./
COPY lib ./lib
COPY assets ./assets
COPY tools.json providers.json config.json ./

EXPOSE 8787
VOLUME ["/workspace"]

CMD ["node", "index.js", "web"]
