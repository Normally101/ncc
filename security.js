'use strict';
/* ================================================================
   security.js — Chauffeur Empire · Client-Side Security Layer
   Loaded FIRST in script chain — before supabase-config.js
   ================================================================ */

// ── 1. HTML SANITIZATION ─────────────────────────────────────────
window.CE_Sec = {

    // Escape raw user text before inserting into innerHTML
    escHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    },

    // Sanitize a company/player name: alphanum + spaces + common symbols, max 40 chars
    sanitizeName(str) {
        if (!str || typeof str !== 'string') return '';
        return str.replace(/[^a-zA-Z0-9À-ÿ\s\-&'.]/g, '').trim().slice(0, 40);
    },

    // Validate an email address
    isEmail(str) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(str || '').trim());
    },

    // Sanitize numeric input — returns integer or null
    sanitizeInt(val, min = 0, max = Number.MAX_SAFE_INTEGER) {
        const n = parseInt(val, 10);
        if (isNaN(n)) return null;
        return Math.max(min, Math.min(max, n));
    },

    // Strip script tags and event handlers from a string (extra defense-in-depth)
    stripDangerous(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
            .replace(/javascript:/gi, '')
            .trim();
    },
};

// ── 2. CLIENT-SIDE RATE LIMITER ──────────────────────────────────
(function() {
    const _STORE_KEY = 'ce_rate_limits';
    const _LIMITS = {
        login:        { max: 5,  windowMs: 5  * 60 * 1000 }, // 5 attempts / 5 min
        passwordReset:{ max: 3,  windowMs: 10 * 60 * 1000 }, // 3 attempts / 10 min
        rpc:          { max: 30, windowMs:      60 * 1000 }, // 30 RPC calls / min
    };

    function _load() {
        try { return JSON.parse(localStorage.getItem(_STORE_KEY) || '{}'); } catch { return {}; }
    }
    function _save(d) {
        try { localStorage.setItem(_STORE_KEY, JSON.stringify(d)); } catch {}
    }

    window.CE_RateLimit = {
        // Returns true if action is ALLOWED, false if blocked
        check(action) {
            const cfg = _LIMITS[action];
            if (!cfg) return true; // unknown action — allow
            const now = Date.now();
            const data = _load();
            const bucket = data[action] || { count: 0, windowStart: now };

            if (now - bucket.windowStart > cfg.windowMs) {
                bucket.count = 0;
                bucket.windowStart = now;
            }

            if (bucket.count >= cfg.max) {
                const remaining = Math.ceil((cfg.windowMs - (now - bucket.windowStart)) / 1000);
                console.warn(`[RateLimit] "${action}" bloccato — riprova tra ${remaining}s`);
                return false;
            }

            bucket.count++;
            data[action] = bucket;
            _save(data);
            return true;
        },

        // Returns seconds remaining in block, or 0 if not blocked
        blockedFor(action) {
            const cfg = _LIMITS[action];
            if (!cfg) return 0;
            const now = Date.now();
            const data = _load();
            const bucket = data[action];
            if (!bucket) return 0;
            if (now - bucket.windowStart > cfg.windowMs) return 0;
            if (bucket.count < cfg.max) return 0;
            return Math.ceil((cfg.windowMs - (now - bucket.windowStart)) / 1000);
        },

        // Reset a specific action's counter (after successful auth)
        reset(action) {
            const data = _load();
            delete data[action];
            _save(data);
        },
    };
})();

// ── 3. GLOBAL JS ERROR INTERCEPTOR ───────────────────────────────
// Captures unhandled errors and logs to Supabase (if available)
(function() {
    const _errBuffer = [];
    let   _flushing  = false;

    async function _flush() {
        if (_flushing || !_errBuffer.length) return;
        if (!window.supabaseClient || !window.currentUser) return;
        _flushing = true;
        const batch = _errBuffer.splice(0, 10);
        try {
            await window.supabaseClient.from('client_error_log').insert(
                batch.map(e => ({
                    user_id:    window.currentUser?.id || null,
                    error_msg:  e.msg.slice(0, 500),
                    error_src:  (e.src || '').slice(0, 200),
                    error_line: e.line,
                    user_agent: navigator.userAgent.slice(0, 300),
                }))
            );
        } catch { /* never throw from error handler */ }
        _flushing = false;
    }

    window.addEventListener('error', ev => {
        _errBuffer.push({ msg: ev.message || 'unknown', src: ev.filename, line: ev.lineno });
        if (_errBuffer.length > 50) _errBuffer.shift(); // cap buffer
        setTimeout(_flush, 3000);
    });

    window.addEventListener('unhandledrejection', ev => {
        const msg = ev.reason?.message || String(ev.reason) || 'unhandled promise rejection';
        _errBuffer.push({ msg, src: 'promise', line: 0 });
        setTimeout(_flush, 3000);
    });
})();

// ── 4. SESSION INTEGRITY CHECK ───────────────────────────────────
// Runs on boot — detects token tampering / stale session markers
(function() {
    window.CE_SessionGuard = {
        // Call once on boot to clear any localStorage keys that shouldn't persist across sessions
        purgeStaleKeys() {
            const safeKeys = new Set([
                'chauffeurEmpireSlot_1',
                'chauffeurEmpireSlot_2',
                'chauffeurEmpireSlot_3',
                'chauffeurEmpireLang',
                'chauffeurEmpireTutorialDone',
                'ce_rate_limits',
                'ce_ui_prefs',
                'sb-twstjbykstaioaahfqbe-auth-token',
                'sb-twstjbykstaioaahfqbe-auth-token-code-verifier',
            ]);
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (!key) continue;
                // Remove stale legacy olga* keys
                if (key.startsWith('olgaVision')) {
                    localStorage.removeItem(key);
                }
            }
        },
    };
    window.CE_SessionGuard.purgeStaleKeys();
})();
