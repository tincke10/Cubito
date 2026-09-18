# Cubito roadmap

Estado real del fork, verificado contra `git log` y el CI. Fuente única: este archivo. Se actualiza
al cerrar cada tramo, con el commit que lo cierra.

Última revisión: 2026-09-18 · `origin/main` = `9e8231436` · cubito-ci verde.

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

## Cerrado sin implementar

- **v5-2d `agentDefaultEnv` sobre SSH.** No aplica a Cubito. El orcad headless nunca registra el
  subsistema SSH: `registerSshHandlers` (`src/main/ipc/ssh.ts`) solo lo llamaba el main de Electron,
  borrado en `bb24b404b`. Cualquier `ssh.connect` termina en `ssh_handlers_not_registered` y el trust
  remoto retorna sin escribir. Tampoco hay RPC para agregar targets ni superficie SSH en el frontend.
  Si algún día Cubito quiere hosts remotos, es un cambio de engine (cablear SSH en `orcad-entry`),
  no un check de validación. Decidido el 2026-09-18.

## Pendiente

Ordenado por costo, de más barato a más caro.

1. **Guard de re-entrada en el spawn menu.** `spawn-menu-controller.ts` tiene el mismo `sync()` que
   el fan-out antes de `9e8231436`: un dispatch sincrónico re-entra y el sync externo aplica el
   modelo viejo. Hoy no se ve; es la misma bomba. Frontend, sin rebuild.
2. **Partir `service-db-heuristic.ts`.** Está a 295 de 300 líneas. El próximo cambio ahí obliga a
   partirlo; mejor hacerlo antes de necesitarlo. Engine, sin rebuild (solo unit tests).
3. **Referencias stale del cleanup.** `renderer-agent-status-performance.md` apunta a
   `bench:idle-cpu`, `configure-process.ts` menciona `run-electron-vite-dev`, `knip.json` tiene
   entradas a paths borrados.
4. **Workflows de agente en Docker.** La prueba de usuario nuevo cubrió todo salvo lanzar un agente
   real dentro del contenedor. Requiere `docker compose exec cubito claude login` a mano.
5. **Deps de Electron que siguen a propósito.** `@stablyai/playwright-test` queda por
   `tests/tools/win-update-e2e/app-driver.mjs` (lo documenta `playwright-suite-absence.test.ts`) y
   `electron-builder` sigue cableado en packaging, scripts y tests. Sacarlos es un tramo propio de
   cleanup, no un descuido.

## Ideas sin decidir

- Tercer framework del system graph después de Express, Fastify y Nest.
- Auditar el incidente del fixture (`.git/HEAD` perdido el 2026-09-08, causa desconocida).

## Cómo se trabaja un tramo

Explore y design por delegación, review propio, apply RED-first con un commit convencional por
ola, validación en vivo contra un orcad headless real (`AGENTS.md` → Frontend Validation),
push solo con aprobación explícita e identidad `tincke10`. Rebuild de orcad solo como excepción
por instancia. Los spikes se borran cuando la dirección se implementa; nunca se commitean.
