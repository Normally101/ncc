-- ============================================================================
-- 60_fix_realtime_publication.sql
-- Ripara la sincronizzazione Realtime server -> client.
--
-- SINTOMO (riprodotto giocando, 15/08/2026): ogni modifica lato server a
-- companies.cash non arrivava MAI al client. Comprando un veicolo il server
-- addebitava correttamente 35.000 EUR ma il giocatore continuava a vedere il
-- saldo vecchio; lo stesso per veicoli, viaggi attivi, immobili e prezzo
-- carburante. Il canale si dichiarava regolarmente "joined"/"SUBSCRIBED".
--
-- CAUSA (isolata con un test A/B in browser):
--   canale con il solo binding su `companies`            -> riceve gli eventi
--   stesso canale + binding su `drivers`                 -> non riceve NULLA
-- `drivers` non era nella publication `supabase_realtime`. In Supabase Realtime
-- un singolo binding postgres_changes non valido invalida TUTTI gli altri
-- binding dello stesso canale, senza alcun errore: il canale resta SUBSCRIBED
-- e muto. serverState.js registra 7 binding su un unico canale
-- (`ce_game_events`: companies, vehicles, drivers, active_trips, provinces,
-- company_real_estate, fuel_market), quindi il solo `drivers` mancante
-- disattivava l'intera sincronizzazione di stato del gioco.
--
-- CONSEGUENZA ECONOMICA: `rpc_sync_cash` fa un SET assoluto. Se il client non
-- viene mai informato degli addebiti fatti dal server, il successivo syncCash
-- riscrive il valore locale (piu' alto) e annulla l'addebito.
--
-- FIX: aggiungere alla publication tutte le tabelle a cui il client si
-- sottoscrive davvero (elenco ricavato dai `table: '...'` in *.js e diffato
-- con pg_publication_tables). Nessun DDL distruttivo: solo ADD TABLE.
-- ============================================================================

DO $$
DECLARE
    t text;
    mancanti text[] := ARRAY[
        'drivers',            -- ce_game_events: era questa a rompere tutto il canale
        'market_listings',    -- p2p-market.js  : mercato auto P2P
        'company_shares',     -- p2p-market.js  : azioni / IPO
        'holding_members',    -- p2p-market.js  : holding
        'consorzio_members',  -- p2p-market.js  : consorzi
        'judicial_auctions',  -- auctions.js    : aste giudiziarie
        'crypto_market',      -- crypto.js      : prezzi crypto
        'global_events',      -- global_events.js
        'real_world_status'   -- weather_real.js: meteo
    ];
BEGIN
    FOREACH t IN ARRAY mancanti LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
            RAISE NOTICE 'aggiunta alla publication: %', t;
        END IF;
    END LOOP;
END $$;

-- Verifica: nessuna riga in output = tutte le tabelle sottoscritte sono coperte.
SELECT t AS tabella_ancora_mancante
FROM unnest(ARRAY[
    'companies','vehicles','drivers','active_trips','provinces','company_real_estate',
    'fuel_market','market_listings','company_shares','holding_members','consorzio_members',
    'alliance_chat','judicial_auctions','crypto_market','global_events','global_news',
    'real_world_status'
]) AS t
WHERE NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
);
