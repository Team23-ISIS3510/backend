Notifications integration tests

Files:
- `notifications.e2e-spec.ts` — Jest + Supertest integration tests for the Notifications controller.
- `utils/notifications-test-helpers.ts` — test helpers: mock service, test app factory, payload helpers.

Running the tests

These tests are Nest controller-level integration tests that use a mocked `NotificationService`.
They are safe to run locally and do not connect to production Firebase by default.

1) Run using the repository test runner (from project root):

One-off (recommended) — explicitly select the config to avoid "Multiple configurations found" errors:

```bash
# run a single file with the explicit jest config
npx jest --config ./jest.config.mjs test/notifications.e2e-spec.ts

# Or if you prefer npm and want the script to use the project jest config, the repo's `test` script
# has been updated to use `jest --config ./jest.config.mjs` so this also works:
npm test -- test/notifications.e2e-spec.ts
```

2) Running against a real Firebase-backed environment

- These controller tests use mocks and therefore do not require Firebase. If you later want to run full e2e tests against a running app connected to the Firebase emulator or a test project, set the appropriate ENV vars before starting the app (e.g. `GOOGLE_APPLICATION_CREDENTIALS` or emulator host variables) and start the Nest app pointing to that environment, then run Supertest requests against the running server.

Guidance:
- To target Firebase Emulator, start the emulator and export any required envs (project id, host/port) before running tests that use real Firebase.
- Keep the mocked helpers in `test/utils` to adapt to real-service implementations later.

Extending tests

- Add cases to `notifications.e2e-spec.ts` grouped by endpoint; use the helpers to create payloads and to assert timestamp shapes.
- When switching to real-service tests, replace mocked service in `createNotificationTestApp` with the real providers and ensure test isolation (clear collections between runs).
