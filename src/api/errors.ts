/** A 400 from POST /api/jobs with per-field messages (tank modules, contract §1). */
export class ApiFieldError extends Error {
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.name = "ApiFieldError";
    this.fieldErrors = fieldErrors;
  }
}

/**
 * The admin session (not the login) is missing or timed out. Distinct from a 401 on the normal
 * key, which signs the user out: this only sends the administrator back to the password prompt.
 */
export class AdminSessionExpiredError extends Error {
  constructor(message = "Admin mode timed out. Enter your password again.") {
    super(message);
    this.name = "AdminSessionExpiredError";
  }
}
