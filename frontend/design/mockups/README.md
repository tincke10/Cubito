# Mockups del frontend 3D

Fuentes del canvas de diseño publicado en
<https://claude.ai/code/artifact/175a2487-d6b4-4b7b-9392-faf4e61d2b57>
(dos páginas: Dark y Light; `canvas.json` define el layout).

Reglas:

- **Dark es la fuente de verdad.** Cualquier cambio de diseño se hace en la
  escena dark; las `*Light.dc.html` se regeneran con `node make-light.mjs`
  (corre desde este directorio) — nunca se editan a mano.
- El ámbar es exclusivo del estado *esperando input*.
- Tokens y decisiones de lenguaje visual (elevación semántica, grilla con
  horizonte, tintas light): ver las notas al margen del canvas y
  [`../../DESIGN.md`](../../DESIGN.md).
