// ═══════════════════════════════════════════════════════════════
// v6/sw.js — Service Worker: cache de assets estáticos
// Estrategia: Network-first para JSX/JS, Cache-first para CDN.
// No cachea datos dinámicos (webhook AS).
// ═══════════════════════════════════════════════════════════════

// v95: purga las respuestas de servicios de Maps que el patrón anterior había
// dejado cacheadas (Authenticate, gen_204, GetMapImage firmada).
const CACHE_NAME = 'cu-v6-cache-v112';

// URL del webhook unificado de Apps Script — única fuente: env.js
// (auditoría 2026-07, hallazgo Arch#6/MP1: antes vivía copiada 3 veces).
// env.js está en .gitignore y NUNCA existe en GitHub Pages (producción) —
// importScripts sin try/catch lanza en el 404 y revienta la evaluación
// COMPLETA del Service Worker (el navegador se queda con el SW anterior,
// sirviendo assets viejos desde caché para siempre). Mismo fallback que
// ya existe en api.js.
try { importScripts('./env.js'); } catch (e) { /* env.js no existe: usar fallback */ }
const WEBHOOK_URL = (typeof CU_WEBHOOK_URL !== 'undefined')
  ? CU_WEBHOOK_URL
  : 'https://script.google.com/macros/s/AKfycbzKgiwc4AWAvNMMYWwU2Q0ir1V6R9GVbjQo7w2W4AowU9--0_IdJc6dSH8enBil54jr3w/exec';

// IndexedDB compartida con offline-queue.js — mismo nombre/version/store.
const IDB_NAME = 'cu_offline_v1';
const IDB_VERSION = 1;
const IDB_STORE = 'queue';
const MAX_INTENTOS = 5;

// Assets locales que se pre-cachean en install
const PRECACHE_URLS = [
  './',
  './index.html',
  // styles.css NO va aquí: se pre-cachea con la URL sin `?v=`, y si el install
  // corre antes de que Pages publique el CSS nuevo la hoja vieja queda clavada
  // (pasó al desplegar v104). Ahora lleva `?v=` en index.html y la cachea la
  // rama network-first en el primer fetch, como el resto de assets locales.
  './api.js',
  './logo.jpg',
  './logo-login.png',
  // El resto de assets locales (bundle.min.js, catastro.json, env.js, etc.)
  // se cachean al primer fetch con la estrategia network-first de abajo.
];

// CDN que se cachean al primer uso (cache-first)
const CDN_PATTERNS = [
  'unpkg.com/react@',
  'unpkg.com/react-dom@',
  // '@babel/standalone' eliminado: bundle.min.js viene pre-transpilado
  'cdnjs.cloudflare.com/ajax/libs/Turf.js',
  // jsPDF — arma el PDF de la orden de policía escaneada. Sin esto en caché,
  // el escaneo en campo sin señal no puede generar el documento.
  'cdnjs.cloudflare.com/ajax/libs/jspdf',
  'unpkg.com/leaflet@',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'tile.openstreetmap.org',
  // Los tiles de Google NO van aquí: se sirven desde /maps/vt con una URL
  // irrepetible entre sesiones. Tienen su propia rama (ver TILE_PREFIX).
  'maps.gstatic.com',
  // Google Maps JS SDK — sin esto el mapa no carga offline
  'maps.googleapis.com/maps/api/js',
  'maps.googleapis.com/maps-api-v3',
];

// Patrones stale-while-revalidate: sirven caché instantáneo y refrescan
// en segundo plano. Para datos que pueden cambiar pero deben estar
// disponibles offline (capas POT, catastro).
const SWR_PATTERNS = [
  'raw.githubusercontent.com/controlurbano9/pot-bello',  // GeoJSONs POT
  '/catastro.json',                                       // Catastro 2026 (37 MB)
];

// Patrones que NUNCA se cachean (datos dinámicos del webhook)
const NO_CACHE_PATTERNS = [
  'script.google.com',
  'script.googleusercontent.com',
  // Servicios internos de la API de Maps. Cuelgan de /maps/api/js/ y por eso
  // caían en el cache-first de CDN_PATTERNS ('maps.googleapis.com/maps/api/js'),
  // que está pensado para el bootstrap y los módulos versionados. No son
  // assets: Authenticate valida la clave, QuotaService reporta uso y
  // GetMapImage viene firmada con un token que caduca. Servir una respuesta
  // vieja de Authenticate rompe el mapa cuando el token rota.
  '/maps/api/js/AuthenticationService',
  '/maps/api/js/QuotaService',
  '/maps/api/js/StaticMapService',
  '/maps/api/js/ViewportInfoService',
  '/maps/api/mapsjs/gen_204',
];

// ── Tiles de Google Maps ────────────────────────────────────────
// Hasta v103 se filtraban por `khms0-3` / `mt0-3`: hosts que la API JS ya no
// usa. Hoy pide `maps.googleapis.com/maps/vt?pb=...`, que no casaba con
// ningún patrón y caía en la rama network-first de assets locales — o sea
// NUNCA se cacheó un tile: sin red el mapa satelital quedaba gris (síntoma
// reportado al abrir una visita iniciada en campo) y `_precacheMapTiles()`
// de app.jsx no precargaba nada.
//
// La URL no sirve como clave: el `pb=` lleva los IDs de experimento del
// release de Maps, que rotan entre sesiones. Se normaliza a zoom/x/y/capa,
// que es lo único que identifica al tile.
const TILE_PREFIX = 'https://maps.googleapis.com/__cu_tile/';

