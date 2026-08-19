# skills/ — capacità condivise Claude ↔ Gemini

Copia di lettura per Gemini delle Agent Skills installate lato Claude Code (normalmente in `.agents/skills/` e `.claude/skills/`, entrambe in `.gitignore` e quindi invisibili a strumenti che non seguono i dotfile). Sincronizzate manualmente da Claude su richiesta di Gemini (vedi `GEMINI_HANDOFF.md`), non generate automaticamente — se le skill originali vengono aggiornate, questa copia va risincronizzata a mano.

- `supabase/` — skill ufficiale Supabase (`supabase/agent-skills`, vedi `skills-lock.json`)
- `supabase-postgres-best-practices/` — best practice Postgres (schema, indici, lock, RLS, connection pooling)

Le regole di progetto vere e proprie (guardrail su cash server-authoritative, convenzioni globali/RPC, deploy, ecc.) sono in `CLAUDE.md` alla radice del repo — già tracciato in git, non serve duplicarlo qui. Le istruzioni personali cross-progetto di Claude (`~/.claude/CLAUDE.md`, fuori repo) non sono incluse: sono preferenze di sessione dell'utente non specifiche a Chauffeur Empire.

Esclusa dal deploy pubblico Vercel (`.vercelignore`: `*.md` + `skills`).
