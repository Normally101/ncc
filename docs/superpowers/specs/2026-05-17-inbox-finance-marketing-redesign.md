# Inbox CEO · $WALL-ST Finance · Marketing Strategy — Design Spec

**Data:** 2026-05-17  
**Progetto:** Chauffeur Empire — Vanilla JS + Tailwind + Supabase

---

## 1. Inbox CEO — Redesign

### Problema
Il tab "Inbox CEO" (`renderTabEmails`) mostra tutte le email in una lista piatta con card minimali (2-3 righe). Nessuna gerarchia visiva, nessuna distinzione reale tra tipi diversi, corpo mail assente.

### Obiettivo
- 3 tab con badge contatore unread
- Card email-client moderna con corpo testuale ricco (4-8 righe)
- Pool di ~100 template unici (2-3 varianti corpo ciascuno) in `data.js`
- Template selezionato a random al momento della generazione email in `engine.js`

### Struttura Tab

| Tab | Tipi email inclusi |
|-----|--------------------|
| 🚨 Urgenti | `ceo_event`, `shadow`, `poaching`, `grey_market`, `rival_provoc` |
| 👑 VIP & Diamond | `vip_*`, `diamond` |
| 📋 Comunicazioni | `broker_result`, `driver_msg`, `info` |

Tab attivo persiste in `window._inboxTab` (default: `'urgenti'`).

### Card Layout

```
┌──────────────────────────────────────────────────┐
│ 👔  Marco Ferretti · Direttore HR, Rival Motors  │
│     Giorno 12, ore 14:00          [⚠ POACHING]  │
│                                                  │
│  Proposta per il suo autista Lorenzo Bianchi     │
│                                                  │
│  Gentile CEO,                                    │
│  Le scrivo a nome di Rival Motors SpA. Dopo      │
│  un'attenta ricerca di mercato, abbiamo          │
│  individuato in Lorenzo Bianchi un profilo di    │
│  eccellenza. Siamo pronti a offrirgli            │
│  €3.800/mese. Un'offerta, francamente, che       │
│  difficilmente potrà eguagliare.                 │
│                                                  │
│  Distinti saluti,                                │
│  Marco Ferretti                                  │
│                                                  │
│  [✅ Pareggia €3.800/mese]   [❌ Lascia andare]  │
└──────────────────────────────────────────────────┘
```

**Elementi:**
- `senderIcon` (emoji) + `senderName` (bold) + `senderRole/company` (gray)
- Timestamp gioco: `Giorno X, ore Y`
- Badge tipo (pill colorato top-right)
- `subject` — bold, 13px, bianco
- `body` — testo scelto da `bodies[]` del template, 9-10px, gray-300, line-height ampio
- Firma — italics, gray-500
- Bottoni azione invariati nella logica, solo riposizionati in fondo

**Colori badge per tipo:**
- `poaching` / `rival_provoc` → orange
- `ceo_event` → gold
- `shadow` / `grey_market` → red
- `vip_*` → purple
- `diamond` → yellow-400
- `broker_result` → green/red (in base a gain)
- `driver_msg` / `info` → blue

### Struttura Dati Template

```js
// data.js
const EMAIL_TEMPLATES = {
    poaching: [
        {
            id: 'poach_001',
            senderName: 'Marco Ferretti',
            senderRole: 'Direttore HR, {{rivalName}}',
            senderIcon: '👔',
            subject: 'Proposta per il suo autista {{driverName}}',
            signature: 'Cordialmente,\nMarco Ferretti\nDirettore HR',
            bodies: [
                'Gentile CEO,\n\nLe scrivo a nome di {{rivalName}}. Dopo un\'attenta ricerca di mercato, abbiamo individuato in {{driverName}} un profilo di eccellenza che si sposa perfettamente con la nostra visione aziendale. Siamo pronti a offrirgli un pacchetto retributivo di {{amount}}€/mese, con benefit aggiuntivi e prospettive di crescita concrete.\n\nSiamo certi che saprà valutare con equanimità questa comunicazione.',
                'Gentile Direttore,\n\n{{driverName}} ha attirato la nostra attenzione per le sue eccezionali performance sul territorio. In {{rivalName}} crediamo nel talento, e siamo disposti a riconoscerlo economicamente: {{amount}}€/mese, più bonus sulle performance trimestrali.\n\nLa informiamo per correttezza professionale.',
            ]
        },
        // ... altri template
    ],
    ceo_event: [ /* 20 template */ ],
    grey_market: [ /* 8 template */ ],
    shadow: [ /* 8 template */ ],
    vip_request: [ /* 12 template */ ],
    diamond: [ /* 8 template */ ],
    broker_result: [ /* 10 template */ ],
    driver_msg: [ /* 12 template */ ],
    info: [ /* 10 template */ ],
    rival_provoc: [ /* 8 template */ ],
};
```

