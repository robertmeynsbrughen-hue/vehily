// Synchronisation automatique des dossiers avec Supabase (projet partagé, table public.vehily).
// Un document JSON par compte ; la colonne version empêche d'écraser une modification faite ailleurs.
const SYNC_URL = 'https://rxchoinvdzehcqbfqjai.supabase.co';
const SYNC_KEY = 'sb_publishable_nqNzeRG-sRo4SBQMX3geXw_8MGeZr4N';
const SYNC_STATE = 'vehily-sync';

const vehilySync = (() => {
  let state = loadState(), timer = null, busy = null, status = '', message = '';
  function loadState() {
    try { return JSON.parse(localStorage.getItem(SYNC_STATE)) || {}; } catch { return {}; }
  }
  function saveState() {
    try { localStorage.setItem(SYNC_STATE, JSON.stringify(state)); } catch {}
  }
  const user = () => state.session?.user || null;
  function setStatus(s, m = '') { status = s; message = m; refreshUi(); }

  async function request(path, { method = 'GET', body, auth = true, prefer, retry = true } = {}) {
    if (auth) await ensureFresh();
    const headers = { apikey: SYNC_KEY, 'Content-Type': 'application/json' };
    if (auth) headers.Authorization = 'Bearer ' + state.session.access_token;
    if (prefer) headers.Prefer = prefer;
    const ctrl = new AbortController(), stop = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try { res = await fetch(SYNC_URL + path, { method, headers, body: body && JSON.stringify(body), signal: ctrl.signal }); }
    catch { throw Object.assign(Error('Hors connexion : la synchronisation reprendra automatiquement.'), { offline: true }); }
    finally { clearTimeout(stop); }
    if (res.status === 401 && auth && retry) { await refresh(); return request(path, { method, body, auth, prefer, retry: false }); }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw Object.assign(Error(authMessage(json) || 'Erreur serveur (' + res.status + ')'), { status: res.status });
    return json;
  }
  function authMessage(json) {
    const raw = json?.error_description || json?.msg || json?.message || json?.error || '';
    if (/invalid login credentials/i.test(raw)) return 'E-mail ou mot de passe incorrect.';
    if (/email not confirmed/i.test(raw)) return 'Confirme d’abord ton e-mail avec le lien reçu, puis reconnecte-toi.';
    if (/already registered|already exists/i.test(raw)) return 'Un compte existe déjà avec cet e-mail : connecte-toi.';
    if (/password/i.test(raw) && /(least|short|weak)/i.test(raw)) return 'Mot de passe trop faible : au moins 6 caractères.';
    return raw;
  }
  function keepSession(s) {
    if (!s?.access_token) return;
    const expires = s.expires_at ? s.expires_at * 1000 : Date.now() + (s.expires_in || 3600) * 1000;
    const changedUser = state.userId && state.userId !== s.user?.id;
    state.session = { access_token: s.access_token, refresh_token: s.refresh_token, expires, user: { id: s.user?.id, email: s.user?.email } };
    if (changedUser || !state.userId) { state.version = null; state.dirty = false; }
    state.userId = s.user?.id; saveState();
  }
  async function ensureFresh() {
    if (!state.session) throw Error('Non connecté.');
    if (state.session.expires - Date.now() < 60000) await refresh();
  }
  async function refresh() {
    try {
      keepSession(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: state.session.refresh_token } }));
    } catch (err) {
      if (err.offline) throw err;
      signOutLocal('Session expirée : reconnecte-toi pour reprendre la synchronisation.');
      throw err;
    }
  }

  // Lecture de l'appareil : uniquement des dossiers valides et déjà enregistrés.
  function localRaw() { try { return localStorage.getItem(KEY); } catch { return null; } }
  function localData() { return { schema: 1, ...readWorkshop(JSON.parse(localRaw() ?? JSON.stringify(db))) }; }
  const same = (a, b) => JSON.stringify(readWorkshop(structuredClone(a)).vehicles) === JSON.stringify(readWorkshop(structuredClone(b)).vehicles);

  async function applyRemote(row) {
    const clean = readWorkshop(structuredClone(row.data));
    const serialized = JSON.stringify(clean);
    const write = () => { localStorage.setItem(KEY, serialized); snapshot = serialized; db = JSON.parse(serialized); loadError = null; };
    navigator.locks ? await navigator.locks.request(KEY, write) : write();
    state.version = row.version; state.dirty = false; state.lastSync = new Date().toISOString(); saveState();
    render();
  }
  async function upload(base) {
    const data = localData();
    const rows = base == null
      ? await request('/rest/v1/vehily?select=version', { method: 'POST', prefer: 'return=representation', body: { data } }).catch(err => { if (err.status === 409) return []; throw err; })
      : await request('/rest/v1/vehily?select=version&user_id=eq.' + state.userId + '&version=eq.' + base, { method: 'PATCH', prefer: 'return=representation', body: { data, version: base + 1 } });
    if (!rows?.length) return false;
    state.version = rows[0].version; state.dirty = false; state.lastSync = new Date().toISOString(); saveState();
    return true;
  }
  const fetchRemote = async () => (await request('/rest/v1/vehily?select=data,version,updated_at'))[0] || null;

  async function syncNow() {
    if (!user() || loadError) return;
    if (busy) return busy;
    busy = (async () => {
      setStatus('sync');
      try {
        const remote = await fetchRemote();
        if (!remote) { await upload(null) || await syncAfterConflict(); }
        else if (state.version == null) {
          if (localRaw() === null || same(localData(), remote.data)) await applyRemote(remote);
          else await chooseVersion(remote, 'first');
        } else if (remote.version === state.version) {
          if (state.dirty && !(await upload(state.version))) await syncAfterConflict();
        } else if (!state.dirty) await applyRemote(remote);
        else if (same(localData(), remote.data)) await applyRemote(remote);
        else await chooseVersion(remote, 'conflict');
        setStatus(state.dirty ? 'pending' : 'ok');
      } catch (err) {
        setStatus(err.offline ? 'offline' : 'error', err.message);
      } finally { busy = null; }
    })();
    return busy;
  }
  async function syncAfterConflict() {
    const remote = await fetchRemote();
    if (remote) await chooseVersion(remote, 'conflict');
  }
  function backup(data, label) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'vehily-' + label + '-' + todayISO() + '.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  // Les deux côtés ont changé : la personne choisit, l'autre version est téléchargée en sauvegarde.
  function chooseVersion(remote, why) {
    const local = localData();
    return new Promise(resolve => {
      const dialog = document.querySelector('#modal');
      dialog.innerHTML = '<h2>Deux versions de tes dossiers</h2><p>' + (why === 'first'
        ? 'Ton compte contient déjà des dossiers et cet appareil aussi.'
        : 'Tes dossiers ont été modifiés sur un autre appareil et ici en même temps.') +
        '</p><p>En ligne : ' + remote.data.vehicles.length + ' véhicule(s), mis à jour le ' + new Date(remote.updated_at).toLocaleString('fr-FR') +
        '.<br>Cet appareil : ' + local.vehicles.length + ' véhicule(s).</p><p class="muted">La version écartée est téléchargée en sauvegarde JSON, tu pourras la réimporter.</p>' +
        '<div class="actions"><button class="primary" data-sync-keep="remote">Garder la version en ligne</button><button data-sync-keep="local">Garder cet appareil</button></div>';
      dialog.querySelectorAll('[data-sync-keep]').forEach(b => b.onclick = async () => {
        dialog.querySelectorAll('button').forEach(x => x.disabled = true);
        try {
          if (b.dataset.syncKeep === 'remote') { backup(local, 'cet-appareil'); await applyRemote(remote); }
          else {
            backup(remote.data, 'en-ligne');
            state.version = remote.version; state.dirty = true; saveState();
            if (!(await upload(remote.version))) throw Error('Les dossiers en ligne viennent encore de changer. Réessaie.');
          }
          dialog.oncancel = null; dialog.close(); toast('Synchronisation terminée');
        } catch (err) { dialog.oncancel = null; dialog.close(); setStatus('error', err.message); }
        resolve();
      });
      dialog.oncancel = e => { e.preventDefault(); };
      dialog.showModal();
    });
  }

  function changed() {
    if (!user()) return;
    state.dirty = true; saveState(); setStatus('pending');
    clearTimeout(timer); timer = setTimeout(syncNow, 1500);
  }
  async function signIn(email, password, create) {
    setStatus('sync');
    try {
      const path = create ? '/auth/v1/signup?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '/auth/v1/token?grant_type=password';
      const res = await request(path, { method: 'POST', auth: false, body: { email, password } });
      const session = res?.access_token ? res : res?.session;
      if (!session?.access_token) { setStatus('', 'Compte créé. Ouvre le lien reçu par e-mail pour le confirmer : la synchronisation démarrera ensuite.'); return; }
      keepSession(session); await syncNow();
    } catch (err) { setStatus('error', err.message); }
  }
  function signOutLocal(note = '') {
    state = {}; saveState(); clearTimeout(timer); setStatus('', note);
  }
  async function signOut() {
    if (state.dirty) await syncNow();
    if (state.dirty && !confirm('Des modifications ne sont pas encore en ligne. Te déconnecter quand même ? Elles restent sur cet appareil.')) return;
    const session = state.session; signOutLocal('Déconnecté. Tes dossiers restent sur cet appareil.');
    if (session) fetch(SYNC_URL + '/auth/v1/logout', { method: 'POST', headers: { apikey: SYNC_KEY, Authorization: 'Bearer ' + session.access_token } }).catch(() => {});
  }
  // Retour du lien de confirmation e-mail : la session arrive dans l'adresse.
  function readReturnLink() {
    const params = new URLSearchParams(location.hash.slice(1));
    if (!params.get('access_token') && !params.get('error_description')) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (params.get('error_description')) { message = 'Lien de confirmation invalide ou expiré : reconnecte-toi.'; return; }
    try {
      const payload = JSON.parse(atob(params.get('access_token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      keepSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), expires_at: Number(params.get('expires_at')) || null, expires_in: Number(params.get('expires_in')) || 3600, user: { id: payload.sub, email: payload.email } });
      message = 'E-mail confirmé.';
    } catch { message = 'Lien de confirmation illisible : reconnecte-toi.'; }
  }

  const time = iso => iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
  function label() {
    if (!user()) return 'Stocké sur cet appareil';
    const s = { sync: 'Synchronisation…', pending: 'Modifications en attente d’envoi', offline: 'Hors connexion · envoi à la reprise', error: 'Synchronisation à vérifier' }[status];
    return s || 'Synchronisé' + (state.lastSync ? ' à ' + time(state.lastSync) : '') + ' · ' + esc(user().email);
  }
  function panel() {
    const u = user();
    const info = message ? '<p class="sync-message" role="status">' + esc(message) + '</p>' : '';
    if (!u) return '<section class="panel" id="sync-panel"><h2>Synchronisation automatique</h2><p>Connecte-toi pour retrouver tes dossiers sur ton téléphone et ton ordinateur. Chaque modification est envoyée automatiquement.</p>' + info +
      '<form id="sync-form"><label>E-mail<input name="email" type="email" required autocomplete="email"></label><label>Mot de passe<input name="password" type="password" required minlength="6" autocomplete="current-password"></label>' +
      '<div class="actions"><button class="primary" type="submit">Se connecter</button><button type="submit" data-sync-create>Créer un compte</button></div></form></section>';
    return '<section class="panel" id="sync-panel"><h2>Synchronisation automatique</h2><p>Connecté : <strong>' + esc(u.email) + '</strong></p><p class="sync-status">' + label() + '</p>' + info +
      '<div class="actions"><button data-sync-now>Synchroniser maintenant</button><button data-sync-logout>Se déconnecter</button></div></section>';
  }
  function bindForm() {
    const form = app.querySelector('#sync-form');
    if (form) form.onsubmit = async e => {
      e.preventDefault();
      const create = e.submitter?.hasAttribute('data-sync-create');
      form.querySelectorAll('button').forEach(b => b.disabled = true);
      await signIn(form.elements.email.value.trim(), form.elements.password.value, create);
      form.querySelectorAll('button').forEach(b => b.disabled = false);
    };
  }
  function decorate(page) {
    if (page !== 'settings') return;
    app.querySelector('.panel')?.insertAdjacentHTML('beforebegin', panel());
    bindForm();
  }
  function refreshUi() {
    const old = document.querySelector('#sync-panel');
    const form = old?.querySelector('#sync-form');
    if (form && !user()) {
      // Formulaire de connexion : on garde la saisie et on met seulement le message à jour.
      old.querySelector('.sync-message')?.remove();
      if (message) form.insertAdjacentHTML('beforebegin', '<p class="sync-message" role="status">' + esc(message) + '</p>');
    } else if (old) { old.outerHTML = panel(); bindForm(); }
    const note = document.querySelector('[data-sync-label]');
    if (note) note.innerHTML = label();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (b?.hasAttribute('data-sync-now')) syncNow();
    if (b?.hasAttribute('data-sync-logout')) signOut();
  });
  function start() {
    readReturnLink();
    if (user()) syncNow();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
    addEventListener('online', syncNow);
    addEventListener('storage', e => { if (e.key === SYNC_STATE) state = loadState(); });
    setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
  }
  return { changed, syncNow, label, decorate, start, signOut };
})();
