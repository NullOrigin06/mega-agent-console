import { useEffect, useRef, useState } from "react";
import {
  login,
  signup,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendVerification,
  API_MODE,
} from "../../api";
import { setAuthSession, getAuthSession, type AuthSession } from "../../utils/authSession";
import { readUrlToken, clearUrlToken } from "../../utils/urlToken";
import {
  IconLoader,
  IconMail,
  IconLock,
  IconArrowRight,
  IconAlertTriangle,
  IconCheckCircle,
} from "../common/Icon";
import megaLogo from "../../assets/mega-logo.png";

interface AuthScreenProps {
  onLoginSuccess: (session: AuthSession) => void;
}

type Mode = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email";

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const urlToken = readUrlToken();
  const [mode, setMode] = useState<Mode>(urlToken?.mode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // verify-email needs no form - it acts on mount using the URL's token.
  // Guarded against calling twice for the same token: the token is
  // single-use server-side, and React StrictMode deliberately double-
  // invokes effects in dev (mount -> cleanup -> mount again), which would
  // otherwise consume the token on the first call and show a false
  // "invalid or expired" error on the second. The same guard also covers a
  // real production case - a page refresh after a successful verification
  // re-running this effect with the same (now-spent) token in the URL.
  const verifiedTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (urlToken?.mode !== "verify-email") return;
    if (verifiedTokenRef.current === urlToken.token) return;
    verifiedTokenRef.current = urlToken.token;

    setIsSubmitting(true);
    verifyEmail(urlToken.token)
      .then((res) => {
        setInfo(res.message || "Email verified.");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Verification failed.");
      })
      .finally(() => setIsSubmitting(false));
    // Only ever runs once, for the token this component was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToLogin = () => {
    clearUrlToken();
    setMode("login");
    setError(null);
    setInfo(null);
    setPassword("");
    setConfirmPassword("");
  };

  const handleLoginOrSignup = async (e: React.FormEvent) => {
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
        mode === "login"
          ? await login({ email: trimmedEmail, password })
          : await signup({ email: trimmedEmail, password });

      setAuthSession({
        userId: response.userId,
        apiKey: response.apiKey,
        email: response.email || trimmedEmail,
      });
      const stored = getAuthSession();
      if (stored) onLoginSuccess(stored);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address first.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await forgotPassword(trimmedEmail);
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setError(null);
    setInfo(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address first, then resend.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await resendVerification(trimmedEmail);
      setInfo(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setIsSubmitting(true);
    try {
      await resetPassword(urlToken!.token, password);
      setInfo("Password reset. You can now sign in with your new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    mode === "forgot-password"
      ? "Reset your password"
      : mode === "reset-password"
        ? "Choose a new password"
        : mode === "verify-email"
          ? "Verifying your email"
          : "MEGA AGENT CONSOLE";

  return (
    <div className="auth-screen-container">
      <div className="auth-card">
        {/* Brand Header */}
        <div className="auth-header">
          <div className="auth-logo-badge">
            <img src={megaLogo} alt="Mega EPC" className="auth-logo-img" />
          </div>
          <div className="auth-brand-info">
            <h1 className="auth-title">{title}</h1>
            {mode === "login" || mode === "signup" ? (
              <p className="auth-subtitle">Pressure Vessel & CAD Automation Platform</p>
            ) : null}
          </div>
          <span className={`brand-env-tag ${API_MODE === "real" ? "brand-env-real" : ""}`}>
            {API_MODE === "real" ? "REAL API" : "MOCK API v1.0"}
          </span>
        </div>

        {(mode === "login" || mode === "signup") && (
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-tab-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => { setMode("login"); setError(null); setInfo(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "signup"}
              className={`auth-tab-btn ${mode === "signup" ? "active" : ""}`}
              onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
            >
              Create Account
            </button>
          </div>
        )}

        {(mode === "login" || mode === "signup") && (
          <p className="auth-instructions">
            {mode === "login"
              ? "Sign in to access engineering jobs, calculation snapshots, and CAD workstations."
              : "Register a new engineer account to start running automated calculations and drawings."}
          </p>
        )}

        {mode === "forgot-password" && (
          <p className="auth-instructions">
            Enter your account email and we'll send a link to reset your password.
          </p>
        )}

        {API_MODE === "mock" && (mode === "login" || mode === "signup") && (
          <div className="auth-mock-hint">
            <strong>Mock Mode Active:</strong> Any email and password (e.g. <code>engineer@megaepc.com</code> / <code>123456</code>) will sign you in.
          </div>
        )}

        {error && (
          <div className="alert-banner alert-banner-danger" role="alert">
            <IconAlertTriangle size={16} />
            <span>{error}</span>
          </div>
        )}

        {info && (
          <div className="alert-banner alert-banner-success" role="status">
            <IconCheckCircle size={16} />
            <span>{info}</span>
          </div>
        )}

        {/* Login / Signup */}
        {(mode === "login" || mode === "signup") && (
          <form onSubmit={handleLoginOrSignup} className="auth-form">
            <div className="form-group">
              <label htmlFor="auth-email" className="form-label">Email Address</label>
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
              <label htmlFor="auth-password" className="form-label">Password</label>
              <div className="auth-input-wrapper">
                <IconLock size={16} className="auth-input-icon" />
                <input
                  id="auth-password"
                  type="password"
                  className="form-input auth-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {mode === "login" && (
              <div className="auth-link-row">
                <button type="button" className="btn-link" onClick={() => { setMode("forgot-password"); setError(null); setInfo(null); }}>
                  Forgot password?
                </button>
                <button type="button" className="btn-link" onClick={handleResendVerification} disabled={isSubmitting}>
                  Resend verification email
                </button>
              </div>
            )}

            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <IconLoader size={16} className="animate-spin" />
                  <span>{mode === "login" ? "Signing In..." : "Creating Account..."}</span>
                </>
              ) : (
                <>
                  <span>{mode === "login" ? "Sign In to Console" : "Create Account & Continue"}</span>
                  <IconArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        )}

        {/* Forgot password */}
        {mode === "forgot-password" && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="forgot-email" className="form-label">Email Address</label>
              <div className="auth-input-wrapper">
                <IconMail size={16} className="auth-input-icon" />
                <input
                  id="forgot-email"
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
            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? <IconLoader size={16} className="animate-spin" /> : <span>Send Reset Link</span>}
            </button>
            <button type="button" className="btn-link" onClick={goToLogin}>Back to Sign In</button>
          </form>
        )}

        {/* Reset password (arrived via emailed link) */}
        {mode === "reset-password" && (
          <form onSubmit={handleResetPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="reset-password" className="form-label">New Password</label>
              <div className="auth-input-wrapper">
                <IconLock size={16} className="auth-input-icon" />
                <input
                  id="reset-password"
                  type="password"
                  className="form-input auth-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting || Boolean(info)}
                  autoFocus
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="reset-confirm" className="form-label">Confirm New Password</label>
              <div className="auth-input-wrapper">
                <IconLock size={16} className="auth-input-icon" />
                <input
                  id="reset-confirm"
                  type="password"
                  className="form-input auth-input"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting || Boolean(info)}
                />
              </div>
            </div>
            {info ? (
              <button type="button" className="btn btn-primary auth-submit-btn" onClick={goToLogin}>
                <span>Continue to Sign In</span>
                <IconArrowRight size={16} />
              </button>
            ) : (
              <button type="submit" className="btn btn-primary auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? <IconLoader size={16} className="animate-spin" /> : <span>Reset Password</span>}
              </button>
            )}
          </form>
        )}

        {/* Verify email (arrived via emailed link, acts automatically) */}
        {mode === "verify-email" && (
          <div className="auth-form">
            {isSubmitting && (
              <div className="auth-instructions flex-center">
                <IconLoader size={20} className="animate-spin" />
              </div>
            )}
            {!isSubmitting && (
              <button type="button" className="btn btn-primary auth-submit-btn" onClick={goToLogin}>
                <span>Continue to Sign In</span>
                <IconArrowRight size={16} />
              </button>
            )}
          </div>
        )}

        <div className="auth-footer">
          <span className="auth-footer-text">
            Protected internal engineering console. Local Agents pair securely per account.
          </span>
        </div>
      </div>
    </div>
  );
}
