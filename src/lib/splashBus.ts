/**
 * Splash-state bus: the roster page owns the scroll position, the header owns
 * the visual state. A module singleton (instead of a window CustomEvent)
 * guarantees the header reads the current value on subscribe: the roster's
 * first write happens in a child effect, before the header's subscription
 * effect runs, so an event-only handoff would drop it.
 */

type SplashListener = (pastSplash: boolean) => void;

let currentSplashState =
  typeof window !== "undefined" &&
  window.scrollY > window.innerHeight * 0.5;

const splashListeners = new Set<SplashListener>();

export function getSplashState(): boolean {
  return currentSplashState;
}

export function setSplashState(pastSplash: boolean): void {
  if (pastSplash === currentSplashState) return;
  currentSplashState = pastSplash;
  for (const listener of splashListeners) {
    listener(pastSplash);
  }
}

export function subscribeSplashState(listener: SplashListener): () => void {
  splashListeners.add(listener);
  listener(currentSplashState);
  return () => {
    splashListeners.delete(listener);
  };
}
