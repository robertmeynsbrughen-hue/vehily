// État de route sur l'accueil : véhicules fictifs uniquement, profil de navigateur jetable.
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
const now=new Date(), today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
const base={subtitle:'Véhicule fictif',plate:'',owner:'Test',status:'En cours',notes:'',logs:[],expenses:[],parts:[]};
const fleet={schema:1,vehicles:[
  // Roulante, entretien dû : la prochaine action vient de l'entretien.
  {...base,id:'fict-a',name:'Fictive A',mileage:50000,tasks:[],faults:[],maintenance:[{id:'m1',title:'Vidange fictive',nextKm:49000,lastKm:39000}],road:{state:'roulante',reason:'',next:'',since:'2026-01-10'}},
  // Immobilisée, panne ouverte : la prochaine action vient de la panne.
  {...base,id:'fict-b',name:'Fictive B',tasks:[{id:'t1',text:'Tâche fictive B',done:false}],maintenance:[],faults:[{id:'f1',title:'Démarrage fictif',closed:false,next:'Mesurer la batterie fictive',events:[{date:'2026-01-02',kind:'Symptôme',text:'Ne démarre pas'}]}],road:{state:'immobilisée',reason:'Attente pièce fictive',next:'',since:'2026-01-05'}},
  // Ancien dossier sans état : à renseigner, la première tâche sert de prochaine action.
  {...base,id:'fict-c',name:'Fictive C',tasks:[{id:'t2',text:'Contrôler le niveau fictif',done:false}],maintenance:[],faults:[]},
]};
async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch(process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{});
  try{
    const ctx=await browser.newContext({viewport:{width:360,height:780}});
    const p=await ctx.newPage(), errors=[], dialogs=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
    await p.goto('http://127.0.0.1:'+server.address().port);
    await p.evaluate(data=>localStorage.setItem('octane-atelier-v1',JSON.stringify(data)),fleet);await p.reload();
    const card=id=>p.locator('#cards [data-open="'+id+'"] .road');
    const records=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('octane-atelier-v1')).vehicles);
    const save=async()=>{await p.click('#workflow [type=submit]');await p.waitForSelector('#modal:not([open])',{state:'attached'})};

    // 1. Accueil : état, motif et prochaine action visibles pour chaque véhicule.
    assert.match(await card('fict-a').innerText(),/Roulante[\s\S]*depuis le 10\/01\/2026[\s\S]*Vidange fictive · à réaliser[\s\S]*Entretien/);
    assert.match(await card('fict-b').innerText(),/Immobilisée[\s\S]*Attente pièce fictive[\s\S]*Mesurer la batterie fictive[\s\S]*Panne · Démarrage fictif/);
    assert.match(await card('fict-c').innerText(),/État de route à renseigner[\s\S]*Contrôler le niveau fictif[\s\S]*Tâche/);

    // 2. Le bouton d'état n'ouvre pas le dossier ; le motif est exigé pour une immobilisation.
    await p.click('[data-road="fict-c"]');assert.equal(await p.locator('#app h1').innerText(),'Vos véhicules. Leur histoire.');
    assert.ok(!(await p.isVisible('#workflow [name=reason]')));
    await p.check('#workflow [value="immobilisée"]');assert.ok(await p.isVisible('#workflow [name=reason]'));
    await p.click('#workflow [type=submit]');assert.equal(await p.locator('#modal[open]').count(),1);
    await p.fill('#workflow [name=reason]','CT fictif refusé');await p.fill('#workflow [name=next]','Remplacer la rotule fictive');await save();
    assert.match(await card('fict-c').innerText(),/Immobilisée[\s\S]*CT fictif refusé[\s\S]*depuis le[\s\S]*Remplacer la rotule fictive/);

    // 3. Remise en route : le motif est effacé, la date repart d'aujourd'hui.
    await p.click('[data-road="fict-b"]');await p.check('#workflow [value=roulante]');await save();
    let b=(await records()).find(v=>v.id==='fict-b');
    assert.deepEqual(b.road,{state:'roulante',reason:'',next:'',since:today});
    assert.match(await card('fict-b').innerText(),/Roulante[\s\S]*Mesurer la batterie fictive/);

    // 4. Garder le même état conserve sa date de début.
    await p.click('[data-road="fict-a"]');await p.fill('#workflow [name=next]','Rouler 500 km fictifs');await save();
    assert.equal((await records()).find(v=>v.id==='fict-a').road.since,'2026-01-10');

    // 5. Fiche véhicule et rechargement.
    await p.reload();await p.click('#cards [data-open="fict-c"] h2');
    assert.match(await p.locator('#app .road').innerText(),/Immobilisée[\s\S]*CT fictif refusé/);

    // 6. Un import avec un état invalide est refusé sans rien modifier.
    await p.click('[data-page=settings]');const before=await records();
    for(const road of [{state:'garage',reason:'',next:''},{state:'immobilisée',reason:' ',next:''},{state:'roulante',reason:'',next:'',since:'2026-13-01'}]){
      const count=dialogs.length;
      await p.locator('#import').setInputFiles({name:'atelier.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({vehicles:[{...before[0],road}]}))});
      await p.waitForFunction(()=>document.querySelector('#import').value==='');
      assert.ok(dialogs.length>count && /état de route/.test(dialogs.at(-1)));assert.deepEqual(await records(),before);
    }
    assert.deepEqual(errors,[]);
    console.log('OK : état de route, motif, prochaine action, accueil, fiche et import.');
  }finally{await browser.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
