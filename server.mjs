/* ============================================================================
   server.mjs — sostituto di Vercel per i siti statici con funzioni Node.

   Serve una cartella di file statici e instrada /api/<nome> verso
   ./api/<nome>.mjs|.js, riproducendo il contratto che le funzioni si aspettano
   da Vercel: firma (req, res), req.body già pronto, res.status().json().

   ZERO DIPENDENZE npm. Gira su Node 22+ così com'è.

   Il punto delicato è il corpo della richiesta. Vercel lo consegna in due modi
   opposti a seconda della funzione:
     - normalmente lo legge e lo mette in req.body (dc-checkout, inquiry);
     - se la funzione esporta `config.api.bodyParser === false` lo lascia
       intatto nello stream, perché la firma va calcolata sui byte esatti
       (dc-webhook di Stripe: parsare e riserializzare fa fallire OGNI
       pagamento legittimo).
   Per questo il modulo viene importato PRIMA di toccare la richiesta: la
   scelta va fatta mentre lo stream è ancora vergine.

   Configurazione, tutta via ambiente:
     PORT          porta di ascolto (default 3000)
     HOST          interfaccia (default 0.0.0.0 — serve dentro Docker)
     PUBLIC_DIR    radice dei file statici (default ./public)
     API_DIR       cartella delle funzioni (default ./api)
     HEADERS_FILE  JSON con gli header di risposta (default ./headers.json)
     SPA_FALLBACK  "1" per rimandare a index.html le rotte non trovate
     IMMUTABLE_ASSETS  "1" solo per build con hash nei nomi (Vite, Next)
   ========================================================================== */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { join, extname, normalize, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = normalize(process.env.PUBLIC_DIR || "./public");
const API_DIR = normalize(process.env.API_DIR || "./api");
const HEADERS_FILE = process.env.HEADERS_FILE || "./headers.json";
const SPA_FALLBACK = process.env.SPA_FALLBACK === "1";
const IMMUTABLE_ASSETS = process.env.IMMUTABLE_ASSETS === "1";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".avif": "image/avif", ".gif": "image/gif", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".otf": "font/otf",
  ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".map": "application/json",
  ".wasm": "application/wasm", ".pdf": "application/pdf",
};
const GZIPPABLE = /^(text\/|application\/(json|javascript|xml|manifest))/;

let EXTRA_HEADERS = {};
try {
  EXTRA_HEADERS = JSON.parse(await readFile(HEADERS_FILE, "utf8"));
} catch {
  // Nessun headers.json: si va avanti senza header aggiuntivi.
}

/* Cache dei moduli: importare una funzione a ogni richiesta rifarebbe il
   parsing del file ogni volta, e su 2 OCPU si sente. */
const moduleCache = new Map();
async function loadFunction(name) {
  if (moduleCache.has(name)) return moduleCache.get(name);
  let loaded = null;
  for (const ext of [".mjs", ".js", ".cjs"]) {
    const file = join(API_DIR, name + ext);
    try {
      await stat(file);
    } catch { continue; }

    let mod;
    try {
      mod = await import(pathToFileURL(file).href);
    } catch (err) {
      /* Un .js con module.exports dentro un pacchetto "type": "module" viene
         trattato come ESM e lancia "module is not defined". È il caso di
         api/inquiry.js di diesse-transfer: su Vercel funziona, qui no. Lo
         ricarichiamo con require, che è il modo giusto di leggere un CJS. */
      const cjsIssue = err instanceof ReferenceError
        || err?.code === "ERR_REQUIRE_ESM"
        || /module is not defined|exports is not defined|require is not defined/.test(err?.message || "");
      if (!cjsIssue) { console.error(`[api] ${name}: import fallito`, err?.stack || err); break; }
      try {
        // require() vuole un percorso assoluto: uno relativo verrebbe
        // interpretato come nome di pacchetto e cercato in node_modules.
        const require = createRequire(import.meta.url);
        const cjs = require(resolve(file));
        mod = { default: cjs, config: cjs?.config };
      } catch (err2) {
        /* Se anche require fallisce con lo stesso errore, la causa è il
           package.json dell'immagine: con "type": "module" un .js è ESM per
           entrambi i caricatori e non c'è fallback che tenga. Va tolto quel
           campo dal package.json del container — server.mjs resta ESM per via
           dell'estensione. */
        console.error(
          `[api] ${name}: caricamento fallito.\n` +
          `      Se l'errore dice "module is not defined in ES module scope", ` +
          `togli "type": "module" dal package.json dell'immagine ` +
          `oppure rinomina api/${name}.js in api/${name}.cjs.\n`,
          err2?.stack || err2);
        break;
      }
    }

    const handler = typeof mod.default === "function" ? mod.default : mod.handler;
    if (typeof handler === "function") loaded = { handler, config: mod.config ?? mod.default?.config };
    else console.error(`[api] ${name}: il modulo non esporta una funzione`);
    break;
  }
  moduleCache.set(name, loaded);
  return loaded;
}

/** Aggiunge a `res` i metodi che Vercel inietta e che le funzioni usano. */
function decorateResponse(res) {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    if (Buffer.isBuffer(body) || typeof body === "string") res.end(body);
    else res.json(body);
    return res;
  };
  return res;
}

