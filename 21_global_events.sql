-- ============================================================
-- 21_global_events.sql — Chauffeur Empire
-- Espansione 4: Mega-Eventi Globali Stagionali
-- ============================================================

CREATE TABLE IF NOT EXISTS public.global_events (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT    NOT NULL,
    icon        TEXT    DEFAULT '🌍',
    description TEXT,
    event_type  TEXT    DEFAULT 'seasonal',  -- seasonal | crisis | boom | special
    season      TEXT    DEFAULT NULL,         -- spring | summer | autumn | winter
    province_id TEXT    DEFAULT NULL,         -- NULL = all Italy
    effects     JSONB   NOT NULL DEFAULT '{}',
    -- effects schema: { tipMult, xpMult, fuelMult, wearMult, extraRidePct, priceFloor,
    --                   forceAirport, speedMult, maintenanceCostMult }
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    status      TEXT    DEFAULT 'upcoming',   -- upcoming | active | ended
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_global_events_status ON public.global_events(status);
CREATE INDEX IF NOT EXISTS idx_global_events_ends   ON public.global_events(ends_at);

ALTER TABLE public.global_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "global_events_public_read"
      ON public.global_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── SEED: eventi stagionali ───────────────────────────────────────────────────

INSERT INTO public.global_events (name, icon, description, event_type, season, effects, starts_at, ends_at, status)
VALUES
    ('🌸 Settimana della Moda Milano',
     '👗',
     'La Fashion Week porta migliaia di VIP in Italia. Domanda di luxury transport alle stelle.',
     'special', 'spring',
     '{"tipMult":1.40,"xpMult":1.20,"extraRidePct":0.35}',
     NOW() + INTERVAL '1 day',
     NOW() + INTERVAL '8 days',
     'upcoming'),

    ('🏎️ Gran Premio di Monza',
     '🏁',
     'Formula 1 a Monza: trasporti VIP e hospitality su tutta la Lombardia.',
     'special', 'summer',
     '{"tipMult":1.50,"xpMult":1.30,"extraRidePct":0.50,"province_filter":"prov_milano"}',
     NOW() + INTERVAL '15 days',
     NOW() + INTERVAL '18 days',
     'upcoming'),

    ('⛱️ Ferragosto',
     '🌞',
     'Esodo estivo: traffico record, code autostradali, domanda alle stelle ma carburante +20%.',
     'seasonal', 'summer',
     '{"tipMult":1.25,"extraRidePct":0.40,"fuelMult":1.20,"speedMult":0.85}',
     NOW() + INTERVAL '3 days',
     NOW() + INTERVAL '10 days',
     'upcoming'),

    ('🎄 Natale & Capodanno',
     '🎁',
     'Le feste portano corse notturne, aeroporti congestionati e clienti generosi.',
     'seasonal', 'winter',
     '{"tipMult":1.35,"xpMult":1.15,"extraRidePct":0.30,"forceAirport":true}',
     NOW() + INTERVAL '30 days',
     NOW() + INTERVAL '44 days',
     'upcoming'),

    ('🌧️ Allerta Meteo Nazionale',
     '⛈️',
     'Maltempo su tutta Italia: corse più rischiose, veicoli si consumano più velocemente.',
     'crisis', NULL,
     '{"tipMult":1.10,"wearMult":1.30,"fuelMult":1.15,"xpMult":0.90}',
     NOW() + INTERVAL '45 days',
     NOW() + INTERVAL '47 days',
     'upcoming'),

    ('🏛️ Vertice G7 Roma',
     '🤝',
     'Leader mondiali a Roma: zone rosse, scorte presidenziali richieste ovunque.',
     'special', 'spring',
     '{"tipMult":1.60,"xpMult":1.40,"extraRidePct":0.20,"province_filter":"prov_roma"}',
     NOW() + INTERVAL '60 days',
     NOW() + INTERVAL '63 days',
     'upcoming'),

    ('📈 Boom Economico',
     '💹',
     'Il PIL italiano supera le aspettative: le aziende aumentano i budget trasferte.',
     'boom', NULL,
     '{"tipMult":1.20,"xpMult":1.10,"extraRidePct":0.25,"maintenanceCostMult":0.90}',
     NOW() + INTERVAL '70 days',
     NOW() + INTERVAL '84 days',
     'upcoming'),

    ('⚽ Europei di Calcio',
     '🏟️',
     'Italia in semifinale: migliaia di tifosi VIP si spostano tra le città.',
     'special', 'summer',
     '{"tipMult":1.30,"xpMult":1.20,"extraRidePct":0.60,"speedMult":0.90}',
     NOW() + INTERVAL '90 days',
     NOW() + INTERVAL '97 days',
     'upcoming')
ON CONFLICT DO NOTHING;

-- ── RPC: evento globale attivo ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_get_active_global_events()
RETURNS SETOF public.global_events
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT * FROM public.global_events
    WHERE status IN ('active', 'upcoming')
      AND starts_at <= NOW() + INTERVAL '24 hours'
      AND ends_at > NOW()
    ORDER BY starts_at ASC
    LIMIT 3;
$$;

-- Funzione per aggiornare automaticamente lo status (chiamata da cron o Edge Function)
CREATE OR REPLACE FUNCTION public.rpc_sync_global_event_status()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Attiva eventi il cui starts_at è passato
    UPDATE public.global_events
    SET status = 'active'
    WHERE status = 'upcoming' AND starts_at <= NOW() AND ends_at > NOW();

    -- Chiude eventi terminati
    UPDATE public.global_events
    SET status = 'ended'
    WHERE status = 'active' AND ends_at <= NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_active_global_events()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_sync_global_event_status()   TO authenticated;
