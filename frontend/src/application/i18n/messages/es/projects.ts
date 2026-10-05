import type { enProjects } from '../en/projects'

export const esProjects: Record<keyof typeof enProjects, string> = {
  'projects.addRow': '+ agregar repo',
  'projects.saveSetup': 'guardar setup',
  'projects.cancel': 'cancelar',
  'projects.pathPlaceholder': 'ruta del repo en la máquina de orcad, ej. /repos/mi-repo',
  'projects.pathHelp':
    'La ruta se resuelve en la máquina donde corre orcad. En Docker, dentro del contenedor: /repos/…',
  'projects.setupPlaceholder': 'comando de setup (opcional), ej. pnpm install',
  'projects.submit': 'agregar repo',
  'projects.submitting': 'agregando…',
  'projects.setupFor': 'setup de {repo}',
  'projects.setupShared': ' · orca.yaml (solo lectura): {command}',
  'projects.setupNone': 'sin setup (ej. pnpm install)',
  'projects.setupNoOverride': 'sin override local (aplica orca.yaml)',
  'projects.setupSaved': 'guardado'
}
