FROM node:24-bookworm AS builder

ENV DEBIAN_FRONTEND=noninteractive

# node-pty is the only native module the node runtime rebuilds; no Chromium/GTK toolchain needed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    python3 \
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
  && pnpm --dir frontend run build \
  && node config/scripts/cubito-stage-web-client.mjs

# Runtime's real external closure, measured from out/{cli,orcad,shared}'s require() graph — not
# the darwin/win32-laden .pnpm store. `cp -RL` dereferences pnpm's symlinks and flattens each
# package with its siblings (where pnpm keeps deps). The two `node -e` lines fail the build,
# not a container at runtime, if the staged closure is incomplete.
RUN mkdir -p /stage/node_modules \
  && cp -RL /app/node_modules/.pnpm/node-pty@*/node_modules/. /stage/node_modules/ \
  && cp -RL /app/node_modules/.pnpm/@parcel+watcher@*/node_modules/. /stage/node_modules/ \
  && cp -RL /app/node_modules/.pnpm/zod@*/node_modules/. /stage/node_modules/ \
  && cp -RL /app/node_modules/.pnpm/ws@*/node_modules/. /stage/node_modules/ \
  && cp -RL /app/node_modules/.pnpm/tweetnacl@*/node_modules/. /stage/node_modules/ \
  && cp -RL /app/node_modules/.pnpm/yaml@*/node_modules/. /stage/node_modules/ \
  && rm -rf /stage/node_modules/node-pty/prebuilds /stage/node_modules/node-pty/src \
            /stage/node_modules/node-pty/deps /stage/node_modules/node-pty/third_party \
            /stage/node_modules/node-pty/build/Release/obj.target \
  && node -e "process.chdir('/app'); require('/stage/node_modules/node-pty'); require('/stage/node_modules/@parcel/watcher')" \
  && NODE_PATH=/stage/node_modules node -e "require('/app/out/cli/index.js')"

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# git: worktree operations. ca-certificates: HTTPS clones, npm/claude-code installs.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    git \
  && rm -rf /var/lib/apt/lists/*

RUN npm i -g @anthropic-ai/claude-code

WORKDIR /app

COPY --from=builder /app/out out
COPY --from=builder /stage/node_modules node_modules
COPY --from=builder /app/config/scripts/cubito-*.mjs config/scripts/
COPY --from=builder /app/config/docker/cubito/demo-repo config/docker/cubito/demo-repo

COPY config/docker/cubito/entrypoint.sh /usr/local/bin/cubito-entrypoint
RUN chmod +x /usr/local/bin/cubito-entrypoint

EXPOSE 6799

ENTRYPOINT ["/usr/local/bin/cubito-entrypoint"]
