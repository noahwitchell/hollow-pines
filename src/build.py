import os, hashlib
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
head = open('src/head.html').read()
game = open('src/game.js').read()
out0 = head + '\n<script>\n' + game + '\n</script>\n'
out = out0.replace('__BUILD__', hashlib.sha1(out0.encode()).hexdigest()[:7])
open('game.html', 'w').write(out)
open('_test.html', 'w').write('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + out)
print('built', len(out))

# ---- home-screen web app (GitHub Pages serves /docs) ----
import json
i = out.index('</style>') + len('</style>')
headpart, bodypart = out[:i], out[i:]
ver = hashlib.sha1(out.encode()).hexdigest()[:10]
page = '''<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#040508">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Hollow Pines">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="icon" href="icon-192.png">
''' + headpart + '''
</head><body>
''' + bodypart + '''
<script>if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));</script>
</body></html>
'''
os.makedirs('docs', exist_ok=True)
open('docs/index.html', 'w').write(page)
json.dump({"name": "Hollow Pines", "short_name": "Hollow Pines", "start_url": ".", "scope": ".", "display": "fullscreen", "orientation": "landscape",
  "background_color": "#040508", "theme_color": "#040508",
  "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"}]},
  open('docs/manifest.webmanifest', 'w'), indent=1)
# network-first for the page so a new push shows up on the next launch; cache keeps it playable offline
open('docs/sw.js', 'w').write('''const CACHE='hp-%s';
const CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png','apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 if(e.request.mode==='navigate'||e.request.url.endsWith('index.html')){e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(h=>h||caches.match('index.html'))));return;}
 e.respondWith(caches.match(e.request).then(hit=>{const net=fetch(e.request).then(r=>{if(r&&(r.ok||r.type==='opaque')){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));}return r;}).catch(()=>hit);return hit||net;}));});
''' % ver)
print('web app built', ver)
