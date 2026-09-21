import { useState } from "react";
import { login, signup, API_MODE } from "../../api";
import { setAuthSession, type AuthSession } from "../../utils/authSession";
import { IconLoader, IconMail, IconLock, IconArrowRight, IconAlertTriangle } from "../common/Icon";
import megaLogo from "../../assets/mega-logo.png";

interface AuthScreenProps {
  onLoginSuccess: (session: AuthSession) => void;
}

type AuthTab = "login" | "signup";

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const [tab, setTab] = useState<AuthTab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response =
        tab === "login"
          ? await login({ email: trimmedEmail, password })
          : await signup({ email: trimmedEmail, password });

      const session: AuthSession = {
        userId: response.userId,
        apiKey: response.apiKey,
        email: response.email || trimmedEmail,
      };

      setAuthSession(session);
      onLoginSuccess(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-screen-container">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <img src={megaLogo} alt="Mega EPC" className="auth-logo-img" />
          </div>
          <div className="auth-brand-info">
            <h1 className="auth-title">MEGA AGENT CONSOLE</h1>
            <p className="auth-subtitle">Pressure Vessel & CAD Automation Platform</p>
          </div>
          <span className={`brand-env-tag ${API_MODE === "real" ? "brand-env-real" : ""}`}>
            {API_MODE === "real" ? "REAL API" : "MOCK API v1.0"}
          </span>
        </div>

        {/* Tab Selector */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`auth-tab-btn ${tab === "login" ? "active" : ""}`}
            onClick={() => {
              setTab("login");
              setError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signup"}
            className={`auth-tab-btn ${tab === "signup" ? "active" : ""}`}
            onClick={() => {
              setTab("signup");
              setError(null);
            }}
          >
            Create Account
          </button>
        </div>

        {/* Informative Hint */}
        <p className="auth-instructions">
          {tab === "login"
            ? "Sign in to access engineering jobs, calculation snapshots, and CAD workstations."
            : "Register a new engineer account to start running automated calculations and drawings."}
        </p>

        {API_MODE === "mock" && (
          <div className="auth-mock-hint">
            <strong>Mock Mode Active:</strong> Any email and password (e.g. <code>engineer@megaepc.com</code> / <code>123456</code>) will sign you in.
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="alert-banner alert-banner-danger" role="alert">
            <IconAlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="auth-email" className="form-label">
              Email Address
            </label>
            <div className="auth-input-wrapper">
              <IconMail size={16} className="auth-input-icon" />
              <input
                id="auth-email"
                type="email"
                className="form-input auth-input"
                placeholder="engineer@megaepc.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="auth-password" className="form-label">
              Password
            </label>
            <div className="auth-input-wrapper">
              <IconLock size={16} className="auth-input-icon" />
              <input
                id="auth-password"
                type="password"
                className="form-input auth-input"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === "login" ? "current-password" : "new-password"}
                required
                disabled={isSubmitting}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary auth-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <IconLoader size={16} className="animate-spin" />
                <span>{tab === "login" ? "Signing In..." : "Creating Account..."}</span>
              </>
            ) : (
              <>
                <span>{tab === "login" ? "Sign In to Console" : "Create Account & Continue"}</span>
                <IconArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="auth-footer">
          <span className="auth-footer-text">
            Protected internal engineering console. Local Agents pair securely per account.
          </span>
        </div>
      </div>
    </div>
  );
}
