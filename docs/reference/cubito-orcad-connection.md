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

El stack de conexión del frontend está **validado end-to-end contra un orcad
real**: nuestro `e2ee-box` + `pairing-handshake` + `connect-orcad` completan el
handshake E2EE v1 y traen el `worktree.list` real. Dos cosas aprendidas en esa
validación que cambian cómo se lee este runbook:

- **El browser-e2e desde el host NO funciona a través del puerto publicado de
  Docker Desktop (`-p`).** El proxy de red de Docker Desktop (vpnkit) entre el
  host y el contenedor rompe el frame WS de autenticación cifrado, y orcad lo
  cierra con `4001 Unauthorized` (que es ambiguo: `e2ee-channel.ts:180` emite
  ese mismo código ante un fallo de desencriptado, no solo ante un token
  inválido). El mismo código, mismo token y mismo crypto **autentican sobre
  loopback dentro del contenedor**. No es un defecto del frontend; es el NAT.
  Para un browser-e2e verde hace falta un path sin ese NAT: túnel SSH que
  termine en loopback dentro del contenedor, o correr el frontend co-locado.
- **El CLI `orca --pairing-code` NO prueba la ruta WS cuando corre co-locado
  con orcad.** Encuentra `orca-runtime.json` (transporte unix + `authToken`) y
  usa el socket local, bypasseando el pairing WS (`cli/runtime/metadata.ts`).
  Para ejercitar la ruta WS con el CLI hay que forzarlo con un `ORCA_USER_DATA`
  vacío (sin `orca-runtime.json` que descubrir).

## 1. Levantar un orcad real en un contenedor

No hay una imagen Docker publicada de `orcad` — se construye adentro de un
contenedor Node genérico. El contenedor de validación existente
(`cubito-orcad-validation`) **no publica puertos**, así que para este
checklist levantá uno nuevo con `-p` desde el arranque (Docker no permite
agregar `-p` a un contenedor ya creado).

Desde la raíz del repo, en el host (macOS con Docker Desktop en Apple
Silicon — sacá `--platform linux/arm64` en un host x86_64 o Linux nativo):

```bash
docker run -d --platform linux/arm64 --name cubito-orcad-e2e \
  -p 6768:6768 node:24-bookworm sleep infinity

docker cp . cubito-orcad-e2e:/orca

docker exec -w /orca cubito-orcad-e2e sh -c \
  "corepack enable && pnpm install --frozen-lockfile && pnpm run build:orcad"
```

`build:orcad` (`config/scripts/build-orcad.mjs`) produce `out/orcad/orcad.js`
— ver `docs/reference/orcad-operations.md` para el contrato completo de qué
es y qué supervisa ese proceso.

Arrancalo con el puerto publicado, bind ancho (`-p` no llega a `127.0.0.1`
dentro del contenedor) y salida JSON, en background para poder capturar la
línea de arranque:

```bash
docker exec -d -w /orca cubito-orcad-e2e sh -c \
  "node out/orcad/orcad.js --port 6768 --bind 0.0.0.0 --json \
     > /tmp/orcad-ready.log 2>/tmp/orcad-stderr.log"

sleep 1
docker exec cubito-orcad-e2e cat /tmp/orcad-ready.log
```

Flags relevantes (`src/main/orcad/orcad-entry.ts:parseArgs`):

- `--port <n>` — puerto RPC/WebSocket.
- `--bind <ip-literal>` — default `127.0.0.1`; `0.0.0.0` es el opt-in
  explícito a exposición de red, obligatorio para que `-p` llegue al
  proceso (`src/main/orcad/orcad-bind-address.ts`).
- `--json` — la línea de arranque sale como un único JSON (`type:
  "orca_server_ready"`) en vez de texto humano.
- `--pairing-address <host:port>` — solo hace falta si el puerto publicado
  en el host **difiere** del puerto interno del contenedor. Sin este flag,
  `resolveAdvertisedPairingEndpoint` (`src/main/runtime/pairing-endpoint.ts`)
  reescribe el bind ancho a `ws://127.0.0.1:<mismo-puerto>` — correcto
  cuando `-p 6768:6768` usa el mismo número a ambos lados.

**Limitación conocida, no bloqueante**: un contenedor sin las prebuilds
nativas de `node-pty` para su arquitectura loguea una advertencia de
spawn-helper al arrancar. No afecta pairing ni `worktree.list` — solo
afectaría abrir una terminal PTY, fuera del alcance de este checklist.

