-- ============================================================================
-- 65_rpc_dc_store_server_authoritative_scaffold.sql
-- Negozio Driver Coins: pagamento server-authoritative (fondamenta economia).
--
-- ⚠️ SCAFFOLD — NON applicato al DB di produzione da questa sessione.
--    Lo applica Vlad (come da protocollo: nessuna chiave di produzione qui).
--    Può essere applicato IN QUALSIASI momento, anche prima del deploy JS:
--    il client rileva l'assenza della funzione e resta sulla vecchia via.
--
-- PERCHÉ SERVE
--   Oggi il negozio DC chiama CE_money.spendDC(cost, motivo): il BROWSER
--   calcola il prezzo, scala il saldo locale e manda al server «il totale
--   deciso dal browser», che lo scrive senza discutere (rpc_add_driver_coins /
--   spendDriverCoins ricevono l'importo come parametro). Chi apre i devtools
--   dichiara il saldo che vuole. La forma giusta è quella di
--   46_vtk_shop_purchase_scaffold.sql (rpc_spend_vtk_shop_item):
--   il browser dice COSA vuol comprare, il server legge il prezzo dalla SUA
--   tabella, controlla i fondi, scala lui e RESTITUISCE il saldo nuovo.
--
-- FORMA DELLA RPC (uguale per tutti i prossimi sistemi da convertire)
--   1. input  = identificativo dell'oggetto (+ quantità, MAI un prezzo);
--   2. prezzo letto da dc_shop_catalog, tabella del server;
--   3. lock FOR UPDATE sulla riga companies PRIMA di leggere il saldo;
--   4. fondi insufficienti → rifiuto leggibile, nessuna scrittura;
--   5. scala e RESTITUISCE il saldo nuovo: il client si allinea, non calcola.
-- ============================================================================

-- ── Catalogo prezzi AUTORITATIVO ────────────────────────────────────────────
-- Vive QUI, non nel client: un prezzo passato dal browser non sarebbe
-- attendibile. Se si aggiunge un item al negozio (engine-store.js) va aggiunta
-- anche la riga qui sotto, altrimenti il server lo rifiuta — fail-safe voluto:
-- meglio non vendibile che gratis.
--   unit_cost = prezzo per unità; min_cost = minimo totale addebitabile
--   (serve ai booster «tutti»: es. sveglia-tutti costa max(3, n×2) DC).
CREATE TABLE IF NOT EXISTS public.dc_shop_catalog (
    item_id     text PRIMARY KEY,
    label       text NOT NULL,
    unit_cost   integer NOT NULL CHECK (unit_cost >= 0),
    min_cost    integer NOT NULL DEFAULT 0 CHECK (min_cost >= 0),
    active      boolean NOT NULL DEFAULT true
);

-- Nessuna policy: la tabella si legge SOLO dentro la SECURITY DEFINER qui sotto.
ALTER TABLE public.dc_shop_catalog ENABLE ROW LEVEL SECURITY;

INSERT INTO public.dc_shop_catalog (item_id, label, unit_cost, min_cost) VALUES
    ('executive_pass',        'Executive Pass (30 giorni)',            150,   0),
    ('skip_construction',     'Completa subito una costruzione',         8,   0),
    ('fuel_boost',            'Flotta rifornita al 100%',                3,   0),
    ('wake_driver',           'Sveglia un autista',                      3,   0),
    ('energy_boost',          'Energia CEO al 100%',                     4,   0),
    ('insta_heal',            'Stress azzerato di un autista',           2,   0),
    ('wake_all_drivers',      'Sveglia tutti gli autisti',               2,   3),
    ('heal_all_drivers',      'Guarisci tutto lo staff',                 2,   4),
    ('skip_all_academy',      'Completa tutti i corsi accademia',        5,   0),
    ('skip_all_constructions','Completa tutte le costruzioni',           8,   0),
    ('ops_bundle',            'Pacchetto Operativo',                     9,   0),
    ('full_bundle',           'Pacchetto Imperiale',                    35,   0)
ON CONFLICT (item_id) DO NOTHING;

-- ── La RPC generica di acquisto ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_dc_purchase(
    p_item_id   text,
    p_quantity  integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company_id uuid;
    v_unit_cost  integer;
    v_min_cost   integer;
    v_qty        integer;
    v_total      integer;
    v_balance    integer;
BEGIN
    v_company_id := public._my_company_id();
    IF v_company_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'not authenticated');
    END IF;

    -- Quantità: intero >= 1, con tetto. NON è un prezzo: il totale lo calcola
    -- solo il server moltiplicando il PREZZO DELLA TABELLA.
    v_qty := COALESCE(p_quantity, 1);
    IF v_qty < 1 OR v_qty > 1000 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'quantità non valida');
    END IF;

    -- Prezzo DAL SERVER, mai da un parametro.
    SELECT unit_cost, min_cost INTO v_unit_cost, v_min_cost
      FROM public.dc_shop_catalog
     WHERE item_id = p_item_id
       AND active;

    IF v_unit_cost IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'oggetto sconosciuto: ' || p_item_id);
    END IF;

    v_total := GREATEST(v_min_cost, v_unit_cost * v_qty);

    -- Throttle difensivo: stesso helper condiviso di 38_security_hardening.sql.
    BEGIN
        PERFORM public._ce_rate_limit('dc_shop_purchase', 60, interval '1 minute');
    EXCEPTION WHEN undefined_function THEN
        NULL; -- helper non ancora deployato: la RPC resta valida senza throttle
    END;

    -- FOR UPDATE: due richieste concorrenti devono leggere il saldo DOPO che
    -- la prima ha scritto, altrimenti spendono due volte gli stessi soldi.
    SELECT driver_coins INTO v_balance
      FROM public.companies
     WHERE id = v_company_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'azienda non trovata');
    END IF;

    IF COALESCE(v_balance, 0) < v_total THEN
        RETURN jsonb_build_object(
            'ok',    false,
            'error', 'Driver Coins insufficienti: hai ' || COALESCE(v_balance, 0) ||
                     ', servono ' || v_total
        );
    END IF;

    -- Il server scala LUI e restituisce il saldo nuovo: è questo valore,
    -- non quello calcolato dal browser, che diventa la verità del client.
    UPDATE public.companies
       SET driver_coins = driver_coins - v_total
     WHERE id = v_company_id
    RETURNING driver_coins INTO v_balance;

    RETURN jsonb_build_object(
        'ok',           true,
        'item_id',      p_item_id,
        'quantity',     v_qty,
        'cost',         v_total,
        'driver_coins', v_balance
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_dc_purchase(text, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.rpc_dc_purchase(text, integer) FROM anon, public;

-- Come nel modello VTK: l'EFFETTO dell'oggetto resta client-side perché vive
-- nel blob di salvataggio; qui diventa autoritativo il PAGAMENTO, che è la
-- parte sfruttabile su un mercato fra giocatori e con classifiche.
