# Chauffeur Empire — CLAUDE.md (LEAN)

Browser MMO gestionale "poor to rich" (NCC di lusso). Vanilla HTML/CSS/JS, no framework/bundler (solo Tailwind CLI). Backend Supabase (Postgres + Realtime + RPC). Mappa Mapbox.

> Questo file è **LEAN apposta**: si carica a OGNI messaggio. Il dettaglio sta altrove, letto SOLO quando serve:
> - **Architettura profonda** (struttura engine.js/map.js, ordine dei ~60 script, bug-log, HQ/Quest, CSS, gameState completo) → `docs/ARCHITECTURE.md`
> - **Stato corrente / cosa è in corso / decisioni** → `HANDOFF.md` (leggi a inizio sessione)
> - **Design del gioco** (visione, sistemi, economia, idee, brainstorming) → vault Obsidian `~/Documents/chauffeur-empire-brain/` (MOC: `00 Mappa/Chauffeur Empire.md`; entry: `Decisioni Aperte` · `Idee e Backlog` · `Changelog`)

## Protocollo sessione
1. Leggi `HANDOFF.md` (stato + cosa manca). Mai chiedere "dove eravamo": derivalo.
2. `git log --oneline -5` se serve contesto sui commit.
3. **A fine sessione:** aggiorna `HANDOFF.md` e, se hai toccato un sistema, la nota corrispondente nel **vault** (regola esplicita di Vlad). Per dettaglio architetturale nuovo → `docs/ARCHITECTURE.md`, non qui.

## Guardrail critici (sempre veri — violarli rompe il gioco)
- **Globali condivise** = `var` al top-level (diventa `window.X`). `let`/`const` restano locali al file.
- **Mai ridichiarare** `const`/`let` globali con lo stesso nome tra file (SyntaxError strict → il file non esegue). Usa `window.NOME`.
- **Funzioni cross-file** via `window.fn` + guard `typeof window.fn === 'function'`.
- **Cash / operazioni server-authoritative** (province, immobili, premi): via RPC Supabase, MAI `gameState.cash` diretto. (`gameState` è `let` in engine.js ma esposto come `window.gameState` via getter → forme equivalenti.)
- **Cache-bust:** bump `?v=N` in index.html per ogni JS modificato (se la CDN serve vecchio, bumpa tutti).
- **Stile UI:** kit `.em` **SCURO** (Bloomberg-terminal, commit `06e5763`; la nota «light — Fase 3» era vecchia di due conversioni e mandava fuori strada). Inline style nei tab, niente `DS.*`. I colori si prendono dai token `--em-*` in `style.css`, **mai a mano**: sono tarati per il fondo scuro e verificati a contrasto ≥4.5. Palette/pattern in `docs/ARCHITECTURE.md`.
- **CSP:** il service worker richiede `worker-src 'self'` (per le notifiche push). Non toglierlo.

## Deploy (IMPORTANTE)
- Sito su **VERCEL** (auto-deploy da `main`). **NON** GitHub Pages. **MAI** `git push main:gh-pages` (pubblicava l'intero repo → leak).
- `.vercelignore` esclude dal pubblico `*.sql *.md *.py *.sh supabase/ docs/ …` → restano nel repo privato. **Non rimuoverlo.**
- Verifica leak: `curl -I https://www.chauffeurempire.com/38_security_hardening.sql` → deve dare **404**.

## File da NON leggere interi (grossi)
`routesDB.js`, `data.js`, `quests-data.js`, `tailwind.min.css`, e `docs/ARCHITECTURE.md` (solo le sezioni che servono). Usa `grep` / `offset` / `limit`.

## Operatività
- **Supabase autonomo:** `source ~/.config/ce-supabase.env` → `supabase` CLI o Management API (project ref `twstjbykstaioaahfqbe`). Token full-account, mai nel repo/doc pubblici.
- **Disciplina di contesto:** vedi `~/.claude/CLAUDE.md` globale (no filler, no letture/dump inutili dei tool, subagent per ricerche ampie).
