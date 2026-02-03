import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { hashToken, generateToken } from "../lib/utils/hash";

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("🌱 Seeding database...\n");

  // Create a demo user (for BetterAuth, user creation happens through auth flow)
  // We'll create workspace and related data

  // Create demo workspace
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: "Demo Workspace",
    })
    .returning();

  console.log(`✅ Created workspace: ${workspace.name} (${workspace.id})`);

  // Create demo upstream
  const [upstream] = await db
    .insert(schema.upstreams)
    .values({
      workspaceId: workspace.id,
      name: "demo-mcp",
      baseUrl: "http://localhost:8080",
      authType: "none",
    })
    .returning();

  console.log(`✅ Created upstream: ${upstream.name}`);

  // Create demo agent
  const clientKey = generateToken(32);
  const [agent] = await db
    .insert(schema.agents)
    .values({
      workspaceId: workspace.id,
      name: "Demo Agent",
      clientKeyHash: hashToken(clientKey),
    })
    .returning();

  console.log(`✅ Created agent: ${agent.name}`);
  console.log(`   Client Key: ${clientKey}`);
  console.log(`   ⚠️  Save this key - it won't be shown again!\n`);

  // Create default policy rules
  const defaultRules = [
    {
      name: "Allow GitHub API",
      effect: "allow" as const,
      actionClass: "any" as const,
      domainMatch: "github.com",
      domainMatchType: "suffix" as const,
      priority: 80,
    },
    {
      name: "Block payments by default",
      effect: "deny" as const,
      actionClass: "transfer_value" as const,
      priority: 100,
    },
    {
      name: "Require approval for execution",
      effect: "require_approval" as const,
      actionClass: "execute" as const,
      priority: 90,
    },
    {
      name: "Require approval for submissions",
      effect: "require_approval" as const,
      actionClass: "submit" as const,
      priority: 85,
    },
  ];

  for (const rule of defaultRules) {
    await db.insert(schema.policyRules).values({
      workspaceId: workspace.id,
      ...rule,
      enabled: true,
    });
    console.log(`✅ Created rule: ${rule.name}`);
  }

  console.log("\n🎉 Seed completed!\n");
  console.log("To link a user to this workspace, run the following SQL after registering:");
  console.log(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('${workspace.id}', '<user-id>', 'owner');`);
  console.log("\nProxy endpoint: http://localhost:3000/api/proxy");
  console.log("Headers required:");
  console.log(`  X-Latch-Key: ${clientKey}`);
  console.log(`  X-Latch-Upstream: ${upstream.name}`);

  await client.end();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
