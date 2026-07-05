import { InferenceClient } from "@huggingface/inference";

export const EMBED_MODEL = "BAAI/bge-large-en-v1.5"; // 1024-dim

let hf: InferenceClient | null = null;

function getClient() {
  if (!hf) {
    hf = new InferenceClient(process.env.HF_TOKEN!);
  }
  return hf;
}

export async function embedText(text: string): Promise<number[]> {
  const result = await getClient().featureExtraction({
    model: EMBED_MODEL,
    inputs: text,
  });

  // This model returns one pooled vector already. If you swap to a model that
  // returns token-level output (a nested array), mean-pool it yourself here —
  // don't assume the shape stays flat when you change models.
  if (Array.isArray(result[0])) {
    const matrix = result as number[][];
    const dim = matrix[0].length;
    const pooled = new Array(dim).fill(0);
    for (const row of matrix)
      for (let i = 0; i < dim; i++) pooled[i] += row[i];
    return pooled.map((v) => v / matrix.length);
  }

  return result as number[];
}
