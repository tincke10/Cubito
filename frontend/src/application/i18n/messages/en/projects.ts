export const enProjects = {
  'projects.addRow': '+ add repo',
  'projects.saveSetup': 'save setup',
  'projects.cancel': 'cancel',
  'projects.pathPlaceholder': 'repo path on the orcad machine, e.g. /repos/my-repo',
  'projects.pathHelp':
    'The path is resolved on the machine where orcad runs. In Docker, inside the container: /repos/…',
  'projects.setupPlaceholder': 'setup command (optional), e.g. pnpm install',
  'projects.submit': 'add repo',
  'projects.submitting': 'adding…',
  'projects.setupFor': 'setup for {repo}',
  'projects.setupShared': ' · orca.yaml (read-only): {command}',
  'projects.setupNone': 'no setup (e.g. pnpm install)',
  'projects.setupNoOverride': 'no local override (orca.yaml applies)',
  'projects.setupSaved': 'saved'
} as const
