/**
 * Browser voice helpers — zero-dependency, zero-API-key baseline.
 *
 *  - Speech-to-text via the Web Speech API (`SpeechRecognition`), supported in
 *    Chromium browsers (Chrome/Edge). Push-to-talk: start on mic press, stop on
 *    release/toggle, stream interim transcripts to the composer.
 *  - Text-to-speech via `speechSynthesis` for "read aloud" on assistant replies.
 *
 * For higher-quality / realtime voice (OpenAI Realtime, Deepgram, ElevenLabs,
 * LiveKit) see `lib/voice/providers.ts` — those need API keys and are wired in
 * separately. This module is the always-available fallback.
 */

"use client";

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "SpeechRecognition" in window || "webkitSpeechRecognition" in window;
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

type RecognitionHandle = { stop: () => void };

interface DictationCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (message: string) => void;
  onEnd?: () => void;
  lang?: string;
}

/**
 * Start dictation. Returns a handle to stop it, or null if unsupported.
 * `onResult` receives the accumulated transcript with an `isFinal` flag.
 */
export function startDictation(cb: DictationCallbacks): RecognitionHandle | null {
  if (!speechRecognitionSupported()) {
    cb.onError?.("Voice input isn't supported in this browser. Try Chrome or Edge.");
    return null;
  }
  const Ctor =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.lang = cb.lang || navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = true;

  let finalText = "";
  rec.onresult = (event: any) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalText += chunk;
      else interim += chunk;
    }
    cb.onResult((finalText + interim).trim(), interim === "");
  };
  rec.onerror = (e: any) => cb.onError?.(mapRecognitionError(e?.error));
  rec.onend = () => cb.onEnd?.();

  try {
    rec.start();
  } catch {
    /* start() throws if called twice; ignore */
  }
  return { stop: () => { try { rec.stop(); } catch { /* noop */ } } };
}

/** Speak text aloud. Returns a stop function. Cancels any in-progress speech. */
export function speak(
  text: string,
  opts?: { rate?: number; lang?: string; onEnd?: () => void },
): () => void {
  if (!speechSynthesisSupported() || !text.trim()) return () => {};
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = opts?.rate ?? 1;
  utter.lang = opts?.lang || navigator.language || "en-US";
  if (opts?.onEnd) {
    utter.onend = opts.onEnd;
    utter.onerror = opts.onEnd;
  }
  window.speechSynthesis.speak(utter);
  return () => window.speechSynthesis.cancel();
}

export function stopSpeaking(): void {
  if (speechSynthesisSupported()) window.speechSynthesis.cancel();
}

function mapRecognitionError(code?: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone permission was denied. Enable it in your browser settings.";
    case "no-speech":
      return "I didn't catch that — no speech detected.";
    case "audio-capture":
      return "No microphone was found.";
    default:
      return "Voice input stopped unexpectedly.";
  }
}