function claveTile(url) {
  if (url.indexOf('maps.googleapis.com/maps/vt') === -1) return null;
  const pb = url.split('pb=')[1];
  if (!pb) return null;
  const xyz = /!1m4!1i(\d+)!2i(\d+)!3i(\d+)!4i(\d+)/.exec(pb);
  if (!xyz) return null;
  const capa = /!2m1!1e(\d+)/.exec(pb);
  return TILE_PREFIX + (capa ? capa[1] : '0') + '/' +
    xyz[1] + '/' + xyz[2] + '/' + xyz[3] + '/' + xyz[4];
}

function isCDN(url) {
  return CDN_PATTERNS.some(p => url.includes(p));
}

function isSWR(url) {
  return SWR_PATTERNS.some(p => url.includes(p));
}

function isNoCache(url) {
  return NO_CACHE_PATTERNS.some(p => url.includes(p));
}

// ═══════════════════════════════════════════════════════════════
// Background Sync: reintenta la cola offline incluso con pestaña cerrada.
// El navegador dispara el evento 'sync' cuando recupera conexión.
// ═══════════════════════════════════════════════════════════════

function _idbAbrir() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      // No crear store aquí — offline-queue.js lo crea desde la pestaña.
      // Si el SW corre antes que el cliente, el sync simplemente no encontrará items.
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function _idbListar() {
  let db;
  try { db = await _idbAbrir(); }
  catch (e) { return []; }
  if (!db.objectStoreNames.contains(IDB_STORE)) return [];
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).getAll();
    req.onsuccess = () => {
      const lista = (req.result || []).slice().sort((a, b) => a.created - b.created);
      resolve(lista);
    };
    req.onerror = () => resolve([]);
  });
}

async function _idbEliminar(id) {
  const db = await _idbAbrir();
  if (!db.objectStoreNames.contains(IDB_STORE)) return;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
  });
}

async function _idbActualizar(item) {
  const db = await _idbAbrir();
  if (!db.objectStoreNames.contains(IDB_STORE)) return;
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const req = tx.objectStore(IDB_STORE).put(item);
    req.onsuccess = () => resolve();
    req.onerror   = () => resolve();
  });
}

// gasPost mínimo replicado para el SW (sin acceso a api.js).
async function _swGasPost(body) {
  const r = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  if (!d.ok) throw new Error(d.error || 'Apps Script error');
  return d;
}

function _esErrorDeRedSW(e) {
  const m = (e && e.message) || '';
  return /failed to fetch|networkerror|network error|load failed|aborted|timeout/i.test(m);
}

// Procesa la cola completa, devuelve true si todo se sincronizó.
async function _swFlushCola() {
  const items = await _idbListar();
  if (!items.length) return true;
  console.log('[sw-sync] procesando', items.length, 'items en cola');
  for (const item of items) {
    if ((item.intentos || 0) >= MAX_INTENTOS) continue;
    try {
      await _swGasPost(item.body);
      await _idbEliminar(item.id);
      console.log('[sw-sync] sincronizado #' + item.id);
    } catch (e) {
      if (_esErrorDeRedSW(e)) {
        // Sin red: relanzar para que BackgroundSync reintente más tarde.
        throw e;
      }
      // Error persistente: contar intento pero no bloquear el resto.
      item.intentos = (item.intentos || 0) + 1;
      item.ultimoError = (e && e.message) || String(e);
      await _idbActualizar(item);
    }
  }
  // Notificar a cualquier cliente abierto (para que refresque badge / lista de visitas).
  const clientes = await self.clients.matchAll({ includeUncontrolled: true });
  clientes.forEach(c => c.postMessage({ type: 'OFFLINE_COLA_SYNCED' }));
  return true;
}

self.addEventListener('sync', event => {
  if (event.tag === 'cu-flush-cola') {
    console.log('[sw-sync] evento sync recibido');
    event.waitUntil(_swFlushCola());
  }
});

// ── Mensajes del cliente: SKIP_WAITING para activar SW nuevo sin esperar ──
// index.html hace reg.waiting.postMessage({type:'SKIP_WAITING'}); este
// listener lo recibe y promueve el SW pendiente a active de inmediato.
// Sin esto, los bumps de CACHE_NAME y ?v= no se reflejan en la pestaña
// hasta que el usuario cierre todas las ventanas.
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── Install: pre-cachear assets esenciales ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: limpiar caches viejos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: estrategia según tipo de recurso ──
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // No interceptar requests dinámicos (webhook, POSTs)
  if (event.request.method !== 'GET' || isNoCache(url)) return;

  // Tiles de Maps: cache-first contra la clave normalizada.
  // El <img> del SDK los pide en no-cors, y una respuesta opaca no se puede
  // cachear (`response.ok` es false). /maps/vt sí responde con CORS, así que
  // se re-pide en modo cors sólo cuando hay que ir a la red.
  // ponytail: la caché de tiles crece sin tope; se purga sola en cada bump de
  // CACHE_NAME. Si eso deja de bastar, hace falta LRU por fecha de uso.
  const claveT = claveTile(url);
  if (claveT) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(claveT).then(cached => {
          if (cached) return cached;
          return fetch(new Request(url, { mode: 'cors', credentials: 'omit' }))
            .then(response => {
              if (response.ok) cache.put(claveT, response.clone());
              return response;
            })
            .catch(() => fetch(event.request));
        })
      )
    );
    return;
  }

  // SWR: sirve caché si existe + refresca en background.
  // Para GeoJSONs POT y catastro.json: imprescindible que estén disponibles
  // offline, pero también deben actualizarse cuando llegan cambios.
  if (isSWR(url)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached => {
          const fetched = fetch(event.request).then(response => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);  // sin red: usa el cached existente
          return cached || fetched;
        })
      )
    );
    return;
  }

  // CDN: cache-first (rara vez cambian, tienen hash en URL)
  if (isCDN(url)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Assets locales: network-first con fallback a cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
