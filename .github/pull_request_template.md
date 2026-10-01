## Summary

<!-- What changed, in plain language. The PR title is the one-liner. -->

## Why

<!-- What problem does this solve, and why is this approach right? -->

## Linked issue

<!-- There should be one. -->

Fixes #

## Visual proof

<!-- UI changes: before and after (drag and drop screenshots or video; do not commit them). No visual change: write `N/A` and say why. -->

## Testing

<!-- Steps a reviewer can follow. Docker or native macOS? Which browser? -->

- [ ] Tests written first and passing (`pnpm test <file>` / `pnpm --dir frontend run test`)
- [ ] Validated against a headless `orcad` in a browser (UI changes), or N/A

## Checklist

- [ ] Small and focused, conventional commit messages
- [ ] `pnpm tc`, `oxlint` and `pnpm --dir frontend run typecheck` / `lint` pass
- [ ] Did not run `pnpm run format` repo-wide
- [ ] Changes under `src/main|shared|cli|relay` are additive and wire-compatible (or N/A)
- [ ] Docs (README, `docs/ROADMAP.md`) updated if behavior or env vars changed
