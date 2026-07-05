import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { embedText } from "./embeddings";
import { queryIndex } from "./vectorstore";
import { generateStreamingAnswer } from "./groq";
import type { StreamMetadata } from "./schemas";

// Pinecone cosine similarity: higher = more relevant (NOT distance)
// Calibrate per Section 6.7 of the spec once real content is loaded.
const RELEVANCE_THRESHOLD = 0.40;

const AgentState = Annotation.Root({
  query: Annotation<string>(),
  matches: Annotation<
    { text: string; score: number; metadata: Record<string, unknown> }[]
  >(),
  isRelevant: Annotation<boolean>(),
});

async function retrieveNode(state: typeof AgentState.State) {
  const cleanedQuery = state.query.trim().replace(/\s+/g, " ");
  const vector = await embedText(cleanedQuery);
  const matches = await queryIndex(vector, 5);
  return { matches };
}

function gateNode(state: typeof AgentState.State) {
  const isRelevant =
    state.matches.length > 0 &&
    Math.max(...state.matches.map((m) => m.score)) >= RELEVANCE_THRESHOLD;
  return { isRelevant };
}

// Minimal graph: retrieve → gate. Generation is handled outside the graph
// as a streaming async generator (can't stream tokens through LangGraph nodes).
const graph = new StateGraph(AgentState)
  .addNode("retrieve", retrieveNode)
  .addNode("gate", gateNode)
  .addEdge(START, "retrieve")
  .addEdge("retrieve", "gate")
  .addEdge("gate", END);

const compiledGraph = graph.compile();

// ---------------------------------------------------------------------------
// SSE event types yielded by the streaming agent
// ---------------------------------------------------------------------------

export type ChatHistoryEntry = {
  role: "user" | "assistant";
  content: string;
};

export type AgentStreamEvent =
  | { type: "token"; text: string }
  | { type: "done"; metadata: StreamMetadata };

/**
 * Run the agent with streaming output and conversation memory.
 *
 * 1. Contextualize short follow-up queries using conversation history.
 * 2. Retrieve → gate (decides is_grounded from Pinecone scores).
 *    - Gate is more lenient when there's conversation history (follow-ups
 *      on previously-grounded info should still pass through).
 * 3. Grounded path: stream LLM prose tokens with full history, then emit metadata.
 * 4. Ungrounded path: emit decline message + metadata in one go.
 *
 * @throws AllKeysExhaustedError if all Groq keys are rate-limited
 */
export async function* runAgentStreaming(
  query: string,
  history: ChatHistoryEntry[] = []
): AsyncGenerator<AgentStreamEvent> {
  // For short follow-up messages (like "yes", "tell me more", "go on"),
  // contextualize the retrieval query using the last exchange so vector
  // search actually finds relevant content.
  const isShortFollowUp = query.trim().split(/\s+/).length <= 5 && history.length > 0;
  let retrievalQuery = query;

  if (isShortFollowUp) {
    const lastUserMsg = [...history].reverse().find((h) => h.role === "user");
    const lastBotMsg = [...history].reverse().find((h) => h.role === "assistant");
    // Combine last context with current query for better retrieval
    retrievalQuery = [
      lastUserMsg?.content,
      lastBotMsg?.content?.slice(0, 200), // Truncate long bot responses
      query,
    ]
      .filter(Boolean)
      .join(" — ");
  }

  // Run retrieve → gate with the (possibly contextualized) query
  const result = await compiledGraph.invoke({ query: retrievalQuery });

  // Use a lower threshold when there's conversation history —
  // the user is likely following up on previously-grounded info
  const effectiveThreshold = history.length > 0
    ? RELEVANCE_THRESHOLD * 0.7 // ~0.28 instead of 0.40
    : RELEVANCE_THRESHOLD;

  const topScore = result.matches.length > 0
    ? Math.max(...result.matches.map((m: { score: number }) => m.score))
    : 0;

  const isRelevant = topScore >= effectiveThreshold;

  if (!isRelevant) {
    // Decline path — no LLM call
    yield {
      type: "token",
      text: "Hmm, that one's not in my notes yet! 🤔 But hey, I know a ton about Talha's projects, skills, and experience — try asking about those and I'll hook you up!",
    };
    yield {
      type: "done",
      metadata: {
        is_grounded: false,
        confidence: "low",
        sources: [],
      },
    };
    return;
  }

  // Grounded path — collect sources from Pinecone metadata before streaming
  const sources = [
    ...new Set(
      result.matches
        .filter(
          (m: { score: number }) => m.score >= effectiveThreshold
        )
        .map(
          (m: { metadata: Record<string, unknown> }) =>
            (m.metadata.category as string) ?? "general"
        )
    ),
  ];

  // Stream LLM prose tokens — pass conversation history for multi-turn awareness
  const tokenStream = generateStreamingAnswer(query, result.matches, history);
  for await (const token of tokenStream) {
    yield { type: "token", text: token };
  }

  // Final metadata event
  yield {
    type: "done",
    metadata: {
      is_grounded: true,
      confidence: "high",
      sources,
    },
  };
}
