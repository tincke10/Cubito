# Conectar el frontend de Cubito a un orcad real

Runbook manual (no CI) para validar que el frontend habla de verdad con un
`orcad` — pairing por navegador, handshake E2EE, grafo real en vez de
`demoRecords`. Referencia de diseño: `sdd/conexion-orcad` (D1–D7), sección
"Testing architecture" (D7) y fase P7 de tareas.

**Vigencia**: `main.ts` ya está cableado a `pairing-fragment.ts` +
`connect-orcad.ts` (P6.3, mergeado). Con un fragmento `#pairing=` válido el
frontend intenta la conexión real; sin él sirve el modo demo
(`demoGateway`/`demoRecords`).

## 0. Estado de validación (importante)

- **Browser-e2e VERDE, verificado.** Con `orcad` corriendo **nativo en el host**
  (loopback puro, sin Docker), un navegador **en la misma máquina** completa el
  handshake E2EE v1 y el HUD llega a `conectado · runtime <id>` con el runtime
  real del proceso. Es el **camino recomendado** — ver §1.
- **El stack del frontend es correcto, probado a nivel byte.** El mismo bundle
  (`parsePairingCode` → `connectOrcad` → `listWorktrees`, con tweetnacl adentro)
  autentica y trae `worktree.list` sobre loopback limpio. No hay defecto en el
  frontend; lo que falla es el path de red de Docker (abajo).
- **El browser-e2e a través del puerto publicado de Docker Desktop (`-p`) NO
  funciona.** El proxy de red de Docker Desktop (vpnkit) entre host y contenedor
  **resetea el stream de forma determinística** (un echo de integridad de bytes
  se corta siempre en el mismo punto, ~143 bytes, bidireccional), así que los
  frames de respuesta de orcad se truncan a mitad del handshake y este cierra con
  `4001 Unauthorized` o `1006`. `4001 Unauthorized` es ambiguo: `e2ee-channel.ts`
  emite ese código tanto ante token inválido como ante fallo de desencriptado. Un
  relay a `127.0.0.1` dentro del contenedor **no** lo salva (la corrupción está en
  el tramo host→contenedor, antes del relay), y un túnel SSH moriría igual. Es el
  NAT, no el frontend.
- **El CLI `orca --pairing-code` NO prueba la ruta WS cuando corre co-locado con
  orcad.** Encuentra `orca-runtime.json` (transporte unix + `authToken`) y usa el
  socket local, bypasseando el pairing WS (`cli/runtime/metadata.ts`). Para
  ejercitar la ruta WS con el CLI hay que forzarlo con un `ORCA_USER_DATA` vacío.

## 1. Camino recomendado (verificado): orcad nativo en el host

Corré orcad en la propia Mac. Así el navegador le pega por loopback del host y no
hay NAT de por medio. Es el path que da el browser-e2e en verde.

**Node 24.** La app fija `engines.node: "24"`; usá esa versión para instalar,
buildear y correr, así el ABI de `node-pty` matchea. Con `nvm`:

```bash
NODE24="$HOME/.nvm/versions/node/v24.13.1/bin"   # ajustá al v24.x que tengas
```

1. **Instalar deps del root** (es un install single-project, `packages: []`;
   `frontend/` es un workspace aparte que ya tiene sus deps). Reconstruye
   `node-pty` desde source para darwin-arm64 (~segundos):

   ```bash
   PATH="$NODE24:$PATH" corepack pnpm install --frozen-lockfile
   ```

2. **Buildear orcad nativo** (`config/scripts/build-orcad.mjs` → `out/orcad/orcad.js`;
   contrato completo en `docs/reference/orcad-operations.md`):

   ```bash
   PATH="$NODE24:$PATH" corepack pnpm run build:orcad
   ```

3. **Arrancar orcad** en loopback del host (bind default `127.0.0.1`), salida JSON,
   en background para capturar la línea de arranque:

   ```bash
   PATH="$NODE24:$PATH" nohup node out/orcad/orcad.js --port 6768 --json \
     > /tmp/orcad-ready.log 2>/tmp/orcad-stderr.log &
   ```

   El terminal daemon arranca `live`/healthy (node-pty nativo real, sin el warning
   de spawn-helper que aparece en contenedores emulados).

4. **Extraer la URL de pairing** y armar la URL del frontend (fragmento
   `#pairing=` URL-encodeado — `pairing-fragment.ts`, `readPairingFragment`):

   ```bash
   PAIRING_URL=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/orcad-ready.log','utf8').trim().split('\n')[0]).pairing.url)")
   node -e "console.log('http://localhost:5180/#pairing=' + encodeURIComponent(process.argv[1]))" "$PAIRING_URL"
   ```

5. **Levantar el dev server** del frontend (puerto `5180`, fijado en
   `frontend/vite.config.ts`) y abrir la URL del paso 4 en un navegador **de esta
   misma máquina**:

   ```bash
   pnpm --dir frontend dev
   ```

**Un pairing offer se consume/queda atado a su runtime.** Reiniciá orcad para un
offer prístino si ya lo tocaste (un probe, un intento previo), y usá la URL nueva.

## 2. Alternativa: orcad en contenedor (solo valida crypto, NO el browser)

Útil para ejercitar el handshake sin instalar nada nativo, pero **el browser-e2e a
través de `-p` no anda** (§0). Sirve para validar el crypto por loopback *dentro*
del contenedor, no para la inspección visual en el navegador del host.

No hay imagen Docker publicada de `orcad`; se construye adentro de un contenedor
Node genérico (macOS con Docker Desktop en Apple Silicon — sacá
`--platform linux/arm64` en x86_64 o Linux nativo):

