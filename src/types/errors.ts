export type ErrorCode =
  | "AUTH_FAILED"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_ERROR";

export interface StructuredError {
  status: "error";
  error_code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ToolContentText {
  type: "text";
  text: string;
}

/** MCP CallToolResult-compatible shape used by all tools. */
export type ToolResult = {
  content: ToolContentText[];
  structuredContent: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
};

export function toolSuccess(
  payload: object,
  summary?: string,
): ToolResult {
  const record = payload as Record<string, unknown>;
  const text =
    summary ??
    (typeof record.status === "string"
      ? `OK: ${record.status}`
      : "OK");
  return {
    content: [{ type: "text", text }],
    structuredContent: record,
  };
}

export function toolError(
  errorCode: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ToolResult {
  const structured: StructuredError = {
    status: "error",
    error_code: errorCode,
    message,
    ...(details && Object.keys(details).length > 0 ? { details } : {}),
  };
  return {
    isError: true,
    content: [{ type: "text", text: `${errorCode}: ${message}` }],
    structuredContent: structured as unknown as Record<string, unknown>,
  };
}

export class AppError extends Error {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }

  toToolResult(): ToolResult {
    return toolError(this.errorCode, this.message, this.details);
  }
}

/** Map Google / Gaxios-style errors to AppError. */
export function mapGoogleError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const anyErr = err as {
    code?: number | string;
    status?: number;
    message?: string;
    response?: { status?: number; data?: { error?: { message?: string; status?: string } } };
  };

  const status =
    typeof anyErr.code === "number"
      ? anyErr.code
      : anyErr.status ?? anyErr.response?.status;
  const message =
    anyErr.response?.data?.error?.message ??
    anyErr.message ??
    "Upstream Google API error";

  if (status === 401 || status === 403) {
    return new AppError("AUTH_FAILED", message, { httpStatus: status });
  }
  if (status === 404) {
    return new AppError("NOT_FOUND", message, { httpStatus: status });
  }
  if (status === 429) {
    return new AppError("RATE_LIMITED", message, { httpStatus: status });
  }
  return new AppError("UPSTREAM_ERROR", message, {
    httpStatus: status,
  });
}

export function toToolResult(err: unknown): ToolResult {
  if (err instanceof AppError) return err.toToolResult();
  const mapped = mapGoogleError(err);
  return mapped.toToolResult();
}
