#!/bin/sh
# Why: orcad probes `glab auth status` on every [d]; with no credentials the real binary still
# calls gitlab.com. Answer "not logged in" offline instead; everything else runs the real glab.
real="${GLAB_REAL_BIN:-/usr/local/libexec/glab-real}"

if [ "${1:-}" = "auth" ] && [ "${2:-}" = "status" ] \
  && [ -z "${GITLAB_TOKEN:-}" ] && [ -z "${GITLAB_ACCESS_TOKEN:-}" ] && [ -z "${GLAB_TOKEN:-}" ]; then
  cfg="${GLAB_CONFIG_DIR:-${XDG_CONFIG_HOME:-${HOME:-/nonexistent}/.config}/glab-cli}"
  configured=""
  for f in "$cfg/config.yml" "$cfg/hosts.yml"; do
    if [ -f "$f" ] && grep -Eqi '^[[:space:]]*(token|job_token|oauth_token):[[:space:]]*[^[:space:]#]' "$f"; then
      configured=1
    fi
  done
  if [ -z "$configured" ]; then
    echo "Not logged in: no GitLab host configured. Run glab auth login or set GITLAB_TOKEN." >&2
    exit 1
  fi
fi

exec "$real" "$@"
