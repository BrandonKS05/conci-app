import type { ErrorEvent } from "@sentry/core";

type SanitizableEvent = ErrorEvent & {
  request?: {
    headers?: Record<string, unknown>;
  };
};

const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]+/g,
  /sk_test_[A-Za-z0-9]+/g,
  /\bre_[A-Za-z0-9]+\b/g,
  /eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,
];

const REDACTED = "[Filtered]";

function scrubString(value: string): string {
  let next = value;

  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, REDACTED);
  }

  return next;
}

export function createBeforeSend(dsn: string | undefined) {
  return function beforeSend(event: ErrorEvent): ErrorEvent | null {
    if (!dsn) {
      return null;
    }

    const mutableEvent = event as SanitizableEvent;

    if (typeof mutableEvent.message === "string") {
      mutableEvent.message = scrubString(mutableEvent.message);
    }

    const exceptionValues = mutableEvent.exception?.values;
    if (Array.isArray(exceptionValues)) {
      for (const exception of exceptionValues) {
        if (typeof exception.value === "string") {
          exception.value = scrubString(exception.value);
        }
      }
    }

    const headers = mutableEvent.request?.headers;
    if (headers && typeof headers === "object") {
      for (const [key] of Object.entries(headers)) {
        if (key.toLowerCase() === "authorization") {
          headers[key] = REDACTED;
        }
      }
    }

    return mutableEvent;
  };
}
