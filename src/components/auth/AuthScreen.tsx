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
import { requestedAuthMode } from "../../utils/landing";
import { IconLoader, IconArrowLeft, IconAlertTriangle, IconCheckCircle } from "../common/Icon";
import { LANDING_PATH } from "../../utils/landing";
import megaLogo from "../../assets/mega-logo.png";
import type { Relief } from "./relief/relief.js";

interface AuthScreenProps {
  onLoginSuccess: (session: AuthSession) => void;
}

type Mode = "login" | "signup" | "forgot-password" | "reset-password" | "verify-email";

export function AuthScreen({ onLoginSuccess }: AuthScreenProps) {
  const urlToken = readUrlToken();
  const [mode, setMode] = useState<Mode>(urlToken?.mode ?? requestedAuthMode());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Brand panel background: the tube sheet relief, in the console's navy. Loaded on demand so the
  // WebGL code stays out of the main bundle; without WebGL2 the panel keeps its plain ground.
  const reliefRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = reliefRef.current;
    if (!canvas || import.meta.env.MODE === "test") return;
    let relief: Relief | null = null;
    let cancelled = false;
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    import("./relief/relief.js")
      .then((mod) => {
        if (cancelled) return;
        relief = mod.createRelief(canvas, {
          scene: 1,
          side: 0,
          zoom: 1.26,
          center: [0.04, -0.03],
          plaster: "#132038",
          tint: "#38bdf8",
          // With a mouse the plate is hidden until the cursor passes over it; on touch screens,
          // where nothing can hover, it stays visible.
          restDepth: canHover ? 0 : 0.72,
          idleSweep: false,
          falloff: 0.065,
          dissipation: 0.95,
          rainbow: 0,
          scrollFactor: 0,
        });
        if (!relief) canvas.classList.add("is-unavailable");
        // Reduced motion already switches off the idle sweep and the tilt inside the engine;
        // keep the loop running so the plate still answers the visitor's own cursor.
        else relief.setPaused(false);
      })
      .catch(() => canvas.classList.add("is-unavailable"));
    return () => {
      cancelled = true;
      relief?.destroy();
    };
  }, []);
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
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters.");
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

  const isEntry = mode === "login" || mode === "signup";
  const title =
    mode === "forgot-password"
      ? "Reset your password"
      : mode === "reset-password"
        ? "Choose a new password"
        : mode === "verify-email"
          ? "Verifying your email"
          : mode === "signup"
            ? "Create your account"
            : "Sign in";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const passwordField = (id: string, label: string, value: string, onChange: (v: string) => void, opts: {
    autoComplete: string;
    disabled: boolean;
    autoFocus?: boolean;
    aside?: React.ReactNode;
    hint?: string;
  }) => (
    <div className="form-group">
      <div className="auth-label-row">
        <label htmlFor={id} className="form-label">{label}</label>
        {opts.aside}
      </div>
      <div className="auth-input-wrapper">
        <input
          id={id}
          type={showPassword ? "text" : "password"}
          className="form-input auth-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={opts.autoComplete}
          aria-describedby={opts.hint ? `${id}-hint` : undefined}
          required
          disabled={opts.disabled}
          autoFocus={opts.autoFocus}
        />
        <button
          type="button"
          className="auth-reveal-btn"
          onClick={() => setShowPassword((v) => !v)}
          aria-pressed={showPassword}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {opts.hint && <p id={`${id}-hint`} className="auth-field-hint">{opts.hint}</p>}
    </div>
  );

  return (
    <div className="auth-screen-container">
      <main className="auth-card">
        {API_MODE === "mock" && <span className="brand-env-tag auth-env-tag">Mock data</span>}

        <div className="auth-head">
          <h1 className="auth-heading">{title}</h1>
          {mode === "signup" && (
            <p className="auth-instructions">You'll use it to run jobs and to pair the workstations that make your drawings.</p>
          )}
          {mode === "forgot-password" && (
            <p className="auth-instructions">Enter your account email and we'll send a link to reset your password.</p>
          )}
        </div>

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

        {/* Sign in / Create account */}
        {isEntry && (
          <form onSubmit={handleLoginOrSignup} className="auth-form">
            <div className="form-group">
              <label htmlFor="auth-email" className="form-label">Email</label>
              <input
                id="auth-email"
                type="email"
                className="form-input auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            {passwordField("auth-password", "Password", password, setPassword, {
              autoComplete: mode === "login" ? "current-password" : "new-password",
              disabled: isSubmitting,
              aside: mode === "login" ? (
                <button type="button" className="btn-link auth-aside-link" onClick={() => switchMode("forgot-password")}>
                  Forgot password?
                </button>
              ) : undefined,
              hint: mode === "signup" ? "At least 8 characters." : undefined,
            })}

            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting && <IconLoader size={16} className="animate-spin" />}
              <span>
                {mode === "login"
                  ? isSubmitting ? "Signing in" : "Sign in"
                  : isSubmitting ? "Creating account" : "Create account"}
              </span>
            </button>
          </form>
        )}

        {isEntry && (
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                <p>
                  No account yet?{" "}
                  <button type="button" className="btn-link" onClick={() => switchMode("signup")}>Create one</button>
                </p>
                <p>
                  Didn't get the verification email?{" "}
                  <button type="button" className="btn-link" onClick={handleResendVerification} disabled={isSubmitting}>
                    Send it again
                  </button>
                </p>
              </>
            ) : (
              <p>
                Already have an account?{" "}
                <button type="button" className="btn-link" onClick={() => switchMode("login")}>Sign in</button>
              </p>
            )}
          </div>
        )}

        {API_MODE === "mock" && isEntry && (
          <p className="auth-mock-hint">
            This build runs on mock data, so any email and password will sign you in.
          </p>
        )}

        {/* Forgot password */}
        {mode === "forgot-password" && (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <div className="form-group">
              <label htmlFor="forgot-email" className="form-label">Email</label>
              <input
                id="forgot-email"
                type="email"
                className="form-input auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting && <IconLoader size={16} className="animate-spin" />}
              <span>{isSubmitting ? "Sending" : "Send reset link"}</span>
            </button>
            <div className="auth-switch">
              <p><button type="button" className="btn-link" onClick={goToLogin}>Back to sign in</button></p>
            </div>
          </form>
        )}

        {/* Reset password (arrived via emailed link) */}
        {mode === "reset-password" && (
          <form onSubmit={handleResetPassword} className="auth-form">
            {passwordField("reset-password", "New password", password, setPassword, {
              autoComplete: "new-password",
              disabled: isSubmitting || Boolean(info),
              autoFocus: true,
              hint: "At least 8 characters.",
            })}
            {passwordField("reset-confirm", "Confirm new password", confirmPassword, setConfirmPassword, {
              autoComplete: "new-password",
              disabled: isSubmitting || Boolean(info),
            })}
            {info ? (
              <button type="button" className="btn btn-primary auth-submit-btn" onClick={goToLogin}>
                <span>Continue to sign in</span>
              </button>
            ) : (
              <button type="submit" className="btn btn-primary auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting && <IconLoader size={16} className="animate-spin" />}
                <span>{isSubmitting ? "Saving" : "Save new password"}</span>
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
                <span>Continue to sign in</span>
              </button>
            )}
          </div>
        )}
      </main>

      <aside className="auth-brand-panel">
        <canvas ref={reliefRef} className="auth-relief" aria-hidden="true" />
        <div className="auth-brand-top">
          <div className="auth-logo-badge">
            <img src={megaLogo} alt="Mega EPC" className="auth-logo-img" />
          </div>
          <span className="auth-brand-name">Agent Console</span>
          <a className="auth-back-link" href={LANDING_PATH}>
            <IconArrowLeft size={14} />
            <span>Back to home</span>
          </a>
        </div>


        <div className="auth-brand-body">
          <p className="auth-brand-headline">Heat exchanger drawings, straight from the datasheet.</p>
          <p className="auth-brand-copy">
            Tube sheets, bonnet flanges, heat exchangers, shop tanks and site tanks, drawn in GstarCAD or AutoCAD on your own workstation.
          </p>
        </div>
      </aside>
    </div>
  );
}
