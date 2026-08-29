'use strict';
/* ============================================================================
   knowledge-book.js — Il Manuale di Chauffeur Empire
   renderTabManuale + ricerca. Dipendenze: data.js, engine-rides.js (le costanti
   vere), engine.js (gameState per gli esempi). Caricato dopo i ui-*.js.

   RICHIESTA DI VLAD (29/08/2026), dopo che Pietro nel playtest aveva scritto
   «serve un Knowledge Book»: «se riesci a farlo, perfetto, però va strutturato
   molto bene, molto molto bene. Deve spiegare qualsiasi cosa del gioco».

   COME E' FATTO, E PERCHE'.
   Le tabelle di questo manuale NON sono scritte a mano: si generano dai dati
   veri del gioco (`NEW_CARS`, `REGIONS`, `STAFF_ROLES`, `WEATHER_STATES`,
   `SOGLIA_FASCIA_*`…). Un manuale con i numeri copiati dentro e' esatto il
   giorno che lo scrivi e sbagliato al primo ribilanciamento — e un manuale che
   mente e' peggio di nessun manuale, perche' il giocatore ci costruisce sopra
   una strategia. Qui, se cambia il listino, cambia anche la pagina che lo
   spiega. Quello che resta scritto a mano e' il PERCHE' delle cose, che i dati
   non possono raccontare.

   Ogni capitolo dichiara `cerca`: le parole con cui un giocatore cercherebbe
   quell'argomento, comprese quelle che nel testo non compaiono.
   ============================================================================ */

/* ─── AIUTANTI DI FORMATTAZIONE ─────────────────────────────────────────── */

function _kbEuro(n) {
    const v = Math.round(Number(n) || 0);
    return '€' + v.toLocaleString('it-IT');
}

