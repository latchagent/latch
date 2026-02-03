import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { workspaces, workspaceMembers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Get current session on the server
 */
export async function getServerSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

/**
 * Get current user on the server
 */
export async function getCurrentUser() {
  const session = await getServerSession();
  return session?.user || null;
}

/**
 * Require authentication - throws if not authenticated
 */
export async function requireAuth() {
  const session = await getServerSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
}

/**
 * Get workspaces for the current user
 */
export async function getUserWorkspaces(userId: string) {
  const results = await db
    .select({
      workspace: workspaces,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return results;
}

/**
 * Create default workspace for new user
 */
export async function createDefaultWorkspace(userId: string, userName: string) {
  const [workspace] = await db
    .insert(workspaces)
    .values({
      name: `${userName || "My"}'s Workspace`,
    })
    .returning();

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "owner",
  });

  return workspace;
}

/**
 * Check if user is member of workspace
 */
export async function isWorkspaceMember(
  userId: string,
  workspaceId: string
): Promise<boolean> {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      eq(workspaceMembers.userId, userId)
    );
  return !!member && member.workspaceId === workspaceId;
}
