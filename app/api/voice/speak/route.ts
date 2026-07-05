import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech, AllKeysExhaustedError } from "@/lib/groq-audio";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  // Slightly more generous limit for TTS since each response may have multiple sentences
  if (isRateLimited(ip, 30, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429 }
    );
  }

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { text } = body;
  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "text is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
    const audioBuffer = await synthesizeSpeech(text.trim());

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": audioBuffer.byteLength.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    if (err instanceof AllKeysExhaustedError) {
      return NextResponse.json(
        {
          error: `All API keys are rate-limited. Try again in ${err.retryAfterSeconds}s.`,
        },
        { status: 503 }
      );
    }

    console.error("[voice/speak] Error:", err);
    return NextResponse.json(
      { error: "Speech synthesis failed — please try again." },
      { status: 500 }
    );
  }
}
