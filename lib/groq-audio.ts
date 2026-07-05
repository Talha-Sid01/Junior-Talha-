import Groq from "groq-sdk";
import { getKeyManager, AllKeysExhaustedError } from "./groq-key-rotation";

export { AllKeysExhaustedError };

// ---------------------------------------------------------------------------
// Constants — single place to change voice / model
// ---------------------------------------------------------------------------

const STT_MODEL = "whisper-large-v3-turbo";
const TTS_MODEL = "canopylabs/orpheus-v1-english";
export const TTS_VOICE = "leo"; // Available: tara, leah, jess, leo, dan, mia, zac, zoe

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createClient(apiKey: string): Groq {
  return new Groq({ apiKey });
}

// ---------------------------------------------------------------------------
// Speech-to-Text — Groq Whisper
// ---------------------------------------------------------------------------

/**
 * Transcribe an audio blob/file using Groq's Whisper model.
 * Routes through the key-rotation manager for 429 failover.
 *
 * @param audioFile - A File or Blob containing audio data
 * @param filename - The filename to send (helps Whisper detect format)
 * @returns The transcribed text
 * @throws AllKeysExhaustedError if all keys are rate-limited
 */
export async function transcribeAudio(
  audioFile: File | Blob,
  filename = "recording.webm"
): Promise<string> {
  const manager = getKeyManager();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < manager.keyCount; attempt++) {
    const keyInfo = manager.getNextKey();
    if (!keyInfo) {
      throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
    }

    console.log(
      `[groq-audio] STT attempt with key #${keyInfo.index + 1}`
    );

    const client = createClient(keyInfo.key);

    try {
      // Convert Blob to File if needed (Groq SDK expects File-like)
      const file =
        audioFile instanceof File
          ? audioFile
          : new File([audioFile], filename, { type: audioFile.type });

      const transcription = await client.audio.transcriptions.create({
        file,
        model: STT_MODEL,
        language: "en",
        response_format: "text",
      });

      console.log(
        `[groq-audio] STT completed with key #${keyInfo.index + 1}`
      );

      // response_format: "text" returns the text directly as a string
      return typeof transcription === "string"
        ? transcription
        : (transcription as { text: string }).text;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 429
      ) {
        const errHeaders =
          err &&
          typeof err === "object" &&
          "headers" in err &&
          err.headers instanceof Headers
            ? err.headers
            : new Headers();

        manager.reportRateLimit(keyInfo.index, errHeaders);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
  }

  throw new Error("No API keys available for STT");
}

// ---------------------------------------------------------------------------
// Text-to-Speech — Groq Orpheus
// ---------------------------------------------------------------------------

/**
 * Synthesize speech from text using Groq's Orpheus TTS model.
 * Routes through the key-rotation manager for 429 failover.
 *
 * @param text - The text to speak
 * @returns ArrayBuffer containing WAV audio data
 * @throws AllKeysExhaustedError if all keys are rate-limited
 */
export async function synthesizeSpeech(
  text: string
): Promise<ArrayBuffer> {
  const manager = getKeyManager();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < manager.keyCount; attempt++) {
    const keyInfo = manager.getNextKey();
    if (!keyInfo) {
      throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
    }

    console.log(
      `[groq-audio] TTS attempt with key #${keyInfo.index + 1}`
    );

    const client = createClient(keyInfo.key);

    try {
      const response = await client.audio.speech.create({
        model: TTS_MODEL,
        voice: TTS_VOICE,
        input: text,
        response_format: "wav",
      });

      const buffer = await response.arrayBuffer();

      console.log(
        `[groq-audio] TTS completed with key #${keyInfo.index + 1} (${buffer.byteLength} bytes)`
      );

      return buffer;
    } catch (err: unknown) {
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        (err as { status: number }).status === 429
      ) {
        const errHeaders =
          err &&
          typeof err === "object" &&
          "headers" in err &&
          err.headers instanceof Headers
            ? err.headers
            : new Headers();

        manager.reportRateLimit(keyInfo.index, errHeaders);
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  if (lastError) {
    throw new AllKeysExhaustedError(manager.getSoonestRetrySeconds());
  }

  throw new Error("No API keys available for TTS");
}