/** Legge e bufferizza il corpo, lasciando `req` ancora iterabile a valle. */
async function bufferBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  req.rawBody = raw;
  const ct = String(req.headers["content-type"] || "");
  if (raw.length === 0) req.body = undefined;
  else if (ct.includes("application/json")) {
    try { req.body = JSON.parse(raw.toString("utf8")); } catch { req.body = raw.toString("utf8"); }
  } else if (ct.includes("application/x-www-form-urlencoded")) {
    req.body = Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
  } else {
    req.body = raw.toString("utf8");
  }
}

function applyExtraHeaders(res) {
  for (const [k, v] of Object.entries(EXTRA_HEADERS)) res.setHeader(k, v);
}

/** Risolve un percorso URL in un file dentro PUBLIC_DIR, o null. */
async function resolveStatic(pathname) {
  // Blocca la risalita di directory: "/../etc/passwd" non deve uscire dalla radice.
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  if (clean.includes("..")) return null;
  const candidates = clean.endsWith("/")
    ? [join(PUBLIC_DIR, clean, "index.html")]
    : [join(PUBLIC_DIR, clean), join(PUBLIC_DIR, clean + ".html"), join(PUBLIC_DIR, clean, "index.html")];
  for (const file of candidates) {
    if (!file.startsWith(normalize(PUBLIC_DIR) + sep) && file !== normalize(PUBLIC_DIR)) continue;
    try {
      const s = await stat(file);
      if (s.isFile()) return { file, size: s.size, mtime: s.mtime };
    } catch { /* passa al candidato successivo */ }
  }
  return null;
}

async function serveStatic(req, res, hit) {
  const type = MIME[extname(hit.file).toLowerCase()] || "application/octet-stream";
  const etag = `W/"${hit.size}-${Number(hit.mtime)}"`;
  applyExtraHeaders(res);
  res.setHeader("Content-Type", type);
  res.setHeader("ETag", etag);
  /* La cache lunga vale solo dove il nome del file contiene un hash, cioè
     nelle build Vite e Next: lì un contenuto nuovo ha un nome nuovo. Sui siti
     scritti a mano (miniopolis, miacitta, olga-vision, ncc) il nome resta
     identico a ogni modifica, e un anno di immutable significherebbe che i
     visitatori continuano a vedere la versione vecchia. Per questo il default
     è prudente e l'ottimizzazione si attiva esplicitamente dal Dockerfile. */
  const immutable = IMMUTABLE_ASSETS && !type.startsWith("text/html");
  res.setHeader("Cache-Control", immutable
    ? "public, max-age=31536000, immutable"
    : "public, max-age=0, must-revalidate");

  if (req.headers["if-none-match"] === etag) { res.statusCode = 304; return res.end(); }
  if (req.method === "HEAD") { res.setHeader("Content-Length", hit.size); return res.end(); }

  const wantsGzip = GZIPPABLE.test(type) && /\bgzip\b/.test(req.headers["accept-encoding"] || "") && hit.size > 1024;
  if (wantsGzip) {
    res.setHeader("Content-Encoding", "gzip");
    res.setHeader("Vary", "Accept-Encoding");
    await pipeline(createReadStream(hit.file), createGzip({ level: 6 }), res);
  } else {
    res.setHeader("Content-Length", hit.size);
    await pipeline(createReadStream(hit.file), res);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    // Sonda di salute per Docker e Coolify. Non tocca né disco né rete.
    if (pathname === "/healthz") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: true, uptime: process.uptime() }));
    }

    if (pathname.startsWith("/api/")) {
      const name = pathname.slice(5).replace(/\/+$/, "");
      if (!/^[a-zA-Z0-9._-]+$/.test(name)) { res.statusCode = 400; return res.end("Bad request"); }
      const fn = await loadFunction(name);
      if (!fn) { res.statusCode = 404; return res.end("Not found"); }

      req.query = Object.fromEntries(url.searchParams);
      // Decisione presa PRIMA di toccare lo stream: vedi la nota in testa.
      if (fn.config?.api?.bodyParser !== false && req.method !== "GET" && req.method !== "HEAD") {
        await bufferBody(req);
      }
      decorateResponse(res);
      applyExtraHeaders(res);
      return await fn.handler(req, res);
    }

    const hit = await resolveStatic(pathname);
    if (hit) return await serveStatic(req, res, hit);

    if (SPA_FALLBACK) {
      const index = await resolveStatic("/index.html");
      if (index) { res.statusCode = 200; return await serveStatic(req, res, index); }
    }

    const notFound = await resolveStatic("/404.html");
    applyExtraHeaders(res);
    res.statusCode = 404;
    if (notFound) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return createReadStream(notFound.file).pipe(res); }
    res.end("Not found");
  } catch (err) {
    console.error("[server] errore non gestito", err?.stack || err);
    if (!res.headersSent) { res.statusCode = 500; res.end("Internal error"); }
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[server] in ascolto su http://${HOST}:${PORT}  static=${PUBLIC_DIR}  api=${API_DIR}`);
});

// Coolify ferma i container con SIGTERM: chiudere pulito evita richieste troncate.
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => { console.log(`[server] ${sig}, chiusura`); server.close(() => process.exit(0)); });
}
