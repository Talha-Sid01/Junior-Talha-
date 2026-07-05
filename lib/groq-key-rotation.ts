/**
 * Groq API Key Rotation Manager
 *
 * NOTE ON ACCEPTABLE USE: This rotation pattern assumes all configured API keys
 * are owned by or authorized for use by the same account holder. Multi-account
 * key pooling to circumvent rate limits may violate Groq's Acceptable Use Policy.
 * Implement exactly what is specified here — nothing more automated or hidden.
 *
 * In-memory state resets on cold start / redeploy, which is self-correcting:
 * worst case is one wasted attempt against a still-cooling key before it
 * rotates onward.
 */

// ---------------------------------------------------------------------------
// Duration parser — handles Groq formats like "7.66s", "2m59.56s", "1m30s"
// ---------------------------------------------------------------------------

function parseDurationToMs(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // Try pure seconds: "7.66s" or "7.66"
  const secOnly = trimmed.match(/^(\d+(?:\.\d+)?)s?$/);
  if (secOnly) return Math.ceil(parseFloat(secOnly[1]) * 1000);

  // Try minutes + optional seconds: "2m59.56s" or "2m30s" or "2m"
  const minSec = trimmed.match(/^(\d+)m(?:(\d+(?:\.\d+)?)s?)?$/);
  if (minSec) {
    const mins = parseInt(minSec[1], 10);
    const secs = minSec[2] ? parseFloat(minSec[2]) : 0;
    return Math.ceil((mins * 60 + secs) * 1000);
  }

  // Fallback: try parsing as plain number (seconds)
  const num = parseFloat(trimmed);
  if (!isNaN(num)) return Math.ceil(num * 1000);

  return null;
}

// ---------------------------------------------------------------------------
// Key manager
// ---------------------------------------------------------------------------

interface KeyState {
  key: string;
  cooldownUntil: number; // epoch ms, 0 = not cooling
}

class GroqKeyManager {
  private keys: KeyState[] = [];
  private currentIndex = 0;

  constructor() {
    this.loadKeys();
  }

  private loadKeys() {
    // Try numbered keys first
    for (let i = 1; i <= 5; i++) {
      const val = process.env[`GROQ_API_KEY_${i}`];
      if (val && val.trim()) {
        this.keys.push({ key: val.trim(), cooldownUntil: 0 });
      }
    }

    // Fallback: legacy single GROQ_API_KEY for backward compat
    if (this.keys.length === 0) {
      const legacy = process.env.GROQ_API_KEY;
      if (legacy && legacy.trim()) {
        this.keys.push({ key: legacy.trim(), cooldownUntil: 0 });
      }
    }

    if (this.keys.length === 0) {
      throw new Error(
        "No Groq API keys configured. Set GROQ_API_KEY_1 (through _5) or GROQ_API_KEY in .env.local"
      );
    }

    console.log(
      `[groq-keys] Loaded ${this.keys.length} API key(s) for rotation`
    );
  }

  /**
   * Get the next available key, starting from the sticky current index.
   * Returns { key, index } or null if all keys are cooling down.
   */
  getNextKey(): { key: string; index: number } | null {
    const now = Date.now();
    const len = this.keys.length;

    for (let attempt = 0; attempt < len; attempt++) {
      const idx = (this.currentIndex + attempt) % len;
      if (this.keys[idx].cooldownUntil <= now) {
        this.currentIndex = idx;
        return { key: this.keys[idx].key, index: idx };
      }
    }

    return null; // All keys cooling down
  }

  /**
   * Get the soonest time any key will be available again.
   * Returns seconds until the next key is ready.
   */
  getSoonestRetrySeconds(): number {
    const now = Date.now();
    let soonest = Infinity;
    for (const ks of this.keys) {
      const remaining = ks.cooldownUntil - now;
      if (remaining < soonest) soonest = remaining;
    }
    return Math.max(1, Math.ceil(soonest / 1000));
  }

  /**
   * Report a 429 rate-limit for a given key index.
   * Parses Groq-specific headers to determine cooldown duration.
   * Advances the sticky index to the next key.
   */
  reportRateLimit(keyIndex: number, headers: Headers): void {
    let cooldownMs = 60_000; // Default: 60s if no header info

    // Try retry-after first (standard)
    const retryAfter = headers.get("retry-after");
    if (retryAfter) {
      const parsed = parseDurationToMs(retryAfter);
      if (parsed) cooldownMs = parsed;
    } else {
      // Try Groq-specific headers
      const resetRequests = headers.get("x-ratelimit-reset-requests");
      const resetTokens = headers.get("x-ratelimit-reset-tokens");

      // Use the longer of the two durations
      const reqMs = resetRequests ? parseDurationToMs(resetRequests) : null;
      const tokMs = resetTokens ? parseDurationToMs(resetTokens) : null;

      if (reqMs || tokMs) {
        cooldownMs = Math.max(reqMs ?? 0, tokMs ?? 0);
      }
    }

    // Set cooldown for this key
    this.keys[keyIndex].cooldownUntil = Date.now() + cooldownMs;

    // Advance sticky index to next key
    const prevIndex = this.currentIndex;
    this.currentIndex = (keyIndex + 1) % this.keys.length;

    console.log(
      `[groq-keys] Key #${keyIndex + 1} rate-limited, cooldown ${Math.ceil(cooldownMs / 1000)}s. ` +
        `Rotated from #${prevIndex + 1} → #${this.currentIndex + 1}`
    );
  }

  get keyCount(): number {
    return this.keys.length;
  }
}

// Singleton — module-scoped, resets on cold start
let _manager: GroqKeyManager | null = null;

export function getKeyManager(): GroqKeyManager {
  if (!_manager) {
    _manager = new GroqKeyManager();
  }
  return _manager;
}

/**
 * Thrown when all API keys are currently in cooldown.
 * The caller should surface `retryAfterSeconds` to the user.
 */
export class AllKeysExhaustedError extends Error {
  public retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      `All Groq API keys are rate-limited. Try again in ${retryAfterSeconds}s.`
    );
    this.name = "AllKeysExhaustedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
