const DEFAULT_MAX_FRAMES = 30

type ConnectedFocusOptions = {
  isConnected: () => boolean
  focus: () => void
  schedule: (callback: () => void) => number
  cancel: (handle: number) => void
  maxFrames?: number | undefined
}

/** Scene panels enter the DOM on the next CSS2DRenderer frame; `focus()` on a detached node is a silent no-op. */
export function createConnectedFocus(options: ConnectedFocusOptions): {
  request(): void
  cancel(): void
} {
  const {
    isConnected,
    focus,
    schedule,
    cancel: cancelFrame,
    maxFrames = DEFAULT_MAX_FRAMES
  } = options
  let pending: number | null = null

  const cancel = (): void => {
    if (pending !== null) cancelFrame(pending)
    pending = null
  }

  const attempt = (framesLeft: number): void => {
    pending = null
    if (isConnected()) {
      focus()
      return
    }
    if (framesLeft <= 0) return
    pending = schedule(() => attempt(framesLeft - 1))
  }

  return {
    request() {
      cancel()
      attempt(maxFrames)
    },
    cancel
  }
}