```bash
docker run -d --platform linux/arm64 --name cubito-orcad-e2e \
  -p 6768:6768 node:24-bookworm sleep infinity
docker cp . cubito-orcad-e2e:/orca
docker exec -w /orca cubito-orcad-e2e sh -c \
  "corepack enable && pnpm install --frozen-lockfile && pnpm run build:orcad"
docker exec -d -w /orca cubito-orcad-e2e sh -c \
  "node out/orcad/orcad.js --port 6768 --bind 0.0.0.0 --json \
     > /tmp/orcad-ready.log 2>/tmp/orcad-stderr.log"
```

Para validar el crypto de verdad, corré el stack del frontend **dentro** del
contenedor sobre `127.0.0.1:6768` (bundleá el entry con esbuild y corré el `.cjs`
con el Node del contenedor); eso autentica. La ruta host→`-p`→browser no.

Flags relevantes (`src/main/orcad/orcad-entry.ts:parseArgs`):

- `--port <n>` — puerto RPC/WebSocket.
- `--bind <ip-literal>` — default `127.0.0.1`; `0.0.0.0` es el opt-in explícito a
  exposición de red (`src/main/orcad/orcad-bind-address.ts`), obligatorio para que
  `-p` llegue al proceso en el contenedor.
- `--json` — la línea de arranque sale como un único JSON (`type:
  "orca_server_ready"`).
- `--pairing-address <host:port>` — solo si el puerto publicado en el host difiere
  del interno; si no, `resolveAdvertisedPairingEndpoint`
  (`src/main/runtime/pairing-endpoint.ts`) reescribe el bind ancho a
  `ws://127.0.0.1:<mismo-puerto>`.

Al terminar: `docker rm -f cubito-orcad-e2e`.

## 3. Checklist de verificación manual (browser)

No es un test automatizado — es inspección visual + de la URL.

1. orcad arriba (línea `orca_server_ready` capturada), `pnpm --dir frontend dev`
   corriendo, navegador de la misma máquina abierto en la URL con `#pairing=`.
2. **La URL con el fragmento tiene que cargar en un documento fresco.** Cambiar
   *solo el hash* sobre una página ya cargada NO recarga el documento, así que
   `main.ts` no re-lee el fragmento y el frontend se queda en modo demo. Abrí la
   URL en una pestaña nueva (o recargá con el fragmento presente), no navegando
   solo el `#`.
3. El HUD pasa por `conectando…` (punto ámbar) y llega a `conectado · runtime
   <id>` (punto accent) — `<id>` no puede estar vacío y debe coincidir con el
   `runtimeId` de `orcad-ready.log`.
4. La escena muestra el estado **real** del runtime. Un workspace fresco reporta
   `0 nodos` / `sin repositorio`: `worktree.list` lista solo worktrees gestionados
   por orca, **no** las git worktrees crudas (`git worktree add` no aparece). Para
   un grafo con nodos hay que crear worktrees por el flujo de orca.
5. Matá orcad y observá al HUD pasar por `reconectando… · intento N` (punto ámbar)
   y terminar en `desconectado · orcad no responde` una vez agotado el backoff.
6. Tras la carga inicial, el fragmento `#pairing=` ya no está en la barra de
   direcciones (`consumePairingFragment` lo limpia con `history.replaceState`).

## 4. Troubleshooting

| Síntoma | Causa | Dónde mirar |
|---|---|---|
| El HUD se queda en `modo demo` pese a la URL con `#pairing=` | Se cambió solo el hash sobre una página ya cargada; `main.ts` no re-leyó el fragmento | Abrí la URL en un documento fresco (pestaña nueva / recarga con el fragmento), no navegando solo el `#` (§3.2) |
| El navegador nunca conecta, error de contenido mixto | La página está en `https://` y trata de abrir `ws://` | Serví el frontend por `http://` en dev — orcad no valida `Origin` ni hace preflight CORS en WS (`src/main/runtime/rpc/ws-transport.ts`) |
| El browser del automation no alcanza la página / el WS | El navegador corre en otra máquina (extensión remota, browser cloud) y no ve el `localhost` del host ni `127.0.0.1:6768` | Usá un navegador **co-locado** con orcad (misma máquina). Un Chromium local llega a ambos; uno remoto no |
| HUD va directo a `desconectado · orcad no responde` sin `conectando…` | Puerto equivocado; o `--bind 0.0.0.0` sin `-p` (contenedor); o el publicado no coincide con `--pairing-address` | Verificá `--port` vs el endpoint del offer |
| HUD llega a `desconectado · orcad rechazó el token` | El `deviceToken` del offer no es válido para ese runtime (offer viejo, orcad reiniciado con runtime nuevo, u offer ya consumido) | Regenerá el offer contra el `orcad-ready.log` actual — un offer vale solo para el runtime que lo emitió |
| El navegador cierra con `4001 Unauthorized`/`1006` pese a offer/token frescos, vía Docker `-p` | El NAT de Docker Desktop (vpnkit) resetea el stream (~143 bytes) y trunca el frame de auth (§0). `4001` es ambiguo: también significa fallo de desencriptado | Corré orcad **nativo en el host** (§1). El crypto por loopback dentro del contenedor autentica; el `-p` de Docker Desktop no |
| El grafo aparece con menos campos que en CLI/mobile | `clientCapabilities` se manda como `[]` (D1, deliberado). Verificado: `[]`, la lista completa y omitido **los tres autentican** — no afecta la resolución del dispositivo | Si faltan campos, compará `worktree.list` del frontend contra un cliente que declare capabilities; recién ahí evaluá declarar la lista |
