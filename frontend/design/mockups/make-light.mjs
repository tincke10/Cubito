// Traduce las escenas dark a light: mismos matices, contraste recalibrado.
import { readFileSync, writeFileSync } from 'node:fs'

const SCENES = [
  'Main', 'TerminalHUD', 'TerminalEscena', 'Spawn', 'Fanout',
  'Paleta', 'Proyectos', 'SelectorProyecto', 'VistaSistema'
]

// Reglas contextuales primero (texto/tinta), mapas globales después.
const RULES = [
  // glow de texto fuera; tintas en HTML
  [/text-shadow: 0 0 8px rgba\(159, 239, 0, 0\.35\)/g, 'text-shadow: none'],
  [/a:hover \{ color: #b7ff33; \}/g, 'a:hover { color: #3a6900; }'],
  [/rgba\(255, 176, 0, 0\.4\)/g, 'rgba(163, 107, 0, 0.5)'],
  // badge "listo": anillo y tilde pasan a tinta azul, fondo blanco
  [/fill="#0a0e12" stroke="#7ecbff"/g, 'fill="#ffffff" stroke="#1273c4"'],
  [/(<text[^>]*?fill=")#7ecbff(")/g, '$1#1273c4$2'],
  [/stroke="#7ecbff"/g, 'stroke="#1273c4"'],
  [/color: #2ea8ff/g, 'color: #1273c4'],
  [/color: #e8a200/g, 'color: #a36b00'],
  // rgba con base verde/ámbar/negro
  [/rgba\(159, 239, 0, 0\.07\)/g, 'rgba(77, 138, 0, 0.10)'],
  [/rgba\(159, 239, 0, 0\.4\)/g, 'rgba(77, 138, 0, 0.5)'],
  [/rgba\(159, 239, 0, 0\.15\)/g, 'rgba(77, 138, 0, 0.18)'],
  [/rgba\(159, 239, 0, 0\.05\)/g, 'rgba(77, 138, 0, 0.10)'],
  [/rgba\(255, 176, 0, 0\.06\)/g, 'rgba(179, 115, 0, 0.08)'],
  [/rgba\(10, 14, 18, 0\.92\)/g, 'rgba(242, 245, 240, 0.92)'],
  [/rgba\(6, 9, 12, 0\.55\)/g, 'rgba(236, 241, 236, 0.6)'],
  [/rgba\(13, 20, 28, 0\.94\), rgba\(10, 15, 21, 0\.94\)/g, 'rgba(255, 255, 255, 0.95), rgba(247, 250, 252, 0.95)'],
  [/rgba\(0, 0, 0, 0\.\d+\)/g, 'rgba(35, 49, 58, 0.15)'],
  // SVG: texto y tspan a tintas oscuras del mismo matiz
  [/(<text[^>]*?fill=")#2ea8ff(")/g, '$1#1273c4$2'],
  [/(<tspan fill=")#2ea8ff(")/g, '$1#1273c4$2'],
  [/(<text[^>]*?fill=")#e8a200(")/g, '$1#a36b00$2'],
  [/(<tspan fill=")#e8a200(")/g, '$1#a36b00$2'],
  [/(<text[^>]*?fill=")#3d4b57(")/g, '$1#8a97a0$2'],
  // wireframes y cubo idle
  [/stroke="#3d4b57"/g, 'stroke="#9aa7b0"'],
  [/#3d4b57/g, '#cdd7dd'],
  [/#1d262e/g, '#8d9ba5'],
  [/#2c3945/g, '#aebac2'],
  // cubo azul: cara superior/izquierda recalibradas
  [/#7ecbff/g, '#8fd0ff'],
  [/#17557f/g, '#1273b8'],
  // verdes y ámbar de tinta
  [/#9fef00/g, '#4d8a00'],
  [/#ffb000/g, '#a36b00'],
  [/#b58200/g, '#8a6b1f'],
  // superficies y bordes
  [/#0a0e12/g, '#f2f5f0'],
  [/#0d141c/g, '#ffffff'],
  [/#0a0f15/g, '#f5f8fa'],
  [/#0e141c/g, '#ffffff'],
  [/#0c1117/g, '#f7fafc'],
  [/#0d1319/g, '#ffffff'],
  [/#10231a/g, '#d9e2d2'],
  [/#1b2833/g, '#dbe3e8'],
  [/#24313c/g, '#cfd8de'],
  [/#05080b/g, '#e6ebe3'],
  // grises de texto
  [/#c8d3da/g, '#23313a'],
  [/#8fa3ad/g, '#3c4c56'],
  [/#6b7a85/g, '#5c6b75'],
  [/#4a5a64/g, '#8a97a0'],
  // arista idle
  [/#3a5f3a/g, '#7c997c'],
  // sombras de piso y drop-shadows, suavizadas
  [/fill="#000000"/g, 'fill="#43555f"'],
  [/flood-color="#000000" flood-opacity="0\.5"/g, 'flood-color="#43555f" flood-opacity="0.3"'],
  // CTA primario: mantiene el verde marca como superficie, tinta casi negra (AA)
  [/background: #4d8a00; color: #f2f5f0/g, 'background: #9fef00; color: #1a2a08']
]

for (const stem of SCENES) {
  let html = readFileSync(`${stem}.dc.html`, 'utf8')
  for (const [re, to] of RULES) {
    html = html.replace(re, to)
  }
  writeFileSync(`${stem}Light.dc.html`, html)
  console.log(`${stem}Light.dc.html`)
}
