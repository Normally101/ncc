-- ============================================================================
-- 46_vtk_shop_purchase_scaffold.sql
-- SCAFFOLD — NON applicato al DB di produzione da questa routine.
--
-- Bug trovato durante il bug-hunt P2P/alleanze/VTK (missione estesa, vedi
-- docs/AUTOMATION_ROUTINE.md): `vtkBuyShopItem` in vtk-market.js decrementa
-- `gameState.vtkBalance` SOLO in locale — non esiste (e non è mai esistita)
-- una RPC per gli acquisti del "VTK Shop" (a differenza del mercato P2P VTK,
-- che ha `rpc_place_vtk_sell_order`/`rpc_fill_vtk_order`/`rpc_cancel_vtk_order`
-- in 21_vtk_token.sql). `vtk_balance` è una colonna server su `companies` e
-- viene RISCRITTA PER INTERO (non a delta) dal client ad ogni evento Realtime
-- sulla riga `companies` (`serverState.js:210`). Risultato: il decremento
-- locale dell'acquisto viene silenziosamente annullato al primo evento
-- Realtime successivo (es. il payout di una corsa qualunque, che tocca la
-- stessa riga `companies`) — mentre l'effetto dell'oggetto acquistato
-- (`item.apply(gameState)`: bonus slot garage, reset stress autista, boost
-- reputazione) è già stato applicato e salvato. Un giocatore può ripetere
-- l'acquisto all'infinito per VTK gratis.
--
-- Fix: nuova RPC `rpc_spend_vtk_shop_item(v_item_id)` con un catalogo COSTI
-- lato server (mai fidarsi del costo mandato dal client) che rispecchia
-- `VTK_SHOP_ITEMS` in vtk-market.js. ⚠️ **MANUTENZIONE ACCOPPIATA**: se in
-- futuro si aggiunge/modifica un item in `VTK_SHOP_ITEMS` (vtk-market.js),
-- va aggiornato ANCHE il catalogo qui sotto — altrimenti il nuovo item
-- fallisce lato server (fail-safe: meglio un acquisto rifiutato che uno
-- gratis, ma va comunque tenuto sincronizzato).
--
-- ⚠️ SEQUENZIAMENTO: questa SQL deve essere applicata PRIMA di deployare il
-- fix JS corrispondente in vtk-market.js (stesso branch/PR) — altrimenti il
-- client chiamerebbe una RPC inesistente e il VTK Shop si romperebbe del
-- tutto (errore RPC not found) invece di limitarsi al bug attuale.
--
-- Idempotente. Vlad: applica insieme al deploy del fix JS, non prima da sola
-- (la UI del negozio smetterebbe di funzionare finché il JS non viene
-- aggiornato per chiamare questa RPC).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_spend_vtk_shop_item(v_item_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_cost BIGINT;
    v_bal  BIGINT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'rpc_spend_vtk_shop_item: utente non autenticato';
    END IF;

    PERFORM public._ce_rate_limit('vtk_shop_purchase', 20, interval '1 minute');

    -- Catalogo costi lato server — deve rispecchiare VTK_SHOP_ITEMS in vtk-market.js.
    v_cost := CASE v_item_id
        WHEN 'slot_garage_7d'       THEN 200
        WHEN 'driver_stress_reset'  THEN 100
        WHEN 'rep_boost_01'         THEN 300
        ELSE NULL
    END;

    IF v_cost IS NULL THEN
        RAISE EXCEPTION 'rpc_spend_vtk_shop_item: item sconosciuto (%)', v_item_id;
    END IF;

    SELECT vtk_balance INTO v_bal FROM companies WHERE user_id = auth.uid() FOR UPDATE;
    IF COALESCE(v_bal, 0) < v_cost THEN
        RAISE EXCEPTION 'rpc_spend_vtk_shop_item: VTK insufficienti (servono %, hai %)', v_cost, COALESCE(v_bal, 0);
    END IF;

    UPDATE companies SET vtk_balance = vtk_balance - v_cost WHERE user_id = auth.uid();

    RETURN jsonb_build_object('success', true, 'item_id', v_item_id, 'cost', v_cost, 'new_balance', v_bal - v_cost);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_spend_vtk_shop_item(TEXT) TO authenticated;
