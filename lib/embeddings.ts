import { Pinecone } from "@pinecone-database/pinecone";

export const EMBED_MODEL = "multilingual-e5-large"; // 1024-dim

let pc: Pinecone | null = null;

function getClient() {
  if (!pc) {
    pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return pc;
}

export async function embedText(text: string): Promise<number[]> {
  const client = getClient();
  const response = await client.inference.embed({
    model: EMBED_MODEL,
    inputs: [text],
    parameters: { inputType: "passage", truncate: "END" },
  });

  if (!response.data || !response.data[0] || !response.data[0].values) {
    throw new Error("Failed to generate embedding from Pinecone");
  }

  return response.data[0].values;
}
