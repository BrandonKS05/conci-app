# Conci

Next.js + Tailwind app for a consumer-style trip planning assistant (parser, collaboration, Supabase-backed trips).

## Getting the app after `git clone`

This project does **not** use Python’s `requirements.txt`. Dependencies are declared in **`package.json`** and pinned in **`package-lock.json`**. After you pull or clone:

```bash
npm install
```

Use a current **Node.js LTS** (v20+ recommended). Then copy environment variables from the example file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your Supabase keys and any optional API keys you need (see comments in `.env.example`).

## Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other useful commands:

```bash
npm run build   # production build
npm run lint    # ESLint
```

## Environment

- **Required for auth / trips:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **Server features (trip pages, delete, collab writes, etc.):** `SUPABASE_SERVICE_ROLE_KEY` (never expose to the browser)
- **Optional:** `OPENAI_API_KEY`, `RAPIDAPI_KEY`, `RAPIDAPI_AMADEUS_HOST`, `SERPAPI_KEY`, etc. — see `.env.example`

## Database

Schema and policies for Supabase live in [`supabase/schema.sql`](supabase/schema.sql) (and migrations under `supabase/migrations/` if present).

## Legacy README notes

- OpenAI-based trip parsing uses `OPENAI_API_KEY` when set.
- You can open `/supabase-test` to verify the Supabase client against your project.