function _kbTabella(intestazioni, righe, opzioni) {
    const allineaDx = (opzioni && opzioni.dx) || [];
    const th = intestazioni.map((h, i) =>
        `<th style="text-align:${allineaDx.includes(i) ? 'right' : 'left'}">${h}</th>`).join('');
    const tr = righe.map(r => '<tr>' + r.map((c, i) =>
        `<td style="text-align:${allineaDx.includes(i) ? 'right' : 'left'}">${c}</td>`).join('') + '</tr>').join('');
    return `<div class="kb-scroll"><table class="kb-tab"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

function _kbNota(testo) {
    return `<div class="kb-nota">${testo}</div>`;
}

/** Legge una costante globale senza far esplodere il manuale se manca: una
 *  pagina di aiuto non deve poter rompere il gioco. */
function _kbDato(nome, ripiego) {
    try {
        if (typeof window !== 'undefined' && window[nome] !== undefined) return window[nome];
        // eslint-disable-next-line no-eval
        const v = eval(nome);
        return v === undefined ? ripiego : v;
    } catch (e) { return ripiego; }
}

const _KB_NOMI_FASCIA = { standard: 'Standard', business: 'Premium', group: 'Premium',
                          vip: 'Luxury', ultra: 'Luxury' };

/* ─── I CAPITOLI ─────────────────────────────────────────────────────────── */

var KB_CAPITOLI = [

/* ══ 1. LE BASI ═══════════════════════════════════════════════════════════ */
{
    id: 'basi', icona: '🎯', titolo: 'Le basi',
    cerca: 'iniziare inizio cominciare obiettivo scopo gioco tutorial primi passi come si gioca',
    sezioni: [
        {
            id: 'cose-il-gioco', titolo: 'Che gioco è',
            corpo: () => `
<p>Chauffeur Empire è un gestionale. Guidi un'azienda di noleggio con conducente in
Italia, e parti dal basso: una berlina usata riscattata, zero dipendenti, zero soldi.
L'obiettivo non è una schermata di vittoria — è arrivare in cima alla classifica dei
giocatori, che si misura sul <strong>patrimonio</strong>.</p>

<p>Il ciclo fondamentale è semplice, e tutto il resto gli gira intorno:</p>
<div class="kb-ciclo">
  <span>Arrivano le richieste</span><i>→</i>
  <span>Le assegni a un autista con l'auto giusta</span><i>→</i>
  <span>La corsa incassa</span><i>→</i>
  <span>Reinvesti in auto, persone, territorio</span><i>→</i>
  <span>Arrivano richieste migliori</span>
</div>

<p>Quello che cambia, salendo, non è la quantità di corse: è la loro
<strong>qualità</strong>. Chi comincia lavora sulle corse Standard, che pagano poco.
Chi ha investito lavora sulle Luxury, che pagano molto. Il resto del gioco —
contratti, immobili, finanza, politica — sono modi diversi di far fruttare
quello che il mestiere ha costruito.</p>`,
        },
        {
            id: 'orologio', titolo: "L'orologio, e perché non si può accelerare",
            corpo: () => `
<p>Il tempo del gioco è <strong>l'ora vera italiana</strong>. Non c'è un
acceleratore, e non è una dimenticanza: giorno e notte, meteo, stagioni,
scadenze dei contratti e guadagni offline sono tutti agganciati a quell'orologio.
Accelerarlo vorrebbe dire far scorrere anche gli stipendi e le tasse.</p>

<p>Quello che invece scorre più in fretta è la <strong>durata delle corse</strong>:
una tratta che nella realtà dura tre ore, qui ne dura una. È lì che si è
intervenuti sul ritmo — stesso tempo impegnato, il triplo del lavoro fatto.</p>

${_kbNota(`Il gioco continua senza di te: quando torni, i <strong>guadagni offline</strong>
delle corse in coda vengono calcolati e accreditati. Quante ore vengono conteggiate
dipende dal tuo limite offline, che si può alzare nell'Executive Club.`)}`,
        },
        {
            id: 'prime-corse', titolo: 'I primi passi: le corse a mano',
            corpo: () => `
<p>All'inizio non hai autisti: <strong>guidi tu</strong>. Ogni corsa manuale
consuma <strong>energia del CEO</strong>, che si ricarica col riposo. È una fase
breve e voluta: serve a farti vedere da vicino cosa fa un autista prima di
pagarne uno.</p>

<p>Dopo le prime corse arriva il <em>Ragazzo di Quartiere</em>, il primo autista:
gli passi le chiavi della berlina e da quel momento lavora lui mentre tu gestisci.
Da qui in poi il tuo mestiere non è più guidare — è <strong>smistare</strong>.</p>

${_kbNota(`Se ti ritrovi con l'energia a zero e nessun autista, non sei bloccato:
l'energia torna da sola col passare delle ore. Puoi anche ricaricarla subito
dall'Executive Club, ma non è mai obbligatorio.`)}`,
        },
    ],
},

/* ══ 2. LE CORSE ══════════════════════════════════════════════════════════ */
{
    id: 'corse', icona: '🚕', titolo: 'Le corse',
    cerca: 'corsa corse dispatch smistamento fascia standard premium luxury tariffa prezzo tratta contratto B2B coda durata',
    sezioni: [
        {
            id: 'tre-fasce', titolo: 'Le tre fasce: Standard, Premium, Luxury',
            corpo: () => {
                const sp = _kbDato('SOGLIA_FASCIA_PREMIUM', 500);
                const sl = _kbDato('SOGLIA_FASCIA_LUXURY', 1500);
                return `
<p>Ogni corsa appartiene a una fascia, e la fascia la decide <strong>quanto vale
la corsa</strong>, non che auto compare nella richiesta.</p>

${_kbTabella(['Fascia', 'Valore della corsa', 'Chi la può servire'], [
    [`<span class="kb-pill kb-std">STANDARD</span>`, `sotto ${_kbEuro(sp)}`,
     "l'auto d'ingresso e qualsiasi auto migliore"],
    [`<span class="kb-pill kb-prem">PREMIUM</span>`, `da ${_kbEuro(sp)} a ${_kbEuro(sl)}`,
     'una berlina executive o superiore'],
    [`<span class="kb-pill kb-lux">LUXURY</span>`, `oltre ${_kbEuro(sl)}`,
     "un'auto di lusso"],
])}

<p>Un'auto può sempre servire le corse delle fasce <strong>più basse</strong> della
sua. Comprare meglio apre lavoro nuovo, non chiude quello vecchio — ma quando hai
la Luxury, le Standard smetti di volerle: rendono poco e occupano l'autista
per lo stesso tempo.</p>

<p><strong>Perché conta.</strong> Un transfer da 150 € non è una richiesta di lusso
solo perché il cliente ha chiesto una berlina executive: è una corsa ordinaria, e la
può fare l'auto con cui hai cominciato. È questa regola che ti dà del lavoro dal
primo minuto.</p>`;
            },
        },
        {
            id: 'famiglie', titolo: "La famiglia del veicolo: che l'auto sia adatta",
            corpo: () => `
<p>Oltre alla fascia c'è una seconda domanda, indipendente: <strong>l'auto ha la
forma giusta per quel lavoro?</strong></p>

${_kbTabella(['Famiglia', 'Che lavoro fa'], [
    ['<strong>Berlina</strong>', 'da una a tre persone. Dalla compatta urbana alla presidenziale.'],
    ['<strong>Minivan</strong>', 'gruppi e famiglie, bagagli. Dal crossover al van allestito VIP.'],
    ['<strong>Acqua</strong>', 'Venezia, e solo Venezia. Il Water Taxi non fa altro.'],
])}

<p>Le due domande non si sostituiscono. Una presidenziale è una berlina di lusso:
appartiene alla famiglia berlina ed è di fascia Luxury. Un minivan non fa il lavoro
di una berlina per quanto costi, e una berlina d'ingresso non fa una corsa Luxury
per quanto sia libera.</p>

${_kbNota(`Il gioco non ti propone mai corse che non puoi accettare. Se non vedi
tratte da minivan è perché non hai un minivan — non perché non ce ne siano.`)}`,
        },
        {
            id: 'come-smistare', titolo: 'Smistare: a mano o in automatico',
            corpo: () => `
<p>Nel <strong>Dispatch</strong> vedi le richieste in arrivo a sinistra e gli
autisti a destra. Hai due modi per assegnarle:</p>

<ul>
  <li><strong>Trascinando</strong> una corsa su un autista. Se non si può, il gioco
      ti dice perché: fascia insufficiente, veicolo sbagliato, autista a riposo.</li>
  <li><strong>Smista tutte</strong>: il gioco assegna quello che può, saltando il
      resto in silenzio.</li>
</ul>

<p>Ogni autista ha una <strong>coda</strong> con un tetto in ore, non in numero di
corse: tre corse lunghe possono riempirla quanto sei corte. Le corse in coda partono
una dopo l'altra senza che tu debba tornare a guardare.</p>

${_kbNota(`Un <strong>Junior Dispatcher</strong> smista da solo le corse Standard;
un <strong>Senior Dispatcher</strong> anche le VIP e Ultra. Sono i primi due
stipendi che si ripagano da soli, perché ti tolgono dal ciclo.`)}`,
        },
        {
            id: 'prezzo-corsa', titolo: 'Come nasce il prezzo di una corsa',
            corpo: () => {
                const w = _kbDato('WEATHER_STATES', []);
                const s = _kbDato('SEASONAL_MULT', []);
                const tetto = _kbDato('TETTO_MOLT_PREZZO', 10);
                return `
<p>Le corse da contratto (marcate <strong>B2B</strong>) hanno un prezzo scritto nel
listino della tratta. Le corse dirette, invece, nascono da una tariffa base
moltiplicata da una serie di fattori:</p>

${_kbTabella(['Fattore', 'Effetto'], [
    ['Fascia della corsa', 'la Luxury vale multipli della Standard'],
    ['Distanza', 'una corsa interregionale vale quasi il triplo'],
    ['Orario', 'di notte (22–7) le tariffe salgono del 20%'],
    ['Meteo', w.map(x => `${x.icon} ${x.label} ${x.priceMult > 1 ? '+' + Math.round((x.priceMult - 1) * 100) + '%' : '—'}`).join(' · ') || '—'],
    ['Stagione', s.map(x => `${x.name} ×${x.priceMult}`).join(' · ') || '—'],
    ['Domanda', 'con la coda piena scatta il sovrapprezzo'],
    ['Eventi', 'un evento cittadino può far esplodere le tariffe per qualche ora'],
    ['Investimenti', 'livrea, scorta di sicurezza, yacht e altri incidono sul prezzo'],
])}

${_kbNota(`Tutti questi fattori si moltiplicano fra loro, ma il prodotto ha un
tetto di <strong>×${tetto}</strong>. Senza quel tetto, nel caso estremo — POI di
lusso, notte, neve, evento raro, tutti i bonus insieme — una singola corsa varrebbe
milioni e renderebbe irrilevante ogni altra fonte di reddito. Il tetto tiene il
picco raro memorabile senza rompere la scala.`)}`;
            },
        },
        {
            id: 'durata', titolo: 'Durata e usura',
            corpo: () => `
<p>Quanto dura una corsa dipende da quanto paga: le corse ricche sono anche le più
lunghe, con una crescita più lenta del prezzo — così una corsa da 3.000 € non
occupa l'autista venti volte più di una da 150 €, ma vale comunque la pena.</p>

<p>Il maltempo rallenta: con la pioggia si va al 80% della velocità, con la neve al
60%. Ogni corsa consuma <strong>carburante</strong>, aggiunge
<strong>chilometri</strong>, abbassa la <strong>condizione</strong> dell'auto e
aumenta la <strong>fatica</strong> dell'autista.</p>`,
        },
    ],
},

