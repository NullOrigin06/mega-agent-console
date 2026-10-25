export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  apiKey: string;
  email?: string;
}

export interface PairedAgentInfo {
  agentId: string;
  name?: string;
  online: boolean;
  pairedAt: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface VerifyEmailRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface RotateKeyRequest {
  email: string;
  password: string;
}

/** GET /api/me - who is signed in, and whether they may open admin mode. */
export interface MeInfo {
  email: string;
  isAdmin: boolean;
  /** Only sent to administrators: how many sign-up requests are waiting. */
  pendingCount: number | null;
}

export type AdminUserFilter = "pending" | "approved" | "all";
export type AdminUserAction = "approve" | "revoke";

export interface AdminUser {
  id: string;
  email: string;
  emailVerified: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  createdAt: string;
  agentCount: number;
  jobCount: number;
}

export interface AdminSessionInfo {
  adminToken: string;
  expiresInSeconds: number;
}
