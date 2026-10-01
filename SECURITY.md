# Security policy

## Supported versions

Only the latest `0.x` release receives security fixes. Cubito is pre-1.0: upgrade to the newest tag (`ghcr.io/tincke10/cubito:latest`).

## Reporting a vulnerability

Please do not open a public issue. Report it privately through GitHub's private vulnerability reporting on [tincke10/Cubito](https://github.com/tincke10/Cubito/security/advisories/new) (Security tab, "Report a vulnerability"). Include the version, how you run Cubito (Docker or native macOS), reproduction steps and the impact you see. Expect an acknowledgement within a few days; this is a small project, so there is no formal SLA.

## Scope

In scope: the `orcad` engine as shipped by Cubito, the frontend in `frontend/`, the Docker image and `compose.yaml`, the pairing flow, and credential handling.

Out of scope: vulnerabilities in upstream [ORCA](https://github.com/stablyai/orca) code that Cubito does not ship or reach, Claude Code and other agent CLIs, Docker itself, and anything that requires you to already run arbitrary code on the host or inside the container (see the threat model).

## Threat model

- **Agents execute code.** `orcad` launches coding agents and terminals that run commands with the privileges of its user (the unprivileged `node` user inside the container). Anyone who can reach `orcad` while paired can run code. Treat the container, or your macOS user, as the trust boundary.
- **Loopback only.** `compose.yaml` publishes `6799` on `127.0.0.1` only, so the LAN cannot reach it, and a native `orcad` binds loopback by default. The container binds `0.0.0.0` internally for Docker's port mapping; do not widen the published address unless you understand the exposure.
- **Paired, end-to-end encrypted.** The frontend pairs with `orcad` using a code carried in the URL fragment and holds a device token. The offer is kept in the tab's `sessionStorage`, so it dies with the tab. Anyone with the pairing URL can control `orcad`: do not share it or paste it into logs.
- **Permission bypass is opt-in.** Agents ask before risky actions by default. `CUBITO_AGENT_BYPASS=accept` runs them without prompts; only enable it because the container is the sandbox, since agents can then act freely on everything mounted in it (data, worktrees, `/repos`).
- **Credential sealing.** Credentials stored in Cubito (Linear, Jira, ...) are sealed with AES-256-GCM when `CUBITO_SECRET_KEY` (or `CUBITO_SECRET_KEY_FILE`) is set. Otherwise, on macOS the key lives in the login Keychain; failing both, credentials are stored unsealed in a `0700` data directory and orcad warns at startup. Host tokens (`GH_TOKEN`, `GITLAB_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`) are passed through the environment, never written to the repo, and are visible to every agent in the container.
- **No default egress from Cubito.** Cubito sends no telemetry, runs no update check and uses no cloud relay; the frontend loads only from your own `orcad`. What leaves the machine is what you start: agents talking to their provider, git remotes, `gh`/`glab` when you push or open PRs/MRs, and whatever repo setup commands and agents run. See the README's Privacy / network section.
