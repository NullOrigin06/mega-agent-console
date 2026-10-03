/** A 400 from POST /api/jobs with per-field messages (tank modules, contract §1). */
export class ApiFieldError extends Error {
  readonly fieldErrors: Record<string, string>;
  constructor(message: string, fieldErrors: Record<string, string>) {
    super(message);
    this.name = "ApiFieldError";
    this.fieldErrors = fieldErrors;
  }
}
