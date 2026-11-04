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
  return dueKm || (m.date && m.date<=todayISO()) ? 'À réaliser' : 'Prévu';
}
function serviceRow(v,m) {
  const details=[m.lastKm!=null?'Effectué à '+m.lastKm+' km':'',m.nextKm!=null?'Échéance à '+m.nextKm+' km':'',m.date?'Échéance le '+m.date.split('-').reverse().join('/'):''].filter(Boolean);
  return '<div class="row"><div><strong>'+esc(m.title)+'</strong><p>'+details.join(' · ')+'</p><span class="tag">'+serviceStatus(v,m)+'</span></div><button data-open="'+esc(v.id)+'" data-service="'+esc(m.id)+'">Modifier</button></div>';
}
function workshopPanels(){
  if(page==='dashboard'){
    let date;try{date=localStorage.getItem(exportKey)}catch{}
    const notice=document.createElement('section');notice.className='notice';
    notice.innerHTML='Stocké sur cet appareil · Dernier export lancé : '+esc(date||'aucun')+' <button data-page="settings">Sauvegardes</button>';
    if(loadError)notice.insertAdjacentText('afterbegin',loadError+' · Exporte les données brutes puis restaure une sauvegarde valide. ');
    app.prepend(notice);
    const covered=db.vehicles.filter(v=>v.maintenance?.length);
    if(covered.length)notice.insertAdjacentHTML('afterend','<section class="panel"><h2>Entretiens à suivre</h2>'+covered.map(v=>'<h3>'+esc(v.name)+'</h3>'+v.maintenance.map(m=>serviceRow(v,m)).join('')).join('')+'</section>');
  }
  if(page==='detail' && tab==='overview'){
    const v=current();app.insertAdjacentHTML('beforeend','<section class="panel"><h2>Entretien</h2><p>Compteur : '+(v.mileage==null?'à renseigner':v.mileage+' km')+'</p><div class="actions"><button data-action="mileage">Relever le kilométrage</button><button data-action="service">Ajouter un entretien</button></div>'+(v.maintenance||[]).map(m=>serviceRow(v,m)).join('')+'</section>');
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
  return '<label>Intervention<input required name="title" maxlength="200" value="'+esc(m.title)+'"></label>'+km('lastKm','Dernière intervention (km)')+km('nextKm','Prochaine échéance (km)')+'<label>Échéance par date<input type="date" name="date" value="'+esc(m.date)+'"></label>';
}
function dateField(){return '<label>Date de l’intervention<input required type="date" name="date"></label>'}
async function removeEntry(id){
  const collection=tab,vehicle=selected, entry=current()[collection].find(x=>x.id===id);
  if(!entry || !confirm('Supprimer « '+entry.title+' » ?'))return;
  const index=current()[collection].indexOf(entry);
  if(!await commitWorkshop(next=>{const rows=next.vehicles.find(v=>v.id===vehicle)[collection];const pos=rows.findIndex(x=>x.id===id);if(pos<0)throw Error('Entrée introuvable');rows.splice(pos,1)}))return;
  const undo=document.createElement('button');undo.textContent='Annuler la suppression';
  app.querySelector('.panel').prepend(undo);
  undo.onclick=()=>commitWorkshop(next=>{const rows=next.vehicles.find(v=>v.id===vehicle)[collection];if(!rows.some(x=>x.id===id))rows.splice(index,0,entry)});
}
