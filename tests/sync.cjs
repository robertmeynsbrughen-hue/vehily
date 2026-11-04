// Synchronisation entre deux appareils fictifs, contre un faux serveur Supabase local (aucune donnée réelle).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const files = new Set(['index.html','manifest.webmanifest','app.js','storage.js','workshop.js','sync.js',...fs.readdirSync(path.join(root,'assets')).map(x=>'assets/'+x)]);
const server = http.createServer((req,res)=>{
  const file=req.url.split(/[?#]/)[0]==='/'?'index.html':req.url.split(/[?#]/)[0].slice(1);
  if(!files.has(file)){res.writeHead(404);return res.end()}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/octet-stream');
  res.end(fs.readFileSync(path.join(root,file)));
});

// Faux Supabase : comptes, jetons et une ligne par compte avec contrôle de version.
const users=new Map(), tokens=new Map(), rows=new Map(), calls=[];
let n=0;
function session(user){
  const access='acc-'+(++n), refresh='ref-'+n;tokens.set(access,user.id);tokens.set(refresh,user.id);
  return {access_token:access,refresh_token:refresh,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user.id,email:user.email}};
}
async function supabase(route,device){
  const req=route.request(), url=new URL(req.url()), body=req.postData()?JSON.parse(req.postData()):null;
  const reply=(status,json)=>route.fulfill({status,contentType:'application/json',body:json===undefined?'':JSON.stringify(json)});
  if(device.offline)return route.abort('internetdisconnected');
  assert.equal(req.headers().apikey,'sb_publishable_nqNzeRG-sRo4SBQMX3geXw_8MGeZr4N');
  calls.push(device.name+' '+req.method()+' '+url.pathname+url.search);
  if(url.pathname==='/auth/v1/signup'){
    if([...users.values()].some(u=>u.email===body.email))return reply(422,{msg:'User already registered'});
    const user={id:'00000000-0000-4000-8000-'+String(users.size+1).padStart(12,'0'),email:body.email,password:body.password};users.set(user.id,user);
    return reply(200,session(user));
  }
  if(url.pathname==='/auth/v1/token'){
    if(url.searchParams.get('grant_type')==='password'){
      const user=[...users.values()].find(u=>u.email===body.email&&u.password===body.password);
      return user?reply(200,session(user)):reply(400,{error:'invalid_grant',error_description:'Invalid login credentials'});
    }
    const id=tokens.get(body.refresh_token);tokens.delete(body.refresh_token);
    return id?reply(200,session(users.get(id))):reply(400,{error_description:'Invalid Refresh Token'});
  }
  if(url.pathname==='/auth/v1/logout')return reply(204);
  const uid=tokens.get((req.headers().authorization||'').replace('Bearer ',''));
  if(!uid)return reply(401,{message:'JWT expired'});
  if(url.pathname!=='/rest/v1/vehily')return reply(404,{});
  const row=rows.get(uid);
  if(req.method()==='GET')return reply(200,row?[{data:row.data,version:row.version,updated_at:row.updated_at}]:[]);
  if(req.method()==='POST'){
    if(row)return reply(409,{code:'23505',message:'duplicate key'});
    rows.set(uid,{data:body.data,version:1,updated_at:new Date().toISOString()});return reply(201,[{version:1}]);
  }
  if(req.method()==='PATCH'){
    const base=Number(url.searchParams.get('version').replace('eq.',''));
    assert.equal(url.searchParams.get('user_id'),'eq.'+uid);
    if(!row||row.version!==base)return reply(200,[]);
    assert.equal(body.version,base+1);
    rows.set(uid,{data:body.data,version:base+1,updated_at:new Date().toISOString()});return reply(200,[{version:base+1}]);
  }
}

async function run(){
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch(process.env.CHROME_CHANNEL?{channel:process.env.CHROME_CHANNEL}:{});
  const url='http://127.0.0.1:'+server.address().port;
  const errors=[];
  async function device(name,width){
    const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
    const dev={name,offline:false,dialogs:[]};
    await ctx.route('https://rxchoinvdzehcqbfqjai.supabase.co/**',route=>supabase(route,dev));
    const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));
    p.on('dialog',async d=>{dev.dialogs.push(d.message());await d.accept()});
    await p.goto(url);
    Object.assign(dev,{ctx,p,
      names:()=>p.evaluate(()=>JSON.parse(localStorage.getItem('octane-atelier-v1')||'{"vehicles":[]}').vehicles.map(v=>v.name)),
      sync:()=>p.evaluate(()=>vehilySync.syncNow()),
      settled:()=>p.waitForFunction(()=>!/attente|Synchronisation…/.test(vehilySync.label()),null,{timeout:8000}),
      addVehicle:async v=>{await p.click('[data-page=dashboard]');await p.click('[data-action=vehicle]');await p.fill('#entry [name=name]',v);await p.click('#entry [type=submit]');await p.waitForSelector('#modal:not([open])',{state:'attached'})},
      login:async(email,password,create=false)=>{await p.click('[data-page=settings]');await p.fill('#sync-form [name=email]',email);await p.fill('#sync-form [name=password]',password);await p.click(create?'#sync-form [data-sync-create]':'#sync-form [type=submit]:not([data-sync-create])')},
    });
    return dev;
  }
  try{
    const phone=await device('téléphone',360), pc=await device('PC',1280);
    const remoteNames=()=>[...rows.values()][0]?.data.vehicles.map(v=>v.name);

    // 1. Le téléphone a déjà un dossier : création du compte puis envoi automatique.
    await phone.addVehicle('Fictive Téléphone');
    await phone.login('fictif@test.invalid','motdepasse-fictif',true);
    await phone.p.waitForSelector('#sync-panel [data-sync-logout]');await phone.settled();
    assert.deepEqual(remoteNames(),['BMW E39 530i','BMW E91 — Swap M57','Fictive Téléphone']);
    assert.match(await phone.p.locator('#sync-panel').innerText(),/Connecté : fictif@test\.invalid[\s\S]*Synchronisé à/);

    // 2. Mauvais mot de passe sur le PC : message clair, saisie conservée.
    await pc.login('fictif@test.invalid','mauvais-mdp');
    await pc.p.waitForSelector('.sync-message');
    assert.match(await pc.p.locator('.sync-message').innerText(),/E-mail ou mot de passe incorrect/);
    assert.equal(await pc.p.inputValue('#sync-form [name=email]'),'fictif@test.invalid');

    // 3. Bonne connexion sur un PC vierge : les dossiers en ligne arrivent sans question.
    await pc.p.fill('#sync-form [name=password]','motdepasse-fictif');await pc.p.click('#sync-form [type=submit]:not([data-sync-create])');
    await pc.p.waitForSelector('#sync-panel [data-sync-logout]');await pc.settled();
    assert.deepEqual(await pc.names(),remoteNames());

    // 4. Modification sur le PC : envoyée seule, puis reçue par le téléphone.
    await pc.addVehicle('Fictive PC');await pc.settled();
    assert.equal([...rows.values()][0].version,2);
    await phone.sync();await phone.settled();
    assert.ok((await phone.names()).includes('Fictive PC'));
    await phone.p.click('[data-page=dashboard]');
    assert.match(await phone.p.locator('[data-sync-label]').innerText(),/Synchronisé à .* · fictif@test\.invalid/);
    assert.equal(await phone.p.locator('#cards [data-open]').count(),4);

    // 5. Conflit : le téléphone modifie hors connexion pendant que le PC envoie autre chose.
    phone.offline=true;await phone.addVehicle('Hors ligne téléphone');
    await phone.p.waitForFunction(()=>/Hors connexion/.test(vehilySync.label()));
    await pc.addVehicle('Ajout PC pendant coupure');await pc.settled();
    phone.offline=false;
    const backup=phone.p.waitForEvent('download');
    await phone.p.evaluate(()=>{vehilySync.syncNow()}); // la fenêtre de choix bloque la synchro jusqu'à la réponse
    await phone.p.waitForSelector('#modal[open] [data-sync-keep]');
    assert.match(await phone.p.locator('#modal').innerText(),/modifiés sur un autre appareil[\s\S]*En ligne : 5 véhicule\(s\)[\s\S]*Cet appareil : 5 véhicule\(s\)/);
    await phone.p.keyboard.press('Escape');assert.equal(await phone.p.locator('#modal[open]').count(),1);
    await phone.p.click('[data-sync-keep=local]');
    assert.match((await backup).suggestedFilename(),/^vehily-en-ligne-\d{4}-\d{2}-\d{2}\.json$/);
    await phone.settled();
    assert.ok(remoteNames().includes('Hors ligne téléphone') && !remoteNames().includes('Ajout PC pendant coupure'));
    await pc.sync();await pc.settled();
    assert.deepEqual(await pc.names(),remoteNames());

    // 6. Jeton expiré : renouvelé automatiquement, sans déconnexion.
    await pc.p.evaluate(()=>{const s=JSON.parse(localStorage.getItem('vehily-sync'));s.session.expires=0;localStorage.setItem('vehily-sync',JSON.stringify(s))});
    await pc.p.reload();await pc.settled();
    assert.ok(calls.some(c=>c.startsWith('PC POST /auth/v1/token?grant_type=refresh_token')));
    await pc.addVehicle('Après renouvellement');await pc.settled();
    assert.ok(remoteNames().includes('Après renouvellement'));

    // 7. Déconnexion : les dossiers restent sur l'appareil, plus aucun envoi.
    await pc.p.click('[data-page=settings]');await pc.p.click('[data-sync-logout]');
    await pc.p.waitForSelector('#sync-form');
    const kept=await pc.names(), before=calls.length;
    assert.ok(kept.includes('Après renouvellement'));
    await pc.addVehicle('Local seulement');await pc.p.waitForTimeout(2000);
    assert.equal(calls.filter(c=>c.startsWith('PC')).length,calls.slice(0,before).filter(c=>c.startsWith('PC')).length);
    await pc.p.click('[data-page=dashboard]');assert.match(await pc.p.locator('[data-sync-label]').innerText(),/Stocké sur cet appareil/);

    // 8. Reconnexion avec des données locales différentes : choix, puis sauvegarde de la version écartée.
    const keep=pc.p.waitForEvent('download');
    await pc.login('fictif@test.invalid','motdepasse-fictif');
    await pc.p.waitForSelector('#modal[open] [data-sync-keep]');
    assert.match(await pc.p.locator('#modal').innerText(),/Ton compte contient déjà des dossiers/);
    await pc.p.click('[data-sync-keep=remote]');
    assert.match((await keep).suggestedFilename(),/^vehily-cet-appareil-/);
    await pc.settled();assert.deepEqual(await pc.names(),remoteNames());assert.ok(!(await pc.names()).includes('Local seulement'));

    // 9. Les deux suites précédentes restent compatibles : aucune erreur JavaScript.
    assert.deepEqual(errors,[]);assert.deepEqual([...phone.dialogs,...pc.dialogs],[]);
    console.log('OK : création de compte, connexion, envoi, réception, conflit, renouvellement, déconnexion et reconnexion.');
  }finally{await browser.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
