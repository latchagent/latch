"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Shield,
  Zap,
  Eye,
  Lock,
  GitBranch,
  Terminal,
  Moon,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
} from "lucide-react";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Integrate with waitlist
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a] text-[#171717] dark:text-[#ededed]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#fafafa]/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#e5e5e5] dark:border-[#262626]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#171717] dark:bg-white flex items-center justify-center">
              <Shield className="w-4 h-4 text-white dark:text-[#0a0a0a]" />
            </div>
            <span className="font-semibold text-lg">Latch</span>
          </Link>
          <div className="hidden sm:flex items-center gap-6">
            <Link
              href="#how-it-works"
              className="text-sm text-[#737373] hover:text-[#171717] dark:hover:text-white transition-colors"
            >
              How it works
            </Link>
            <Link
              href="#examples"
              className="text-sm text-[#737373] hover:text-[#171717] dark:hover:text-white transition-colors"
            >
              Examples
            </Link>
            <Link
              href="/login"
              className="text-sm text-[#737373] hover:text-[#171717] dark:hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="#waitlist"
              className="text-sm px-4 py-2 bg-[#171717] dark:bg-white text-white dark:text-[#0a0a0a] rounded-lg hover:bg-[#262626] dark:hover:bg-[#e5e5e5] transition-colors"
            >
              Get access
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f5f5f5] dark:bg-[#1a1a1a] text-sm text-[#737373] mb-8 border border-[#e5e5e5] dark:border-[#262626]">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Now in private beta
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            Let agents run
            <br />
            <span className="bg-gradient-to-r from-[#171717] via-[#525252] to-[#171717] dark:from-white dark:via-[#a3a3a3] dark:to-white bg-clip-text text-transparent">
              without breaking things.
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-[#737373] max-w-2xl mx-auto mb-12 leading-relaxed">
            Latch controls what autonomous agents are allowed to do.
            <br className="hidden sm:block" />
            <span className="text-[#171717] dark:text-white">Safe actions run automatically.</span>
            <br className="hidden sm:block" />
            <span className="text-[#171717] dark:text-white">Risky actions wait for approval.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="#waitlist"
              className="w-full sm:w-auto px-8 py-4 bg-[#171717] dark:bg-white text-white dark:text-[#0a0a0a] rounded-xl text-lg font-medium hover:bg-[#262626] dark:hover:bg-[#e5e5e5] transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-black/10"
            >
              Get access
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/overview"
              className="w-full sm:w-auto px-8 py-4 border border-[#e5e5e5] dark:border-[#262626] rounded-xl text-lg font-medium hover:bg-[#f5f5f5] dark:hover:bg-[#1a1a1a] transition-all flex items-center justify-center gap-2"
            >
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* Visual Demo */}
      <section className="pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] overflow-hidden shadow-2xl shadow-black/5 dark:shadow-black/50">
            {/* Terminal Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#e5e5e5] dark:border-[#262626] bg-[#fafafa] dark:bg-[#0a0a0a]">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
              <span className="ml-4 text-xs text-[#737373] font-mono">agent.log</span>
            </div>
            {/* Terminal Content */}
            <div className="p-6 font-mono text-sm space-y-3 overflow-x-auto">
              <LogLine icon="check" color="emerald" action="read" target="github.com/acme/api" status="allowed" />
              <LogLine icon="check" color="emerald" action="read" target="package.json" status="allowed" />
              <LogLine icon="check" color="emerald" action="write" target="src/utils.ts" status="allowed" />
              <LogLine icon="clock" color="amber" action="execute" target="npm test" status="approval required" highlight />
              <LogLine icon="check" color="emerald" action="execute" target="npm test" status="approved → ran" />
              <LogLine icon="x" color="red" action="execute" target="rm -rf node_modules" status="denied" />
              <LogLine icon="check" color="emerald" action="write" target="README.md" status="allowed" />
              <LogLine icon="clock" color="amber" action="submit" target="create pull request" status="approval required" highlight />
            </div>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24 px-6 bg-[#f5f5f5] dark:bg-[#0f0f0f]">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4">The Problem</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-12 leading-tight">
            Autonomous agents can now run for hours at a time.
          </h2>

          <div className="space-y-3 text-xl text-[#525252] dark:text-[#a3a3a3] mb-12 font-light">
            <p>They read repos.</p>
            <p>They write files.</p>
            <p>They execute commands.</p>
            <p>They send messages.</p>
          </div>

          <p className="text-xl text-[#525252] dark:text-[#a3a3a3] mb-8">
            When something goes wrong, it happens{" "}
            <span className="text-[#171717] dark:text-white font-medium">quietly</span> and{" "}
            <span className="text-[#171717] dark:text-white font-medium">at speed</span>.
          </p>

          <div className="p-6 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111]">
            <p className="text-lg text-[#737373] leading-relaxed">
              Most agents run with full access to whatever they are connected to.
              <br />
              <span className="text-[#171717] dark:text-white font-medium">That works until it doesn't.</span>
            </p>
          </div>
        </div>
      </section>

      {/* Insight */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4">The Insight</p>
          
          <h2 className="text-3xl sm:text-4xl font-bold mb-8 leading-tight">
            The issue is not intelligence.
            <br />
            <span className="text-[#737373]">The issue is authority.</span>
          </h2>

          <p className="text-xl text-[#525252] dark:text-[#a3a3a3] mb-8">
            Agents need freedom to work, but they should not have permission to do everything on their own.
          </p>

          <p className="text-xl text-[#525252] dark:text-[#a3a3a3] leading-relaxed">
            Humans solved this problem long ago with{" "}
            <span className="text-[#171717] dark:text-white font-medium">permissions</span>,{" "}
            <span className="text-[#171717] dark:text-white font-medium">approvals</span>, and{" "}
            <span className="text-[#171717] dark:text-white font-medium">audit trails</span>.
            <br />
            Agents need the same treatment.
          </p>
        </div>
      </section>

      {/* What Latch Does */}
      <section className="py-24 px-6 bg-[#f5f5f5] dark:bg-[#0f0f0f]">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4">What Latch Does</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-12 leading-tight">
            Latch sits between an agent and its tools.
          </h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-12">
            <PolicyCard
              icon={<Zap className="w-5 h-5" />}
              title="Safe actions"
              description="Pass through automatically"
              color="emerald"
            />
            <PolicyCard
              icon={<Clock className="w-5 h-5" />}
              title="Risky actions"
              description="Require approval"
              color="amber"
            />
            <PolicyCard
              icon={<Lock className="w-5 h-5" />}
              title="Forbidden actions"
              description="Never run"
              color="red"
            />
            <PolicyCard
              icon={<Eye className="w-5 h-5" />}
              title="Everything"
              description="Gets logged"
              color="blue"
            />
          </div>

          <p className="text-lg text-[#737373] text-center">
            Latch stays out of the way until something matters.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4 text-center">How It Works</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-16 text-center leading-tight">
            Five steps. Zero changes to your agent.
          </h2>

          <div className="space-y-0 max-w-md mx-auto">
            <Step number={1} title="Your agent runs normally" last={false} />
            <Step number={2} title="Latch intercepts tool calls" last={false} />
            <Step number={3} title="Actions are evaluated against policy" last={false} />
            <Step number={4} title="Approvals are requested only when needed" last={false} />
            <Step number={5} title="Approved actions continue safely" last={true} />
          </div>

          <div className="mt-16 text-center space-y-2 text-[#737373]">
            <p>No changes to agent logic.</p>
            <p>No custom frameworks required.</p>
          </div>
        </div>
      </section>

      {/* When to Use */}
      <section className="py-24 px-6 bg-[#f5f5f5] dark:bg-[#0f0f0f]">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4">When to Use Latch</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-12 leading-tight">
            Built for agents that run without supervision.
          </h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-12">
            <UseCase icon={<Moon className="w-5 h-5" />} title="Overnight research agents" />
            <UseCase icon={<GitBranch className="w-5 h-5" />} title="Repo maintenance jobs" />
            <UseCase icon={<Terminal className="w-5 h-5" />} title="Ops and remediation agents" />
            <UseCase icon={<Zap className="w-5 h-5" />} title="Internal automation" />
          </div>

          <div className="p-6 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111]">
            <p className="text-lg text-[#737373] leading-relaxed">
              If you are actively watching and approving every step,{" "}
              <span className="text-[#171717] dark:text-white font-medium">you probably do not need Latch</span>.
            </p>
            <p className="text-lg text-[#171717] dark:text-white font-medium mt-2">
              If you hand off work and walk away, you do.
            </p>
          </div>
        </div>
      </section>

      {/* Examples */}
      <section id="examples" className="py-24 px-6 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4 text-center">Real Examples</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center leading-tight">
            Practical policies for real workflows.
          </h2>

          <div className="space-y-4">
            <ExampleCard
              allow="Let an agent read GitHub"
              block="but require approval to merge"
            />
            <ExampleCard
              allow="Let an agent draft emails"
              block="but block sending"
            />
            <ExampleCard
              allow="Let an agent propose shell commands"
              block="but not execute them"
            />
            <ExampleCard
              allow="Let agents run overnight"
              block="without touching production"
            />
          </div>
        </div>
      </section>

      {/* What Makes Latch Different */}
      <section className="py-24 px-6 bg-[#f5f5f5] dark:bg-[#0f0f0f]">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4">What Makes Latch Different</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-8 leading-tight">
            Latch does not try to predict intent.
          </h2>

          <p className="text-xl text-[#525252] dark:text-[#a3a3a3] mb-12 leading-relaxed">
            It does not rely on prompts behaving perfectly.
            <br />
            It assumes mistakes happen and <span className="text-[#171717] dark:text-white font-medium">limits the damage</span>.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <FeatureCard
              icon={<Shield className="w-5 h-5" />}
              title="Action level permissions"
            />
            <FeatureCard
              icon={<CheckCircle2 className="w-5 h-5" />}
              title="Explicit approvals for irreversible steps"
            />
            <FeatureCard
              icon={<FileText className="w-5 h-5" />}
              title="Full audit trail of attempted actions"
            />
            <FeatureCard
              icon={<Moon className="w-5 h-5" />}
              title="Designed for unattended execution"
            />
          </div>
        </div>
      </section>

      {/* What Latch Is Not */}
      <section className="py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4">What Latch Is Not</p>
          
          <div className="space-y-3 text-xl text-[#737373] mb-8">
            <p>Latch is not a coding assistant.</p>
            <p>It is not a monitoring dashboard.</p>
            <p>It is not an agent framework.</p>
          </div>

          <p className="text-2xl sm:text-3xl font-semibold text-[#171717] dark:text-white leading-tight">
            Latch is a control layer for autonomous systems.
          </p>
        </div>
      </section>

      {/* Getting Started */}
      <section className="py-24 px-6 bg-[#171717] dark:bg-[#0a0a0a] text-white">
        <div className="max-w-3xl mx-auto">
          <p className="text-sm font-medium text-[#737373] uppercase tracking-wider mb-4 text-center">Getting Started</p>
          <h2 className="text-3xl sm:text-4xl font-bold mb-12 text-center leading-tight">
            Be running in minutes.
          </h2>

          <div className="space-y-6 mb-12 max-w-md mx-auto">
            <SetupStep number={1} text="Install the Latch CLI" />
            <SetupStep number={2} text="Wrap your agent's tools" />
            <SetupStep number={3} text="Start with safe defaults" />
            <SetupStep number={4} text="Approve only when required" />
          </div>

          <div className="rounded-2xl border border-[#262626] bg-[#0a0a0a] dark:bg-black p-6 font-mono text-sm overflow-x-auto">
            <div className="text-[#525252] mb-2"># Install</div>
            <div className="text-emerald-400 mb-4">npm install -g @latch/cli</div>
            <div className="text-[#525252] mb-2"># Wrap your MCP server</div>
            <div className="text-emerald-400">latch run --upstream "npx @mcp/github"</div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="waitlist" className="py-24 px-6 scroll-mt-20">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 leading-tight">
            Get early access.
          </h2>
          <p className="text-xl text-[#737373] mb-8">
            Latch is currently in private beta.
          </p>

          {submitted ? (
            <div className="p-8 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-4" />
              <p className="text-xl font-medium mb-1">You're on the list.</p>
              <p className="text-[#737373]">We'll reach out soon.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="flex-1 px-5 py-4 rounded-xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] focus:outline-none focus:ring-2 focus:ring-[#171717] dark:focus:ring-white text-lg"
              />
              <button
                type="submit"
                className="px-8 py-4 bg-[#171717] dark:bg-white text-white dark:text-[#0a0a0a] rounded-xl text-lg font-medium hover:bg-[#262626] dark:hover:bg-[#e5e5e5] transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-black/10"
              >
                Get access
                <ArrowRight className="w-5 h-5" />
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[#e5e5e5] dark:border-[#262626]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-[#171717] dark:bg-white flex items-center justify-center">
              <Shield className="w-3 h-3 text-white dark:text-[#0a0a0a]" />
            </div>
            <span className="font-medium">Latch</span>
          </div>
          <p className="text-sm text-[#737373]">
            Control layer for autonomous agents.
          </p>
        </div>
      </footer>
    </div>
  );
}

// Components

function LogLine({
  icon,
  color,
  action,
  target,
  status,
  highlight = false,
}: {
  icon: "check" | "x" | "clock";
  color: "emerald" | "red" | "amber";
  action: string;
  target: string;
  status: string;
  highlight?: boolean;
}) {
  const icons = {
    check: <CheckCircle2 className="w-4 h-4" />,
    x: <XCircle className="w-4 h-4" />,
    clock: <Clock className="w-4 h-4" />,
  };

  const colors = {
    emerald: "text-emerald-500",
    red: "text-red-500",
    amber: "text-amber-500",
  };

  return (
    <div
      className={`flex items-center gap-3 ${
        highlight ? "bg-amber-500/10 -mx-6 px-6 py-2 rounded-lg" : ""
      }`}
    >
      <span className={colors[color]}>{icons[icon]}</span>
      <span className="text-[#737373] w-16">{action}</span>
      <span className="text-[#171717] dark:text-white flex-1 truncate">{target}</span>
      <span className={`${colors[color]} text-xs whitespace-nowrap`}>{status}</span>
    </div>
  );
}

function PolicyCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: "emerald" | "amber" | "red" | "blue";
}) {
  const colors = {
    emerald: "border-emerald-500/20 bg-emerald-500/5",
    amber: "border-amber-500/20 bg-amber-500/5",
    red: "border-red-500/20 bg-red-500/5",
    blue: "border-blue-500/20 bg-blue-500/5",
  };

  const iconColors = {
    emerald: "text-emerald-500",
    amber: "text-amber-500",
    red: "text-red-500",
    blue: "text-blue-500",
  };

  return (
    <div className={`p-6 rounded-2xl border ${colors[color]} transition-all hover:scale-[1.02]`}>
      <div className={`${iconColors[color]} mb-3`}>{icon}</div>
      <p className="font-semibold text-[#171717] dark:text-white text-lg">{title}</p>
      <p className="text-[#737373]">{description}</p>
    </div>
  );
}

function Step({ number, title, last }: { number: number; title: string; last: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-[#171717] dark:bg-white text-white dark:text-[#0a0a0a] flex items-center justify-center font-semibold text-sm">
          {number}
        </div>
        {!last && <div className="w-px h-8 bg-[#e5e5e5] dark:bg-[#262626]" />}
      </div>
      <div className="pt-2 pb-4">
        <p className="text-lg">{title}</p>
      </div>
    </div>
  );
}

function UseCase({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="p-5 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] flex items-center gap-4 transition-all hover:border-[#d4d4d4] dark:hover:border-[#404040]">
      <div className="text-[#525252] dark:text-[#a3a3a3]">{icon}</div>
      <p className="font-medium">{title}</p>
    </div>
  );
}

function ExampleCard({ allow, block }: { allow: string; block: string }) {
  return (
    <div className="p-6 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] transition-all hover:border-[#d4d4d4] dark:hover:border-[#404040]">
      <p className="text-lg leading-relaxed">
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">{allow}</span>
        <span className="text-[#737373]"> {block}</span>
      </p>
    </div>
  );
}

function FeatureCard({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="p-5 rounded-2xl border border-[#e5e5e5] dark:border-[#262626] bg-white dark:bg-[#111] flex items-center gap-4">
      <div className="text-[#171717] dark:text-white">{icon}</div>
      <p className="font-medium">{title}</p>
    </div>
  );
}

function SetupStep({ number, text }: { number: number; text: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className="w-8 h-8 rounded-full border border-[#404040] flex items-center justify-center text-sm text-[#737373]">
        {number}
      </div>
      <p className="text-lg">{text}</p>
    </div>
  );
}
