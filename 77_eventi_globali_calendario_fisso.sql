-- ============================================================================
-- 77 — Gli eventi globali tornano, ma con un calendario vero
--
-- DOMANDE-PER-VLAD.md §4, risposta 31/08/2026: "date fisse ricorrenti".
--
-- Il seed di 21_global_events.sql non è mai stato applicato: le sue otto date
-- erano scritte come «fra N giorni» dal momento in cui il file viene lanciato,
-- quindi applicarlo oggi avrebbe messo il Natale a fine settembre. Qui si
-- sostituisce con un calendario vero (mese/giorno reali, si ripete ogni anno)
-- e un generatore che tiene sempre in tavola l'occorrenza corrente o
-- prossima di ciascun evento — lo stesso principio già in uso per i bandi
-- turistici (_process_tourism_tenders) e per gli affitti (71_permessi_e_
-- affitti.sql: "frequente + idempotente batte puntuale + fragile").
--
-- Effetti (tipMult, xpMult, extraRidePct, ecc.) INVARIATI dal seed originale:
-- qui cambia solo QUANDO cadono, non COSA fanno.
-- ============================================================================

-- ── 1. Il calendario: un template per evento, mese/giorno reali ─────────────
CREATE TABLE IF NOT EXISTS public.global_events_calendar (
    id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE,
    icon        TEXT    DEFAULT '🌍',
    description TEXT,
    event_type  TEXT    DEFAULT 'seasonal',
    season      TEXT    DEFAULT NULL,
    province_id TEXT    DEFAULT NULL,
    effects     JSONB   NOT NULL DEFAULT '{}',
    start_month SMALLINT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
    start_day   SMALLINT NOT NULL CHECK (start_day   BETWEEN 1 AND 31),
    end_month   SMALLINT NOT NULL CHECK (end_month   BETWEEN 1 AND 12),
    end_day     SMALLINT NOT NULL CHECK (end_day     BETWEEN 1 AND 31),
    active      BOOLEAN NOT NULL DEFAULT true
);

-- ── 2. L'occorrenza generata sa da quale template viene e per quale anno ────
ALTER TABLE public.global_events
    ADD COLUMN IF NOT EXISTS calendar_id     UUID REFERENCES public.global_events_calendar(id),
    ADD COLUMN IF NOT EXISTS occurrence_year INT;

-- Una sola occorrenza per template+anno. Parziale: le righe storiche (o future
-- ad-hoc) con calendar_id NULL restano fuori, come da seed originale che non
-- aveva mai un vincolo reale (ON CONFLICT DO NOTHING senza indice = inerte).
CREATE UNIQUE INDEX IF NOT EXISTS global_events_calendar_occurrence_uniq
    ON public.global_events (calendar_id, occurrence_year)
    WHERE calendar_id IS NOT NULL;

-- ── 3. Seed del calendario: date reali, sparse nell'anno ─────────────────────
-- Fashion Week e GP Monza hanno una data reale nota; G7 ed Europei di Calcio
-- non hanno una data fissa nel mondo reale (il G7 gira paese, gli Europei sono
-- quadriennali) — qui restano flavor annuale con una finestra plausibile.
-- Allerta Meteo e Boom Economico non sono eventi di calendario per natura: gli
-- si assegna comunque una finestra ricorrente (rispettivamente stagione delle
-- piogge autunnali e stagione delle trimestrali) invece di lasciarli fuori,
-- così anche loro tornano a esistere invece di restare congelati per sempre.
INSERT INTO public.global_events_calendar
    (name, icon, description, event_type, season, effects, start_month, start_day, end_month, end_day)
