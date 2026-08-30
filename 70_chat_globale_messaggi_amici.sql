-- ════════════════════════════════════════════════════════════════════════════
-- 70_chat_globale_messaggi_amici.sql
--
-- Vlad, 30/08: «Ora è da introdurre una chat generale dove tutti possono
-- parlare tra di loro, perché altrimenti non è un vero multiplayer.» E poi:
-- «si possono comunque mandare messaggi tra i player. Non per forza c'è
-- bisogno che siano amici nel gioco, cioè posso mandare un messaggio a
-- chiunque di base.»
--
-- Quindi tre cose nuove, tutte lato server perche' sono dati condivisi:
--   1. `global_chat`     — la piazza: un messaggio, lo leggono tutti.
--   2. `direct_messages` — il messaggio privato fra due giocatori. Aperto a
--                          CHIUNQUE: l'amicizia non e' un prerequisito.
--   3. `friendships`     — richiesta di amicizia e sua accettazione.
--
-- La chat di consorzio esisteva gia' (`alliance_chat` + rpc_post_alliance_chat)
-- e non viene toccata: il client la mostra anche nel nuovo hub, ma continua a
-- passare dalla stessa RPC.
--
-- PRINCIPIO DI SICUREZZA, uguale a tutto il resto del gioco: le tabelle si
-- LEGGONO con RLS, si SCRIVONO solo via RPC `security definer`. Nessuna
-- policy di INSERT: cosi' non esiste un percorso che scriva senza passare dai
-- controlli (autenticazione, rate-limit, lunghezza, destinatario esistente).
--
-- IL NOME NON LO DICE IL CLIENT. `rpc_post_alliance_chat` si fida del
-- `p_company_name` che arriva dal browser — in un consorzio di persone che si
-- conoscono passi. In una chat pubblica no: chiunque potrebbe firmarsi col
-- nome di un altro. Qui il nome viene SEMPRE letto da `leaderboard` lato
-- server, e il parametro del client non esiste proprio.
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. CHAT GLOBALE
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.global_chat (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name text NOT NULL,
    message      text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- La chat si legge sempre "gli ultimi N": l'indice e' su created_at desc.
CREATE INDEX IF NOT EXISTS global_chat_created_idx ON public.global_chat (created_at DESC);

ALTER TABLE public.global_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_chat_read ON public.global_chat;
CREATE POLICY global_chat_read ON public.global_chat
    FOR SELECT TO authenticated USING (true);

-- Nessuna policy di INSERT/UPDATE/DELETE: si scrive solo da rpc_post_global_chat.

CREATE OR REPLACE FUNCTION public.rpc_post_global_chat(p_message text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_name   text;
    v_msg    text := btrim(coalesce(p_message, ''));
    v_recent int;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Autenticazione richiesta' USING errcode = 'P0001';
    END IF;
    IF v_msg = '' THEN
        RAISE EXCEPTION 'Messaggio vuoto' USING errcode = 'P0001';
    END IF;

    -- Due freni diversi, apposta: uno contro la raffica (6 in 10 secondi, lo
    -- stesso della chat di consorzio), uno contro il flood lungo (40 al minuto).
    SELECT count(*) INTO v_recent FROM public.global_chat
        WHERE user_id = v_uid AND created_at > now() - interval '10 seconds';
    IF v_recent >= 6 THEN
        RAISE EXCEPTION 'Troppi messaggi, rallenta' USING errcode = 'P0001';
    END IF;
    PERFORM public._ce_rate_limit('post_global_chat', 40, interval '1 minute');

    SELECT company_name INTO v_name FROM public.leaderboard WHERE user_id = v_uid;

    INSERT INTO public.global_chat (user_id, company_name, message)
    VALUES (v_uid, coalesce(nullif(btrim(v_name), ''), 'CEO'), left(v_msg, 500));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_post_global_chat(text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. MESSAGGI PRIVATI FRA GIOCATORI
--    (la tabella `messages` che c'e' gia' NON e' questa: e' un residuo di
--     un'email di gioco, ha company_id/subject/body e nessuno la usa.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.direct_messages (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sender_name  text NOT NULL,
    recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message      text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
    created_at   timestamptz NOT NULL DEFAULT now(),
    read_at      timestamptz,
    CONSTRAINT dm_non_a_se_stessi CHECK (sender_id <> recipient_id)
);

-- Il client chiede sempre "la mia posta": entrambi gli indici servono, perche'
-- una conversazione e' l'unione dei messaggi mandati e di quelli ricevuti.
CREATE INDEX IF NOT EXISTS dm_recipient_idx ON public.direct_messages (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS dm_sender_idx    ON public.direct_messages (sender_id, created_at DESC);

ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dm_read_own ON public.direct_messages;
CREATE POLICY dm_read_own ON public.direct_messages
    FOR SELECT TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

CREATE OR REPLACE FUNCTION public.rpc_send_direct_message(p_recipient uuid, p_message text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid    uuid := auth.uid();
    v_name   text;
    v_msg    text := btrim(coalesce(p_message, ''));
    v_esiste boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Autenticazione richiesta' USING errcode = 'P0001';
    END IF;
    IF p_recipient IS NULL OR p_recipient = v_uid THEN
        RAISE EXCEPTION 'Destinatario non valido' USING errcode = 'P0001';
    END IF;
    IF v_msg = '' THEN
        RAISE EXCEPTION 'Messaggio vuoto' USING errcode = 'P0001';
    END IF;

    -- Il destinatario deve essere un giocatore vero. Senza questo controllo si
    -- potrebbero riempire le righe con uuid a caso che nessuno leggera' mai.
    SELECT EXISTS (SELECT 1 FROM public.leaderboard WHERE user_id = p_recipient) INTO v_esiste;
    IF NOT v_esiste THEN
        RAISE EXCEPTION 'Giocatore non trovato' USING errcode = 'P0001';
    END IF;

    PERFORM public._ce_rate_limit('send_direct_message', 30, interval '1 minute');

    SELECT company_name INTO v_name FROM public.leaderboard WHERE user_id = v_uid;

    INSERT INTO public.direct_messages (sender_id, sender_name, recipient_id, message)
    VALUES (v_uid, coalesce(nullif(btrim(v_name), ''), 'CEO'), p_recipient, left(v_msg, 1000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_send_direct_message(uuid, text) TO authenticated;

-- Segna come letta l'intera conversazione con un giocatore. Passa da una RPC e
-- non da una policy di UPDATE perche' cosi' l'unica colonna scrivibile e'
-- read_at, e solo sui messaggi RICEVUTI: nessuno puo' riscrivere il testo.
CREATE OR REPLACE FUNCTION public.rpc_mark_dm_read(p_other uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Autenticazione richiesta' USING errcode = 'P0001';
    END IF;
    UPDATE public.direct_messages
        SET read_at = now()
        WHERE recipient_id = v_uid AND sender_id = p_other AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_mark_dm_read(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. AMICIZIE
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.friendships (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at   timestamptz NOT NULL DEFAULT now(),
    responded_at timestamptz,
    CONSTRAINT amicizia_non_con_se_stessi CHECK (requester_id <> addressee_id),
    CONSTRAINT amicizia_unica UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX IF NOT EXISTS friendships_addressee_idx ON public.friendships (addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friendships_read_own ON public.friendships;
CREATE POLICY friendships_read_own ON public.friendships
    FOR SELECT TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE OR REPLACE FUNCTION public.rpc_send_friend_request(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid      uuid := auth.uid();
    v_esiste   boolean;
    v_inversa  public.friendships%rowtype;
    v_mia      public.friendships%rowtype;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Autenticazione richiesta' USING errcode = 'P0001';
    END IF;
    IF p_user_id IS NULL OR p_user_id = v_uid THEN
        RAISE EXCEPTION 'Giocatore non valido' USING errcode = 'P0001';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.leaderboard WHERE user_id = p_user_id) INTO v_esiste;
    IF NOT v_esiste THEN
        RAISE EXCEPTION 'Giocatore non trovato' USING errcode = 'P0001';
    END IF;

    PERFORM public._ce_rate_limit('send_friend_request', 20, interval '1 minute');

    -- Se l'altro aveva gia' chiesto a me, la mia richiesta E' l'accettazione:
    -- altrimenti resterebbero due richieste pendenti incrociate che nessuno
    -- dei due capisce piu' chi debba accettare.
    SELECT * INTO v_inversa FROM public.friendships
        WHERE requester_id = p_user_id AND addressee_id = v_uid FOR UPDATE;
    IF FOUND THEN
        IF v_inversa.status = 'accepted' THEN RETURN 'gia_amici'; END IF;
        UPDATE public.friendships SET status = 'accepted', responded_at = now()
            WHERE id = v_inversa.id;
        RETURN 'accettata';
    END IF;

    SELECT * INTO v_mia FROM public.friendships
        WHERE requester_id = v_uid AND addressee_id = p_user_id;
    IF FOUND THEN
        RETURN CASE WHEN v_mia.status = 'accepted' THEN 'gia_amici' ELSE 'gia_inviata' END;
    END IF;

    INSERT INTO public.friendships (requester_id, addressee_id) VALUES (v_uid, p_user_id);
    RETURN 'inviata';
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_send_friend_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_respond_friend_request(p_request_id bigint, p_accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid uuid := auth.uid();
    v_row public.friendships%rowtype;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Autenticazione richiesta' USING errcode = 'P0001';
    END IF;

    -- Solo il DESTINATARIO risponde: chi ha inviato non puo' auto-accettarsi.
    SELECT * INTO v_row FROM public.friendships
        WHERE id = p_request_id AND addressee_id = v_uid AND status = 'pending' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Richiesta non trovata' USING errcode = 'P0001';
    END IF;

    IF coalesce(p_accept, false) THEN
        UPDATE public.friendships SET status = 'accepted', responded_at = now() WHERE id = v_row.id;
    ELSE
        DELETE FROM public.friendships WHERE id = v_row.id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_respond_friend_request(bigint, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_remove_friend(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Autenticazione richiesta' USING errcode = 'P0001';
    END IF;
    -- Vale in entrambi i versi: l'amicizia e' una riga sola, non due.
    DELETE FROM public.friendships
        WHERE (requester_id = v_uid AND addressee_id = p_user_id)
           OR (requester_id = p_user_id AND addressee_id = v_uid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_remove_friend(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. REALTIME
--    Senza questo la chat arriva solo ricaricando la pagina — cioe' non e'
--    una chat. Stesso schema di 60_fix_realtime_publication.sql: si aggiunge
--    solo se non c'e' gia', perche' ALTER PUBLICATION ADD e' un errore duro
--    sulle tabelle gia' presenti.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['global_chat', 'direct_messages', 'friendships'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- Verifica dopo l'applicazione:
--   SELECT tablename FROM pg_publication_tables
--    WHERE pubname = 'supabase_realtime'
--      AND tablename IN ('global_chat','direct_messages','friendships');
--   -- attese: 3 righe
