let cachedDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (cachedDisplayTransition !== undefined) return cachedDisplayTransition;
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  void getComputedStyle(probe).display;
  probe.style.display = "none";
  cachedDisplayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return cachedDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(
    typeof window !== "undefined" &&
      window.CSS?.supports?.("overlay", "auto") &&
      canTransitionDisplay(),
  );
}

/**
 * Closes a native `<dialog>` with a smooth exit fallback when `overlay` or
 * discrete `display` transitions are unsupported (Safari/Firefox).
 */
export async function closeDialogSmoothly(dialog: HTMLDialogElement): Promise<void> {
  if (!dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute("data-closing", "");
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => setTimeout(resolve, 400)),
      ]);
    }
    if (!dialog.hasAttribute("data-closing")) return;
    dialog.removeAttribute("data-closing");
  }
  if (dialog.open) dialog.close();
}

/**
 * Installs Safari-compatible backdrop light-dismiss on dialogs using `closedby="any"`
 * without falsely dismissing clicks on the dialog's own padding or child gaps.
 */
export function attachBackdropLightDismiss(
  dialog: HTMLDialogElement,
  onDismiss: () => void,
): () => void {
  if ("closedBy" in HTMLDialogElement.prototype) return () => {};
  const isOutside = (e: PointerEvent) => {
    if (e.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  const onDown = (e: PointerEvent) => {
    pressedOutside = isOutside(e);
  };
  const onUp = (e: PointerEvent) => {
    if (pressedOutside && isOutside(e)) onDismiss();
    pressedOutside = false;
  };
  dialog.addEventListener("pointerdown", onDown);
  dialog.addEventListener("pointerup", onUp);
  return () => {
    dialog.removeEventListener("pointerdown", onDown);
    dialog.removeEventListener("pointerup", onUp);
  };
}
