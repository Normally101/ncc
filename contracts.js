'use strict';
/* ═══════════════════════════════════════════════════════════════════════════
   contracts.js — Chauffeur Empire · Corporate Tender System
   100 corporate clients · AI bid engine · Passive contract income
   Tab: 'contracts' — add to Market dropdown in index.html
   ═══════════════════════════════════════════════════════════════════════════ */

const CORPORATE_COMPANIES = [
  { company_name:'Pear Technologies',          industry:'Tech & Silicon Valley',   tier:5, contract_duration_days:30, lore_description:'Trasporto dirigenti tra campus ultra-segreti e data center.',                                       tender_requirements:{ min_fleet_size:15, required_vehicle_type:'luxury_electric',   min_reputation:95 }, payout_per_hour:6500 },
  { company_name:'OmniSphere Cloud',           industry:'Cloud Infrastructure',     tier:5, contract_duration_days:30, lore_description:'Società cloud che possiede metà dei server del pianeta e nega qualsiasi monopolio.',            tender_requirements:{ min_fleet_size:18, required_vehicle_type:'executive_suv',      min_reputation:92 }, payout_per_hour:7100 },
  { company_name:'Quantum Ledger',             industry:'Crypto Finance',           tier:5, contract_duration_days:14, lore_description:'Fondo crypto aggressivo con CEO che parlano solo in buzzword.',                                   tender_requirements:{ min_fleet_size:12, required_vehicle_type:'luxury_sedan',       min_reputation:90 }, payout_per_hour:6200 },
  { company_name:'Royal Mirage Casinos',       industry:'Luxury Gambling',          tier:4, contract_duration_days:14, lore_description:'Catena di casinò dove i VIP perdono milioni fingendo di divertirsi.',                            tender_requirements:{ min_fleet_size:10, required_vehicle_type:'executive_van',       min_reputation:85 }, payout_per_hour:5100 },
  { company_name:'Helixion BioLabs',           industry:'Biotech',                  tier:4, contract_duration_days:30, lore_description:'Startup biotech valutata miliardi senza aver ancora curato nulla.',                                tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'electric_sedan',      min_reputation:84 }, payout_per_hour:4700 },
  { company_name:'Aureline Capital',           industry:'Hedge Fund',               tier:5, contract_duration_days:30, lore_description:'Hedge fund specializzato nello scommettere contro economie nazionali.',                           tender_requirements:{ min_fleet_size:20, required_vehicle_type:'armored_suv',        min_reputation:96 }, payout_per_hour:7800 },
  { company_name:'NeuroPulse AI',              industry:'Artificial Intelligence',  tier:4, contract_duration_days:14, lore_description:"Azienda AI che promette di sostituire ogni lavoro umano entro il trimestre.",                    tender_requirements:{ min_fleet_size:11, required_vehicle_type:'luxury_electric',    min_reputation:88 }, payout_per_hour:5200 },
  { company_name:'Black Harbor Logistics',     industry:'Shipping & Logistics',     tier:4, contract_duration_days:30, lore_description:'Colosso logistico accusato di conoscere troppe rotte non ufficiali.',                             tender_requirements:{ min_fleet_size:14, required_vehicle_type:'cargo_van',          min_reputation:82 }, payout_per_hour:4900 },
  { company_name:'Velvet Dominion',            industry:'Luxury Fashion',           tier:4, contract_duration_days:14, lore_description:'Brand fashion elitario che vende status sociale cucito a mano.',                                  tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'luxury_suv',         min_reputation:87 }, payout_per_hour:5000 },
  { company_name:'SkyLuxe Airways',            industry:'Private Aviation',         tier:5, contract_duration_days:30, lore_description:'Compagnia aerea privata per CEO che odiano condividere ossigeno.',                               tender_requirements:{ min_fleet_size:16, required_vehicle_type:'executive_sedan',     min_reputation:94 }, payout_per_hour:6900 },
  { company_name:'Titan Forge Defense',        industry:'Military Contractor',      tier:5, contract_duration_days:30, lore_description:'Contractor militare che chiama le guerre opportunità di crescita.',                              tender_requirements:{ min_fleet_size:22, required_vehicle_type:'armored_suv',        min_reputation:97 }, payout_per_hour:8600 },
  { company_name:'NovaTrust Bank',             industry:'Banking',                  tier:4, contract_duration_days:14, lore_description:"Banca internazionale che adora parlare di etica nei grattacieli offshore.",                     tender_requirements:{ min_fleet_size:10, required_vehicle_type:'business_sedan',     min_reputation:86 }, payout_per_hour:4800 },
  { company_name:'Iron Veil Security',         industry:'Cyber Security',           tier:4, contract_duration_days:14, lore_description:'Società cyber che probabilmente sa già tutto dei suoi clienti.',                                  tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'executive_suv',      min_reputation:88 }, payout_per_hour:5100 },
  { company_name:'Crimson Reef Petroleum',     industry:'Oil & Energy',             tier:5, contract_duration_days:30, lore_description:'Gigante petrolifero che sponsorizza conferenze green con jet privati.',                           tender_requirements:{ min_fleet_size:18, required_vehicle_type:'armored_suv',        min_reputation:93 }, payout_per_hour:7600 },
  { company_name:'PulseGrid Media',            industry:'Media Network',            tier:3, contract_duration_days:14, lore_description:'Conglomerato mediatico che monetizza indignazione e scandali.',                                   tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'business_sedan',     min_reputation:78 }, payout_per_hour:3600 },
  { company_name:'Nimbus Delivery',            industry:'Food Delivery',            tier:2, contract_duration_days:7,  lore_description:'App delivery che paga i rider in motivazione e badge digitali.',                                   tender_requirements:{ min_fleet_size:4,  required_vehicle_type:'compact_ev',         min_reputation:60 }, payout_per_hour:1500 },
  { company_name:'Atlas Continental Hotels',   industry:'Luxury Tourism',           tier:4, contract_duration_days:14, lore_description:'Catena hotel a cinque stelle dove il profumo costa più del minibar.',                             tender_requirements:{ min_fleet_size:11, required_vehicle_type:'executive_van',       min_reputation:84 }, payout_per_hour:4700 },
  { company_name:'Solstice Mobility',          industry:'Automotive',               tier:3, contract_duration_days:14, lore_description:'Startup EV che produce concept car e perdite finanziarie.',                                       tender_requirements:{ min_fleet_size:6,  required_vehicle_type:'electric_suv',       min_reputation:75 }, payout_per_hour:3300 },
  { company_name:'EverCrown Insurance',        industry:'Insurance',                tier:3, contract_duration_days:14, lore_description:'Compagnia assicurativa specializzata nel trovare clausole invisibili.',                            tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'business_sedan',     min_reputation:77 }, payout_per_hour:3400 },
  { company_name:'VantaCore Streaming',        industry:'Entertainment Streaming',  tier:4, contract_duration_days:14, lore_description:'Piattaforma streaming che cancella serie dopo due settimane.',                                    tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'luxury_suv',         min_reputation:83 }, payout_per_hour:4500 },
  { company_name:'Obsidian Freight Lines',     industry:'Freight Transport',        tier:3, contract_duration_days:14, lore_description:'Compagnia cargo nota per consegne sempre puntuali e misteriosamente sigillate.',                  tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'cargo_van',          min_reputation:79 }, payout_per_hour:3500 },
  { company_name:'Cinderhall Properties',      industry:'Real Estate',              tier:4, contract_duration_days:30, lore_description:'Gruppo immobiliare che trasforma quartieri storici in lobby minimaliste.',                         tender_requirements:{ min_fleet_size:10, required_vehicle_type:'luxury_sedan',       min_reputation:85 }, payout_per_hour:4900 },
  { company_name:'Praetorian State Services',  industry:'Government Contractor',    tier:5, contract_duration_days:30, lore_description:'Società privata che gestisce servizi pubblici meglio dei governi.',                              tender_requirements:{ min_fleet_size:20, required_vehicle_type:'armored_suv',        min_reputation:95 }, payout_per_hour:8100 },
  { company_name:'EchoMint Studios',           industry:'Music & Entertainment',    tier:3, contract_duration_days:7,  lore_description:'Etichetta musicale che produce hit usa e getta per algoritmi social.',                            tender_requirements:{ min_fleet_size:6,  required_vehicle_type:'luxury_van',         min_reputation:74 }, payout_per_hour:3100 },
  { company_name:'Blue Ember Pharma',          industry:'Pharmaceuticals',          tier:4, contract_duration_days:30, lore_description:'Multinazionale farmaceutica con avvocati più numerosi dei ricercatori.',                          tender_requirements:{ min_fleet_size:12, required_vehicle_type:'executive_sedan',     min_reputation:88 }, payout_per_hour:5500 },
  { company_name:'Iron Orchard Retail',        industry:'Retail',                   tier:2, contract_duration_days:7,  lore_description:'Catena retail che vende prodotti motivazionali made in sweatshop.',                               tender_requirements:{ min_fleet_size:5,  required_vehicle_type:'compact_suv',        min_reputation:62 }, payout_per_hour:1800 },
  { company_name:'Celestial Harbor Cruises',   industry:'Luxury Tourism',           tier:4, contract_duration_days:14, lore_description:'Crociere di lusso per milionari annoiati dal pianeta terra.',                                    tender_requirements:{ min_fleet_size:11, required_vehicle_type:'executive_van',       min_reputation:86 }, payout_per_hour:5200 },
  { company_name:'Delta Crown Aerospace',      industry:'Aerospace',                tier:5, contract_duration_days:30, lore_description:'Costruttore aerospaziale che riceve fondi pubblici da tre continenti.',                           tender_requirements:{ min_fleet_size:19, required_vehicle_type:'luxury_electric',    min_reputation:94 }, payout_per_hour:7700 },
  { company_name:'Ivory Dominion Legal',       industry:'Corporate Law',            tier:3, contract_duration_days:14, lore_description:"Studio legale che difende multinazionali contro l'umanità.",                                     tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'business_sedan',     min_reputation:80 }, payout_per_hour:3700 },
  { company_name:'Zenith Harbor Authority',    industry:'Port Operations',          tier:4, contract_duration_days:30, lore_description:'Autorità portuale con più container che trasparenza.',                                            tender_requirements:{ min_fleet_size:13, required_vehicle_type:'cargo_van',          min_reputation:84 }, payout_per_hour:5000 },
  { company_name:'Nova Dominion Ventures',     industry:'Venture Capital',          tier:4, contract_duration_days:14, lore_description:'VC che investe in app inutili chiamandole rivoluzioni culturali.',                               tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'electric_sedan',     min_reputation:83 }, payout_per_hour:4600 },
  { company_name:'HyperNest Mobility',         industry:'Urban Mobility',           tier:2, contract_duration_days:7,  lore_description:'Startup di monopattini elettrici sostenuta da miliardi e zero profitti.',                         tender_requirements:{ min_fleet_size:4,  required_vehicle_type:'compact_ev',         min_reputation:58 }, payout_per_hour:1400 },
  { company_name:'Silver Ark Maritime',        industry:'Shipping',                 tier:4, contract_duration_days:30, lore_description:'Compagnia navale con bandiere fiscali molto creative.',                                           tender_requirements:{ min_fleet_size:14, required_vehicle_type:'executive_suv',      min_reputation:85 }, payout_per_hour:5200 },
  { company_name:'Vortex Republic Media',      industry:'News Media',               tier:3, contract_duration_days:14, lore_description:'Network informativo che monetizza panico e clickbait.',                                           tender_requirements:{ min_fleet_size:6,  required_vehicle_type:'business_sedan',     min_reputation:76 }, payout_per_hour:3200 },
  { company_name:'Aurora Grid Energy',         industry:'Energy',                   tier:4, contract_duration_days:30, lore_description:'Corporation energetica che parla di sostenibilità davanti a raffinerie fumanti.',                 tender_requirements:{ min_fleet_size:12, required_vehicle_type:'electric_suv',       min_reputation:87 }, payout_per_hour:5600 },
  { company_name:'Cobalt Sovereign Bank',      industry:'Private Banking',          tier:5, contract_duration_days:30, lore_description:'Banca privata per oligarchi che preferiscono discrezione fiscale.',                              tender_requirements:{ min_fleet_size:18, required_vehicle_type:'armored_sedan',      min_reputation:96 }, payout_per_hour:7900 },
  { company_name:'Ghostline Courier Group',    industry:'Courier Services',         tier:2, contract_duration_days:7,  lore_description:'Corrieri rapidi specializzati in pacchi che nessuno deve aprire.',                                tender_requirements:{ min_fleet_size:5,  required_vehicle_type:'cargo_van',          min_reputation:63 }, payout_per_hour:1900 },
  { company_name:'Echelon Civic Authority',    industry:'Government',               tier:5, contract_duration_days:30, lore_description:'Agenzia governativa che esternalizza perfino le decisioni morali.',                               tender_requirements:{ min_fleet_size:25, required_vehicle_type:'armored_suv',        min_reputation:98 }, payout_per_hour:9200 },
  { company_name:'Mirage Nova Cosmetics',      industry:'Luxury Beauty',            tier:3, contract_duration_days:14, lore_description:'Brand beauty che vende autostima in confezioni dorate.',                                         tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'luxury_suv',         min_reputation:79 }, payout_per_hour:3600 },
  { company_name:'Steel Horizon Mining',       industry:'Mining',                   tier:4, contract_duration_days:30, lore_description:'Società mineraria che distrugge montagne con KPI impeccabili.',                                  tender_requirements:{ min_fleet_size:13, required_vehicle_type:'offroad_suv',        min_reputation:84 }, payout_per_hour:5300 },
  { company_name:'Nimbus Senate Consulting',   industry:'Political Consulting',     tier:4, contract_duration_days:14, lore_description:'Consulenti politici che chiamano propaganda gestione narrativa.',                                 tender_requirements:{ min_fleet_size:10, required_vehicle_type:'business_sedan',     min_reputation:86 }, payout_per_hour:4900 },
  { company_name:'Vaultline Data Systems',     industry:'Data Brokerage',           tier:4, contract_duration_days:14, lore_description:'Broker di dati che conosce le abitudini dei cittadini meglio delle famiglie.',                   tender_requirements:{ min_fleet_size:10, required_vehicle_type:'electric_sedan',     min_reputation:87 }, payout_per_hour:5100 },
  { company_name:'Ivory Crest Resorts',        industry:'Luxury Resorts',           tier:4, contract_duration_days:14, lore_description:'Resort tropicali costruiti sopra ecosistemi sacrificabili.',                                      tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'luxury_van',         min_reputation:83 }, payout_per_hour:4500 },
  { company_name:'VectorOne Robotics',         industry:'Robotics',                 tier:4, contract_duration_days:30, lore_description:'Produttore di robot che promette efficienza e disoccupazione.',                                  tender_requirements:{ min_fleet_size:11, required_vehicle_type:'luxury_electric',    min_reputation:89 }, payout_per_hour:5800 },
  { company_name:'HollowPeak Finance',         industry:'Investment Banking',       tier:5, contract_duration_days:30, lore_description:'Banca d\'investimento che considera le crisi opportunità stagionali.',                           tender_requirements:{ min_fleet_size:17, required_vehicle_type:'armored_sedan',      min_reputation:94 }, payout_per_hour:7600 },
  { company_name:'NorthAxis Telecom',          industry:'Telecommunications',       tier:3, contract_duration_days:14, lore_description:'Operatore telecom che ama i contratti più dei clienti.',                                          tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'business_suv',       min_reputation:77 }, payout_per_hour:3400 },
  { company_name:'Apex Dominion Security',     industry:'Private Security',         tier:5, contract_duration_days:30, lore_description:'Mercenari corporate in giacca italiana e auricolare dorato.',                                    tender_requirements:{ min_fleet_size:21, required_vehicle_type:'armored_suv',        min_reputation:97 }, payout_per_hour:8800 },
  { company_name:'MetroMint Grocers',          industry:'Retail Grocery',           tier:1, contract_duration_days:7,  lore_description:'Catena supermercati che vende avocado come beni di lusso.',                                      tender_requirements:{ min_fleet_size:3,  required_vehicle_type:'compact_van',        min_reputation:45 }, payout_per_hour:900  },
  { company_name:'Prism Republic Entertainment',industry:'Entertainment',           tier:3, contract_duration_days:14, lore_description:'Studio entertainment che ricicla reboot da vent\'anni.',                                         tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'luxury_suv',         min_reputation:80 }, payout_per_hour:3900 },
  { company_name:'Titan Ember Steelworks',     industry:'Heavy Industry',           tier:4, contract_duration_days:30, lore_description:'Acciaieria gigante con report ESG elegantemente illustrati.',                                    tender_requirements:{ min_fleet_size:12, required_vehicle_type:'industrial_pickup',  min_reputation:82 }, payout_per_hour:5000 },
  { company_name:'Velorum Space Transit',      industry:'Space Tourism',            tier:5, contract_duration_days:30, lore_description:'Turismo spaziale per miliardari che hanno esaurito gli yacht.',                                  tender_requirements:{ min_fleet_size:20, required_vehicle_type:'luxury_electric',    min_reputation:95 }, payout_per_hour:9100 },
  { company_name:'NovaCart Express',           industry:'E-Commerce Logistics',     tier:2, contract_duration_days:7,  lore_description:'Marketplace online che misura il tempo in consegne al minuto.',                                  tender_requirements:{ min_fleet_size:5,  required_vehicle_type:'cargo_van',          min_reputation:64 }, payout_per_hour:2000 },
  { company_name:'Crownline Sovereign Oil',    industry:'Petroleum',                tier:5, contract_duration_days:30, lore_description:'Cartello petrolifero con più influenza di alcuni governi.',                                      tender_requirements:{ min_fleet_size:19, required_vehicle_type:'armored_suv',        min_reputation:95 }, payout_per_hour:8200 },
  { company_name:'Blue Veil Analytics',        industry:'AI Analytics',             tier:4, contract_duration_days:14, lore_description:'Analisi predittiva per aziende che vogliono anticipare ogni comportamento umano.',               tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'electric_sedan',     min_reputation:86 }, payout_per_hour:4700 },
  { company_name:'IronPulse Fitness Group',    industry:'Fitness Franchise',        tier:2, contract_duration_days:7,  lore_description:'Palestre premium dove gli influencer allenano l\'ego.',                                          tender_requirements:{ min_fleet_size:4,  required_vehicle_type:'compact_suv',        min_reputation:61 }, payout_per_hour:1700 },
  { company_name:'Arclight Syndicate Media',   industry:'Digital Media',            tier:3, contract_duration_days:14, lore_description:'Media company costruita su podcast motivazionali e IPO gonfiate.',                               tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'business_sedan',     min_reputation:78 }, payout_per_hour:3500 },
  { company_name:'Mercury Continental Rail',   industry:'Rail Transport',           tier:4, contract_duration_days:30, lore_description:'Operatore ferroviario privato con lobby parlamentari dedicate.',                                 tender_requirements:{ min_fleet_size:13, required_vehicle_type:'executive_van',       min_reputation:84 }, payout_per_hour:5300 },
  { company_name:'Zenith Pure Water',          industry:'Utilities',                tier:3, contract_duration_days:14, lore_description:'Corporation idrica che vende acqua premium in bottiglie nere opache.',                           tender_requirements:{ min_fleet_size:6,  required_vehicle_type:'cargo_van',          min_reputation:73 }, payout_per_hour:3000 },
  { company_name:'Eclipse Dynasty Holdings',   industry:'Conglomerate',             tier:5, contract_duration_days:30, lore_description:'Conglomerato senza volto che possiede aziende che possiedono altre aziende.',                    tender_requirements:{ min_fleet_size:24, required_vehicle_type:'armored_sedan',      min_reputation:99 }, payout_per_hour:9800 },
  { company_name:'Crimson Vale BioSystems',    industry:'Biotech',                  tier:4, contract_duration_days:30, lore_description:'Laboratori biotech con NDA più spessi dei manuali scientifici.',                                 tender_requirements:{ min_fleet_size:11, required_vehicle_type:'electric_suv',       min_reputation:87 }, payout_per_hour:5600 },
  { company_name:'Royal Ember Couture',        industry:'Luxury Fashion',           tier:4, contract_duration_days:14, lore_description:'Maison fashion che vende esclusività cucita in serie limitate artificiali.',                     tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'luxury_sedan',       min_reputation:85 }, payout_per_hour:4700 },
  { company_name:'ShadowArc Intelligence',     industry:'Private Intelligence',     tier:5, contract_duration_days:30, lore_description:'Società d\'intelligence privata che fattura paranoia geopolitica.',                              tender_requirements:{ min_fleet_size:22, required_vehicle_type:'armored_suv',        min_reputation:98 }, payout_per_hour:9400 },
  { company_name:'LunarMint Hospitality',      industry:'Hospitality',              tier:3, contract_duration_days:14, lore_description:'Hotel boutique per manager che lavorano anche in vacanza.',                                       tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'executive_van',       min_reputation:76 }, payout_per_hour:3300 },
  { company_name:'Atlas Republic Freight',     industry:'Global Logistics',         tier:4, contract_duration_days:30, lore_description:'Rete logistica globale che considera i confini suggerimenti.',                                   tender_requirements:{ min_fleet_size:15, required_vehicle_type:'cargo_van',          min_reputation:85 }, payout_per_hour:5500 },
  { company_name:'NovaSilk Lifestyle',         industry:'Luxury Retail',            tier:3, contract_duration_days:14, lore_description:'Retail lifestyle per clienti che comprano personalità prefabbricate.',                            tender_requirements:{ min_fleet_size:6,  required_vehicle_type:'luxury_suv',         min_reputation:74 }, payout_per_hour:3200 },
  { company_name:'Obelisk National Reserve',   industry:'Central Banking',          tier:5, contract_duration_days:30, lore_description:'Istituzione finanziaria che stampa stabilità monetaria e panico simultaneamente.',               tender_requirements:{ min_fleet_size:20, required_vehicle_type:'armored_sedan',      min_reputation:97 }, payout_per_hour:8700 },
  { company_name:'Nimbus Civic Infrastructure',industry:'Infrastructure',           tier:4, contract_duration_days:30, lore_description:'Gestore infrastrutturale che privatizza qualsiasi cosa abbia un pedaggio.',                      tender_requirements:{ min_fleet_size:14, required_vehicle_type:'executive_suv',      min_reputation:83 }, payout_per_hour:5200 },
  { company_name:'Echo Harbor Airlines',       industry:'Airlines',                 tier:4, contract_duration_days:14, lore_description:'Compagnia aerea premium con biglietti più costosi del carburante.',                              tender_requirements:{ min_fleet_size:12, required_vehicle_type:'luxury_van',         min_reputation:84 }, payout_per_hour:4900 },
  { company_name:'Titan Hive Warehousing',     industry:'Warehousing',              tier:3, contract_duration_days:14, lore_description:'Magazzini automatizzati dove gli umani sono accessori temporanei.',                              tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'cargo_van',          min_reputation:79 }, payout_per_hour:3600 },
  { company_name:'Velvet Circuit Records',     industry:'Music Industry',           tier:3, contract_duration_days:7,  lore_description:'Label musicale guidata da trend TikTok e algoritmi senz\'anima.',                                tender_requirements:{ min_fleet_size:5,  required_vehicle_type:'luxury_suv',         min_reputation:72 }, payout_per_hour:2800 },
  { company_name:'Iron Dominion Mercantile',   industry:'Global Trade',             tier:4, contract_duration_days:30, lore_description:'Trading company che compra governi con strette di mano eleganti.',                              tender_requirements:{ min_fleet_size:13, required_vehicle_type:'executive_sedan',     min_reputation:88 }, payout_per_hour:5900 },
  { company_name:'SkyForge Dynamics',          industry:'Defense Technology',       tier:5, contract_duration_days:30, lore_description:'Tecnologia militare presentata come innovazione patriottica.',                                   tender_requirements:{ min_fleet_size:23, required_vehicle_type:'armored_suv',        min_reputation:98 }, payout_per_hour:9500 },
  { company_name:'Prism Harbor Ventures',      industry:'Private Equity',           tier:4, contract_duration_days:14, lore_description:'Fondo che compra aziende sane e le trasforma in PowerPoint.',                                   tender_requirements:{ min_fleet_size:10, required_vehicle_type:'luxury_sedan',       min_reputation:86 }, payout_per_hour:5000 },
  { company_name:'VantaLine Pharma Logistics', industry:'Medical Logistics',        tier:4, contract_duration_days:30, lore_description:'Trasporto farmaceutico con margini di profitto chirurgici.',                                    tender_requirements:{ min_fleet_size:12, required_vehicle_type:'refrigerated_van',   min_reputation:84 }, payout_per_hour:5100 },
  { company_name:'Aurex Prime Crypto',         industry:'Cryptocurrency',           tier:4, contract_duration_days:14, lore_description:'Exchange crypto che collassa ogni inverno finanziario.',                                          tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'luxury_electric',    min_reputation:85 }, payout_per_hour:4700 },
  { company_name:'MetroVale Transit',          industry:'Public Transport',         tier:3, contract_duration_days:14, lore_description:'Trasporto urbano privatizzato con puntualità opzionale.',                                        tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'executive_van',       min_reputation:75 }, payout_per_hour:3400 },
  { company_name:'Royal Obsidian Trust',       industry:'Wealth Management',        tier:5, contract_duration_days:30, lore_description:'Gestione patrimoni per famiglie che possiedono isole e parlamentari.',                           tender_requirements:{ min_fleet_size:18, required_vehicle_type:'armored_sedan',      min_reputation:96 }, payout_per_hour:8400 },
  { company_name:'Ghost Harbor Imports',       industry:'Import Export',            tier:3, contract_duration_days:14, lore_description:'Import export con registri doganali sorprendentemente incompleti.',                              tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'cargo_van',          min_reputation:78 }, payout_per_hour:3500 },
  { company_name:'Ivory Pulse Media Labs',     industry:'Social Media',             tier:3, contract_duration_days:14, lore_description:'Fabbrica di engagement tossico e metriche gonfiate.',                                            tender_requirements:{ min_fleet_size:6,  required_vehicle_type:'business_sedan',     min_reputation:74 }, payout_per_hour:3100 },
  { company_name:'Nova Crown Defense Logistics',industry:'Military Logistics',      tier:5, contract_duration_days:30, lore_description:'Logistica bellica con slide aziendali incredibilmente rassicuranti.',                            tender_requirements:{ min_fleet_size:22, required_vehicle_type:'armored_truck',      min_reputation:97 }, payout_per_hour:9300 },
  { company_name:'Blue Zenith Insurance',      industry:'Insurance',                tier:3, contract_duration_days:14, lore_description:'Assicurazioni premium con chatbot più empatici degli umani.',                                   tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'business_suv',       min_reputation:76 }, payout_per_hour:3300 },
  { company_name:'Oblivion Frontier Energy',   industry:'Energy Extraction',        tier:5, contract_duration_days:30, lore_description:'Energia estrema finanziata da lobby estremamente motivate.',                                    tender_requirements:{ min_fleet_size:21, required_vehicle_type:'offroad_armored_suv',min_reputation:95 }, payout_per_hour:8800 },
  { company_name:'Velorum Civic Media',        industry:'Political Media',          tier:4, contract_duration_days:14, lore_description:'Media politico che trasforma propaganda in editoriali premium.',                                 tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'executive_sedan',     min_reputation:84 }, payout_per_hour:4500 },
  { company_name:'Steel Bloom Agriculture',    industry:'AgriTech',                 tier:2, contract_duration_days:7,  lore_description:'Agricoltura smart piena di sensori e investitori urbani.',                                       tender_requirements:{ min_fleet_size:5,  required_vehicle_type:'utility_pickup',     min_reputation:60 }, payout_per_hour:1800 },
  { company_name:'Mirage Harbor Aviation',     industry:'Executive Aviation',       tier:4, contract_duration_days:14, lore_description:'Jet privati per dirigenti che considerano gli aeroporti pubblici offensivi.',                   tender_requirements:{ min_fleet_size:11, required_vehicle_type:'luxury_sedan',       min_reputation:88 }, payout_per_hour:5400 },
  { company_name:'Apex Republic Cybernetics',  industry:'Cybernetics',              tier:5, contract_duration_days:30, lore_description:"Impianti cyber venduti come evoluzione inevitabile dell'umanità.",                              tender_requirements:{ min_fleet_size:19, required_vehicle_type:'luxury_electric',    min_reputation:94 }, payout_per_hour:8100 },
  { company_name:'Silver Vault Treasury',      industry:'Government Finance',       tier:5, contract_duration_days:30, lore_description:'Tesoreria semi-statale che tratta il debito come arte moderna.',                                 tender_requirements:{ min_fleet_size:20, required_vehicle_type:'armored_sedan',      min_reputation:97 }, payout_per_hour:8900 },
  { company_name:'Crimson Atlas Shipping',     industry:'Shipping',                 tier:4, contract_duration_days:30, lore_description:'Container ovunque, responsabilità da nessuna parte.',                                            tender_requirements:{ min_fleet_size:14, required_vehicle_type:'cargo_van',          min_reputation:83 }, payout_per_hour:5000 },
  { company_name:'Neon Dominion Interactive',  industry:'Gaming',                   tier:3, contract_duration_days:14, lore_description:'Publisher gaming che monetizza persino i menu.',                                                  tender_requirements:{ min_fleet_size:7,  required_vehicle_type:'luxury_suv',         min_reputation:79 }, payout_per_hour:3700 },
  { company_name:'Cobalt Peak Holdings',       industry:'Corporate Holdings',       tier:5, contract_duration_days:30, lore_description:'Holding finanziaria costruita sopra altre holding finanziarie.',                                 tender_requirements:{ min_fleet_size:18, required_vehicle_type:'armored_suv',        min_reputation:96 }, payout_per_hour:8500 },
  { company_name:'Nova Ember Foods',           industry:'Food Industry',            tier:2, contract_duration_days:7,  lore_description:'Fast food premium per professionisti troppo stanchi per vivere.',                                tender_requirements:{ min_fleet_size:4,  required_vehicle_type:'compact_van',        min_reputation:57 }, payout_per_hour:1600 },
  { company_name:'Iron Vein Petrochem',        industry:'Petrochemicals',           tier:5, contract_duration_days:30, lore_description:'Petrolchimica industriale con pubblicità piene di prati verdi.',                                 tender_requirements:{ min_fleet_size:20, required_vehicle_type:'armored_suv',        min_reputation:95 }, payout_per_hour:8700 },
  { company_name:'Velvet Nexus Social',        industry:'Social Platforms',         tier:4, contract_duration_days:14, lore_description:'Social network costruito per tenere gli utenti eternamente online.',                             tender_requirements:{ min_fleet_size:10, required_vehicle_type:'electric_sedan',     min_reputation:86 }, payout_per_hour:4900 },
  { company_name:'Atlas Ember Aviation Fuel',  industry:'Aviation Energy',          tier:4, contract_duration_days:30, lore_description:'Fornitore carburante per jet con prezzi scritti in geroglifici.',                               tender_requirements:{ min_fleet_size:12, required_vehicle_type:'industrial_pickup',  min_reputation:82 }, payout_per_hour:5100 },
  { company_name:'Praxis Dominion AI',         industry:'Artificial Intelligence',  tier:5, contract_duration_days:30, lore_description:'AI corporation che promette efficienza totale e supervisione minima.',                          tender_requirements:{ min_fleet_size:17, required_vehicle_type:'luxury_electric',    min_reputation:93 }, payout_per_hour:7800 },
  { company_name:'Lunar Forge Capital',        industry:'Asset Management',         tier:4, contract_duration_days:14, lore_description:'Gestori patrimoniali che chiamano speculazione strategia.',                                      tender_requirements:{ min_fleet_size:9,  required_vehicle_type:'luxury_sedan',       min_reputation:84 }, payout_per_hour:4600 },
  { company_name:'Shadow Republic Logistics',  industry:'Shadow Logistics',         tier:5, contract_duration_days:30, lore_description:'Logistica ultra-discreta per clienti che non lasciano ricevute.',                               tender_requirements:{ min_fleet_size:23, required_vehicle_type:'armored_van',        min_reputation:99 }, payout_per_hour:9900 },
  { company_name:'Aureline Civic Transit',     industry:'Urban Transport',          tier:3, contract_duration_days:14, lore_description:'Mobilità urbana sponsorizzata da pubblicità invasive.',                                          tender_requirements:{ min_fleet_size:8,  required_vehicle_type:'electric_van',       min_reputation:74 }, payout_per_hour:3200 },
  { company_name:'Royal Apex Diamonds',        industry:'Luxury Commodities',       tier:4, contract_duration_days:30, lore_description:'Diamanti certificati eticamente da loro stessi.',                                                tender_requirements:{ min_fleet_size:12, required_vehicle_type:'armored_sedan',      min_reputation:90 }, payout_per_hour:6100 },
  { company_name:'Nova District Authority',    industry:'Municipal Government',     tier:4, contract_duration_days:14, lore_description:'Distretto urbano amministrato come una startup IPO-ready.',                                     tender_requirements:{ min_fleet_size:11, required_vehicle_type:'executive_suv',      min_reputation:85 }, payout_per_hour:5000 },
  { company_name:'Iron Halo Emergency Systems',industry:'Emergency Infrastructure', tier:5, contract_duration_days:30, lore_description:"Infrastrutture d'emergenza privatizzate fino all'ultimo estintore.",                            tender_requirements:{ min_fleet_size:19, required_vehicle_type:'armored_suv',        min_reputation:96 }, payout_per_hour:8600 },
];

