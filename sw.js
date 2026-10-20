// Offline support: always try the network first, fall back to the cache.
// Bump APP_VERSION in version.js when you change any file.
importScripts("version.js");
var CACHE = "checklist-" + self.APP_VERSION;
var FILES = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "report.js",
  "xlsx.js",
  "vendor/jspdf.umd.min.js",
  "config.js",
  "version.js",
  "manifest.webmanifest",
  "images/logo.jpg",
  "icons/icon.svg",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }));
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  // Network first so config changes show up right away; cache when offline.
  e.respondWith(
    // no-cache: check with the server every time, so a phone never mixes
    // fresh files with ones the browser cached before an update.
    fetch(e.request, { cache: "no-cache" }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
