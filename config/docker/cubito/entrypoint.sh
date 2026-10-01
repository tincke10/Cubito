#!/usr/bin/env bash
set -euo pipefail

mkdir -p /data /workspaces /repos
chmod 700 /data

register_args=""
if [ ! -d /repos/demo-nest ]; then
  cp -r config/docker/cubito/demo-repo /repos/demo-nest
  git -C /repos/demo-nest init -q
  git -C /repos/demo-nest -c user.name=cubito -c user.email=cubito@localhost add -A
  git -C /repos/demo-nest -c user.name=cubito -c user.email=cubito@localhost commit -q -m 'seed demo-nest'
  register_args="--register-repo /repos/demo-nest"
fi

# Why: volumes created by earlier root-run images, and the seed above, are root-owned.
find /data /workspaces /repos ! -user node -exec chown -h node:node {} +

# Why: a spawned Claude blocks on first-run onboarding (and the bypass warning, default "exit") otherwise.
agent_mode=manual
seed_args=""
if [ "${CUBITO_AGENT_BYPASS:-}" = "accept" ]; then
  agent_mode=yolo
  seed_args="--accept-bypass"
fi
setpriv --reuid=node --regid=node --init-groups env HOME=/home/node node config/scripts/cubito-claude-config-seed.mjs $seed_args

# Why: agents commit as the node user, which has no git identity of its own.
if [ -n "${CUBITO_GIT_NAME:-}" ] && [ -n "${CUBITO_GIT_EMAIL:-}" ]; then
  setpriv --reuid=node --regid=node --init-groups env HOME=/home/node git config --global user.name "$CUBITO_GIT_NAME"
  setpriv --reuid=node --regid=node --init-groups env HOME=/home/node git config --global user.email "$CUBITO_GIT_EMAIL"
else
  echo "[cubito] warning: set CUBITO_GIT_NAME and CUBITO_GIT_EMAIL so agents can commit" >&2
fi

# Why: git push over HTTPS and gh/glab need the tokens; the helper reads them from the env, so no
# token is ever written to a file or printed here.
as_node() { setpriv --reuid=node --regid=node --init-groups env HOME=/home/node "$@"; }
configure_credential_helper() {
  host_url="$1"
  helper="$2"
  as_node git config --global --unset-all "credential.${host_url}.helper" || true
  as_node git config --global --add "credential.${host_url}.helper" ''
  as_node git config --global --add "credential.${host_url}.helper" "$helper"
}
if [ -n "${GH_TOKEN:-}" ]; then
  configure_credential_helper https://github.com '!gh auth git-credential'
fi
if [ -n "${GITLAB_TOKEN:-}" ]; then
  configure_credential_helper https://gitlab.com '!glab auth git-credential'
fi

# Why not root: agents launched with bypass permissions are refused by Claude Code as root.
exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node node config/scripts/cubito-start.mjs $register_args --agent-permissions "$agent_mode"
