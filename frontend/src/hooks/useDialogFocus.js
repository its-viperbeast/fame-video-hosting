import { useEffect, useRef } from "react";

// Stacked dialogs share one body scroll lock; only the last close restores it.
let scrollLocks = 0;
let savedOverflow = "";

export default function useDialogFocus(ref, active, onClose) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement;
    if (scrollLocks++ === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const focusable = () =>
      [
        ...ref.current.querySelectorAll(
          'button, a[href], input, select, textarea, video[controls], [tabindex="0"]',
        ),
      ].filter(
        (element) =>
          !element.disabled &&
          !element.closest("[inert]") &&
          element.getClientRects().length,
      );
    // A dialog can mark its safest action with data-autofocus.
    (
      ref.current.querySelector("[data-autofocus]") ||
      focusable()[0] ||
      ref.current
    ).focus();

    const key = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close.current();
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      const current = document.activeElement;
      if (!first) {
        event.preventDefault();
        ref.current.focus();
      } else if (!ref.current.contains(current) || current === ref.current) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && current === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = savedOverflow;
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, active]);
}
