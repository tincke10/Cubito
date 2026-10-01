# Changelog

All notable changes to Cubito are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-01

First public release: a spatial frontend over ORCA's headless engine, published as the multi-arch image `ghcr.io/tincke10/cubito` (amd64, arm64) plus a macOS install from source.

### Added

- 3D worktree graph with lineage edges, camera heights (general, island, focus, compare), picking and keyboard navigation.
- Spawn a worktree from any node, with or without a starting agent and prompt; trust is pre-marked for Claude Code, Codex, Cursor and Copilot so agents land on their prompt.
- Fan-out: one prompt across N children with per-child failure reasons, and gates and questions answered from the scene.
- Compare view with winner selection, headless merge into the parent and opt-in parent working-tree sync.
- Diff view (`d`) with a file rail, line panel, rename awareness, and stage, commit and push; PR/MR creation through `gh` and `glab`.
- Live system graph (`x`) of routers, endpoints, services and databases for Express, Fastify, NestJS and Hono, with uncommitted diffs painted on as agents write.
- In-scene terminals: multiple PTYs per worktree, the agent's own terminal first.
- Delete worktree (two-step confirmation), quick-open (`o`) and edit with `Cmd/Ctrl+S`.
- Per-repo setup command so new worktrees get their dependencies; the parent re-runs it after a merge that touches manifests.
- Agent attention notifications (HUD toast and browser Notification) and an automations scheduler (`orca automations`).
- Credentials sealed with AES-256-GCM via `CUBITO_SECRET_KEY` or `CUBITO_SECRET_KEY_FILE`, with Keychain on macOS.
- Docker: non-root container, `claude setup-token` login, opt-in permission bypass (`CUBITO_AGENT_BYPASS`), git identity, `gh` and `glab` in the image, seeded demo repo, `.env.example`.
- Pairing persists across reloads (per tab) and shows a demo-mode banner when absent.
- Release pipeline: `v*` tags publish the image to GHCR and create a GitHub release.

### Security

- The published port binds `127.0.0.1` only.
- Egress audited: no contact with Orca cloud services, no analytics, no updater; `glab` answers offline when unconfigured, the push gateway is not started, and Claude Code's auto-updater is disabled in the image.

[Unreleased]: https://github.com/tincke10/Cubito/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tincke10/Cubito/releases/tag/v0.1.0