## 2. Extraer la URL de pairing

`/tmp/orcad-ready.log` tiene una sola línea JSON. Extraé `pairing.url`
(`orca://pair?code=…`) sin depender de `jq`:

```bash
PAIRING_URL=$(docker exec cubito-orcad-e2e node -e "
  const line = require('fs').readFileSync('/tmp/orcad-ready.log', 'utf8').trim()
  console.log(JSON.parse(line).pairing.url)
")
echo "$PAIRING_URL"
```

Si `pairing.available` es `false` (por ejemplo se arrancó con
`--no-pairing`), no hay URL — repetí el paso 1 sin ese flag.

## 3. Construir la URL del frontend y levantar el dev server

El fragmento `#pairing=` lleva la URL de pairing URL-encodeada
(`pairing-fragment.ts`, `readPairingFragment`):

```bash
node -e "console.log('http://localhost:5180/#pairing=' + encodeURIComponent(process.argv[1]))" "$PAIRING_URL"
```

En otra terminal, en el host:

```bash
pnpm --dir frontend dev
```

Abrí en el navegador la URL que imprimió el `node -e` de arriba (puerto
`5180`, el que fija `frontend/vite.config.ts`).

## 4. Checklist de verificación manual

No es un test automatizado — es una inspección visual + de la URL.

1. Contenedor arriba, línea `orca_server_ready` capturada, `pnpm --dir
   frontend dev` corriendo, navegador abierto en la URL con `#pairing=`.
2. El HUD pasa por `conectando…` (punto ámbar) y llega a `conectado ·
   runtime <id>` (punto accent) — `<id>` no puede estar vacío.
3. La escena muestra el grafo **real** del contenedor (nodos que
   corresponden a los worktrees que existen adentro), no `demoRecords`.
4. Matá el contenedor (`docker kill cubito-orcad-e2e`) y observá al HUD
   pasar por `reconectando… · intento N` (punto ámbar) y terminar en
   `desconectado · orcad no responde` (punto ámbar apagado) una vez agotado
   el backoff.
5. Después de la carga inicial, el fragmento `#pairing=` ya no está en la
   barra de direcciones (`consumePairingFragment` lo limpia con
   `history.replaceState`).

Al terminar: `docker rm -f cubito-orcad-e2e`.

## 5. Troubleshooting

| Síntoma | Causa | Dónde mirar |
|---|---|---|
| El navegador nunca conecta, error de contenido mixto | La página del frontend está en `https://` y trata de abrir `ws://` | Serví el frontend por `http://` en dev — no hay bloqueo del lado de orcad (`src/main/runtime/rpc/ws-transport.ts` no valida `Origin`, no hay preflight CORS en WS) |
| HUD va directo a `desconectado · orcad no responde` sin pasar por `conectando…` | Puerto equivocado, o `--bind 0.0.0.0` sin `-p`, o el puerto publicado no coincide con `--pairing-address` | Repetí los pasos 1–2 verificando que el puerto de `-p host:container` sea el mismo que `--port` |
| HUD llega a `desconectado · orcad rechazó el token` | El `deviceToken` del pairing offer no es válido para ese runtime (offer viejo, contenedor reiniciado con un runtime nuevo) | Repetí el paso 2 contra el `orcad-ready.log` del contenedor actual — un offer es válido solo para el runtime que lo emitió |
| El navegador cierra con `4001 Unauthorized` pese a offer/token frescos | El NAT de Docker Desktop (vpnkit) del `-p` rompe el frame WS de auth cifrado (ver sección 0). `4001 Unauthorized` es ambiguo: también significa fallo de desencriptado, no solo token inválido | Confirmá el crypto por loopback dentro del contenedor (autentica); para el browser usá un túnel SSH que termine en loopback o corré el frontend co-locado, no el `-p` de Docker Desktop |
| El grafo aparece pero con menos campos que en el CLI/mobile | `clientCapabilities` se manda como `[]` (D1, decisión deliberada). Verificado: `[]`, la lista completa y omitido **los tres autentican** — no afecta la resolución del dispositivo | Si faltan campos, compará la respuesta de `worktree.list` del frontend contra la de un cliente que declare capabilities; recién ahí evaluá declarar la lista |
