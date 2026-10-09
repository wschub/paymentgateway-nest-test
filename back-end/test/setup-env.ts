// Hermetic test setup: the suites must never depend on the real `.env` file
// (which holds real values) nor reach the network. This file fills every
// required variable with a non-secret placeholder and replaces `fetch` with a
// guard that fails loudly. It is registered via `setupFiles`, so it runs before
// any test module (and before `config.module.ts` is imported, which reads
// `NODE_ENV` to decide whether to load the `.env` file).

const placeholders: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL:
    "postgresql://postgres:''@localhost:5432/paymentgateway?schema=public",
  PORT: '3000',
  CORS_ORIGINS: 'http://localhost:5173',
  RATE_LIMIT_TTL: '60',
  RATE_LIMIT_MAX: '100',
  pub_stagtest: 'pub_stagtest_test_placeholder',
  prv_stagtest: 'prv_stagtest_test_placeholder',
  stagtest_events: 'stagtest_events_test_placeholder',
  stagtest_integrity: 'stagtest_integrity_test_placeholder',
  UAT_SANDBOX_URL: 'https://sandbox.invalid/v1',
};

for (const [key, value] of Object.entries(placeholders)) {
  process.env[key] = value;
}

globalThis.fetch = (() => {
  throw new Error('network calls are forbidden in tests');
}) as unknown as typeof fetch;
