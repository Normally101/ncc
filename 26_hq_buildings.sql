-- ============================================================
-- 26_hq_buildings.sql — Chauffeur Empire
-- Espansione 6: Base Building HQ (diorama + stanze)
-- ============================================================
-- Nota: lo stato delle stanze è memorizzato in gameState.hqRooms (JSONB blob)
-- Questo file aggiunge solo metadati server-side per la leaderboard HQ.

CREATE TABLE IF NOT EXISTS public.hq_status (
    user_id       UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    rooms_built   INT     DEFAULT 0,
    hq_score      INT     DEFAULT 0,
    hq_name       TEXT    DEFAULT NULL,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.hq_status ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "hq_status_own"
      ON public.hq_status FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "hq_status_public_read"
      ON public.hq_status FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- RPC: Aggiorna status HQ dopo una costruzione
CREATE OR REPLACE FUNCTION public.rpc_update_hq_status(
    v_rooms_built INT,
    v_hq_score    INT,
    v_hq_name     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.hq_status (user_id, rooms_built, hq_score, hq_name, updated_at)
    VALUES (auth.uid(), v_rooms_built, v_hq_score, v_hq_name, NOW())
    ON CONFLICT (user_id) DO UPDATE
    SET rooms_built = EXCLUDED.rooms_built,
        hq_score    = EXCLUDED.hq_score,
        hq_name     = COALESCE(EXCLUDED.hq_name, hq_status.hq_name),
        updated_at  = NOW();
END;
$$;

-- RPC: Top HQ per leaderboard
CREATE OR REPLACE FUNCTION public.rpc_get_hq_leaderboard()
RETURNS TABLE (
    user_id     UUID,
    company_name TEXT,
    rooms_built INT,
    hq_score    INT,
    hq_name     TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT h.user_id, c.name AS company_name, h.rooms_built, h.hq_score, h.hq_name
    FROM public.hq_status h
    JOIN public.companies c ON c.user_id = h.user_id
    WHERE h.rooms_built > 0
    ORDER BY h.hq_score DESC
    LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_update_hq_status(INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_hq_leaderboard()             TO authenticated;
