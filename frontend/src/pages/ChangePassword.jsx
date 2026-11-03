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

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Change password</h1>
          <p>Choose a new password for your Frame account.</p>
        </div>
      </div>
      <form className="change-password-form" onSubmit={submit}>
        <label className="field-label" htmlFor="current-password">
          Current password
        </label>
        <input
          className="form-input"
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          required
        />
        <label className="field-label" htmlFor="new-password">
          New password
        </label>
        <input
          className="form-input"
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          required
        />
        <label className="field-label" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          className="form-input"
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={256}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          required
        />
        <p className="change-password-hint">Use 12 to 256 characters.</p>
        {error && (
          <p className="login-error" role="alert">
            <AlertCircle size={14} />
            {error}
          </p>
        )}
        {saved && (
          <p className="password-saved" role="status">
            <CheckCircle2 size={15} />
            Password changed.
          </p>
        )}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? (
            <>
              <LoaderCircle className="spin" size={17} />
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
