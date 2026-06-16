/**
 * App-wide error classes.
 *
 * Throw an ApiError (or one of its subclasses) anywhere in a controller
 * or service when you want to surface a specific HTTP status + message
 * to the client. The error middleware turns them into JSON responses.
 *
 * Anything else (e.g. a programming bug) bubbles up as an unknown error
 * and the middleware returns a generic 500.
 */

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    status: number,
    message: string,
    code: string = "API_ERROR",
    details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class BadRequestError extends ApiError {
  constructor(message = "Bad request", details?: unknown) {
    super(400, message, "BAD_REQUEST", details);
    this.name = "BadRequestError";
  }
}

export class ValidationError extends ApiError {
  constructor(message = "Validation failed", details?: unknown) {
    super(400, message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(404, message, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends ApiError {
  constructor(message = "Conflict") {
    super(409, message, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class InternalServerError extends ApiError {
  constructor(message = "Internal server error", code = "INTERNAL_ERROR", details?: unknown) {
    super(500, message, code, details);
    this.name = "InternalServerError";
  }
}
