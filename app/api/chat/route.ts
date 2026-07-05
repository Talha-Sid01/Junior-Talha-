import { NextRequest, NextResponse } from "next/server";
import { runAgentStreaming } from "@/lib/agent";
import { AllKeysExhaustedError } from "@/lib/groq";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit by IP — 10 requests per minute
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  if (isRateLimited(ip, 10, 60_000)) {
    return NextResponse.json(
      {
        answer:
          "You're sending too many requests — please wait a moment and try again.",
        is_grounded: false,
        confidence: "low",
        sources: [],
      },
      { status: 429 }
    );
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { message, history: rawHistory } = body;
  if (!message || typeof message !== "string") {
    return NextResponse.json(
      { error: "message is required and must be a string" },
      { status: 400 }
    );
  }

  // Validate and sanitize conversation history
  const history: { role: "user" | "assistant"; content: string }[] = [];
  if (Array.isArray(rawHistory)) {
    for (const entry of rawHistory.slice(-3)) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string" &&
        entry.content.trim()
      ) {
        history.push({ role: entry.role, content: entry.content });
      }
    }
  }

  try {
    const agentStream = runAgentStreaming(message, history);
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of agentStream) {
            if (event.type === "token") {
              controller.enqueue(
                encoder.encode(
                  `event: token\ndata: ${JSON.stringify({ text: event.text })}\n\n`
                )
              );
            } else if (event.type === "done") {
              controller.enqueue(
                encoder.encode(
                  `event: done\ndata: ${JSON.stringify(event.metadata)}\n\n`
                )
              );
            }
          }
        } catch (err) {
          console.error("Stream error:", err);

          // Send an error event so the client can show a retry affordance
          const errorMessage =
            err instanceof AllKeysExhaustedError
              ? `All API keys are rate-limited. Try again in ${err.retryAfterSeconds}s.`
              : "Something went wrong — please try again.";

          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    // Catch errors that happen before the stream starts (key exhaustion at admission)
    if (err instanceof AllKeysExhaustedError) {
      return NextResponse.json(
        {
          answer: `All API keys are rate-limited. Please try again in ${err.retryAfterSeconds} seconds.`,
          is_grounded: false,
          confidence: "low",
          sources: [],
          retryAfterSeconds: err.retryAfterSeconds,
        },
        { status: 503 }
      );
    }

    console.error("Agent error:", err);
    return NextResponse.json(
      {
        answer:
          "Something went wrong on my end — please try again in a moment.",
        is_grounded: false,
        confidence: "low",
        sources: [],
      },
      { status: 500 }
    );
  }
}
