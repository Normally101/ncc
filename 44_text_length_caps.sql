-- ════════════════════════════════════════════════════════════════════════════
-- 44_text_length_caps.sql — Hardening: CHECK di lunghezza sui testi liberi utente
-- IDEMPOTENT (DROP IF EXISTS + ADD). Revert = DROP delle constraint ce_len_*.
--
-- "Reject oversized payloads": cappa la lunghezza dei campi testo CONTROLLATI
-- DALL'UTENTE (nome/tag/descrizione consorzio, company_name, chat, holding) a
-- livello di COLONNA → vale per OGNI path di scrittura (RPC, upsert diretto del
-- blob game_saves, ecc.), non solo per la singola RPC. Difesa in profondità contro
-- abuso di storage / payload mostruosi (es. descrizione da 10 MB).
--
-- Cap GENEROSI: max attuali verificati = company_name 16, resto 0 (tabelle vuote)
-- → nessun dato legittimo viene rifiutato. NULL passa (CHECK ignora UNKNOWN).
-- Server-authoritative: il client non può aggirarli (sono nel DB, non nel JS).
-- ════════════════════════════════════════════════════════════════════════════

-- ── Consorzio / Alliance (identità + descrizione create dall'utente) ───────────
ALTER TABLE public.alliances DROP CONSTRAINT IF EXISTS ce_len_name;
ALTER TABLE public.alliances ADD  CONSTRAINT ce_len_name CHECK (char_length(name) <= 80);
ALTER TABLE public.alliances DROP CONSTRAINT IF EXISTS ce_len_tag;
ALTER TABLE public.alliances ADD  CONSTRAINT ce_len_tag  CHECK (char_length(tag) <= 16);
ALTER TABLE public.alliances DROP CONSTRAINT IF EXISTS ce_len_description;
ALTER TABLE public.alliances ADD  CONSTRAINT ce_len_description CHECK (char_length(description) <= 1000);

ALTER TABLE public.consorzi DROP CONSTRAINT IF EXISTS ce_len_name;
ALTER TABLE public.consorzi ADD  CONSTRAINT ce_len_name CHECK (char_length(name) <= 80);
ALTER TABLE public.consorzi DROP CONSTRAINT IF EXISTS ce_len_description;
ALTER TABLE public.consorzi ADD  CONSTRAINT ce_len_description CHECK (char_length(description) <= 1000);

-- ── Chat consorzio (anti payload mostruoso; l'anti-flood è già altrove) ────────
ALTER TABLE public.alliance_chat DROP CONSTRAINT IF EXISTS ce_len_message;
ALTER TABLE public.alliance_chat ADD  CONSTRAINT ce_len_message CHECK (char_length(message) <= 2000);

-- ── Holding (identità + descrizione create dall'utente) ───────────────────────
ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS ce_len_name;
ALTER TABLE public.holdings ADD  CONSTRAINT ce_len_name CHECK (char_length(name) <= 80);
ALTER TABLE public.holdings DROP CONSTRAINT IF EXISTS ce_len_description;
ALTER TABLE public.holdings ADD  CONSTRAINT ce_len_description CHECK (char_length(description) <= 1000);

-- ── Nome azienda (scelto dall'utente; max esistente verificato = 16) ──────────
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS ce_len_company_name;
ALTER TABLE public.companies ADD  CONSTRAINT ce_len_company_name CHECK (char_length(company_name) <= 60);

-- ════════════════════════════════════════════════════════════════════════════
-- FINE 44_text_length_caps.sql
-- ════════════════════════════════════════════════════════════════════════════
