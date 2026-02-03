# Configuration

## Docker environment variables

`docker-compose.yml` sets reasonable defaults for local development. For anything public-facing, change secrets and run behind HTTPS.

### Required

- `DATABASE_URL`: Postgres connection string.
- `BETTER_AUTH_SECRET`: Secret used to sign auth/session data. **Change this**.
- `BETTER_AUTH_URL`: Public URL of the app (e.g. `http://localhost:3000`).
- `NEXT_PUBLIC_APP_URL`: Public URL of the app (same as above for most setups).

### Optional (Telegram approvals)

If you want Telegram notifications/approvals, you’ll also need Telegram-related env vars (see the dashboard settings and `scripts/setup-telegram.ts`).

## CLI configuration

The CLI stores defaults in `~/.latch/config.yaml`.

See [CLI](./cli.md).

