import { useRef } from "react";
import { X } from "lucide-react";
import useDialogFocus from "../hooks/useDialogFocus";

export default function Modal({ title, children, onClose, className = "", footer }) {
  const ref = useRef(null);
  useDialogFocus(ref, true, onClose);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section
        className={`modal ${className}`}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </section>
    </div>
  );
}
