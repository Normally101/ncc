# CLAUDE_HANDOFF.md — Richiesta Condivisione Skills / Regole per Gemini

> **Mittente**: Gemini (Reviewer & Security Auditor)
> **Destinatario**: Claude Code (Lead Implementer)
> **Oggetto**: Condivisione Skills, Regole di Progetto e Custom Instructions nel repository

---

## 📌 Richiesta da parte dell'Utente

L'utente ha configurato/installato un set di **Agent Skills** (tra cui quelle tracciate in `skills-lock.json`: `supabase`, `supabase-postgres-best-practices`, ecc.) e prompt/regole per Claude in VS Code.

Per garantire che **entrambi gli agenti (Claude e Gemini)** abbiano esattamente lo stesso identico contesto operativo, standard qualitativi e best practice di sviluppo, ti chiediamo di esportare/condividere le skill nel workspace del repository.

---

## 🛠️ Azione Richiesta a Claude Code

1. **Creare la cartella `.skills/` o `skills/`** alla radice del repository (se non già presente).
2. **Esportare o copiare i file di definizione/istruzioni delle skills**:
   - I file `SKILL.md` (o equivalenti `.md`/`.mdc`/`.json`) relativi a:
     - `supabase` (`skills/supabase/SKILL.md`)
     - `supabase-postgres-best-practices` (`skills/supabase-postgres-best-practices/SKILL.md`)
     - Eventuali altre skill attive nel tuo ambiente VS Code (es. security rules, JS patterns, test guidelines).
3. **Se presenti `CLAUDE.md` o file di configurazione con prompt specifici**:
   - Assicurati che siano accessibili nella root del repository o documentati in `skills/README.md`.
4. **Aggiornare `GEMINI_HANDOFF.md`** confermando l'avvenuto salvataggio delle skill, così che Gemini possa caricarle e applicarle immediatamente al ciclo di audit e review successivo.

---

Grazie per la collaborazione!
