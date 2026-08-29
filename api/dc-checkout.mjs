/* ============================================================================
   api/dc-checkout.mjs — Chauffeur Empire
   Apre una sessione di pagamento Stripe per un pacchetto di Driver Coins.

   QUESTA FUNZIONE NON ACCREDITA NIENTE. Apre soltanto la cassa. L'accredito
   avviene in `dc-webhook.mjs`, e solo dopo che Stripe ha confermato l'incasso.
   Sono due funzioni separate apposta: se fossero una sola, chiunque sapesse
   chiamare l'endpoint avrebbe i Driver Coins gratis, che e' esattamente il
   difetto che stiamo chiudendo.

   Due cose non arrivano MAI dal browser, e sono le due che contano:
     - il PREZZO   → letto dalla tabella `dc_packs`
     - i COIN      → idem
   Dal browser arriva solo quale pacchetto vuole, ed e' una stringa che deve
   esistere nel catalogo. Chi manda `{pack:'starter', price:1}` ottiene il
   prezzo di listino dello starter, perche' il campo `price` non viene letto.

   NESSUNA DIPENDENZA npm: `fetch` e `node:crypto` bastano, e su un progetto
   senza bundler ogni pacchetto in piu' e' superficie da aggiornare per sempre.

   VARIABILI D'AMBIENTE (Vercel → Settings → Environment Variables):
     STRIPE_SECRET_KEY           sk_live_… (o sk_test_… per provare)
     SUPABASE_URL                https://twstjbykstaioaahfqbe.supabase.co
     SUPABASE_SERVICE_ROLE_KEY   la chiave service_role (MAI nel repo)
     SITE_URL                    https://www.chauffeurempire.com
   ============================================================================ */

const CORS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
};

function risposta(dati, stato = 200) {
    return new Response(JSON.stringify(dati), { status: stato, headers: CORS });
}

export default async function handler(request) {
    if (request.method !== 'POST') return risposta({ ok: false, reason: 'metodo_non_ammesso' }, 405);

    const SK      = process.env.STRIPE_SECRET_KEY;
    const SB_URL  = process.env.SUPABASE_URL;
    const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const SITE    = process.env.SITE_URL || 'https://www.chauffeurempire.com';

    /* Se il negozio non e' ancora configurato lo diciamo con parole nostre. Un
       500 generico farebbe pensare a un guasto, e il giocatore riproverebbe. */
    if (!SK || !SB_URL || !SB_KEY) {
        return risposta({ ok: false, reason: 'pagamenti_non_configurati',
                          messaggio: 'Il negozio non è ancora attivo. Nessun addebito è stato fatto.' }, 503);
    }

    // ── 1. CHI SEI ──────────────────────────────────────────────────────────
    // Il token viene verificato da Supabase, non da noi: e' l'unica prova che
    // l'utente e' chi dice di essere. Senza questo passo chiunque potrebbe far
    // accreditare i coin a un account altrui (o farsi pagare da un altro).
    const auth = request.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) return risposta({ ok: false, reason: 'non_autenticato' }, 401);

    let utente;
    try {
        const r = await fetch(`${SB_URL}/auth/v1/user`, {
            headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
        });
        if (!r.ok) return risposta({ ok: false, reason: 'sessione_non_valida' }, 401);
        utente = await r.json();
    } catch {
        return risposta({ ok: false, reason: 'verifica_identita_non_riuscita' }, 502);
    }
    if (!utente?.id) return risposta({ ok: false, reason: 'sessione_non_valida' }, 401);

    // ── 2. QUALE PACCHETTO, E QUANTO COSTA DAVVERO ──────────────────────────
    let corpo = {};
    try { corpo = await request.json(); } catch { /* corpo vuoto: gestito sotto */ }
    const packKey = typeof corpo?.pack === 'string' ? corpo.pack : null;
    if (!packKey) return risposta({ ok: false, reason: 'pacchetto_mancante' }, 400);

    let pack;
    try {
        const r = await fetch(
            `${SB_URL}/rest/v1/dc_packs?pack_key=eq.${encodeURIComponent(packKey)}&attivo=is.true&select=*`,
            { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
        const righe = await r.json();
        pack = Array.isArray(righe) ? righe[0] : null;
    } catch {
        return risposta({ ok: false, reason: 'catalogo_non_raggiungibile' }, 502);
    }
    if (!pack) return risposta({ ok: false, reason: 'pacchetto_sconosciuto' }, 404);

    // ── 3. LA CASSA ─────────────────────────────────────────────────────────
    /* `payment_method_types` non viene passato di proposito: cosi' Stripe mostra
       i metodi attivati nel Dashboard (carta, PayPal, e sui dispositivi
       compatibili Apple Pay e Google Pay). Elencarli qui vorrebbe dire tornare
       a toccare il codice ogni volta che se ne aggiunge uno. */
    const campi = new URLSearchParams();
    campi.set('mode', 'payment');
    campi.set('success_url', `${SITE}/?dc=ok&session_id={CHECKOUT_SESSION_ID}`);
    campi.set('cancel_url',  `${SITE}/?dc=annullato`);
    campi.set('client_reference_id', utente.id);
    campi.set('metadata[user_id]',  utente.id);
    campi.set('metadata[pack_key]', pack.pack_key);
    campi.set('line_items[0][quantity]', '1');
    campi.set('line_items[0][price_data][currency]', pack.currency || 'eur');
    campi.set('line_items[0][price_data][unit_amount]', String(pack.price_cents));
    campi.set('line_items[0][price_data][product_data][name]',
              `${pack.label} — ${pack.dc} Driver Coins`);
    campi.set('line_items[0][price_data][product_data][description]',
              'Chauffeur Empire · valuta di gioco, accreditata sull\'account che ha effettuato l\'acquisto');
    if (utente.email) campi.set('customer_email', utente.email);
    // Una carta rifiutata non deve lasciare sessioni aperte all'infinito.
    campi.set('expires_at', String(Math.floor(Date.now() / 1000) + 30 * 60));

    let sessione;
    try {
        const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SK}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                // Se il giocatore preme due volte, Stripe restituisce la stessa
                // sessione invece di aprirne una seconda.
                'Idempotency-Key': `dc_${utente.id}_${pack.pack_key}_${Math.floor(Date.now() / 60000)}`,
            },
            body: campi.toString(),
        });
        sessione = await r.json();
        if (!r.ok) {
            console.error('stripe checkout errore', sessione?.error?.message);
            return risposta({ ok: false, reason: 'cassa_non_disponibile' }, 502);
        }
    } catch (e) {
        console.error('stripe checkout eccezione', e?.message);
        return risposta({ ok: false, reason: 'cassa_non_disponibile' }, 502);
    }

    return risposta({ ok: true, url: sessione.url });
}
