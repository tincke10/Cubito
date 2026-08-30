# Cubito — Funcionalidades para el diseño de la escena 3D

Este documento define **qué** tiene que poder hacer el frontend 3D. No define
estética, paleta ni formas — eso es el diseño, y viene después. Cada
funcionalidad está anclada a capacidades **ya validadas** del engine (`orcad`),
con el namespace RPC que la sirve. Si una funcionalidad no tiene RPC que la
respalde, está marcada como `[requiere trabajo de engine]`.

Estado del engine: validado end-to-end en Docker — creación de worktrees con
linaje, listado del grafo, terminales PTY con streaming por cursores, y
persistencia del grafo entre reinicios del daemon.

---

## 1. Conceptos del dominio (el vocabulario de la escena)

| Concepto | Qué es | Fuente en el engine |
|---|---|---|
| **Nodo** | Un worktree: checkout git aislado con branch propio | `worktree.list` → `id` compuesto `repoId::path` |
| **Nodo raíz** | El worktree principal del repo (`isMainWorktree`) | `git.isMainWorktree` |
| **Arista** | Linaje: qué worktree engendró a cuál | `parentWorktreeId` / `childWorktreeIds` (bidireccional) |
| **Terminal** | PTY vivo dentro de un worktree, puede correr un agente | `terminal.*` (34 métodos) |
| **Agente** | CLI agent (Claude Code, Codex, +30) lanzado en una terminal | `TUI_AGENT_CONFIG`, `--agent` en `worktree.create` |
| **Run de orquestación** | Fan-out coordinado: N tareas → N worktrees | `orchestration.*` (38 métodos), `orchestrationRunId` en lineage |

**Regla de oro para el diseño**: la escena representa el grafo de linaje.
Todo lo demás (terminales, diffs, estados) se cuelga de los nodos.

---

## 2. Funcionalidades MVP (fase 1 — el diseño DEBE cubrirlas)

### 2.1 Visualización del grafo
- Renderizar todos los worktrees de un repo como nodos posicionados por linaje
  (raíz → hijos → nietos). RPC: `worktree.list`, `worktree.lineageList`.
- Distinguir visualmente: nodo main / worktree normal / worktree con agente
  activo / worktree archivado (`isArchived`).
- Las aristas muestran dirección padre → hijo (quién engendró a quién).
- El grafo se actualiza en vivo cuando otro cliente (CLI, otro Cubito) crea o
  borra worktrees. RPC: suscripción a eventos de lifecycle `[verificar canal
  de subscribe en runtime-rpc — el web client ya lo consume]`.

### 2.2 Estados del nodo (la escena tiene que "respirar")
Cada nodo comunica su estado sin abrir nada:
- **Idle**: worktree sin actividad.
- **Agente trabajando**: terminal con agente produciendo output. RPC:
  `terminal.agentStatus`.
- **Agente esperando input**: el agente hizo una pregunta y está bloqueado —
  este es EL estado más importante del producto: es donde el humano decide.
- **Terminado / sin actividad reciente**: `lastActivityAt`.
- **Sucio / con cambios**: hay diff contra el base branch. RPC: `git.diff`,
  `git.branchDiff`.
- **No leído**: actividad que el usuario no vio (`isUnread`).

### 2.3 Crear worktrees gráficamente
- Desde cualquier nodo: acción "spawn hijo" → formulario mínimo (nombre,
  agente opcional, prompt opcional, base branch). RPC: `worktree.create` con
  `--parent-worktree`.
- El nodo nuevo aparece en la escena conectado a su padre.
- Crear worktree independiente (sin padre): `--no-parent`.
- Eliminar worktree: `worktree.rm` (con confirmación — es destructivo).

### 2.4 Fan-out (la funcionalidad estrella)
- Desde un nodo: "fan-out" → un prompt + N agentes (o N veces el mismo) →
  N worktrees hijos creados en paralelo, todos colgando del mismo padre.
- Composición cliente: N llamadas a `worktree.create --agent --prompt`
  (así lo hace la propia CLI de ORCA); la vista de run coordinado usa
  `orchestration.*`.
- El diseño debe contemplar cómo se ve "una camada": 5 hermanos naciendo del
  mismo padre al mismo tiempo, comparables entre sí.

### 2.5 Terminal del nodo
- Seleccionar un nodo → ver su(s) terminal(es) con output en vivo.
- RPC: `terminal.create`, `terminal.send` (input del usuario),
  `terminal.read` / `terminal.subscribe` / `terminal.multiplex` (streaming
  con cursores y flow control, snapshot + replay para engancharse a mitad
  de stream).
