import { useState } from "react";
import { AlertCircle, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api } from "../services/api";
import { Brand } from "../components/Navbar";

export default function Login({ onSuccess, initialError = "" }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-8">
      <form onSubmit={submit} className="w-full max-w-[340px]">
        <div className="mb-7">
          <Brand />
        </div>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-heading">Sign in</h1>

        <label className="mt-5 mb-2 block text-sm font-medium" htmlFor="login-email">
          Email
        </label>
        <input
          className="w-full rounded-lg border border-line bg-surface px-3 py-3 text-sm text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]"
          id="login-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />

        <label className="mt-4 mb-2 block text-sm font-medium" htmlFor="login-password">
          Password
        </label>
        <div className="relative">
          <input
            className="w-full rounded-lg border border-line bg-surface px-3 py-3 pr-[45px] text-sm text-ink outline-none focus:border-[#89b6f4] focus:ring-2 focus:ring-[#2877e910]"
            id="login-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            required
          />
          <button
            className="absolute top-1.5 right-1.5 inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-surfacehover hover:text-brand"
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>

        {error && (
          <p
            className="mt-4 flex items-start gap-1.5 text-[13px] leading-relaxed text-[#d05b69]"
            role="alert"
          >
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button
          className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold whitespace-nowrap text-white shadow-[0_3px_6px_#2877e919] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          type="submit"
          disabled={busy}
        >
          {busy ? (
            <>
              <LoaderCircle className="animate-spin" size={17} />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </main>
  );
}
