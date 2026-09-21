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
