import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AdminSessionExpiredError,
  adminDeleteUser,
  adminListUsers,
  adminSetUserApproval,
  closeAdminSession,
  openAdminSession,
  type AdminUser,
  type AdminUserFilter,
} from "../../api";
import { IconAlertTriangle, IconCheckCircle, IconLoader, IconLock, IconRefresh } from "../common/Icon";

interface AdminRequestsModalProps {
  onClose: () => void;
}

const FILTERS: Array<{ value: AdminUserFilter; label: string }> = [
  { value: "pending", label: "Waiting" },
  { value: "approved", label: "Approved" },
  { value: "all", label: "Everyone" },
];

function formatRequested(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Admin mode: approve or remove the people who can use this console. Opening it asks for the
 * administrator's password again; the resulting admin session lives only in this component's
 * memory (never localStorage) and ends when the dialog closes or after 30 idle minutes, so a
 * stolen browser login alone cannot approve anyone.
 */
export function AdminRequestsModal({ onClose }: AdminRequestsModalProps) {
  const queryClient = useQueryClient();
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const [password, setPassword] = useState("");
  const [isOpening, setIsOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AdminUserFilter>("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // End the admin session on the server when the dialog goes away.
  useEffect(() => {
    return () => {
      if (tokenRef.current) void closeAdminSession(tokenRef.current);
    };
  }, []);

  const users = useQuery({
    queryKey: ["admin-users", filter, adminToken],
    queryFn: () => adminListUsers(adminToken!, filter),
    enabled: Boolean(adminToken),
    // Stop polling once it has failed (an expired admin session would just keep answering 401).
    refetchInterval: (q) => (q.state.error ? false : 15000),
    retry: false,
  });

  const expireSession = (message: string) => {
    tokenRef.current = null;
    setAdminToken(null);
    setPassword("");
    setNotice(message);
  };

  // A timed-out admin session is derived, not stored: the password prompt simply comes back.
  const sessionExpired = users.error instanceof AdminSessionExpiredError;
  const activeToken = sessionExpired ? null : adminToken;
  const shownNotice = sessionExpired ? "Admin mode timed out. Enter your password again." : notice;

  const handleOpen = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!password) {
      setError("Enter your password to open admin mode.");
      return;
    }
    setIsOpening(true);
    try {
      const session = await openAdminSession(password);
      tokenRef.current = session.adminToken;
      setAdminToken(session.adminToken);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open admin mode.");
    } finally {
      setIsOpening(false);
    }
  };

  const refreshEverywhere = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
    await queryClient.invalidateQueries({ queryKey: ["me"] });
  };

  const run = async (user: AdminUser, work: () => Promise<void>, done: string) => {
    if (!activeToken) return;
    setError(null);
    setBusyId(user.id);
    try {
      await work();
      setNotice(done);
      setConfirmDeleteId(null);
      await refreshEverywhere();
    } catch (err) {
      if (err instanceof AdminSessionExpiredError) expireSession(err.message);
      else setError(err instanceof Error ? err.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  };

  const handleClose = () => {
    if (tokenRef.current) void closeAdminSession(tokenRef.current);
    tokenRef.current = null;
    onClose();
  };

  const rows = users.data ?? [];

  return (
    <Dialog.Root open onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop" />
        <Dialog.Content className="modal-container" style={{ maxWidth: 720 }}>
          <div className="modal-header">
            <div>
              <Dialog.Title className="modal-title">Sign-up requests</Dialog.Title>
              <Dialog.Description className="modal-subtitle">
                Approve or remove the people who can use this console. Every action is logged with your name.
              </Dialog.Description>
            </div>
          </div>

          <div className="modal-body">
            {shownNotice && (
              <div className="alert-banner alert-banner-info" role="status">
                <IconCheckCircle size={16} />
                <span>{shownNotice}</span>
              </div>
            )}
            {error && (
              <div className="alert-banner alert-banner-danger" role="alert">
                <IconAlertTriangle size={16} />
                <span>{error}</span>
              </div>
            )}

            {!activeToken ? (
              <form onSubmit={handleOpen} className="auth-form">
                <p className="admin-row-note">
                  Admin mode asks for your password again, and closes after 30 minutes without use.
                </p>
                <div className="form-group">
                  <label htmlFor="admin-password" className="form-label">Confirm password</label>
                  <div className="auth-input-wrapper">
                    <IconLock size={16} className="auth-input-icon" />
                    <input
                      id="admin-password"
                      type="password"
                      className="form-input auth-input"
                      placeholder="••••••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      disabled={isOpening}
                      autoFocus
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Dialog.Close asChild>
                    <button type="button" className="btn btn-secondary" disabled={isOpening}>Cancel</button>
                  </Dialog.Close>
                  <button type="submit" className="btn btn-primary" disabled={isOpening}>
                    {isOpening ? <IconLoader size={16} className="animate-spin" /> : <span>Open admin mode</span>}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="admin-toolbar">
                  <div className="admin-segment" role="group" aria-label="Show">
                    {FILTERS.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        aria-pressed={filter === f.value}
                        onClick={() => setFilter(f.value)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void refreshEverywhere()}
                      disabled={users.isFetching}
                      title="Reload the list"
                    >
                      <IconRefresh size={14} className={users.isFetching ? "animate-spin" : ""} />
                      <span>Refresh</span>
                    </button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleClose}>
                      Close admin mode
                    </button>
                  </div>
                </div>

                {users.isLoading ? (
                  <div className="empty-state" role="status">
                    <IconLoader size={24} className="animate-spin" />
                  </div>
                ) : rows.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-title">
                      {filter === "pending" ? "No one is waiting" : "No accounts here"}
                    </div>
                    <div className="empty-state-text">
                      {filter === "pending" ? "New sign-ups will show up here for you to approve." : "Try another filter."}
                    </div>
                  </div>
                ) : (
                  <div className="admin-list" role="list">
                    {rows.map((user) => (
                      <div className="admin-row" role="listitem" key={user.id}>
                        <div className="admin-row-main">
                          <div className="admin-row-email">
                            <span className="text-mono">{user.email}</span>
                            {user.isApproved ? (
                              <span className="badge badge-status badge-completed">Approved</span>
                            ) : (
                              <span className="badge badge-status badge-pending">Waiting</span>
                            )}
                            {user.isAdmin && <span className="badge badge-neutral">Admin</span>}
                          </div>
                          <div className="admin-row-meta">
                            Signed up {formatRequested(user.createdAt)} · {user.agentCount} agent
                            {user.agentCount === 1 ? "" : "s"} · {user.jobCount} job{user.jobCount === 1 ? "" : "s"}
                            {!user.emailVerified && " · email not verified"}
                          </div>
                        </div>

                        <div className="admin-row-actions">
                          {user.isAdmin ? (
                            <span className="admin-row-note">Change with the local admin tool</span>
                          ) : (
                            <>
                              {!user.isApproved ? (
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  disabled={busyId === user.id}
                                  onClick={() =>
                                    void run(
                                      user,
                                      async () => void (await adminSetUserApproval(activeToken, user.id, "approve")),
                                      `Approved ${user.email}.`
                                    )
                                  }
                                >
                                  {busyId === user.id ? <IconLoader size={14} className="animate-spin" /> : <span>Approve</span>}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  disabled={busyId === user.id}
                                  onClick={() =>
                                    void run(
                                      user,
                                      async () => void (await adminSetUserApproval(activeToken, user.id, "revoke")),
                                      `Revoked ${user.email}. Their key stopped working.`
                                    )
                                  }
                                >
                                  Revoke access
                                </button>
                              )}
                              {confirmDeleteId === user.id ? (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-danger-sm btn-danger-confirm"
                                  disabled={busyId === user.id}
                                  onClick={() =>
                                    void run(
                                      user,
                                      () => adminDeleteUser(activeToken, user.id, user.email),
                                      `Deleted ${user.email}.`
                                    )
                                  }
                                >
                                  Delete account and its jobs?
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm btn-danger-sm"
                                  disabled={busyId === user.id}
                                  onClick={() => setConfirmDeleteId(user.id)}
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
