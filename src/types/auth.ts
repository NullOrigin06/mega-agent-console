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