/* ─── Helpers ─────────────────────────────────────────────────────────── */
// required_vehicle_type → minimum car tier in the game's tier system
const _CONTRACT_VEH_TIER = {
    armored_suv:'ultra',        armored_sedan:'ultra',      armored_van:'ultra',
    armored_truck:'ultra',      offroad_armored_suv:'ultra',
    luxury_electric:'vip',      luxury_sedan:'vip',         luxury_suv:'vip',       luxury_van:'vip',
    executive_suv:'business',   executive_sedan:'business', executive_van:'business',
    electric_sedan:'business',  electric_suv:'business',    offroad_suv:'business',
    business_sedan:'standard',  business_suv:'standard',    cargo_van:'standard',
    compact_ev:'standard',      compact_suv:'standard',     compact_van:'standard',
    industrial_pickup:'standard',refrigerated_van:'standard',utility_pickup:'standard',
    electric_van:'standard',
};
const _C_RANK = { standard:1, business:2, vip:3, group:3, ultra:4 };

function _cCountQualifying(vehType) {
    const minRank = _C_RANK[_CONTRACT_VEH_TIER[vehType] || 'standard'] || 1;
    return (gameState?.fleet || []).filter(c =>
        !c.outOfService && (c.condition || 0) > 10 && (_C_RANK[c.tier] || 1) >= minRank
    ).length;
}

