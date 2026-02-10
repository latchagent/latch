import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../lib/db/schema";
import { hashToken, generateToken } from "../../lib/utils/hash";

type SeedOutput = {
  workspaceId: string;
  upstreamIdOpenClaw: string;
  upstreamIdMcp: string;
  agentKey: string;
  userId: string;
  telegramChatId: string;
};

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  // Deterministic IDs make debugging easier.
  const userId = "u_test";
  const telegramChatId = "chat_test_group_1";

  console.error("🌱 Seeding TEST database...");

  // Create user
  await db
    .insert(schema.user)
    .values({
      id: userId,
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
    })
    .onConflictDoNothing();

  // Workspace
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name: "Test Workspace" })
    .returning();

  await db.insert(schema.workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  // Telegram link for this user
  await db
    .insert(schema.telegramLinks)
    .values({
      userId,
      chatId: telegramChatId,
      username: "testuser",
      firstName: "Test",
      verified: true,
    })
    .onConflictDoUpdate({
      target: schema.telegramLinks.userId,
      set: {
        chatId: telegramChatId,
        username: "testuser",
        firstName: "Test",
        verified: true,
      },
    });

  // Upstreams
  const [openclawUpstream] = await db
    .insert(schema.upstreams)
    .values({
      workspaceId: workspace.id,
      name: "openclaw-native",
      transport: "http",
      baseUrl: "http://openclaw.local",
      authType: "none",
      headers: {},
      tools: null,
    })
    .returning();

  const [mcpUpstream] = await db
    .insert(schema.upstreams)
    .values({
      workspaceId: workspace.id,
      name: "demo-mcp",
      transport: "http",
      baseUrl: "http://mcp-mock:8080",
      authType: "none",
      headers: {},
      tools: [{ name: "github_create_pr" }, { name: "fetch" }],
      toolsSyncedAt: new Date(),
    })
    .returning();

  // Agent key
  const agentKey = generateToken(32);
  await db.insert(schema.agents).values({
    workspaceId: workspace.id,
    name: "Test Agent",
    clientKeyHash: hashToken(agentKey),
  });

  // Rules: deterministic LinkedIn approval for OpenClaw browser
  await db.insert(schema.policyRules).values({
    workspaceId: workspace.id,
    name: "Require approval for LinkedIn (OpenClaw browser)",
    enabled: true,
    effect: "require_approval",
    actionClass: "submit",
    upstreamId: openclawUpstream.id,
    toolName: "openclaw:browser",
    domainMatch: "linkedin.com",
    domainMatchType: "suffix",
    priority: 90,
    smartCondition: null,
  });

  const out: SeedOutput = {
    workspaceId: workspace.id,
    upstreamIdOpenClaw: openclawUpstream.id,
    upstreamIdMcp: mcpUpstream.id,
    agentKey,
    userId,
    telegramChatId,
  };

  // IMPORTANT: print JSON only (single line) to stdout for docker-compose test harness.
  console.log(JSON.stringify(out));

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
