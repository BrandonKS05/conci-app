import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
};

const hasSentryAuthToken = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

export default withSentryConfig(nextConfig, {
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
  disableLogger: true,
  sourcemaps: {
    disable: !hasSentryAuthToken,
  },
});