function _cPlayerScore(company, pledgeAmt) {
    const gs = gameState; if (!gs) return 0;
    const req = company.tender_requirements;
    const repPct   = (gs.reputation || 0) / 5.0 * 100;
    const fleetPct = Math.min(100, _cCountQualifying(req.required_vehicle_type) / req.min_fleet_size * 100);
    const pledgePct= Math.min(100, (pledgeAmt || 0) / 50000 * 100);
    return Math.round(repPct * 0.40 + fleetPct * 0.40 + pledgePct * 0.20);
}

// Simulated rival score by company tier (2–3 AI rivals per tender)
function _cAIScore(tier) {
    const base   = [25, 40, 54, 64, 77][tier - 1] || 50;
    const spread = [16, 15, 14, 13, 12][tier - 1] || 14;
    return Math.round(base + Math.random() * spread);
}

const _TIER_COLORS = { 1:'gray', 2:'green', 3:'blue', 4:'purple', 5:'orange' };

/* ─── CE_Contracts engine ─────────────────────────────────────────────── */
window.CE_Contracts = (() => {
    const BATCH      = 4;   // tenders per batch
    const OPEN_DAYS  = 2;   // days a tender stays open
    const CYCLE_DAYS = 3;   // days between batches

    function _usedIds() {
        const t = (gameState.corporateTenders   || []).map(x => x.companyId);
        const c = (gameState.corporateContracts || []).filter(x => x.status === 'active').map(x => x.companyId);
        return [...new Set([...t, ...c])];
    }

    function _generateBatch() {
        const used = _usedIds();
        const pool = CORPORATE_COMPANIES.filter(c => !used.includes(c.company_name));
        if (!pool.length) { gameState.nextTenderDay = gameState.day + CYCLE_DAYS; return; }
        const picks = [...pool].sort(() => Math.random() - 0.5).slice(0, BATCH);
        picks.forEach(company => gameState.corporateTenders.push({
            id: 'tndr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
            companyId: company.company_name,
            company,
            openedDay:  gameState.day,
            closingDay: gameState.day + OPEN_DAYS,
            playerBid:  null,
            status:     'open',
        }));
        gameState.nextTenderDay = gameState.day + CYCLE_DAYS;
        window.DS?.alert?.({ text: `🤝 ${picks.length} nuovi bandi corporate — scadono tra ${OPEN_DAYS} giorni`, type:'info', tab:'contracts', duration:10000 });
    }

    function _resolve() {
        const now = gameState.day;
        const closing = (gameState.corporateTenders || []).filter(t => t.status === 'open' && now >= t.closingDay);
        closing.forEach(tender => {
            const co = tender.company;
            const aiScores = Array.from({ length: 2 + Math.floor(Math.random() * 2) }, () => _cAIScore(co.tier));
            const bestAI   = Math.max(...aiScores);
            const pb       = tender.playerBid;
            const pScore   = pb ? pb.score : -1;
            tender.status  = 'closed';
            const won      = pb && pScore >= bestAI;
            if (won) {
                if (pb.pledgedCash > 0) gameState.cash -= pb.pledgedCash;
                const daily = Math.round(co.payout_per_hour * 16);
                gameState.corporateContracts.push({
                    id: 'ctr_' + tender.id, companyId: co.company_name, company: co,
                    startDay: now, endDay: now + co.contract_duration_days,
                    dailyPayout: daily, totalEarned: 0, status: 'active',
                });
                window.DS?.alert?.({ text:`🤝 CONTRATTO VINTO: ${co.company_name} — €${daily.toLocaleString('it-IT')}/gg`, type:'success', tab:'contracts', duration:12000 });
            } else {
                if (pb && pb.pledgedCash > 0) gameState.cash += pb.pledgedCash; // refund pledge on loss
                if (pb) window.DS?.alert?.({ text:`❌ Bando perso: ${co.company_name} (score ${pScore} vs AI ${bestAI})`, type:'warning', duration:8000 });
            }
            tender.result = { won, pScore, bestAI, aiCount: aiScores.length };
            gameState.tenderHistory = [...(gameState.tenderHistory || []), tender].slice(-30);
        });
        gameState.corporateTenders = (gameState.corporateTenders || []).filter(t => t.status === 'open');
    }

    function _collectEarnings() {
        (gameState.corporateContracts || []).filter(c => c.status === 'active').forEach(c => {
            gameState.cash     += c.dailyPayout;
            c.totalEarned       = (c.totalEarned || 0) + c.dailyPayout;
        });
    }

    function _expireContracts() {
        const now = gameState.day;
        (gameState.corporateContracts || []).forEach(c => {
            if (c.status === 'active' && now >= c.endDay) {
                c.status = 'expired';
                window.DS?.alert?.({ text:`📋 Contratto ${c.company.company_name} scaduto`, type:'info', duration:7000 });
            }
        });
        const active  = (gameState.corporateContracts || []).filter(c => c.status === 'active');
        const history = (gameState.corporateContracts || []).filter(c => c.status !== 'active').slice(-10);
        gameState.corporateContracts = [...active, ...history];
    }

    return {
        initState() {
            if (!gameState.corporateTenders)   gameState.corporateTenders   = [];
            if (!gameState.corporateContracts) gameState.corporateContracts = [];
            if (!gameState.tenderHistory)      gameState.tenderHistory      = [];
            if (gameState.nextTenderDay === undefined) gameState.nextTenderDay = (gameState.day || 1) + 2;
        },
        dailyTick() {
            if (!window.gameState) return;
            this.initState();
            _collectEarnings();
            _expireContracts();
            _resolve();
            if (gameState.day >= (gameState.nextTenderDay ?? 2)) _generateBatch();
        },
        meetsRequirements(company) {
            const req          = company.tender_requirements;
            const playerRepPct = Math.round((gameState.reputation || 0) / 5.0 * 100);
            const qualifying   = _cCountQualifying(req.required_vehicle_type);
            return { repOk: playerRepPct >= req.min_reputation, fleetOk: qualifying >= req.min_fleet_size, qualifying, playerRepPct };
        },
    };
})();

