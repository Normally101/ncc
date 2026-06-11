# 🔒 Punch-list di sicurezza pre-lancio — Chauffeur Empire

> Ordine = priorità reale (impatto sul rischio), non difficoltà.
> Legenda: 🧑 = tocca a te (account/dashboard, non automatizzabile) · 🤖 = fatto/farò io · ⏳ = da fare

---

## P0 — HARDENING ACCOUNT (oggi, ~30 min, gratis — è il rischio #1)
Il furto d'account è il master key: chiude in un colpo cheater + furto dati + defacement.

- [ ] 🧑 **2FA sull'EMAIL** (per prima — è la radice di tutti i reset password). App TOTP o passkey, **non SMS**.
- [ ] 🧑 **2FA su GitHub** (chi entra qui pusha codice malevolo nel gioco live)
- [ ] 🧑 **2FA su Supabase** (chi entra qui possiede i dati dei giocatori)
- [ ] 🧑 **2FA sul registrar del dominio** chauffeurempire.com (chi entra qui dirotta dominio + email)
- [ ] 🧑 **2FA su Mapbox**
- [x] 🧑 Controllato haveibeenpwned.com → email non in breach noti (✅ ma vedi P1: il riuso resta il rischio)

## P1 — SEGRETI & BACKUP (questa settimana)
- [ ] 🧑 **Smetti di riusare la password DB attuale** (debole, riusata). Ruotala (Supabase Dashboard → Database → Reset password) + email + GitHub, una UNICA per ognuna.
- [x] 🤖 Rimossa la password DB in chiaro dall'MCP postgres in `~/.claude.json` (MCP era rotto comunque)
- [ ] 🤖 Dopo la rotazione: riaggiungo l'MCP postgres col **pooler** e la nuova password (se lo vuoi ancora)
- [ ] 🧑 **Password manager unico** (basta spezzare tra Google + iCloud → è il motivo del riuso). Genera password uniche.
- [x] 🤖 Script di backup pronto: `backup_supabase.sh` (usa `SUPABASE_DB_URL` via env, nessun segreto nel file)
- [ ] 🧑 Installa `pg_dump`: `brew install libpq` · poi lancia un backup e **prova un restore almeno una volta**
- [ ] 🧑 (Consigliato) Attiva i backup automatici Supabase se passi al piano Pro

## LAUNCH-BLOCKER — LEGALE / GDPR (prima di pubblicare)
- [x] 🤖 `privacy.html` aggiornata: aggiunti sub-processor reali (Mapbox, Google Fonts, GitHub Pages, jsDelivr), push notification, formulazione breach corretta (art. 33/34)
- [ ] 🧑 **CONFERMA il Titolare del Trattamento.** Ora dice "OV Agency": dev'essere la tua identità legale REALE (persona fisica con nome, o società con P.IVA). Un titolare placeholder rende la policy legalmente vuota.
- [ ] 🧑 Verifica che esista una pagina/contatto per esercitare i diritti (export + cancellazione account)
- [ ] ⏳ (Consigliato privacy) Self-host dei Google Fonts per eliminare il leak dell'IP a Google — te lo faccio io se vuoi

## STATO TECNICO (già fatto questa sessione)
- [x] 🤖 RLS verificata DAL VIVO con anon key (scritture anonime bloccate 42501; smentito falso "critico")
- [x] 🤖 Errori DB sanitizzati in 14 file (no leak schema in UI) + log client redatti (JWT/email/UUID)
- [x] 🤖 Security headers (CSP, referrer-policy, frame-ancestors, form-action, upgrade-insecure)
- [x] 🤖 `_mockups/` rimosso dal repo pubblico
- [x] 🤖 `38_security_hardening.sql` girato: audit log + trigger anomalie + rate-limit + hardening VTK
- [x] 🤖 Token Mapbox: nuovo token dedicato URL-restricted (verificato 403 dai domini estranei)
- [x] 🤖 Crash tab Contratti riparato

## GIORNO DEL LANCIO
- [ ] 🧑 Privacy policy linkata e raggiungibile dal gioco
- [ ] 🧑 Un backup fresco fatto poco prima del lancio
- [ ] 🤖 Re-test RLS + token dall'esterno (lo rifaccio io su richiesta)

## POST-LANCIO / CONTINUO
- [ ] Monitoraggio: qualcuno deve GUARDARE `security_audit_log` (alert, non solo log)
- [ ] CodeQL (GitHub Action) + njsscan/Semgrep in pre-commit — vedi `security_checklist` in memoria
- [ ] Re-test sicurezza periodico dopo ogni feature nuova (la sicurezza è un processo, non uno stato)

---
Riferimenti: `38_security_hardening.sql` · `backup_supabase.sh` · `privacy.html` · checklist generale in memoria (`security_checklist.md`, si carica ogni sessione).
