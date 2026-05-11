import { createBeforeSend } from "./sentry.shared";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend: createBeforeSend(dsn),
    });
  });
}
