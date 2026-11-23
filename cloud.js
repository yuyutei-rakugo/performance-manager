import {loadCloudConfig} from './schedule-bootstrap.js?v=20261123-reservations1';
// Configuration is enabled only after the Firebase project and access rules are ready.
const listeners = new Set();
const state = {ready:false, configured:false, connectionIssue:null, user:null, role:null,stageName:null, message:'共通保存は設定準備中です。現在はこの端末に保存します。'};
let api, auth, db, userWatch, roleWatch, pinClient;
const watchers = new Set();
const attendanceFeedback=new Map();
let attendanceIdentity='';
function publishAttendance(id,status,phase,message){
 const feedback={status,phase,message};
 attendanceFeedback.set(id,feedback);
 window.dispatchEvent(new CustomEvent('attendance-save-state',{detail:{id}}));
 return feedback;
}
const emit=()=>{
 const identity=JSON.stringify([state.user?.uid,state.stageName]);
 if(identity!==attendanceIdentity){attendanceIdentity=identity;attendanceFeedback.clear()}
 document.body?.classList.toggle('member-view',!state.ready||(state.configured&&!['admin','editor'].includes(state.role)));listeners.forEach(fn=>fn({...state}));window.dispatchEvent(new CustomEvent('cloud-state',{detail:{...state}}));};
