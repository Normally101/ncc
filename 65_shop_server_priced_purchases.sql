-- ================================================================
-- 65_shop_server_priced_purchases.sql
--
-- La porta UNICA per ogni acquisto del gioco: il browser dichiara COSA
-- vuole comprare, il server legge il prezzo dalla sua tabella, blocca la
-- riga del giocatore (FOR UPDATE), controlla il saldo, scala e RESTITUISCE
-- il saldo nuovo. Il browser non calcola e non propone mai una cifra.
--
-- Modello: rpc_buy_energy_refill / spendDriverCoins (vedi 08_mmo_p2p_marketplace.sql).
-- Applicare a mano (Vlad): questo file NON viene eseguito dai test.
-- ================================================================

-- Il listino prezzi vive SUL SERVER. Nessun prezzo accettato dal client.
create table if not exists public.shop_catalog (
    tipo         text        not null,
    item_id      text        not null,
    valuta       text        not null default 'cash' check (valuta in ('cash','driver_coins')),
    prezzo       bigint      not null check (prezzo >= 0),
    attivo       boolean     not null default true,
    primary key (tipo, item_id)
);

create or replace function public.rpc_shop_purchase(p_tipo text, p_item_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid       uuid := auth.uid();
    v_azienda   record;
    v_prezzo    bigint;
    v_valuta    text;
begin
    if v_uid is null then
        return jsonb_build_object('ok', false, 'error', 'Sessione scaduta: riaccedi.');
    end if;
    if p_tipo is null or p_item_id is null then
        return jsonb_build_object('ok', false, 'error', 'Acquisto incompleto.');
    end if;

    -- Il prezzo arriva SOLO dal listino del server: un valore mandato dal
    -- browser non viene nemmeno letto.
    select prezzo, valuta into v_prezzo, v_valuta
    from shop_catalog
    where tipo = p_tipo and item_id = p_item_id and attivo;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'Articolo inesistente o non disponibile.');
    end if;

    -- FOR UPDATE: due acquisti in parallelo devono fare la fila, non
    -- spendere due volte lo stesso saldo.
    select * into v_azienda from companies where owner_id = v_uid for update;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'Azienda non trovata.');
    end if;

    if v_valuta = 'cash' then
        if (v_azienda.cash::bigint) < v_prezzo then
            return jsonb_build_object('ok', false, 'error',
                'Fondi insufficienti: servono €' || v_prezzo::text || '.');
        end if;
        update companies set cash = (cash::bigint - v_prezzo)::numeric
        where owner_id = v_uid
        returning cash into v_azienda.cash;
        return jsonb_build_object('ok', true, 'cash', v_azienda.cash);
    else
        if (v_azienda.driver_coins::bigint) < v_prezzo then
            return jsonb_build_object('ok', false, 'error',
                'Driver Coins insufficienti: servono ' || v_prezzo::text || ' DC.');
        end if;
        update companies set driver_coins = driver_coins - v_prezzo
        where owner_id = v_uid
        returning driver_coins into v_azienda.driver_coins;
        return jsonb_build_object('ok', true, 'driver_coins', v_azienda.driver_coins);
    end if;
end;
$$;

revoke all on function public.rpc_shop_purchase(text, text) from public, anon;
grant execute on function public.rpc_shop_purchase(text, text) to authenticated;
