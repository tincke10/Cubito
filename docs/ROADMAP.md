# Cubito roadmap

Estado real del fork, verificado contra `git log` y el CI. Fuente única: este archivo. Se actualiza
al cerrar cada tramo, con el commit que lo cierra.

Última revisión: 2026-09-18 · después del ciclo v7 (ver commits por fila) · cubito-ci verde en `167087e59`.

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

1. **Workflows de agente en Docker.** La prueba de usuario nuevo cubrió todo salvo lanzar un agente
   real dentro del contenedor. Requiere `docker compose exec cubito claude login` a mano.
2. **Validación en vivo de Hono.** Los goldens cubren el parser; falta ver `[x]` sistema sobre un
   repo Hono real con un orcad reconstruido (excepción de build por instancia).

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