/* ══ 3. LA FLOTTA ═════════════════════════════════════════════════════════ */
{
    id: 'flotta', icona: '🚘', titolo: 'La flotta',
    cerca: 'auto veicoli macchina comprare acquisto listino usato leasing noleggio carburante benzina condizione riparazione officina gomme showroom',
    sezioni: [
        {
            id: 'listino', titolo: 'Il listino, per fascia',
            corpo: () => {
                const cars = _kbDato('NEW_CARS', []).filter(c => !c.isAviation);
                const perFascia = { standard: [], business: [], vip: [], ultra: [] };
                for (const c of cars) (perFascia[c.tier] || perFascia.standard).push(c);
                const ordine = [
                    ['standard', 'STANDARD — le auto d\'ingresso', 'kb-std'],
                    ['business', 'PREMIUM — il grosso del lavoro',  'kb-prem'],
                    ['vip',      'LUXURY — le richieste particolari', 'kb-lux'],
                    ['ultra',    'LUXURY — il vertice',              'kb-lux'],
                ];
                return ordine.map(([k, titolo, cls]) => {
                    const lista = (perFascia[k] || []).sort((a, b) => a.price - b.price);
                    if (!lista.length) return '';
                    const fam = (vc) => {
                        const f = (typeof window._famigliaDi === 'function') ? window._famigliaDi(vc) : null;
                        return f ? f.charAt(0).toUpperCase() + f.slice(1) : '—';
                    };
                    return `<h4><span class="kb-pill ${cls}">${titolo}</span></h4>` +
                        _kbTabella(['Modello', 'Famiglia', 'Alimentazione', 'Prezzo'],
                            lista.map(c => [c.name, fam(c.vehicleClass),
                                            c.fuel === 'electric' ? '⚡ elettrica' : '⛽ benzina',
                                            _kbEuro(c.price)]), { dx: [3] });
                }).join('');
            },
        },
        {
            id: 'usato-leasing', titolo: 'Gli altri modi di avere un veicolo',
            corpo: () => {
                const usate = _kbDato('USED_CARS', []);
                return `
<p>Comprare nuovo dallo Showroom non è l'unico modo, e all'inizio non è nemmeno
il migliore.</p>

<h4>Il noleggio breve</h4>
<p>Si prende dallo Showroom stesso: paghi tutto subito per un numero di giorni, e
alla scadenza il veicolo torna al concessionario. Lavora come un'auto tua, ma non
la puoi rivendere. Serve per coprire un picco di lavoro senza immobilizzare
capitale.</p>

<h4>Le aste giudiziarie</h4>
<p>Veicoli sequestrati, a prezzi che non si trovano altrove — e sono l'unico posto
dove compaiono le auto <strong>usate</strong>, che costano molto meno ma partono
con la condizione già consumata: lavorano, e insieme ti chiedono l'officina prima
del previsto.</p>
${_kbTabella(['Modello', 'Condizione', 'Valore'],
    usate.map(c => [c.name, c.condition + '%', _kbEuro(c.price)]), { dx: [1, 2] })}
<p>Si compra al buio e contro altri offerenti: non è un canale su cui contare, è
un colpo di fortuna quando capita.</p>

<h4>Il mercato fra giocatori</h4>
<p>Nella scheda <strong>Mercato Auto</strong> si comprano e si vendono veicoli
usati fra giocatori veri. È anche il posto dove liberarsi di un'auto che non serve
più: rivenderla a un altro rende più che rottamarla.</p>

${_kbNota(`Un veicolo in <strong>leasing</strong> può capitarti (per esempio come
auto di cortesia), e allora paghi un canone giornaliero finché non scade. Ma non
c'è un concessionario dove stipularne uno: se stavi cercando dove fare un leasing,
non lo trovi perché non c'è.`)}`;
            },
        },
        {
            id: 'manutenzione', titolo: 'Tenere in strada la flotta',
            corpo: () => `
<p>Ogni veicolo ha quattro numeri che scendono da soli:</p>

${_kbTabella(['Cosa', 'Cosa succede se lo trascuri'], [
    ['<strong>Carburante</strong>', "a zero l'auto è ferma. Si rifornisce dal singolo veicolo o in blocco."],
    ['<strong>Condizione</strong>', 'sotto il 10% l\'auto non può lavorare. Sotto il 30% i guasti diventano frequenti.'],
    ['<strong>Pressione gomme</strong>', 'bassa consuma di più e aumenta il rischio di guasto.'],
    ['<strong>Salute motore</strong>', 'un motore trascurato porta al fermo macchina improvviso.'],
])}

<p>Un <strong>Capo Officina</strong> recupera condizione ogni notte e dimezza il
costo delle riparazioni a mano. È lo stipendio che si ripaga più in fretta appena la
flotta supera i due o tre veicoli.</p>

${_kbNota(`Il <strong>deposito carburante</strong> ti fa comprare quando il prezzo è
basso e usare quando è alto. Con un <strong>Logistics Manager</strong> vieni
avvisato ai minimi di prezzo e quando le scorte scendono.`)}`,
        },
    ],
},

/* ══ 4. LE PERSONE ════════════════════════════════════════════════════════ */
{
    id: 'persone', icona: '👔', titolo: 'Le persone',
    cerca: 'autisti autista staff dipendenti assumere stipendio salario fatica stress burnout riposo sciopero morale livelli xp accademia specialità HR',
    sezioni: [
        {
            id: 'autisti', titolo: 'Gli autisti',
            corpo: () => {
                const lv = _kbDato('DRIVER_LEVELS', []);
                return `
<p>Un autista si assume pagando <strong>due mensilità</strong> di anticipo, poi
costa il suo stipendio ogni giorno (rateizzato sui 30). Va abbinato a un'auto: senza
chiavi non lavora.</p>

<h4>Crescono lavorando</h4>
${_kbTabella(['Livello', 'Esperienza', 'Mance', 'Fatica'],
    lv.map(l => [l.name, `${l.xpMin}${l.xpMax === Infinity ? '+' : '–' + l.xpMax}`,
        l.tipBonus > 1 ? `+${Math.round((l.tipBonus - 1) * 100)}%` : '—',
        l.fatigueBonus < 1 ? `−${Math.round((1 - l.fatigueBonus) * 100)}%` : '—']), { dx: [1, 2, 3] })}

<p>Un autista Elite prende più mance e si stanca meno: vale molto più della
differenza di stipendio con un Rookie. Per questo licenziare un veterano per
risparmiare è quasi sempre un cattivo affare.</p>

${_kbNota(`Ogni autista ha anche <strong>tratti</strong> (che incidono su mance,
fatica, rischio) e <strong>abilità</strong> numeriche. L'<em>Efficienza</em> conta
più delle altre: a 100 riduce la fatica del 40%, a 1 la aumenta del 20%.`)}`;
            },
        },
        {
            id: 'fatica', titolo: 'Fatica, riposo, burnout',
            corpo: () => `
<p>Ogni corsa aggiunge fatica, e quanta dipende dalla fascia:</p>

${_kbTabella(['Fascia della corsa', 'Fatica aggiunta'], [
    ['Standard', '8'], ['Premium', '10'], ['Luxury (VIP)', '15'], ['Luxury (Ultra)', '20'],
], { dx: [1] })}

<p>Cosa succede quando sale dipende da <strong>se hai un HR Specialist</strong>:</p>
<ul>
  <li><strong>Senza HR</strong> — a 70 vieni avvisato. A 100 l'autista si ferma da
      solo, e finché è arrivato lì c'è il <strong>15% di rischio incidente</strong>
      a corsa: 25 punti di condizione persi in un colpo.</li>
  <li><strong>Con HR</strong> — a 85 va a riposo da solo, prima che il rischio si
      apra. In più prende il 15% di mance in più e ti fa recuperare energia.</li>
</ul>

${_kbNota(`L'HR Specialist è lo stipendio che i giocatori assumono troppo tardi.
Non è un bonus di comodità: è la differenza fra una flotta che si ferma quando lo
decidi tu e una che si ferma quando si rompe.`)}`,
        },
        {
            id: 'staff', titolo: 'Lo staff: chi assumere, e quando',
            corpo: () => {
                const r = _kbDato('STAFF_ROLES', {});
                const righe = Object.values(r)
                    .sort((a, b) => a.salary - b.salary)
                    .map(s => [`<strong>${s.name}</strong>`, _kbEuro(s.salary) + '/mese', s.desc]);
                return `
<p>Lo staff non guida: cambia le regole del gioco. Ogni ruolo toglie di mezzo un
lavoro manuale o apre qualcosa che prima non esisteva.</p>
${_kbTabella(['Ruolo', 'Stipendio', 'Cosa fa'], righe, { dx: [1] })}

${_kbNota(`Il <strong>Responsabile Amministrazione</strong> porta la tassazione dal
42% al 24%. Se il tuo utile mensile supera i suoi 3.000 € di stipendio moltiplicati
per cinque, si paga da solo — ed è quasi sempre prima di quanto sembri.`)}`;
            },
        },
    ],
},

