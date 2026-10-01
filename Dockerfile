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

# Runtime's real external closure, computed (not hand-copied) from these roots' full transitive
# dependencies + optionalDependencies — a fixed sibling list brings a package's neighbors but not
# the neighbors' own deps (e.g. is-glob without its is-extglob). The two `node -e` lines fail the
# build, not a container at runtime, if the staged closure is incomplete.
# Roots: orcad's esbuild externals (node-pty, @parcel/watcher) + the unbundled tsc CLI's imports.
RUN node config/scripts/cubito-stage-runtime-deps.mjs \
    --from /app --to /stage/node_modules \
    --root node-pty --root @parcel/watcher --root zod --root ws --root tweetnacl --root yaml \
    --root jsonc-parser \
  && node -e "process.chdir('/app'); require('/stage/node_modules/node-pty'); require('/stage/node_modules/@parcel/watcher')" \
  && NODE_PATH=/stage/node_modules node -e "require('/app/out/cli/index.js')"

FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# git: worktree operations. ca-certificates: HTTPS clones, npm/claude-code installs.
# curl: the agent status hooks POST every event to orcad with it.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
  && rm -rf /var/lib/apt/lists/*

# Why: Cubito's commit/PR/MR actions shell out to gh and glab; release tarballs are pinned and
# checksum-verified per architecture instead of trusting a moving apt repo.
ARG GH_VERSION=2.102.0
ARG GH_SHA256_AMD64=bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386
ARG GH_SHA256_ARM64=7862c86c72f43df3a2d93ddde6f473285b4e2af61b494849846827e513ef6484
ARG GLAB_VERSION=1.120.0
ARG GLAB_SHA256_AMD64=4e6c59de9f7ed2f304bf93aad01ea8f8a69584f0450ce90ad696ef81f69c69aa
ARG GLAB_SHA256_ARM64=c60ebb4cb36f276714847a118845b9b4e69f46a8080c68b21ca63f158722cdea
RUN set -eu; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) gh_sha="$GH_SHA256_AMD64"; glab_sha="$GLAB_SHA256_AMD64" ;; \
    arm64) gh_sha="$GH_SHA256_ARM64"; glab_sha="$GLAB_SHA256_ARM64" ;; \
    *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/gh.tgz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_${arch}.tar.gz"; \
  echo "${gh_sha}  /tmp/gh.tgz" | sha256sum -c -; \
  tar -xzf /tmp/gh.tgz -C /tmp --strip-components=2 "gh_${GH_VERSION}_linux_${arch}/bin/gh"; \
  install -m 755 /tmp/gh /usr/local/bin/gh; \
  curl -fsSL -o /tmp/glab.tgz "https://gitlab.com/gitlab-org/cli/-/releases/v${GLAB_VERSION}/downloads/glab_${GLAB_VERSION}_linux_${arch}.tar.gz"; \
  echo "${glab_sha}  /tmp/glab.tgz" | sha256sum -c -; \
  tar -xzf /tmp/glab.tgz -C /tmp --strip-components=1 bin/glab; \
  install -D -m 755 /tmp/glab /usr/local/libexec/glab-real; \
  rm -f /tmp/gh /tmp/glab /tmp/gh.tgz /tmp/glab.tgz; \
  gh --version; /usr/local/libexec/glab-real --version

# Why: the wrapper answers `glab auth status` offline when nothing is configured (see the script).
COPY config/docker/cubito/glab-wrapper.sh /usr/local/bin/glab
RUN chmod 755 /usr/local/bin/glab

RUN npm i -g @anthropic-ai/claude-code

# Why: repo setup commands (pnpm install / yarn) run in worktrees; corepack provides the shims.
RUN corepack enable

# Why: terminals source /etc/profile, which on Debian resets PATH and drops cubito-start's shim dir;
# `docker compose exec` shells lack ORCA_USER_DATA_PATH, so default it to the data volume.
RUN printf '#!/bin/sh\nexport ORCA_USER_DATA_PATH="${ORCA_USER_DATA_PATH:-${ORCA_USER_DATA:-/data}}"\nexec node /app/out/cli/index.js "$@"\n' > /usr/local/bin/orca \
  && chmod 755 /usr/local/bin/orca

WORKDIR /app

COPY --from=builder /app/out out
COPY --from=builder /stage/node_modules node_modules
COPY --from=builder /app/config/scripts/cubito-*.mjs config/scripts/
COPY --from=builder /app/config/docker/cubito/demo-repo config/docker/cubito/demo-repo

COPY config/docker/cubito/entrypoint.sh /usr/local/bin/cubito-entrypoint
RUN chmod +x /usr/local/bin/cubito-entrypoint

EXPOSE 6799

ENTRYPOINT ["/usr/local/bin/cubito-entrypoint"]
