import * as readline from "readline";
import { saveConfig, getConfigPath, type LatchConfig } from "./config.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string, defaultValue?: string): Promise<string> {
  const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

export async function runInit(): Promise<void> {
  console.log("\n🔒 Latch CLI Setup\n");

  const cloudUrl = await ask("Dashboard URL", "http://localhost:3000");
  
  // Test connection
  console.log("\nTesting connection...");
  try {
    const res = await fetch(`${cloudUrl}/api/health`);
    if (!res.ok) throw new Error("Health check failed");
    console.log("✅ Connected to Latch dashboard\n");
  } catch {
    console.log("⚠️  Could not connect to dashboard (it may not be running yet)\n");
  }

  const workspace = await ask("Workspace ID (from dashboard)");
  const agentKey = await ask("Agent Key (from dashboard)");
  const upstreamId = await ask("Upstream ID (optional)");

  const config: LatchConfig = {
    cloud_url: cloudUrl,
    workspace: workspace || undefined,
    agent_key: agentKey || undefined,
    upstream_id: upstreamId || undefined,
  };

  saveConfig(config);
  console.log(`\n✅ Config saved to ${getConfigPath()}`);
  console.log("\nYou can now run:");
  console.log('  latch run --upstream-command "npx" --upstream-args "-y,@modelcontextprotocol/server-github"\n');

  rl.close();
}
