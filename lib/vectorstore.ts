import { Pinecone, Index } from "@pinecone-database/pinecone";

const INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? "jr-sid-knowledge";
const DIMENSION = 1024; // must match EMBED_MODEL's output size

let pc: Pinecone | null = null;
let cachedIndex: Index | null = null;

function getClient() {
  if (!pc) {
    pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  }
  return pc;
}

async function getIndex(): Promise<Index> {
  if (cachedIndex) return cachedIndex;

  const client = getClient();

  // Check if index exists, create if not
  const existing = await client.listIndexes();
  if (!existing.indexes?.some((i) => i.name === INDEX_NAME)) {
    await client.createIndex({
      name: INDEX_NAME,
      dimension: DIMENSION,
      metric: "cosine",
      spec: { serverless: { cloud: "aws", region: "us-east-1" } },
      waitUntilReady: true,
    });
  }

  // Always resolve host via describeIndex for a fresh, valid connection
  const desc = await client.describeIndex(INDEX_NAME);
  cachedIndex = client.index({ name: INDEX_NAME, host: desc.host });
  return cachedIndex;
}

export async function upsertVectors(
  vectors: {
    id: string;
    values: number[];
    metadata: Record<string, string | number>;
  }[]
) {
  const idx = await getIndex();
  const batchSize = 100;
  for (let i = 0; i < vectors.length; i += batchSize) {
    await idx.upsert({
      records: vectors.slice(i, i + batchSize),
    });
  }
}

export async function queryIndex(vector: number[], topK = 5) {
  const idx = await getIndex();
  const res = await idx.query({
    vector,
    topK,
    includeMetadata: true,
  });

  return (res.matches ?? []).map((m) => ({
    text: (m.metadata?.text as string) ?? "",
    score: m.score ?? 0,
    metadata: (m.metadata ?? {}) as Record<string, unknown>,
  }));
}

export async function checkDuplicateByHash(hash: string): Promise<boolean> {
  const idx = await getIndex();
  // Pinecone requires a vector for querying, even when using metadata filters.
  const dummyVector = new Array(DIMENSION).fill(0.0001);
  const res = await idx.query({
    vector: dummyVector,
    topK: 1,
    filter: { contentHash: { $eq: hash } },
  });
  return (res.matches ?? []).length > 0;
}

export async function deleteAllKnowledge(): Promise<void> {
  const idx = await getIndex();
  await idx.deleteAll();
}
