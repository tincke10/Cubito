export const enReview = {
  'review.authRequired':
    'Authentication required: with Docker, export GH_TOKEN / GITLAB_TOKEN and restart the container; on a native install, run gh auth login / glab auth login.',
  'review.blocked.dirty': 'there are uncommitted changes',
  'review.blocked.detached_head': 'detached HEAD: there is no branch',
  'review.blocked.default_branch': "you're on the default branch",
  'review.blocked.no_upstream': "the branch isn't published",
  'review.blocked.needs_push': 'there are unpushed commits',
  'review.blocked.needs_sync': 'the branch is behind the remote',
  'review.blocked.fork_head_unsupported': "fork branches aren't supported",
  'review.blocked.unsupported_provider': "this provider doesn't allow creating reviews from here",
  'review.blocked.existing_review': 'a review already exists for this branch',
  'review.blocked.base_not_on_remote':
    "the base branch doesn't exist on the remote: publish the parent first",
  'review.publish': 'publish',
  'review.authenticate': 'authenticate',
  'review.open': 'open {kind}{number}',
  'review.creating': 'creating…',
  'review.create': 'create {kind}',
  'review.created': '{ref} created'
} as const
