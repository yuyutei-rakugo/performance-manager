const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert');
let expected;
for(const name of ['index.html','rehearsals.html','history.html']){
 const dom=new JSDOM(fs.readFileSync(''+name,'utf8'),{url:'https://example.test/performance-manager/'+name,runScripts:'outside-only'}),d=dom.window.document;
 const order=[...d.querySelector('main').children].map(n=>n.className);
 assert(order.indexOf('hero')<order.indexOf('tabs'));assert(order.indexOf('tabs')<order.indexOf('workspace'));assert.equal(d.querySelector('#stats'),null);
 const header=d.querySelector('.top').outerHTML;expected??=header;assert.equal(header,expected);
 assert.equal(d.querySelectorAll('.tabs').length,1);assert.equal(d.querySelectorAll('.tabs a,.tabs button').length,3);assert(d.querySelector('link[rel=manifest]'));assert.equal(d.querySelector('.hero-logo').getAttribute('src'),'notebook-art-v2.png');
 for(const p of ['style.css','schedule-ui.css',...(name==='history.html'?['records.css']:[]),'rakugo-theme.css']){const s=d.createElement('style');s.textContent=fs.readFileSync(''+p,'utf8');d.head.append(s)}
 assert.equal(dom.window.getComputedStyle(d.querySelector('.tabs [aria-current=page],.tabs [aria-pressed=true]')).backgroundColor,'rgb(7, 29, 66)');
 const w=dom.window,query=s=>d.querySelector(s);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 w.HTMLDialogElement.prototype.close=function(){this.open=false};
 w.eval(fs.readFileSync('install.js','utf8'));
 const cloud=fs.readFileSync('cloud.js','utf8').replace(/^import .*$/m,'').replace(/export /g,'');
 w.eval(cloud+'\nmountAccount(); window.testState = next => {Object.assign(state,next);emit()};');
 assert.equal(query('.account-panel'),null);
 const settings=query('#settings-open');
 for(const role of ['viewer','editor','admin']){
  w.testState({configured:true,ready:true,provider:'apps-script',role,user:{uid:'test'}});
  assert.equal(settings.textContent,role==='admin'?'管理者設定':'設定');
  assert.equal(query('#settings-admin').hidden,role!=='admin');
  assert.equal(query('#data-open').hidden,role!=='admin');
 }
 settings.click();assert(query('.settings-dialog').open);
 assert.equal(query('[data-share]').textContent,'LINEで共有');
 query('[data-install]').click();assert(!query('.settings-dialog').open);assert(query('#install-guide').open);
 assert(query('#install-guide').textContent.includes('about://webapks'));
 assert(query('#install-guide').textContent.includes('別の端末'));
 assert(query('#install-guide img').getAttribute('src').startsWith('notebook-pixel-maskable-'));
 console.log('PASS',name,'common shell, three tabs, navy active state, install guidance');
}
const m=JSON.parse(fs.readFileSync('manifest.webmanifest'));assert.equal(m.id,'./');assert.equal(m.display,'standalone');assert(m.icons.some(i=>i.purpose==='maskable'&&i.src==='notebook-pixel-maskable-512-v3.png'));assert.equal(m.scope,'./');for(const i of m.icons)assert(fs.existsSync(i.src.split('?')[0]));console.log('PASS standalone manifest and icons');
