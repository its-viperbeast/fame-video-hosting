import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Lock } from "lucide-react";
import { api } from "../services/api";

export default function AdminLock({ onUnlocked, onSignOut }) {
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(true);
  const [error, setError] = useState("");
  const activeIndex = Math.min(pin.length, 3);

  useEffect(() => {
    const previousBody = document.body.style.overflow;
    const previousRoot = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBody;
      document.documentElement.style.overflow = previousRoot;
    };
  }, []);

  useEffect(() => {
    if (!busy) inputRef.current?.focus();
  }, [busy]);

  async function verify(value) {
    if (value.length !== 4 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await api.verifyLock(value);
      onUnlocked();
    } catch (err) {
      busyRef.current = false;
      setPin("");
      setError(err.message || "Could not verify the PIN.");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[11000] grid min-h-dvh place-items-center overflow-y-auto overscroll-none bg-bg px-6 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-lock-title"
      aria-busy={busy}
    >
      <form
        className="w-full max-w-[340px] text-center"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          verify(pin);
        }}
      >
        <Lock className="mx-auto text-brand" size={28} aria-hidden="true" />
        <h1
          className="mt-4 font-display text-[28px] font-bold tracking-tight text-heading"
          id="admin-lock-title"
        >
          Admin locked
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted" id="admin-lock-hint">
          Enter your 4-digit PIN to continue.
        </p>

        <div className="relative mt-8">
          <label className="sr-only" htmlFor="admin-lock-pin">
            4-digit PIN
          </label>
          <input
            ref={inputRef}
            className="absolute inset-0 z-0 h-full w-full cursor-text border-0 bg-transparent text-base text-transparent opacity-0 outline-none"
            id="admin-lock-pin"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={pin}
            disabled={busy}
            aria-describedby={error ? "admin-lock-error" : "admin-lock-hint"}
            aria-invalid={error ? true : undefined}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, "").slice(0, 4);
              setPin(next);
              verify(next);
            }}
          />
          <div
            className="pointer-events-none relative z-10 flex justify-center gap-3"
            aria-hidden="true"
          >
            {[0, 1, 2, 3].map((index) => (
              <div
                className={`grid h-16 w-14 place-items-center rounded-lg border bg-surface ${
                  focused && index === activeIndex
                    ? "border-[#89b6f4] ring-2 ring-[#2877e910]"
                    : "border-line"
                }`}
                key={index}
              >
                {pin[index] ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-heading" />
                ) : focused && index === activeIndex ? (
                  <span className="h-6 w-0.5 animate-caret rounded-full bg-heading" />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p
            className="mt-4 flex items-start justify-center gap-1.5 text-left text-[13px] leading-relaxed text-[#d05b69]"
            id="admin-lock-error"
            role="alert"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
        ) : null}
        <button
          className="mt-8 text-sm font-medium text-muted hover:text-brand"
          type="button"
          disabled={busy}
          onClick={onSignOut}
        >
          Sign out
        </button>
      </form>
    </div>,
    document.body,
  );
}