/* ══ 5. IL DENARO ═════════════════════════════════════════════════════════ */
{
    id: 'denaro', icona: '💶', titolo: 'Il denaro',
    cerca: 'soldi cassa denaro entrate uscite spese tasse prestito banca debito bilancio profitto perdita fallimento patrimonio',
    sezioni: [
        {
            id: 'entrate-uscite', titolo: 'Da dove entra, da dove esce',
            corpo: () => `
${_kbTabella(['Entra da', 'Esce per'], [
    ['corse dirette e da contratto', 'stipendi di autisti e staff'],
    ['mance dei clienti', 'carburante e manutenzione'],
    ['contratti B2B, corporate, bandi turismo', 'canoni di leasing'],
    ['affitti degli immobili', 'multe e sanzioni'],
    ['dividendi e plusvalenze in Borsa', 'tasse'],
    ['premi delle missioni', 'rate dei prestiti'],
])}

<p>A fine giornata il gioco chiude il conto e ti mostra il bilancio. Se resti in
rosso per giorni consecutivi, cominciano i guai seri: prima il credito, poi i
sequestri.</p>`,
        },
        {
            id: 'tasse', titolo: 'Le tasse',
            corpo: () => `
<p>Si pagano sui profitti, e l'aliquota dipende da una sola cosa: se hai un
<strong>Responsabile Amministrazione</strong>.</p>

${_kbTabella(['Situazione', 'Aliquota'], [
    ['Senza Amministratore', '<strong>42%</strong>'],
    ['Con Amministratore', '<strong>24%</strong>'],
], { dx: [1] })}

<p>C'è anche una <strong>tassa sul lusso</strong> sui veicoli di fascia alta, che
l'Amministratore elimina del tutto. Più sale la flotta di lusso, più quello
stipendio diventa conveniente.</p>`,
        },
        {
            id: 'prestiti', titolo: 'Prestiti e merito creditizio',
            corpo: () => `
<p>La banca presta in base al tuo <strong>credit score</strong>, che sale pagando e
scende saltando le rate. Un prestito si ripaga con una rata giornaliera fissa:
quella rata esce anche nei giorni in cui non incassi niente, ed è per questo che il
debito preso per comprare un'auto è pericoloso quanto l'auto è ferma.</p>

${_kbNota(`Regola pratica: indebitati per qualcosa che <em>produce</em> — un'auto in
più che lavora, una licenza regionale che apre tratte. Mai per coprire un buco: il
buco resta e ci aggiungi la rata.`)}`,
        },
    ],
},

/* ══ 6. IL TERRITORIO ═════════════════════════════════════════════════════ */
{
    id: 'territorio', icona: '🗺️', titolo: 'Il territorio',
    cerca: 'regioni licenze province war room espansione mappa città POI territorio guerra prezzi monopolio',
    sezioni: [
        {
            id: 'regioni', titolo: 'Le licenze regionali',
            corpo: () => {
                const R = _kbDato('REGIONS', {});
                const righe = Object.values(R)
                    .sort((a, b) => (a.price || 0) - (b.price || 0))
                    .map(r => [r.name,
                               r.price ? _kbEuro(r.price) : '<em>di partenza</em>',
                               r.repReq ? r.repReq.toFixed(1) + '★' : '—']);
                return `
<p>Si comincia dal <strong>Lazio</strong>. Ogni altra regione va sbloccata pagando
la licenza e avendo abbastanza reputazione. Aprire una regione significa accedere
alle sue tratte e ai suoi punti d'interesse — cioè a più lavoro, non solo a più
mappa.</p>
${_kbTabella(['Regione', 'Licenza', 'Reputazione'], righe, { dx: [1, 2] })}`;
            },
        },
        {
            id: 'province', titolo: 'War Room: le province',
            corpo: () => `
<p>Dentro le regioni si conquistano le <strong>province</strong>, una alla volta,
contro gli altri giocatori. Il controllo di una provincia rende un flusso passivo e
conta per la classifica.</p>

<p>Le province si perdono, non solo si prendono: qualcuno può attaccare le tue. Non
è un sistema in cui si accumula e basta.</p>`,
        },
        {
            id: 'guerre-prezzi', titolo: 'Le guerre di prezzo',
            corpo: () => `
<p>Puoi dichiarare una guerra di prezzo su una regione. Durante la guerra le tariffe
di quella regione scendono del <strong>30%</strong> per tutti, te compreso: stai
bruciando margine per far uscire un concorrente.</p>

<p>Se la vinci arriva il <strong>monopolio</strong>: le tariffe salgono del
<strong>40%</strong> e per un periodo quella regione è tua. È la mossa più
aggressiva del gioco, e va fatta con la cassa piena — non con la speranza di
riempirla.</p>`,
        },
    ],
},

/* ══ 7. I CONTRATTI ═══════════════════════════════════════════════════════ */
{
    id: 'contratti', icona: '🤝', titolo: 'I contratti',
    cerca: 'contratti B2B corporate aziende bandi turismo appalti diamond ricavo passivo clienti fissi',
    sezioni: [
        {
            id: 'tipi-contratto', titolo: 'Quattro modi di avere entrate fisse',
            corpo: () => `
${_kbTabella(['Tipo', 'Come funziona'], [
    ['<strong>Contratti B2B</strong>', 'appalti con aziende: corse garantite a scadenza fissa.'],
    ['<strong>Corporate Deals</strong>', 'un canone giornaliero in cambio di veicoli impegnati.'],
    ['<strong>Bandi Turismo</strong>', 'si concorre con reputazione, flotta qualificante e una cauzione. Chi ha il punteggio più alto vince.'],
    ['<strong>Diamond Contracts</strong>', "il vertice: richiedono un Elite Wealth Manager e una struttura all'altezza."],
])}

<p><strong>Il costo nascosto dei Corporate Deals</strong>: un contratto non è denaro
dal nulla. Impegna un certo numero di veicoli, che <em>smettono di essere
disponibili per le corse</em>. La domanda giusta non è «quanto rende», è «rende più
di quello che quei veicoli avrebbero incassato lavorando?».</p>`,
        },
        {
            id: 'bandi', titolo: 'Come si vince un bando turistico',
            corpo: () => `
<p>Il punteggio si compone di tre parti, su 100:</p>

${_kbTabella(['Voce', 'Peso', 'Come si alza'], [
    ['Reputazione', '40 punti', 'facendo bene il lavoro, giorno dopo giorno'],
    ['Flotta qualificante', '40 punti', 'avendo abbastanza veicoli della fascia richiesta'],
    ['Cauzione', '20 punti', 'mettendo soldi sul piatto'],
], { dx: [1] })}

${_kbNota(`I veicoli in leasing e quelli fuori servizio <strong>non contano</strong>
fra i qualificanti. E la fascia richiesta è quella minima: un bando che chiede
Premium non accetta le auto Standard.`)}`,
        },
    ],
},

