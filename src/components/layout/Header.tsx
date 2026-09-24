import { useState } from "react";
import { IconRefresh, IconUser, IconLogOut, IconKey, IconList } from "../common/Icon";
import { API_MODE } from "../../api";
import type { AuthSession } from "../../utils/authSession";
import { RotateKeyModal } from "../auth/RotateKeyModal";

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  session?: AuthSession | null;
  onLogout?: () => void;
  onSessionUpdate?: (session: AuthSession) => void;
  onOpenMobileNav?: () => void;
}

export function Header({
  onRefresh,
  isRefreshing = false,
  session,
  onLogout,
  onSessionUpdate,
  onOpenMobileNav,
}: HeaderProps) {
  const [showRotateKey, setShowRotateKey] = useState(false);

  return (
    <>
      <header className="console-header">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={onOpenMobileNav}
          aria-label="Open navigation"
        >
          <IconList size={18} />
        </button>

        <span className={`brand-env-tag ${API_MODE === "real" ? "brand-env-real" : ""}`}>
          {API_MODE === "real" ? "REAL API" : "MOCK API v1.0"}
        </span>

        <div className="header-actions">
          {session && (
            <div className="header-account-pill" title={`Logged in as ${session.email}`}>
              <IconUser size={14} className="text-accent" />
              <span className="header-account-email text-mono">{session.email}</span>
            </div>
          )}

          {session && (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={() => setShowRotateKey(true)}
              title="Rotate API Key"
            >
              <IconKey size={16} />
              <span className="hide-mobile">Rotate Key</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh job status from API"
          >
            <IconRefresh size={16} className={isRefreshing ? "animate-spin" : ""} />
            <span className="hide-mobile">Refresh</span>
          </button>

          {onLogout && (
            <button
              type="button"
              className="btn btn-secondary btn-icon"
              onClick={onLogout}
              title="Sign Out"
            >
              <IconLogOut size={16} />
              <span className="hide-mobile">Sign Out</span>
            </button>
          )}
        </div>
      </header>

      {showRotateKey && session && (
        <RotateKeyModal
          session={session}
          onClose={() => setShowRotateKey(false)}
          onKeyRotated={(updated) => onSessionUpdate?.(updated)}
        />
      )}
    </>
  );
}
