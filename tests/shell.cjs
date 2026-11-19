const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert');
let expected;
for(const name of ['index.html','rehearsals.html','history.html']){
 const dom=new JSDOM(fs.readFileSync('app/'+name,'utf8'),{url:'https://example.test/performance-manager/'+name,runScripts:'outside-only'}),d=dom.window.document;
 const order=[...d.querySelector('main').children].map(n=>n.className);
 assert(order.indexOf('hero')<order.indexOf('tabs'));assert(order.indexOf('tabs')<order.indexOf('workspace'));assert.equal(d.querySelector('#stats'),null);
 const header=d.querySelector('.top').outerHTML;expected??=header;assert.equal(header,expected);
 assert.equal(d.querySelectorAll('.tabs').length,1);assert.equal(d.querySelectorAll('.tabs a,.tabs button').length,3);assert(d.querySelector('link[rel=manifest]'));assert(d.querySelector('.hero-logo'));
 for(const p of ['style.css','schedule-ui.css',...(name==='history.html'?['records.css']:[]),'rakugo-theme.css']){const s=d.createElement('style');s.textContent=fs.readFileSync('app/'+p,'utf8');d.head.append(s)}
 assert.equal(dom.window.getComputedStyle(d.querySelector('.tabs [aria-current=page],.tabs [aria-pressed=true]')).backgroundColor,'rgb(7, 29, 66)');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};dom.window.matchMedia=()=>({matches:false});dom.window.eval(fs.readFileSync('app/install.js','utf8'));assert(d.querySelector('.header-actions .install-strip'));assert.equal(d.querySelector('.tabs + .install-strip'),null);assert([...d.querySelectorAll('.header-actions button')].some(b=>b.textContent==='LINEで共有'));assert(d.querySelector('.header-actions a[href*=admin]'));d.querySelector('.install-strip button').click();assert(d.querySelector('#install-guide'));
 console.log('PASS',name,'common shell, three tabs, navy active state, install guidance');
}
const m=JSON.parse(fs.readFileSync('app/manifest.webmanifest'));assert.equal(m.display,'standalone');assert.equal(m.scope,'./');for(const i of m.icons)assert(fs.existsSync('app/'+i.src));console.log('PASS standalone manifest and icons');
