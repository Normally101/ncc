-- ════════════════════════════════════════════════════════════════════════════
-- 39_push_subscriptions.sql — Chauffeur Empire
-- Web Push (VAPID) — storage delle subscription + selezione target per il cron.
--
-- Catena: client (push-notifications.js) salva la PushSubscription qui →
--         Edge Function `send-push` (Deno + web-push) legge i target via
--         rpc_due_push_subscriptions() e invia la notifica di ritorno.
--
-- Idempotente. Eseguire nel SQL editor di Supabase.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── TABLE: push_subscriptions ──────────────────────────────────────────────
-- Una riga per (browser/device) endpoint. last_seen = heartbeat dal client;
-- last_notified_at = anti-spam (cooldown) lato cron.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint         text        NOT NULL UNIQUE,
    p256dh           text        NOT NULL,
    auth             text        NOT NULL,
    last_seen        timestamptz NOT NULL DEFAULT now(),
    last_notified_at timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- Indici per la query del cron (idle window + cooldown)
CREATE INDEX IF NOT EXISTS idx_push_subs_last_seen     ON public.push_subscriptions (last_seen);
CREATE INDEX IF NOT EXISTS idx_push_subs_user          ON public.push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_last_notified ON public.push_subscriptions (last_notified_at);

-- ─── RLS: ognuno gestisce SOLO le proprie subscription ──────────────────────
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subs_select_own ON public.push_subscriptions;
CREATE POLICY push_subs_select_own ON public.push_subscriptions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subs_insert_own ON public.push_subscriptions;
CREATE POLICY push_subs_insert_own ON public.push_subscriptions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subs_update_own ON public.push_subscriptions;
CREATE POLICY push_subs_update_own ON public.push_subscriptions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subs_delete_own ON public.push_subscriptions;
CREATE POLICY push_subs_delete_own ON public.push_subscriptions
    FOR DELETE USING (auth.uid() = user_id);

-- Nessuna SELECT via API per il service_role serve policy: il service_role
-- bypassa la RLS. Gli anonimi non hanno nessuna policy → zero accesso.

-- ─── RPC: target selection (solo service_role / cron) ───────────────────────
-- Ritorna le subscription da notificare:
--   • inattive da almeno p_idle_hours    (es. 22h)
--   • non troppo vecchie (entro p_max_idle_days, es. 7g — non spammare i morti)
--   • non già notificate negli ultimi p_cooldown_hours (es. 20h)
-- SECURITY DEFINER per leggere tutte le righe; join con companies per
-- personalizzare il messaggio (nome azienda + cassa).
CREATE OR REPLACE FUNCTION public.rpc_due_push_subscriptions(
    p_idle_hours    int DEFAULT 22,
    p_cooldown_hours int DEFAULT 20,
    p_max_idle_days int DEFAULT 7
)
RETURNS TABLE (
    endpoint     text,
    p256dh       text,
    auth         text,
    company_name text,
    cash         bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT ps.endpoint,
           ps.p256dh,
           ps.auth,
           c.company_name,
           c.cash
    FROM   public.push_subscriptions ps
    LEFT   JOIN public.companies c ON c.user_id = ps.user_id
    WHERE  ps.last_seen <  now() - make_interval(hours => p_idle_hours)
    AND    ps.last_seen >  now() - make_interval(days  => p_max_idle_days)
    AND    (ps.last_notified_at IS NULL
            OR ps.last_notified_at < now() - make_interval(hours => p_cooldown_hours))
    ORDER  BY ps.last_seen ASC
    LIMIT  2000;
$$;

-- La RPC NON deve essere chiamabile da anon/authenticated (solo cron/server).
REVOKE ALL ON FUNCTION public.rpc_due_push_subscriptions(int, int, int) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_due_push_subscriptions(int, int, int) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- CRON — invoca l'Edge Function `send-push` ogni ora.
-- Richiede le estensioni pg_cron + pg_net (Dashboard → Database → Extensions).
-- Sostituisci <PROJECT_REF> e <SERVICE_ROLE_KEY> (meglio: usa Supabase Vault).
--
--   SELECT cron.schedule(
--     'ce-send-push',
--     '0 * * * *',                       -- ogni ora, minuto 0
--     $cron$
--       SELECT net.http_post(
--         url     := 'https://<PROJECT_REF>.functions.supabase.co/send-push',
--         headers := jsonb_build_object(
--                      'Content-Type',  'application/json',
--                      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
--                    ),
--         body    := '{}'::jsonb
--       );
--     $cron$
--   );
--
-- Alternativa più semplice: Dashboard → Edge Functions → send-push → "Cron"
-- (schedula la function direttamente, senza scrivere pg_net).
--
-- Per rimuovere lo schedule:  SELECT cron.unschedule('ce-send-push');
-- ════════════════════════════════════════════════════════════════════════════
