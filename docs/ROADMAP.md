# Cubito roadmap

Estado real del fork, verificado contra `git log` y el CI. Fuente única: este archivo. Se actualiza
al cerrar cada tramo, con el commit que lo cierra.

Última revisión: 2026-10-01 · después de wirings perdidos y dev essentials (ver commits por fila).

## Cerrado

| Tramo | Contenido | Cierre |
| --- | --- | --- |
| Base | Cambios `nucleo-grafo`, `conexion-orcad` y `terminal`: grafo 3D, pairing E2EE a orcad, terminal in-scene | 2026-09-04 |
| v2 | `[d]` diff mode, `[x]` sistema en vivo, fan-out v2 con run-lease, `[c]` compare + winner merge | 2026-09-08 · `7e4e0fa27` |
| v3-1 | Tanda frontend chica: error por hijo, auto-fit de cámara, lag del working tree, texto en ventanas angostas | 2026-09-08 |
| v3-2 | Sync opt-in del working tree del parent tras un winner merge limpio | 2026-09-08 |
| v3-3 | Startup agent sin diálogo de trust + `[t]` adjunta al pty del agente | 2026-09-08 · `b4239d9a0` |
| v3-4 | Seam multi-framework del system graph + Fastify + composición de mounts entre archivos | 2026-09-09 · `93d6f0c32` |
| v4-1 | Cosmética: HUD del compare, z-order de labels, cajas `naciendo`, encuadre de la primera camada | 2026-09-09 |
| v4-2 | Un solo dispatcher de trust presets (cuatro copias → una); `CLAUDE_CONFIG_DIR` por agente | 2026-09-09 |
| v4-3 | Huecos de Fastify: `register(import(...))`, routers por namespace, prefijos dinámicos | 2026-09-09 |
| v4-4 | Parser NestJS sobre el seam (`@Controller` + decoradores de método, detector `nest`) | 2026-09-09 |
| v5-1 | Colapso de "SQL Database" ante motor concreto; `CODEX_HOME`; `CLAUDE_CONFIG_DIR` de cuenta gestionada | 2026-09-09 · `f0df93b22` |
| v5-2 | Fork cleanup (61 scripts, 3 deps), job `frontend` en CI, Nest global prefix + `RouterModule` | 2026-09-10 · `239b46b1d` |
| v5-3 | Borrado del suite Playwright/Electron y `test:ci-shard` de fuente única | 2026-09-14 · `fe8c91354` |
| v6-1 | Escena 3D con alturas (general / isla / foco / comparar), picking por raycaster, colisión de labels | 2026-09-14 · `f1bbc1bd1` |
| v6-2 | Instalación macOS + Docker, imagen slim, un solo puerto, demo repo auto-registrado | 2026-09-14 · `a6fc28e36` |
| Follow-up v6 | Compare como panel lateral a la altura comparar, `h`/`l` mueven el hijo enfocado | 2026-09-14 · `c67ed15c7` |
| Post v6 | Prueba "usuario nuevo" en Docker: diff del working tree, selección dentro de la isla, nombre en el rail, primer submit del fan-out | 2026-09-15 · `9e8231436` |
| Deuda chica | Guard de re-entrada en el spawn menu, split de `service-db-heuristic.ts`, referencias stale del cleanup, roadmap en el repo | 2026-09-18 · `167087e59` |
| v7-1 | Hono como tercer framework del system graph: collector compartido con Express, parser con cadenas fluidas y `export default`, detector y registry, golden end-to-end | 2026-09-18 · `08cea07e3` |
| v7-2 | Limpieza de deps de Electron: electron-builder, NSIS y packaging Linux, spike de relocación del daemon, herramientas de automatización del renderer, `@stablyai/playwright-test`, check de telemetría del `app.asar` | 2026-09-18 · `c0f03d4d8` |
| Agentes en Docker | Token de `claude setup-token`, contenedor sin root, bypass opt-in (`CUBITO_AGENT_BYPASS`), onboarding de Claude sembrado, identidad de git (`CUBITO_GIT_NAME`/`EMAIL`), hooks de estado instalados por orcad, `curl` en la imagen | 2026-09-29 · `089d2c4e9` |
| Dogfood fixes | Foco de la terminal al abrirla, CLI `orca` en el PATH de los agentes (el fan-out reporta), estado de agentes para spawns comunes (`worktree.ps` headless + overlay en el frontend), nombres de servicio con extensión en `[x]`, crawl de `.tsx`/`.jsx`; Hono validado en vivo | 2026-09-29 · `82b2a64b2` |
| UX fixes | Comando de setup por repo (worktrees nuevos con deps, `corepack` en la imagen) y re-setup del padre tras un merge que toca manifests; pairing que sobrevive la recarga + banner de modo demo; `j`/`k` en el rail de `[d]`; `d`↔`x` directo; la `s` del spawn ya no se filtra; panel `[t]` dentro del viewport y bajo el HUD; título del fan-out con el nodo padre; ayuda en la ruta de "agregar repo". Validado en vivo salvo el re-setup del padre (solo unit tests) | 2026-09-30 · `7deebb5ec` |
| UX follow-ups | Re-setup del padre con el `orca.yaml` pre-merge (`<commit>^1`, nunca el del ganador) validado en vivo; hint "sin setup" que se refresca en forms abiertos; `[d]` abre con el primer archivo seleccionado; el nodo recién spawneado queda seleccionado | 2026-09-30 · `f9791ccb5` |
| Sync con Orca | Merge real de upstream `d74388f8a2` (+2773 commits) en `src/main`, `src/shared`, `src/cli` y `src/relay`; lo de Cubito portado sobre la estructura nueva (trust de agentes, run-lease, merge-winner, wirings de orcad); build de orcad en Node sin Bun con todos los workers; validado en vivo en Docker con un agente Claude real | 2026-10-01 · `de5aed831` |
| Wirings perdidos | Notificaciones de atención de agentes (orcad las produce, toast en el HUD + Notification del browser con la pestaña oculta), scheduler de automations en orcad (`orca automations`), tokens cifrados con AES-256-GCM (`CUBITO_SECRET_KEY` / `_FILE` → Keychain en macOS → texto plano con aviso) | 2026-10-01 · `b2281cdc9` |
| Dev essentials | Borrar worktree (`⌫`/⌘K, confirmación en dos pasos, forzar, principal bloqueado); stage/commit/push en `[d]`; PR/MR con botón de siguiente paso; `gh`/`glab` en la imagen con `GH_TOKEN`/`GITLAB_TOKEN`; abrir archivos con `o` y editarlos con ⌘S y chequeo de conflicto. Validado en vivo salvo una PR real y el Keychain | 2026-10-01 · `937919c67` |

