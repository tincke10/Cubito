# Contributing to Cubito

Thanks for helping. Cubito is a spatial frontend (`frontend/`) over ORCA's headless engine (`orcad`, under `src/main/`). Small, focused changes with tests are easiest to review.

## Setup

Requirements: Node 24, pnpm 10 (via `corepack enable`), git, and on macOS the Xcode Command Line Tools (`node-pty` compiles from source).

```bash
git clone https://github.com/tincke10/Cubito.git && cd Cubito
pnpm cubito:install     # installs and builds engine + frontend, stages the web client
pnpm cubito:start       # boots orcad and prints the pairing URL
```

Docker users can build from source with `pnpm cubito:docker`. See the [README](../README.md) for the rest.

## Workflow

- **Strict TDD.** Write the failing test first (RED), make it pass (GREEN), then clean up. Behavior changes and bug fixes need a test that would catch the regression, not one that only walks the happy path.
- **Conventional commits**, one logical change each: `feat(frontend): ...`, `fix(orcad): ...`, `docs(readme): ...`, `chore(docker): ...`. No AI attribution trailers.
- **Reuse before reimplementing.** Search for an existing implementation and extend it before writing a parallel one.
- Comments: one concise line, only for what is not obvious (why, not how). Never disable `max-lines`. Name files after what they contain, not `helpers` or `utils`. Type declarations go in `.ts`, not `.d.ts`.
- Cubito is cross-platform where it runs natively (macOS, Linux) and in Docker: use `path.join`, and check the platform at runtime for shortcuts (`⌘` on Mac, `Ctrl+` elsewhere).
- Keep CSS in `frontend/index.html` and reuse the `--cubito-*` tokens before inventing values.

## Checks

Run what CI runs, scoped to what you touched:

```bash
pnpm tc                                   # typecheck (or tc:node / tc:cli / tc:web)
pnpm test path/to/file.test.ts            # engine tests
pnpm exec oxlint                          # or: pnpm run check:code-quality:changed
pnpm --dir frontend run typecheck
pnpm --dir frontend run test              # one file: pnpm --dir frontend exec vitest run <path>
pnpm --dir frontend run lint
```

Never run `pnpm run format` over the whole repo: it rewrites files that follow upstream and makes syncs painful. Format only the files you changed.

If you touch `compose.yaml`, the `Dockerfile` or `config/docker/`, also run `pnpm test config/scripts/cubito-docker-shape.test.ts`.

## Validating UI changes

Validate rendered UI against a real headless `orcad` in a real browser:

```bash
node out/orcad/orcad.js --port <p> --json     # prints the pairing URL
pnpm --dir frontend run dev                   # Vite on 5180; open it through the pairing URL
```

Use a throwaway `--data-dir` so you do not touch your own Cubito data, and stop `orcad` and Vite when you are done.

## Upstream sync policy

Cubito is a fork of [ORCA](https://github.com/stablyai/orca) and merges upstream periodically. Only `src/main`, `src/shared`, `src/cli` and `src/relay` follow upstream; everywhere else Cubito wins on conflict. Engine changes here should stay additive and wire-compatible (new optional fields, new capability keys) so upstream merges and mixed-version pairings keep working. Do not edit those directories for style-only reasons.

## Pull requests

Follow the [pull request template](./pull_request_template.md): what changed and why, the linked issue, how you tested it, and before/after screenshots for UI changes. Keep PRs small and single-topic.

## Releases

Maintainer-managed. Pushing a `v*` tag runs the Cubito Release workflow (multi-arch image on GHCR plus a GitHub release). Do not bump versions in a normal PR.

## Security

Report vulnerabilities privately, see [SECURITY.md](../SECURITY.md).
