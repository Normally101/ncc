-- ============================================================================
-- 61_fix_vtk_orders_provinces_pacing.sql
-- 2 fix trovati durante il playtest di ritmo/flusso del 16-17 agosto 2026.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- FIX 1 — CRITICAL: rpc_get_vtk_market_orders chiamata dal client
-- (vtk-market.js:94-95) ma MAI definita in nessun file .sql del repo — 404
-- PGRST202 verificato dal vivo. L'errore è ingoiato (`if (!error && data)`),
-- quindi il mercato VTK sembra semplicemente "senza venditori" mentre in
-- realtà è rotto per chiunque, sempre.
-- Colonne di ritorno allineate a quelle lette dal client (vtk-market.js:271,
-- 357-361: o.id, o.seller_id, o.vtk_amount, o.dc_price). Stesso stile delle
-- RPC sorelle in questo file (SECURITY DEFINER, richiede auth.uid()).
-- Ordinati per prezzo crescente: la vista di mercato più naturale.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.rpc_get_vtk_market_orders()
RETURNS TABLE (
    id          UUID,
    seller_id   UUID,
    vtk_amount  BIGINT,
    dc_price    NUMERIC,
    created_at  TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'rpc_get_vtk_market_orders: utente non autenticato';
    END IF;

    RETURN QUERY
    SELECT o.id, o.seller_id, o.vtk_amount, o.dc_price, o.created_at
    FROM public.vtk_market_orders o
    WHERE o.filled_at IS NULL AND o.cancelled_at IS NULL
    ORDER BY o.dc_price ASC, o.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_vtk_market_orders() TO authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- FIX 2 — 18 province mancanti su 23 (stesso pattern "seed mai applicato" già
-- visto 2 giorni fa sugli altri 9 cataloghi). Verificato: 16_territory_war.sql
-- ha ALTER TABLE (colonne mapped_pois/required_influence, già presenti sul
-- DB) + 5 UPDATE sulle province esistenti + 18 INSERT di nuove province —
-- solo gli UPDATE e gli INSERT non erano mai stati eseguiti. Effetto:
-- rpc_add_province_influence falliva ("Provincia non trovata: prov_civita")
-- per ogni corsa verso una delle 18 città non seedate, silenziosamente.
-- Righe copiate verbatim da 16_territory_war.sql:78-119, idempotenti.
-- ════════════════════════════════════════════════════════════════════════════
UPDATE public.provinces SET mapped_pois = ARRAY['roma', 'roma_fco', 'roma_hassler'], required_influence = 500 WHERE id = 'prov_roma';
UPDATE public.provinces SET mapped_pois = ARRAY['milano', 'mil_mxp', 'mil_lin', 'mil_armani'], required_influence = 800 WHERE id = 'prov_milano';
UPDATE public.provinces SET mapped_pois = ARRAY['firenze'], required_influence = 400 WHERE id = 'prov_firenze';
UPDATE public.provinces SET mapped_pois = ARRAY['napoli', 'nap_capo'], required_influence = 350 WHERE id = 'prov_napoli';
UPDATE public.provinces SET mapped_pois = ARRAY['venezia', 'ven_mp'], required_influence = 450 WHERE id = 'prov_venezia';

INSERT INTO public.provinces (id, name, region_id, base_price, current_value, transit_tax_pct, mapped_pois, required_influence) VALUES
    ('prov_civita',   'Civitavecchia e Litorale',  'lazio',       220000, 220000, 0.020, ARRAY['civitavecchia'],            250),
    ('prov_como',     'Laghi Lombardi',             'lombardia',   350000, 350000, 0.022, ARRAY['como'],                     350),
    ('prov_amalfi',   'Costiera Amalfitana',        'campania',    300000, 300000, 0.025, ARRAY['sorrento','amalfi'],         300),
    ('prov_cortina',  'Dolomiti Venete',            'veneto',      280000, 280000, 0.022, ARRAY['cortina'],                  280),
    ('prov_padova',   'Padova e Marco Polo',        'veneto',      240000, 240000, 0.020, ARRAY['ven_mp'],                   240),
    ('prov_bari',     'Puglia Adriatica',           'puglia',      320000, 320000, 0.022, ARRAY['bari','brindisi','lecce'],  320),
    ('prov_egnazia',  'Puglia Luxury',              'puglia',      400000, 400000, 0.030, ARRAY['borgo_egnazia'],            400),
    ('prov_palermo',  'Sicilia Occidentale',        'sicilia',     300000, 300000, 0.022, ARRAY['palermo','catania'],        300),
    ('prov_taormina', 'Sicilia Orientale',          'sicilia',     350000, 350000, 0.025, ARRAY['taormina'],                 350),
    ('prov_cagliari', 'Sardegna Meridionale',       'sardegna',    350000, 350000, 0.022, ARRAY['cagliari','olbia'],        350),
    ('prov_cervo',    'Costa Smeralda',             'sardegna',    600000, 600000, 0.035, ARRAY['porto_cervo'],              600),
    ('prov_genova',   'Liguria',                    'liguria',     380000, 380000, 0.025, ARRAY['genova','portofino','splendido'], 380),
    ('prov_bologna',  'Emilia-Romagna',             'emilia',      300000, 300000, 0.020, ARRAY['bologna'],                  300),
    ('prov_torino',   'Piemonte',                   'piemonte',    280000, 280000, 0.020, ARRAY['torino'],                   280),
    ('prov_trieste',  'Friuli',                     'friuli',      260000, 260000, 0.020, ARRAY['trieste'],                  260),
    ('prov_trento',   'Trentino',                   'trentino',    250000, 250000, 0.020, ARRAY['trento'],                   250),
    ('prov_perugia',  'Umbria e Marche',            'umbria',      240000, 240000, 0.020, ARRAY['perugia','ancona'],        240),
    ('prov_aosta',    'Valle d''Aosta',             'valle_aosta', 220000, 220000, 0.020, ARRAY['aosta'],                    220)
ON CONFLICT (id) DO NOTHING;