/* ══ 8. IL PATRIMONIO ═════════════════════════════════════════════════════ */
{
    id: 'patrimonio', icona: '📈', titolo: 'Far fruttare il capitale',
    cerca: 'investimenti immobili real estate borsa azioni finanza broker crypto offshore rendite patrimonio lifestyle',
    sezioni: [
        {
            id: 'investimenti', titolo: 'Gli investimenti aziendali',
            corpo: () => `
<p>Sono acquisti una tantum che cambiano le regole per sempre: la livrea che alza le
tariffe, la scorta di sicurezza per le corse di lusso, l'accordo con l'aeroporto che
ti manda più corse da lì, l'ottimizzatore che ti trova corse di ritorno invece di
farti tornare a vuoto.</p>

<p>Non danno un rendimento in percentuale: cambiano un moltiplicatore. Per questo
valgono di più quanto prima li compri e quanto più lavori.</p>`,
        },
        {
            id: 'immobili-borsa', titolo: 'Immobili, Borsa, crypto',
            corpo: () => `
<h4>Real Estate</h4>
<p>Gli immobili rendono un affitto costante e non si fermano mai: è la rendita più
noiosa e la più solida del gioco.</p>

<h4>$WALL-ST</h4>
<p>Il mercato azionario richiede un <strong>Elite Wealth Manager</strong>. Da lì si
compra, si vende allo scoperto, si usa la leva. I rendimenti vanno dal 4% al 50%
a seconda del rischio che scegli — e il rischio è vero: si perde.</p>

<h4>Crypto & Offshore</h4>
<p>Il canale più volatile, con implicazioni che non sono solo finanziarie. Il fisco
e le autorità non guardano da un'altra parte per sempre.</p>

${_kbNota(`Ordine sensato: prima l'azienda produce, poi il capitale in eccesso si
investe. Chi mette in Borsa i soldi che gli servivano per il carburante scopre che
la Borsa non li restituisce nel giorno in cui gli servono.`)}`,
        },
    ],
},

/* ══ 9. REPUTAZIONE E BRAND ═══════════════════════════════════════════════ */
{
    id: 'reputazione', icona: '⭐', titolo: 'Reputazione e brand',
    cerca: 'reputazione stelle brand marketing pubblicità campagne prestigio classifica ranking recensioni',
    sezioni: [
        {
            id: 'reputazione-cosa', titolo: 'A cosa serve la reputazione',
            corpo: () => `
<p>La reputazione va da 0 a 5 stelle e non è un punteggio d'onore: è una
<strong>chiave</strong>. Serve per sbloccare le licenze regionali, per qualificarsi
ai bandi, per accedere ai clienti migliori.</p>

<p>Sale completando corse e contratti; scende con le corse fallite, i contratti
rescissi e i clienti scontenti. È lenta a salire e rapida a scendere, come nel
mestiere vero.</p>`,
        },
        {
            id: 'marketing', titolo: 'Marketing e prestigio',
            corpo: () => `
<p>Le <strong>campagne di marketing</strong> alzano brand value e brand power, e si
sbloccano a scaglioni: alcune richiedono di aver già costruito un marchio.</p>

<p>La <strong>Vetrina Prestigio</strong> è un'altra cosa: sono elementi cosmetici e
di status, visibili agli altri giocatori. Non fanno guadagnare — dicono chi sei.</p>

<p>La <strong>classifica globale</strong> ordina i giocatori per patrimonio liquido
e si aggiorna a ogni azione. È lì che si vede se la strategia funziona.</p>`,
        },
    ],
},

/* ══ 10. IL LATO DIFFICILE ════════════════════════════════════════════════ */
{
    id: 'rischi', icona: '⚖️', titolo: 'Rischi, legge e avversari',
    cerca: 'multe sanzioni polizia legale avvocato sequestro sciopero agenzia ombra politica lobby OPA nemesi rivali',
    sezioni: [
        {
            id: 'multe', titolo: 'Multe e polizia',
            corpo: () => `
<p>Le multe arrivano da sole: infrazioni degli autisti, controlli, irregolarità.
Si possono pagare o <strong>contestare</strong>, e contestare a volte funziona.</p>

<p>Il <strong>livello di attenzione della polizia</strong> sale se ti muovi in zone
grigie. Alto abbastanza, porta a controlli e sequestri di veicoli — e un veicolo
sequestrato non lavora.</p>

${_kbNota(`Un <strong>Avvocato Aziendale</strong> contesta da solo metà delle multe
con il 70% di successo e riduce del 30% le sanzioni. Diventa conveniente appena la
flotta è abbastanza grande da prendere multe con regolarità.`)}`,
        },
        {
            id: 'scioperi', titolo: 'Quando gli autisti si fermano',
            corpo: () => `
<p>Gli autisti hanno un <strong>morale</strong>. Scende con la fatica alta e con gli
stipendi bassi (sotto i 2.500 € si erode da solo, giorno dopo giorno). Abbastanza in
basso, arriva lo <strong>sciopero</strong>: l'autista smette di accettare corse.</p>

<p>Non è un evento casuale da subire: è la conseguenza visibile di come li hai
trattati per settimane.</p>`,
        },
        {
            id: 'ombra', titolo: 'Agenzia Ombra, politica, OPA',
            corpo: () => `
<p>Tre sistemi per chi gioca in modo aggressivo:</p>

<ul>
  <li><strong>Agenzia Ombra</strong> — operazioni contro i concorrenti. Efficaci,
      e con un costo se ti scoprono.</li>
  <li><strong>Politica e lobbying</strong> — leggi che cambiano le regole a tuo
      favore. Si paga in token politici, non solo in denaro.</li>
  <li><strong>OPA ostili</strong> — comprare l'azienda di un altro giocatore contro
      la sua volontà.</li>
</ul>

<p>Ci sono anche i <strong>Nemici VIP</strong>: avversari con una storia, che si
comportano diversamente dai rivali generici.</p>`,
        },
    ],
},

/* ══ 11. EXECUTIVE CLUB ═══════════════════════════════════════════════════ */
{
    id: 'driver-coins', icona: '💎', titolo: 'Driver Coins',
    cerca: 'driver coins DC executive club premium acquisto pagamento stripe paypal soldi veri monete valuta pass',
    sezioni: [
        {
            id: 'dc-cosa', titolo: 'Cosa sono e come si ottengono',
            corpo: () => `
<p>I <strong>Driver Coins</strong> sono la valuta premium. Non scadono e non si
possono convertire in euro di gioco.</p>

<p>Si ottengono in due modi:</p>
<ul>
  <li><strong>Giocando</strong> — missioni Presidential, trasferimenti VIP, premi.
      È la strada lenta, ed è gratis.</li>
  <li><strong>Comprandoli</strong> nell'Executive Club, con carta, PayPal, Apple Pay
      o Google Pay.</li>
</ul>

${_kbNota(`Nessuna cosa nel gioco richiede Driver Coins per essere raggiunta:
comprano <strong>tempo</strong>, non progressione. Saltare un'attesa, ricaricare
subito, alzare il limite offline. Se una cosa si può fare solo pagando, è un
difetto — segnalalo.`)}`,
        },
        {
            id: 'dc-cosa-comprano', titolo: 'Cosa comprano',
            corpo: () => `
${_kbTabella(['Servizio', 'A cosa serve'], [
    ['Ricarica energia CEO', "riporta l'energia al 100% senza aspettare"],
    ['Rifornimento flotta', 'riempie tutti i serbatoi in un colpo'],
    ['Sveglia flotta', 'rimette in strada gli autisti a riposo'],
    ['Benessere staff', 'azzera stress e burnout'],
    ['Riparazione totale', 'rimette a nuovo la condizione dei veicoli'],
    ['Limite offline', 'aumenta le ore di guadagni conteggiate mentre non ci sei'],
    ['Auto-Rest CEO', "gestisce da solo il riposo, una volta e per sempre"],
    ['Executive Pass', 'un pacchetto di vantaggi a tempo'],
])}`,
        },
    ],
},