const errorMessage=e=>e?.code==='permission-denied'?'閲覧・編集の権限がありません。管理者に確認してください。':e?.message==='conflict'?'ほかの端末で更新されています。最新の内容を確認し、もう一度編集してください。':'通信または保存に失敗しました。接続を確認して再度お試しください。';
export const cloud={
 async reservation(action,data){
  if(!pinClient||!state.role)throw Error('会員ログインが必要です。');
  try{return await pinClient.reservation(action,data)}
  catch(error){if(/この操作は利用できません/.test(error.message))throw Error('予約書類には共通保存の更新が必要です。');throw error}
 },
 async flyer(action,data){
  if(!pinClient||!state.role)throw Error('会員ログインが必要です。');
  try{return await pinClient.flyer(action,data)}
  catch(error){if(/この操作は利用できません/.test(error.message))throw Error('掲示先を利用するには共通保存の更新が必要です。');throw error}
 },
 async backups(){if(!pinClient)throw Error('共通保存に接続してください。');return pinClient.backups()},
 async createBackup(){if(!pinClient)throw Error('共通保存に接続してください。');return pinClient.createBackup()},
 async restoreBackup(id,expected){if(!pinClient)throw Error('共通保存に接続してください。');return pinClient.restoreBackup(id,expected)},
 async readShared(name){if(!pinClient)throw Error('管理者用の共通接続が必要です。');return pinClient.readShared(name)},
 async readAttendance(id){if(!pinClient)throw Error('管理者用の共通接続が必要です。');return pinClient.readAttendance(id)},
 async members(){if(!pinClient)throw Error('会員管理の共通接続が必要です。');return pinClient.members()},
 async memberSave(member){if(!pinClient)throw Error('会員管理の共通接続が必要です。');return pinClient.memberSave(member)},
 async roster(options){if(!pinClient)return [];return pinClient.roster(options)},
 async archivePast(data){if(!pinClient)throw Error('管理者用の共通接続が必要です。');return pinClient.archivePast(data)},
 async importLocal(data){if(!pinClient)throw Error('管理者用の共通接続が必要です。');return pinClient.importLocal(data)},
 async changePin(pin){if(!pinClient)throw Error('会員管理の共通接続が必要です。');return pinClient.changePin(pin)},
 get state(){return {...state}},
 onState(fn){listeners.add(fn);fn({...state});return()=>listeners.delete(fn)},
 async login(name,pin,remember=true){if(pinClient)return pinClient.login(name,pin,remember);if(!auth)throw Error('共通保存の設定が必要です。');await api.signInWithPopup(auth,new api.GoogleAuthProvider())},
 async logout(){if(pinClient)return pinClient.logout();if(auth)await api.signOut(auth)},
 watch(name,fn,onError){if(pinClient)return pinClient.watch(name,fn,onError);
  if(!db||!state.role)throw Error('会員ログインが必要です。');
  const stop=api.onSnapshot(api.doc(db,'shared',name),snap=>fn(snap.exists()?snap.data():null),e=>onError(errorMessage(e)));
  watchers.add(stop);return()=>{watchers.delete(stop);stop()};
 },
 watchAttendance(id,fn,onError){if(pinClient)return pinClient.watchAttendance(id,fn,onError);
  if(!db||!state.role)throw Error('会員ログインが必要です。');
  const stop=api.onSnapshot(api.collection(db,'rehearsalAttendance',id,'responses'),{includeMetadataChanges:true},snap=>{if(!snap.metadata.fromCache&&!snap.metadata.hasPendingWrites)fn(snap.docs.map(d=>d.data()),Date.now())},e=>onError(errorMessage(e)));
  watchers.add(stop);return()=>{watchers.delete(stop);stop()};
 },
 attendanceFeedback(id){return attendanceFeedback.get(id)},
 async proxyAttendance(id,name,status){
  if(!pinClient||state.role!=='admin'||!state.attendanceProxy)throw Error('管理者のみ操作できます。');
  return pinClient.proxyAttendance(id,name,status);
 },
 async respondAttendance(id,status){
  if(!state.role||!state.stageName)throw Error('会員の高座名登録が必要です。');
  if(!['出席','欠席','未定','未回答'].includes(status))throw Error('出欠を選択してください。');
  if(attendanceFeedback.get(id)?.phase==='pending')throw Error('出欠を保存しています。');
  const pending=publishAttendance(id,status,'pending','保存中…');
  try{
   if(pinClient)await pinClient.respondAttendance(id,status);
   else try{
    await api.setDoc(api.doc(db,'rehearsalAttendance',id,'responses',auth.currentUser.uid),{stageName:state.stageName,status,updatedAt:api.serverTimestamp()});
   }catch(error){throw Error(errorMessage(error))}
   if(attendanceFeedback.get(id)===pending)publishAttendance(id,status,'saved',status==='未回答'?'回答を未登録に戻しました。':status+'で登録しました。');
  }catch(error){
   if(attendanceFeedback.get(id)===pending)publishAttendance(id,status,'error','保存できませんでした。'+error.message+' もう一度回答してください。');
   throw error;
  }
 },
 async save(name,payload,revision){if(pinClient)return pinClient.save(name,payload,revision);
  if(!['admin','editor'].includes(state.role))throw Error('編集を許可された会員のみ保存できます。');
  try{return await api.runTransaction(db,async tx=>{
   const ref=api.doc(db,'shared',name),snap=await tx.get(ref),actual=snap.exists()?snap.data().revision:0;
   if(actual!==revision)throw Error('conflict');
   const next={...payload,revision:actual+1,updatedBy:auth.currentUser.uid,updatedAt:api.serverTimestamp()};tx.set(ref,next);return actual+1;
  })}catch(e){throw Error(errorMessage(e))}
 }
};
export async function startCloud(){
 try{
  const config=await loadCloudConfig();
  if(!config.enabled){state.ready=true;emit();return}
  state.configured=true;state.provider=config.provider||'firebase';state.message='ログイン状態を確認しています。';emit();
  if(config.provider==='apps-script'){if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(config.endpoint||'')){
   state.connectionIssue='configuration';state.ready=true;state.message='共通保存の接続先設定を確認してください。';emit();return
  }const {createPinClient}=await import('./pin-cloud.js?v=20261123-reservations1');pinClient=createPinClient(config.endpoint,state,emit);await pinClient.start();return}
  const base='https://www.gstatic.com/firebasejs/12.6.0/';
  const [app,authApi,store]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  api={...authApi,...store};const firebase=app.initializeApp(config.firebase);auth=api.getAuth(firebase);db=api.getFirestore(firebase);
  userWatch=api.onAuthStateChanged(auth,user=>{
   roleWatch?.();watchers.forEach(stop=>stop());watchers.clear();state.user=user?{uid:user.uid,email:user.email}:null;state.role=null;state.stageName=null;state.connectionIssue=null;state.ready=!user;
   state.message=user?'会員権限を確認しています。':'共通保存：ログインしてください。';emit();
   if(user)roleWatch=api.onSnapshot(api.doc(db,'members',user.uid),snap=>{
    state.connectionIssue=null;
    const role=snap.exists()&&snap.data().active===true?snap.data().role:null;
    state.role=['admin','editor','viewer'].includes(role)?role:null;state.stageName=state.role&&typeof snap.data().stageName==='string'?snap.data().stageName:null;state.ready=true;
    state.message=state.role?`共通保存：${user.email}（${{admin:'管理者',editor:'編集可',viewer:'閲覧のみ'}[state.role]}）`:`このアカウントは未承認です。管理者に会員IDを伝えてください：${user.uid}`;
    emit();
   },()=>{state.ready=true;state.role=null;state.connectionIssue='network';state.message='会員権限を確認できませんでした。';emit()});
  });
 }catch{state.configured=true;state.ready=true;state.connectionIssue='network';state.message='共通保存に接続できません。接続を確認して再読み込みしてください。';emit()}
}
export function mountAccount(){
 const actions=document.querySelector('.header-actions');
 const dataButton=actions.querySelector('#data-open');
 const menu=document.createElement('dialog');
 menu.className='record-dialog settings-dialog';
 menu.setAttribute('aria-labelledby','settings-title');
 menu.innerHTML=`<div class="dialog-body"><div class="dialog-head"><h2 id="settings-title">設定</h2><button type="button" data-settings-close aria-label="閉じる">×</button></div>
 <p id="cloud-status" role="status"></p>
 <div class="settings-actions">
  <button type="button" class="secondary" data-install>ホーム画面に追加</button>
  <button type="button" class="secondary" data-share>LINEで共有</button>
  <a class="secondary" id="settings-admin" href="./admin.html?v=20261123-reservations1" hidden>管理者ページ</a>
  <button type="button" class="secondary" id="cloud-logout" hidden>ログアウト</button>
 </div>
 <details class="quick-help"><summary>帳面の使い方</summary>
 <h3>予定を見る・出欠を答える</h3><p>「公演一覧」「稽古出欠」「稽古・公演記録」で切り替えます。稽古は「出欠・詳細」から自分の回答を選び、登録できた表示を確認してください。</p>
 <h3>編集と保存</h3><p>編集担当・管理者は「編集する」を押し、「変更を保存する」で確定します。「キャンセル」は変更を保存しません。保存できなかった場合は入力を残して再試行できます。</p>
 <h3>変更のお知らせ</h3><p>「変更あり」は、今後保存された名称・日時・会場の変更を7日間表示します。LINE通知は自動送信しません。</p>
 <h3>準備項目のひな形</h3><p>公演の編集で「準備項目のひな形」を開きます。ひな形にする操作の後、公演を保存すると共有されます。使う時は作業名だけをコピーします。元の公演を削除すると、その公演だけに保存したひな形は候補から外れます。</p>
 <h3>ホーム画面に追加</h3><p>AndroidはChromeのメニューから「ホーム画面に追加」→「インストール」。iPhoneはSafariの共有メニューから「ホーム画面に追加」を選びます。</p>
 <h3>反映されない時</h3><p>通信を確認し、編集内容を保存してから帳面を開き直してください。出欠は「出欠一覧を更新」でも確認できます。困った時は勇水さんへ。暗証番号をLINEのグループには送らないでください。</p></details>
 <details id="settings-pin" hidden><summary>暗証番号を変更</summary><form><label>新しい暗証番号（数字4桁）<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" required></label><button type="submit" class="primary">変更を保存する</button><p role="status"></p></form></details></div>`;
 document.body.append(menu);
 const settings=document.createElement('button'),login=document.createElement('button');
 settings.type=login.type='button';settings.id='settings-open';login.id='cloud-login';
 settings.className=login.className='data-button';
 settings.textContent='設定';login.textContent='会員ログイン';login.hidden=true;
 settings.setAttribute('aria-haspopup','dialog');
 actions.append(login,settings);
 if(dataButton){
  dataButton.className='secondary';dataButton.hidden=true;
  menu.querySelector('.settings-actions').prepend(dataButton);
  dataButton.addEventListener('click',()=>{if(!cloud.state.configured||cloud.state.role==='admin')menu.close()},true);
 }
 const title=menu.querySelector('h2'),status=menu.querySelector('#cloud-status');
 const pinTools=menu.querySelector('#settings-pin'),pinForm=pinTools.querySelector('form'),pinMessage=pinForm.querySelector('p');
 const logout=menu.querySelector('#cloud-logout'),admin=menu.querySelector('#settings-admin');
 menu.querySelector('[data-settings-close]').onclick=()=>menu.close();
 settings.onclick=()=>menu.showModal();
 menu.querySelector('[data-install]').onclick=()=>menu.close();
 cloud.onState(s=>{
  const administrator=s.role==='admin';
  settings.textContent=title.textContent=administrator?'管理者設定':'設定';
  if(dataButton)dataButton.hidden=!s.ready||s.configured&&!administrator;
  admin.hidden=!s.ready||!administrator;
  login.hidden=!s.configured||!s.ready||!!s.user;
  login.textContent=s.provider==='apps-script'?'会員ログイン':'Googleで会員ログイン';
  logout.hidden=!s.user;
  pinTools.hidden=!s.user||s.provider!=='apps-script';
  if(pinTools.hidden){pinTools.open=false;pinForm.reset();pinMessage.textContent=''}
  status.textContent=s.message;
 });
 pinForm.onsubmit=async e=>{
  e.preventDefault();
  const button=pinForm.querySelector('button');
  if(button.disabled)return;
  button.disabled=true;pinForm.elements.pin.disabled=true;pinMessage.textContent='保存中…';
  try{await cloud.changePin(pinForm.elements.pin.value);pinForm.reset();pinMessage.textContent='保存しました。新しい番号でログインしてください。'}
  catch(error){pinMessage.textContent='保存できませんでした。'+error.message}
  finally{button.disabled=false;pinForm.elements.pin.disabled=false}
 };
 login.onclick=async()=>{
  if(state.provider==='apps-script'){showPinLogin();return}
  try{await cloud.login()}
  catch{status.textContent='ログインできませんでした。接続を確認して再度お試しください。';menu.showModal()}
 };
 logout.onclick=async()=>{
  try{await cloud.logout();menu.close()}
  catch{status.textContent='この端末からログアウトしました。サーバーへの通知を確認できませんでした。'}
 };
}