VALUES
    ('🌸 Settimana della Moda Milano', '👗',
     'La Fashion Week porta migliaia di VIP in Italia. Domanda di luxury transport alle stelle.',
     'special', 'spring', '{"tipMult":1.40,"xpMult":1.20,"extraRidePct":0.35}',
     2, 21, 2, 28),

    ('📈 Boom Economico', '💹',
     'Il PIL italiano supera le aspettative: le aziende aumentano i budget trasferte.',
     'boom', NULL, '{"tipMult":1.20,"xpMult":1.10,"extraRidePct":0.25,"maintenanceCostMult":0.90}',
     4, 25, 5, 9),

    ('🏛️ Vertice G7 Roma', '🤝',
     'Leader mondiali a Roma: zone rosse, scorte presidenziali richieste ovunque.',
     'special', 'spring', '{"tipMult":1.60,"xpMult":1.40,"extraRidePct":0.20,"province_filter":"prov_roma"}',
     6, 5, 6, 8),

    ('⚽ Europei di Calcio', '🏟️',
     'Italia in semifinale: migliaia di tifosi VIP si spostano tra le città.',
     'special', 'summer', '{"tipMult":1.30,"xpMult":1.20,"extraRidePct":0.60,"speedMult":0.90}',
     6, 20, 6, 27),

    ('⛱️ Ferragosto', '🌞',
     'Esodo estivo: traffico record, code autostradali, domanda alle stelle ma carburante +20%.',
     'seasonal', 'summer', '{"tipMult":1.25,"extraRidePct":0.40,"fuelMult":1.20,"speedMult":0.85}',
     8, 13, 8, 20),

    ('🏎️ Gran Premio di Monza', '🏁',
     'Formula 1 a Monza: trasporti VIP e hospitality su tutta la Lombardia.',
     'special', 'summer', '{"tipMult":1.50,"xpMult":1.30,"extraRidePct":0.50,"province_filter":"prov_milano"}',
     9, 1, 9, 4),

    ('🌧️ Allerta Meteo Nazionale', '⛈️',
     'Maltempo su tutta Italia: corse più rischiose, veicoli si consumano più velocemente.',
     'crisis', NULL, '{"tipMult":1.10,"wearMult":1.30,"fuelMult":1.15,"xpMult":0.90}',
     11, 5, 11, 7),

    ('🎄 Natale & Capodanno', '🎁',
     'Le feste portano corse notturne, aeroporti congestionati e clienti generosi.',
     'seasonal', 'winter', '{"tipMult":1.35,"xpMult":1.15,"extraRidePct":0.30,"forceAirport":true}',
     12, 20, 1, 6)
ON CONFLICT (name) DO NOTHING;

-- ── 4. Il generatore: garantisce che l'occorrenza corrente/prossima esista ──
CREATE OR REPLACE FUNCTION public.rpc_seed_upcoming_global_events()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_tpl        public.global_events_calendar%ROWTYPE;
    v_year       INT;
    v_start      TIMESTAMPTZ;
    v_end        TIMESTAMPTZ;
    v_end_year   INT;
    v_inserted   INT := 0;
BEGIN
    FOR v_tpl IN SELECT * FROM public.global_events_calendar WHERE active LOOP
        -- Prova l'anno scorso, quest'anno, il prossimo: prende la prima
        -- occorrenza che non è ancora finita. L'anno scorso serve per un
        -- evento a cavallo di Capodanno (dic→gen) quando oggi siamo a gennaio.
        FOR v_year IN (extract(year FROM now())::int - 1) .. (extract(year FROM now())::int + 1) LOOP
            v_end_year := v_year + (CASE WHEN v_tpl.end_month < v_tpl.start_month THEN 1 ELSE 0 END);
            v_start := make_timestamptz(v_year,     v_tpl.start_month, v_tpl.start_day, 0,  0,  0, 'Europe/Rome');
            v_end   := make_timestamptz(v_end_year, v_tpl.end_month,   v_tpl.end_day,   23, 59, 59, 'Europe/Rome');

            IF v_end > now() THEN
                INSERT INTO public.global_events
                    (name, icon, description, event_type, season, province_id, effects,
                     starts_at, ends_at, status, calendar_id, occurrence_year)
                VALUES
                    (v_tpl.name, v_tpl.icon, v_tpl.description, v_tpl.event_type, v_tpl.season,
                     v_tpl.province_id, v_tpl.effects, v_start, v_end,
                     CASE WHEN v_start <= now() THEN 'active' ELSE 'upcoming' END,
                     v_tpl.id, v_year)
                ON CONFLICT (calendar_id, occurrence_year) WHERE calendar_id IS NOT NULL DO NOTHING;
                IF FOUND THEN v_inserted := v_inserted + 1; END IF;
                EXIT; -- trovata l'occorrenza giusta per questo template, si passa al prossimo
            END IF;
        END LOOP;
    END LOOP;
    RETURN v_inserted;
END;
$$;

-- Solo il cron (gira come postgres) e service_role: una funzione nuova nasce
-- eseguibile da PUBLIC per default (lezione di 71_permessi_e_affitti.sql), va
-- tolto esplicitamente.
REVOKE EXECUTE ON FUNCTION public.rpc_seed_upcoming_global_events() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.rpc_seed_upcoming_global_events() TO service_role;

-- ── 5. La sveglia: una volta al giorno basta, la funzione è idempotente ─────
SELECT cron.schedule(
    'eventi-globali-calendario',
    '40 3 * * *',
    $$SELECT public.rpc_seed_upcoming_global_events();$$
);

-- Primo popolamento, non aspettare le 3:40 di domani.
SELECT public.rpc_seed_upcoming_global_events();

-- ── Verifica ────────────────────────────────────────────────────────────────
SELECT name, status, starts_at, ends_at FROM public.global_events ORDER BY starts_at;
