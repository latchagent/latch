import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  integer,
  boolean,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Re-export auth schema
export * from "./auth-schema";

// Enums
export const workspaceRoleEnum = pgEnum("workspace_role", ["owner", "member"]);

export const transportEnum = pgEnum("transport", ["http", "stdio"]);

export const authTypeEnum = pgEnum("auth_type", ["none", "bearer", "header"]);

export const policyEffectEnum = pgEnum("policy_effect", [
  "allow",
  "deny",
  "require_approval",
]);

export const actionClassEnum = pgEnum("action_class", [
  "read",
  "write",
  "send",
  "execute",
  "submit",
  "transfer_value",
  "any",
]);

export const domainMatchTypeEnum = pgEnum("domain_match_type", [
  "exact",
  "suffix",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "low",
  "med",
  "high",
  "critical",
]);

export const decisionEnum = pgEnum("decision", [
  "allowed",
  "denied",
  "approval_required",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "denied",
  "expired",
]);

// Tables
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    userId: text("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    role: workspaceRoleEnum("role").notNull().default("member"),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })]
);

// Telegram integration for notifications
export const telegramLinks = pgTable("telegram_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  chatId: text("chat_id").notNull(),
  username: text("username"),
  firstName: text("first_name"),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Telegram link tokens (for verification)
export const telegramLinkTokens = pgTable("telegram_link_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .references(() => user.id, { onDelete: "cascade" })
    .notNull(),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  clientKeyHash: text("client_key_hash"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const upstreams = pgTable(
  "upstreams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    transport: transportEnum("transport").notNull().default("http"),
    // HTTP transport
    baseUrl: text("base_url"),
    // Optional static headers for HTTP upstreams (auth/API keys/etc).
    // Note: treated as a secret; UI should not display values after save.
    headers: jsonb("headers").$type<Record<string, string>>(),

    // Stdio transport (command/args to spawn locally via Latch CLI / runner)
    stdioCommand: text("stdio_command"),
    stdioArgs: jsonb("stdio_args").$type<string[]>(),
    stdioEnv: jsonb("stdio_env").$type<Record<string, string>>(),
    stdioCwd: text("stdio_cwd"),

    // Discovered tool catalog (from tools/list)
    tools: jsonb("tools").$type<unknown[]>(),
    toolsSyncedAt: timestamp("tools_synced_at", { withTimezone: true }),
    toolsSyncError: text("tools_sync_error"),

    authType: authTypeEnum("auth_type").notNull().default("none"),
    authValue: text("auth_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("upstreams_workspace_name_idx").on(table.workspaceId, table.name)]
);

export const policyRules = pgTable("policy_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name"),
  description: text("description"),
  priority: integer("priority").notNull().default(0),
  enabled: boolean("enabled").notNull().default(true),
  effect: policyEffectEnum("effect").notNull(),
  actionClass: actionClassEnum("action_class").notNull().default("any"),
  upstreamId: uuid("upstream_id").references(() => upstreams.id, {
    onDelete: "cascade",
  }),
  toolName: text("tool_name"),
  domainMatch: text("domain_match"),
  domainMatchType: domainMatchTypeEnum("domain_match_type"),
  recipientMatch: text("recipient_match"), // Exact email/recipient match
  rateLimitPerHour: integer("rate_limit_per_hour"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const policyLeases = pgTable("policy_leases", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  createdByUserId: text("created_by_user_id")
    .references(() => user.id)
    .notNull(),
  actionClass: actionClassEnum("action_class").notNull(),
  upstreamId: uuid("upstream_id").references(() => upstreams.id, {
    onDelete: "cascade",
  }),
  toolName: text("tool_name"),
  domainMatch: text("domain_match"),
  domainMatchType: domainMatchTypeEnum("domain_match_type"),
  recipientMatch: text("recipient_match"), // Exact email/recipient match
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    upstreamId: uuid("upstream_id")
      .references(() => upstreams.id, { onDelete: "cascade" })
      .notNull(),
    toolName: text("tool_name").notNull(),
    actionClass: actionClassEnum("action_class").notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    riskFlags: jsonb("risk_flags").$type<Record<string, boolean>>(),
    resource: jsonb("resource").$type<{
      domain?: string;
      recipientDomain?: string;
      urlHost?: string;
      urlPath?: string;
    }>(),
    argsRedacted: jsonb("args_redacted"),
    argsHash: text("args_hash").notNull(),
    requestHash: text("request_hash").notNull(),
    decision: decisionEnum("decision").notNull(),
    denialReason: text("denial_reason"),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("requests_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
    index("requests_workspace_decision_created_idx").on(
      table.workspaceId,
      table.decision,
      table.createdAt
    ),
    index("requests_request_hash_idx").on(table.requestHash),
  ]
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    agentId: uuid("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    requestId: uuid("request_id")
      .references(() => requests.id, { onDelete: "cascade" })
      .notNull(),
    status: approvalStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => user.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deniedByUserId: text("denied_by_user_id").references(() => user.id),
    deniedAt: timestamp("denied_at", { withTimezone: true }),
    telegramMessageId: text("telegram_message_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("approval_requests_workspace_status_created_idx").on(
      table.workspaceId,
      table.status,
      table.createdAt
    ),
  ]
);

export const approvalTokens = pgTable(
  "approval_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    approvalRequestId: uuid("approval_request_id")
      .references(() => approvalRequests.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull(),
    // Raw token stored temporarily for CLI auto-retry polling
    // Cleared after first retrieval
    rawToken: text("raw_token"),
    requestHash: text("request_hash").notNull(),
    toolName: text("tool_name").notNull(),
    upstreamId: uuid("upstream_id")
      .references(() => upstreams.id, { onDelete: "cascade" })
      .notNull(),
    argsHash: text("args_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("approval_tokens_token_hash_idx").on(table.tokenHash)]
);

// Types
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type TelegramLink = typeof telegramLinks.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Upstream = typeof upstreams.$inferSelect;
export type NewUpstream = typeof upstreams.$inferInsert;
export type PolicyRule = typeof policyRules.$inferSelect;
export type NewPolicyRule = typeof policyRules.$inferInsert;
export type PolicyLease = typeof policyLeases.$inferSelect;
export type NewPolicyLease = typeof policyLeases.$inferInsert;
export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type NewApprovalRequest = typeof approvalRequests.$inferInsert;
export type ApprovalToken = typeof approvalTokens.$inferSelect;
export type NewApprovalToken = typeof approvalTokens.$inferInsert;

export type ActionClass =
  | "read"
  | "write"
  | "send"
  | "execute"
  | "submit"
  | "transfer_value"
  | "any";
export type RiskLevel = "low" | "med" | "high" | "critical";
export type Decision = "allowed" | "denied" | "approval_required";
export type PolicyEffect = "allow" | "deny" | "require_approval";