**Variabili dinamiche nei template:**
`{{driverName}}`, `{{rivalName}}`, `{{amount}}`, `{{city}}`, `{{day}}`, `{{companyName}}`, `{{ceoName}}`

### Selezione Template in engine.js

Quando viene generata una email (es. poaching), invece di costruire l'oggetto inline:
1. Prendere `EMAIL_TEMPLATES[type]`
2. Scegliere template random dalla lista
3. Scegliere body random da `template.bodies[]`
4. Sostituire variabili dinamiche
5. Popolare `e.senderName`, `e.senderRole`, `e.senderIcon`, `e.subject`, `e.body`, `e.signature`

Per i tipi che non hanno template (fallback): usare la struttura esistente senza corpo.

---

## 2. $WALL-ST Finance — Redesign

### Problema
Il tab Finance ha tutto il necessario (tickers, broker, credit) ma è una lunga lista non strutturata, senza contesto sul portafoglio complessivo e senza feedback visivo sui movimenti di prezzo.

### Obiettivo
- Portfolio dashboard fisso in cima
- Sezioni chiaramente separate con header
- Prezzi con flash animato al cambio
- Bloomberg aesthetic: monospace, colori live

### Portfolio Dashboard

```js
// Calcolo da renderTabFinance()
const totalStockValue = STOCK_TICKERS.reduce((sum, t) => {
    const h = holdings[t.id] || { shares: 0 };
    return sum + h.shares * (prices[t.id] || t.basePrice);
}, 0);
const totalBrokerValue = brokerActive.reduce((s, i) => s + i.capital, 0);
const totalPortfolio = totalStockValue + totalBrokerValue;

// P&L giornaliero: differenza rispetto a gameState.portfolioValueYesterday
const dailyPL = totalPortfolio - (gameState.portfolioValueYesterday || totalPortfolio);
```

Dashboard HTML:
```
┌──────────────────────────────────────────────────┐
│ PORTAFOGLIO TOTALE                               │
│ €127.450              +€3.200 oggi  ▲ +2.6%      │
│                                                  │
│ Azioni ████████░░  €96.000    75%               │
│ Broker ████░░░░░░  €31.450    25%               │
└──────────────────────────────────────────────────┘
```

`gameState.portfolioValueYesterday` aggiornato in `processDailyRoutines()`.

### Price Flash Animation

CSS class `.price-flash-up` / `.price-flash-down` con `@keyframes`:
```css
@keyframes flashUp   { 0%{background:#16a34a40} 100%{background:transparent} }
@keyframes flashDown { 0%{background:#dc262640} 100%{background:transparent} }
.price-flash-up   { animation: flashUp   0.4s ease-out; }
.price-flash-down { animation: flashDown 0.4s ease-out; }
```

Applicato alla riga del ticker quando il prezzo cambia (confronto con valore precedente in `gameState.stockPrevPrices`).

### Layout Sezioni

```
── PORTAFOGLIO ─────────────  [dashboard]
── MERCATO AZIONARIO ───────  [ticker cards]
── BROKER PERSONALE ────────  [attivi + form]
── CREDITO & LEVA ──────────  [credit + prestiti]
```

