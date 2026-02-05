import Link from "next/link";

const DOCS_URL = "https://latch.mintlify.app/";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] text-[#171717] dark:text-[#ededed]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Latch</h1>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-[#737373] hover:text-[#171717] dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="text-sm px-3 py-2 rounded-lg bg-[#171717] dark:bg-white text-white dark:text-[#0a0a0a] hover:bg-[#262626] dark:hover:bg-[#e5e5e5] transition-colors"
            >
              Create account
            </Link>
          </div>
        </div>

        <p className="mt-4 text-lg text-[#737373]">
          Run Latch locally, then point your agent at the CLI proxy. Risky tool calls will require approval.
        </p>

        <div className="mt-8 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] p-6">
          <h2 className="text-lg font-medium">Getting started (Docker)</h2>
          <ol className="mt-4 space-y-3 text-sm text-[#737373]">
            <li>
              <span className="text-[#171717] dark:text-white font-medium">1.</span>{" "}
              Start Latch:
              <pre className="mt-2 overflow-x-auto rounded-lg bg-[#0a0a0a] text-white p-4 text-xs">
                <code>{`git clone https://github.com/latchhq/latch
cd latch
docker compose up --build`}</code>
              </pre>
            </li>
            <li>
              <span className="text-[#171717] dark:text-white font-medium">2.</span>{" "}
              Open the dashboard at{" "}
              <a
                className="text-[#171717] dark:text-white underline underline-offset-4"
                href="http://localhost:3000"
                target="_blank"
                rel="noreferrer"
              >
                http://localhost:3000
              </a>
              .
            </li>
            <li>
              <span className="text-[#171717] dark:text-white font-medium">3.</span>{" "}
              Create a workspace, upstream, and agent. Copy the workspace ID, upstream ID, and agent key.
            </li>
          </ol>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] p-6">
          <h2 className="text-lg font-medium">Getting started (CLI)</h2>
          <pre className="mt-4 overflow-x-auto rounded-lg bg-[#0a0a0a] text-white p-4 text-xs">
            <code>{`npm install -g @latchagent/cli
latch init
latch run --upstream-command "npx" --upstream-args "-y,@modelcontextprotocol/server-github"`}</code>
          </pre>
          <p className="mt-3 text-sm text-[#737373]">
            When a tool call requires approval, approve it in the dashboard and retry (your agent/tooling typically handles the retry).
          </p>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] p-6">
          <div>
            <p className="text-sm font-medium">Documentation</p>
            <p className="text-sm text-[#737373]">Full guides, configuration, and Telegram setup.</p>
          </div>
          <a
            href={DOCS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-sm px-3 py-2 rounded-lg bg-[#171717] dark:bg-white text-white dark:text-[#0a0a0a] hover:bg-[#262626] dark:hover:bg-[#e5e5e5] transition-colors"
          >
            Open docs
          </a>
        </div>
      </div>
    </main>
  );
}
