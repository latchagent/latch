# Troubleshooting

## Docker: app starts but DB isn’t ready

- Confirm the `db` container is healthy:

```bash
docker compose ps
```

- Check logs:

```bash
docker compose logs -f db
docker compose logs -f app
```

## “Invalid agent key”

- Ensure you copied the **raw agent key** from the agent creation dialog.
- Ensure the agent belongs to the workspace you configured.

## “APPROVAL_REQUIRED”

This is expected for risky actions (e.g. `EXECUTE`, external `SEND`, `SUBMIT`).
Approve the request in the dashboard and retry with the provided token (your agent typically performs the retry).

