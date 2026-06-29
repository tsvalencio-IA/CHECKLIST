'use strict';
const CACHE_NAME = 'oficin-ia-checklist-v15.17.0-cotacao-agrupada-galeria-fotos-pdf';
const CORE = [
  './', './index.html', './checklist.html', './login.html', './manifest.webmanifest',
  './js/config.js', './js/checklist.js', './data/checklist-model.json',
  './assets/icons/checklist-192.png', './assets/icons/checklist-512.png', './assets/icon.png'
];
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).catch(()=>null));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin) return;
  event.respondWith(fetch(req).then(res => {
    const clone = res.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, clone)).catch(()=>null);
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
});
