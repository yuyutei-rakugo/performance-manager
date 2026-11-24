export async function previewFlyerMigration(host,request,done){
 host.textContent='対象を読み込み中…';
 try{
  const plan=await request('flyerMigrationPreview');
  if(typeof plan.completed!=='boolean')throw Error('この操作にはApps Scriptの更新が必要です。');
  const line=document.createElement('p');
  line.textContent=(plan.completed?'初回共通化済み ／ ':'初回共通化 ／ ')+'対象公演 '+plan.targets.length+'件 ／ 共通化 '+plan.facilities.length+'施設 ／ 要確認 '+plan.skipped.length+'施設';
  const list=document.createElement('ul');
  for(const text of [...plan.targets.map(item=>item.date+' '+item.title),...plan.facilities.map(item=>item.name+' ／ 新規反映 '+item.added+'公演'),...plan.skipped.map(item=>'要確認 ／ '+item)]){
   const li=document.createElement('li');li.textContent=text;list.append(li);
  }
  host.replaceChildren(line,list);
  if(plan.completed&&!plan.facilities.length)return;
  const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.textContent='バックアップして共通化する';
  const status=document.createElement('p');status.setAttribute('role','status');
  apply.onclick=async()=>{
   apply.disabled=true;status.textContent='処理中…';
   try{
    await request('flyerMigrationApply',{expected:plan.expected});
    host.textContent='初回の共通化を確認しました。';
    try{await done?.()}catch{host.textContent='共通化しました。一覧を更新できませんでした。「最新を取得」で確認してください。'}
   }catch(error){status.textContent='共通化できませんでした。'+error.message;apply.disabled=false}
  };
  host.append(apply,status);
 }catch(error){host.textContent='対象を確認できませんでした。'+error.message}
}
