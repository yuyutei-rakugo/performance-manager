// Configuration is enabled only after the Firebase project and access rules are ready.
const listeners = new Set();
const state = {ready:false, configured:false, user:null, role:null,stageName:null, message:'共通保存は設定準備中です。現在はこの端末に保存します。'};
let api, auth, db, userWatch, roleWatch, pinClient;
const watchers = new Set();
const emit=()=>{document.body?.classList.toggle('member-view',state.configured&&state.ready&&!['admin','editor'].includes(state.role));listeners.forEach(fn=>fn({...state}));window.dispatchEvent(new CustomEvent('cloud-state',{detail:{...state}}));};
const errorMessage=e=>e?.code==='permission-denied'?'閲覧・編集の権限がありません。管理者に確認してください。':e?.message==='conflict'?'ほかの端末で更新されています。最新の内容を確認し、もう一度編集してください。':'通信または保存に失敗しました。接続を確認して再度お試しください。';
export const cloud={
 async members(){if(!pinClient)throw Error('会員管理の共通接続が必要です。');return pinClient.members()},
 async memberSave(member){if(!pinClient)throw Error('会員管理の共通接続が必要です。');return pinClient.memberSave(member)},
 async roster(){if(!pinClient)return [];return pinClient.roster()},
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
  const stop=api.onSnapshot(api.collection(db,'rehearsalAttendance',id,'responses'),snap=>fn(snap.docs.map(d=>d.data())),e=>onError(errorMessage(e)));
  watchers.add(stop);return()=>{watchers.delete(stop);stop()};
 },
 async respondAttendance(id,status){if(pinClient)return pinClient.respondAttendance(id,status);
  if(!state.role||!state.stageName)throw Error('会員の高座名登録が必要です。');
  if(!['出席','欠席','未定','未回答'].includes(status))throw Error('出欠を選択してください。');
  try{await api.setDoc(api.doc(db,'rehearsalAttendance',id,'responses',auth.currentUser.uid),{stageName:state.stageName,status,updatedAt:api.serverTimestamp()})}catch(e){throw Error(errorMessage(e))}
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
  const config=await fetch('./cloud-config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()});
  if(!config.enabled){state.ready=true;emit();return}
  state.configured=true;state.provider=config.provider||'firebase';state.message='ログイン状態を確認しています。';emit();
  if(config.provider==='apps-script'){if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(config.endpoint||''))throw Error();const {createPinClient}=await import('./pin-cloud.js?v=20261119-remember5');pinClient=createPinClient(config.endpoint,state,emit);await pinClient.start();return}
  const base='https://www.gstatic.com/firebasejs/12.6.0/';
  const [app,authApi,store]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
  api={...authApi,...store};const firebase=app.initializeApp(config.firebase);auth=api.getAuth(firebase);db=api.getFirestore(firebase);
  userWatch=api.onAuthStateChanged(auth,user=>{
   roleWatch?.();watchers.forEach(stop=>stop());watchers.clear();state.user=user?{uid:user.uid,email:user.email}:null;state.role=null;state.stageName=null;state.ready=!user;
   state.message=user?'会員権限を確認しています。':'共通保存：ログインしてください。';emit();
   if(user)roleWatch=api.onSnapshot(api.doc(db,'members',user.uid),snap=>{
    const role=snap.exists()&&snap.data().active===true?snap.data().role:null;
    state.role=['admin','editor','viewer'].includes(role)?role:null;state.stageName=state.role&&typeof snap.data().stageName==='string'?snap.data().stageName:null;state.ready=true;
    state.message=state.role?`共通保存：${user.email}（${{admin:'管理者',editor:'編集可',viewer:'閲覧のみ'}[state.role]}）`:`このアカウントは未承認です。管理者に会員IDを伝えてください：${user.uid}`;
    emit();
   },()=>{state.ready=true;state.role=null;state.message='会員権限を確認できませんでした。';emit()});
  });
 }catch{state.configured=true;state.ready=true;state.message='共通保存に接続できません。接続を確認して再読み込みしてください。';emit()}
}
export function mountAccount(){
 const panel=document.createElement('section');panel.className='account-panel';panel.innerHTML='<p id="cloud-status" role="status"></p><button type="button" id="cloud-login" hidden>Googleで会員ログイン</button> <button type="button" id="cloud-logout" hidden>ログアウト</button>';
 (document.querySelector('main')||document.body).prepend(panel);
 const pinTools=document.createElement('details');pinTools.hidden=true;pinTools.innerHTML='<summary>自分の暗証番号を変更</summary><p>ログイン中の本人の番号だけを変更します。変更後は再ログインしてください。</p><form><label>新しい暗証番号（数字4桁）<input name=pin type=password inputmode=numeric pattern="[0-9]{4}" maxlength=4 autocomplete=new-password required></label><button type=submit>変更する</button><p role=status></p></form>';panel.append(pinTools);
 pinTools.querySelector('form').onsubmit=async e=>{e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;try{await cloud.changePin(form.elements.pin.value);form.reset();status.textContent='暗証番号を変更しました。新しい番号でログインしてください。'}catch(error){form.querySelector('p').textContent=error.message}finally{button.disabled=false}};
 const status=panel.querySelector('p'),login=panel.querySelector('#cloud-login'),logout=panel.querySelector('#cloud-logout');
 cloud.onState(s=>{pinTools.hidden=!s.user||s.provider!=='apps-script';status.textContent=s.message;login.hidden=!s.configured||!s.ready||!!s.user;logout.hidden=!s.user;login.textContent=s.provider==='apps-script'?'会員ログイン':'Googleで会員ログイン'});
 login.onclick=async()=>{if(state.provider==='apps-script'){showPinLogin();return}try{await cloud.login()}catch{status.textContent='ログインできませんでした。通常のブラウザで開き、ポップアップの設定を確認して再度お試しください。'}};
 logout.onclick=async()=>{try{await cloud.logout()}catch{status.textContent='ログアウトできませんでした。'}};
}

export function showPinLogin(){const dialog=document.createElement('dialog');dialog.className='record-dialog';dialog.innerHTML='<form class="dialog-body"><h2>会員ログイン</h2><label>登録名<input name="memberName" autocomplete="username" required placeholder="高座名"></label><label>暗証番号（数字4桁）<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="current-password" required></label><label class="remember-login"><input name="remember" type="checkbox" checked>この端末でログイン状態を記憶する</label><p class="muted">30日間使わなかった場合は再ログインします。共有端末ではチェックを外してください。</p><p role="alert"></p><div class="form-actions"><button class="primary">ログイン</button><button type="button" data-close>キャンセル</button></div></form>';document.body.append(dialog);try{dialog.querySelector('[name=memberName]').value=localStorage.getItem('yuitei.login.name')||''}catch{}dialog.querySelector('[data-close]').onclick=()=>{dialog.close();dialog.remove()};dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button');b.disabled=true;try{await cloud.login(f.elements.memberName.value.trim(),f.elements.pin.value,f.elements.remember.checked);try{localStorage.setItem('yuitei.login.name',f.elements.memberName.value.trim())}catch{}f.elements.pin.value='';dialog.close();dialog.remove()}catch(error){f.querySelector('[role=alert]').textContent=error.message}finally{b.disabled=false}};dialog.showModal()}
