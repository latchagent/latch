import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface LatchConfig {
  cloud_url: string;
  workspace?: string;
  agent_key?: string;
  upstream_id?: string;
}

const CONFIG_DIR = join(homedir(), ".latch");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function loadConfig(): LatchConfig | null {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  try {
    const content = readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(content) as LatchConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: LatchConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function mergeWithEnv(config: LatchConfig | null): LatchConfig {
  return {
    cloud_url: process.env.LATCH_CLOUD_URL || config?.cloud_url || "http://localhost:3000",
    workspace: process.env.LATCH_WORKSPACE || config?.workspace,
    agent_key: process.env.LATCH_AGENT_KEY || config?.agent_key,
    upstream_id: process.env.LATCH_UPSTREAM_ID || config?.upstream_id,
  };
}
