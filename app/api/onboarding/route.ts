import { NextResponse } from "next/server";
import { getServerSession, createDefaultWorkspace } from "@/lib/auth/server";

export async function POST() {
  try {
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await createDefaultWorkspace(
      session.user.id,
      session.user.name
    );

    return NextResponse.json({ workspace });
  } catch (error) {
    console.error("Onboarding error:", error);
    return NextResponse.json(
      { error: "Failed to create workspace" },
      { status: 500 }
    );
  }
}
