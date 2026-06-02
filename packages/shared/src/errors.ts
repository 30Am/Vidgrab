/**
 * Typed error codes shared across the API, worker, and frontend so the UI can
 * render friendly messages ("This Instagram post is private" beats "job failed").
 */

export const ErrorCode = {
  INVALID_URL: "INVALID_URL",
  UNSUPPORTED_SOURCE: "UNSUPPORTED_SOURCE",
  TURNSTILE_FAILED: "TURNSTILE_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  QUEUE_FULL: "QUEUE_FULL",
  PROBE_FAILED: "PROBE_FAILED",
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  PRIVATE_CONTENT: "PRIVATE_CONTENT",
  NOT_FOUND: "NOT_FOUND",
  GEO_BLOCKED: "GEO_BLOCKED",
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  DURATION_TOO_LONG: "DURATION_TOO_LONG",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  INTERNAL: "INTERNAL",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_URL: 400,
  UNSUPPORTED_SOURCE: 400,
  TURNSTILE_FAILED: 403,
  RATE_LIMITED: 429,
  QUEUE_FULL: 503,
  PROBE_FAILED: 502,
  EXTRACTION_FAILED: 502,
  PRIVATE_CONTENT: 422,
  NOT_FOUND: 404,
  GEO_BLOCKED: 451,
  FILE_TOO_LARGE: 413,
  DURATION_TOO_LONG: 422,
  UPLOAD_FAILED: 502,
  INTERNAL: 500,
};

/** User-facing default messages. The worker may override with specifics. */
const FRIENDLY_MESSAGE: Record<ErrorCode, string> = {
  INVALID_URL: "That doesn't look like a valid link.",
  UNSUPPORTED_SOURCE: "Only YouTube and Instagram links are supported right now.",
  TURNSTILE_FAILED: "Bot check failed. Please reload and try again.",
  RATE_LIMITED: "You've hit the hourly download limit. Try again later.",
  QUEUE_FULL: "We're really busy right now. Please try again in a minute.",
  PROBE_FAILED: "We couldn't read that link. It may be private or removed.",
  EXTRACTION_FAILED: "The download failed. The source may have changed — try again shortly.",
  PRIVATE_CONTENT: "This content is private or login-restricted.",
  NOT_FOUND: "That video could not be found.",
  GEO_BLOCKED: "This content isn't available in our region.",
  FILE_TOO_LARGE: "That file is too large to download here.",
  DURATION_TOO_LONG: "That video is too long to download here.",
  UPLOAD_FAILED: "We downloaded the file but couldn't store it. Please retry.",
  INTERNAL: "Something went wrong on our end. Please try again.",
};

export interface SerializedError {
  code: ErrorCode;
  message: string;
}

/** Application error carrying a code, an HTTP status, and a friendly message. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  /** Raw underlying detail (e.g. yt-dlp stderr) for logs only — never sent to users. */
  readonly detail?: string;

  constructor(code: ErrorCode, message?: string, detail?: string) {
    super(message ?? FRIENDLY_MESSAGE[code]);
    this.name = "AppError";
    this.code = code;
    this.statusCode = HTTP_STATUS[code];
    this.detail = detail;
  }

  toJSON(): SerializedError {
    return { code: this.code, message: this.message };
  }
}

/**
 * Maps raw yt-dlp stderr to a typed AppError. yt-dlp error text is the most
 * reliable signal we have for *why* an extraction failed.
 */
export function classifyYtDlpError(stderr: string): AppError {
  const s = stderr.toLowerCase();
  if (s.includes("private") || s.includes("login required") || s.includes("sign in")) {
    return new AppError(ErrorCode.PRIVATE_CONTENT, undefined, stderr);
  }
  if (s.includes("not available in your country") || s.includes("geo")) {
    return new AppError(ErrorCode.GEO_BLOCKED, undefined, stderr);
  }
  if (s.includes("video unavailable") || s.includes("does not exist") || s.includes("not found") || s.includes("404")) {
    return new AppError(ErrorCode.NOT_FOUND, undefined, stderr);
  }
  return new AppError(ErrorCode.EXTRACTION_FAILED, undefined, stderr);
}
