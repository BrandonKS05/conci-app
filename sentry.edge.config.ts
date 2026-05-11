import * as Sentry from "@sentry/nextjs";

import { createBeforeSend } from "./sentry.shared";

const dsn = process.env.SENTRY_DSN?.trim();

Sentry.init({
  dsn,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  beforeSend: createBeforeSend(dsn),
});
