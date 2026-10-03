import type { enSourcecontrol } from '../en/sourcecontrol'

export const esSourcecontrol: Record<keyof typeof enSourcecontrol, string> = {
  'sourceControl.commitPlaceholder': 'mensaje de commit',
  'sourceControl.reviewTitlePlaceholder': 'título',
  'sourceControl.reviewBodyPlaceholder': 'descripción',
  'sourceControl.draft': 'borrador',
  'sourceControl.openResult': 'abrir',
  'sourceControl.noUpstream': 'sin upstream',
  'sourceControl.status': '{count} en stage · {sync}',
  'sourceControl.commit': 'commit',
  'sourceControl.committing': 'commiteando…',
  'sourceControl.push': 'push',
  'sourceControl.pushing': 'pusheando…',
  'sourceControl.publishBranch': 'publicar rama',
  'sourceControl.commitCreated': 'commit creado',
  'sourceControl.pushed': 'push realizado',
  'sourceControl.branchPublished': 'rama publicada',
  'sourceControl.needsStageAndMessage': 'stageá archivos y escribí un mensaje para commitear',
  'sourceControl.behindRemote': 'la rama está atrás del remoto: hacé pull o rebase en la terminal'
}
