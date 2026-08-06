-- ============================================================================
-- 46_vtk_shop_purchase_scaffold.sql
-- VTK Shop: spesa server-authoritative.
--
-- ⚠️ SCAFFOLD — NON applicato al DB da nessuna automazione. Da rivedere ed
--    eseguire a mano (preferibilmente prima su un branch/preview Supabase).
--
-- PERCHÉ SERVE
--   `companies.vtk_balance` viene riscritto per intero sul client ad ogni evento
--   Realtime sulla riga `companies` (serverState.js:210). Finché la spesa avviene
--   solo lato client, il saldo torna al valore del server al primo evento utile
--   mentre l'oggetto acquistato resta applicato e salvato: acquisti gratis e
--   ripetibili. L'unico modo corretto è scalare il saldo QUI.
--
-- SEQUENZA DI DEPLOY
--   Questa SQL può essere applicata in QUALSIASI momento, anche prima del JS:
--   il client (vtk-market.js) rileva l'assenza della funzione e disattiva il
--   negozio con un messaggio, senza consegnare nulla. Applicandola, il negozio
--   torna operativo da solo, senza bisogno di un nuovo deploy del frontend.
--
-- MANUTENZIONE
--   Il catalogo prezzi vive QUI, non nel client: un prezzo passato dal client
--   non sarebbe attendibile. Se si aggiunge un item a VTK_SHOP_ITEMS
--   (vtk-market.js) va aggiunto anche al CASE qui sotto, altrimenti il server lo
--   rifiuta — comportamento fail-safe voluto: meglio non vendibile che gratis.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_spend_vtk_shop_item(v_item_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_uid  UUID := auth.uid();
    v_cost BIGINT;
    v_bal  BIGINT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Non autenticato';
    END IF;

    -- Throttle difensivo: stesso helper condiviso di 38_security_hardening.sql,
    -- già usato da rpc_add_driver_coins e rpc_award_mission_vtk.
    PERFORM public._ce_rate_limit('vtk_shop_purchase', 20, interval '1 minute');

    -- Catalogo prezzi AUTORITATIVO. Deve restare allineato a VTK_SHOP_ITEMS.
    v_cost := CASE v_item_id
        WHEN 'driver_stress_reset' THEN 100
        WHEN 'fuel_refill_full'    THEN 150
        WHEN 'rep_boost_01'        THEN 300
        ELSE NULL
    END;

    IF v_cost IS NULL THEN
        RAISE EXCEPTION 'Oggetto sconosciuto: %', v_item_id;
    END IF;

    -- FOR UPDATE: senza il lock, due richieste concorrenti leggerebbero lo stesso
    -- saldo e passerebbero entrambe il controllo, spendendo due volte gli stessi VTK.
    SELECT vtk_balance INTO v_bal
      FROM public.companies
     WHERE user_id = v_uid
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Azienda non trovata';
    END IF;

    IF COALESCE(v_bal, 0) < v_cost THEN
        RAISE EXCEPTION 'VTK insufficienti: hai %, servono %', COALESCE(v_bal, 0), v_cost;
    END IF;

    UPDATE public.companies
       SET vtk_balance = vtk_balance - v_cost
     WHERE user_id = v_uid
    RETURNING vtk_balance INTO v_bal;

    -- Il client si riallinea a questo valore invece di dedurlo da sé.
    RETURN jsonb_build_object(
        'success',     true,
        'item_id',     v_item_id,
        'cost',        v_cost,
        'vtk_balance', v_bal
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_spend_vtk_shop_item(TEXT) TO authenticated;

-- ============================================================================
-- NOTA: l'EFFETTO dell'oggetto resta client-side (reset stress, rifornimento,
-- reputazione) perché vive nel blob di salvataggio, non in colonne server. Qui si
-- rende autoritativo il PAGAMENTO, che è la parte sfruttabile. Rendere
-- autoritativi anche gli effetti richiederebbe portare quello stato sul server:
-- è il debito #1 già noto in HANDOFF.md, fuori dallo scopo di questo file.
-- ============================================================================
