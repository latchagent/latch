# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Latch, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email security concerns to: security@getlatch.dev
3. Include as much detail as possible:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work with you to understand and address the issue.

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Security Best Practices

When self-hosting Latch:

- Use strong, unique values for `BETTER_AUTH_SECRET`
- Run behind HTTPS in production
- Keep your database credentials secure
- Regularly update to the latest version
- Review audit logs for suspicious activity
