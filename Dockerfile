# ============================================================================
# ncc — Chauffeur Empire (chauffeurempire.com)
# Sito statico + 2 funzioni Node (Stripe checkout e webhook).
#
# Tre cose meritano attenzione qui.
#
# 1. LA BUILD TAILWIND. `npm run build:css` rigenera tailwind.min.css. Il file
#    è già versionato, ma rigenerarlo evita che il sito parta con un CSS più
#    vecchio delle classi usate nell'HTML.
#
# 2. COSA NON DEVE FINIRE PUBBLICO. Il .vercelignore del repository esclude dal
#    sito 77 migration SQL, la documentazione di sicurezza (RLS, anti-cheat,
#    rate-limit), gli script interni e la suite di test. Su Vercel lo fa
#    .vercelignore; qui lo fa .dockerignore, che ne è la copia fedele. Se si
#    sbaglia, quella roba diventa scaricabile da chauffeurempire.com.
#
# 3. IL WEBHOOK STRIPE. api/dc-webhook.mjs è l'unico punto del sistema che
#    accredita Driver Coins pagati con denaro vero, e verifica la firma sui
#    byte esatti del corpo. server.mjs rispetta `config.api.bodyParser=false`
#    e non tocca lo stream. Verificato dal vivo il 2026-09-20: firma valida
#    accettata, firma falsa e firma scaduta rifiutate.
# ============================================================================

# ---------- build CSS ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=optional
COPY . .
RUN npm run build:css
# Ripulire QUI, non nello stage finale: COPY --from legge il filesystem come
# resta dopo questa riga, quindi ciò che si toglie ora non entra mai
# nell'immagine. Toglierlo dopo la COPY lascerebbe comunque il peso nel layer.
RUN rm -rf node_modules package.json package-lock.json server.mjs headers.json \
           Dockerfile .dockerignore .git

# ---------- runtime ----------
FROM node:24-alpine
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    PUBLIC_DIR=/app/public \
    API_DIR=/app/api \
    HEADERS_FILE=/app/headers.json

COPY --from=build --chown=node:node /app ./public
# Le funzioni escono da public/ e vanno in api/: dentro public/ sarebbero
# anche scaricabili come file di testo.
RUN mv ./public/api ./api
COPY --chown=node:node server.mjs headers.json ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.mjs"]
