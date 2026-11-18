(() => {
 let deferred;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
 const strip=document.createElement('div');strip.className='install-strip';
 const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='ホーム画面に追加';strip.append(button);
 if(!standalone())document.querySelector('.tabs')?.after(strip);
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;});
 window.addEventListener('appinstalled',()=>{strip.remove();deferred=null;});
 button.onclick=async()=>{
  if(deferred){try{await deferred.prompt();await deferred.userChoice;}catch{}deferred=null;return;}
  let dialog=document.getElementById('install-guide');
  if(!dialog){dialog=document.createElement('dialog');dialog.id='install-guide';dialog.className='install-guide';const apple=/iPad|iPhone|iPod/.test(navigator.userAgent);dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>ホーム画面に追加</h2><button type="button" aria-label="閉じる">×</button></div>'+(apple?'<ol><li>このページをSafariで開きます。</li><li>共有ボタンから「ホーム画面に追加」を選びます。</li><li>「追加」を押すと、結友亭のアイコンができます。</li></ol>':'<ol><li>このページをChromeで開きます。</li><li>右上の「︙」から「ホーム画面に追加」を選びます。</li><li>「インストール」または「追加」を押します。</li></ol>')+'<p>次回からは、ホーム画面の結友亭アイコンを押して開けます。</p><p>データの移行が必要になる場合に備え、登録済みの予定は「データ管理」からJSON保存しておいてください。</p></div>';dialog.querySelector('button').onclick=()=>dialog.close();document.body.append(dialog);}
  dialog.showModal();
 };
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
})();