/* ══ 12. GLOSSARIO ════════════════════════════════════════════════════════ */
{
    id: 'glossario', icona: '📖', titolo: 'Glossario',
    cerca: 'glossario significato termini parole cosa vuol dire sigle B2B POI NCC tier fascia',
    sezioni: [
        {
            id: 'termini', titolo: 'Le parole del gioco',
            corpo: () => _kbTabella(['Termine', 'Significato'], [
                ['<strong>NCC</strong>', 'Noleggio Con Conducente: il mestiere che stai facendo.'],
                ['<strong>Fascia</strong>', 'Standard, Premium o Luxury. Dice quanto vale una corsa e che auto serve.'],
                ['<strong>Famiglia</strong>', 'Berlina, minivan o acqua. Dice che <em>forma</em> di veicolo serve.'],
                ['<strong>B2B</strong>', 'Una corsa che viene da un contratto aziendale, non da un cliente singolo.'],
                ['<strong>POI</strong>', "Punto d'interesse: aeroporti, hotel, stazioni. Da lì nascono le corse dirette."],
                ['<strong>Empty leg</strong>', 'Una corsa di ritorno trovata per non tornare a vuoto: metà tariffa, ma meglio di zero.'],
                ['<strong>Coda</strong>', "Le corse assegnate a un autista, con un tetto in ore."],
                ['<strong>Fatica</strong>', 'Quanto è stanco un autista, da 0 a 100. Alta significa incidenti.'],
                ['<strong>Reputazione</strong>', 'Da 0 a 5 stelle. È la chiave che apre regioni, bandi e clienti.'],
                ['<strong>DC</strong>', 'Driver Coins, la valuta premium.'],
                ['<strong>Condizione</strong>', "Lo stato di salute di un veicolo. Sotto il 10% non lavora."],
                ['<strong>Guadagni offline</strong>', 'Quello che la tua azienda incassa mentre non sei collegato.'],
            ]),
        },
        {
            id: 'aiuto', titolo: 'Se qualcosa non torna',
            corpo: () => `
<p>Se una cosa non funziona come è scritta qui, è un difetto e vogliamo saperlo.
Dalla scheda <strong>Supporto</strong> c'è la segnalazione bug con il tuo ID
compagnia già compilato.</p>

<p>Questo manuale prende i numeri direttamente dal gioco: le tabelle qui sopra
mostrano il listino, gli stipendi e le soglie <em>di adesso</em>, non quelli del
giorno in cui è stato scritto.</p>`,
        },
    ],
},

];

/* ─── RICERCA ────────────────────────────────────────────────────────────── */

/** Il testo su cui si cerca: titoli, parole chiave e contenuto senza i tag. */
function _kbTestoCercabile(cap) {
    let t = cap.titolo + ' ' + (cap.cerca || '');
    for (const s of cap.sezioni) {
        t += ' ' + s.titolo;
        try { t += ' ' + String(s.corpo()).replace(/<[^>]*>/g, ' '); } catch (e) { /* sezione rotta: si cerca lo stesso sul resto */ }
    }
    return t.toLowerCase();
}

function _kbFiltra(query) {
    const q = (query || '').trim().toLowerCase();
    if (!q) return KB_CAPITOLI;
    const parole = q.split(/\s+/);
    return KB_CAPITOLI.filter(c => {
        const testo = _kbTestoCercabile(c);
        return parole.every(p => testo.includes(p));
    });
}

/* ─── STATO E RENDER ─────────────────────────────────────────────────────── */

var _kbCapitoloAperto = 'basi';
var _kbRicerca = '';

window._kbApri = function(id) {
    _kbCapitoloAperto = id;
    if (typeof renderTabManuale === 'function') renderTabManuale();
    const c = document.getElementById('kb-contenuto');
    if (c && typeof c.scrollTo === 'function') c.scrollTo(0, 0);
};

function _kbStile() {
    if (document.getElementById('kb-style')) return;
    const st = document.createElement('style');
    st.id = 'kb-style';
    st.textContent = `
        .kb-wrap { display:grid; grid-template-columns:230px 1fr; gap:14px; align-items:start; }
        .kb-indice { position:sticky; top:0; max-height:78vh; overflow-y:auto; }
        .kb-voce {
            display:flex; align-items:center; gap:8px; padding:9px 11px; cursor:pointer;
            font-size:11.5px; font-weight:700; color:var(--em-muted);
            border-left:2px solid transparent; transition:color .12s, background .12s;
        }
        .kb-voce:hover { color:var(--em-ink); background:rgba(255,255,255,.03); }
        .kb-voce.attiva { color:var(--em-gold); border-left-color:var(--em-gold); background:rgba(199,154,42,.07); }
        .kb-voce .kb-ico { font-size:14px; flex-shrink:0; }

        .kb-cerca {
            width:100%; box-sizing:border-box; padding:9px 11px; font-size:12px;
            background:var(--em-bg, #0d1117); color:var(--em-ink);
            border:1px solid var(--em-line); border-radius:8px; margin-bottom:10px;
            font-family:inherit;
        }
        .kb-cerca::placeholder { color:var(--em-dim); }
        .kb-cerca:focus { outline:none; border-color:var(--em-blue); }

        .kb-corpo { max-height:78vh; overflow-y:auto; padding:4px 20px 28px; }
        .kb-corpo h3 {
            font-size:19px; font-weight:800; color:var(--em-ink);
            margin:0 0 3px; letter-spacing:-.2px;
        }
        .kb-corpo h4 {
            font-size:12.5px; font-weight:800; color:var(--em-ink);
            margin:20px 0 8px; letter-spacing:.01em;
        }
        .kb-sez { padding:18px 0; border-bottom:1px solid var(--em-line); }
        .kb-sez:last-child { border-bottom:none; }
        .kb-sez > h4:first-child { margin-top:0; }
        .kb-sez-tit {
            font-size:14px; font-weight:800; color:var(--em-gold);
            margin:0 0 10px; letter-spacing:.01em;
        }
        .kb-corpo p { font-size:12.5px; line-height:1.65; color:var(--em-ink); margin:0 0 11px; max-width:68ch; }
        .kb-corpo ul { margin:0 0 12px; padding-left:19px; }
        .kb-corpo li { font-size:12.5px; line-height:1.6; color:var(--em-ink); margin-bottom:6px; max-width:66ch; }
        .kb-corpo strong { color:var(--em-ink); font-weight:800; }
        .kb-corpo em { color:var(--em-muted); font-style:italic; }

        .kb-scroll { overflow-x:auto; margin:0 0 13px; }
        .kb-tab { width:100%; border-collapse:collapse; font-size:11.5px; }
        .kb-tab th {
            text-align:left; padding:7px 10px; font-size:9.5px; font-weight:800;
            letter-spacing:.1em; text-transform:uppercase; color:var(--em-dim);
            border-bottom:1px solid var(--em-line); white-space:nowrap;
        }
        .kb-tab td {
            padding:8px 10px; border-bottom:1px solid rgba(255,255,255,.04);
            color:var(--em-ink); line-height:1.5; vertical-align:top;
        }
        .kb-tab tbody tr:last-child td { border-bottom:none; }
        .kb-tab tbody tr:hover { background:rgba(255,255,255,.02); }

        .kb-nota {
            font-size:11.5px; line-height:1.6; color:var(--em-muted);
            background:rgba(199,154,42,.06); border-left:2px solid var(--em-gold);
            padding:11px 13px; border-radius:0 7px 7px 0; margin:13px 0; max-width:66ch;
        }
        .kb-nota strong { color:var(--em-gold); }

        .kb-pill {
            display:inline-block; padding:2px 8px; border-radius:20px;
            font-size:9px; font-weight:900; letter-spacing:.07em;
        }
        .kb-std  { background:rgba(139,148,158,.16); color:var(--em-muted); }
        .kb-prem { background:rgba(88,166,255,.14);  color:var(--em-blue); }
        .kb-lux  { background:rgba(199,154,42,.16);  color:var(--em-gold); }

        .kb-ciclo {
            display:flex; flex-wrap:wrap; align-items:center; gap:7px;
            margin:0 0 14px; padding:13px; border:1px solid var(--em-line);
            border-radius:9px; background:rgba(255,255,255,.02);
        }
        .kb-ciclo span {
            font-size:11px; font-weight:700; color:var(--em-ink);
            padding:5px 10px; background:rgba(255,255,255,.04); border-radius:6px;
        }
        .kb-ciclo i { color:var(--em-gold); font-style:normal; font-weight:800; }

        @media (max-width:900px) {
            .kb-wrap { grid-template-columns:1fr; }
            .kb-indice { position:static; max-height:none; }
            .kb-corpo { max-height:none; padding:4px 2px 24px; }
        }
    `;
    document.head.appendChild(st);
}

