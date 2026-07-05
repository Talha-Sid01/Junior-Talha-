"use server";

import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { ingestText } from "@/lib/ingest";

async function requireAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("jrsid_admin_session")?.value;
  if (!token) throw new Error("Not authenticated");
  await jwtVerify(
    token,
    new TextEncoder().encode(process.env.SESSION_SECRET!)
  );
}

export async function addKnowledge(
  _prevState: { success?: boolean; chunkCount?: number; error?: string } | null,
  formData: FormData
) {
  try {
    await requireAdmin();
  } catch {
    return { error: "Not authenticated — please log in again." };
  }

  const text = (formData.get("text") as string)?.trim();
  const category = (formData.get("category") as string) || "general";
  const source = (formData.get("source") as string)?.trim() || category;

  if (!text) {
    return { error: "Text content is required." };
  }

  try {
    const { chunkCount, duplicate } = await ingestText(text, source, category);
    if (duplicate) {
      return { success: true, chunkCount: 0, error: "Content already exists in knowledge base (Duplicate ignored)." };
    }
    return { success: true, chunkCount };
  } catch (err) {
    console.error("Ingestion error:", err);
    return {
      error: `Ingestion failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
