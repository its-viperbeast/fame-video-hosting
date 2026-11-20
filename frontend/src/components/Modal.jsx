import { useRef } from "react";
import { X } from "lucide-react";
import useDialogFocus from "../hooks/useDialogFocus";

export default function Modal({ title, children, onClose, className = "", footer }) {
  const ref = useRef(null);
  useDialogFocus(ref, true, onClose);
  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center bg-[#0b1c3866] p-4 backdrop-blur-sm animate-fade-in sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={`w-full max-w-[620px] overflow-auto rounded-xl border border-line bg-surface shadow-[0_24px_100px_#081a3c33] overscroll-contain outline-none animate-modal-in max-h-[calc(100dvh-2rem)] ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <h2 className="font-display text-base font-bold tracking-tight text-heading">{title}</h2>
          <button
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="px-5 py-6 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2.5 border-t border-line bg-surfacehover px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </section>
    </div>
  );
}