## Cerrado sin implementar

- **v5-2d `agentDefaultEnv` sobre SSH.** No aplica a Cubito. El orcad headless nunca registra el
  subsistema SSH: `registerSshHandlers` (`src/main/ipc/ssh.ts`) solo lo llamaba el main de Electron,
  borrado en `bb24b404b`. Cualquier `ssh.connect` termina en `ssh_handlers_not_registered` y el trust
  remoto retorna sin escribir. Tampoco hay RPC para agregar targets ni superficie SSH en el frontend.
  Si algún día Cubito quiere hosts remotos, es un cambio de engine (cablear SSH en `orcad-entry`),
  no un check de validación. Decidido el 2026-09-18.
- **Incidente del fixture (`.git/HEAD` perdido el 2026-09-08 23:14).** No reproducible y sin
  path de engine que lo explique: la remoción destructiva pasa siempre por
  `isDangerousWorktreeRemovalPath`, y el único mecanismo que muta el working tree del parent es el
  `git read-tree -u -m` del sync opt-in tras un winner merge, que nunca toca `HEAD`. El mejor
  candidato es uso manual de git durante el manejo ad hoc del fixture en la sesión v3-4. Cerrado
  el 2026-09-18; detalle en engram `sdd/fixture-head-incident/explore`.

## Pendiente

1. **Syncs periódicos con Orca.** El merge-base ya avanzó a `d74388f8a2`: el próximo sync es un
   `git merge upstream/main` con la misma política (fuera de `src/main|shared|cli|relay` gana Cubito).
   Sin Bun: el deploy remoto de orcad por SSH de upstream no aplica a un build de Cubito.
2. **Engine sin UI todavía:** checks de PR e issue → worktree, elección de agente y cuentas,
   splits de terminal, puertos/preview, búsqueda de contenido (`files.search`), UI de automations,
   pull/sync de ramas (hoy el botón "sync" solo indica qué hacer).
3. **Sin validar en vivo:** crear una PR/MR real (requiere `GH_TOKEN`/`GITLAB_TOKEN`) y el Keychain
   de macOS (requiere orcad nativo).
4. **Detalles:** el toast de notificación sale en inglés ("Claude finished"); el rail del compare no refresca las stats tras nuevos commits en los hijos hasta
   reabrirlo; no hay forma de desregistrar un repo desde la UI ni el CLI.
5. **Cosméticos vistos al validar el sync:** en `[x]` el texto "aún no hay actividad" y una scrollbar
   horizontal aparecen sin estilo abajo a la izquierda; en compare el checkbox "sincronizar el padre"
   queda tapado por la barra de atajos.

## Ideas sin decidir

- Cuarto framework del system graph (Koa es el siguiente candidato natural: necesita dos formas
  de resolución nuevas, `.routes()` como target de mount y `.prefix()` autoaplicado).
- `release-channel.ts` conserva helpers de nombres de instaladores sin ningún llamador
  (`findInstallerAssetName`, `hasInstallableArtifactForPlatform`): código muerto del escritorio.

## Cómo se trabaja un tramo

Explore y design por delegación, review propio, apply RED-first con un commit convencional por
ola, validación en vivo contra un orcad headless real (`AGENTS.md` → Frontend Validation),
push solo con aprobación explícita e identidad `tincke10`. Rebuild de orcad solo como excepción
por instancia. Los spikes se borran cuando la dirección se implementa; nunca se commitean.