export function showPinLogin(){const dialog=document.createElement('dialog');dialog.className='record-dialog';dialog.innerHTML='<form class="dialog-body"><h2>会員ログイン</h2><label>登録名<input name="memberName" autocomplete="username" required placeholder="高座名"></label><label>暗証番号（数字4桁）<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required></label><label class="remember-login"><input name="remember" type="checkbox" checked>この端末でログイン状態を記憶する</label><p class="muted">30日間使わなかった場合は再ログインします。共有端末ではチェックを外してください。</p><p role="alert"></p><div class="form-actions"><button class="primary">ログイン</button><button type="button" data-close>キャンセル</button></div></form>';document.body.append(dialog);try{dialog.querySelector('[name=memberName]').value=localStorage.getItem('yuitei.login.name')||''}catch{}dialog.querySelector('[data-close]').onclick=()=>{dialog.close();dialog.remove()};dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{await cloud.login(f.elements.memberName.value.trim(),f.elements.pin.value,f.elements.remember.checked);try{localStorage.setItem('yuitei.login.name',f.elements.memberName.value.trim())}catch{}f.elements.pin.value='';dialog.close();dialog.remove()}catch(error){f.querySelector('[role=alert]').textContent=error.message}finally{b.disabled=false}};dialog.showModal()}
