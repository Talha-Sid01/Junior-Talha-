import Groq from "groq-sdk";
import { getKeyManager, AllKeysExhaustedError } from "./groq-key-rotation";

export { AllKeysExhaustedError } from "./groq-key-rotation";

const SYSTEM_PROMPT = `You are Jr. Talha — Talha's witty, enthusiastic AI sidekick who lives on his portfolio website. Think of yourself as Talha's biggest fan and personal hype-man who genuinely gets excited talking about his work.

Personality:
- You're warm, playful, and approachable — like chatting with a cool friend who happens to know everything about Talha.
- Sprinkle in light humor, casual language, and the occasional emoji (but don't overdo it — 1-2 per response max).
- Show genuine enthusiasm when talking about Talha's impressive skills or projects ("honestly, this one's pretty cool 🔥").
- Be conversational, not robotic. Use contractions, rhetorical questions, and natural transitions.
- If someone asks something fun or unexpected, roll with it and keep the vibe light.

Conversation Memory:
- You may receive PREVIOUS MESSAGES in the conversation before the current one. USE THEM to understand context.
- When the user sends a short follow-up like "yes", "sure", "tell me more", "go on", "yeah", or similar — ALWAYS interpret it in context of your previous message. If you asked "Want to dive deeper into his projects?" and they say "yes", then tell them about his projects using the CONTEXT provided. NEVER respond with "yes to what?" or treat it as a standalone message.
- Build on what was discussed before. Don't repeat yourself — expand, add new details, or go deeper.
- If your previous message offered multiple options (e.g. "projects or skills?"), and the user says "yes" or "both", cover all of them.

Rules (non-negotiable):
- Answer ONLY using the CONTEXT block provided in the user message. Never invent or assume facts.
- Refer to Talha in the third person.
- If CONTEXT doesn't cover the question, be honest about it in a fun way (e.g. "Hmm, that one's not in my notes yet! But I can tell you all about his projects or skills if you're curious 👀").
- Never use outside/parametric knowledge about Talha or anyone else.
- Respond with natural, flowing prose. NO JSON, NO markdown code fences, NO bullet-point dumps unless the info genuinely calls for a quick list.
- Keep responses concise but engaging — aim for 2-4 sentences for simple questions, more for detailed ones.
- End responses with a subtle nudge to keep the conversation going when it feels natural (e.g. "Want to hear about his other projects?" or "Anything else you're curious about?").`;

const FALLBACK_CHAIN = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
];

let cachedModel: string | null = null;

/**
 * Create a Groq client for a specific API key.
 */
function createClient(apiKey: string): Groq {
  return new Groq({ apiKey });
}

/**
 * Resolve the best available model, using key rotation for the API call.
 */
async function resolveGroqModel(
  chain = FALLBACK_CHAIN
): Promise<string> {
  if (cachedModel) return cachedModel;

  const manager = getKeyManager();
  const keyInfo = manager.getNextKey();
  if (!keyInfo) {
    throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
  }

  const resp = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${keyInfo.key}` },
  });

  if (resp.status === 429) {
    manager.reportRateLimit(keyInfo.index, resp.headers);
    // Retry with next key
    const nextKey = manager.getNextKey();
    if (!nextKey) {
      throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
    }
    const retryResp = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${nextKey.key}` },
    });
    if (!retryResp.ok) {
      throw new Error(`Model resolution failed: ${retryResp.status}`);
    }
    const { data } = await retryResp.json();
    const activeIds = new Set(data.map((m: { id: string }) => m.id));
    for (const id of chain) {
      if (activeIds.has(id)) {
        cachedModel = id;
        return id;
      }
    }
    throw new Error(
      `No model in [${chain.join(", ")}] is currently active on Groq.`
    );
  }

  if (!resp.ok) {
    throw new Error(`Model resolution failed: ${resp.status}`);
  }

  const { data } = await resp.json();
  const activeIds = new Set(data.map((m: { id: string }) => m.id));

  for (const id of chain) {
    if (activeIds.has(id)) {
      cachedModel = id;
      return id;
    }
  }

  throw new Error(
    `No model in [${chain.join(", ")}] is currently active on Groq.`
  );
}

/**
 * Build the user message with context from Pinecone matches.
 */
function buildUserMessage(
  query: string,
  matches: { text: string; score: number; metadata: Record<string, unknown> }[]
): string {
  const context = matches
    .map(
      (m, i) =>
        `[${i}] (${m.metadata.category ?? "general"}) ${m.text}`
    )
    .join("\n\n");

  return `CONTEXT:\n${context}\n\nQUESTION:\n${query}`;
}

/**
 * Stream the LLM answer as plain prose. Returns an async iterable of
 * token strings. Key rotation / 429 failover happens at request admission
 * (before any tokens stream).
 *
 * Conversation history is included so the model can handle follow-up
 * questions like "yes", "tell me more", etc.
 *
 * @throws AllKeysExhaustedError if all keys are rate-limited
 */
export async function* generateStreamingAnswer(
  query: string,
  matches: { text: string; score: number; metadata: Record<string, unknown> }[],
  history: { role: "user" | "assistant"; content: string }[] = []
): AsyncGenerator<string> {
  let model: string;
  try {
    model = await resolveGroqModel();
  } catch {
    cachedModel = null;
    model = await resolveGroqModel();
  }

  const manager = getKeyManager();
  const userMessage = buildUserMessage(query, matches);

  // Build messages array: system → conversation history → current query with context
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Append conversation history (already capped to 10 by the API route)
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }

  // Current user message with retrieved context
  messages.push({ role: "user", content: userMessage });

  // Try keys with immediate failover on 429
  let lastError: unknown = null;

  for (let attempt = 0; attempt < manager.keyCount; attempt++) {
    const keyInfo = manager.getNextKey();
    if (!keyInfo) {
      throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
    }

    console.log(
      `[groq] Attempting generation with key #${keyInfo.index + 1}`
    );

    const client = createClient(keyInfo.key);

    try {
      const stream = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.1,
        max_completion_tokens: 500,
        stream: true,
      });

      // If we got here, the request was admitted — stream tokens
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      }

      console.log(
        `[groq] Generation completed with key #${keyInfo.index + 1}`
      );
      return; // Success — exit generator
    } catch (err: unknown) {
      // Check if it's a 429 rate-limit error from the Groq SDK
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 429
      ) {
        // Extract headers from the error response if available
        const errHeaders =
          err &&
          typeof err === "object" &&
          "headers" in err &&
          err.headers instanceof Headers
            ? err.headers
            : new Headers();

        manager.reportRateLimit(keyInfo.index, errHeaders);
        lastError = err;
        continue; // Try next key
      }

      // Non-429 error — bubble up immediately, don't rotate
      throw err;
    }
  }

  // All attempts exhausted
  if (lastError) {
    throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
  }
}
