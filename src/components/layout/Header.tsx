import { IconRefresh, IconUser, IconLogOut, IconKey, IconList } from "../common/Icon";
import { API_MODE } from "../../api";
import type { AuthSession } from "../../utils/authSession";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AmbientMotionToggle } from "../ambient/AmbientMotionToggle";
import { ambientBus } from "../ambient/ambientBus";
import { useAmbientBus } from "../ambient/useAmbientBus";
import type { AmbientMotionPref } from "../../ambient/types";

const MOTION_PREFS: Array<{ value: AmbientMotionPref; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

interface HeaderProps {
  onRefresh: () => void;
  isRefreshing?: boolean;
  session?: AuthSession | null;
  onLogout?: () => void;
  onOpenMobileNav?: () => void;
  onOpenRotateKey?: () => void;
}

export function Header({
  onRefresh,
  isRefreshing = false,
  session,
  onLogout,
  onOpenMobileNav,
  onOpenRotateKey,
}: HeaderProps) {
  const { motionPref } = useAmbientBus();
  return (
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
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className="header-account-pill workstation-dropdown-trigger"
                title={`Logged in as ${session.email}`}
                aria-label={`Account menu for ${session.email}`}
              >
                <IconUser size={14} className="text-accent" />
                <span className="header-account-email text-mono">{session.email}</span>
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="workstation-dropdown-content" align="end" sideOffset={6}>
                <DropdownMenu.Label className="header-menu-label">Ambient motion</DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={motionPref}
                  onValueChange={(v) => ambientBus.setMotionPref(v as AmbientMotionPref)}
                  aria-label="Ambient motion"
                >
                  {MOTION_PREFS.map((p) => (
                    <DropdownMenu.RadioItem key={p.value} value={p.value} className="workstation-dropdown-item">
                      <span className="header-menu-check" aria-hidden="true">
                        <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
                      </span>
                      {p.label}
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}

        {session && (
          <button
            type="button"
            className="btn btn-secondary btn-icon"
            onClick={onOpenRotateKey}
            title="Rotate API Key"
          >
            <IconKey size={16} />
            <span className="hide-mobile">Rotate Key</span>
          </button>
        )}

        <AmbientMotionToggle />

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
  );
}
