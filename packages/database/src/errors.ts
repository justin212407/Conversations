export class DomainError extends Error {
  constructor(
    readonly statusCode: 400 | 404 | 409 | 413,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}
export class ResourceNotFound extends DomainError {
  constructor() {
    super(404, "NOT_FOUND", "Resource not found")
  }
}
export class ConversationConflict extends DomainError {
  constructor() {
    super(
      409,
      "CONFLICT",
      "Conversation or operation state conflicts with this request"
    )
  }
}
export class InvalidInput extends DomainError {
  constructor() {
    super(400, "INVALID_INPUT", "Invalid request")
  }
}
export class InputLimitExceeded extends DomainError {
  constructor() {
    super(413, "INPUT_LIMIT_EXCEEDED", "Input exceeds the configured limit")
  }
}
export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
