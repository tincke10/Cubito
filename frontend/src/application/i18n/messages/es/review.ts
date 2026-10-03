import type { enReview } from '../en/review'

export const esReview: Record<keyof typeof enReview, string> = {
  'review.authRequired':
    'Autenticación requerida: en Docker exportá GH_TOKEN / GITLAB_TOKEN y reiniciá el contenedor; en una instalación nativa corré gh auth login / glab auth login.',
  'review.blocked.dirty': 'hay cambios sin commitear',
  'review.blocked.detached_head': 'HEAD desacoplado: no hay rama',
  'review.blocked.default_branch': 'estás en la rama por defecto',
  'review.blocked.no_upstream': 'la rama no está publicada',
  'review.blocked.needs_push': 'hay commits sin pushear',
  'review.blocked.needs_sync': 'la rama está atrás del remoto',
  'review.blocked.fork_head_unsupported': 'las ramas de fork no están soportadas',
  'review.blocked.unsupported_provider': 'este proveedor no permite crear reviews desde acá',
  'review.blocked.existing_review': 'ya existe un review para esta rama',
  'review.blocked.base_not_on_remote':
    'la rama base no existe en el remoto: publicá el padre primero',
  'review.publish': 'publicar',
  'review.authenticate': 'autenticar',
  'review.open': 'abrir {kind}{number}',
  'review.creating': 'creando…',
  'review.create': 'crear {kind}',
  'review.created': '{ref} creado'
}
