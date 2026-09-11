#!/usr/bin/env bash
set -euo pipefail

mkdir -p /data /workspaces /repos
chmod 700 /data

if [ ! -d /repos/demo-nest ]; then
  cp -r config/docker/cubito/demo-repo /repos/demo-nest
  git -C /repos/demo-nest init -q
  git -C /repos/demo-nest -c user.name=cubito -c user.email=cubito@localhost add -A
  git -C /repos/demo-nest -c user.name=cubito -c user.email=cubito@localhost commit -q -m 'seed demo-nest'
fi

exec node config/scripts/cubito-start.mjs
