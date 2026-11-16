import { flushSync } from 'react-dom'

export type NavigationTransitionType = 'forward' | 'backward' | 'filter' | 'tab'
export type TransitionMode = 'idle' | 'filter' | 'member'
export type TransitionSource = 'chapter' | 'card' | null

interface ViewTransitionLike {
  finished: Promise<void>
  ready: Promise<void>
  updateCallbackDone: Promise<void>
}

export interface TransitionState {
  mode: TransitionMode
  memberSlug: string | null
  source: TransitionSource
}

let currentState: TransitionState = {
  mode: 'idle',
  memberSlug: null,
  source: null,
}

const listeners = new Set<() => void>()

export function getTransitionState(): TransitionState {
  return currentState
}

export function setTransitionState(next: TransitionState) {
  currentState = next
  for (const listener of listeners) {
    listener()
  }
}

export function subscribeTransitionState(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

export function supportsViewTransitionTypes(): boolean {
  if (typeof window === 'undefined') return false
  const vt = (window as Window & { ViewTransition?: { prototype?: object } }).ViewTransition
  return Boolean(vt && vt.prototype && 'types' in vt.prototype)
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function focusRouteHeading() {
  requestAnimationFrame(() => {
    const heading = document.getElementById('main-content')
    if (heading instanceof HTMLElement) {
      heading.focus({ preventScroll: true })
    }
  })
}

export function runViewTransition({
  update,
  types,
  mode = 'idle',
  memberSlug = null,
  source = null,
  onFinished,
}: {
  update: () => void
  types?: NavigationTransitionType[]
  mode?: TransitionMode
  memberSlug?: string | null
  source?: TransitionSource
  onFinished?: () => void
}) {
  if (mode !== 'idle' || memberSlug !== null) {
    flushSync(() => {
      setTransitionState({ mode, memberSlug, source })
    })
  }

  const finishCleanup = () => {
    if (
      currentState.mode !== 'idle' ||
      currentState.memberSlug !== null ||
      currentState.source !== null
    ) {
      setTransitionState({ mode: 'idle', memberSlug: null, source: null })
    }
    onFinished?.()
  }

  if (!supportsViewTransitions() || prefersReducedMotion()) {
    update()
    finishCleanup()
    return
  }

  const wrappedUpdate = () => {
    flushSync(() => {
      update()
    })
  }

  try {
    let transition: ViewTransitionLike
    if (types && types.length > 0 && supportsViewTransitionTypes()) {
      transition = (
        document as unknown as {
          startViewTransition: (opts: { update: () => void; types: string[] }) => ViewTransitionLike
        }
      ).startViewTransition({
        update: wrappedUpdate,
        types,
      })
    } else {
      transition = document.startViewTransition(wrappedUpdate) as unknown as ViewTransitionLike
    }

    transition.finished.finally(finishCleanup)
  } catch {
    wrappedUpdate()
    finishCleanup()
  }
}
