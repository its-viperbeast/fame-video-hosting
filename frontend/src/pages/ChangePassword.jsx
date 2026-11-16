import { useState } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import { api } from "../services/api";

export default function ChangePassword() {
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirm, setConfirm] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSaved(false);
    if (next !== confirm) return setError("The new passwords do not match.");
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full min-h-12 rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]";

  return (
    <>
      <div className="mb-7 min-w-0">
        <h1 className="font-display my-2 text-3xl leading-tight font-bold tracking-tight text-heading">
          Change password
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Choose a new password for your Frame account.
        </p>
      </div>
      <form
        className="w-full max-w-[440px] rounded-xl border border-line bg-surface p-6"
        onSubmit={submit}
      >
        <label
          className="mt-4 mb-2 block text-sm font-medium first:mt-0"
          htmlFor="current-password"
        >
          Current password
        </label>
        <input
          className={inputClass}
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
        <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="new-password">
          New password
        </label>
        <input
          className={inputClass}
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
        <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          className={inputClass}
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
        <p className="mt-2 text-xs text-muted">Use 12 to 256 characters.</p>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-[#d05b69]" role="alert">
            <AlertCircle size={14} />
            {error}
          </p>
        )}
        {saved && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted" role="status">
            <CheckCircle2 size={15} className="text-[#229b78]" />
            Password changed.
          </p>
        )}
        <button
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={busy}
        >
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" size={17} />
              Saving…
            </>
          ) : (
            "Update password"
          )}
        </button>
      </form>
    </>
  );
}
