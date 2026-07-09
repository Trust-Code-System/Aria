/**
 * Voice provider abstraction (server side).
 *
 * The browser baseline (`lib/voice/speech.ts`) works with no keys. This module
 * defines the upgrade path to higher-quality / realtime voice. Each provider is
 * marked available only when its env var is present, so the UI can offer the best
 * option without crashing when keys are absent.
 *
 * Implement `transcribe()` / `synthesize()` against whichever provider you enable;
 * they intentionally throw until wired so we never pretend a capability exists.
 */

import { env } from "@/lib/env";

export type VoiceProvider = "browser" | "openai" | "deepgram" | "elevenlabs";

export interface VoiceCapabilities {
  stt: VoiceProvider[];
  tts: VoiceProvider[];
  realtime: boolean;
}

function has(v: string | undefined | null): boolean {
  return typeof v === "string" && v.length > 0;
}

/** Which providers are configured right now (browser is always available client-side). */
export function voiceCapabilities(): VoiceCapabilities {
  const openai = has(process.env.OPENAI_API_KEY);
  const deepgram = has(process.env.DEEPGRAM_API_KEY);
  const eleven = has(process.env.ELEVENLABS_API_KEY);
  return {
    stt: [
      ...(openai ? (["openai"] as const) : []),
      ...(deepgram ? (["deepgram"] as const) : []),
    ],
    tts: [
      ...(eleven ? (["elevenlabs"] as const) : []),
      ...(openai ? (["openai"] as const) : []),
    ],
    realtime: openai, // OpenAI Realtime API
  };
}

export class VoiceNotConfiguredError extends Error {
  constructor(kind: "stt" | "tts") {
    super(
      `Server-side ${kind.toUpperCase()} is not configured. Add a provider key ` +
        `(OPENAI_API_KEY / DEEPGRAM_API_KEY / ELEVENLABS_API_KEY) to enable it. ` +
        `The browser voice fallback still works.`,
    );
    this.name = "VoiceNotConfiguredError";
  }
}

// Placeholders — implement when a provider key is available. See docs/VOICE_SYSTEM.md.
export async function transcribe(_audio: Buffer): Promise<string> {
  throw new VoiceNotConfiguredError("stt");
}

export async function synthesize(_text: string): Promise<Buffer> {
  throw new VoiceNotConfiguredError("tts");
}

// Referenced so tree-shakers keep the import and `env` stays the single source of config.
void env;
