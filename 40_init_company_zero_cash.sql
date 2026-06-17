-- ════════════════════════════════════════════════════════════════════════════
-- 40_init_company_zero_cash.sql
-- Zero-to-Hero: una NUOVA azienda parte da €0 ("il fondo del barile"), non €35.000.
-- 10 guidate manuali (+15€) = 150€, coerente col modal "SVEGLIATI, SCHIAVO".
--
-- Riconcilia la fonte di verità della cassa iniziale (era contraddittoria):
--   client engine.js default 0  ·  saveSystem.syncCash(0)  ·  QUI rpc_init_company 0.
-- ON CONFLICT NON tocca `cash` → le aziende già esistenti mantengono il loro saldo
-- (cambia solo l'inizializzazione delle nuove). La colonna companies.cash mantiene
-- il CHECK (cash >= 0): 0 è valido.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rpc_init_company(v_company_name text DEFAULT 'Nuova Azienda')
RETURNS public.companies
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_result  public.companies;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'rpc_init_company: utente non autenticato';
    END IF;

    INSERT INTO public.companies (user_id, company_name, cash, hq_city)
    VALUES (v_user_id, v_company_name, 0, 'roma')   -- ← era 35000
    ON CONFLICT (user_id) DO UPDATE
        SET company_name = EXCLUDED.company_name,
            updated_at   = now()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_init_company(text) TO authenticated;