- Decisión de diseño abierta: ¿terminal como textura EN la escena (sobre el
  nodo), como panel HUD 2D superpuesto, o ambos según zoom? Restricción
  técnica: el addon WebGL de xterm usa un atlas global que pelea con el
  contexto Three.js — el plan es `@xterm/headless` server-side o canvas
  offscreen como textura.

### 2.6 Navegación y cámara
- Órbita, zoom, pan (ya implementado como placeholder).
- "Focus": doble click / acción sobre un nodo → la cámara viaja y encuadra.
- Vista general ("ver todo el grafo") con un gesto/tecla.
- Navegación por teclado entre nodos (padre/hijo/hermanos) — esto es una CLI
  3D: el teclado es ciudadano de primera.

### 2.7 HUD persistente
- Estado de conexión al runtime (conectado / reconectando / caído) con
  `runtimeId`.
- Contadores: nodos, agentes activos, agentes esperando input.
- Repo activo y branch base.

---

## 3. Funcionalidades fase 2 (el diseño debería preverlas, no resolverlas)

### 3.1 Diff y comparación
- Ver el diff de un nodo contra su base. RPC: `git.diff`, `git.branchDiff`,
  `git.commitDiff`.
- **Comparar hermanos de un fan-out**: mismo prompt, N resultados — elegir el
  ganador. Esta pantalla/modo es el cierre del loop del producto.
- Merge del ganador `[verificar RPC exacto de merge/integración]`.

### 3.2 Vista de orquestación
- Un run de orquestación (DAG de tareas, decision gates, workers) superpuesto
  o vinculado al grafo de worktrees. RPC: `orchestration.*` — el engine ya
  persiste runs, tasks, decision gates y mensajes en SQLite.
- Los decision gates son preguntas al humano: deben poder responderse desde
  Cubito.

### 3.3 Multi-repo / proyectos
- Más de un repo registrado: el diseño debe decidir si son "islas" en la misma
  escena o escenas separadas. RPC: `repo.list`, `repo.add`.

### 3.4 Detalle de nodo expandido
- Metadata completa: branch, path, base ref, issue linkeado (GitHub/Linear),
  comment, `workspaceStatus`, provenance (creado por CLI/UI/orquestación).
- Acciones: archivar, pin, renombrar (`worktree.set`), dormir
  (`worktree.sleep`), activar (`worktree.activate`).

---

## 4. Restricciones técnicas que el diseño hereda

1. **Todo pasa por el envelope RPC** (`{id, ok, result|error}` + keepalives).
   No hay estado local autoritativo: el runtime es la fuente de verdad y el
   frontend re-sincroniza (`worktree.list`) al reconectar.
2. **Latencia**: crear un worktree tarda segundos (checkout git + setup). El
   diseño necesita estados intermedios ("naciendo") — hay progreso emitido
   por el engine durante la creación.
3. **Streaming de terminal es binario y con flow control** — presupuestar el
   costo de render de N terminales visibles a la vez (¿cuántas? el diseño
   decide el límite).
4. **Autenticación**: conexión local por unix socket vía bridge, o WebSocket
   con pairing (E2EE). El primer arranque necesita un flujo de
   conexión/pairing — pantalla inevitable.
5. **El grafo puede ser grande**: el layout de referencia de upstream
   (agent-map: packing, clustering, declutter de labels) es portable desde la
   historia del repo (`git show a1f198be:src/renderer/src/components/dashboard-popout/`).

---

## 5. Preguntas abiertas para la sesión de diseño

1. ¿El terminal vive EN la escena (textura sobre el nodo) o en un panel HUD?
   ¿O según nivel de zoom (LOD semántico: lejos = estado, cerca = terminal)?
2. ¿Cómo se ve un agente ESPERANDO INPUT para que sea imposible ignorarlo?
3. ¿Qué representa el eje Z? ¿Profundidad de linaje, tiempo, o nada (grafo
   plano en espacio 3D navegable)?
4. ¿Los fan-outs se agrupan visualmente (cluster/órbita alrededor del padre)?
5. ¿Cuál es el gesto de "spawn hijo"? (drag desde el nodo, menú radial,
   comando de teclado tipo paleta…)
6. ¿Modo paleta de comandos (Ctrl+K) como interfaz paralela a la espacial?
   Siendo una "CLI 3D", probablemente sí desde el día uno.

---

*Documento funcional — actualizarlo cuando el engine exponga capacidades
nuevas o cuando el diseño responda las preguntas abiertas.*
