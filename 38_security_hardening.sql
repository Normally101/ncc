-- ============================================================================
-- 38_security_hardening.sql — Chauffeur Empire
-- Hardening lato server (audit di sicurezza giugno 2026).
-- IDEMPOTENTE: puoi rigirarlo più volte senza danni.
-- Gira questo file nel SQL Editor di Supabase.
--
-- Contesto: l'audit dal vivo (con la anon key) ha CONFERMATO che:
--   • RLS blocca le INSERT anonime su game_saves/leaderboard/provinces/...
--   • le UPDATE anonime su leaderboard toccano 0 righe (policy per auth.uid())
--   • i trigger validate_* cappano già liquid_assets/cash > 500M
-- Quindi NON c'è un buco RLS critico. Questo file aggiunge:
--   1) client_error_log (la tabella mancava → il logger client falliva in silenzio)
--   2) security_audit_log + trigger anti-anomalia su leaderboard e game_saves
--   3) infrastruttura rate-limit server-side riutilizzabile
--   4) hardening COMPLETO rpc_award_mission_vtk (cap server 500/g + rate-limit +
--      audit + fix del mismatch di firma che faceva fallire il sync)
-- Tutto eseguibile in un colpo solo: nessuna sezione da adattare a mano.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1) CLIENT ERROR LOG  (#35 — log senza segreti, RLS stretta)
--    security.js fa insert qui; finora la tabella non esisteva (404).
--    Regola: ogni utente può inserire SOLO righe proprie; NESSUNO legge via API
--    (solo service_role dal dashboard). Niente SELECT per anon/authenticated.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_error_log (
    id          bigint generated always as identity primary key,
    user_id     uuid references auth.users(id) on delete set null,
    error_msg   text,
    error_src   text,
    error_line  int,
    user_agent  text,
    created_at  timestamptz not null default now()
);

alter table public.client_error_log enable row level security;

-- INSERT consentito solo per la propria riga (o user_id null se non loggato)
drop policy if exists cel_insert_own on public.client_error_log;
create policy cel_insert_own on public.client_error_log
    for insert to anon, authenticated
    with check (user_id is null or user_id = auth.uid());

-- Nessuna policy SELECT/UPDATE/DELETE → invisibile via API. Solo service_role legge.

-- Retention: indice per pulizia periodica
create index if not exists cel_created_idx on public.client_error_log (created_at);


-- ────────────────────────────────────────────────────────────────────────────
-- 2) SECURITY AUDIT LOG  (#42 — audit trail su mutazioni anomale)
--    Tabella append-only + trigger che logga salti sospetti.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.security_audit_log (
    id          bigint generated always as identity primary key,
    user_id     uuid,
    event_type  text not null,           -- es. 'leaderboard_spike', 'save_cash_jump'
    detail      jsonb,
    created_at  timestamptz not null default now()
);

alter table public.security_audit_log enable row level security;
-- Nessuna policy → nessun accesso via API. Solo trigger SECURITY DEFINER + service_role.

create index if not exists sal_user_idx on public.security_audit_log (user_id, created_at);
create index if not exists sal_type_idx on public.security_audit_log (event_type, created_at);


-- Trigger su leaderboard: logga aumenti di liquid_assets implausibili tra due update
create or replace function public._audit_leaderboard_anomaly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    jump numeric;
begin
    if TG_OP = 'UPDATE' then
        jump := coalesce(NEW.liquid_assets,0) - coalesce(OLD.liquid_assets,0);
        -- soglia: +20M in un singolo update = sospetto (il gioco non lo consente normalmente)
        if jump > 20000000 then
            insert into public.security_audit_log(user_id, event_type, detail)
            values (NEW.user_id, 'leaderboard_spike',
                    jsonb_build_object('from', OLD.liquid_assets, 'to', NEW.liquid_assets, 'jump', jump));
        end if;
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_audit_leaderboard on public.leaderboard;
create trigger trg_audit_leaderboard
    after update on public.leaderboard
    for each row execute function public._audit_leaderboard_anomaly();


-- Trigger su game_saves: logga salti di cash implausibili nel game_state JSON
create or replace function public._audit_save_anomaly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    new_cash numeric;
    old_cash numeric;
begin
    new_cash := nullif(NEW.game_state->>'cash','')::numeric;
    old_cash := nullif(OLD.game_state->>'cash','')::numeric;
    if new_cash is not null and old_cash is not null
       and (new_cash - old_cash) > 50000000 then
        insert into public.security_audit_log(user_id, event_type, detail)
        values (NEW.user_id, 'save_cash_jump',
                jsonb_build_object('from', old_cash, 'to', new_cash,
                                   'slot', NEW.slot_index, 'jump', new_cash - old_cash));
    end if;
    return NEW;
end;
$$;

drop trigger if exists trg_audit_save on public.game_saves;
create trigger trg_audit_save
    after update on public.game_saves
    for each row execute function public._audit_save_anomaly();


-- ────────────────────────────────────────────────────────────────────────────
-- 3) RATE LIMIT SERVER-SIDE  (#28 — riutilizzabile dalle RPC economiche)
--    Il rate-limit client (localStorage) è bypassabile; questo è autoritativo.
--    Uso dentro una RPC:  perform public._ce_rate_limit('award_vtk', 20, interval '1 minute');
--    Solleva eccezione P0001 se superato → il client mostra messaggio generico.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.rate_limit_buckets (
    user_id      uuid not null,
    action       text not null,
    window_start timestamptz not null default now(),
    count        int not null default 0,
    primary key (user_id, action)
);

alter table public.rate_limit_buckets enable row level security;
-- Nessuna policy: gestita solo da funzioni SECURITY DEFINER.

create or replace function public._ce_rate_limit(
    p_action text,
    p_max    int,
    p_window interval
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    uid uuid := auth.uid();
    b   public.rate_limit_buckets%rowtype;
begin
    if uid is null then
        raise exception 'Autenticazione richiesta' using errcode = 'P0001';
    end if;

    select * into b from public.rate_limit_buckets
        where user_id = uid and action = p_action for update;

    if not found then
        insert into public.rate_limit_buckets(user_id, action, window_start, count)
        values (uid, p_action, now(), 1);
        return;
    end if;

    if now() - b.window_start > p_window then
        update public.rate_limit_buckets
            set window_start = now(), count = 1
            where user_id = uid and action = p_action;
        return;
    end if;

    if b.count >= p_max then
        raise exception 'Troppe richieste, riprova tra poco' using errcode = 'P0001';
    end if;

    update public.rate_limit_buckets
        set count = count + 1
        where user_id = uid and action = p_action;
end;
$$;

revoke all on function public._ce_rate_limit(text,int,interval) from public, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- 4) HARDENING rpc_award_mission_vtk  (#15/#34) — COMPLETO, schema reale
--    Lo schema VTK reale è in 21_vtk_token.sql: companies.vtk_balance /
--    vtk_earned_today / vtk_today_reset, con CAP GIORNALIERO SERVER = 500.
--    Quindi l'exploit "client manda 999999" era GIÀ limitato a 500/giorno dal
--    server (LEAST(amount, cap - earned)). Restano 2 problemi che chiudo qui:
--
--    a) MISMATCH DI FIRMA: la funzione esistente è (v_mission_id TEXT, v_vtk_amount
--       BIGINT) ma il frontend (quests.js) la chiama con il solo v_vtk_amount →
--       la chiamata FALLISCE in silenzio (ecco perché "client is source of truth").
--       La ridefinisco con v_mission_id OPZIONALE così la chiamata reale funziona.
--    b) Niente rate-limit / audit. Aggiunti.
--
--    Mantengo il cap giornaliero a 500 (deciso dal SERVER, non dal client) e
--    NON aggiungo un hard-block per-chiamata (rischierebbe di rompere una missione
--    legittima ad alto reward): il cap giornaliero basta a limitare il danno.
-- ────────────────────────────────────────────────────────────────────────────

