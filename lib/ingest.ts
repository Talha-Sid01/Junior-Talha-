import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { createHash, randomUUID } from "crypto";
import { embedText } from "./embeddings";
import { upsertVectors, checkDuplicateByHash } from "./vectorstore";

export async function ingestText(
  text: string,
  source: string,
  category: string
) {
  // Clean text: remove extra horizontal whitespace but preserve paragraphs
  const cleanedText = text
    .split("\n")
    .map((line) => line.trim().replace(/ +/g, " "))
    .filter((line) => line.length > 0)
    .join("\n\n");

  const contentHash = createHash("sha256").update(cleanedText).digest("hex");
  const isDuplicate = await checkDuplicateByHash(contentHash);
  
  if (isDuplicate) {
    return { chunkCount: 0, duplicate: true };
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 2400, // Approx 600 tokens (4 chars per token)
    chunkOverlap: 400, // Approx 100 tokens
    separators: ["\n\n", "\n", ". ", "? ", "! "],
  });
  
  const chunks = await splitter.splitText(cleanedText);
  const timestamp = new Date().toISOString();
  const version = "1.0";

  const vectors = await Promise.all(
    chunks.map(async (chunk) => {
      const chunk_id = randomUUID(); // 100% unique UUID
      return {
        id: chunk_id,
        values: await embedText(chunk),
        metadata: { 
          text: chunk, 
          chunk_id,
          source, 
          category, 
          timestamp,
          version,
          contentHash
        },
      };
    })
  );

  await upsertVectors(vectors);
  return { chunkCount: chunks.length, duplicate: false };
}
