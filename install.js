(() => {
 let deferred;
 window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;});
 window.addEventListener('appinstalled',()=>{deferred=null;});
 async function showInstall(){
  if(deferred){const prompt=deferred;deferred=null;try{await prompt.prompt();await prompt.userChoice;return;}catch{}}
  let dialog=document.getElementById('install-guide');
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='install-guide';dialog.className='install-guide';
   const apple=/iPad|iPhone|iPod/.test(navigator.userAgent);
   const androidSteps='<ol><li>Chromeで公開ページを開き、右上の「︙」から「ホーム画面に追加」→「インストール」を選びます。</li><li>ホーム画面ではアプリ一覧の「結友亭」からアイコンを置きます。</li></ol><details><summary>インストール済みで絵が古いとき</summary><p>Chromeで <code>about://webapks</code> を開き、「結友亭」の Update を押します。アプリ一覧の絵を見て確認してください。</p><p>絵が変わらない場合は、別の端末やChromeから同じ会員でログインし、必要な予定・出欠・記録が最新まで見えることを確認します。確認できてから「結友亭」アプリだけをアンインストールし、公開ページから再インストールしてください。</p></details>';
   dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>アプリをホーム画面へ</h2><button type="button" aria-label="閉じる">×</button></div><div style="display:flex;align-items:center;gap:16px;margin:16px 0"><img src="notebook-pixel-maskable-512-v3.png" width="96" height="96" style="border-radius:50%" alt="丸い枠でも帳面全体が見えるアプリアイコン"><strong>結友亭の帳面</strong></div>'+(apple?'<ol><li>Safariでこのページを開きます。</li><li>共有ボタンから「ホーム画面に追加」を選びます。</li><li>「追加」を押します。</li></ol>':androidSteps)+'<p>予定・出欠・記録のデータを消す操作はしないでください。</p></div>';
   dialog.querySelector('button').onclick=()=>dialog.close();document.body.append(dialog);
  }
  dialog.showModal();
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-install]'))showInstall();
  if(event.target.closest('[data-share]')){
   const url=new URL('./',location.href);
   window.open('https://line.me/R/share?text='+encodeURIComponent('結友亭の帳面\n公演予定・稽古出欠はこちら\n'+url.href),'_blank','noopener,noreferrer');
  }
 });
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{document.documentElement.dataset.workerUpdateFailed='true'});
})();
