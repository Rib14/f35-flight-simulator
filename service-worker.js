const CACHE='f35-v9-spawn-carrier-hud-20261029';
const ASSETS=['./','./index.html','./css/style.css','./js/game.js','./js/mobile.js','./js/coop.js','./js/three.min.js','./js/GLTFLoader.js','./models/f-35.glb','./models/portaerei_medio_web.glb'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return response}).catch(()=>caches.match(event.request)))});
