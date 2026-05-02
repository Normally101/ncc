'use strict';
/* ================================================================
   supabase-config.js — Olga Vision · Supabase Client Init
   ================================================================ */

const _SUPABASE_URL = 'https://twstjbykstaioaahfqbe.supabase.co';
const _SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3c3RqYnlrc3RhaW9hYWhmcWJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzQ5ODQsImV4cCI6MjA5MzMxMDk4NH0.vNQ5x67XE2Qo9zTE6J0P9WVph3dxQRJ1lew5wDoUkkw';

// window.supabase is the library namespace injected by the CDN.
// We store the initialized client under a different name to avoid conflict.
window.supabaseClient = window.supabase.createClient(_SUPABASE_URL, _SUPABASE_KEY);
