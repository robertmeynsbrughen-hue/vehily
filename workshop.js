const exportKey = 'vehily-last-export';
function todayISO(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function dateInput(value) {
  const parts = String(value || '').split('/');
  return parts.length === 3 ? parts.reverse().join('-') : value || todayISO();
}
function exportWorkshop(){
  let body;
  try {
    const raw=localStorage.getItem(KEY);
    body=loadError && raw!==null ? raw : JSON.stringify({schema:1,...(raw===null?db:readWorkshop(JSON.parse(raw)))},null,2);
  } catch(err){alert('Export impossible : '+err.message);return}
  const url = URL.createObjectURL(new Blob([body],{type:'application/json'}));
  const link=document.createElement('a'); link.href=url; link.download='vehily-'+todayISO()+'.json'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  try {localStorage.setItem(exportKey,new Date().toLocaleString('fr-FR'));} catch {}
  render();
}
function previewImport(data){
  const modal=document.querySelector('#modal');
  modal.innerHTML='<h2>Restaurer une sauvegarde</h2><p>'+data.vehicles.length+' véhicule(s) vont remplacer tes '+db.vehicles.length+' dossier(s) actuels.</p><div class="actions"><button data-action="export">Exporter mes dossiers actuels</button><button id="restore">Remplacer mes dossiers</button><button data-close>Annuler</button></div>';
  modal.querySelector('#restore').onclick=async e=>{
    e.target.disabled=true;
    if(await commitWorkshop(next=>{next.vehicles=structuredClone(data.vehicles)}, {restore:true})){modal.close();toast('Sauvegarde importée')}
    else {modal.close();previewImport(data)}
  };modal.showModal();
}
function serviceStatus(v,m) {
  const dueKm=m.nextKm!=null && v.mileage!=null && v.mileage>=m.nextKm;
  if (dueKm || (m.date && m.date<=todayISO())) return 'À réaliser';
  const days=(Date.parse(m.date)-Date.parse(todayISO()))/86400000;
  const nearKm=m.nextKm!=null && v.mileage!=null && m.nextKm-v.mileage<=(m.leadKm??0);
  return days<=(m.leadDays??0) || nearKm ? 'À prévoir' : 'Prévu';
}
function serviceRow(v,m) {
  const agenda=m.date?'<button data-agenda="'+esc(m.id)+'" data-vehicle="'+esc(v.id)+'">Ajouter à mon agenda</button>':'';
  const details=[m.lastKm!=null?'Effectué à '+m.lastKm+' km':'',m.nextKm!=null?'Échéance à '+m.nextKm+' km':'',m.date?'Échéance le '+m.date.split('-').reverse().join('/'):''].filter(Boolean);
  return '<div class="row"><div><strong>'+(m.type==='ct'?'Contrôle technique · ':'')+esc(m.title)+'</strong><p>'+details.join(' · ')+'</p><span class="tag">'+serviceStatus(v,m)+'</span></div><div class="actions"><button data-open="'+esc(v.id)+'" data-service="'+esc(m.id)+'">Modifier</button><button data-vehicle="'+esc(v.id)+'" data-finish="'+esc(m.id)+'">Marquer comme fait</button>'+agenda+'</div></div>';
}
function workshopPanels(){
  if(page==='dashboard'){
    let date;try{date=localStorage.getItem(exportKey)}catch{}
    const notice=document.createElement('section');notice.className='notice';
    notice.innerHTML='<span data-sync-label>'+(typeof vehilySync!=='undefined'?vehilySync.label():'Stocké sur cet appareil')+'</span> · Dernier export lancé : '+esc(date||'aucun')+' <button data-page="settings">Sauvegardes</button>';
    if(loadError)notice.insertAdjacentText('afterbegin',loadError+' · Exporte les données brutes puis restaure une sauvegarde valide. ');
    app.prepend(notice);
    const covered=db.vehicles.filter(v=>v.maintenance?.length);
    const alerts=covered.flatMap(v=>v.maintenance.filter(m=>serviceStatus(v,m)!=='Prévu').map(m=>'<p><button data-open="'+esc(v.id)+'">'+esc(v.name)+'</button> · '+esc(m.title)+' · '+serviceStatus(v,m)+(m.date?' · '+displayDay(m.date):'')+(m.nextKm!=null?' · '+m.nextKm+' km':'')+'</p>'));
    if(alerts.length)notice.insertAdjacentHTML('beforebegin','<section class="notice"><h2>Rappels de l’atelier</h2>'+alerts.join('')+'</section>');
    if(covered.length)notice.insertAdjacentHTML('afterend','<section class="panel"><h2>Entretiens à suivre</h2>'+covered.map(v=>'<h3>'+esc(v.name)+'</h3>'+v.maintenance.map(m=>serviceRow(v,m)).join('')).join('')+'</section>');
  }
  if(typeof vehilySync!=='undefined')vehilySync.decorate(page);
  if(page==='detail' && tab==='overview'){
    const v=current();app.insertAdjacentHTML('beforeend','<section class="panel"><h2>Entretien</h2><p>Compteur : '+(v.mileage==null?'à renseigner':v.mileage+' km')+'</p><div class="actions"><button data-action="mileage">Relever le kilométrage</button><button data-action="service">Ajouter un entretien</button></div>'+(v.maintenance||[]).map(m=>serviceRow(v,m)).join('')+'</section>');
    const ct=document.createElement('button');
    ct.textContent='Prévoir un contrôle technique';
    app.querySelector('[data-action="service"]').after(ct);
    ct.onclick=()=>{
      modal('service');
      const form=document.querySelector('#entry');
      form.elements.type.value='ct';form.elements.title.value='Contrôle technique';
      form.elements.date.focus();
    };
    app.insertAdjacentHTML('beforeend',partsPanel(v)+faultPanel(v));
  }
  if(page==='detail' && ['logs','expenses'].includes(tab)){
    const entries=current()[tab];
    app.querySelectorAll('.panel .row').forEach((row,i)=>{
      row.insertAdjacentHTML('beforeend','<div class="actions"><button data-edit-entry="'+esc(entries[i].id)+'">Modifier</button><button data-remove-entry="'+esc(entries[i].id)+'">Supprimer</button></div>');
    });
  }
}
function serviceFields(v,m={}) {
  const km=(k,label)=>'<label>'+label+'<input type="number" min="0" step="1" name="'+k+'" value="'+(m[k]??'')+'"></label>';
  return '<label>Type<select name="type"><option value="service">Entretien</option><option value="ct" '+(m.type==='ct'?'selected':'')+'>Contrôle technique</option></select></label><label>Intervention<input required name="title" maxlength="200" value="'+esc(m.title)+'"></label>'+km('lastKm','Dernière intervention (km)')+km('nextKm','Prochaine échéance (km)')+'<label>Échéance par date<input type="date" name="date" value="'+esc(m.date)+'"></label>'+km('leadDays','Prévenir combien de jours avant ?')+km('leadKm','Prévenir combien de kilomètres avant ?')+'<small>Le rappel apparaît sur l’accueil dès que l’un des seuils est atteint.</small>';
}
function dateField(){return '<label>Date de l’intervention<input required type="date" name="date"></label>'}
function workflowDialog(title,fields,onSave){
  const dialog=document.querySelector('#modal');
  dialog.innerHTML='<form id="workflow"><h2>'+esc(title)+'</h2>'+fields+'<div class="actions"><button class="primary" type="submit">Enregistrer</button><button type="button" data-close>Annuler</button></div></form>';
  const form=dialog.querySelector('form');
  form.onsubmit=async e=>{
    e.preventDefault();
    const submit=form.querySelector('[type=submit]');
    if(submit.disabled)return;
    submit.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(form));
      if(await commitWorkshop(next=>onSave(next,data))){dialog.close();toast('Enregistré')}
    }finally{submit.disabled=false}
  };
  dialog.showModal();
  return form;
}
function numberField(name,label,value='',step='1'){
  return '<label>'+label+'<input name="'+name+'" type="number" min="0" step="'+step+'" value="'+esc(value)+'"></label>';
}
function displayDay(date){return date.split('-').reverse().join('/')}
function finishService(vehicle,id){
  const v=db.vehicles.find(x=>x.id===vehicle), m=v.maintenance.find(x=>x.id===id);
  const expenses=v.expenses.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+' · '+euro(e.amount)+'</option>').join('');
  const fields='<label>Date de réalisation<input type="date" name="done" required max="'+todayISO()+'" value="'+todayISO()+'"></label>'+
    numberField('km','Kilométrage lors de l’intervention',v.mileage??'')+
    '<label>Pièces et travaux réalisés<textarea name="notes"></textarea></label><label>Rattacher une dépense existante<select name="invoice"><option value="">Aucune</option>'+expenses+'</select></label>'+
    numberField('cost','Ou enregistrer un nouveau coût (€)','','0.01')+
    '<h3>Prochaine échéance (facultative)</h3>'+numberField('nextKm','À ce kilométrage')+'<label>Ou à cette date<input name="date" type="date"></label>';
  const form=workflowDialog('Clôturer · '+m.title,fields,(next,d)=>{
    const car=next.vehicles.find(x=>x.id===vehicle);
    const pos=car.maintenance.findIndex(x=>x.id===id);
    if(pos<0)throw Error('Cette échéance a déjà été clôturée.');
    const plan=car.maintenance[pos], km=d.km===''?null:Number(d.km);
    if(d.date && d.date<=d.done || d.nextKm && km!==null && Number(d.nextKm)<=km)throw Error('La prochaine échéance doit suivre cette intervention.');
    if(plan.type==='ct' && d.nextKm && !d.date)throw Error('Indique la prochaine date du contrôle technique.');
    let expense=d.invoice?car.expenses.find(e=>e.id===d.invoice):null;
    if(d.invoice && !expense)throw Error('Dépense introuvable.');
    if(!expense && d.cost && Number(d.cost)>0){
      expense={id:uid(),title:plan.title,date:displayDay(d.done),amount:Number(d.cost)};
      car.expenses.push(expense);
    }
    const body=[km==null?'Kilométrage non renseigné':km+' km',d.notes,expense?'Dépense : '+expense.title+' · '+euro(expense.amount):''].filter(Boolean).join('\n');
    car.logs.unshift({id:uid(),kind:'Intervention',title:plan.title,date:displayDay(d.done),body,expenseId:expense?.id??null});
    if(km!=null)car.mileage=Math.max(km,car.mileage??0);
    car.maintenance.splice(pos,1);
    if(d.date||d.nextKm)car.maintenance.push({...plan,id:uid(),lastKm:km,nextKm:d.nextKm?Number(d.nextKm):null,date:d.date});
  });
  form.elements.invoice.onchange=()=>{form.elements.cost.disabled=!!form.elements.invoice.value};
  if(m.lastKm!=null && m.nextKm>m.lastKm){
    const interval=m.nextKm-m.lastKm;
    const repeat=document.createElement('button');repeat.type='button';
    repeat.textContent='Reprendre l’intervalle de '+interval+' km';
    form.elements.nextKm.closest('label').after(repeat);
    repeat.onclick=()=>{if(!form.elements.km.value){form.elements.km.focus();return}form.elements.nextKm.value=Number(form.elements.km.value)+interval};
  }
}
function partsPanel(v){
  const rows=v.parts.map(p=>'<article class="row"><div><strong>'+esc(p.name)+'</strong><p>OEM : '+esc(p.oem||'à renseigner')+' · '+esc(p.origin)+' · '+(p.price===null?'Prix inconnu':euro(p.price))+'</p><span class="tag">'+esc(p.state)+'</span></div><button data-edit-part="'+esc(p.id)+'">Modifier</button></article>').join('');
  return '<section class="panel"><div class="sectionhead"><h2>Pièces du véhicule</h2><button data-add-part>Ajouter une pièce</button></div>'+(rows||'<p>Aucune pièce consignée.</p>')+'</section>';
}
function partDialog(vehicle,id){
  const part=vehicle.parts.find(p=>p.id===id);
  const options=(items,value)=>items.map(x=>'<option '+(x===value?'selected':'')+'>'+esc(x)+'</option>').join('');
  const fields='<label>Nom de la pièce<input name="name" required maxlength="200" value="'+esc(part?.name)+'"></label>'+
    '<label>Référence OEM<input name="oem" maxlength="120" value="'+esc(part?.oem)+'"></label>'+
    '<label>Provenance<select name="origin">'+options(partOrigins,part?.origin)+'</select></label>'+
    numberField('price','Prix (€) · facultatif',part?.price??'','0.01')+
    '<label>État<select name="state">'+options(partStates,part?.state)+'</select></label>';
  workflowDialog(part?'Modifier la pièce':'Ajouter une pièce',fields,(next,d)=>{
    const car=next.vehicles.find(v=>v.id===vehicle.id);
    if(!car)throw Error('Dossier véhicule introuvable.');
    const values={name:d.name.trim(),oem:d.oem.trim(),price:d.price===''?null:Number(d.price),origin:d.origin,state:d.state};
    if(!id){car.parts.push({id:uid(),...values});return}
    const row=car.parts.find(p=>p.id===id);
    if(!row)throw Error('Pièce introuvable.');
    Object.assign(row,values);
  });
}
function faultPanel(v){
  const rows=v.faults.map(f=>'<article class="panel"><strong>'+esc(f.title)+'</strong> <span class="tag">'+(f.closed?'Résolue':'En cours')+'</span>'+
    f.events.map(e=>'<p><strong>'+displayDay(e.date)+' · '+esc(e.kind)+'</strong><br>'+esc(e.text)+'</p>').join('')+
    (!f.closed?'<p>Prochaine action : '+esc(f.next||'à préciser')+'</p><div class="actions"><button data-fault-note="'+esc(f.id)+'">Ajouter un suivi</button><button data-resolve="'+esc(f.id)+'">Résoudre</button></div>':'')+'</article>').join('');
  return '<section class="panel"><div class="sectionhead"><h2>Pannes et diagnostic</h2><button data-new-fault>Ouvrir un dossier</button></div>'+ (rows||'<p>Aucune panne consignée.</p>')+'</section>';
}
function faultDialog(vehicle,id,resolve){
  const f=current().faults.find(x=>x.id===id);
  const fields=(id?'':'<label>Nom de la panne<input name="title" maxlength="200" required></label>')+
    (id&&!resolve?'<label>Type<select name="kind"><option>Code défaut</option><option>Mesure</option><option>Essai</option><option>Observation</option></select></label>':'')+
    '<label>'+(resolve?'Réparation et résultat vérifié':id?'Constat ou résultat':'Symptôme initial')+'<textarea name="text" required></textarea></label>'+
    (resolve?'':'<label>Prochaine action<input name="next" value="'+esc(f?.next)+'"></label>');
  workflowDialog(resolve?'Résoudre la panne':id?'Suivi du diagnostic':'Nouvelle panne',fields,(next,d)=>{
    const car=next.vehicles.find(x=>x.id===vehicle);
    let fault=id?car.faults.find(x=>x.id===id):null;
    if(id && (!fault || fault.closed))throw Error('Ce dossier n’est plus ouvert.');
    if(!d.text.trim() || (!id && !d.title.trim()))throw Error('Précise le symptôme ou le résultat.');
    if(!id){fault={id:uid(),title:d.title.trim(),events:[]};car.faults.unshift(fault)}
    fault.events.push({date:todayISO(),kind:resolve?'Résolution':d.kind||'Symptôme',text:d.text.trim()});
    fault.closed=resolve;fault.next=resolve?'':d.next.trim();
  });
}
// État de route : saisi par l'utilisateur ; la prochaine action reprend sinon le dossier.
function nextStep(v){
  if(v.road?.next)return {text:v.road.next,from:''};
  const fault=v.faults.find(f=>!f.closed && f.next);
  if(fault)return {text:fault.next,from:'Panne · '+fault.title};
  const due=(v.maintenance||[]).find(m=>serviceStatus(v,m)!=='Prévu');
  if(due)return {text:due.title+' · '+serviceStatus(v,due).toLowerCase(),from:'Entretien'};
  const task=v.tasks.find(t=>!t.done);
  if(task)return {text:task.text,from:'Tâche'};
  return null;
}
function roadSummary(v){
  const r=v.road, step=nextStep(v);
  const head=!r?'<span class="road-state unknown">État de route à renseigner</span>':
    r.state==='roulante'?'<span class="road-state ok">● Roulante</span>':
    '<span class="road-state stop">● Immobilisée</span><span class="road-reason">'+esc(r.reason)+'</span>';
  const since=r?.since?'<span class="muted">depuis le '+displayDay(r.since)+'</span>':'';
  const action='<p class="road-next"><span class="muted">Prochaine action :</span> '+(step?esc(step.text)+(step.from?' <small class="muted">('+esc(step.from)+')</small>':''):'à préciser')+'</p>';
  return '<div class="road" data-road-state="'+(r?.state||'inconnu')+'"><div class="road-head">'+head+since+'<button type="button" data-road="'+esc(v.id)+'">'+(r?'Changer l’état':'Renseigner l’état')+'</button></div>'+action+'</div>';
}
function roadDialog(id){
  const v=db.vehicles.find(x=>x.id===id), r=v.road||{};
  const step=nextStep({...v,road:null});
  const choice=(value,label)=>'<label class="road-choice"><input type="radio" name="state" value="'+value+'" required '+(r.state===value?'checked':'')+'> '+label+'</label>';
  const fields='<fieldset class="road-choices"><legend>La voiture est-elle utilisable ?</legend>'+choice('roulante','Roulante')+choice('immobilisée','Immobilisée')+'</fieldset>'+
    '<label>Motif de l’immobilisation<input name="reason" maxlength="200" value="'+esc(r.reason)+'" placeholder="Ex. : moteur déposé, attente de pièce, CT refusé"></label>'+
    '<label>Prochaine action<input name="next" maxlength="300" value="'+esc(r.next)+'" placeholder="'+esc(step?step.text:'Ex. : commander le joint de culasse')+'"></label>'+
    '<small>Laisse « Prochaine action » vide pour reprendre automatiquement la panne en cours, l’entretien dû ou la première tâche.</small>';
  const form=workflowDialog('État de route · '+v.name,fields,(next,d)=>{
    const car=next.vehicles.find(x=>x.id===id);
    if(!car)throw Error('Dossier véhicule introuvable.');
    if(!['roulante','immobilisée'].includes(d.state))throw Error('Choisis « Roulante » ou « Immobilisée ».');
    const reason=d.state==='immobilisée'?d.reason.trim():'';
    if(d.state==='immobilisée' && !reason)throw Error('Indique le motif de l’immobilisation.');
    const since=car.road?.state===d.state?car.road.since:todayISO();
    car.road={state:d.state,reason,next:d.next.trim(),since};
  });
  const sync=()=>{const stopped=form.elements.state.value==='immobilisée';form.elements.reason.required=stopped;form.elements.reason.closest('label').style.display=stopped?'':'none'};
  form.querySelectorAll('[name=state]').forEach(x=>x.onchange=sync);sync();
}
function calendarReminder(v,m){
  const escapeText=s=>String(s).replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/[,;]/g,x=>'\\'+x);
  const summary=escapeText(v.name+' · '+m.title);
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Vehily//Atelier//FR','BEGIN:VEVENT',
    'UID:'+v.id+'-'+m.id+'@vehily','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
    'DTSTART;VALUE=DATE:'+m.date.replaceAll('-',''),'SUMMARY:'+summary,'BEGIN:VALARM','ACTION:DISPLAY',
    'TRIGGER:'+(m.leadDays?'-P'+m.leadDays+'D':'PT0S'),'DESCRIPTION:'+summary,'END:VALARM','END:VEVENT','END:VCALENDAR'];
  const encoder=new TextEncoder();
  const folded=lines.map(line=>{
    let bytes=0,result='';
    for(const char of line){const size=encoder.encode(char).length;if(bytes+size>75){result+='\r\n ';bytes=1}result+=char;bytes+=size}
    return result;
  });
  return folded.join('\r\n')+'\r\n';
}
function downloadReminder(v,m){
  const url=URL.createObjectURL(new Blob([calendarReminder(v,m)],{type:'text/calendar;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='vehily-rappel.ics';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');
  if(!b)return;
  if(b.dataset.road){roadDialog(b.dataset.road);return}
  if(b.hasAttribute('data-add-part')||b.dataset.editPart)partDialog(current(),b.dataset.editPart);
  if(b.dataset.agenda){const v=db.vehicles.find(x=>x.id===b.dataset.vehicle);downloadReminder(v,v.maintenance.find(m=>m.id===b.dataset.agenda))}
  if(b.dataset.finish)finishService(b.dataset.vehicle,b.dataset.finish);
  if(b.hasAttribute('data-new-fault'))faultDialog(selected,null,false);
  if(b.dataset.faultNote)faultDialog(selected,b.dataset.faultNote,false);
  if(b.dataset.resolve)faultDialog(selected,b.dataset.resolve,true);
});
async function removeEntry(id){
  const collection=tab,vehicle=selected, entry=current()[collection].find(x=>x.id===id);
  if(!entry || !confirm('Supprimer « '+entry.title+' » ?'))return;
  const index=current()[collection].indexOf(entry);
  if(!await commitWorkshop(next=>{const rows=next.vehicles.find(v=>v.id===vehicle)[collection];const pos=rows.findIndex(x=>x.id===id);if(pos<0)throw Error('Entrée introuvable');rows.splice(pos,1)}))return;
  const undo=document.createElement('button');undo.textContent='Annuler la suppression';
  app.querySelector('.panel').prepend(undo);
  undo.onclick=()=>commitWorkshop(next=>{const rows=next.vehicles.find(v=>v.id===vehicle)[collection];if(!rows.some(x=>x.id===id))rows.splice(index,0,entry)});
}
// Compte rendu imprimable : état de route, entretiens, pannes et pièces.
function reportRoad(v){
  const r=v.road, step=nextStep(v);
  const state=!r?'non renseigné':r.state==='roulante'?'roulante':'immobilisée · '+esc(r.reason);
  return state+(r?.since?' (depuis le '+displayDay(r.since)+')':'')+'<br>Prochaine action : '+(step?esc(step.text):'à préciser');
}
function reportSections(v){
  const list=(items,empty)=>items.length?'<ul>'+items.join('')+'</ul>':'<p>'+empty+'</p>';
  const maintenance=list((v.maintenance||[]).map(m=>'<li>'+(m.type==='ct'?'Contrôle technique · ':'')+esc(m.title)+' · '+serviceStatus(v,m)+(m.date?' · '+displayDay(m.date):'')+(m.nextKm!=null?' · '+m.nextKm+' km':'')+'</li>'),'Aucune échéance.');
  const faults=list(v.faults.map(f=>'<li><strong>'+esc(f.title)+'</strong> · '+(f.closed?'résolue':'en cours · prochaine action : '+esc(f.next||'à préciser'))+'<br><small>'+f.events.map(e=>displayDay(e.date)+' · '+esc(e.kind)+' : '+esc(e.text)).join('<br>')+'</small></li>'),'Aucune panne consignée.');
  const parts=list(v.parts.map(p=>'<li>'+esc(p.name)+' · OEM '+esc(p.oem||'à renseigner')+' · '+esc(p.origin)+' · '+esc(p.state)+' · '+(p.price===null?'prix inconnu':euro(p.price))+'</li>'),'Aucune pièce consignée.');
  return '<h2>Entretiens et contrôles</h2>'+maintenance+'<h2>Pannes et diagnostic</h2>'+faults+'<h2>Pièces du véhicule</h2>'+parts;
}
