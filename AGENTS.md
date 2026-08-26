# Repository instructions

Read `docs/PROJECT_CONTEXT.md` before planning or making substantive changes. Treat the current repository state as authoritative for implementation details; the context document records product decisions and the larger system picture.

## Working rules

- Preserve unrelated user changes and keep changes scoped to the requested task.
- Do not implement a requested change until the relevant code paths and `supabase/schema.sql` have been inspected.
- Maintain strict project isolation in frontend queries, database functions, and RLS policies.
- Security rules belong in PostgreSQL/RLS, not only in hidden or disabled UI.
- Keep private setlist drafts private, preserve published-setlist immutability, and allow at most one final setlist per project.
- Do not hard-code project-specific names or duration limits; use the selected project's data.
- Treat mobile usability as a primary acceptance criterion.
- Never commit secrets, service-role keys, passwords, group codes, or privileged tokens. `NEXT_PUBLIC_*` values must be safe for browsers.
- Do not assume that edits to `supabase/schema.sql` are already deployed. State explicitly when production SQL still has to be applied or verified.
- Before handing off code changes, run the most relevant checks and at least `npm run build` when feasible. Report failures and any checks not run.
- Update `docs/PROJECT_CONTEXT.md` when a change materially alters product rules, architecture, the data model, security, implemented major capabilities, or the prioritized larger work. Do not add chat history or minor task logs.

## Current priority

Verify and complete multi-project isolation before expanding the final-round workflow. Use a separate test account and project to validate assignments, visibility, project switching, and RLS boundaries.