/* ─── Player actions ──────────────────────────────────────────────────── */
window.CE_placeBid = function(tenderId, pledgedCash) {
    const tender = (gameState.corporateTenders || []).find(t => t.id === tenderId);
    if (!tender || tender.status !== 'open') return;
    pledgedCash = Math.max(0, Math.min(50000, parseInt(pledgedCash) || 0));
    if (tender.playerBid) gameState.cash += tender.playerBid.pledgedCash; // refund previous pledge
    if (pledgedCash > (gameState.cash || 0)) {
        return window.DS?.toast?.({ title:'Fondi insufficienti', msg:`Servono €${pledgedCash.toLocaleString('it-IT')}`, type:'error' });
    }
    gameState.cash  -= pledgedCash;
    tender.playerBid = { pledgedCash, score: _cPlayerScore(tender.company, pledgedCash) };
    if (typeof saveGame === 'function') saveGame();
    window.renderTabContracts?.();
    window.DS?.toast?.({ title:'Offerta inviata!', msg:`Score: ${tender.playerBid.score}/100 · Pledge: €${pledgedCash.toLocaleString('it-IT')}`, type:'success' });
};

window.CE_cancelBid = function(tenderId) {
    const tender = (gameState.corporateTenders || []).find(t => t.id === tenderId);
    if (!tender || !tender.playerBid) return;
    gameState.cash      += tender.playerBid.pledgedCash;
    tender.playerBid     = null;
    if (typeof saveGame === 'function') saveGame();
    window.renderTabContracts?.();
    window.DS?.toast?.({ title:'Offerta annullata', msg:'Pledge rimborsato', type:'info' });
};