-- Rimuovi la vecchia firma a 2 argomenti per evitare ambiguità di overload.
drop function if exists public.rpc_award_mission_vtk(text, bigint);
-- Rimuovi eventuali altre varianti già create da run precedenti di questo file.
drop function if exists public.rpc_award_mission_vtk(integer);
drop function if exists public.rpc_award_mission_vtk(bigint);

create or replace function public.rpc_award_mission_vtk(
    v_vtk_amount bigint,
    v_mission_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_cap          bigint := 500;   -- cap giornaliero per player (deciso dal server)
    v_today_earned bigint;
    v_can_award    bigint;
begin
    if auth.uid() is null then
        raise exception 'Autenticazione richiesta' using errcode = 'P0001';
    end if;

    -- Importo non plausibile dal client → logga (probing) e rifiuta.
    -- Soglia generosa: nessuna singola missione supera il cap giornaliero.
    if v_vtk_amount is null or v_vtk_amount <= 0 or v_vtk_amount > v_cap then
        insert into public.security_audit_log(user_id, event_type, detail)
        values (auth.uid(), 'vtk_award_out_of_range',
                jsonb_build_object('amount', v_vtk_amount, 'mission', v_mission_id));
        raise exception 'Importo VTK non valido' using errcode = 'P0001';
    end if;

    -- Anti-spam: max 30 award/minuto per utente (autoritativo lato server).
    perform public._ce_rate_limit('award_vtk', 30, interval '1 minute');

    -- Reset contatore giornaliero se vecchio
    update public.companies
    set vtk_earned_today = 0, vtk_today_reset = current_date
    where user_id = auth.uid() and vtk_today_reset < current_date;

    select vtk_earned_today into v_today_earned
    from public.companies where user_id = auth.uid();

    -- Il SERVER decide quanto si può ancora accreditare oggi.
    v_can_award := least(v_vtk_amount, greatest(0, v_cap - coalesce(v_today_earned, 0)));

    if v_can_award <= 0 then
        return jsonb_build_object('success', false, 'reason', 'daily_cap_reached', 'cap', v_cap);
    end if;

    update public.companies
    set vtk_balance      = vtk_balance + v_can_award,
        vtk_earned_today = vtk_earned_today + v_can_award
    where user_id = auth.uid();

    return jsonb_build_object('success', true, 'awarded', v_can_award, 'mission_id', v_mission_id);
end;
$$;

revoke all  on function public.rpc_award_mission_vtk(bigint, text) from public, anon;
grant execute on function public.rpc_award_mission_vtk(bigint, text) to authenticated;


-- ────────────────────────────────────────────────────────────────────────────
-- NOTE OPERATIVE
-- • #41 leaderboard espone user_id (UUID auth) in lettura: è accettabile per una
--   classifica pubblica (le scritture sono protette da RLS). Se vuoi nasconderlo,
--   crea una view senza user_id e fai puntare ui-ranking.js alla view — ma il
--   frontend usa user_id per evidenziare la TUA riga, quindi va rifattorizzato.
-- • Dopo questo file il sync VTK server-side inizia a funzionare davvero (prima
--   falliva per il mismatch di firma). Il client fa ancora `gs.vtkBalance += r.vtk`
--   localmente: per coerenza piena, al prossimo load leggi companies.vtk_balance
--   come fonte autoritativa (il server applica il cap, il client no).
-- • Pulizia periodica log (esegui a mano ogni tanto, o via pg_cron se attivo):
--     delete from public.client_error_log   where created_at < now() - interval '30 days';
--     delete from public.security_audit_log  where created_at < now() - interval '90 days';
-- ============================================================================
