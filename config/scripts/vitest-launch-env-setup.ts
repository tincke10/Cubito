/**
 * Why: upstream's CI runs the suite with ORCA_BACKGROUND_LAUNCH=1 (keeps spawned app/preflight
 * children off screen), and a run started inside an Orca terminal inherits its shell-wrapper
 * ZDOTDIR, which changes what spawned zsh fixtures source. Pinning both here makes `pnpm test`
 * behave like CI wherever it is launched.
 */
process.env.ORCA_BACKGROUND_LAUNCH = '1'
delete process.env.ZDOTDIR
