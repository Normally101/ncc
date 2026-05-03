-- ================================================================
-- 03_mmo_final_eradication.sql
-- Chauffeur Empire · Final Cloud Migration
--
-- Adds:
--   1. messages table           (in-game CEO inbox)
--   2. dispatch_board table     (server-side ride offers)
--   3. companies columns        (current_day, time_of_day, weather, ceo_energy)
--   4. RPCs for time/weather/message/dispatch lifecycle
-- ================================================================

-- ── 1. EXTEND companies TABLE ─────────────────────────────────────
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS current_day   integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS time_of_day   text    NOT NULL DEFAULT 'morning'
        CHECK (time_of_day IN ('morning','afternoon','evening','night')),
    ADD COLUMN IF NOT EXISTS weather       text    NOT NULL DEFAULT 'sereno'
        CHECK (weather IN ('sereno','nuvoloso','pioggia','temporale','neve','nebbia')),
    ADD COLUMN IF NOT EXISTS ceo_energy    integer NOT NULL DEFAULT 100
        CHECK (ceo_energy BETWEEN 0 AND 100);

-- ── 2. messages TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sender      text        NOT NULL DEFAULT 'Sistema',
    subject     text        NOT NULL DEFAULT '',
    body        text        NOT NULL DEFAULT '',
    is_read     boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company reads own messages" ON public.messages;
CREATE POLICY "Company reads own messages" ON public.messages
    FOR SELECT USING (company_id = public._my_company_id());

-- ── 3. dispatch_board TABLE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dispatch_board (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    start_city  text        NOT NULL,
    end_city    text        NOT NULL,
    reward      integer     NOT NULL DEFAULT 0,
    req_tier    text        NOT NULL DEFAULT 'standard'
        CHECK (req_tier IN ('standard','business','vip','ultra')),
    expires_at  timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_board ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company reads own dispatch" ON public.dispatch_board;
CREATE POLICY "Company reads own dispatch" ON public.dispatch_board
    FOR SELECT USING (company_id = public._my_company_id());

-- ── 4. RPC: Advance time of day (called by game loop) ────────────
CREATE OR REPLACE FUNCTION public.rpc_advance_time(
    p_new_time_of_day text,
    p_new_day         integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_company    companies%ROWTYPE;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    IF p_new_time_of_day NOT IN ('morning','afternoon','evening','night') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid time_of_day');
    END IF;

    UPDATE companies
    SET
        time_of_day = p_new_time_of_day,
        current_day = COALESCE(p_new_day, current_day)
    WHERE id = v_company_id
    RETURNING * INTO v_company;

    RETURN jsonb_build_object(
        'ok',          true,
        'time_of_day', v_company.time_of_day,
        'current_day', v_company.current_day
    );
END;
$$;

-- ── 5. RPC: Update weather ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_update_weather(
    p_weather text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    IF p_weather NOT IN ('sereno','nuvoloso','pioggia','temporale','neve','nebbia') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid weather');
    END IF;

    UPDATE companies SET weather = p_weather WHERE id = v_company_id;

    RETURN jsonb_build_object('ok', true, 'weather', p_weather);
END;
$$;

-- ── 6. RPC: Mark message as read ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_read_message(
    p_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_updated    integer;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    UPDATE messages
    SET is_read = true
    WHERE id = p_message_id AND company_id = v_company_id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'message not found');
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 7. RPC: Dismiss dispatch offer ───────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_dismiss_dispatch(
    p_dispatch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_deleted    integer;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    DELETE FROM dispatch_board
    WHERE id = p_dispatch_id AND company_id = v_company_id;

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    IF v_deleted = 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'dispatch not found or already expired');
    END IF;

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 8. RPC: Generate dispatch offer (called server-side or by game) ─
CREATE OR REPLACE FUNCTION public.rpc_generate_dispatch(
    p_start_city text,
    p_end_city   text,
    p_reward     integer,
    p_req_tier   text DEFAULT 'standard',
    p_ttl_hours  integer DEFAULT 2
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_new_id     uuid;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    -- Remove expired offers for this company first
    DELETE FROM dispatch_board
    WHERE company_id = v_company_id AND expires_at < now();

    INSERT INTO dispatch_board (company_id, start_city, end_city, reward, req_tier, expires_at)
    VALUES (v_company_id, p_start_city, p_end_city, p_reward, p_req_tier,
            now() + (p_ttl_hours || ' hours')::interval)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('ok', true, 'id', v_new_id);
END;
$$;

-- ── 9. RPC: Save simulation blob (replaces direct game_saves write) ─
-- Client calls this instead of writing to game_saves directly.
-- Enforces user_id from auth.uid() — client cannot forge it.
CREATE OR REPLACE FUNCTION public.rpc_save_game_state(
    p_slot_index integer,
    p_game_state jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id uuid := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    IF p_slot_index NOT IN (0, 1, 2) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid slot index');
    END IF;

    INSERT INTO game_saves (user_id, slot_index, game_state, updated_at)
    VALUES (v_user_id, p_slot_index, p_game_state, now())
    ON CONFLICT (user_id, slot_index)
    DO UPDATE SET game_state = EXCLUDED.game_state, updated_at = now();

    RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Grant execute on new RPCs ─────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.rpc_advance_time(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_weather(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_read_message(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_dismiss_dispatch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_generate_dispatch(text, text, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_save_game_state(integer, jsonb) TO authenticated;
