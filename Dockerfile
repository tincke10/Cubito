FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    libasound2 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libsecret-1-dev \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    pkg-config \
    python3 \
    rpm \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
  && corepack prepare pnpm@10.24.0 --activate

ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

WORKDIR /app

# Manifests + patches first so the install layer only busts on dependency changes.
COPY package.json pnpm-lock.yaml .npmrc pnpm-workspace.yaml ./
COPY config/patches/ config/patches/
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml frontend/
COPY frontend/config/patches/ frontend/config/patches/
RUN pnpm install --ignore-scripts \
  && pnpm --dir frontend install

COPY . .

RUN node config/scripts/ensure-native-runtime.mjs --runtime=node \
  && pnpm run build:cli \
  && pnpm run build:orcad \
  && pnpm --dir frontend run build

RUN npm i -g @anthropic-ai/claude-code

COPY config/docker/cubito/entrypoint.sh /usr/local/bin/cubito-entrypoint
RUN chmod +x /usr/local/bin/cubito-entrypoint

EXPOSE 6799 5180

ENTRYPOINT ["/usr/local/bin/cubito-entrypoint"]
