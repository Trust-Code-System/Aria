# Voice System

## What works today (no API keys)

- **Speech-to-text:** push-to-talk mic in the chat composer via the browser Web Speech
  API (`lib/voice/speech.ts`). Chrome/Edge only; the mic button hides where unsupported.
- **Text-to-speech:** "Read aloud" on assistant messages via `speechSynthesis`.
- A recording state is shown while the mic is active.

## Upgrade path (needs keys — currently `[!]` blocked)

`lib/voice/providers.ts` is the server-side abstraction. Fill the env vars in
`.env.example` to unlock:

| Provider | Env vars | Gives |
| --- | --- | --- |
| Deepgram | `DEEPGRAM_API_KEY` | High-quality streaming STT |
| ElevenLabs | `ELEVENLABS_API_KEY` | Natural TTS voices |
| OpenAI Realtime | `OPENAI_API_KEY` (reused) | Realtime conversation |
| LiveKit | `LIVEKIT_API_KEY/SECRET/URL` | Realtime audio transport |

## Safety rules

- Voice never triggers risky actions directly — anything above risk level 0 still goes
  through the Approval Inbox. No voice-approval of level 2+ actions.
- No always-on listening; recording only while push-to-talk is held.
- Meeting transcription and multilingual support are roadmap items (see `ROADMAP.md`).