Header sezione: `<h3 class="finance-section-header">` — stile gold, uppercase, con linea separatrice.

---

## 3. Marketing Strategy — Redesign

### Filosofia
Il Marketing diventa una vera strategia a lungo termine. Il giocatore deve scegliere consapevolmente tra due assi di crescita (Volume vs Prestige), gestire il decay del brand, ottimizzare il ROI delle campagne e adattare la strategia alla composizione della flotta.

### Meccanica Core: Dual Brand

`gameState.brandVolume` (0–100): influenza spawn di corse standard/economy  
`gameState.brandPrestige` (0–100): influenza spawn di corse VIP/business/diamond

**Effetti soglia:**

| BrandVolume | Effetto |
|------------|---------|
| 0-24 | nessun bonus |
| 25-49 | +8% corse standard |
| 50-74 | +18% corse standard |
| 75-99 | +30% corse standard |
| 100 | +40% corse standard + unlock Growth visibilità massima |

| BrandPrestige | Effetto |
|--------------|---------|
| 0-24 | nessun bonus |
| 25-49 | +10% spawn VIP |
| 50-74 | +25% spawn VIP · Diamond eligibility migliorata |
| 75-99 | +40% spawn VIP |
| 100 | +55% spawn VIP · Diamond garantiti ogni 3 giorni |

**Decay giornaliero** (in `processDailyRoutines`):
- Se nessuna campagna Volume attiva: `brandVolume -= 3`
- Se nessuna campagna Prestige attiva: `brandPrestige -= 2`
- Minimo 0, mai sotto 0

**Brand damage:**
- Multa grave: `-5 brandPrestige`
- Incidente autista: `-3 brandVolume`
- Diamond rifiutato: `-4 brandPrestige`

### Slot Campagne

- Base: 1 slot campagna attiva
- Con Marketing Director (staff): 2 slot
- 2 slot permettono di crescere Volume E Prestige contemporaneamente

### Struttura Dati Campagna

```js
{
    id: 'google_ads',
    name: 'Google Ads',
    icon: '🎯',
    tier: 'starter',               // 'starter' | 'growth' | 'empire'
    axis: 'volume',                // 'volume' | 'prestige' | 'both'
    dailyCost: 800,
    duration: 7,                   // giorni
    cooldown: 3,                   // giorni prima di poter riattivare
    volumeGain: 4,                 // +X brandVolume/giorno
    prestigeGain: 0,
    volumeBonus: 0.15,             // +15% corse dirette (separato da brand)
    prestigeBonus: 0,
    unlockBrand: 0,                // brand minimo per sbloccare
    synergy: null,                 // id campagna per bonus sinergia
    synergyBonus: 0,
    desc: 'Campagna pay-per-click sui principali motori di ricerca...',
    stratDesc: 'Ideale per aumentare rapidamente il volume di prenotazioni standard. ROI positivo già dal giorno 2 se hai flotta economy attiva.',
}
```

### Pool Campagne

**STARTER** (sempre disponibili):

| ID | Nome | Asse | Costo/g | Durata | VGain | PGain | VBonus | PBonus | Sinergia |
|----|------|------|---------|--------|-------|-------|--------|--------|----------|
| `google_ads` | Google Ads | volume | €800 | 7g | +4 | 0 | +15% | 0 | `social_media` |
| `social_media` | Social Media | both | €1.200 | 7g | +3 | +2 | +10% | +5% | `influencer` |
| `radio_locale` | Radio Locale | volume | €500 | 5g | +5 | 0 | +12% | 0 | — |
| `eventi_city` | City Events | prestige | €1.500 | 3g | 0 | +4 | 0 | +10% | — |
| `volantinaggio` | Volantinaggio | volume | €300 | 4g | +6 | 0 | +20% | 0 | — |

**GROWTH** (richiede Brand totale ≥ 50 in uno dei due assi):

