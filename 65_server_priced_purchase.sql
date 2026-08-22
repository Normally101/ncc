-- ============================================================
-- 65_server_priced_purchase.sql
-- Fondamenta "economia sul server" (decisione Vlad 22/08/2026):
-- il browser DICIDE solo COSA comprare; il prezzo lo legge il server
-- da una tabella sua, il saldo viene controllato e scalato lato DB
-- sotto lock di riga, e il NUOVO saldo torna al browser che si limita
-- ad accettarlo.
--
-- Modello: rpc_buy_energy_refill / spendDriverCoins (05, 06) e la
-- RPC del marketplace P2P (08, ~riga 613).
--
-- NOTA OPERATIVA: questo file va APPLICATO da Vlad sul database di
-- produzione (supabase db push o editor SQL). Non e' applicato qui.
-- ============================================================

-- Catalogo prezzi SOLO-SERVER: se un prezzo non sta qui, non esiste.
create table if not exists server_shop_catalog (
    tipo         text   not null,
    oggetto_id   text   not null,
    valuta       text   not null default 'cash'
                 check (valuta in ('cash', 'driver_coins')),
    prezzo       bigint not null check (prezzo >= 0),
    attivo       boolean not null default true,
    primary key (tipo, oggetto_id)
);

-- La tabella dei prezzi NON deve essere scrivibile dai client.
alter table server_shop_catalog enable row level security;
drop policy if exists "catalog_lettura_pubblica" on server_shop_catalog;
create policy "catalog_lettura_pubblica" on server_shop_catalog
    for select using (true);
revoke insert, update, delete on server_shop_catalog from anon, authenticated;

create or replace function rpc_buy_with_server_price(p_tipo text, p_oggetto_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid          uuid := auth.uid();
    v_voce         server_shop_catalog%rowtype;
    v_cash         bigint;
    v_dc           integer;
    v_cash_nuovo   bigint;
    v_dc_nuovo     integer;
begin
    if v_uid is null then
        return json_build_object('ok', false, 'errore', 'non_autenticato');
    end if;
    if p_tipo is null or p_oggetto_id is null then
        return json_build_object('ok', false, 'errore', 'parametri_mancanti');
    end if;

    -- Prezzo letto DAL SERVER, mai dal parametro del browser.
    -- Se la voce non c'e' o non e' attiva, l'acquisto non esiste.
    select * into v_voce
    from server_shop_catalog
    where tipo = p_tipo and oggetto_id = p_oggetto_id and attivo;
    if not found then
        return json_build_object('ok', false, 'errore', 'oggetto_inesistente');
    end if;

    -- LOCK di riga PRIMA di leggere il saldo: due acquisti concorrenti
    -- devono mettersi in fila, non spendere due volte gli stessi soldi.
    select cash, driver_coins
      into v_cash, v_dc
      from companies
     where user_id = v_uid
       for update;
    if not found then
        return json_build_object('ok', false, 'errore', 'azienda_non_trovata');
    end if;

    if v_voce.valuta = 'cash' then
        if v_cash < v_voce.prezzo then
            return json_build_object(
                'ok', false,
                'errore', 'fondi_insufficienti',
                'richiesto', v_voce.prezzo,
                'disponibile', v_cash);
        end if;
        v_cash_nuovo := v_cash - v_voce.prezzo;
        update companies set cash = v_cash_nuovo where user_id = v_uid;
        return json_build_object('ok', true,
            'saldo', v_cash_nuovo, 'valuta', 'cash',
            'prezzo_addebitato', v_voce.prezzo);
    else
        if coalesce(v_dc, 0) < v_voce.prezzo then
            return json_build_object(
                'ok', false,
                'errore', 'fondi_insufficienti',
                'richiesto', v_voce.prezzo,
                'disponibile', coalesce(v_dc, 0));
        end if;
        v_dc_nuovo := v_dc - v_voce.prezzo::integer;
        update companies set driver_coins = v_dc_nuovo where user_id = v_uid;
        return json_build_object('ok', true,
            'saldo', v_dc_nuovo, 'valuta', 'driver_coins',
            'prezzo_addebitato', v_voce.prezzo);
    end if;
end;
$$;
