-- ════════════════════════════════════════════════════════════════════
-- 36_alliance_perks.sql — Bottega del Consorzio (perk dal tesoro)
--
-- Il leader spende il TESORO del consorzio per attivare un perk a tempo
-- che buffa TUTTI i membri (applicato client-side leggendo perk_type/perk_until).
--
-- ANTI-CHEAT: il client sceglie SOLO quale perk. Costo e durata sono
-- decisi QUI dal server (catalog whitelisted) → un client non può
-- attivare un perk a costo 1 o durata infinita.
--
-- Eseguire UNA VOLTA su Supabase (SQL editor). Idempotente.
-- ════════════════════════════════════════════════════════════════════

-- 1) Colonne perk sulla tabella alliances ------------------------------
alter table public.alliances
  add column if not exists perk_type  text,
  add column if not exists perk_until timestamptz;

-- 2) RPC attivazione perk ----------------------------------------------
create or replace function public.rpc_activate_alliance_perk(p_perk text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_aid   uuid;
  v_role  text;
  v_treas bigint;
  v_cost  bigint;
  v_hours int;
  v_until timestamptz;
begin
  if v_uid is null then
    raise exception 'Non autenticato';
  end if;

  -- Catalog server-authoritative: costo + durata decisi dal server.
  -- DEVE restare allineato a PERKS in alliances.js (solo per il DISPLAY).
  case p_perk
    when 'boost_income' then v_cost := 50000;  v_hours := 48;
    when 'fuel_save'    then v_cost := 35000;  v_hours := 48;
    when 'mega_income'  then v_cost := 120000; v_hours := 24;
    else raise exception 'Perk sconosciuto';
  end case;

  -- Deve essere LEADER di un consorzio
  select alliance_id, role
    into v_aid, v_role
    from alliance_members
   where user_id = v_uid;

  if v_aid is null then
    raise exception 'Non sei in un consorzio';
  end if;
  if v_role is distinct from 'leader' then
    raise exception 'Solo il leader puo'' attivare i perk';
  end if;

  -- Lock della riga consorzio + verifica tesoro (no race su doppia spesa)
  select treasury into v_treas
    from alliances
   where id = v_aid
   for update;

  if v_treas is null or v_treas < v_cost then
    raise exception 'Tesoro insufficiente (servono %)', v_cost;
  end if;

  v_until := now() + make_interval(hours => v_hours);

  update alliances
     set treasury   = treasury - v_cost,
         perk_type  = p_perk,
         perk_until = v_until
   where id = v_aid;

  return v_until;
end;
$$;

grant execute on function public.rpc_activate_alliance_perk(text) to authenticated;

-- ════════════════════════════════════════════════════════════════════
-- FINE. Dopo l'esecuzione, la Bottega del Consorzio in alliances.js
-- (v=2) diventa funzionante: il leader vede i bottoni di spesa,
-- tutti i membri vedono il perk attivo + countdown e ricevono il buff.
-- ════════════════════════════════════════════════════════════════════
