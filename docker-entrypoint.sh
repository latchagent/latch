#!/bin/sh
set -e

echo "Starting Latch..."

if [ -z "${DATABASE_URL}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "       If you're using Docker Compose, this should be set automatically."
  exit 1
fi

if [ -z "${BETTER_AUTH_SECRET}" ]; then
  echo "ERROR: BETTER_AUTH_SECRET is not set."
  echo "       Set a strong secret for any non-local deployment."
  exit 1
fi

# Run database migrations
echo "Running database schema sync..."
echo "  - This uses drizzle-kit push (non-interactive, --force)."
echo "  - For more controlled upgrades, generate migrations and run drizzle-kit migrate."

npx drizzle-kit push --config drizzle.config.ts --force

# Check if this is first run (no workspaces exist)
# We'll handle seeding via the app itself on first login

echo "Latch is ready."

# Execute the main command
exec "$@"
