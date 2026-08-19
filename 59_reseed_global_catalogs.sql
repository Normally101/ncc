-- ============================================================================
-- 59_reseed_global_catalogs.sql
-- Ripristino dei cataloghi globali risultati VUOTI sul DB il 15/08/2026.
--
-- Le 9 tabelle sotto avevano righe storiche (pg_stat: n_tup_ins > 0) ma
-- n_live_tup = 0 con n_tup_del = 0 → firma di un TRUNCATE, non di DELETE.
-- Il reset dati-di-test del 14/08 dichiarava di preservare le tabelle globali
-- e in particolare judicial_auctions/server_decrees: la dichiarazione era
-- inesatta, quelle righe non c'erano piu'.
--
-- Effetto della mancanza: i tab Crypto & Offshore, Real Estate, Regioni,
-- Aste Giudiziarie e Politica/Decreti renderizzavano vuoti, il prezzo
-- carburante non si aggiornava e il meteo non aveva dati.
--
-- Nessun DDL: solo INSERT, copiati verbatim dalle migration originali.
-- ============================================================================

-- ───── crypto_market  (da 24_crypto_offshore.sql:85) ─────
INSERT INTO public.crypto_market (id, name, icon, price_eur, supply, reserve_eur, volatility)
VALUES
    ('EMPIRE', 'EmpireCoin', '👑', 10.0,   500000, 5000000,  0.12),
    ('BTC',    'Bitcoin',    '₿',  62000.0, 1000,  62000000, 0.06),
    ('ETH',    'Ethereum',   '⟠',  3200.0,  10000, 32000000, 0.08),
    ('USDT',   'Tether USD', '💵', 0.92,   1000000, 920000, 0.002)
ON CONFLICT DO NOTHING;

-- ───── regions  (da 16_territory_war.sql:37) ─────
INSERT INTO regions (id, name) VALUES
    ('lazio',       'Lazio'),
    ('umbria',      'Umbria'),
    ('marche',      'Marche'),
    ('abruzzo',     'Abruzzo'),
    ('molise',      'Molise'),
    ('toscana',     'Toscana'),
    ('campania',    'Campania'),
    ('puglia',      'Puglia'),
    ('basilicata',  'Basilicata'),
    ('calabria',    'Calabria'),
    ('sicilia',     'Sicilia'),
    ('sardegna',    'Sardegna'),
    ('emilia',      'Emilia-Romagna'),
    ('liguria',     'Liguria'),
    ('piemonte',    'Piemonte'),
    ('lombardia',   'Lombardia'),
    ('veneto',      'Veneto'),
    ('friuli',      'Friuli-Venezia Giulia'),
    ('trentino',    'Trentino-Alto Adige'),
    ('valle_aosta', 'Valle d''Aosta')
ON CONFLICT (id) DO NOTHING;

-- ───── real_world_status  (da 25_real_world_status.sql:26) ─────
INSERT INTO public.real_world_status (province_id, game_weather, traffic_mult)
VALUES
    ('prov_roma',    'sole',    1.0),
    ('prov_milano',  'sole',    1.0),
    ('prov_napoli',  'sole',    1.0),
    ('prov_venezia', 'sole',    1.0),
    ('prov_torino',  'sole',    1.0),
    ('prov_amalfi',  'sole',    1.0)
ON CONFLICT DO NOTHING;

-- ───── real_estate_listings — base (09)  (da 09_provinces_realestate_fuel.sql:202) ─────
INSERT INTO real_estate_listings
    (id, city, name, description, cost, daily_rent, bonus_type, bonus_city)
