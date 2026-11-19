(() => {
 let deferred;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const strip=document.createElement('div');strip.className='install-strip';
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='ホーム画面に追加';strip.append(button);
 const actions=document.querySelector('.header-actions')||document.querySelector('.top-inner');actions?.append(strip);
 const share=document.createElement('button');share.type='button';share.className='data-button';share.textContent='LINEで共有';actions?.append(share);share.onclick=()=>{const url=new URL('./',location.href);url.searchParams.set('v','20261119-tabs1');window.open('https://line.me/R/share?text='+encodeURIComponent('結友亭の帳面\n公演予定・稽古出欠はこちら\n'+url.href),'_blank','noopener,noreferrer')};
 const admin=document.createElement('a');admin.className='data-button';admin.href='./admin.html?v=20261119-tabs1';admin.textContent='管理者';actions?.append(admin);
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;const quick=document.getElementById('install-now');if(quick)quick.hidden=false;});
 window.addEventListener('appinstalled',()=>{deferred=null;});
 button.onclick=async()=>{
  if(deferred){const prompt=deferred;deferred=null;try{await prompt.prompt();await prompt.userChoice;return;}catch{}}
  let dialog=document.getElementById('install-guide');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='install-guide';dialog.className='install-guide';const apple=/iPad|iPhone|iPod/.test(navigator.userAgent);dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>ホーム画面に追加</h2><button type="button" aria-label="閉じる">×</button></div>'+'<div style="display:flex;align-items:center;gap:16px;margin:16px 0"><img src="notebook-home-192.png" width="80" height="80" alt="白い帳面の結友亭アイコン"><strong>結友亭の帳面</strong></div><button type="button" class="primary" id="install-now" hidden>このアイコンを追加する</button>'+(apple?'<ol><li>このページをSafariで開きます。</li><li>共有ボタンから「ホーム画面に追加」を選びます。</li><li>「追加」を押すと、結友亭のアイコンができます。</li></ol>':'<ol><li>このページをChromeで開きます。</li><li>右上の「︙」から「ホーム画面に追加」を選びます。</li><li>「インストール」を選べる場合は、そちらを押します。</li></ol>')+(standalone()?'<p>現在はホーム画面から開いたアプリ表示です。別のアイコンを追加する場合は、Chromeでこのページを開いてください。</p>':'')+'<p>Safari・EdgeなどでもURLから利用できます。ホーム画面への追加方法はブラウザによって異なります。</p><p>Chromeの枠内でアイコンが小さい場合は、上記の「インストール」をお試しください。単なるショートカットでは、Chromeの印が付くことがあります。</p><p>すでにインストール済みの場合、Chromeの印があるショートカットではなく、アプリ一覧の「結友亭」を使ってください。帳面アイコンへの更新には時間がかかる場合があります。</p><p>予定が端末内保存の間は、アンインストールやブラウザデータの消去をしないでください。</p><p>次回からは、ホーム画面の結友亭アイコンを押して開けます。</p><p>データの移行が必要になる場合に備え、登録済みの予定は「データ管理」からJSON保存しておいてください。</p></div>';dialog.querySelector('button').onclick=()=>dialog.close();dialog.querySelector('#install-now').onclick=()=>{dialog.close();button.click()};document.body.append(dialog);}
  dialog.showModal();
 };
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
})();
