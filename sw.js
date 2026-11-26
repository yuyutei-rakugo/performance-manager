// Always use the network: never cache member records or serve an old application shell.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode!=='navigate'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>結友亭</title><body style="font-family:system-ui;padding:24px;color:#071d42"><h1>インターネットに接続してください</h1><p>接続後にもう一度開いてください。保存済みの記録は消去していません。</p><button onclick="location.reload()">再読み込み</button></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})));
});

self.addEventListener('push',event=>{
 if(!event.data)return;
 event.waitUntil((async()=>{
  let message;
  try{message=event.data.json()}catch{return}
  if(!message?.id||typeof message.title!=='string'||typeof message.body!=='string')return;
  const url=new URL('./',self.registration.scope);
  if(typeof message.detail==='string')url.searchParams.set('detail',message.detail);
  await self.registration.showNotification(message.title,{
   body:message.body,tag:message.id,renotify:false,
   icon:new URL('notebook-pixel-any-192-v3.png',url).href,data:{url:url.href},
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 const url=new URL(event.notification.data?.url||'./',self.registration.scope);
 event.notification.close();
 if(!url.href.startsWith(self.registration.scope))return;
 event.waitUntil(self.clients.openWindow(url.href));
});
