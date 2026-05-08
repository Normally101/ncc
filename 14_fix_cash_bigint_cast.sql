-- Fix: cash stored as float in game_state JSON breaks ::bigint cast in Supabase RPCs.
-- Both _get_player_cash and _add_player_cash now use FLOOR(…::numeric)::bigint
-- to safely handle values like 788825.4333...

CREATE OR REPLACE FUNCTION public._get_player_cash(v_user_id uuid)
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
    v_cash bigint;
BEGIN
    SELECT COALESCE(FLOOR((game_state->>'cash')::numeric)::bigint, 0)
    INTO v_cash
    FROM public.game_saves
    WHERE user_id = v_user_id AND slot_index = 0;
    RETURN COALESCE(v_cash, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public._add_player_cash(v_user_id uuid, v_delta bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_new_cash bigint;
BEGIN
    UPDATE public.game_saves
    SET game_state = jsonb_set(
            game_state,
            '{cash}',
            (GREATEST(0, COALESCE(FLOOR((game_state->>'cash')::numeric)::bigint, 0) + v_delta))::text::jsonb
        ),
        updated_at = now()
    WHERE user_id = v_user_id AND slot_index = 0
    RETURNING FLOOR((game_state->>'cash')::numeric)::bigint INTO v_new_cash;

    IF NOT FOUND THEN
        RAISE EXCEPTION '_add_player_cash: nessun save slot_index=0 per user %', v_user_id;
    END IF;
    RETURN v_new_cash;
END;
$$;

GRANT EXECUTE ON FUNCTION public._get_player_cash(uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public._add_player_cash(uuid, bigint) TO authenticated;
