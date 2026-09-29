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

# Why not root: agents launched with bypass permissions are refused by Claude Code as root.
exec setpriv --reuid=node --regid=node --init-groups env HOME=/home/node USER=node node config/scripts/cubito-start.mjs $register_args --agent-permissions "$agent_mode"
