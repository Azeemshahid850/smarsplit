export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
  static badRequest(message, code = 'BAD_REQUEST') { return new ApiError(400, code, message); }
  static unauthorized(message = 'Unauthorized', code = 'UNAUTHORIZED') { return new ApiError(401, code, message); }
  static forbidden(message = 'Forbidden', code = 'FORBIDDEN') { return new ApiError(403, code, message); }
  static notFound(message = 'Not found', code = 'NOT_FOUND') { return new ApiError(404, code, message); }
  static conflict(message, code = 'CONFLICT') { return new ApiError(409, code, message); }
}
