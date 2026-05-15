-- ============================================================
-- 25_real_world_status.sql — Chauffeur Empire
-- Espansione 8: Meteo e Traffico Reale (OpenWeatherMap)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.real_world_status (
    province_id     TEXT    PRIMARY KEY,
    game_weather    TEXT    NOT NULL DEFAULT 'sole',   -- sole | pioggia | neve
    traffic_mult    NUMERIC NOT NULL DEFAULT 1.0,
    temp_celsius    INT     DEFAULT NULL,
    humidity        INT     DEFAULT NULL,
    wind_kmh        INT     DEFAULT NULL,
    owm_description TEXT    DEFAULT NULL,
    owm_icon        TEXT    DEFAULT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.real_world_status ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "real_world_public_read"
      ON public.real_world_status FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed iniziale (weather di default finché edge function non parte)
INSERT INTO public.real_world_status (province_id, game_weather, traffic_mult)
VALUES
    ('prov_roma',    'sole',    1.0),
    ('prov_milano',  'sole',    1.0),
    ('prov_napoli',  'sole',    1.0),
    ('prov_venezia', 'sole',    1.0),
    ('prov_torino',  'sole',    1.0),
    ('prov_amalfi',  'sole',    1.0)
ON CONFLICT DO NOTHING;

-- RPC: dati meteo per la regione corrente del player (o globale)
CREATE OR REPLACE FUNCTION public.rpc_get_real_weather(v_province_id TEXT DEFAULT NULL)
RETURNS TABLE (
    province_id     TEXT,
    game_weather    TEXT,
    traffic_mult    NUMERIC,
    temp_celsius    INT,
    humidity        INT,
    wind_kmh        INT,
    owm_description TEXT,
    owm_icon        TEXT,
    updated_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT province_id, game_weather, traffic_mult, temp_celsius, humidity, wind_kmh, owm_description, owm_icon, updated_at
    FROM public.real_world_status
    WHERE (v_province_id IS NULL OR province_id = v_province_id)
    ORDER BY province_id;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_real_weather(TEXT) TO authenticated;
