<h1 align="center">🧊 Cubito</h1>

<p align="center">
  <strong>A 3D Agent Development Environment.</strong><br/>
  Your parallel AI coding agents, visualized as a living graph you can fly through.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-MIT-08C?style=flat" alt="License: MIT" />
  <img src="https://img.shields.io/badge/status-early%20development-orange?style=flat" alt="Status: early development" />
  <img src="https://img.shields.io/badge/engine-orcad%20(headless)-4493F8?style=flat" alt="Engine: orcad headless" />
</p>

---

## What is Cubito?

Today's agent orchestrators let you fan one prompt across N coding agents, each in its own isolated git worktree. That's powerful — but the UX is still tabs, panes and lists. You *manage* the parallelism; you never *see* it.

Cubito replaces the frontend with a **GPU-rendered 3D environment with terminal aesthetics**:

- **Your project is a graph.** Every worktree is a node in a navigable 3D scene. Parent → child lineage (which worktree spawned which) becomes visible edges instead of hidden metadata.
- **Worktrees are created graphically.** Spawn a new worktree from any node, fan a prompt across five agents, and watch five branches grow in space — then compare and merge the winner.
- **Agents are alive in the scene.** Each node carries its terminal: real PTYs, streamed over RPC, rendered inside the world.

Under the hood, Cubito does **not** reinvent orchestration. It runs **`orcad`** — the headless, Electron-free runtime extracted from [ORCA](https://github.com/stablyai/orca) — as a background daemon, and speaks to it over its versioned WebSocket RPC.

## Architecture

```
┌─────────────────────────────────────────────┐
│           Cubito 3D Frontend                │
│   Three.js / WebGPU · terminal aesthetics   │
│   worktree graph · in-scene terminals       │
└──────────────────────┬──────────────────────┘
                       │  WebSocket RPC (versioned envelope)
                       │  worktree.* · terminal.* · git.* · orchestration.*
┌──────────────────────┴──────────────────────┐
│              orcad  (headless daemon)       │
│   plain Node, zero Electron — CI-enforced   │
├─────────────┬───────────────┬───────────────┤
│ git         │ PTY daemon    │ orchestration │
│ worktrees   │ (node-pty,    │ DAG (SQLite)  │
│ + lineage   │  survives     │ coordinator · │
│ graph       │  restarts)    │ fan-out       │
└─────────────┴───────────────┴───────────────┘
```

The engine manages repos, worktrees with full parent/child lineage, PTY terminals that survive daemon restarts, and multi-agent orchestration runs (Claude Code, Codex, OpenCode and 30+ CLI agents). Cubito's job is to make all of that **spatial**.

## Status

Early development. Honest checklist:

- [x] **Engine validated** — orcad built and run headless in Docker: repo registration, worktree creation with lineage, live PTY create/read over RPC, graph state persisted across daemon restarts.
- [x] **Fork & prune** — Electron shell, desktop renderer, mobile apps and relay removed (10,461 files). `pnpm build:orcad` stays green: 5.6 MB bundle, zero Electron imports. Full upstream history retained for future merges.
- [ ] **3D frontend** — Three.js/WebGPU scene: worktree graph layout, camera navigation, node interactions.
- [ ] **In-scene terminals** — RPC terminal streaming rendered as textures in the world.
- [ ] **Graphical fan-out** — create N worktrees from a node, one prompt each, compare results side by side.

## Development

The engine builds and runs on plain Node 24 — no Electron, no display server. Everything below works inside a container:

```bash
pnpm install --ignore-scripts
node config/scripts/ensure-native-runtime.mjs --runtime=node   # rebuild node-pty for Node
pnpm build:cli && pnpm build:orcad

# run the daemon (isolated data root)
ORCA_USER_DATA=~/cubito-data node out/orcad/orcad.js --bind 127.0.0.1 --json

# drive it with the CLI (note: different env var, same directory)
export ORCA_USER_DATA_PATH=~/cubito-data
node out/cli/index.js repo add --path /path/to/repo --json
node out/cli/index.js worktree create --repo path:/path/to/repo --name my-task --json
node out/cli/index.js worktree list --json
```

## Credits

Cubito is built on [ORCA](https://github.com/stablyai/orca) by Stably AI / Lovecast Inc., MIT licensed. The entire orchestration engine — `orcad`, the worktree lineage model, the PTY daemon, the RPC surface — is their work, and it's excellent. Cubito removes the desktop frontend and builds a different kind of window into it. Upstream remains mergeable by design.

## License

[MIT](LICENSE) — original engine © Lovecast Inc., Cubito modifications © Martín Moreira.
