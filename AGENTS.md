# Conci Agent Rules

These rules apply to work in this repository unless the user explicitly overrides them for a task.

## General Guidelines

- Do not rewrite large sections unnecessarily.
- Reuse existing components whenever possible.
- Keep UI consistent with the current design.
- Keep changes minimal and focused.
- Use TypeScript types for new code.
- For new Next.js UI, prefer `next/image` over raw `<img>` unless there is a specific reason not to.

## Workflow

- For broad requests, audit and plan first before editing files.
- Before coding, inspect the relevant files and explain the smallest safe change.
- Work on one coherent improvement at a time.
- Naturally use Codex Browser when it is the best way to verify changes, especially for frontend UI, layout, interaction flows, visual polish, and end-to-end user behavior.
- After meaningful frontend changes, prefer browser-based verification in addition to code inspection when practical.
- After code changes, run `npm run build` when practical.
- If the build fails, fix the failure before stopping.
- Summarize changed files, user-facing changes, risks, and follow-ups.

## Safety

- Do not read, print, modify, copy, summarize, or expose `.env.local` or secrets.
- Do not push to `main`.
- Do not touch auth unless explicitly asked.
- Do not touch Stripe, Supabase schema, Vercel config, package versions, or deployment config unless explicitly asked.
- Do not install new packages unless explicitly approved.
- Do not delete files unless clearly necessary and approved.

## Product Direction

- Conci is a web app for AI-led group trip planning.
- Prioritize start/join trip flow, itinerary clarity, AI-assisted editing, group preferences, voting/collaboration, booking links, costs, and contributions.
- Avoid generic SaaS dashboard design.
- Do not replace real travel/API logic with fake or mock data.
- Do not touch `globals.css` or `layout.tsx` for unrelated tasks.