window.CE_terminateContract = function(contractId) {
    const idx = (gameState.corporateContracts || []).findIndex(c => c.id === contractId);
    if (idx < 0) return;
    if (!window.confirm('Terminare il contratto anticipatamente? Nessun indennizzo.')) return;
    gameState.corporateContracts[idx].status = 'terminated';
    if (typeof saveGame === 'function') saveGame();
    window.renderTabContracts?.();
};

window.CE_updateBidPreview = function(tenderId, pledgeAmt) {
    const tender = (gameState.corporateTenders || []).find(t => t.id === tenderId);
    if (!tender) return;
    const score = _cPlayerScore(tender.company, parseInt(pledgeAmt) || 0);
    const el    = document.getElementById('bid-score-' + tenderId);
    const pEl   = document.getElementById('bid-pledge-val-' + tenderId);
    if (el)  el.textContent  = score;
    if (pEl) pEl.textContent = '€' + (parseInt(pledgeAmt) || 0).toLocaleString('it-IT');
};

const OPEN_DAYS_LABEL = 2;

/* ─── UI renderer ─────────────────────────────────────────────────────── */
window.renderTabContracts = function() {
    const container = document.getElementById('tab-container');
    if (!container) return;
    CE_Contracts.initState();

    const gs        = gameState;
    const tenders   = gs.corporateTenders   || [];
    const contracts = gs.corporateContracts || [];
    const history   = gs.tenderHistory      || [];
    const active    = contracts.filter(c => c.status === 'active');
    const dailyRev  = active.reduce((s, c) => s + c.dailyPayout, 0);
    const pending   = tenders.filter(t => t.playerBid);
    const daysNext  = Math.max(0, (gs.nextTenderDay || 0) - gs.day);

    container.innerHTML = `<div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #21262d">
        <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Corporate Deals</div>
        <div style="font-size:20px;font-weight:700;color:#e6edf3">Bandi &amp; Contratti Aziendali</div>
        <div style="font-size:11px;color:#8b949e;margin-top:4px">Vinci bandi d'appalto contro rivali AI — incassa reddito passivo per ogni contratto attivo</div>
    </div>` + `
    <div>

    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:20px">
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Contratti Attivi</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${active.length > 0 ? '#3fb950' : '#e6edf3'}">${active.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Ricavo Giornaliero</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${dailyRev > 0 ? '#3fb950' : '#e6edf3'}">€${dailyRev.toLocaleString('it-IT')}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Bandi Aperti</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${tenders.length > 0 ? '#58a6ff' : '#e6edf3'}">${tenders.length}</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Prossimo Batch</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:#e6edf3">${daysNext}gg</div>
        </div>
        <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:12px 16px">
            <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Offerte Inviate</div>
            <div style="font-size:20px;font-weight:700;font-family:monospace;color:${pending.length > 0 ? '#58a6ff' : '#e6edf3'}">${pending.length}</div>
        </div>
    </div>

    <!-- ── Open Tenders ── -->
    <div style="font-size:9px;font-weight:700;color:#58a6ff;text-transform:uppercase;letter-spacing:.08em;margin:0 0 10px">
      Bandi Aperti ${tenders.length > 0 ? `<span style="color:#6b7280;font-weight:400;text-transform:none;letter-spacing:0">— scadono dopo ${OPEN_DAYS_LABEL} giorni</span>` : ''}
    </div>

    ${tenders.length === 0 ? `
      <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;padding:24px;text-align:center;color:#6b7280;font-size:11px;margin-bottom:16px">
        Nessun bando disponibile — il prossimo batch tra <strong style="color:#e6edf3">${daysNext} giorni</strong>
      </div>
    ` : tenders.map(t => _renderTenderCard(t)).join('')}

    <!-- ── Active Contracts ── -->
    ${active.length > 0 ? `
      <div style="font-size:9px;font-weight:700;color:#3fb950;text-transform:uppercase;letter-spacing:.08em;margin:20px 0 10px">Contratti Attivi</div>
      ${active.map(c => _renderContractCard(c)).join('')}
    ` : ''}

    <!-- ── History ── -->
    ${history.length > 0 ? `
      <div style="font-size:9px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin:20px 0 10px">Storico Bandi</div>
      <div style="background:#161b22;border:1px solid #21262d;border-radius:6px;overflow:hidden;margin-bottom:16px">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr>
            <th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d">Azienda</th>
            <th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d">Tier</th>
            <th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:left;border-bottom:1px solid #21262d">Esito</th>
            <th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #21262d">Score</th>
            <th style="padding:7px 14px;font-size:9px;font-family:monospace;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:600;text-align:right;border-bottom:1px solid #21262d">Payout/gg</th>
          </tr></thead>
          <tbody>
            ${[...history].reverse().map(t => {
              const _name  = t.company.company_name;
              const _tier  = t.company.tier;
              const _won   = t.result?.won;
              const _pScore= t.result?.pScore ?? '—';
              const _aiScore=t.result?.bestAI ?? '—';
              const _daily = Math.round(t.company.payout_per_hour * 16);
              const _tc    = _TIER_COLORS[_tier] || 'gray';
              const _tc2   = _tc === 'gold' ? '#d4af37' : _tc === 'blue' ? '#58a6ff' : _tc === 'green' ? '#3fb950' : '#8b949e';
              return `<tr style="border-bottom:1px solid #161b22">
                <td style="padding:8px 14px;font-size:11px;color:#e6edf3">${_name}</td>
                <td style="padding:8px 14px"><span style="font-size:9px;font-weight:700;color:${_tc2};background:${_tc2}1a;border:1px solid ${_tc2}4d;border-radius:4px;padding:2px 6px">T${_tier}</span></td>
                <td style="padding:8px 14px"><span style="font-size:9px;font-weight:700;color:${_won?'#3fb950':'#f85149'};background:${_won?'rgba(63,185,80,0.12)':'rgba(248,81,73,0.12)'};border:1px solid ${_won?'rgba(63,185,80,0.3)':'rgba(248,81,73,0.3)'};border-radius:4px;padding:2px 6px">${_won?'VINTO':'PERSO'}</span></td>
                <td style="padding:8px 14px;font-size:11px;color:${_won?'#3fb950':'#f85149'};text-align:right;font-family:monospace">${_pScore} vs ${_aiScore}</td>
                <td style="padding:8px 14px;font-size:11px;color:${_won?'#3fb950':'#8b949e'};text-align:right;font-family:monospace">${_won?'€'+_daily.toLocaleString('it-IT'):'—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    ` : ''}

    <div style="background:rgba(88,166,255,0.06);border:1px solid rgba(88,166,255,0.18);border-radius:6px;padding:14px;font-size:11px;color:#79c0ff;margin-top:20px;line-height:1.6">
      <strong>Come funziona:</strong> Ogni 3 giorni arrivano 4 nuovi bandi.
      Hai 2 giorni per fare un'offerta. Il <strong>tuo score</strong> dipende da
      reputazione (40%), flotta qualificata (40%) e pledge opzionale €0–50k (20%).
      I rivali AI gareggiano in base al tier del cliente. Vinci → contratto attivo,
      incassi ogni giorno. Perdi → pledge rimborsato automaticamente.
    </div>

    </div>`;
};

function _tierBgClass(tier) {
    const bgs = ['','rgba(107,114,128,0.04)','rgba(63,185,80,0.04)','rgba(88,166,255,0.04)','rgba(192,132,252,0.04)','rgba(245,158,11,0.04)'];
    const borders = ['','rgba(107,114,128,0.2)','rgba(63,185,80,0.2)','rgba(88,166,255,0.2)','rgba(192,132,252,0.2)','rgba(245,158,11,0.2)'];
    return { bg: bgs[tier]||'rgba(255,255,255,0.02)', border: borders[tier]||'rgba(255,255,255,0.08)' };
}
function _tierTextColor(tier) {
    return ['','#8b949e','#3fb950','#58a6ff','#c084fc','#f59e0b'][tier] || '#8b949e';
}

function _renderTenderCard(tender) {
    const co  = tender.company;
    const req = co.tender_requirements;
    const pb  = tender.playerBid;
    const { repOk, fleetOk, qualifying, playerRepPct } = CE_Contracts.meetsRequirements(co);
    const daysLeft  = Math.max(0, tender.closingDay - (gameState.day || 0));
    const daily     = Math.round(co.payout_per_hour * 16);
    const baseScore = _cPlayerScore(co, 0);
    const tierStyle = _tierBgClass(co.tier);
    const tierTxtC  = _tierTextColor(co.tier);
    const stars     = '★'.repeat(co.tier) + '☆'.repeat(5 - co.tier);

    return `
    <div style="background:${tierStyle.bg};border:1px solid ${tierStyle.border};border-radius:6px;padding:14px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div style="flex:1;min-width:0;padding-right:12px">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-size:13px;font-weight:700;color:#e6edf3">${co.company_name}</span>
            <span style="font-size:11px;color:${tierTxtC}">${stars}</span>
            <span style="font-size:9px;font-weight:700;color:${tierTxtC};border:1px solid ${tierTxtC};border-radius:4px;padding:2px 5px">T${co.tier}</span>
            <span style="font-size:9px;font-weight:700;color:#58a6ff;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);border-radius:4px;padding:2px 5px">${co.industry}</span>
          </div>
          <div style="font-size:10px;color:#8b949e;font-style:italic;line-height:1.4">${co.lore_description}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:13px;font-weight:700;color:#3fb950">€${daily.toLocaleString('it-IT')}<span style="font-size:9px;color:#6b7280;font-weight:400">/gg</span></div>
          <div style="font-size:10px;color:#8b949e">${co.contract_duration_days}gg · €${(daily * co.contract_duration_days).toLocaleString('it-IT')} tot</div>
          <div style="font-size:10px;color:#f85149;margin-top:2px">scade tra ${daysLeft}gg</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:10px;margin-bottom:10px;padding-top:8px;border-top:1px solid #21262d">
        <div style="color:${repOk ? '#3fb950' : '#f85149'}">${repOk?'✓':'✗'} Rep: ${req.min_reputation}% <span style="color:#6b7280">(tua ${playerRepPct}%)</span></div>
        <div style="color:${fleetOk ? '#3fb950' : '#f85149'}">${fleetOk?'✓':'✗'} Flotta: ${req.min_fleet_size} <span style="color:#6b7280">(tua ${qualifying})</span></div>
        <div style="color:#8b949e">🚗 ${req.required_vehicle_type.replace(/_/g,' ')}</div>
      </div>

      ${pb ? `
      <div style="background:rgba(88,166,255,0.08);border:1px solid rgba(88,166,255,0.2);border-radius:6px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:11px;color:#79c0ff">
          ✅ Offerta inviata · Score: <strong style="color:${tierTxtC}">${pb.score}/100</strong>
          ${pb.pledgedCash > 0 ? `· Pledge: <span style="color:#f59e0b">€${pb.pledgedCash.toLocaleString('it-IT')}</span>` : ''}
        </div>
        <button onclick="CE_cancelBid('${tender.id}')"
          style="font-size:10px;color:#f85149;background:transparent;border:none;cursor:pointer;padding:0;margin-left:12px;flex-shrink:0">Annulla</button>
      </div>
      ` : `
      <div>
        <div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#8b949e;margin-bottom:8px">
          <span>Score stimato:</span>
          <strong style="color:#22d3ee" id="bid-score-${tender.id}">${baseScore}</strong>
          <span style="color:#6b7280">/100</span>
          <span style="margin-left:auto;color:#6b7280">pledge opzionale (boost +20%)</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:10px;color:#8b949e;width:48px;flex-shrink:0">Pledge:</span>
          <input type="range" min="0" max="50000" step="1000" value="0"
            id="pledge-${tender.id}"
            oninput="CE_updateBidPreview('${tender.id}', this.value)"
            style="flex:1;accent-color:#58a6ff">
          <span id="bid-pledge-val-${tender.id}" style="font-size:10px;color:#58a6ff;width:56px;text-align:right;flex-shrink:0">€0</span>
        </div>
        <button onclick="CE_placeBid('${tender.id}', document.getElementById('pledge-${tender.id}').value)"
          style="width:100%;padding:8px;border-radius:4px;font-size:11px;font-weight:700;cursor:pointer;background:rgba(88,166,255,0.12);border:1px solid rgba(88,166,255,0.3);color:#58a6ff;transition:opacity .15s"
          onmousedown="this.style.transform='scale(0.97)'" onmouseup="this.style.transform=''" onmouseleave="this.style.transform=''">
          📤 Invia Offerta
        </button>
      </div>
      `}
    </div>`;
}

function _renderContractCard(c) {
    const co      = c.company;
    const tierBg  = _tierBgClass(co.tier);
    const tierTxt = _tierTextColor(co.tier);
    const total   = c.dailyPayout * co.contract_duration_days;
    const elapsed = (gameState.day || 0) - c.startDay;
    const remain  = Math.max(0, c.endDay - (gameState.day || 0));
    const pct     = Math.min(100, Math.round(elapsed / co.contract_duration_days * 100));

    const tierTxtC = _tierTextColor(co.tier);
    return `
    <div style="background:rgba(63,185,80,0.04);border:1px solid rgba(63,185,80,0.2);border-radius:6px;padding:14px;margin-bottom:10px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
            <span style="font-size:13px;font-weight:700;color:#e6edf3">🤝 ${co.company_name}</span>
            <span style="font-size:9px;font-weight:700;color:${tierTxtC};border:1px solid ${tierTxtC};border-radius:4px;padding:2px 5px">T${co.tier}</span>
          </div>
          <div style="font-size:10px;color:#8b949e;margin-top:2px">${co.industry}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:#3fb950">€${c.dailyPayout.toLocaleString('it-IT')}<span style="font-size:9px;color:#6b7280">/gg</span></div>
          <div style="font-size:10px;color:#3fb950">+€${c.totalEarned.toLocaleString('it-IT')} incassato</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
        <div style="flex:1;height:6px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden"><div style="height:100%;width:${pct}%;background:#3fb950;border-radius:3px;transition:width .3s"></div></div>
        <span style="font-size:10px;color:#8b949e;flex-shrink:0">${remain}gg rimasti</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:#8b949e">
        <span>Valore totale: €${total.toLocaleString('it-IT')}</span>
        <button onclick="CE_terminateContract('${c.id}')"
          style="font-size:10px;color:#f85149;background:transparent;border:none;cursor:pointer">Termina</button>
      </div>
    </div>`;
}
