-- ================================================================
-- 31_realestate_expansion.sql — Chauffeur Empire
-- Aggiunge image_url alla tabella + 10 nuovi immobili
-- SAFE TO RUN MULTIPLE TIMES (ON CONFLICT DO NOTHING)
-- ================================================================

-- 1. Aggiungi colonna immagine
ALTER TABLE public.real_estate_listings
    ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Aggiorna i 3 immobili esistenti con immagini
UPDATE public.real_estate_listings SET image_url = 'assets/realestate/re-attico-citylife.jpg'   WHERE id = 're_milano_attico';
UPDATE public.real_estate_listings SET image_url = 'assets/realestate/re-palazzo-trastevere.jpg' WHERE id = 're_roma_palazzo';
UPDATE public.real_estate_listings SET image_url = 'assets/realestate/re-loft-firenze.jpg'       WHERE id = 're_firenze_loft';

-- 3. Inserisci 10 nuovi immobili
INSERT INTO public.real_estate_listings
    (id, city, name, description, cost, daily_rent, bonus_type, bonus_city, image_url)
VALUES

    ('re_roma_centro',
     'Roma', 'Appartamento Piazza Navona',
     'Appartamento d''epoca a due passi da Piazza Navona. Soffitti affrescati, parquet antico. Ingresso ideale nel mercato immobiliare romano.',
     480000, 650, NULL, NULL,
     'assets/realestate/re-roma-centro.jpg'),

    ('re_villa_toscana',
     'Firenze', 'Villa Colline Toscane',
     'Villa del Settecento immersa nei vigneti del Chianti. Cantina vinicola, piscina panoramica, uliveto. +€1.600/g.',
     1100000, 1600, 'driver_stress_recovery', 'firenze',
     'assets/realestate/re-villa-toscana.jpg'),

    ('re_palazzo_venezia',
     'Venezia', 'Palazzo Canal Grande',
     'Palazzo storico affacciato direttamente sul Canal Grande. Affreschi originali, approdo privato per gondola, 8 camere.',
     2200000, 3800, NULL, NULL,
     'assets/realestate/re-palazzo-venezia.jpg'),

    ('re_villa_capri',
     'Napoli', 'Villa Capri Vista Faraglioni',
     'Villa a picco sul mare con piscina a sfioro sui Faraglioni. Elipad privato, accesso diretto alla grotta azzurra via barca.',
     1700000, 2600, 'driver_stress_recovery', 'napoli',
     'assets/realestate/re-villa-capri.jpg'),

    ('re_attico_portanuova',
     'Milano', 'Attico Porta Nuova',
     'Attico con terrazza panoramica nel cuore del nuovo skyline milanese. Smart home, spa privata, concierge 24h.',
     850000, 1100, NULL, NULL,
     'assets/realestate/re-attico-portanuova.jpg'),

    ('re_chalet_cortina',
     'Cortina d''Ampezzo', 'Chalet Dolomiti Luxury',
     'Chalet di lusso a 1.200m di quota. Ski-in/ski-out diretto sulle piste, sauna, vista sulle Dolomiti UNESCO.',
     1400000, 2000, 'driver_stress_recovery', 'cortina',
     'assets/realestate/re-chalet-cortina.jpg'),

    ('re_masseria_puglia',
     'Bari', 'Masseria Storica Puglia',
     'Masseria del ''700 ristrutturata nel cuore della Valle d''Itria. Trulli annessi, piscina tra gli ulivi, azienda agricola.',
     580000, 750, NULL, NULL,
     'assets/realestate/re-masseria-puglia.jpg'),

    ('re_hotel_amalfi',
     'Amalfi', 'Hotel Boutique Costiera',
     'Hotel 5 stelle aggrappato alla scogliera della Costiera Amalfitana. 12 suite con terrazza sul mare, ristorante Michelin.',
     3200000, 5500, 'driver_stress_recovery', 'napoli',
     'assets/realestate/re-hotel-amalfi.jpg'),

    ('re_villa_lago_como',
     'Como', 'Villa Lago di Como',
     'Villa neoclassica con giardino terrazzato e pontile privato sul Lago di Como. Barca a motore inclusa. Vista sulle Alpi.',
     4200000, 7500, NULL, NULL,
     'assets/realestate/re-villa-como.jpg'),

    ('re_torre_uffici_mi',
     'Milano', 'Torre CityGate Uffici',
     'Piano intero nella Torre CityGate di Milano. Open space modulare, sala riunioni panoramica, parcheggio VIP, fibra dedicata.',
     680000, 900, NULL, NULL,
     'assets/realestate/re-torre-uffici.jpg')

ON CONFLICT (id) DO NOTHING;
