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
  await self.registration.showNotification(message.title,{
   data:message.kind==='test'&&/^[a-zA-Z0-9-]{36}$/.test(message.receipt||'')?{receipt:message.receipt}:null,
   body:message.body,tag:message.id,renotify:false,
   icon:new URL('notebook-pixel-any-192-v3.png',url).href,
  });
 })());
});
self.addEventListener('notificationclick',event=>{
 const url=new URL('./',self.registration.scope);
 const receipt=event.notification.data?.receipt;
 if(/^[a-zA-Z0-9-]{36}$/.test(receipt||''))url.hash='push-open='+receipt;
 event.notification.close();
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>{
   const page=new URL(client.url);
   return page.origin===url.origin&&(page.pathname===url.pathname||page.pathname===url.pathname+'index.html');
  });
  if(existing){
   try{
    const destination=await existing.navigate(url.href);
    if(destination){await destination.focus();return}
   }catch{}
  }
  await self.clients.openWindow(url.href);
 })());
});
