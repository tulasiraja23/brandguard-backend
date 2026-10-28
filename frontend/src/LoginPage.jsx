import { useState } from "react";
import { api, setToken } from "./services/api";

const DEMO_PASSWORD = "Demo@12345"; // default SEED_PASSWORD from the backend .env.example (fictional demo users only)

export default function LoginPage({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", organisationName: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result =
        mode === "login"
          ? await api.login(form.email.trim(), form.password)
          : await api.register({
              name: form.name.trim(),
              email: form.email.trim(),
              password: form.password,
              organisationName: form.organisationName.trim(),
            });
      setToken(result.token);
      onAuthed({ user: result.user, organisation: result.organisation });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit} noValidate>
        <div className="brand-logo">
          <div className="logo-mark">B</div>
          <div>
            <div className="brand-name auth-brand">BrandGuard<span> AI</span></div>
            <div className="brand-caption auth-caption">Verify. Align. Approve.</div>
          </div>
        </div>

        <h1>{mode === "login" ? "Sign in" : "Create your workspace"}</h1>

        {mode === "register" && (
          <>
            <label className="field-label" htmlFor="auth-name">YOUR NAME</label>
            <input id="auth-name" value={form.name} onChange={set("name")} autoComplete="name" />
            <label className="field-label" htmlFor="auth-org">ORGANISATION</label>
            <input id="auth-org" value={form.organisationName} onChange={set("organisationName")} />
          </>
        )}

        <label className="field-label" htmlFor="auth-email">EMAIL</label>
        <input id="auth-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" />
        <label className="field-label" htmlFor="auth-password">PASSWORD</label>
        <input
          id="auth-password"
          type="password"
          value={form.password}
          onChange={set("password")}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
        {mode === "register" && <small className="muted-text">At least 8 characters. You become the admin of the new workspace.</small>}

        {error && <div className="auth-error" role="alert">{error}</div>}

        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create workspace"}
        </button>

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "New here? Create a workspace" : "Already have an account? Sign in"}
        </button>

        {mode === "login" && (
          <div className="demo-logins">
            <div className="evidence-label">FICTIONAL DEMO ACCOUNTS (after npm run seed)</div>
            <div className="button-row">
              {["writer", "reviewer", "admin"].map((role) => (
                <button
                  key={role}
                  type="button"
                  className="secondary-button"
                  onClick={() => setForm({ ...form, email: `${role}@aquanova.demo`, password: DEMO_PASSWORD })}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
