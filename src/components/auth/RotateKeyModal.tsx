import { useState } from "react";
import { rotateApiKey } from "../../api";
import { setAuthSession, type AuthSession } from "../../utils/authSession";
import { IconLoader, IconAlertTriangle, IconCheckCircle, IconLock } from "../common/Icon";

interface RotateKeyModalProps {
  session: AuthSession;
  onClose: () => void;
  onKeyRotated: (session: AuthSession) => void;
}

/**
 * Lets a user invalidate their current API key and issue a new one -
 * requires re-entering the password (not the current key) so a leaked key
 * alone can't be used to rotate itself and shut the real owner out. Any
 * Local Agent using the old key will need the new one re-entered there too.
 */
export function RotateKeyModal({ session, onClose, onKeyRotated }: RotateKeyModalProps) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await rotateApiKey(session.email, password);
      setAuthSession({ userId: session.userId, apiKey: response.apiKey, email: session.email });
      setNewKey(response.apiKey);
      onKeyRotated({ ...session, apiKey: response.apiKey });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key rotation failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Rotate API Key</div>
            <div className="modal-subtitle">
              Immediately invalidates your current key. Any paired Local Agent
              will need the new key entered before it can reconnect.
            </div>
          </div>
        </div>
        <div className="modal-body">
          {error && (
            <div className="alert-banner alert-banner-danger" role="alert">
              <IconAlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}

          {newKey ? (
            <>
              <div className="alert-banner alert-banner-success" role="status">
                <IconCheckCircle size={16} />
                <span>Key rotated. Copy it now - it won't be shown again.</span>
              </div>
              <div className="auth-input-wrapper">
                <input
                  type="text"
                  className="form-input text-mono"
                  value={newKey}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
              </div>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Done
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="rotate-password" className="form-label">Confirm Password</label>
                <div className="auth-input-wrapper">
                  <IconLock size={16} className="auth-input-icon" />
                  <input
                    id="rotate-password"
                    type="password"
                    className="form-input auth-input"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={isSubmitting}
                    autoFocus
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? <IconLoader size={16} className="animate-spin" /> : <span>Rotate Key</span>}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
