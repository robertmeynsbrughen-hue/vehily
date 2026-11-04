// Run with Playwright available to Node; uses a new, disposable browser profile.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const files = new Set(['index.html','manifest.webmanifest','app.js','storage.js','workshop.js',...fs.readdirSync(path.join(root,'assets')).map(x=>'assets/'+x)]);
const server = http.createServer((req,res)=>{
  const file=req.url==='/'?'index.html':req.url.slice(1);
  if(!files.has(file)){res.writeHead(404);return res.end()}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(path.join(root,file)));
});
async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch(process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{});
  try{
    const ctx=await browser.newContext({viewport:{width:360,height:780}});
    const errors=[], dialogs=[];
    const url='http://127.0.0.1:'+server.address().port;
    async function open(){
      const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
      p.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});await p.goto(url);return p;
    }
    const p=await open(), q=await open(), click=(s)=>p.locator(s).first().click();
    const action=k=>click('[data-action="'+k+'"]');
    const field=(k,value)=>p.locator('#entry [name="'+k+'"]').fill(value);
    const submit=async()=>{await click('#entry [type=submit]');await p.waitForSelector('#modal:not([open])',{state:'attached'})};
    const records=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('octane-atelier-v1')).vehicles);
    await action('vehicle');await field('name','Auto A');await submit();
    await q.click('[data-action=vehicle]');await q.fill('[name=name]','Auto B');await q.click('#entry [type=submit]');
    await q.waitForFunction(()=>document.querySelector('#entry [type=submit]:enabled'));
    assert.equal(await q.inputValue('[name=name]'),'Auto B');assert.match(dialogs.at(-1),/autre onglet/);
    await q.click('#entry [type=submit]');await q.waitForSelector('#modal:not([open])',{state:'attached'});
    await p.reload();assert.deepEqual((await records()).slice(-2).map(v=>v.name),['Auto A','Auto B']);
    await click('[data-open=e39]');await click('[data-tab=expenses]');await action('expense');
    await field('title','Filtre');await field('amount','12');
    await p.evaluate(()=>{const orig=Storage.prototype.setItem;Storage.prototype.setItem=function(){Storage.prototype.setItem=orig;throw Error('Quota simulation')}});
    await click('#entry [type=submit]');await p.waitForSelector('#entry [type=submit]:enabled');assert.equal((await records())[0].expenses.length,0);
    await submit();assert.equal((await records())[0].expenses.length,1);
    await click('[data-edit-entry]');await field('amount','14');await field('date','2026-01-02');await submit();
    assert.equal((await records())[0].expenses[0].date,'02/01/2026');
    await click('[data-remove-entry]');await p.getByRole('button',{name:'Annuler la suppression'}).click();
    await p.waitForSelector('[data-edit-entry]');assert.equal((await records())[0].expenses[0].amount,14);
    await click('[data-tab=logs]');await action('log');await field('title','Mesure');await field('body','Essai');await submit();
    await click('[data-edit-entry]');await field('body','Corrigé');await submit();assert.equal((await records())[0].logs[0].body,'Corrigé');
    await click('[data-tab=overview]');await action('mileage');await field('mileage','12000');await submit();
    await action('service');await field('title','Vidange');await field('lastKm','7000');await field('nextKm','12000');await field('date','2099-01-01');await submit();
    await click('[data-page=dashboard]');assert.match(await p.locator('#app section.panel').innerText(),/Vidange[\s\S]*À réaliser/);
    await click('[data-service]');await field('nextKm','15000');await submit();assert.match(await p.locator('#app').innerText(),/Prévu/);
    await click('[data-page=settings]');const before=await records();
    async function upload(data){await p.locator('#import').setInputFiles({name:'atelier.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))})}
    for(const patch of [{plate:12345},{id:'x" data-audit="yes'}]){
      const count=dialogs.length;await upload({vehicles:[{...before[0],...patch}]});
      await p.waitForFunction(()=>document.querySelector('#import').value==='');
      assert.ok(dialogs.length>count);assert.deepEqual(await records(),before);
    }
    await upload({vehicles:[before[0]]});await p.waitForSelector('#restore');assert.match(await p.locator('#modal').innerText(),/1 véhicule.*4 dossier/);
    await p.evaluate(()=>{const create=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{window.exportBody=blob.text();return create(blob)}});const download=p.waitForEvent('download');await click('#modal [data-action=export]');const backup=JSON.parse(await p.evaluate(()=>window.exportBody));assert.match((await download).suggestedFilename(),/^vehily-/);assert.deepEqual(backup.vehicles,before);
    await click('#restore');await p.waitForSelector('#modal:not([open])',{state:'attached'});await p.reload();assert.equal((await records()).length,1);
    assert.match(await p.locator('#app').innerText(),/Dernier export lancé/);assert.deepEqual(errors,[]);
    await p.evaluate(()=>localStorage.setItem('octane-atelier-v1','JSON incomplet'));await p.reload();
    await click('[data-page=settings]');await upload(backup);await click('#restore');
    await p.waitForSelector('#modal:not([open])',{state:'attached'});assert.deepEqual(await records(),before);
    console.log('OK : concurrence, quota, journal, dépenses, annulation, entretien, import, export et rechargement.');
  }finally{await browser.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());

