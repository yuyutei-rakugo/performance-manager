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
  if(!dialog){
   dialog=document.createElement('dialog');dialog.id='install-guide';dialog.className='install-guide';
   const apple=/iPad|iPhone|iPod/.test(navigator.userAgent);
   const androidSteps='<h3>すでにインストール済みの方</h3><ol><li>スマホのホーム画面で、下から上へスワイプしてアプリ一覧を開きます。</li><li>「結友亭」を探し、長押ししてホーム画面へドラッグします。</li></ol><p>アプリ一覧から置くと、Chromeの印は付きません。「ショートカットを作成」は選ばないでください。</p><details><summary>古い丸い絵のままのとき</summary><p>充電器とWi-Fiに接続して、結友亭アプリを終了します。Androidのアプリ情報で「強制停止」してください。</p><ol><li>Chromeのアドレス欄に <code>about://webapks</code> と入力します。</li><li>「結友亭」の <strong>Update</strong> を押します。</li><li>結友亭アプリを一度開き、再び終了して強制停止します。</li><li>更新状態が <strong>Successful</strong> になったら、アプリ一覧のアイコンをホーム画面に置きます。</li></ol><p>更新には数分かかる場合があります。データ消去・アンインストールは不要です。</p></details><h3>初めて追加する方</h3><ol><li>Chromeでこのページを開きます。</li><li>右上の「︙」から「ホーム画面に追加」を選びます。</li><li>「インストール」を選びます。「ショートカットを作成」は選びません。</li></ol>';
   dialog.innerHTML='<div class="dialog-body"><div class="dialog-head"><h2>アプリをホーム画面へ</h2><button type="button" aria-label="閉じる">×</button></div><div style="display:flex;align-items:center;gap:16px;margin:16px 0"><img src="notebook-safe-192.png" width="96" height="96" style="border-radius:50%" alt="丸い枠でも帳面全体が見えるアプリアイコン"><strong>結友亭の帳面</strong></div><button type="button" class="primary" id="install-now" hidden>アプリをインストール</button>'+(apple?'<ol><li>Safariでこのページを開きます。</li><li>共有ボタンから「ホーム画面に追加」を選びます。</li><li>「追加」を押します。</li></ol>':androidSteps)+'<p>予定・出欠・記録のデータを消す操作はしないでください。</p></div>';
   dialog.querySelector('button').onclick=()=>dialog.close();dialog.querySelector('#install-now').onclick=()=>{dialog.close();button.click()};document.body.append(dialog);
   if(deferred)dialog.querySelector('#install-now').hidden=false;
  }
  dialog.showModal();
 };
 if('serviceWorker' in navigator&&window.isSecureContext)navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
})();
