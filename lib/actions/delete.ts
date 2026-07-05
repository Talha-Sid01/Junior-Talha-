"use server";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { deleteAllKnowledge } from "@/lib/vectorstore";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("jrsid_admin_session")?.value;
  if (!token) throw new Error("Not authenticated");
  await jwtVerify(
    token,
    new TextEncoder().encode(process.env.SESSION_SECRET!)
  );
}

export async function deleteKnowledgeAction(
  _prevState: { success?: boolean; error?: string } | null,
  formData: FormData
) {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authenticated — please log in again." };
  }

  const confirm = formData.get("confirm") as string;
  if (confirm !== "DELETE") {
    return { error: "Please type DELETE to confirm." };
  }

  try {
    await deleteAllKnowledge();
    return { success: true };
  } catch (err) {
    console.error("Deletion error:", err);
    return {
      error: `Deletion failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
