import { NextRequest, NextResponse } from "next/server";
import { transcribeAudio, AllKeysExhaustedError } from "@/lib/groq-audio";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  if (isRateLimited(ip, 10, 60_000)) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment." },
      { status: 429 }
    );
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio");

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        { error: "audio file is required" },
        { status: 400 }
      );
    }

    // Get the filename if provided, default to recording.webm
    const filename =
      audioFile instanceof File ? audioFile.name : "recording.webm";

    const text = await transcribeAudio(audioFile, filename);

    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    if (err instanceof AllKeysExhaustedError) {
      return NextResponse.json(
        {
          error: `All API keys are rate-limited. Try again in ${err.retryAfterSeconds}s.`,
        },
        { status: 503 }
      );
    }

    console.error("[voice/transcribe] Error:", err);
    return NextResponse.json(
      { error: "Transcription failed — please try again." },
      { status: 500 }
    );
  }
}
