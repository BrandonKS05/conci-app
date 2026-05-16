# Conci Project Rules

## Work Style
- **Minimal Changes**: Keep changes focused and avoid unnecessary large-scale rewrites.
- **Component Reuse**: Reuse existing components whenever possible to maintain consistency.
- **UI Consistency**: Ensure any new UI aligns with the current design system.
- **TypeScript First**: Use TypeScript types for all new code.
- **Next.js Best Practices**: Prefer `next/image` over raw `<img>` tags for optimized performance.
- **Workflow**:
  - Audit and plan before editing files for broad requests.
  - Inspect relevant files and explain the smallest safe change before coding.
  - Work on one coherent improvement at a time.
  - Naturally use Codex Browser when it is the best way to verify changes, especially for frontend UI, layout, interaction flows, visual polish, and end-to-end user behavior.
  - After meaningful frontend changes, prefer browser-based verification in addition to code inspection when practical.
  - Summarize changed files, user-facing changes, risks, and follow-ups after completing a task.

## Guardrails (Safety)
- **Secrets Protection**: Do not read, print, modify, copy, summarize, or expose `.env.local` or any secrets.
- **Source Control**: Do not push directly to the `main` branch.
- **Sensitive Areas**: Do not touch authentication, Stripe integration, Supabase schema, Vercel configuration, or deployment settings unless explicitly requested.
- **Dependencies**: Do not install new packages or modify package versions without explicit approval.
- **File Management**: Do not delete files unless absolutely necessary and approved.
- **Global Styles**: Do not modify `globals.css` or `layout.tsx` for tasks unrelated to those files.

## Product Direction
- **Core Purpose**: Conci is a web app for AI-led group trip planning.
- **Key Flows**: Prioritize the start/join trip flow, itinerary clarity, AI-assisted editing, group preferences, voting/collaboration, booking links, costs, and contributions.
- **Design Philosophy**: Avoid generic SaaS dashboard designs; maintain a travel-focused aesthetic.
- **Data Integrity**: Do not replace real travel or API logic with fake or mock data.

## Useful Commands
- `npm run dev`: Start the development server.
- `npm run build`: Run a production build to check for errors.
- `npm run lint`: Run linting checks.
- `npm start`: Start the production server.