function renderTabManuale() {
    const container = document.getElementById('tab-container');
    if (!container) return;
    _kbStile();

    const trovati = _kbFiltra(_kbRicerca);
    /* Se la ricerca ha escluso il capitolo aperto, si passa al primo trovato:
       lasciare a video un capitolo che non corrisponde alla ricerca fa credere
       che la ricerca non funzioni. */
    if (trovati.length && !trovati.some(c => c.id === _kbCapitoloAperto)) {
        _kbCapitoloAperto = trovati[0].id;
    }
    const cap = trovati.find(c => c.id === _kbCapitoloAperto) || trovati[0] || null;

    const indice = trovati.map(c => `
        <div class="kb-voce ${c.id === _kbCapitoloAperto ? 'attiva' : ''}"
             ${ceAct('_kbApri', [c.id])}>
            <span class="kb-ico">${c.icona}</span><span>${c.titolo}</span>
        </div>`).join('');

    const contenuto = !cap
        ? `<div class="em-empty">Nessun capitolo per «${_kbRicerca}». Prova con una parola sola.</div>`
        : `<h3>${cap.icona} ${cap.titolo}</h3>
           ${cap.sezioni.map(s => {
               let corpo;
               try { corpo = s.corpo(); }
               catch (e) { corpo = `<p><em>Questa sezione non è disponibile in questo momento.</em></p>`; }
               return `<div class="kb-sez"><div class="kb-sez-tit">${s.titolo}</div>${corpo}</div>`;
           }).join('')}`;

    container.innerHTML = `<div class="em"><div class="em-page em-wrap">

    <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--em-line)">
        <div class="em-sec" style="margin-bottom:4px">Knowledge Book</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:2px">Manuale di Chauffeur Empire</div>
        <div style="font-size:11px;color:var(--em-muted)">
            ${KB_CAPITOLI.length} capitoli · i numeri sono letti dal gioco, non copiati a mano
        </div>
    </div>

    <div class="kb-wrap">
        <div class="em-card kb-indice">
            <div style="padding:10px 10px 0">
                <input id="kb-cerca" class="kb-cerca" type="search" autocomplete="off"
                       placeholder="Cerca nel manuale…" value="${_kbRicerca.replace(/"/g, '&quot;')}">
            </div>
            <div style="padding-bottom:8px">${indice || ''}</div>
        </div>
        <div class="em-card"><div class="kb-corpo">${contenuto}</div></div>
    </div>

</div></div>`;

    /* Il campo di ricerca ha bisogno di un listener vero: la CSP del gioco vieta
       gli handler inline, e `ceAct` serve i click, non la digitazione. Si
       ridisegna solo l'indice e il contenuto, e si rimette il cursore dov'era,
       altrimenti scrivere due lettere di fila diventa impossibile. */
    const input = document.getElementById('kb-cerca');
    if (input) {
        input.addEventListener('input', (e) => {
            _kbRicerca = e.target.value;
            const pos = e.target.selectionStart;
            renderTabManuale();
            const nuovo = document.getElementById('kb-cerca');
            if (nuovo) { nuovo.focus(); try { nuovo.setSelectionRange(pos, pos); } catch (err) {} }
        });
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   AIUTO CONTESTUALE — «cos'è che sto guardando?»

   Vlad, 29/08/2026: «così i giocatori possono sempre capire subito cos'è che
   stanno guardando». Un manuale che esiste ma va cercato viene letto una volta
   e poi dimenticato; la domanda «cos'è questo?» nasce davanti alla schermata,
   non nell'indice, e va risposta lì.

   Un pulsante sempre presente apre il capitolo giusto per la scheda aperta, in
   un pannello sopra il gioco — non cambiando scheda: chi sta smistando corse e
   ha un dubbio non deve perdere il posto per toglierselo.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Ogni scheda del gioco al capitolo che la spiega. Le schede che non compaiono
   qui ricadono su «Le basi», che risponde comunque a «che gioco è». */
var KB_AIUTO_PER_SCHEDA = {
    home:       'basi',
    corse:      'corse',
    fleet:      'flotta',
    showroom:   'flotta',
    market:     'flotta',
    auctions:   'flotta',
    staff:      'persone',
    finance:    'patrimonio',
    invest:     'patrimonio',
    realestate: 'patrimonio',
    crypto:     'patrimonio',
    regions:    'territorio',
    provinces:  'territorio',
    b2b:        'contratti',
    contracts:  'contratti',
    tourism:    'contratti',
    infrastructure: 'contratti',
    marketing:  'reputazione',
    ranking:    'reputazione',
    prestigio:  'reputazione',
    consorzi:   'reputazione',
    legal:      'rischi',
    politics:   'rischi',
    shadow:     'rischi',
    nemesis:    'rischi',
    opa:        'rischi',
    store:      'driver-coins',
    career:     'basi',
    emails:     'basi',
    lifestyle:  'patrimonio',
    hq:         'flotta',
    help:       'glossario',
};

/** Il capitolo che spiega la scheda aperta adesso. */
function _kbCapitoloPerScheda(scheda) {
    const id = KB_AIUTO_PER_SCHEDA[scheda] || 'basi';
    return KB_CAPITOLI.find(c => c.id === id) || KB_CAPITOLI[0];
}

function _kbStilePannello() {
    if (document.getElementById('kb-aiuto-style')) return;
    const st = document.createElement('style');
    st.id = 'kb-aiuto-style';
    st.textContent = `
        #kb-aiuto-btn {
            position:fixed; right:18px; bottom:92px; z-index:1500;
            width:38px; height:38px; border-radius:50%; border:1px solid var(--em-line);
            background:var(--em-card,#161b22); color:var(--em-gold,#c79a2a);
            font-size:17px; font-weight:800; cursor:pointer; line-height:1;
            box-shadow:0 4px 14px rgba(0,0,0,.45);
            transition:transform .14s ease, border-color .14s ease, color .14s ease;
        }
        #kb-aiuto-btn:hover { transform:translateY(-2px); border-color:var(--em-gold,#c79a2a); }
        #kb-aiuto-btn:focus-visible { outline:2px solid var(--em-gold,#c79a2a); outline-offset:2px; }

        #kb-aiuto-velo {
            position:fixed; inset:0; z-index:2400; background:rgba(0,0,0,.72);
            display:flex; align-items:center; justify-content:center; padding:24px;
        }
        #kb-aiuto-pannello {
            width:min(720px,100%); max-height:82vh; display:flex; flex-direction:column;
            background:var(--em-card,#161b22); border:1px solid var(--em-line);
            border-radius:14px; box-shadow:0 24px 64px rgba(0,0,0,.6); overflow:hidden;
        }
        #kb-aiuto-testa {
            display:flex; align-items:center; gap:10px; padding:14px 18px;
            border-bottom:1px solid var(--em-line); flex-shrink:0;
        }
        #kb-aiuto-testa .t { font-size:15px; font-weight:800; color:var(--em-ink); flex:1; }
        #kb-aiuto-testa .x {
            background:none; border:none; color:var(--em-muted); font-size:22px;
            cursor:pointer; line-height:1; padding:0 4px;
        }
        #kb-aiuto-testa .x:hover { color:var(--em-ink); }
        #kb-aiuto-corpo { overflow-y:auto; padding:4px 18px 18px; }
        #kb-aiuto-pie {
            padding:12px 18px; border-top:1px solid var(--em-line); flex-shrink:0;
            display:flex; justify-content:space-between; align-items:center; gap:12px;
        }
        #kb-aiuto-pie .n { font-size:10.5px; color:var(--em-dim); }
        @media (max-width:720px) { #kb-aiuto-btn { bottom:120px; right:12px; } }
    `;
    document.head.appendChild(st);
}

/** Apre il pannello d'aiuto sul capitolo indicato (o su quello della scheda). */
window.kbAiuto = function(capitoloId) {
    _kbStile();          // gli stili delle tabelle: il pannello mostra le stesse
    _kbStilePannello();
    const esistente = document.getElementById('kb-aiuto-velo');
    if (esistente) esistente.remove();

    const scheda = (typeof _activeTab !== 'undefined' && _activeTab) ? _activeTab : 'home';
    const cap = capitoloId
        ? (KB_CAPITOLI.find(c => c.id === capitoloId) || _kbCapitoloPerScheda(scheda))
        : _kbCapitoloPerScheda(scheda);

    const sezioni = cap.sezioni.map(s => {
        let corpo;
        try { corpo = s.corpo(); }
        catch (e) { corpo = '<p><em>Questa sezione non è disponibile in questo momento.</em></p>'; }
        return `<div class="kb-sez"><div class="kb-sez-tit">${s.titolo}</div>${corpo}</div>`;
    }).join('');

    const velo = document.createElement('div');
    velo.id = 'kb-aiuto-velo';
    velo.innerHTML = `
      <div id="kb-aiuto-pannello" class="em" role="dialog" aria-modal="true" aria-label="Aiuto: ${cap.titolo}">
        <div id="kb-aiuto-testa">
            <span style="font-size:18px">${cap.icona}</span>
            <span class="t">${cap.titolo}</span>
            <button class="x" id="kb-aiuto-chiudi" aria-label="Chiudi">×</button>
        </div>
        <div id="kb-aiuto-corpo" class="kb-corpo">${sezioni}</div>
        <div id="kb-aiuto-pie">
            <span class="n">Capitolo del manuale · premi Esc per chiudere</span>
            <button class="em-goldbtn" id="kb-aiuto-tutto" style="padding:7px 14px;font-size:11px">
                Apri il manuale completo
            </button>
        </div>
      </div>`;
    document.body.appendChild(velo);

    const chiudi = () => {
        velo.remove();
        document.removeEventListener('keydown', suEsc);
    };
    /* Esc chiude, e il listener si toglie da solo: un pannello d'aiuto che
       lascia in giro un listener per ogni apertura diventa, dopo mezz'ora di
       gioco, mezz'ora di listener. */
    const suEsc = (e) => { if (e.key === 'Escape') chiudi(); };
    document.addEventListener('keydown', suEsc);
    velo.addEventListener('click', (e) => { if (e.target === velo) chiudi(); });
    velo.querySelector('#kb-aiuto-chiudi').addEventListener('click', chiudi);
    velo.querySelector('#kb-aiuto-tutto').addEventListener('click', () => {
        _kbCapitoloAperto = cap.id;
        chiudi();
        if (typeof window.switchTab === 'function') window.switchTab('manuale');
    });
    velo.querySelector('#kb-aiuto-chiudi').focus();
};

/** Il pulsante fisso. Si crea una volta e resta: cambia solo cosa spiega. */
window.kbMontaPulsanteAiuto = function() {
    if (typeof document === 'undefined' || !document.body) return;
    _kbStilePannello();
    if (document.getElementById('kb-aiuto-btn')) return;
    const b = document.createElement('button');
    b.id = 'kb-aiuto-btn';
    b.type = 'button';
    b.textContent = '?';
    b.addEventListener('click', () => window.kbAiuto());
    document.body.appendChild(b);
    window.kbAggiornaPulsanteAiuto();
};

/** Il titolo del pulsante dice cosa spiegherà: si scopre passandoci sopra,
 *  senza doverlo premere per capire se serve. */
window.kbAggiornaPulsanteAiuto = function() {
    const b = document.getElementById('kb-aiuto-btn');
    if (!b) return;
    const scheda = (typeof _activeTab !== 'undefined' && _activeTab) ? _activeTab : 'home';
    const cap = _kbCapitoloPerScheda(scheda);
    b.title = `Aiuto — ${cap.titolo}`;
    b.setAttribute('aria-label', `Aiuto: ${cap.titolo}`);
    // Nel manuale stesso il pulsante non serve.
    b.style.display = (scheda === 'manuale') ? 'none' : '';
};

if (typeof window !== 'undefined') {
    window.KB_CAPITOLI          = KB_CAPITOLI;
    window.KB_AIUTO_PER_SCHEDA  = KB_AIUTO_PER_SCHEDA;
    window.renderTabManuale     = renderTabManuale;
    window._kbFiltra            = _kbFiltra;
    window._kbCapitoloPerScheda = _kbCapitoloPerScheda;
}
