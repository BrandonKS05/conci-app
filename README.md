# Conci

Starter Next.js + Tailwind app for an AI executive assistant concept.

## What’s included

- 6 views: prompt, results, itinerary editor, recommendation detail, booking handoff, saved itinerary
- Mock provider data for flights, restaurants, and things to do, all hidden behind a local API/state layer
- Clean consumer-style UI
- LLM-based request parsing with local fallback handling
- Canonical itinerary state persisted in Supabase tables, with a local fallback store only if Supabase is unavailable

## Run locally

```bash
npm install
npm run dev
```

The app works with no API key. If you want OpenAI-based parsing, set `OPENAI_API_KEY` before submitting a prompt. You can also set `OPENAI_MODEL` if you want to override the default parser model.

For Supabase, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to your environment. You can then open `/supabase-test` to verify the client initializes and reaches your project.
The app persists itinerary data through `requests`, `itinerary_items`, and `selections`; the matching SQL lives in [supabase/schema.sql](/Users/arnavnigam/Desktop/ai-assistant-app/supabase/schema.sql).

Then open `http://localhost:3000`.
