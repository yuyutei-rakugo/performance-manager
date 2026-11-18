// Always use the network: never cache member records or serve an old application shell.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>結友亭</title><body style="font-family:system-ui;padding:24px;color:#071d42"><h1>インターネットに接続してください</h1><p>接続後にもう一度開いてください。保存済みの記録は消去していません。</p><button onclick="location.reload()">再読み込み</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
