#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════════
   salute-server.mjs — il server vivo sta facendo quello che crediamo?

   NASCE DA UN DIFETTO VERO (30/08/2026). Il lavoro schedulato `fetch-weather-cron`
   era attivo, girava ogni 30 minuti e **falliva da 5127 esecuzioni di fila** con
   `unrecognized configuration parameter "app.supabase_url"`: due impostazioni del
   database che nessuno aveva mai messo. Risultato: la tabella del meteo era ferma
   al 15 agosto, e il gioco mostrava il tempo di quindici giorni prima.

   Niente lo segnalava. I test girano in locale e non parlano col server; il gioco
   non si accorge della differenza fra «sereno oggi» e «sereno il 15 agosto». Una
   cosa che fallisce cinquemila volte in silenzio non è un caso raro: è la prova
   che mancava il controllo.

   Questo script guarda il server VERO. Non entra in `npm test` apposta: la suite
   non deve dipendere dalla rete né da un segreto.

   Uso:  source ~/.config/ce-supabase.env && npm run salute
   ════════════════════════════════════════════════════════════════════════════ */
const REF = 'twstjbykstaioaahfqbe';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

let errori = 0, avvisi = 0;
const ok     = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const errore = (m) => { errori++; console.log(`  \x1b[31m✗ ${m}\x1b[0m`); };
const avviso = (m) => { avvisi++; console.log(`  \x1b[33m!\x1b[0m ${m}`); };
const titolo = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

async function sql(query) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
    });
    if (!r.ok) throw new Error(`query fallita (${r.status}): ${(await r.text()).slice(0, 200)}`);
    return r.json();
}

const minutiDa = (iso) => iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : Infinity;
const eta = (min) => min === Infinity ? 'mai' : min < 90 ? `${min} min fa`
          : min < 2880 ? `${Math.round(min / 60)} ore fa` : `${Math.round(min / 1440)} giorni fa`;

/* Quanto può invecchiare il dato che ogni lavoro produce, prima che sia un guasto.
   La soglia è il doppio abbondante del periodo: un ritardo capita, un silenzio no. */
const FRESCHEZZA = {
    'fetch-weather-cron':     { minuti: 90,   nota: 'meteo reale' },
    'aste-giudiziarie':       { minuti: 45,   nota: 'ciclo aste' },
    'bandi-turistici':        { minuti: 45,   nota: 'bandi turismo' },
    'tensione-sindacato':     { minuti: 150,  nota: 'tensione sindacale' },
    'azzera-vtk-giornaliero': { minuti: 150,  nota: 'reset VTK' },
    'ce-send-push':           { minuti: 150,  nota: 'notifiche push' },
};

async function lavoriSchedulati() {
    titolo('Lavori schedulati (cron)');
    const righe = await sql(`
        SELECT j.jobname, j.schedule, j.active,
               (SELECT d.status   FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.end_time DESC LIMIT 1) AS esito,
               (SELECT d.end_time FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.end_time DESC LIMIT 1) AS ultima,
               (SELECT left(d.return_message, 160) FROM cron.job_run_details d WHERE d.jobid = j.jobid ORDER BY d.end_time DESC LIMIT 1) AS messaggio,
               (SELECT count(*) FROM cron.job_run_details d WHERE d.jobid = j.jobid AND d.status = 'failed'
                  AND d.end_time > now() - interval '24 hours') AS falliti_24h
          FROM cron.job j ORDER BY j.jobname`);

    if (!righe.length) { errore('nessun lavoro schedulato: i sistemi che dipendono dal tempo sono fermi'); return; }

    for (const r of righe) {
        const soglia = FRESCHEZZA[r.jobname];
        const min = minutiDa(r.ultima);
        const dove = `${r.jobname} (${r.schedule})`;

        if (!r.active) { errore(`${dove}: SPENTO`); continue; }
        if (r.esito !== 'succeeded') {
            errore(`${dove}: ultima esecuzione ${r.esito || 'mai'} — ${(r.messaggio || '').trim().replace(/\s+/g, ' ')}`);
            continue;
        }
        if (soglia && min > soglia.minuti) {
            errore(`${dove}: ultimo successo ${eta(min)}, oltre la soglia di ${soglia.minuti} min (${soglia.nota})`);
            continue;
        }
        if (Number(r.falliti_24h) > 0) avviso(`${dove}: ${r.falliti_24h} fallimenti nelle ultime 24 ore, ma l'ultima è andata bene`);
        else ok(`${dove}: ultima esecuzione ${eta(min)}`);
        if (!soglia) avviso(`${r.jobname}: nessuna soglia di freschezza definita in salute-server.mjs`);
    }
}

async function datiFreschi() {
    titolo('I dati che quei lavori producono');
    const righe = await sql(`SELECT max(updated_at) AS ultimo, count(*) AS righe FROM public.real_world_status`);
    const min = minutiDa(righe[0] && righe[0].ultimo);
    if (!Number(righe[0].righe)) errore('real_world_status è vuota: il gioco non ha nessun meteo da mostrare');
    else if (min > 90) errore(`meteo fermo a ${eta(min)}: il gioco mostra il tempo di allora`);
    else ok(`meteo aggiornato ${eta(min)} su ${righe[0].righe} province`);
}

async function permessi() {
    titolo('Permessi e protezioni');
    const senzaRls = await sql(`
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = false ORDER BY 1`);
    if (senzaRls.length) senzaRls.forEach(t => errore(`tabella senza RLS: ${t.relname}`));
    else ok('RLS attiva su tutte le tabelle pubbliche');

    /* Eseguibile da `anon` non è di per sé un buco: quasi tutte iniziano con un
       controllo di identità. Il problema sono quelle che CAMBIANO qualcosa senza
       averne nessuno — lì chiunque, senza account, può toccare il mondo condiviso. */
    const sospette = await sql(`
        SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname LIKE 'rpc%'
           AND has_function_privilege('anon', p.oid, 'EXECUTE')
           AND p.prosrc NOT LIKE '%auth.uid()%'
           AND p.prosrc NOT LIKE '%_my_company_id()%'
           AND (p.prosrc ILIKE '%update %' OR p.prosrc ILIKE '%insert %' OR p.prosrc ILIKE '%delete %')
         ORDER BY 1`);
    if (sospette.length) {
        avviso(`${sospette.length} RPC che scrivono, eseguibili senza account e senza controllo d'identità:`);
        sospette.forEach(f => console.log(`      ${f.proname}`));
        console.log('      (vanno guardate una per una: se le chiama solo il cron, si revocano ad anon)');
    } else ok('nessuna RPC che scrive è aperta a chi non ha un account');
}

if (!TOKEN) {
    console.log('\x1b[31mManca SUPABASE_ACCESS_TOKEN.\x1b[0m  source ~/.config/ce-supabase.env');
    process.exit(1);
}
console.log('\x1b[1m── Salute del server — Chauffeur Empire ──\x1b[0m');
try {
    await lavoriSchedulati();
    await datiFreschi();
    await permessi();
} catch (e) {
    errore(`controllo interrotto: ${e.message}`);
}
console.log('');
if (errori) { console.log(`\x1b[31m\x1b[1m✗ ${errori} problem${errori === 1 ? 'a' : 'i'} sul server.\x1b[0m` + (avvisi ? ` (${avvisi} avvisi)` : '')); process.exit(1); }
console.log(`\x1b[32m\x1b[1m✓ Il server sta facendo il suo lavoro.\x1b[0m` + (avvisi ? ` ${avvisi} avviso/i sopra.` : ''));