| ID | Nome | Asse | Costo/g | Durata | VGain | PGain | VBonus | PBonus | Sinergia |
|----|------|------|---------|--------|-------|-------|--------|--------|----------|
| `tv_nazionale` | TV Nazionale | both | €8.000 | 14g | +8 | +6 | +20% | +10% | `radio_locale` |
| `serie_a` | Sponsorship Serie A | prestige | €12.000 | 30g | 0 | +10 | 0 | +25% | `luxury_mag` |
| `influencer` | Influencer Partnership | volume | €6.000 | 10g | +10 | +2 | +30% | 0 | `social_media` |
| `airport_brand` | Airport Branding | prestige | €9.000 | 21g | 0 | +8 | 0 | +20% | `tv_nazionale` |
| `crisis_mgmt` | Crisis Management | both | €4.000 | 5g | +5 | +5 | 0 | 0 | — |

**EMPIRE** (richiede Brand ≥ 75 in uno dei due assi + reputation ≥ 4.0):

| ID | Nome | Asse | Costo/g | Durata | VGain | PGain | VBonus | PBonus | Note |
|----|------|------|---------|--------|-------|-------|--------|--------|------|
| `formula1` | Formula 1 Sponsor | prestige | €35.000 | 30g | +5 | +15 | +10% | +40% | +0.2★ rep |
| `luxury_mag` | Luxury Magazine | prestige | €22.000 | 21g | 0 | +12 | 0 | +35% | — |
| `forbes_feature` | Forbes Feature | both | €50.000 | 1g | +20 | +20 | 0 | 0 | One-shot burst |
| `malpensa_lounge` | Malpensa Executive Lounge | prestige | €15.000 | 14g | 0 | +9 | 0 | +28% | solo Milano |

**Sinergie:** se 2 campagne con sinergia reciproca sono attive (slot 2), entrambi i bonus diretti aumentano del +20%.

### ROI Tracker

`gameState.campaignROI[campaignId]` accumulato in `processRideCompletion`:
```js
// Proporzione di revenue attribuita alla campagna attiva
const campaignContrib = activeCamp ? rideRevenue * activeCamp.volumeBonus : 0;
gameState.campaignROI[activeCamp.id] = (gameState.campaignROI[activeCamp.id] || 0) + campaignContrib;
```

Mostrato nella card campagna attiva: `Generato: +€X (ROI: Y%)`.

### Layout Tab Marketing

```
── BRAND AWARENESS ─────────────────────────────
  Volume  ████████░░  72        Prestige  ████░░░░░░  41

── SITUAZIONE MERCATO ──────────────────────────
  [meteo] [surge] [stagione]

── STRATEGIA TARIFFARIA ────────────────────────
  [Scontato] [Standard] [Premium]

── CAMPAGNE ─── STARTER | GROWTH | EMPIRE ──────
  [cards per tier attivo, locked se requisiti non met]

── ROI CAMPAGNA ATTIVA ─────────────────────────
  [box con costo, revenue generata, ROI %]
```

Campagne locked mostrano i requisiti chiaramente: "Richiede Brand Volume ≥ 50" o "Richiede reputazione ≥ 4.0".

---

## Scope Tecnico

### File modificati
- `data.js`: `EMAIL_TEMPLATES` (nuovo), `MARKETING_CAMPAIGNS` (rewrite completo)
- `dispatcher.js`: `renderTabEmails` (rewrite), `renderTabFinance` (rewrite), `renderTabMarketing` (rewrite)
- `engine.js`: selezione template email, brand decay, campaign effects su ride spawn, `portfolioValueYesterday`
- `style.css`: card email, portfolio dashboard, flash animation, brand gauge, campaign tier cards

### gameState additions
```js
gameState.brandVolume = 0;          // 0-100
gameState.brandPrestige = 0;        // 0-100
gameState.activeCampaigns = [];     // max 1-2 oggetti {id, startDay, endsDay, cooldownUntil}
gameState.campaignROI = {};         // {campaignId: totalRevenue}
gameState.portfolioValueYesterday = 0;
gameState.stockPrevPrices = {};     // per flash animation
```

Backward compat: se `gameState.activeCampaign` (vecchio string) esiste al load, convertire in `activeCampaigns[0]`.