VALUES
    ('re_milano_attico',
     'Milano', 'Attico CityLife',
     'Penthouse panoramica vista Tre Torri',
     5000000, 15000, 'driver_stress_recovery', 'milano'),

    ('re_roma_palazzo',
     'Roma', 'Palazzetto Trastevere',
     'Palazzo storico nel cuore di Roma',
     3500000, 10000, NULL, NULL),

    ('re_firenze_loft',
     'Firenze', 'Loft Ponte Vecchio',
     'Loft di design con vista sull''Arno',
     2000000, 6000, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ───── real_estate_listings — espansione (31)  (da 31_realestate_expansion.sql:17) ─────
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

-- ───── fuel_market  (da 09_provinces_realestate_fuel.sql:329) ─────
INSERT INTO fuel_market (price_eur) VALUES (1.85);

-- ───── vehicle_co2_rates — base (09)  (da 09_provinces_realestate_fuel.sql:381) ─────
INSERT INTO vehicle_co2_rates (model_id, co2_per_km_kg) VALUES
    ('stellar_e_exec',  0.18),   -- berlina business
    ('stellar_v_carr',  0.22),   -- van premium
    ('stellar_s_imp',   0.20),   -- ammiraglia presidenziale
    ('stellar_g_over',  0.28),   -- SUV blindato
    ('volt_s_apex',     0.00)    -- elettrica: ESENTE
ON CONFLICT (model_id) DO NOTHING;

-- ───── vehicle_co2_rates — espansione (11)  (da 11_fleet_expansion_co2.sql:7) ─────
INSERT INTO vehicle_co2_rates (model_id, co2_per_km_kg) VALUES
    -- Stellar Q electric (zero emissioni)
    ('stellar_q_exec',      0.00),
    ('stellar_q_imp',       0.00),
    ('stellar_q_carr',      0.00),
    -- Volt electric (zero emissioni)
    ('volt_s_hyper',        0.00),
    ('volt_3_urban',        0.00),
    ('volt_y_cross',        0.00),
    -- Majestic
    ('majestic_spirit',     0.25),   -- V12 benzina
    ('majestic_e_specter',  0.00)    -- elettrica
ON CONFLICT (model_id) DO UPDATE SET co2_per_km_kg = EXCLUDED.co2_per_km_kg;

-- ───── judicial_auctions  (da 20_judicial_auctions.sql:68) ─────
INSERT INTO public.judicial_auctions
    (lot_type, title, description, icon, vehicle_data, container_data, min_bid, auction_ends_at)
VALUES
    ('vehicle',
     'Mercedes Classe S sequestrata — Napoli',
     'Veicolo confiscato dalla DIA. Chilometraggio 87.000 km. Condizioni discrete.',
     '🚗',
     '{"tier":"PREMIUM","vehicleClass":"stellar_s_imp","condition":62,"km":87000,"year":2019}',
     '{}',
     45000,
     NOW() + INTERVAL '2 days'),

    ('vehicle',
     'BMW Serie 7 — Lotto Corte d''Appello Roma',
     'Lotto giudiziario n. 447/2024. Veicolo funzionante, revisione scaduta.',
     '🚙',
     '{"tier":"BUSINESS","vehicleClass":"stellar_e_exec","condition":55,"km":112000,"year":2018}',
     '{}',
     28000,
     NOW() + INTERVAL '3 days'),

    ('container',
     'Container Sigillato — Sequestro Porto Gioia Tauro',
     'Contenuto ignoto fino all''aggiudicazione. Potrebbe contenere veicoli, ricambi, o altro.',
     '📦',
     '{}',
     '{"items":[{"type":"vehicle","tier":"PRESIDENTIAL","vehicleClass":"stellar_q_exec","condition":78,"km":45000},{"type":"cash","amount":120000}]}',
     80000,
     NOW() + INTERVAL '1 day'),

    ('fleet_pack',
     'Lotto 3 Veicoli — Fallimento NCC Palermo',
     'Tre veicoli BUSINESS sequestrati da azienda NCC fallita. Venduti come lotto unico.',
     '🚐',
     '{"vehicles":[{"tier":"BUSINESS","vehicleClass":"stellar_e_exec","condition":70},{"tier":"BUSINESS","vehicleClass":"volt_3_urban","condition":65},{"tier":"BUSINESS","vehicleClass":"stellar_v_carr","condition":58}]}',
     '{}',
     75000,
     NOW() + INTERVAL '4 days'),

    ('vehicle',
     'Rolls-Royce Ghost — Asta Fallimentare Milano',
     'Ex parco auto di holding immobiliare. Condizioni eccellenti, manutenzione certificata.',
     '👑',
     '{"tier":"ULTRA","vehicleClass":"majestic_spirit","condition":88,"km":32000,"year":2021}',
     '{}',
     380000,
     NOW() + INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ───── server_decrees  (da 22_server_decrees.sql:57) ─────
INSERT INTO public.server_decrees (title, description, icon, effects, votes_required, expires_at)
VALUES
    ('Detraibilità IVA Autotrasporto',
     'Deduzione IVA al 100% per veicoli NCC. Riduce i costi di manutenzione per tutti.',
     '🧾',
     '{"maintenanceMult":0.85,"licenseCostMult":0.90}',
     30,
     NOW() + INTERVAL '7 days'),

    ('Zona Franca Aeroportuale',
     'Esenzione tasse per transfer aeroportuali. Aumenta guadagni su tutte le corse hub.',
     '✈️',
     '{"tipMult":1.15,"forceAirport":true}',
     40,
     NOW() + INTERVAL '10 days'),

    ('Carburante Agevolato NCC',
     'Accesso alla rete carburante statale a prezzi ridotti per flotte NCC certificate.',
     '⛽',
     '{"fuelCostMult":0.80}',
     25,
     NOW() + INTERVAL '14 days'),

    ('Licenza NCC Temporanea — Stagionale',
     'Licenze temporanee a basso costo per la stagione turistica. +30% corse disponibili.',
     '📋',
     '{"extraRidePct":0.30,"licenseCostMult":0.70}',
     50,
     NOW() + INTERVAL '21 days'),

    ('Piano Marshall Veicoli Elettrici',
     'Sussidi governativi per EV nel settore NCC. Veicoli elettrici -20% di prezzo.',
     '⚡',
     '{"vehiclePriceMult":0.80}',
     60,
     NOW() + INTERVAL '30 days'),

    ('Blitz Anti-Abusivismo',
     'Operazione GdF contro NCC abusivi. I giocatori onesti guadagnano +10% su tutte le corse.',
     '🛡️',
     '{"tipMult":1.10,"xpMult":1.10}',
     35,
     NOW() + INTERVAL '5 days'),

    ('Flat Tax NCC al 15%',
     'Tassazione agevolata per imprese NCC sotto i 10M di fatturato. −15% tasse giornaliere.',
     '💶',
     '{"taxRateMult":0.85}',
     80,
     NOW() + INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- ───── global_tension  (da 15_sindacato_mechanics.sql:24) ─────
INSERT INTO public.global_tension(id) VALUES(1) ON CONFLICT DO NOTHING;
