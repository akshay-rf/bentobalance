# BentoBalance

A meal tracking and AI-assisted fitness coaching app built with Node.js, Express, EJS, Clerk, MongoDB, and Gemini.

## Features

- Clerk authentication with protected dashboard routes
- Meal logging with upload and CRUD flow
- Habit commitments and AI motivation tips
- Fitness coach with frame-by-frame posture cues
- Optional Gemini TTS playback for voice coaching
- Goals, metrics, and achievements tracking

## Tech Stack

- Node.js + Express
- EJS + Bootstrap
- MongoDB + Mongoose
- Clerk (`@clerk/express`, `@clerk/backend`)
- Gemini (`@google/generative-ai`)

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env`:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TTS_MODEL=gemini-2.5-flash-preview-tts
GEMINI_TTS_VOICE=Kore

MONGODB_URL=mongodb://localhost:27017/fitsense
BASE_URL=http://localhost:8000
PORT=8000
```

3. Start the app:

```bash
npm run dev
```

4. Open:

```text
http://localhost:8000
```

## Auth and Session Notes

- Dashboard pages use Clerk session-aware middleware.
- Fitness coach requests refresh auth only when needed (instead of forcing token refresh every frame).
- On transient auth failure (`401`/`403`), coach calls retry once after token refresh.

## Gemini Notes

- Text generation uses model fallback if a configured model is unavailable.
- TTS uses a dedicated TTS model list and falls back to text-only response if audio generation is unavailable.
- If you change Gemini model env values, restart the server.

## Troubleshooting

- `models/<name> is not found`: set `GEMINI_MODEL` to `gemini-2.5-flash` (or another supported model).
- TTS `400` saying it should only be used for TTS: verify `GEMINI_TTS_MODEL` is `gemini-2.5-flash-preview-tts`.
- Random Clerk logouts during long coach sessions: restart after pulling latest auth/session changes.

## License

ISC
