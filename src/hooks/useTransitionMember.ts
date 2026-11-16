import { useSyncExternalStore } from 'react'
import {
  getTransitionState,
  subscribeTransitionState,
  type TransitionState,
} from '@/lib/viewTransitions'

export function useTransitionState(): TransitionState {
  return useSyncExternalStore(
    subscribeTransitionState,
    getTransitionState,
    getTransitionState,
  )
}
