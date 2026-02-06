# Contributing to Latch

Thanks for your interest in contributing to Latch!

## Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/latchagent/latch
   cd latch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp env.example .env
   # Edit .env with your database URL
   ```

4. Run database migrations:
   ```bash
   npx drizzle-kit push
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## Project Structure

```
latch/
├── app/                    # Next.js dashboard
├── components/             # React components
├── lib/                    # Server-side utilities
├── packages/
│   ├── cli/               # Latch CLI
│   ├── shared/            # Shared types and utilities
│   └── demo-mcp-server/   # Test MCP server
```

## Code Style

- We use TypeScript with strict mode
- ESLint and Prettier are configured
- Run `npm run lint` before committing

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with a clear message
6. Push to your fork and open a PR

## Reporting Issues

Please use GitHub Issues for bug reports and feature requests. Include:
- Clear description of the issue
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- Environment details (OS, Node version)

## Questions?

Open a GitHub Discussion or reach out to the maintainers.
