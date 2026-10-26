'use strict';
/* ====== Dernière nuit : survie zombie ======
   Les comptes et le classement sont enregistrés dans le navigateur (localStorage),
   donc partagés sur un même appareil. Voir le LISEZMOI pour un classement multi-appareils. */
const $ = id => document.getElementById(id);
/* ====== Stockage partagé (jeu + admin) ======
   1) FB_URL renseigné  -> base Firebase : tous les comptes, tous les appareils.
   2) sinon, base Claude (si la page est publiée comme artefact Claude).
   3) sinon, localStorage : comptes de CET appareil seulement. */
const FB_URL = 'https://derniere-nuit-default-rtdb.europe-west1.firebasedatabase.app';
const LK = 'dn_users_v2';
const lload = () => { try { return JSON.parse(localStorage.getItem(LK)) || {}; } catch (e) { return {}; } };
const lsave = d => { try { localStorage.setItem(LK, JSON.stringify(d)); } catch (e) {} };
let DB = null, MODE = 'local';
async function fb(m, p, body) {
  const path = p ? '/' + p : '';
  const r = await fetch(FB_URL.replace(/\/+$/, '') + path + '.json', { 
    method: m, 
    headers: { 'Content-Type': 'application/json' }, 
    body: body === undefined ? undefined : JSON.stringify(body) 
  });
  if (!r.ok) throw new Error('fb ' + r.status);
  return r.json();
}
async function initOnline() {
  if (FB_URL) { try { await fb('GET', 'players/_ping'); MODE = 'firebase'; return; } catch (e) {} }
  try { if (window.claude && claude.use) { DB = await claude.use('db'); if (DB) MODE = 'claude'; } } catch (e) { DB = null; }
}
async function getUser(k) {
  if (MODE === 'firebase') return await fb('GET', 'players/' + k);
  if (MODE === 'claude') { const s = await DB.doc('players/' + k).get(); return s.data() || null; }
  return lload()[k] || null;
}
async function putUser(k, u) {
  if (MODE === 'firebase') { await fb('PUT', 'players/' + k, u); return; }
  if (MODE === 'claude') { await DB.doc('players/' + k).set(u); return; }
  const d = lload(); d[k] = u; lsave(d);
}
async function patchUser(k, ch) {
  if (MODE === 'firebase') { await fb('PATCH', 'players/' + k, ch); return; }
  const u = (await getUser(k)) || {};
  for (const f in ch) { if (ch[f] === null) delete u[f]; else u[f] = ch[f]; }
  await putUser(k, u);
}
async function dropUser(k) {
  if (MODE === 'firebase') { await fb('DELETE', 'players/' + k); return; }
  if (MODE === 'claude') { await DB.doc('players/' + k).delete(); return; }
  const d = lload(); delete d[k]; lsave(d);
}
async function allUsers(withDel) {
  let a;
  if (MODE === 'firebase') { const o = await fb('GET', 'players'); a = o ? Object.values(o) : []; }
  else if (MODE === 'claude') { const s = await DB.collection('players').limit(500).get(); a = s.docs.map(d => d.data()); }
  else a = Object.values(lload());
  return a.filter(u => u && typeof u === 'object' && u.name && !u.purged && (withDel || !u.del));
}
/* ---------- Données communes : messages au staff, bugs, idées ----------
   Firebase : staffmsg/{clé joueur}/{id}   posts/bug/{id}   posts/idea/{id}   (voir le détail dans le message)
   Hors Firebase : copie locale (localStorage), pour tester. */
const LF = 'dn_feed_v1';
const fload = () => { try { return JSON.parse(localStorage.getItem(LF)) || {}; } catch (e) { return {}; } };
const fsave = d => { try { localStorage.setItem(LF, JSON.stringify(d)); } catch (e) {} };
const segs = p => p.split('/').filter(Boolean);
async function dget(p) {
  if (MODE === 'firebase') return await fb('GET', p);
  let n = fload(); for (const k of segs(p)) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n === undefined ? null : n;
}
async function dput(p, v) {
  if (MODE === 'firebase') { await fb('PUT', p, v); return; }
  const d = fload(), a = segs(p), last = a.pop(); let n = d;
  for (const k of a) { if (!n[k] || typeof n[k] !== 'object') n[k] = {}; n = n[k]; } n[last] = v; fsave(d);
}
async function ddel(p) {
  if (MODE === 'firebase') { await fb('DELETE', p); return; }
  const d = fload(), a = segs(p), last = a.pop(); let n = d;
  for (const k of a) { if (!n || typeof n[k] !== 'object') return; n = n[k]; } if (n) delete n[last]; fsave(d);
}
async function topList(n = 10) {
  return (await allUsers(false)).sort((a, b) => (b.best || 0) - (a.best || 0) || a.name.localeCompare(b.name)).slice(0, n);
}

const cv = $('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize); resize();

/* ---------- Stockage : en ligne (base partagée) ou local ---------- */
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const keyOf = n => [...n.toLowerCase()].map(c => /[a-z0-9]/.test(c) ? c : '_' + c.charCodeAt(0).toString(36)).join('');
let cur = null, ckey = null;
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR');
function certEl() { const c = document.createElement('i'); c.className = 'cert'; c.textContent = 'OK'; c.title = 'Compte certifié'; return c; }
/* Récompenses du Ciel SMP (serveur Minecraft) */
const CIEL = [['50 000 $ + 5 clés event', '#ffd24a'], ['2 000 $ + 3 clés mythiques', '#cfd6e2'], ['500 $ + 1 clé de générateur', '#d98b5a']];
const CIEL_OTHER = '100 $';
const cielRw = i => i < 3 ? CIEL[i][0] : CIEL_OTHER;
async function renderLB(el, rw) {
  const a = await topList(rw ? 100 : 10).catch(() => null); el.innerHTML = '';
  document.querySelectorAll('.net').forEach(n => n.textContent = MODE !== 'local' ? 'Classement en ligne, partagé entre tous les joueurs' : 'Classement local : seulement les comptes de cet appareil');
  if (!a) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Classement indisponible (connexion à la base impossible).'; el.appendChild(li); return; }
  if (!a.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Aucun score pour l’instant. Soyez le premier.'; el.appendChild(li); return; }
  a.forEach((v, i) => {
    const li = document.createElement('li'); if (cur && v.name === cur.name) li.className = 'me';
    const s = document.createElement('span'); s.textContent = v.name; if (v.cert) s.append(' ', certEl()); if (tiOf(v)) s.append(' ', ttlEl(v.ti)); li.style.cursor = 'pointer'; li.onclick = () => inspect(keyOf(v.name), rw ? cielPage : undefined);
    if (rw) { const r = document.createElement('small'); r.className = 'rw'; r.textContent = cielRw(i) + ' (Ciel SMP)'; s.appendChild(r); }
    const b = document.createElement('b'); b.textContent = v.best; li.append(avEl(v, 28), s, b); el.appendChild(li);
  });
}
function show(id) { ['auth', 'menu', 'over', 'pause', 'perk', 'info'].forEach(s => $(s).classList.toggle('hide', s !== id)); }
function hud(v) { $('hud').classList.toggle('hide', !v); $('hbot').classList.toggle('hide', !v); }
function showMenu() {
  G.playing = false; hud(false); show(cur ? 'menu' : 'auth');
  if (cur) { $('who').textContent = cur.name; if (cur.cert) $('who').append(' ', certEl()); $('mav').replaceChildren(avEl(cur, 84)); $('rec').textContent = cur.best; $('mon').textContent = fmt(cur.money); renderLB($('lb')); } else setMode(mode);
}
const setErr = (t, ok) => { const e = $('err'); e.textContent = t; e.style.color = ok ? 'var(--ok)' : ''; };
async function hashPw(p, k) {
  try { if (crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('dn1|' + k + '|' + p)); return 's:' + [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } } catch (e) {}
  return hash(p + k);
}
let mode = 'login', fails = 0, lockUntil = 0;
function setMode(m) {
  mode = m; $('tabL').classList.toggle('on', m === 'login'); $('tabR').classList.toggle('on', m === 'reg'); $('lab2').classList.toggle('hide', m === 'login');
  $('btnLogin').textContent = m === 'login' ? 'Se connecter' : 'Créer mon compte';
  $('hintA').textContent = m === 'login' ? 'Vous avez déjà un compte ? Entrez votre pseudo et votre mot de passe.' : 'Pas encore de compte ? Choisissez un pseudo et un mot de passe (6 caractères minimum).';
  setErr('');
}
async function login() {
  const n = $('pseudo').value.trim(), p = $('pass').value, reg = mode === 'reg';
  if (Date.now() < lockUntil) return setErr('Trop d’essais. Patientez ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' s.');
  if (!/^[\p{L}\p{N}_-]{3,14}$/u.test(n)) return setErr('Pseudo : 3 à 14 caractères (lettres, chiffres, - ou _).');
  if (reg && p.length < 6) return setErr('Mot de passe : 6 caractères minimum.');
  if (!reg && !p) return setErr('Entrez votre mot de passe.');
  if (reg && p !== $('pass2').value) return setErr('Les deux mots de passe ne correspondent pas.');
  $('btnLogin').disabled = true; setErr('Veuillez patienter…', 1);
  try {
    const k = keyOf(n); let u = await getUser(k);
    if (reg) {
      if (u && !u.purged) return setErr('Ce pseudo est déjà pris. Choisissez-en un autre, ou connectez-vous.');
      u = { name: n, h: await hashPw(p, k), best: 0, games: 0, kills: 0, dw: ['pistol', 'knife'], dz: [], cert: false, vw: [], wl: {} }; await putUser(k, u);
    } else {
      if (!u) return setErr('Aucun compte avec ce pseudo. Utilisez l’onglet « Inscription ».');
      if (u.del) return setErr('Ce compte a été supprimé.');
      const sec = u.h.startsWith('s:');
      if (!(sec ? u.h === await hashPw(p, k) : u.h === hash(p + k))) { if (++fails >= 5) { lockUntil = Date.now() + 15000; fails = 0; } return setErr('Mot de passe incorrect.'); }
      if (!sec) { u.h = await hashPw(p, k); await putUser(k, u); }
    }
    fails = 0; norm(u); await ensureIp(u, k);
    cur = u; ckey = k; if ($('stay').checked) localStorage.setItem('dn_sess', JSON.stringify({ k, h: u.h })); else localStorage.removeItem('dn_sess');
    $('pass').value = $('pass2').value = ''; setErr(''); showMenu();
  } catch (e) { setErr('Erreur de connexion. Réessayez.'); }
  finally { $('btnLogin').disabled = false; }
}
const HOW = `<ul class="how"><li><b>Se déplacer</b> : flèches ou ZQSD / WASD.</li><li><b>Viser</b> : le canon suit votre curseur.</li><li><b>Tirer</b> : maintenez le clic gauche.</li><li><b>Esquive</b> : Maj ou Espace (recharge 1,6 s).</li><li><b>Pouvoir</b> : rare, lâché par certains zombies. Il apparaît dans la case à côté de votre barre de vie et s’utilise plusieurs fois. <b>Clic droit</b> (ou touche E) pour l’activer.</li></ul><div id="howExtra" class="hide"><ul class="how"><li><b>Tir</b> : le pistolet tire un coup par clic ; les armes automatiques tirent tant que vous maintenez.</li><li><b>Armes</b> : certains zombies lâchent une arme (les meilleures n’arrivent que dans les vagues avancées). Chaque arme a sa propre réserve de munitions, avec un maximum différent (le sniper et le railgun en portent peu, la mitraillette et le minigun beaucoup). Vos armes et leurs munitions s’affichent en petit sous la barre de vie ; l’arme choisie est entourée. Ramasser une arme déjà possédée ou une caisse MU recharge les réserves. <b>Changer d’arme</b> : touches 1 à 9, Q, molette de la souris, ou toucher une arme dans l’inventaire sous la barre de vie. Arme vide : vous passez à une autre arme chargée, sinon au couteau.</li><li><b>Bonus</b> : croix soin, bouclier, flèches vitesse, ×2 points, bombe, flocon gel (zombies ralentis), ! furie (tir ×2), caisse MU munitions, U aimant (attire les bonus).</li><li><b>Zombies</b> : chaque type rapporte des points différents. Méfiez-vous des cracheurs et des kamikazes.</li><li><b>Vagues</b> : elles deviennent de plus en plus dures jusqu’à la vague 100, avec plus de zombies au fil du temps, de nouveaux types dès les vagues 12 à 20 et un boss unique aux vagues 15, 25, 35, 45, 55, 65, 75, 85 et 100 (colosse toutes les 5 vagues, titan toutes les 10).</li><li><b>Combo</b> : enchaînez les kills pour des points et de l’argent en plus.</li><li><b>Argent</b> : vous en gagnez en direct en jouant, selon les zombies abattus, les combos, la distance parcourue et les vagues atteintes. Il s’affiche en haut à droite et est enregistré régulièrement.</li><li><b>Pouvoirs (12)</b> : Lasers, Onde de choc, Lames tournantes, Frappe aérienne, Tempête de balles, Soin de zone, Chrono, Barrière (invulnérable), Furie (tir ×2 et vitesse), Anneau de feu, Foudre (frappe les 8 zombies les plus proches) et Siphon (aspire la vie des zombies et vous soigne).</li><li><b>Boutique</b> (carte Argent) : achetez des skins.</li><li><b>Menu d’amélioration</b> (carte Argent) : toutes les armes et tous les pouvoirs sont là, jusqu’au niveau 5. Armes : +15 % de dégâts, tir plus rapide, +12 % de munitions par ramassage, balles perforantes au niveau 3. Pouvoirs : +15 % de puissance, +10 % de durée, +1 charge au niveau 3.</li><li><b>Améliorations de partie</b> : à la fin de chaque vague, choisissez 1 petite amélioration parmi 3 pour la partie en cours (14 améliorations différentes, la plupart s’empilent).</li><li><b>Profils</b> : consultez les comptes des autres joueurs. Le badge OK bleu marque les comptes certifiés.</li><li><b>Skins</b> (Mon espace) : 3 skins sont débloqués au départ, les autres s’achètent. Changez aussi la couleur du maillot, des cheveux et du teint, et la coiffure.</li><li><b>Titres</b> (Mon espace) : tuez des zombies, ramassez des armes, allez loin… pour débloquer des titres aux styles différents (faciles ou très durs). Au départ vous n’en avez aucun. Équipez-en un dans « Personnaliser mon profil » ou dans la case Titres, qui montre aussi comment débloquer chacun.</li><li><b>Découvertes</b> : Mon espace garde la liste des armes, zombies et pouvoirs déjà trouvés. Le niveau de chaque arme et de chaque pouvoir y est affiché.</li><li><b>Info</b> et <b>Ciel SMP</b> : la case Info présente le créateur du jeu ; la case Ciel SMP montre le classement des meilleurs joueurs et leurs récompenses sur le serveur Minecraft Ciel SMP (top 3 et tous les autres).</li><li><b>Tactile</b> : stick virtuel pour bouger, tir automatique, touchez la case pouvoir pour l’utiliser.</li><li><b>Pause</b> : Échap · <b>Son</b> : M (effets sonores).</li></ul></div><button id="howMore" class="btn ghost sm">Afficher plus</button>`;
function icon(tab, o, d, id) {
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d'); x.translate(48, 54);
  if (tab === 'z') headArt(x, id, o); else if (tab === 'q') { x.scale(2.4, 2.4); x.translate(0, -2); pArt(x, id, o.col); } else { x.translate(-3, -4); x.scale(1.05, 1.05); wArt(x, id, o.col); }
  if (!d) { x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#2a3d5e'; x.fillRect(0, 0, 96, 96); }
  return c;
}
function avEl(u, s) {
  const ok = u && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(u.av || '');
  const e = document.createElement(ok ? 'img' : 'div'); e.className = 'av'; e.style.width = e.style.height = s + 'px';
  if (ok) e.src = u.av; else { e.textContent = (u && u.name ? u.name[0] : '?').toUpperCase(); e.style.background = /^#[0-9a-f]{6}$/i.test(u && u.col || '') ? u.col : '#2a3d5e'; e.style.fontSize = s * .5 + 'px'; }
  return e;
}
async function ensureIp(u, k) {
  if (/^\d{10}$/.test(u.ip || '')) return;
  const used = new Set((await allUsers(true)).map(x => x.ip)); let v;
  do { const a = new Uint32Array(2); crypto.getRandomValues(a); v = String((a[0] % 9 + 1) * 1e9 + a[1] % 1e9); } while (used.has(v));
  u.ip = v; await putUser(k, u);
}
async function autoLogin() {
  try {
    const t = JSON.parse(localStorage.getItem('dn_sess')); if (!t || cur) return;
    const u = await getUser(t.k);
    if (u && !u.del && u.h === t.h) { norm(u); await ensureIp(u, t.k); cur = u; ckey = t.k; showMenu(); } else localStorage.removeItem('dn_sess');
  } catch (e) {}
}
function info(tab) {
  $('infoBody').scrollTop = 0;
  curTab = tab; setBack(null);
  if (tab === 's') return stats(); if (tab === 'p') return profHome(); if (tab === 'k') return skins(); if (tab === 'b') return shop();
  if (tab === 't') return titlesPage(); if (tab === 'a') return upgrades(); if (tab === 'v') return userList(); if (tab === 'n') return infoPage(); if (tab === 'c') return cielPage(); if (tab === 'h') return staffHome();
  const box = $('infoBody'); box.innerHTML = ''; box.className = 'grid2';
  const L = { w: ['Armes découvertes', WP, 'dw', 'wk'], z: ['Zombies découverts', TYPES, 'dz', 'zk'], q: ['Pouvoirs découverts', PW, 'dp', 'pk'] }[tab];
  $('infoT').textContent = L[0];
  const list = L[1], got = cur[L[2]] || [], cnt = cur[L[3]] || {};
  $('infoC').textContent = got.length + ' / ' + Object.keys(list).length + ' découverts';
  for (const [id, o] of Object.entries(list)) {
    const d = got.includes(id), c = document.createElement('div'); c.className = 'cx' + (d ? '' : ' lock');
    const lv = tab === 'w' ? wlv(id) : tab === 'q' ? plv(id) : 0;
    const t = document.createElement('div'), b = document.createElement('b'), q = document.createElement('p'), s = document.createElement('small');
    b.textContent = d ? o.name : '???'; q.textContent = d ? o.desc : { w: 'Arme à trouver sur les zombies.', z: 'Zombie à abattre pour le découvrir.', q: 'Pouvoir rare à ramasser.' }[tab];
    if (d) {
      if (tab === 'w') s.textContent = 'Niveau ' + lv + ' / ' + MAXLV + ' · Dégâts ' + +(o.dmg * (1 + .15 * lv) * o.n).toFixed(2) + ' · Munitions : ' + (id === 'knife' ? 'aucune' : MAXAM[id] + ' maximum') + (o.tier ? ' · dès la vague ' + o.tier : '') + ' · Récupérée ×' + (cnt[id] || 0);
      else if (tab === 'q') s.textContent = 'Niveau ' + lv + ' / ' + MAXLV + ' · Durée ' + (o.dur ? +(o.dur * (1 + .1 * lv)).toFixed(1) + ' s' : 'instantané') + ' · ' + (o.n + (lv >= 3 ? 1 : 0)) + ' charges · Utilisé ×' + (cnt[id] || 0);
      else s.textContent = 'Vie ' + o.hp + ' · Vitesse ' + o.sp + ' · ' + o.pts + ' pt' + (o.pts > 1 ? 's' : '') + ' · Tué ×' + (cnt[id] || 0);
    } else if (lv > 0) s.textContent = 'Niveau ' + lv + ' / ' + MAXLV + ' (améliorée, pas encore trouvée)';
    t.append(b, q, s); c.append(icon(tab, o, d, id), t); box.appendChild(c);
  }
  show('info');
}
function stats() {
  const u = cur, box = $('infoBody'); box.innerHTML = ''; box.className = 'tiles'; $('infoT').textContent = 'Statistiques'; $('infoC').textContent = u.name;
  const d = u.dist || 0, sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
  fillTiles(box, tileList(u));
  show('info');
}
const COLS = ['#ff7a2f', '#ff4d5e', '#5fd6a0', '#7fb8ff', '#b57cff', '#ffd24a', '#ff7ad9', '#7fe3d0'];
function profile() {
  const box = $('infoBody'); box.innerHTML = ''; box.className = 'prof'; $('infoT').textContent = 'Personnaliser'; $('infoC').textContent = 'Votre photo apparaît dans le classement, à côté de votre pseudo.'; setBack(profHome);
  const pv = document.createElement('div'), up = () => pv.replaceChildren(avEl(cur, 110)), save = async () => { up(); await putUser(ckey, cur); };
  const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.className = 'hide';
  const b1 = document.createElement('button'); b1.className = 'btn'; b1.textContent = 'Choisir une photo'; b1.onclick = () => f.click();
  const b2 = document.createElement('button'); b2.className = 'btn ghost'; b2.textContent = 'Retirer la photo'; b2.onclick = () => { delete cur.av; save(); };
  f.onchange = () => { const fl = f.files[0]; if (!fl) return; const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 96; const m = Math.min(im.width, im.height); c.getContext('2d').drawImage(im, (im.width - m) / 2, (im.height - m) / 2, m, m, 0, 0, 96, 96); cur.av = c.toDataURL('image/jpeg', .82); URL.revokeObjectURL(im.src); save(); }; im.onerror = () => { $('infoC').textContent = 'Image illisible.'; }; im.src = URL.createObjectURL(fl); };
  const lab = document.createElement('small'); lab.textContent = 'Couleur (quand il n’y a pas de photo) :';
  const sw = document.createElement('div'); sw.className = 'sw'; COLS.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.setAttribute('aria-label', 'Couleur ' + c); b.onclick = () => { cur.col = c; save(); }; sw.appendChild(b); });
  const bl = document.createElement('small'); bl.textContent = 'Présentation (60 caractères max) :';
  const bi = document.createElement('input'); bi.maxLength = 60; bi.value = cur.bio || ''; bi.placeholder = 'Ex : chasseur de colosses';
  const bs = document.createElement('button'); bs.className = 'btn ghost'; bs.textContent = 'Enregistrer la présentation'; bs.onclick = async () => { cur.bio = bi.value.trim().slice(0, 60); await putUser(ckey, cur); bs.textContent = 'Enregistré'; };
  const tl = mk('small', '', 'Titre (affiché sous votre pseudo) :'), tw = mk('div', 'sw');
  if (checkTitles(cur).length) putUser(ckey, cur).catch(() => {});
  const drawT = () => {
    tw.replaceChildren();
    if (!cur.tu.length) { tw.append(mk('small', '', 'Vous n’avez encore aucun titre. Débloquez-en en jouant : la liste est dans Mon espace › Titres.')); return; }
    const pickT = id => async () => { cur.ti = id; try { await putUser(ckey, cur); } catch (e) {} drawT(); };
    const no = mk('button', 'mini' + (cur.ti ? '' : ' on'), 'Aucun'); no.onclick = pickT(''); tw.append(no);
    TLIST.filter(t => cur.tu.includes(t.id)).forEach(t => { const b = mk('button', 'tb' + (cur.ti === t.id ? ' on' : '')); b.setAttribute('aria-label', 'Titre ' + t.name); b.appendChild(ttlEl(t.id)); b.onclick = pickT(t.id); tw.append(b); });
  };
  drawT();
  const tb = mk('button', 'btn ghost', 'Voir tous les titres'); tb.onclick = () => titlesPage(profile);
  box.append(pv, b1, b2, lab, sw, bl, bi, bs, tl, tw, tb, f); up(); show('info');
}
/* ---------- Profils, administration, atelier ---------- */
let curTab = '', backFn = null;
const MAXLV = 5;
const DF = { n: 'Normal', hp: 1, dm: 1, cash: 1, sc: 1, sp: 1 };
const wlv = id => Math.min(MAXLV, ((cur && cur.wl) || {})[id] || 0);
const maxAm = id => Math.ceil((MAXAM[id] || 0) * (1 + .1 * G.pk.am));
const wcost = id => Math.round((wlv(id) + 1) * (110 + (WP[id].tier || 0) * 35));
const plv = id => Math.min(MAXLV, ((cur && cur.pl) || {})[id] || 0);
const pm = id => 1 + .15 * plv(id);
const pdur = id => PW[id].dur * (1 + .1 * plv(id));
const pch = id => PW[id].n + (plv(id) >= 3 ? 1 : 0);
const pcost = id => Math.round((plv(id) + 1) * (160 + Object.keys(PW).indexOf(id) * 25));
function mk(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
function setBack(f) { backFn = f; $('btnInfoBack').textContent = f ? 'Retour' : 'Retour au menu'; }
function nameEl(u) { const s = mk('span', 'nm', u.name); if (u.cert) s.append(' ', certEl()); if (tiOf(u)) s.append(' ', ttlEl(u.ti)); return s; }
function fillTiles(box, list) { list.forEach(([l, v]) => { const t = mk('div', 'tile'); t.append(mk('b', '', v), mk('span', '', l)); box.appendChild(t); }); }
function tileList(u) {
  const d = u.dist || 0, sum = o => Object.values(o || {}).reduce((a, b) => a + b, 0), zk = u.zk || {};
  return [['Record', u.best || 0], ['Argent', fmt(u.money) + ' $'], ['Parties jouées', u.games || 0], ['Points gagnés (total)', u.total || 0], ['Zombies tués', u.kills || 0], ['Distance parcourue', d >= 1000 ? (d / 1000).toFixed(2) + ' km' : Math.round(d) + ' m'], ['Temps de jeu', Math.round((u.tp || 0) / 60) + ' min'], ['Meilleure vague', u.bw || 0], ['Tirs effectués', u.shots || 0], ['Boss abattus', TS.boss(u)], ['Armes ramassées', sum(u.wk)], ['Pouvoirs utilisés', sum(u.pk)], ['Argent total gagné', fmt(u.earned) + ' $']];
}
async function profHome() {
  setBack(null); curTab = 'p';
  const box = $('infoBody'); box.className = 'prof'; box.replaceChildren(mk('small', '', 'Chargement…'));
  $('infoT').textContent = 'Mon profil'; $('infoC').textContent = ''; show('info');
  try { const f = await getUser(ckey); if (f) cur = norm(f); } catch (e) {}
  if (checkTitles(cur).length) putUser(ckey, cur).catch(() => {});
  const u = cur, sk = SK[u.sk] || SK.surv, ph = mk('div', 'ph'), sp = mk('div', 'skp');
  sp.appendChild(skinIcon(skinOf(u), 96)); ph.append(avEl(u, 96), sp);
  const nm = mk('h2', 'pn', u.name); if (u.cert) nm.append(' ', certEl());
  const tl = mk('div', 'tiles');
  fillTiles(tl, [['Record', u.best || 0], ['Argent', fmt(u.money) + ' $'], ['Skin équipé', sk.name], ['Certifié', u.cert ? 'Oui' : 'Non'], ['Vues du profil', u.vw.length], ['Parties jouées', u.games || 0], ['Titres débloqués', u.tu.length + ' / ' + TLIST.length]]);
  const b1 = mk('button', 'btn', 'Personnaliser mon profil'); b1.onclick = profile;
  const b2 = mk('button', 'btn ghost', 'Voir mon profil comme les autres'); b2.onclick = () => inspect(ckey, profHome);
  const b4 = mk('button', 'btn ghost', 'Mes titres'); b4.onclick = () => titlesPage(profHome);
  const det = mk('div', 'tiles hide'), dt = mk('div', 'tile'), ipb = mk('b', '', '••••••••••'), rv = mk('button', 'mini', 'Afficher l’IP'); let tm = null;
  dt.append(ipb, mk('span', '', 'IP secrète : ne la partagez jamais')); det.append(dt, rv);
  rv.onclick = () => { clearTimeout(tm); if (ipb.textContent.includes('•')) { ipb.textContent = u.ip || '—'; rv.textContent = 'Masquer l’IP'; tm = setTimeout(rv.onclick, 10000); } else { ipb.textContent = '••••••••••'; rv.textContent = 'Afficher l’IP'; } };
  const b3 = mk('button', 'btn ghost', 'Détails du profil'); b3.onclick = () => det.classList.toggle('hide');
  const tt = tiOf(u) ? [ttlEl(u.ti, true)] : [];
  box.replaceChildren(ph, nm, ...tt, mk('small', '', u.bio || 'Aucune présentation pour l’instant.'), tl, b1, b2, b4, b3, det);
}
async function inspect(k, back) {
  curTab = 'i'; const box = $('infoBody'); box.className = 'prof'; box.replaceChildren(mk('small', '', 'Chargement…'));
  $('infoT').textContent = 'Profil'; $('infoC').textContent = ''; setBack(back || null); show('info');
  const u = await getUser(k);
  if (!u || u.del) { box.replaceChildren(mk('small', '', 'Compte introuvable.')); return; }
  norm(u);
  if (k !== ckey && !u.vw.includes(ckey)) { u.vw.push(ckey); await putUser(k, u); }
  const sk = SK[u.sk] || SK.surv, ph = mk('div', 'ph'), sp = mk('div', 'skp');
  sp.appendChild(skinIcon(skinOf(u), 96)); ph.append(avEl(u, 96), sp);
  const nm = mk('h2', 'pn', u.name); if (u.cert) nm.append(' ', certEl());
  const tl = mk('div', 'tiles'), base = tileList(u);
  fillTiles(tl, base.slice(0, 2).concat([['Skin équipé', sk.name], ['Certifié', u.cert ? 'Oui' : 'Non'], ['Vues du profil', u.vw.length], ['Titres débloqués', u.tu.length + ' / ' + TLIST.length]], base.slice(2)));
  const tt = tiOf(u) ? [ttlEl(u.ti, true)] : [];
  box.replaceChildren(ph, nm, ...tt, mk('small', '', u.bio || 'Aucune présentation.'), tl);
}
async function userList() {
  curTab = 'v';
  const box = $('infoBody'); box.className = 'list'; box.replaceChildren(mk('small', '', 'Chargement…'));
  $('infoT').textContent = 'Regarder les profils'; $('infoC').textContent = ''; setBack(null); show('info');
  const all = (await allUsers()).sort((a, b) => (b.best || 0) - (a.best || 0));
  $('infoC').textContent = all.length + ' compte' + (all.length > 1 ? 's' : '') + ' inscrit' + (all.length > 1 ? 's' : '');
  const q = mk('input'); q.placeholder = 'Rechercher un pseudo…'; q.autocomplete = 'off';
  const ul = mk('div', 'ul');
  const draw = () => {
    const f = q.value.trim().toLowerCase(); ul.replaceChildren();
    all.filter(u => u.name.toLowerCase().includes(f)).forEach(u => {
      const k = keyOf(u.name), r = mk('div', 'urow'), t = mk('div', 'ut');
      t.append(nameEl(u), mk('small', '', 'Record ' + (u.best || 0) + ' · ' + fmt(u.money) + ' $'));
      const bi = mk('button', 'mini', 'Inspecter'); bi.onclick = () => inspect(k, userList);
      r.append(avEl(u, 38), t, bi); ul.appendChild(r);
    });
    if (!ul.children.length) ul.appendChild(mk('small', '', 'Aucun compte trouvé.'));
  };
  q.oninput = draw; box.replaceChildren(q, ul); draw();
}
/* ---------- Menu d'amélioration : toutes les armes et tous les pouvoirs ---------- */
function upgrades() {
  curTab = 'a';
  const box = $('infoBody'), st = box.scrollTop; box.innerHTML = ''; box.className = 'grid2';
  $('infoT').textContent = 'Menu d’amélioration';
  $('infoC').textContent = 'Argent : ' + fmt(cur.money) + ' $ · Armes : +15 % de dégâts, tir plus rapide, +12 % de munitions par ramassage, balles perforantes au niveau 3. Pouvoirs : +15 % de puissance, +10 % de durée, +1 charge au niveau 3. Les armes et pouvoirs grisés se débloquent en les trouvant en partie.';
  const card = (kind, id, o) => {
    const w = kind === 'w', lv = w ? wlv(id) : plv(id), cost = w ? wcost(id) : pcost(id);
    if (!((w ? cur.dw : cur.dp) || []).includes(id)) {   /* pas encore débloquée : grisée, non améliorable */
      const c = mk('div', 'cx lock'), t = mk('div'), b = mk('b', '', '???'), e = mk('button', 'mini', 'Verrouillée');
      const q = mk('small', '', w ? 'Arme verrouillée : trouvez-la sur un zombie' + (o.tier ? ' (à partir de la vague ' + o.tier + ')' : '') + '.' : 'Pouvoir verrouillé : ramassez-le en partie pour le débloquer.');
      e.disabled = true; t.append(b, q, e); c.append(icon(w ? 'w' : 'q', o, false, id), t); box.appendChild(c); return;
    }
    const c = mk('div', 'cx'), t = mk('div'), e = mk('button', 'mini'), b = mk('b', '', o.name);
    const q = mk('small', '', w ? 'Niveau ' + lv + ' / ' + MAXLV + ' · dégâts ×' + (1 + .15 * lv).toFixed(2)
      : 'Niveau ' + lv + ' / ' + MAXLV + ' · puissance ×' + (1 + .15 * lv).toFixed(2) + (o.dur ? ' · durée ' + +(o.dur * (1 + .1 * lv)).toFixed(1) + ' s' : '') + ' · ' + (o.n + (lv >= 3 ? 1 : 0)) + ' charges');
    if (lv >= MAXLV) { e.textContent = 'Niveau maximum'; e.disabled = true; }
    else if (cur.money < cost) { e.textContent = 'Il manque ' + fmt(cost - cur.money) + ' $'; e.disabled = true; }
    else {
      e.textContent = 'Améliorer · ' + fmt(cost) + ' $';
      e.onclick = async () => {
        const l = w ? wlv(id) : plv(id), cs = w ? wcost(id) : pcost(id); if (l >= MAXLV || cur.money < cs) return;
        cur.money -= cs; (w ? cur.wl : cur.pl)[id] = l + 1; await putUser(ckey, cur); upgrades();
      };
    }
    t.append(b, q, e); c.append(icon(w ? 'w' : 'q', o, true, id), t); box.appendChild(c);
  };
  box.appendChild(mk('div', 'sec', 'Armes'));
  const srt = (list, got) => Object.keys(list).sort((a, b) => (got.includes(b) - got.includes(a)) || ((list[a].tier || 0) - (list[b].tier || 0)));
  for (const id of srt(WP, cur.dw || [])) card('w', id, WP[id]);
  box.appendChild(mk('div', 'sec', 'Pouvoirs'));
  for (const id of srt(PW, cur.dp || [])) card('q', id, PW[id]);
  show('info'); box.scrollTop = st;
}
/* ---------- Contacter le staff : message privé, bugs, idées ---------- */
const MAXTXT = 500;
let lastSend = 0, fsort = 'new';
const fdate = ts => ts ? new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const newId = () => String(Date.now()).padStart(13, '0') + '_' + Math.random().toString(36).slice(2, 6);
const rows = o => Object.entries(o || {}).filter(([, v]) => v && typeof v === 'object' && v.txt && !v.del);
const fav = name => avEl({ name, col: COLS[parseInt(hash(name || '?'), 36) % COLS.length] }, 34);
function whoEl(v) { const n = mk('span', 'nm', v.by || '?'); if (v.c) n.append(' ', certEl()); if (v.st) n.append(' ', mk('span', 'stf', 'STAFF')); return n; }
function composer(ph, label, onSend, cool) {
  const w = mk('div', 'cmp'), t = mk('textarea'), n = mk('small', 'note', '0 / ' + MAXTXT), b = mk('button', 'btn', label), e = mk('small', 'ferr');
  t.maxLength = MAXTXT; t.rows = 4; t.placeholder = ph; t.oninput = () => { n.textContent = t.value.length + ' / ' + MAXTXT; };
  b.onclick = async () => {
    const v = t.value.trim(); e.textContent = '';
    if (v.length < 3) { e.textContent = 'Message trop court.'; return; }
    const wait = Math.ceil((lastSend + (cool || 15000) - Date.now()) / 1000); if (wait > 0) { e.textContent = 'Patientez ' + wait + ' s avant de renvoyer un message.'; return; }
    b.disabled = true;
    try { await onSend(v); lastSend = Date.now(); t.value = ''; n.textContent = '0 / ' + MAXTXT; } catch (x) { e.textContent = 'Envoi impossible. Vérifiez votre connexion.'; }
    b.disabled = false;
  };
  w.append(t, n, b, e); return w;
}
function delBtn(f) { const b = mk('button', 'mini', 'Supprimer'); b.onclick = async () => { if (b.dataset.ok) { b.disabled = true; try { await f(); } catch (e) {} } else { b.dataset.ok = 1; b.textContent = 'Confirmer ?'; setTimeout(() => { b.dataset.ok = ''; b.textContent = 'Supprimer'; }, 3000); } }; return b; }
function repEl(r, onDel) {
  const d = mk('div', 'rep'), t = mk('div', 'fpn'); t.append(whoEl(r), mk('small', '', fdate(r.ts)));
  const h = mk('div', 'fph'); h.append(r.st ? avEl({ name: 'S', col: '#2f8cff' }, 26) : fav(r.by), t); d.append(h, mk('p', 'fpt', r.txt));
  if (onDel) d.append(delBtn(onDel)); return d;
}
function staffHome() {
  curTab = 'h'; setBack(null); const box = $('infoBody'); box.className = 'staff'; box.replaceChildren(); box.scrollTop = 0;
  $('infoT').textContent = 'Contacter le staff'; $('infoC').textContent = 'Une question, un bug, une idée ? Dites-le nous.';
  const o = (t, d, f) => { const b = mk('button', 'btn ghost perk'); b.append(mk('b', '', t), mk('small', '', d)); b.onclick = f; return b; };
  box.append(
    o('Contacter le staff', 'Envoyez un message privé : seul le staff le lit et peut vous répondre.', staffMsg),
    o('Signaler un bug', 'Publiez le bug. Les autres joueurs et le staff peuvent aimer et répondre.', () => feed('bug')),
    o('Donner une idée d’amélioration', 'Proposez une idée. Les autres joueurs et le staff peuvent aimer et répondre.', () => feed('idea')));
  show('info');
}
async function staffMsg() {
  curTab = 'h'; setBack(staffHome); const box = $('infoBody'); box.className = 'staff'; box.replaceChildren(); box.scrollTop = 0;
  $('infoT').textContent = 'Message au staff'; $('infoC').textContent = 'Message privé : visible uniquement par le staff.';
  const list = mk('div', 'ul');
  const draw = async first => {
    if (first) list.replaceChildren(mk('small', '', 'Chargement…'));
    let o; try { o = await dget('staffmsg/' + ckey); } catch (e) { list.replaceChildren(mk('small', '', 'Impossible de charger vos messages.')); return; }
    const it = rows(o).sort((a, b) => a[0] < b[0] ? 1 : -1); list.replaceChildren();
    if (!it.length) { list.append(mk('small', '', 'Aucun message envoyé pour l’instant.')); return; }
    it.forEach(([id, v]) => {
      const c = mk('div', 'fp'), h = mk('div', 'fph'), t = mk('div', 'fpn'); t.append(mk('span', 'nm', 'Vous'), mk('small', '', fdate(v.ts) + (v.read ? ' · lu par le staff' : ' · envoyé')));
      h.append(avEl(cur, 34), t); c.append(h, mk('p', 'fpt', v.txt));
      rows(v.rp).sort((a, b) => a[0] < b[0] ? -1 : 1).forEach(([, r]) => c.append(repEl({ ...r, st: 1 })));
      list.appendChild(c);
    });
  };
  const cmp = composer('Écrivez votre message au staff…', 'Envoyer au staff', async v => {
    await dput('staffmsg/' + ckey + '/' + newId(), { by: cur.name, txt: v, ts: Date.now(), read: false }); await draw();
  });
  box.append(mk('p', 'note', 'Les réponses du staff apparaissent sous votre message.'), cmp, mk('h2', '', 'Mes messages'), list); show('info'); draw(true);
}
async function feed(type) {
  const bug = type === 'bug', box = $('infoBody'); curTab = 'h'; setBack(staffHome); box.className = 'staff'; box.replaceChildren(); box.scrollTop = 0;
  $('infoT').textContent = bug ? 'Signaler un bug' : 'Idées d’amélioration';
  $('infoC').textContent = bug ? 'Décrivez le bug : quand il arrive, ce que vous faisiez. Les autres peuvent aimer et répondre.' : 'Proposez une idée pour améliorer le jeu. Les autres peuvent aimer et répondre.';
  const list = mk('div', 'ul'), base = 'posts/' + type + '/';
  const draw = async first => {
    if (first) list.replaceChildren(mk('small', '', 'Chargement…'));
    let o; try { o = await dget('posts/' + type); } catch (e) { list.replaceChildren(mk('small', '', 'Impossible de charger les publications.')); return; }
    const lk = v => Object.keys(v.lk || {}).length, it = rows(o).sort((a, b) => fsort === 'top' ? lk(b[1]) - lk(a[1]) || (a[0] < b[0] ? 1 : -1) : (a[0] < b[0] ? 1 : -1));
    list.replaceChildren(); if (!it.length) { list.append(mk('small', '', bug ? 'Aucun bug signalé pour l’instant.' : 'Aucune idée pour l’instant. Lancez-vous !')); return; }
    it.forEach(([id, v]) => list.appendChild(postEl(base + id, v, draw)));
  };
  const cmp = composer(bug ? 'Décrivez le bug…' : 'Décrivez votre idée…', 'Publier', async v => {
    await dput(base + newId(), { by: cur.name, k: ckey, c: cur.cert ? 1 : 0, txt: v, ts: Date.now() }); await draw();
  });
  const sb = mk('button', 'mini', fsort === 'top' ? 'Tri : les plus aimés' : 'Tri : les plus récents'); sb.onclick = () => { fsort = fsort === 'top' ? 'new' : 'top'; sb.textContent = fsort === 'top' ? 'Tri : les plus aimés' : 'Tri : les plus récents'; draw(); };
  const rf = mk('button', 'mini', 'Actualiser'); rf.onclick = () => draw();
  const bar = mk('div', 'row'); bar.append(sb, rf); bar.style.marginTop = '0';
  box.append(cmp, mk('h2', '', bug ? 'Bugs signalés' : 'Idées proposées'), bar, list); show('info'); draw(true);
}
function postEl(path, v, redraw) {
  const c = mk('div', 'fp'), h = mk('div', 'fph'), t = mk('div', 'fpn'), mine = v.k === ckey;
  t.append(whoEl(v), mk('small', '', fdate(v.ts))); h.append(v.st ? avEl({ name: 'S', col: '#2f8cff' }, 34) : fav(v.by), t);
  if (v.status) h.append(mk('span', 'stt', v.status));
  c.append(h, mk('p', 'fpt', v.txt));
  const lks = Object.keys(v.lk || {}), me = lks.includes(ckey), act = mk('div', 'fpa');
  const bl = mk('button', 'mini' + (me ? ' on' : ''), (me ? '♥ ' : '♡ ') + lks.length + ' J’aime');
  bl.onclick = async () => { bl.disabled = true; try { if (me) await ddel(path + '/lk/' + ckey); else await dput(path + '/lk/' + ckey, 1); } catch (e) {} redraw(); };
  const reps = rows(v.rp).sort((a, b) => a[0] < b[0] ? -1 : 1), br = mk('button', 'mini', 'Répondre' + (reps.length ? ' (' + reps.length + ')' : ''));
  act.append(bl, br); if (lks.includes('staff')) act.append(mk('span', 'stf', 'Aimé par le staff'));
  if (mine) act.append(delBtn(async () => { await ddel(path); redraw(); }));
  c.appendChild(act);
  const rl = mk('div', 'reps'); reps.forEach(([id, r]) => rl.append(repEl(r, r.k === ckey && !r.st ? async () => { await ddel(path + '/rp/' + id); redraw(); } : null))); c.appendChild(rl);
  const box = composer('Votre réponse…', 'Répondre', async txt => {
    await dput(path + '/rp/' + newId(), { by: cur.name, k: ckey, c: cur.cert ? 1 : 0, txt, ts: Date.now() }); redraw();
  }, 5000);
  box.classList.add('hide'); br.onclick = () => box.classList.toggle('hide'); c.appendChild(box);
  return c;
}

/* ---------- Info et Ciel SMP ---------- */
function infoPage() {
  curTab = 'n'; const box = $('infoBody'); box.className = 'apropos'; box.replaceChildren();
  $('infoT').textContent = 'Info'; $('infoC').textContent = 'À propos du jeu et de son créateur';
  box.append(
    mk('p', '', 'Salut ! Je suis un jeune créateur de jeux. Créer des jeux, c’est ma passion : imaginer un univers, le programmer, le tester encore et encore, puis le partager avec vous.'),
    mk('p', '', 'Dernière nuit est l’un de mes projets. Je l’ai créé pour offrir des récompenses sur un serveur Minecraft qui s’appelle Ciel SMP : les meilleurs joueurs du classement gagnent des récompenses sur ce serveur.'),
    mk('p', '', 'Ouvrez la case Ciel SMP du menu pour voir le classement et la liste des récompenses. Bonne chance face aux zombies !'));
  show('info');
}
function cielPage() {
  curTab = 'c'; setBack(null); const box = $('infoBody'); box.className = 'ciel'; box.replaceChildren();
  $('infoT').textContent = 'Ciel SMP'; $('infoC').textContent = 'Classement des meilleurs joueurs et récompenses';
  const row = (lab, txt, col, tc) => { const c = mk('div', 'cx'), i = mk('i', 'md', lab), t = mk('div'); i.style.background = col; if (tc) i.style.color = tc; t.append(mk('b', '', txt)); c.append(i, t); return c; };
  box.append(mk('h2', '', 'Récompenses dans le Ciel SMP'),
    mk('p', 'note', 'Ces récompenses sont à gagner dans le Ciel SMP, le serveur Minecraft : argent et clés du serveur, pas l’argent de ce jeu.'),
    row('1', '1er : ' + CIEL[0][0], CIEL[0][1]), row('2', '2e : ' + CIEL[1][0], CIEL[1][1]), row('3', '3e : ' + CIEL[2][0], CIEL[2][1]),
    row('4+', 'Tous les autres : ' + CIEL_OTHER, '#2a3d5e', '#fff'));
  const lb = mk('div', 'lb'), net = mk('small', 'net'), ol = mk('ol'); lb.append(net, ol);
  box.append(mk('h2', '', 'Classement des meilleurs joueurs'), lb); show('info'); renderLB(ol, true);
}
/* ---------- Titres ---------- */
const sm = o => Object.values(o || {}).reduce((a, b) => a + b, 0);
const TS = {
  games: u => u.games || 0, kills: u => u.kills || 0, wk: u => sm(u.wk), pk: u => sm(u.pk), dist: u => u.dist || 0, tp: u => (u.tp || 0) / 60,
  bw: u => u.bw || 0, best: u => u.best || 0, shots: u => u.shots || 0, earned: u => u.earned || 0, bc: u => u.bc || 0,
  boss: u => Object.keys(TYPES).filter(k => TYPES[k].big).reduce((a, k) => a + ((u.zk || {})[k] || 0), 0), titan: u => (u.zk || {}).titan || 0,
  dz: u => (u.dz || []).length, dw: u => (u.dw || []).length, dp: u => (u.dp || []).length, os: u => (u.os || []).length,
  up: u => sm(u.wl) + sm(u.pl), vw: u => (u.vw || []).length, cert: u => u.cert ? 1 : 0
};
const ALL = { dz: () => Object.keys(TYPES).length, dw: () => Object.keys(WP).length, dp: () => Object.keys(PW).length, os: () => Object.keys(SK).length };
const pls = (n, a, b) => fmt(n) + ' ' + (n > 1 ? b : a);
const TD = {
  games: n => 'Terminer ' + pls(n, 'partie', 'parties'), kills: n => 'Tuer ' + pls(n, 'zombie', 'zombies'), wk: n => 'Ramasser ' + pls(n, 'arme', 'armes'),
  pk: n => 'Utiliser ' + pls(n, 'pouvoir', 'pouvoirs'), dist: n => 'Parcourir ' + (n >= 1000 ? fmt(n / 1000) + ' km' : n + ' m'), tp: n => 'Jouer ' + fmt(n) + ' minutes au total',
  bw: n => 'Atteindre la vague ' + n, best: n => 'Marquer ' + fmt(n) + ' points en une seule partie', shots: n => 'Tirer ' + fmt(n) + ' fois', earned: n => 'Gagner ' + fmt(n) + ' $ au total',
  boss: n => 'Abattre ' + pls(n, 'boss', 'boss'), titan: n => 'Abattre ' + pls(n, 'titan', 'titans'), bc: n => 'Atteindre un combo de ×' + n,
  dz: n => 'Découvrir ' + n + ' zombies', dw: n => 'Découvrir ' + n + ' armes', dp: n => 'Découvrir ' + n + ' pouvoirs', os: n => 'Posséder ' + n + ' skins',
  up: n => 'Cumuler ' + n + ' niveaux d’amélioration (armes et pouvoirs)', vw: n => 'Faire visiter votre profil par ' + pls(n, 'joueur', 'joueurs'), cert: () => 'Obtenir un compte certifié'
};
const TU = { dist: ' m', tp: ' min', earned: ' $' };
/* [id, nom, style, statistique, objectif, description (facultatif)] : du plus facile au plus difficile dans chaque série */
const TLIST = [
  ['recrue', 'Recrue', 'bronze', 'games', 1], ['premier', 'Premier sang', 'bronze', 'kills', 10], ['debrouille', 'Débrouillard', 'bronze', 'wk', 10],
  ['surv5', 'Rescapé', 'bronze', 'bw', 5], ['marcheur', 'Marcheur', 'bronze', 'dist', 1000], ['e1000', 'Économe', 'bronze', 'earned', 1000],
  ['chasseur', 'Chasseur', 'green', 'kills', 100], ['pilleur', 'Pilleur d’armes', 'green', 'wk', 100], ['surv10', 'Survivant', 'green', 'bw', 10],
  ['c10', 'En série', 'green', 'bc', 10], ['pop', 'Populaire', 'green', 'vw', 10], ['g1000', 'Gâchette facile', 'silver', 'shots', 1000],
  ['s1000', 'Bon début', 'silver', 'best', 1000], ['veteran', 'Vétéran', 'silver', 'games', 25], ['dandy', 'Dandy', 'silver', 'os', 5],
  ['exter', 'Exterminateur', 'blue', 'kills', 500], ['marathon', 'Marathonien', 'blue', 'dist', 10000], ['p10', 'Apprenti pouvoir', 'blue', 'pk', 10],
  ['s5000', 'Grand tueur', 'blue', 'best', 5000], ['forge', 'Forgeron', 'blue', 'up', 10], ['colosse', 'Briseur de colosses', 'red', 'boss', 1],
  ['g10000', 'Pluie de plomb', 'red', 'shots', 10000], ['arsenal', 'Arsenal complet', 'red', 'dw', 'all', 'Découvrir toutes les armes'],
  ['fleau', 'Fléau des morts', 'purple', 'kills', 2000], ['nomade', 'Nomade éternel', 'purple', 'dist', 50000], ['c30', 'Machine à tuer', 'purple', 'bc', 30],
  ['veilleur', 'Veilleur', 'shadow', 'tp', 60], ['insomnie', 'Insomniaque', 'shadow', 'tp', 600], ['titan', 'Tueur de titans', 'blood', 'titan', 1],
  ['p100', 'Maître des éléments', 'ice', 'pk', 100], ['pouvoirs', 'Tous les pouvoirs', 'ice', 'dp', 'all', 'Découvrir tous les pouvoirs'],
  ['bestiaire', 'Bestiaire complet', 'toxic', 'dz', 'all', 'Découvrir tous les zombies'], ['armurier', 'Maître armurier', 'gold', 'wk', 500],
  ['increvable', 'Increvable', 'gold', 'games', 100], ['e10000', 'Magnat', 'gold', 'earned', 10000], ['parfait', 'Arsenal parfait', 'gold', 'up', 60],
  ['surv20', 'Légende de la nuit', 'fire', 'bw', 20], ['geants', 'Fléau des géants', 'fire', 'boss', 25], ['c60', 'Inarrêtable', 'fire', 'bc', 60],
  ['s15000', 'Maître du carnage', 'royal', 'best', 15000], ['e50000', 'Roi de l’or', 'royal', 'earned', 50000], ['surv30', 'Immortel', 'royal', 'bw', 30], ['surv50', 'Roi de la nuit', 'royal', 'bw', 50], ['surv100', 'Dernier survivant', 'rainbow', 'bw', 100], ['boss10', 'Tueur de boss', 'purple', 'boss', 10],
  ['apoc', 'Apocalypse', 'rainbow', 'kills', 10000], ['garde', 'Garde-robe complète', 'rainbow', 'os', 'all', 'Posséder tous les skins'],
  ['cert', 'Compte certifié', 'cert', 'cert', 1]
].map(([id, name, k, st, n, d]) => ({ id, name, k, st, n, d }));
const TT = Object.fromEntries(TLIST.map(t => [t.id, t]));
const tn = t => t.n === 'all' ? ALL[t.st]() : t.n;
const tdesc = t => t.d || TD[t.st](tn(t));
const tiOf = u => (u && u.ti && (u.tu || []).includes(u.ti) && TT[u.ti]) ? u.ti : '';
function ttlEl(id, big) { const t = TT[id]; return t ? mk('span', 'ttl ' + t.k + (big ? ' lg' : ''), t.name) : null; }
function checkTitles(u) {
  u.tu = u.tu || []; const got = [];
  TLIST.forEach(t => { if (!u.tu.includes(t.id) && TS[t.st](u) >= tn(t)) { u.tu.push(t.id); got.push(t.id); } });
  return got;
}
function titlesPage(back) {
  const bk = back || null; curTab = 't'; setBack(bk);
  if (checkTitles(cur).length) putUser(ckey, cur).catch(() => {});
  const box = $('infoBody'), st = box.scrollTop; box.className = 'ul'; box.replaceChildren();
  $('infoT').textContent = 'Titres'; $('infoC').textContent = cur.tu.length + ' / ' + TLIST.length + ' débloqués · ' + (tiOf(cur) ? 'Équipé : ' + TT[cur.ti].name : 'Aucun titre équipé');
  box.append(mk('p', 'note', 'Au départ, vous n’avez aucun titre. Remplissez les objectifs pour les débloquer, puis équipez-en un : il s’affiche sous votre pseudo, dans votre profil et dans le classement.'));
  TLIST.forEach(t => {
    const own = cur.tu.includes(t.id), v = Math.floor(TS[t.st](cur)), n = tn(t), on = own && cur.ti === t.id;
    const r = mk('div', 'trow' + (own ? '' : ' lock') + (on ? ' on' : '')), x = mk('div', 'tx');
    x.append(mk('small', '', tdesc(t)));
    if (own) x.append(mk('small', 'okt', 'Débloqué'));
    else { const pb = mk('div', 'pbar'), bi = mk('i'); bi.style.width = Math.min(100, v / n * 100) + '%'; pb.appendChild(bi); x.append(pb, mk('small', '', 'Progression : ' + fmt(v) + ' / ' + fmt(n) + (TU[t.st] || ''))); }
    r.append(ttlEl(t.id, true), x);
    if (own) {
      const b = mk('button', 'mini', on ? 'Retirer' : 'Équiper');
      b.onclick = async () => { cur.ti = on ? '' : t.id; try { await putUser(ckey, cur); } catch (e) {} titlesPage(bk); };
      r.appendChild(b);
    }
    box.appendChild(r);
  });
  show('info'); box.scrollTop = st;
}
/* ---------- Skins et boutique ---------- */
function skinIcon(sk, size) {
  const c = document.createElement('canvas'); c.width = c.height = 96; const x = c.getContext('2d');
  x.translate(48, 48); x.rotate(-Math.PI / 2); x.scale(2.3, 2.3); skinArt(x, sk, false);
  if (size) c.style.width = c.style.height = size + 'px';
  return c;
}
const SHIRT = ['#ff7a2f', '#ff4d5e', '#5fd6a0', '#7fb8ff', '#b57cff', '#ffd24a', '#ff7ad9', '#e8f1ff', '#3b4a63', '#2a2a35'];
const HAIRC = ['#14101a', '#3b2a1a', '#8a5a2b', '#d9a066', '#ffd24a', '#ff7a2f', '#ff3fa0', '#7fe3ff', '#ffffff'];
const TONES = ['#f1d3b0', '#e0b48a', '#c68c5f', '#8d5a3b', '#5b3a26', '#79c283', '#b8c4d8'];
const HSN = ['Aucune', 'Courte', 'Longue', 'Crête', 'Hérissée'];
function skins() {
  const box = $('infoBody'), st = box.scrollTop; box.innerHTML = ''; box.className = 'skins';
  $('infoT').textContent = 'Skins'; $('infoC').textContent = cur.os.length + ' / ' + Object.keys(SK).length + ' débloqués · Argent : ' + cur.money + ' $';
  const pv = document.createElement('div'); pv.className = 'skp';
  const upd = () => { pv.replaceChildren(skinIcon(skinOf(cur), 110)); putUser(ckey, cur); };
  const row = (lab, arr, key) => {
    const l = document.createElement('small'); l.textContent = lab; const sw = document.createElement('div'); sw.className = 'sw';
    arr.forEach(c => { const b = document.createElement('button'); b.style.background = c; b.setAttribute('aria-label', lab + ' ' + c); b.onclick = () => { cur.sc[key] = c; upd(); }; sw.appendChild(b); });
    return [l, sw];
  };
  const hs = document.createElement('div'); hs.className = 'sw';
  HSN.forEach((n, i) => { const b = document.createElement('button'); b.className = 'mini'; b.textContent = n; b.onclick = () => { cur.sc.hs = i; upd(); }; hs.appendChild(b); });
  const lh = document.createElement('small'); lh.textContent = 'Coiffure';
  const rs = document.createElement('button'); rs.className = 'mini'; rs.textContent = 'Réinitialiser mes couleurs'; rs.onclick = () => { cur.sc = {}; upd(); };
  const cu = document.createElement('div'); cu.className = 'cust'; cu.append(...row('Maillot', SHIRT, 'shirt'), ...row('Cheveux', HAIRC, 'hair'), lh, hs, ...row('Tête (teint)', TONES, 'tone'), rs);
  const top = document.createElement('div'); top.className = 'skt'; pv.appendChild(skinIcon(skinOf(cur), 110)); top.append(pv, cu);
  const g = document.createElement('div'); g.className = 'grid2';
  for (const [id, s] of Object.entries(SK)) {
    const own = cur.os.includes(id), c = document.createElement('div'); c.className = 'cx' + (own ? '' : ' lock');
    const t = document.createElement('div'), b = document.createElement('b'), q = document.createElement('small');
    b.textContent = s.name; q.textContent = own ? (cur.sk === id ? 'Équipé' : 'Débloqué') : 'Verrouillé · ' + s.price + ' $ en boutique'; t.append(b, q);
    if (own && cur.sk !== id) { const e = document.createElement('button'); e.className = 'mini'; e.textContent = 'Équiper'; e.onclick = async () => { cur.sk = id; cur.sc = {}; await putUser(ckey, cur); skins(); }; t.appendChild(e); }
    const ic = skinIcon(skinOf(null, id, {})); if (!own) { const x = ic.getContext('2d'); x.globalCompositeOperation = 'source-atop'; x.fillStyle = '#2a3d5e'; x.fillRect(0, 0, 96, 96); }
    c.append(ic, t); g.appendChild(c);
  }
  box.append(top, g); show('info'); box.scrollTop = st;
}
function shop() {
  const box = $('infoBody'), st = box.scrollTop; box.innerHTML = ''; box.className = 'grid2';
  $('infoT').textContent = 'Boutique'; $('infoC').textContent = 'Votre argent : ' + cur.money + ' $ · il se gagne en tuant des zombies, en enchaînant les combos et en allant loin.';
  for (const [id, s] of Object.entries(SK)) {
    if (!s.price) continue;
    const own = cur.os.includes(id), c = document.createElement('div'); c.className = 'cx';
    const t = document.createElement('div'), b = document.createElement('b'), q = document.createElement('small'), e = document.createElement('button');
    b.textContent = s.name; q.textContent = own ? 'Acquis' : s.price + ' $'; e.className = 'mini';
    if (own) { e.textContent = 'Acquis'; e.disabled = true; } else if (cur.money < s.price) { e.textContent = 'Il manque ' + (s.price - cur.money) + ' $'; e.disabled = true; } else { e.textContent = 'Acheter'; e.onclick = async () => { if (cur.os.includes(id) || cur.money < s.price) return; cur.money -= s.price; cur.os.push(id); await putUser(ckey, cur); shop(); }; }
    t.append(b, q, e); c.append(skinIcon(skinOf(null, id, {})), t); box.appendChild(c);
  }
  show('info'); box.scrollTop = st;
}
document.querySelectorAll('[data-i]').forEach(b => b.onclick = () => info(b.dataset.i));
$('btnInfoBack').onclick = () => backFn ? backFn() : showMenu();
$('btnLogin').onclick = login; $('howBox').innerHTML = HOW; $('howBox').onclick = e => { const b = e.target.closest('#howMore'); if (!b) return; const h = $('howExtra').classList.toggle('hide'); b.textContent = h ? 'Afficher plus' : 'Afficher moins'; if (h) $('howBox').scrollTop = 0; }; $('tabL').onclick = () => setMode('login'); $('tabR').onclick = () => setMode('reg');
$('showp').onchange = e => $('pass').type = $('pass2').type = e.target.checked ? 'text' : 'password';
$('pass2').onkeydown = $('pass').onkeydown = $('pseudo').onkeydown = e => { if (e.key === 'Enter') login(); };
$('btnOut').onclick = () => { localStorage.removeItem('dn_sess'); cur = null; ckey = null; showMenu(); };
$('btnPlay').onclick = $('btnAgain').onclick = start;
$('btnMenu').onclick = showMenu;
$('btnQuit').onclick = () => { if (G.playing) { G.paused = false; end(); } else showMenu(); };
$('btnResume').onclick = () => setPause(false);
setInterval(() => { if (!$('menu').classList.contains('hide')) renderLB($('lb')); }, 8000);

/* ---------- Données du jeu ---------- */
const WORLD = 2600, TILE = 96;
const TYPES = {
  walk:  { name: 'Rôdeur', r: 14, hp: 3, sp: 58, pts: 1, c: '#79c283', dk: '#3f7a52', dmg: 10, desc: 'Lent et nombreux. 1 point.' },
  fast:  { name: 'Coureur', r: 11, hp: 2, sp: 125, pts: 2, c: '#e6d96b', dk: '#9a8f2c', dmg: 8, desc: 'Fragile mais très rapide. 2 points.' },
  bomb:  { name: 'Kamikaze', r: 14, hp: 4, sp: 95, pts: 3, c: '#ff9a3c', dk: '#a84a10', dmg: 30, desc: 'Explose au contact ou à sa mort, et blesse ses voisins. 3 points.' },
  spit:  { name: 'Cracheur', r: 15, hp: 5, sp: 50, pts: 4, c: '#7fe3d0', dk: '#2a8f86', dmg: 10, desc: 'Garde ses distances et crache de l’acide. 4 points.' },
  tank:  { name: 'Costaud', r: 23, hp: 14, sp: 40, pts: 5, c: '#a98be0', dk: '#5e3fa0', dmg: 20, desc: 'Beaucoup de vie. Lâche souvent une arme. 5 points.' },
  brute: { name: 'Blindé', r: 28, hp: 34, sp: 46, pts: 10, c: '#8a97ad', dk: '#4a5468', dmg: 25, desc: 'Très résistant, lâche souvent une arme rare. 10 points.' },
  boss:  { big: true, name: 'Colosse', r: 42, hp: 140, sp: 50, pts: 25, c: '#ff5a5a', dk: '#9c2230', dmg: 30, desc: 'Arrive toutes les 5 vagues. Arme rare garantie. 25 points.' },
  crawler: { name: 'Rampant', r: 9, hp: 1.5, sp: 150, pts: 2, c: '#c9a27a', dk: '#7a5a3a', dmg: 6, desc: 'Minuscule et très rapide, difficile à viser. 2 points.' },
  toxic: { name: 'Putréfié', r: 19, hp: 9, sp: 66, pts: 6, c: '#9bd24a', dk: '#4f7a1c', dmg: 16, desc: 'Gonflé et solide, frappe fort. 6 points.' },
  berserk: { name: 'Enragé', r: 18, hp: 10, sp: 115, pts: 8, c: '#ff6fa0', dk: '#a02050', dmg: 22, desc: 'Fonce droit sur vous. Très dangereux. 8 points.' },
  splitter: { name: 'Gluant', r: 17, hp: 6, sp: 70, pts: 5, c: '#7fc8a0', dk: '#2f7a58', dmg: 12, desc: 'Se divise en deux Rampants à sa mort. 5 points.' },
  leaper: { name: 'Sauteur', r: 13, hp: 4, sp: 80, pts: 4, c: '#e0a050', dk: '#8a5a20', dmg: 14, desc: 'Bondit sur vous par à-coups. 4 points.' },
  scream: { name: 'Hurleur', r: 16, hp: 7, sp: 60, pts: 6, c: '#d9a0e8', dk: '#7a3f8f', dmg: 10, desc: 'Son cri accélère les zombies proches. À abattre en priorité. 6 points.' },
  necro: { name: 'Nécromancien', r: 18, hp: 14, sp: 55, pts: 12, c: '#6a7fd8', dk: '#2a3a8a', dmg: 12, desc: 'Garde ses distances et invoque des Rôdeurs. 12 points.' },
  titan: { big: true, name: 'Titan', r: 52, hp: 260, sp: 42, pts: 60, c: '#d94a8a', dk: '#7a1a4a', dmg: 40, desc: 'Arrive toutes les 10 vagues. Lance des anneaux d’acide. Arme rare garantie. 60 points.' },
  ghoul: { name: 'Goule', r: 15, hp: 16, sp: 128, pts: 9, c: '#b8c97a', dk: '#5a6a2a', dmg: 18, desc: 'Rapide et résistante. Apparaît dès la vague 12. 9 points.' },
  archer: { name: 'Tireur', r: 14, hp: 8, sp: 55, pts: 10, c: '#e8b87a', dk: '#8a5a2a', dmg: 10, desc: 'Garde ses distances et tire des projectiles rapides. Dès la vague 14. 10 points.' },
  juggernaut: { name: 'Mastodonte', r: 34, hp: 70, sp: 40, pts: 18, c: '#7a8aa8', dk: '#3a4660', dmg: 34, desc: 'Un mur de muscles qui lâche souvent une arme. Dès la vague 15. 18 points.' },
  medic: { name: 'Soigneur', r: 16, hp: 12, sp: 56, pts: 14, c: '#a8e8d0', dk: '#2a8a6a', dmg: 8, desc: 'Soigne les zombies autour de lui. À abattre en priorité. Dès la vague 18. 14 points.' },
  phantom: { name: 'Spectre', r: 15, hp: 14, sp: 90, pts: 12, c: '#b0b8ff', dk: '#4a52b0', dmg: 18, desc: 'Se téléporte près de vous. Dès la vague 20. 12 points.' },
  warlord: { big: true, name: 'Seigneur de guerre', r: 46, hp: 220, sp: 58, pts: 90, c: '#d0703a', dk: '#7a2a10', dmg: 34, ab: ['summon', 'charge'], mn: 'walk', desc: 'Boss de la vague 15. Invoque des Rôdeurs et charge. Arme rare garantie. 90 points.' },
  plague: { big: true, name: 'Roi de la peste', r: 48, hp: 320, sp: 46, pts: 140, c: '#8ac03a', dk: '#3a5a10', dmg: 36, ab: ['ring', 'summon'], mn: 'toxic', desc: 'Boss de la vague 25. Anneaux d’acide et Putréfiés invoqués. 140 points.' },
  reaper: { big: true, name: 'Faucheur', r: 44, hp: 420, sp: 85, pts: 200, c: '#6a5a8a', dk: '#241a3a', dmg: 42, ab: ['charge', 'blink'], desc: 'Boss de la vague 35. Très rapide, charge et se téléporte. 200 points.' },
  hydra: { big: true, name: 'Hydre', r: 58, hp: 650, sp: 50, pts: 280, c: '#3ab08a', dk: '#0f5a44', dmg: 44, ab: ['ring', 'fan', 'summon'], mn: 'splitter', desc: 'Boss de la vague 45. Éventails et anneaux de projectiles, invoque des Gluants. 280 points.' },
  overlord: { big: true, name: 'Seigneur des morts', r: 54, hp: 900, sp: 52, pts: 380, c: '#5a6ad8', dk: '#1a2470', dmg: 46, ab: ['summon', 'ring', 'blink'], mn: 'berserk', desc: 'Boss de la vague 55. Invoque des Enragés, tire en anneau et se téléporte. 380 points.' },
  abyss: { big: true, name: 'Abomination', r: 64, hp: 1250, sp: 56, pts: 520, c: '#a03a8a', dk: '#4a0a3a', dmg: 52, ab: ['charge', 'fan', 'ring'], desc: 'Boss de la vague 65. Charge et tir de toutes parts. 520 points.' },
  doom: { big: true, name: 'Fléau', r: 60, hp: 1700, sp: 66, pts: 700, c: '#e04a3a', dk: '#6a0a10', dmg: 58, ab: ['summon', 'charge', 'fan', 'blink'], mn: 'ghoul', desc: 'Boss de la vague 75. Invoque des Goules, charge, tire et se téléporte. 700 points.' },
  dragon: { big: true, name: 'Bête ancienne', r: 68, hp: 2300, sp: 62, pts: 900, c: '#e0a030', dk: '#7a4a08', dmg: 64, ab: ['ring', 'fan', 'charge', 'summon'], mn: 'juggernaut', desc: 'Boss de la vague 85. Invoque des Mastodontes. 900 points.' },
  apoc: { big: true, name: 'Dernier des morts', r: 76, hp: 4000, sp: 60, pts: 2000, c: '#f0f0ff', dk: '#2a2a4a', dmg: 80, ab: ['summon', 'ring', 'fan', 'charge', 'blink'], mn: 'ghoul', desc: 'Boss final de la vague 100. Toutes les attaques à la fois. 2000 points.' }
};
const UB = { 15: 'warlord', 25: 'plague', 35: 'reaper', 45: 'hydra', 55: 'overlord', 65: 'abyss', 75: 'doom', 85: 'dragon', 100: 'apoc' };
const zcap = () => Math.min(150, 70 + Math.max(0, G.wave - 10) * 2);
const waveCount = w => { let n = 6 + w * 4.6; if (w > 8) n += (w - 8) * (w - 8) * .5; return Math.min(450, Math.round(n * G.df.sp)); };
function bossAI(z, d, dx, dy, dt) {
  const g = G, p = g.p, tm = z.tm, T = (k, v) => { tm[k] = (tm[k] ?? v * .6) - dt; if (tm[k] > 0) return false; tm[k] = v; return true; };
  for (const a of z.ab) {
    if (a === 'summon') { if (T('s', 7) && g.z.length < zcap()) { sfx('wave'); for (let k = 0; k < 3; k++) spawnZ(z.mn || 'walk', z.x + rnd(-50, 50), z.y + rnd(-50, 50)); } }
    else if (a === 'ring') { if (T('r', 3.6)) { const o = rnd(0, 6.283); for (let k = 0; k < 14; k++) { const an = o + k * .4488; g.eb.push({ x: z.x, y: z.y, vx: Math.cos(an) * 240, vy: Math.sin(an) * 240, l: 3.2, d: 12 }); } } }
    else if (a === 'fan') { if (T('f', 2.4) && d < 800) { const b = Math.atan2(dy, dx); for (let k = -2; k <= 2; k++) { const an = b + k * .2; g.eb.push({ x: z.x, y: z.y, vx: Math.cos(an) * 330, vy: Math.sin(an) * 330, l: 2.6, d: 14 }); } } }
    else if (a === 'charge') { if (T('c', 5) && d > 140 && d < 700) { z.kx += dx / d * 1500; z.ky += dy / d * 1500; } }
    else if (a === 'blink') { if (T('b', 6.5) && d > 220) { const an = rnd(0, 6.283); z.x = clamp(p.x + Math.cos(an) * 170, 30, WORLD - 30); z.y = clamp(p.y + Math.sin(an) * 170, 30, WORLD - 30); g.fx.push({ k: 'ring', x: z.x, y: z.y, t: .4, m: .4, r: 80, c: z.c }); } }
  }
}
const WP = {
  pistol:  { name: 'Pistolet', ab: 'PI', rate: .28, dmg: 1, n: 1, sp: .03, v: 780, life: .8, auto: false, pl: 0, ammo: 0, col: '#ffd27a', desc: 'Arme de départ. Un tir par clic, munitions infinies.' },
  smg:     { name: 'Mitraillette', ab: 'MI', rate: .09, dmg: .8, n: 1, sp: .1, v: 800, life: .8, auto: true, pl: 0, ammo: 140, col: '#ffb347', desc: 'Tir automatique rapide, peu précis.' },
  shotgun: { name: 'Fusil à pompe', ab: 'FP', rate: .75, dmg: 1, n: 6, sp: .38, v: 700, life: .45, auto: false, pl: 0, ammo: 28, col: '#ff7a2f', desc: 'Gerbe de 6 plombs à courte portée.' },
  rifle:   { name: 'Fusil d’assaut', ab: 'FA', rate: .14, dmg: 2, n: 1, sp: .04, v: 900, life: .9, auto: true, pl: 0, ammo: 100, col: '#5fd6a0', desc: 'Automatique, puissant et précis.' },
  sniper:  { name: 'Sniper', ab: 'SN', rate: .95, dmg: 9, n: 1, sp: 0, v: 1100, life: 1, auto: false, pl: 5, ammo: 16, col: '#7fb8ff', desc: 'Une balle perforante qui traverse jusqu’à 6 zombies.' },
  knife:   { name: 'Couteau', ab: 'CO', rate: .4, dmg: 1.6, n: 1, sp: 0, v: 520, life: .1, auto: false, pl: 2, ammo: 0, col: '#cfd6e2', desc: 'Corps à corps, sans munitions. Vous le sortez quand le reste est vide.' },
  revolver:{ name: 'Revolver', ab: 'RV', rate: .5, dmg: 2, n: 1, sp: .02, v: 820, life: .8, auto: false, pl: 0, ammo: 36, col: '#ffd24a', desc: 'Lent mais fiable : 2 de dégâts par balle.' },
  crossbow:{ name: 'Arbalète', ab: 'AR', rate: .7, dmg: 3, n: 1, sp: .02, v: 760, life: .9, auto: false, pl: 2, ammo: 24, col: '#d9a066', desc: 'Carreaux perforants, traversent 3 zombies.' },
  flame:   { name: 'Lance-flammes', ab: 'LF', rate: .05, dmg: .5, n: 1, sp: .5, v: 330, life: .35, auto: true, pl: 3, ammo: 260, col: '#ff8a3a', desc: 'Très courte portée, brûle tout ce qui approche.' },
  plasma:  { name: 'Fusil à plasma', ab: 'PL', rate: .22, dmg: 4, n: 1, sp: .05, v: 950, life: .9, auto: true, pl: 3, ammo: 70, col: '#b57cff', desc: 'Automatique, puissant, perforant.' },
  railgun: { name: 'Railgun', ab: 'RG', rate: 1.2, dmg: 14, n: 1, sp: 0, v: 1400, life: 1, auto: false, pl: 10, ammo: 10, col: '#7fffe0', desc: 'Un rayon qui transperce jusqu’à 11 zombies.' },
  mini:    { name: 'Minigun', ab: 'MG', rate: .045, dmg: .7, n: 1, sp: .15, v: 850, life: .8, auto: true, pl: 1, ammo: 320, col: '#ff4d5e', desc: 'Cadence folle. Les balles traversent 2 zombies.' }
};
Object.assign(WP.pistol, { ammo: 60, desc: 'Arme de départ. Réserve de munitions propre ; quand elle est vide, une autre arme ou le couteau.' });
Object.assign(WP, {
  dual:     { name: 'Pistolets jumeaux', ab: 'PJ', rate: .15, dmg: .9, n: 2, sp: .12, v: 800, life: .8, auto: true, pl: 0, ammo: 150, col: '#ffe08a', desc: 'Deux pistolets automatiques : double tir, cadence rapide.' },
  launcher: { name: 'Lance-grenades', ab: 'LG', rate: .9, dmg: 2, n: 1, sp: .02, v: 520, life: .9, auto: false, pl: 0, ammo: 14, col: '#ff9a3c', ex: { r: 90, d: 7 }, desc: 'Grenades explosives : dégâts de zone.' },
  autoshot: { name: 'Fusil à pompe auto', ab: 'FPA', rate: .32, dmg: 1.1, n: 5, sp: .45, v: 700, life: .45, auto: true, pl: 0, ammo: 60, col: '#ff6a3a', desc: 'Pompe automatique : gerbe dévastatrice en continu.' }
});
Object.assign(WP, {
  magnum:  { name: 'Magnum', ab: 'MA', rate: .6, dmg: 5, n: 1, sp: .01, v: 900, life: .9, auto: false, pl: 1, ammo: 24, col: '#ffcf5a', desc: 'Gros calibre : 5 de dégâts par balle, traverse 2 zombies.' },
  duo:     { name: 'Fusil double canon', ab: 'DC', rate: 1, dmg: 1.5, n: 10, sp: .6, v: 700, life: .4, auto: false, pl: 0, ammo: 20, col: '#ff8f4a', desc: 'Double décharge de 10 plombs : dévastateur de près.' },
  lmg:     { name: 'Mitrailleuse lourde', ab: 'ML', rate: .075, dmg: 1.5, n: 1, sp: .08, v: 900, life: .9, auto: true, pl: 1, ammo: 220, col: '#c9d65a', desc: 'Cadence élevée, balles lourdes qui traversent 2 zombies.' },
  rocket:  { name: 'Lance-roquettes', ab: 'LR', rate: 1.3, dmg: 4, n: 1, sp: .01, v: 600, life: 1.1, auto: false, pl: 0, ammo: 8, col: '#ff5a3a', ex: { r: 150, d: 16 }, desc: 'Roquette à grosse explosion : ravage les groupes.' },
  laser:   { name: 'Fusil laser', ab: 'FL', rate: .07, dmg: 1.6, n: 1, sp: .02, v: 1300, life: .7, auto: true, pl: 4, ammo: 300, col: '#ff6ad5', desc: 'Faisceau très rapide qui perfore jusqu’à 5 zombies.' },
  gauss:   { name: 'Canon Gauss', ab: 'GA', rate: .8, dmg: 24, n: 1, sp: 0, v: 1500, life: 1, auto: false, pl: 14, ammo: 8, col: '#9bf0ff', desc: 'Un tir électromagnétique qui transperce jusqu’à 15 zombies.' },
  disint:  { name: 'Désintégrateur', ab: 'DE', rate: .35, dmg: 8, n: 1, sp: .03, v: 1000, life: .9, auto: true, pl: 6, ammo: 60, col: '#c8ff4a', ex: { r: 70, d: 6 }, desc: 'L’arme ultime : tir automatique perforant avec petite explosion.' }
});
/* Armes débloquées dans les vagues avancées : numéro = première vague où elles peuvent tomber */
Object.entries({ revolver: 3, smg: 4, dual: 5, shotgun: 6, crossbow: 8, rifle: 9, flame: 11, sniper: 12, magnum: 13, launcher: 14, duo: 15, plasma: 17, mini: 18, lmg: 20, autoshot: 22, rocket: 24, railgun: 26, laser: 29, gauss: 32, disint: 36 }).forEach(([k, v]) => WP[k].tier = v);
const BONUS = { heal: { s: '+', c: '#5fd6a0', n: 'Soin' }, ammo: { s: 'MU', c: '#ffd27a', n: 'Munitions' }, freeze: { s: '*', c: '#9be7ff', n: 'Gel' }, rage: { s: '!', c: '#ff8a3a', n: 'Furie' }, shield: { s: '◈', c: '#7fb8ff', n: 'Bouclier' }, speed: { s: '»', c: '#ffd24a', n: 'Vitesse' }, x2: { s: '×2', c: '#ff7ad9', n: 'Points ×2' }, nuke: { s: '✸', c: '#ff4d5e', n: 'Bombe' }, magnet: { s: 'U', c: '#c0b8ff', n: 'Aimant' } };
/* ---------- v5 : pouvoirs, skins, argent, sang ---------- */
const LASER = 820;
const PW = {
  laser:  { name: 'Lasers', col: '#ff4d5e', dur: 5, desc: 'Trois rayons qui transpercent tous les zombies pendant 5 s.' },
  nova:   { name: 'Onde de choc', col: '#7fb8ff', dur: 0, desc: 'Un souffle qui blesse et repousse tous les zombies proches.' },
  blades: { name: 'Lames tournantes', col: '#ffd24a', dur: 8, desc: 'Quatre lames tournent autour de vous pendant 8 s.' },
  strike: { name: 'Frappe aérienne', col: '#ff9a3c', dur: 1.8, desc: 'Une pluie d’explosions s’abat sur les zombies.' },
  storm:  { name: 'Tempête de balles', col: '#5fd6a0', dur: 3.5, desc: 'Des balles partent dans toutes les directions pendant 3,5 s.' }
};
Object.assign(PW, {
  regen:  { name: 'Soin de zone', col: '#5fd6a0', dur: 6, desc: 'Vous régénérez rapidement pendant 6 s.' },
  chrono: { name: 'Chrono', col: '#9be7ff', dur: 5, desc: 'Les zombies sont fortement ralentis pendant 5 s.' }
});
Object.assign(PW, {
  shield:  { name: 'Barrière', col: '#7fb8ff', dur: 6, desc: 'Vous êtes invulnérable pendant 6 s.' },
  fury:    { name: 'Furie', col: '#ff8a3a', dur: 7, desc: 'Tir deux fois plus rapide et déplacement accéléré pendant 7 s.' },
  inferno: { name: 'Anneau de feu', col: '#ff6a3a', dur: 6, desc: 'Un cercle de flammes brûle tous les zombies autour de vous pendant 6 s.' },
  thunder: { name: 'Foudre', col: '#ffe27a', dur: 0, desc: 'La foudre frappe les 8 zombies les plus proches.' },
  drain:   { name: 'Siphon', col: '#b57cff', dur: 5, desc: 'Aspire la vie des zombies proches pendant 5 s et vous soigne.' }
});
Object.entries({ laser: 3, nova: 5, blades: 3, strike: 4, storm: 3, regen: 4, chrono: 3, shield: 3, fury: 3, inferno: 3, thunder: 4, drain: 3 }).forEach(([k, v]) => PW[k].n = v);
const SK = {
  surv:   { name: 'Survivant', price: 0, shirt: '#ff7a2f', hair: '#2a3144', tone: '#f1d3b0', hs: 1, acc: [] },
  medic:  { name: 'Infirmier', price: 0, shirt: '#e8f1ff', hair: '#3b2a1a', tone: '#e0b48a', hs: 1, acc: ['cross'], ac: '#ff4d5e' },
  ranger: { name: 'Éclaireur', price: 0, shirt: '#3f8a5a', hair: '#8a5a2b', tone: '#f1d3b0', hs: 2, acc: ['band'], ac: '#ff4d5e' },
  punk:   { name: 'Punk', price: 350, shirt: '#2a2a35', hair: '#ff3fa0', tone: '#f1d3b0', hs: 3, acc: [] },
  cowboy: { name: 'Cow-boy', price: 450, shirt: '#c8873a', hair: '#3b2a1a', tone: '#e0b48a', hs: 1, acc: ['hat'], ac: '#8a5a2b' },
  pirate: { name: 'Pirate', price: 550, shirt: '#3b4a63', hair: '#14101a', tone: '#c68c5f', hs: 1, acc: ['bandana', 'patch'], ac: '#ff4d5e' },
  soldat: { name: 'Soldat', price: 650, shirt: '#5b6b3a', hair: '#3b2a1a', tone: '#e0b48a', hs: 0, acc: ['helmet'], ac: '#4a5a2a' },
  ninja:  { name: 'Ninja', price: 750, shirt: '#1b1b22', hair: '#1b1b22', tone: '#1b1b22', hs: 0, acc: ['slit', 'band'], ac: '#ff4d5e' },
  clown:  { name: 'Clown', price: 850, shirt: '#ff7ad9', hair: '#5fd6a0', tone: '#fff0e0', hs: 4, acc: ['nose'], ac: '#ff4d5e' },
  glace:  { name: 'Givré', price: 1000, shirt: '#7fe3ff', hair: '#ffffff', tone: '#cfeaff', hs: 2, acc: [] },
  zombie: { name: 'Mort-vivant', price: 1100, shirt: '#5a6a4a', hair: '#3f7a52', tone: '#79c283', hs: 4, acc: [], ey: '#ff3b3b' },
  vampire:{ name: 'Vampire', price: 1300, shirt: '#2a1030', hair: '#14101a', tone: '#ece4ef', hs: 1, acc: ['cape'], ac: '#8a1030', ey: '#d61f2c' },
  robot:  { name: 'Robot', price: 1600, shirt: '#8a97ad', hair: '#8a97ad', tone: '#b8c4d8', hs: 0, acc: ['antenna', 'visor'], ac: '#5fe6ff' },
  astro:  { name: 'Astronaute', price: 2000, shirt: '#f2f5fa', hair: '#3b2a1a', tone: '#f1d3b0', hs: 1, acc: ['dome'], ac: '#9be7ff' },
  or:     { name: 'Roi doré', price: 2800, shirt: '#ffd24a', hair: '#ffb300', tone: '#ffe27a', hs: 1, acc: ['crown'], ac: '#ffb300' }
};
const FREE = ['surv', 'medic', 'ranger'];
function norm(u) {
  u.dw = u.dw || ['pistol']; if (!u.dw.includes('knife')) u.dw.push('knife'); u.dz = u.dz || []; u.dp = u.dp || [];
  u.os = [...new Set([...(u.os || []), ...FREE])]; u.sc = u.sc || {}; if (!SK[u.sk] || !u.os.includes(u.sk)) u.sk = 'surv';
  u.money = u.money || 0; u.pk = u.pk || {}; u.wl = u.wl || {}; u.vw = u.vw || []; u.pl = u.pl || {}; u.tu = u.tu || []; if (!u.tu.includes(u.ti)) u.ti = ''; return u;
}
function skinOf(u, id, ov) {
  const b = SK[id || (u && u.sk) || 'surv'] || SK.surv, o = ov || (u && u.sc) || {};
  return { ...b, shirt: o.shirt || b.shirt, hair: o.hair || b.hair, tone: o.tone || b.tone, hs: o.hs ?? b.hs };
}
function skinArt(x, s, hit) {
  const A = s.acc || [], ac = s.ac || '#fff';
  if (A.includes('cape')) { x.fillStyle = ac; x.beginPath(); x.ellipse(-7, 0, 12, 19, 0, 0, 7); x.fill(); }
  x.fillStyle = hit ? '#ff4d5e' : s.shirt; x.beginPath(); x.ellipse(0, 0, 11, 17, 0, 0, 7); x.fill();
  if (A.includes('cross')) { x.fillStyle = ac; x.fillRect(-7.5, -1.6, 7, 3.2); x.fillRect(-5.6, -3.5, 3.2, 7); }
  x.fillStyle = s.tone; x.beginPath(); x.arc(2, 0, 9, 0, 7); x.fill();
  if (A.includes('slit')) { x.fillStyle = '#f1d3b0'; x.fillRect(5, -4.6, 3.6, 9.2); }
  if (!A.includes('helmet')) { x.fillStyle = s.ey || '#1b1b22'; x.beginPath(); x.arc(6.8, -3.4, 1.4, 0, 7); x.arc(6.8, 3.4, 1.4, 0, 7); x.fill(); }
  x.fillStyle = s.hair;
  if (s.hs === 1) { x.beginPath(); x.arc(-1, 0, 7.2, 0, 7); x.fill(); }
  else if (s.hs === 2) { x.beginPath(); x.arc(-1, 0, 7.6, 0, 7); x.fill(); x.beginPath(); x.ellipse(-9, 0, 8, 7, 0, 0, 7); x.fill(); }
  else if (s.hs === 3) { x.beginPath(); x.roundRect(-8, -2.3, 17, 4.6, 2.3); x.fill(); }
  else if (s.hs === 4) { x.beginPath(); x.arc(0, 0, 6, 0, 7); x.fill(); for (let i = 0; i < 8; i++) { const a = i * .785; x.beginPath(); x.moveTo(Math.cos(a - .28) * 6, Math.sin(a - .28) * 6); x.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); x.lineTo(Math.cos(a + .28) * 6, Math.sin(a + .28) * 6); x.fill(); } }
  A.forEach(a => {
    x.fillStyle = ac; x.strokeStyle = ac;
    if (a === 'helmet') { x.beginPath(); x.arc(1, 0, 10, 0, 7); x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 2; x.stroke(); x.fillStyle = 'rgba(255,255,255,.2)'; x.beginPath(); x.arc(-1, -3, 4, 0, 7); x.fill(); }
    else if (a === 'band') { x.lineWidth = 3; x.beginPath(); x.arc(2, 0, 7.6, 0, 7); x.stroke(); }
    else if (a === 'bandana') { x.beginPath(); x.arc(-1, 0, 7.8, 0, 7); x.fill(); x.beginPath(); x.moveTo(-6, -2); x.lineTo(-14, -6); x.lineTo(-12, 0); x.lineTo(-14, 6); x.lineTo(-6, 2); x.closePath(); x.fill(); }
    else if (a === 'hat') { x.beginPath(); x.ellipse(1, 0, 14, 12.5, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(0,0,0,.25)'; x.beginPath(); x.arc(1, 0, 7, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(0, -2, 3.5, 0, 7); x.fill(); }
    else if (a === 'patch') { x.fillStyle = '#111'; x.beginPath(); x.arc(7, -4, 2.8, 0, 7); x.fill(); x.strokeStyle = '#111'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(8, -5); x.lineTo(-4, 4); x.stroke(); }
    else if (a === 'visor') { x.beginPath(); x.roundRect(4.5, -6, 4.8, 12, 2); x.fill(); }
    else if (a === 'antenna') { x.strokeStyle = '#5a6479'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(0, 0); x.lineTo(-6, 0); x.stroke(); x.fillStyle = '#ff4d5e'; x.beginPath(); x.arc(-6.5, 0, 2.3, 0, 7); x.fill(); }
    else if (a === 'dome') { x.fillStyle = 'rgba(155,231,255,.3)'; x.lineWidth = 2.5; x.strokeStyle = '#e6eef8'; x.beginPath(); x.arc(1, 0, 11.8, 0, 7); x.fill(); x.stroke(); }
    else if (a === 'crown') { for (let i = 0; i < 5; i++) { const q = i * 1.2566; x.beginPath(); x.moveTo(1 + Math.cos(q - .3) * 7, Math.sin(q - .3) * 7); x.lineTo(1 + Math.cos(q) * 12.5, Math.sin(q) * 12.5); x.lineTo(1 + Math.cos(q + .3) * 7, Math.sin(q + .3) * 7); x.fill(); } }
    else if (a === 'nose') { x.beginPath(); x.arc(10.8, 0, 3.2, 0, 7); x.fill(); }
  });
}
function headArt(x, id, o) {
  const c = o.c, dk = o.dk, s = { boss: .8, titan: .78, brute: 1.02, tank: 1.02, crawler: .8, fast: .88 }[id] || (o.big ? .76 : .94), rx = id === 'tank' ? 35 : 31;
  const hp = () => { x.beginPath(); x.ellipse(0, 0, rx, 36, 0, 0, 7); };
  x.save(); x.scale(s, s); x.lineJoin = 'round'; x.lineWidth = 3; x.strokeStyle = dk;
  if (o.big) { x.fillStyle = '#2a1018'; [-1, 1].forEach(k => { x.beginPath(); x.moveTo(k * 16, -28); x.lineTo(k * 38, -62); x.lineTo(k * 32, -16); x.closePath(); x.fill(); x.stroke(); }); }
  x.fillStyle = c; [-1, 1].forEach(k => { x.beginPath(); x.ellipse(k * (rx + 1), 2, 7, 11, 0, 0, 7); x.fill(); x.stroke(); });
  hp(); x.fill(); x.stroke();
  if (id === 'walk' || id === 'toxic') { x.globalAlpha = .45; x.fillStyle = dk; x.beginPath(); x.arc(-17, -20, 7, 0, 7); x.arc(15, 18, 6, 0, 7); x.arc(-8, 26, 4, 0, 7); x.fill(); x.globalAlpha = 1; }
  if (id === 'toxic') { x.fillStyle = '#d7f58a'; for (const [bx, by, br] of [[-18, -12, 7], [18, -22, 5], [22, 6, 6]]) { x.beginPath(); x.arc(bx, by, br, 0, 7); x.fill(); x.stroke(); } }
  if (id === 'fast' || id === 'bomb') { x.save(); hp(); x.clip(); x.fillStyle = id === 'fast' ? '#c33' : '#d33'; x.fillRect(-40, -28, 80, 10); x.restore(); }
  if (id === 'bomb') { x.fillStyle = '#d33'; for (const k of [-1, 1]) { x.beginPath(); x.roundRect(k * 10 - 5, -48, 10, 24, 3); x.fill(); x.stroke(); } x.strokeStyle = '#ffd24a'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(0, -48); x.quadraticCurveTo(2, -56, 9, -56); x.stroke(); x.fillStyle = '#ffb347'; x.beginPath(); x.arc(10, -56, 3, 0, 7); x.fill(); x.strokeStyle = dk; x.lineWidth = 3; }
  if (id === 'brute') { x.save(); hp(); x.clip(); x.fillStyle = '#5a6479'; x.fillRect(-40, -42, 80, 38); x.fillStyle = '#121a2b'; x.fillRect(-28, -10, 56, 6); x.restore(); hp(); x.stroke(); }
  if (id === 'crawler') { for (let i = -2; i <= 2; i++) { x.beginPath(); x.moveTo(i * 8, -34); x.lineTo(i * 11, -48); x.stroke(); } }
  if (id === 'splitter') { x.beginPath(); x.moveTo(0, -36); x.lineTo(-3, -10); x.lineTo(3, 10); x.lineTo(0, 36); x.stroke(); x.fillStyle = c; x.beginPath(); x.arc(25, -28, 10, 0, 7); x.fill(); x.stroke(); }
  const er = id === 'crawler' ? 8.5 : id === 'tank' ? 5.5 : 7, ey = id === 'brute' ? 2 : -6;
  [-1, 1].forEach(k => { x.fillStyle = id === 'boss' ? '#ffd24a' : '#eef0d8'; x.beginPath(); x.arc(k * 13, ey, er, 0, 7); x.fill(); x.stroke(); x.fillStyle = id === 'berserk' ? '#ff1030' : '#ff3b3b'; x.beginPath(); x.arc(k * 13 + k * (id === 'crawler' ? 1.5 : 0), ey, er * (id === 'berserk' ? .6 : .45), 0, 7); x.fill(); });
  if (id === 'berserk' || id === 'tank' || o.big) { x.strokeStyle = '#220010'; x.lineWidth = 5; x.beginPath(); x.moveTo(-24, -20); x.lineTo(-6, -11); x.moveTo(24, -20); x.lineTo(6, -11); x.stroke(); x.strokeStyle = dk; x.lineWidth = 3; }
  if (id === 'berserk') { x.strokeStyle = '#220010'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(12, 6); x.lineTo(26, 18); x.moveTo(26, 6); x.lineTo(12, 18); x.stroke(); x.strokeStyle = dk; x.lineWidth = 3; }
  x.fillStyle = dk; x.beginPath(); x.arc(-3, 7, 2, 0, 7); x.arc(3, 7, 2, 0, 7); x.fill();
  const my = 21;
  if (id === 'spit') { x.fillStyle = '#bfffe9'; x.beginPath(); x.ellipse(0, my, 12, 10, 0, 0, 7); x.fill(); x.stroke(); }
  else {
    x.fillStyle = '#26121a'; x.beginPath(); x.ellipse(0, my, 15, 8, 0, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#eef0d8';
    for (let i = -2; i <= 2; i++) x.fillRect(i * 5.4 - 2, my - 7.5, 4, 5);
    if (o.big || id === 'berserk') for (const k of [-1, 1]) { x.beginPath(); x.moveTo(k * 9, my - 2); x.lineTo(k * 12, my + 9); x.lineTo(k * 5, my - 1); x.fill(); }
  }
  if (id === 'toxic') { x.fillStyle = '#b7f06a'; x.beginPath(); x.moveTo(5, my + 6); x.quadraticCurveTo(9, my + 18, 13, my + 6); x.closePath(); x.fill(); }
  x.restore();
}
function pArt(x, id, c) {
  x.strokeStyle = c; x.fillStyle = c; x.lineWidth = 2.5; x.lineCap = 'round';
  if (id === 'laser') { for (const a of [-.35, 0, .35]) { x.beginPath(); x.moveTo(-10, 0); x.lineTo(Math.cos(a) * 12, Math.sin(a) * 12); x.stroke(); } x.beginPath(); x.arc(-10, 0, 3, 0, 7); x.fill(); }
  else if (id === 'nova') { x.beginPath(); x.arc(0, 0, 4, 0, 7); x.fill(); x.beginPath(); x.arc(0, 0, 9, 0, 7); x.stroke(); x.globalAlpha = .55; x.beginPath(); x.arc(0, 0, 13, 0, 7); x.stroke(); x.globalAlpha = 1; }
  else if (id === 'blades') { for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(5, -2); x.lineTo(13, 0); x.lineTo(5, 2); x.closePath(); x.fill(); x.rotate(1.5708); } x.beginPath(); x.arc(0, 0, 3, 0, 7); x.stroke(); }
  else if (id === 'strike') { x.beginPath(); x.arc(0, 5, 6, 0, 7); x.fill(); for (const k of [-8, 0, 8]) { x.beginPath(); x.moveTo(k, -13); x.lineTo(k, -7); x.stroke(); } }
  else if (id === 'regen') { x.fillRect(-3, -10, 6, 20); x.fillRect(-10, -3, 20, 6); x.globalAlpha = .5; x.beginPath(); x.arc(0, 0, 13, 0, 7); x.stroke(); x.globalAlpha = 1; }
  else if (id === 'chrono') { x.beginPath(); x.arc(0, 0, 11, 0, 7); x.stroke(); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -7); x.moveTo(0, 0); x.lineTo(5, 3); x.stroke(); }
  else if (id === 'shield') { x.beginPath(); x.moveTo(0, -12); x.lineTo(10, -6); x.lineTo(8, 6); x.lineTo(0, 13); x.lineTo(-8, 6); x.lineTo(-10, -6); x.closePath(); x.stroke(); x.globalAlpha = .35; x.fill(); x.globalAlpha = 1; }
  else if (id === 'fury') { for (const k of [-7, 1]) { x.beginPath(); x.moveTo(k, -9); x.lineTo(k + 8, 0); x.lineTo(k, 9); x.stroke(); } }
  else if (id === 'inferno') { x.beginPath(); x.arc(0, 0, 10, 0, 7); x.stroke(); for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(Math.cos(i * 1.047) * 10, Math.sin(i * 1.047) * 10, 3, 0, 7); x.fill(); } }
  else if (id === 'thunder') { x.beginPath(); x.moveTo(3, -13); x.lineTo(-6, 2); x.lineTo(0, 2); x.lineTo(-3, 13); x.lineTo(7, -4); x.lineTo(1, -4); x.closePath(); x.fill(); }
  else if (id === 'drain') { x.beginPath(); x.arc(0, 0, 3, 0, 7); x.fill(); for (let i = 0; i < 4; i++) { x.beginPath(); x.moveTo(13, 0); x.lineTo(6, 0); x.moveTo(8, -3); x.lineTo(6, 0); x.lineTo(8, 3); x.stroke(); x.rotate(1.5708); } }
  else { for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(5, 0); x.lineTo(12, 0); x.stroke(); x.rotate(.785); } }
}

/* ---------- Sang ---------- */
const GC = ['#b3121f', '#d61f2c', '#8e0e19', '#e0323d'];
function gore(x, y, ang, n, sp) {
  if (G.pt.length > 650) return;
  for (let i = 0; i < n; i++) {
    const a = ang + rnd(-.5, .5), v = rnd(70, sp || 340);
    G.pt.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: rnd(.35, .9), m: .9, c: pick(GC), s: rnd(2, 5.5), g: 1 });
  }
}
function splat(x, y, r) {
  if (G.sp.length > 160) G.sp.shift();
  G.sp.push({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), r: Math.max(2, r * rnd(.35, .8)), l: 16, m: 16, c: pick(GC) });
}
function drawSplats(cx, cy) {
  G.sp.forEach(s => { const sx = s.x - cx, sy = s.y - cy; if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) return; ctx.globalAlpha = Math.min(.6, s.l / s.m * .9); ctx.fillStyle = s.c; ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * .75, s.x, 0, 7); ctx.fill(); });
  ctx.globalAlpha = 1;
}

/* ---------- Argent ---------- */
/* L'argent est gagné EN DIRECT : zombies tués, combos, distance et vagues. Il s'affiche dans le HUD
   et est enregistré toutes les 8 s (et à la fin de la partie). */
function gainCash(n, k) { const g = G, v = Math.round(n * g.df.cash); if (v <= 0) return 0; g.cash += v; g[k] += v; return v; }
function cashParts() { const g = G; return { k: g.cz, c: g.cc, d: g.cd, w: g.cw, total: g.cash }; }
async function saveCash() {
  const g = G, d = g.cash - g.cs; if (d <= 0 || g.saving || !ckey) return; g.saving = true;
  try {
    const u = (await getUser(ckey)) || cur, m = (u.money || 0) + d, e = (u.earned || 0) + d;
    await patchUser(ckey, { money: m, earned: e }); g.cs += d; cur.money = m; cur.earned = e;
  } catch (e) { /* réessayé au prochain passage */ } finally { g.saving = false; }
}
addEventListener('visibilitychange', () => { if (document.hidden && G.playing && !G.over) saveCash(); });

/* ---------- Améliorations de partie ---------- */
const PERKS = [
  { id: 'dm', n: 'Balles lourdes', d: '+6 % de dégâts', mx: 12 },
  { id: 'rt', n: 'Gâchette facile', d: 'Tir 4 % plus rapide', mx: 10 },
  { id: 'sp', n: 'Jambes de feu', d: '+4 % de vitesse de déplacement', mx: 10 },
  { id: 'hp', n: 'Constitution', d: '+10 PV maximum et +10 PV', mx: 10 },
  { id: 'rg', n: 'Régénération', d: '+0,3 PV par seconde', mx: 10 },
  { id: 'am', n: 'Sac à munitions', d: '+10 % de munitions maximum par arme et recharge de 20 % de chaque arme', mx: 8 },
  { id: 'dh', n: 'Esquive vive', d: 'L’esquive recharge 5 % plus vite', mx: 8 },
  { id: 'lt', n: 'Pilleur', d: '+10 % de bonus lâchés par les zombies', mx: 8 },
  { id: 'pl', n: 'Perforation', d: 'Les balles traversent 1 zombie de plus', mx: 2 },
  { id: 'cr', n: 'Coup critique', d: '+4 % de chance de dégâts doublés', mx: 8 },
  { id: 'ar', n: 'Armure', d: '3 % de dégâts reçus en moins', mx: 8 },
  { id: 'vm', n: 'Vampirisme', d: '+0,25 PV par zombie abattu', mx: 8 },
  { id: 'pt', n: 'Chasseur de primes', d: '+5 % de points', mx: 8 },
  { id: 'bo', n: 'Bonus durables', d: '+10 % de durée des bonus', mx: 6 }
];
function perkChoose() {
  const g = G, o = PERKS.filter(k => g.pk[k.id] < k.mx).sort(() => Math.random() - .5).slice(0, 3); if (!o.length) return;
  g.paused = true; g.perk = true; down = false; for (const kk in K) K[kk] = 0;
  const box = $('perkL'); box.replaceChildren(); $('perkS').textContent = 'Vague ' + (g.wave - 1) + ' terminée · petite amélioration valable pour cette partie';
  o.forEach(k => {
    const b = mk('button', 'btn ghost perk'), lv = g.pk[k.id];
    b.append(mk('b', '', k.n + (lv ? ' (niveau ' + (lv + 1) + ')' : '')), mk('small', '', k.d));
    b.onclick = () => { g.pk[k.id]++; if (k.id === 'hp') { g.p.mhp += 10; g.p.hp = Math.min(g.p.mhp, g.p.hp + 10); } if (k.id === 'am') addAmmoAll(.2); g.perk = false; g.paused = false; show(null); };
    box.appendChild(b);
  });
  show('perk');
}
function bexplode(b) {
  const g = G; sfx('boom'); shake = Math.max(shake, 8);
  g.fx.push({ k: 'ring', x: b.x, y: b.y, t: .3, m: .3, r: b.ex.r, c: '#ff9a3c' }); blood(b.x, b.y, '#ff9a3c', 14, 260);
  for (const z of g.z) { const dx = z.x - b.x, dy = z.y - b.y; if (Math.hypot(dx, dy) < b.ex.r + z.r) { z.hp -= b.ex.d; z.fl = .1; gore(z.x, z.y, Math.atan2(dy, dx), 6, 280); } }
}
/* ---------- Pouvoirs ---------- */
function usePower() {
  const g = G; if (!g.playing || g.paused || !g.ph || g.pa) return;
  const id = g.ph, p = g.p; if (--g.pc <= 0) { g.ph = null; g.pc = 0; } g.pu[id] = (g.pu[id] || 0) + 1; sfx(id);
  if (id === 'nova') {
    g.fx.push({ k: 'ring', x: p.x, y: p.y, t: .55, m: .55, r: 290, c: PW.nova.col });
    for (const z of g.z) { const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy) || 1; if (d < 290) { z.hp -= (z.big ? 8 : 6) * pm('nova'); z.fl = .1; z.kx += dx / d * 700; z.ky += dy / d * 700; gore(z.x, z.y, Math.atan2(dy, dx), 8, 300); } }
    g.eb.length = 0; shake = 16;
  } else if (id === 'thunder') {
    const m = pm('thunder'), tg = g.z.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 8);
    tg.forEach(z => { z.hp -= (z.big ? 10 : 12) * m; z.fl = .15; gore(z.x, z.y, Math.atan2(z.y - p.y, z.x - p.x), 8, 300); g.fx.push({ k: 'bolt', x: p.x, y: p.y, x2: z.x, y2: z.y, t: .3, m: .3, c: PW.thunder.col }); });
    shake = Math.max(shake, 10);
  } else g.pa = { id, t: pdur(id), n: 0 };
}
function powerTick(dt) {
  const g = G, p = g.p, a = g.pa;
  for (let i = g.st.length - 1; i >= 0; i--) {
    const s = g.st[i]; s.t -= dt;
    if (s.t <= 0) {
      g.st.splice(i, 1); sfx('boom'); shake = Math.max(shake, 9);
      g.fx.push({ k: 'ring', x: s.x, y: s.y, t: .35, m: .35, r: 90, c: '#ff9a3c' }); blood(s.x, s.y, '#ff9a3c', 14, 260);
      for (const z of g.z) { const dx = z.x - s.x, dy = z.y - s.y; if (Math.hypot(dx, dy) < 90 + z.r) { z.hp -= 10 * (s.m || 1); z.fl = .1; gore(z.x, z.y, Math.atan2(dy, dx), 6, 280); } }
    }
  }
  if (!a) return;
  a.t -= dt; a.n -= dt;
  if (a.id === 'laser') {
    for (const o of [-.22, 0, .22]) {
      const ca = Math.cos(p.ang + o), sa = Math.sin(p.ang + o);
      for (const z of g.z) {
        const rx = z.x - p.x, ry = z.y - p.y, t = rx * ca + ry * sa;
        if (t > 0 && t < LASER && Math.abs(rx * sa - ry * ca) < z.r + 4) { z.hp -= 9 * dt * pm('laser'); z.fl = .05; if (a.n <= 0 && Math.random() < .4) gore(z.x, z.y, p.ang + o, 2, 220); }
      }
    }
    if (a.n <= 0) { a.n = .14; sfx('lz'); }
  } else if (a.id === 'blades') {
    a.ang = (a.ang || 0) + dt * 7;
    for (let i = 0; i < 4; i++) {
      const ba = a.ang + i * 1.5708, bx = p.x + Math.cos(ba) * 70, by = p.y + Math.sin(ba) * 70;
      for (const z of g.z) {
        if (z.bc > 0) continue;
        if (Math.hypot(z.x - bx, z.y - by) < z.r + 12) { z.hp -= 4 * pm('blades'); z.bc = .3; z.fl = .08; const kk = Math.atan2(z.y - p.y, z.x - p.x); z.kx += Math.cos(kk) * 220; z.ky += Math.sin(kk) * 220; gore(z.x, z.y, kk, 7, 300); sfx('hit'); }
      }
    }
    for (const z of g.z) if (z.bc > 0) z.bc -= dt;
    if (a.n <= 0) { a.n = .35; sfx('whirl'); }
  } else if (a.id === 'strike') {
    if (a.n <= 0) {
      a.n = .16;
      const near = g.z.filter(z => Math.hypot(z.x - p.x, z.y - p.y) < 480), tz = near.length && Math.random() < .7 ? pick(near) : null, an = rnd(0, 6.283), r = rnd(60, 320);
      g.st.push({ x: clamp(tz ? tz.x + rnd(-25, 25) : p.x + Math.cos(an) * r, 20, WORLD - 20), y: clamp(tz ? tz.y + rnd(-25, 25) : p.y + Math.sin(an) * r, 20, WORLD - 20), t: .5, m: pm('strike') });
    }
  } else if (a.id === 'storm') {
    if (a.n <= 0) {
      a.n = .1; a.ang = (a.ang || 0) + .5;
      for (let i = 0; i < 6; i++) { const an = a.ang + i * 1.0472; g.b.push({ x: p.x + Math.cos(an) * 20, y: p.y + Math.sin(an) * 20, vx: Math.cos(an) * 640, vy: Math.sin(an) * 640, l: .75, d: 1.4 * pm('storm'), pl: 1, h: [], c: PW.storm.col }); }
      sfx('whirl');
    }
  }
  if (a.id === 'regen') g.p.hp = Math.min(g.p.mhp, g.p.hp + 14 * dt * pm('regen')); else if (a.id === 'chrono') g.tmr.freeze = Math.max(g.tmr.freeze || 0, .3);
  else if (a.id === 'shield') g.tmr.shield = Math.max(g.tmr.shield || 0, .3);
  else if (a.id === 'fury') { g.tmr.rage = Math.max(g.tmr.rage || 0, .3); g.tmr.speed = Math.max(g.tmr.speed || 0, .3); }
  else if (a.id === 'inferno') {
    const m = pm('inferno');
    for (const z of g.z) { if (Math.hypot(z.x - p.x, z.y - p.y) < 130 + z.r) { z.hp -= 7 * dt * m; z.fl = .05; if (a.n <= 0 && Math.random() < .5) gore(z.x, z.y, Math.atan2(z.y - p.y, z.x - p.x), 1, 160); } }
    if (a.n <= 0) { a.n = .25; sfx('whirl'); }
  } else if (a.id === 'drain') {
    const m = pm('drain'); let got = 0;
    for (const z of g.z) { if (Math.hypot(z.x - p.x, z.y - p.y) < 220 + z.r) { const d = 6 * dt * m; z.hp -= d; got += d; z.fl = .05; } }
    g.p.hp = Math.min(g.p.mhp, g.p.hp + got * .5);
    if (a.n <= 0) { a.n = .3; sfx('lz'); }
  }
  if (a.t <= 0) g.pa = null;
}
let pwKey = '';
function pwUI() {
  const g = G, id = g.pa ? g.pa.id : g.ph, el = $('pw'), key = (id || '') + (g.pa ? 'a' : '');
  el.classList.toggle('on', !!g.ph && !g.pa); el.classList.toggle('act', !!g.pa);
  $('pwn').textContent = g.pa ? Math.ceil(g.pa.t) + ' s' : g.ph ? PW[g.ph].name : 'Aucun'; $('pwk').textContent = g.ph ? 'Clic droit ×' + g.pc : 'Clic droit';
  if (key !== pwKey) {
    pwKey = key; const c = $('pwc'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 70, 64);
    if (id) { x.translate(35, 30); x.scale(1.5, 1.5); pArt(x, id, PW[id].col); }
  }
}
function drawFx(cx, cy) {
  const g = G, p = g.p, px = p.x - cx, py = p.y - cy;
  g.st.forEach(s => { const k = 1 - s.t / .5; ctx.strokeStyle = 'rgba(255,90,60,' + (.35 + k * .5).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x - cx, s.y - cy, 90 * (.3 + k * .7), 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(s.x - cx, s.y - cy, 5, 0, 7); ctx.stroke(); });
  g.fx.forEach(f => {
    if (f.k === 'bolt') {
      ctx.save(); ctx.globalAlpha = Math.max(0, f.t / f.m); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = f.c; ctx.shadowBlur = 16;
      const x1 = f.x - cx, y1 = f.y - cy, x2 = f.x2 - cx, y2 = f.y2 - cy, n = 7; ctx.beginPath(); ctx.moveTo(x1, y1);
      for (let i = 1; i < n; i++) ctx.lineTo(x1 + (x2 - x1) * i / n + (Math.random() - .5) * 28, y1 + (y2 - y1) * i / n + (Math.random() - .5) * 28);
      ctx.lineTo(x2, y2); ctx.strokeStyle = f.c; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); return;
    }
    const k = 1 - f.t / f.m; ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = f.c; ctx.lineWidth = 6 * (1 - k) + 2; ctx.beginPath(); ctx.arc(f.x - cx, f.y - cy, f.r * k, 0, 7); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  const a = g.pa; if (!a) return;
  if (a.id === 'regen') { ctx.strokeStyle = PW.regen.col; ctx.lineWidth = 4; ctx.globalAlpha = .5 + Math.sin(g.t * 8) * .2; ctx.beginPath(); ctx.arc(px, py, 34 + Math.sin(g.t * 6) * 3, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  else if (a.id === 'chrono') { ctx.fillStyle = 'rgba(120,180,255,.1)'; ctx.fillRect(0, 0, W, H); }
  if (a.id === 'laser') {
    ctx.lineCap = 'round'; ctx.shadowColor = PW.laser.col; ctx.shadowBlur = 18;
    for (const o of [-.22, 0, .22]) {
      const an = p.ang + o, ex = px + Math.cos(an) * LASER, ey = py + Math.sin(an) * LASER, sx = px + Math.cos(an) * 20, sy = py + Math.sin(an) * 20;
      ctx.strokeStyle = PW.laser.col; ctx.globalAlpha = .55 + Math.random() * .25; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  } else if (a.id === 'blades') {
    ctx.strokeStyle = 'rgba(255,210,74,.25)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 70, 0, 7); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const ba = (a.ang || 0) + i * 1.5708; ctx.save(); ctx.translate(px + Math.cos(ba) * 70, py + Math.sin(ba) * 70); ctx.rotate(g.t * 10);
      ctx.shadowColor = PW.blades.col; ctx.shadowBlur = 14; ctx.fillStyle = '#fff6c9'; ctx.strokeStyle = PW.blades.col; ctx.lineWidth = 3; ctx.beginPath();
      for (let k = 0; k < 4; k++) { ctx.lineTo(0, -13); ctx.lineTo(4, -4); ctx.rotate(1.5708); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.shadowBlur = 0;
  } else if (a.id === 'inferno') {
    ctx.save(); ctx.shadowColor = PW.inferno.col; ctx.shadowBlur = 16; ctx.strokeStyle = 'rgba(255,106,58,.5)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(px, py, 130, 0, 7); ctx.stroke();
    for (let i = 0; i < 16; i++) { const an = g.t * 3 + i * .3927, r = 130 + Math.sin(g.t * 9 + i * 2) * 8; ctx.fillStyle = i % 2 ? '#ffd24a' : '#ff6a3a'; ctx.globalAlpha = .85; ctx.beginPath(); ctx.arc(px + Math.cos(an) * r, py + Math.sin(an) * r, 7 + Math.sin(g.t * 12 + i) * 2, 0, 7); ctx.fill(); }
    ctx.restore();
  } else if (a.id === 'drain') {
    ctx.save(); ctx.strokeStyle = PW.drain.col; ctx.lineWidth = 3; ctx.globalAlpha = .25 + Math.sin(g.t * 8) * .1; ctx.beginPath(); ctx.arc(px, py, 220, 0, 7); ctx.stroke();
    ctx.globalAlpha = .7; ctx.fillStyle = PW.drain.col; for (let i = 0; i < 10; i++) { const k = ((g.t * 1.4 + i / 10) % 1), an = i * 0.6283 + g.t, r = 220 * (1 - k); ctx.beginPath(); ctx.arc(px + Math.cos(an) * r, py + Math.sin(an) * r, 4, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const grass = Array.from({ length: 900 }, () => ({ x: rnd(0, WORLD), y: rnd(0, WORLD), s: rnd(3, 8) }));
const obst = [];
for (let i = 0; i < 46; i++) {
  const x = rnd(120, WORLD - 120), y = rnd(120, WORLD - 120);
  if (Math.hypot(x - WORLD / 2, y - WORLD / 2) < 220) continue;
  obst.push({ x, y, r: rnd(24, 46), tree: Math.random() < .6 });
}
let G = { playing: false, paused: false, p: { x: WORLD / 2, y: WORLD / 2 }, t: 0, z: [], b: [], pt: [], ft: [], dr: [] };
let shake = 0;
let mx = 0, my = 0, down = false, edge = 0, touch = false;
const K = {}, joy = { on: false, id: null, ox: 0, oy: 0, x: 0, y: 0 };

/* ---------- Entrées ---------- */
const MAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ShiftLeft: 's', ShiftRight: 's', Space: 's' };
addEventListener('keydown', e => {
  if (e.code === 'KeyM' && G.playing) { toggleSnd(); return; }
  if (e.code === 'KeyQ' && G.playing && !G.paused) { cycleWp(1); return; }
  if (/^Digit[1-9]$/.test(e.code) && G.playing && !G.paused) { const id = ownedList()[+e.code.slice(5) - 1]; if (id) selectWp(id); return; }
  if (e.code === 'KeyE' && G.playing && !G.paused) { usePower(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { if (G.playing && !G.perk) setPause(!G.paused); return; }
  if (MAP[e.code] && G.playing) { K[MAP[e.code]] = 1; e.preventDefault(); }
});
addEventListener('keyup', e => { if (MAP[e.code]) K[MAP[e.code]] = 0; });
addEventListener('blur', () => { if (G.playing && !G.paused) setPause(true); });
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
cv.addEventListener('mousedown', e => { if (!G.playing || G.paused) return; if (e.button === 0) { down = true; edge = .15; } else if (e.button === 2) usePower(); e.preventDefault(); });
addEventListener('mouseup', () => { down = false; });
addEventListener('contextmenu', e => { if (G.playing) e.preventDefault(); });
$('pw').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); usePower(); });
$('wpn').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); cycleWp(1); });
cv.addEventListener('wheel', e => { if (G.playing && !G.paused) { cycleWp(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
cv.addEventListener('touchstart', e => {
  const t = e.changedTouches[0]; if (joy.on || !G.playing) return;
  touch = true; joy.on = true; joy.id = t.identifier; joy.ox = joy.x = t.clientX; joy.oy = joy.y = t.clientY; e.preventDefault();
}, { passive: false });
cv.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.x = t.clientX; joy.y = t.clientY; }
  e.preventDefault();
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) if (t.identifier === joy.id) joy.on = false; };
cv.addEventListener('touchend', endTouch); cv.addEventListener('touchcancel', endTouch);
function setPause(v) { G.paused = v; show(v ? 'pause' : null); if (!v) { $('menu').classList.add('hide'); } }

/* ---------- Partie ---------- */
function start() {
  if (!cur) return showMenu();
  G = {
    playing: true, paused: false, t: 0, wave: 0, score: 0, kills: 0, brk: 0, dc: 0, combo: 0, ct: 0, dist: 0, shots: 0, zk: {}, wk: {}, lx: WORLD / 2, ly: WORLD / 2, flash: 0, spawnLeft: 0, spawnT: 1,
    wp: 'pistol', am: {}, own: { pistol: 1 }, last: 'pistol', bc: 0, tmr: {}, cz: 0, cc: 0, cd: 0, cw: 0, dpd: 0, cash: 0, cs: 0, saving: false, sv: 0, sp: [], fx: [], st: [], ph: null, pa: null, pu: {}, sk: skinOf(cur), eb: [], z: [], b: [], pt: [], ft: [], dr: [],
    df: DF, pk: Object.fromEntries(PERKS.map(k => [k.id, 0])), pc: 0, perk: false,
    p: { x: WORLD / 2, y: WORLD / 2, hp: 100, mhp: 100, r: 15, cd: 0, hit: 0, ang: 0, dt: 0 }
  };
  G.am.pistol = maxAm('pistol'); Object.keys(K).forEach(k => K[k] = 0);
  audio(); show(null); hud(true); down = false; edge = 0; nextWave();
}
function nextWave() {
  G.wave++; if (G.wave > 1) { gainCash(8, 'cw'); saveCash(); } sfx('wave'); G.spawnLeft = waveCount(G.wave); G.spawnT = 1.2;
  G.p.hp = Math.min(G.p.mhp, G.p.hp + 20);
  const bn = $('banner'); bn.classList.remove('hide'); bn.style.animation = 'none'; void bn.offsetWidth; bn.style.animation = '';
  const ub = UB[G.wave];
  bn.textContent = ub ? 'Vague ' + G.wave + ' : ' + TYPES[ub].name + ' arrive' : G.wave % 10 === 0 ? 'Vague ' + G.wave + ' : un titan arrive' : G.wave % 5 === 0 ? 'Vague ' + G.wave + ' : un colosse arrive' : 'Vague ' + G.wave;
  setTimeout(() => bn.classList.add('hide'), 2400);
  if (ub) spawnZ(ub); else if (G.wave % 5 === 0) for (let k = 0; k < (G.wave >= 40 ? 2 : 1); k++) spawnZ('boss');
  if (G.wave % 10 === 0) spawnZ('titan');
  if (G.wave >= 2) perkChoose();
}
function spawnZ(type, px, py) {
  const T = TYPES[type], a = rnd(0, 6.283), d = Math.max(W, H) / 2 + 90;
  const w = G.wave, sc0 = (1 + w * .13 + w * w * .0015) * G.df.hp, sc = T.big ? Math.pow(sc0, .75) : sc0;
  G.z.push({
    t: type, x: px ?? clamp(G.p.x + Math.cos(a) * d, 30, WORLD - 30), y: py ?? clamp(G.p.y + Math.sin(a) * d, 30, WORLD - 30),
    r: T.r, hp: T.hp * sc, mx: T.hp * sc, sp: T.sp * (1 + Math.min(w, 20) * .015 + Math.min(Math.max(w - 20, 0), 60) * .004) * rnd(.9, 1.1),
    pts: T.pts, c: T.c, dk: T.dk, dmg: Math.min(T.dmg * (1 + Math.min(w, 100) * .008), T.big ? 60 : 70), big: !!T.big, ab: T.ab, mn: T.mn, tm: {}, sh: rnd(1, 2.5), cd: 0, fl: 0, kx: 0, ky: 0, ph: rnd(0, 6)
  });
}
function pickType() {
  const w = G.wave, t = [['walk', Math.max(8, 30 - w)], ['fast', w >= 2 ? 18 : 0], ['bomb', w >= 3 ? 8 : 0], ['tank', w >= 3 ? 6 : 0], ['crawler', w >= 4 ? 8 : 0], ['spit', w >= 4 ? 7 : 0], ['leaper', w >= 4 ? 7 : 0], ['toxic', w >= 5 ? 5 : 0], ['splitter', w >= 6 ? 5 : 0], ['brute', w >= 6 ? 3 + Math.min(w, 20) * .2 : 0], ['scream', w >= 7 ? 3 : 0], ['berserk', w >= 8 ? 5 : 0], ['necro', w >= 9 ? 2.5 : 0], ['ghoul', w >= 12 ? 6 : 0], ['archer', w >= 14 ? 5 : 0], ['juggernaut', w >= 15 ? 3 : 0], ['medic', w >= 18 ? 3 : 0], ['phantom', w >= 20 ? 4 : 0]];
  let s = 0; for (const e of t) s += e[1];
  let r = Math.random() * s;
  for (const e of t) { if ((r -= e[1]) < 0) return e[0]; }
  return 'walk';
}
function blood(x, y, c, n, sp) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(30, sp); G.pt.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: rnd(.3, .7), m: .7, c, s: rnd(1.5, 4) }); }
}
function pushOut(o, r) {
  for (const s of obst) {
    const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy), m = s.r + r;
    if (d < m && d > .01) { o.x = s.x + dx / d * m; o.y = s.y + dy / d * m; }
  }
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const BP = ['freeze', 'rage', 'ammo', 'ammo', 'ammo', 'ammo', 'heal', 'heal', 'heal', 'shield', 'shield', 'speed', 'speed', 'x2', 'x2', 'nuke', 'magnet', 'magnet'];
/* Une arme ne tombe qu'à partir de sa vague (tier) : aucune arme avant la vague 3. */
const pickWeapon = rare => { const l = Object.keys(WP).filter(k => WP[k].tier && WP[k].tier <= G.wave).sort((a, b) => WP[a].tier - WP[b].tier); if (!l.length) return null; return rare ? pick(l.slice(-3)) : pick(l.slice(0, Math.max(2, Math.ceil(l.length * .7)))); };
const _old = rare => pick(rare ? ['rifle', 'sniper', 'sniper', 'mini', 'mini', 'shotgun'] : ['smg', 'smg', 'smg', 'shotgun', 'shotgun', 'rifle', 'rifle', 'sniper', 'mini']);
function hurt(d) { const p = G.p; if (G.tmr.shield > 0) return; p.hp -= d * G.df.dm * (1 - .03 * G.pk.ar); p.hit = .25; shake = Math.max(shake, 7); sfx('hurt'); }
function boom(z) {
  const p = G.p; sfx('boom'); blood(z.x, z.y, '#ff9a3c', 30, 320); shake = Math.max(shake, 12);
  if (Math.hypot(p.x - z.x, p.y - z.y) < 95) hurt(30);
  G.z.forEach(o => { if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 95) o.hp -= 8; });
}
/* ---------- Munitions : chaque arme a SA réserve et SON maximum ---------- */
const MAXAM = { pistol: 90, revolver: 48, smg: 160, dual: 160, shotgun: 32, autoshot: 64, rifle: 120, crossbow: 28, sniper: 20, launcher: 16, plasma: 90, flame: 300, mini: 360, railgun: 12, magnum: 30, duo: 24, lmg: 260, rocket: 10, laser: 340, gauss: 10, disint: 70 };
const PICK_PCT = .5, BOX_PCT = .35;   /* arme ramassée : 50 % du max · caisse MU : 35 % du max de chaque arme */
const ammoOf = id => id === 'knife' ? Infinity : (G.am[id] || 0);
function lowAmmo() { return G.wp === 'knife' || ammoOf(G.wp) < maxAm(G.wp) * .25; }
function addAmmo(id, n) {
  const g = G; if (id === 'knife' || !MAXAM[id]) return 0;
  const b = g.am[id] || 0; g.am[id] = Math.min(maxAm(id), b + Math.max(1, Math.ceil(n)));
  if (g.wp === 'knife' && g.am[id] > 0) setWp(id);
  return g.am[id] - b;
}
function addAmmoAll(pct) { Object.keys(G.own).forEach(id => addAmmo(id, maxAm(id) * pct)); }
function setWp(id) { const g = G; g.wp = id; if (id !== 'knife') { g.last = id; g.own[id] = 1; } }
function ownedList() { const l = Object.keys(G.own).filter(id => ammoOf(id) > 0).sort((a, b) => (WP[a].tier || 0) - (WP[b].tier || 0)); l.push('knife'); return l; }
function cycleWp(dir) {
  const g = G; if (!g.playing || g.paused) return;
  const l = ownedList(); if (l.length < 2) return;
  setWp(l[(Math.max(0, l.indexOf(g.wp)) + dir + l.length) % l.length]); g.p.cd = Math.max(g.p.cd, .15); sfx('pick');
  g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1, s: WP[g.wp].name, c: WP[g.wp].col });
}
function selectWp(id) {
  const g = G; if (!g.playing || g.paused || id === g.wp || !ownedList().includes(id)) return;
  setWp(id); g.p.cd = Math.max(g.p.cd, .15); sfx('pick');
  g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1, s: WP[id].name, c: WP[id].col });
}
/* Inventaire discret sous la barre de vie : nom + munitions de chaque arme, contour sur l'arme choisie */
const INV = { sig: '', el: {} };
function invDraw() {
  const g = G, box = $('inv'), l = ownedList(), sig = l.join(',');
  if (sig !== INV.sig) {
    INV.sig = sig; INV.el = {}; box.replaceChildren();
    l.forEach((id, i) => {
      const c = mk('div', 'ic'), a = mk('b', 'ia');
      c.style.setProperty('--wc', WP[id].col); c.setAttribute('role', 'button');
      if (i < 9) c.append(mk('i', 'ik', String(i + 1)));
      c.append(mk('span', 'in', WP[id].name), a);
      c.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); selectWp(id); });
      box.appendChild(c); INV.el[id] = { c, a, k: null };
    });
  }
  for (const id of l) {
    const o = INV.el[id], am = id === 'knife' ? '∞' : g.am[id], low = id !== 'knife' && am < maxAm(id) * .25, sel = id === g.wp, k = am + '|' + low + '|' + sel;
    if (o.k !== k) { o.k = k; o.a.textContent = am; o.c.classList.toggle('sel', sel); o.c.classList.toggle('low', low); o.c.setAttribute('aria-pressed', sel); }
  }
}
function outOfAmmo() {
  const g = G; g.am[g.wp] = 0; const nx = ownedList().filter(id => id !== 'knife').pop(); g.p.cd = Math.max(g.p.cd, .2);
  if (nx) { setWp(nx); g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1.4, s: 'Plus de munitions : ' + WP[nx].name, c: '#ff4d5e' }); }
  else { g.wp = 'knife'; g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1.4, s: 'Plus de munitions : couteau', c: '#ff4d5e' }); }
}
function dropFrom(z) {
  const low = lowAmmo(), rw = (z.big ? 1 : z.t === 'brute' ? .4 : z.t === 'tank' ? .28 : z.t === 'juggernaut' ? .35 : .035) + (low ? .02 : 0);
  const wid = Math.random() < rw ? pickWeapon(z.big || z.t === 'brute') : null;
  if (wid) G.dr.push({ x: z.x + rnd(-10, 10), y: z.y, k: 'w', id: wid, l: 20 });
  else if (Math.random() < .22 * (1 + .1 * G.pk.lt)) G.dr.push({ x: z.x, y: z.y, k: 'b', id: low && Math.random() < .4 ? 'ammo' : pick(BP), l: 18 });
  if (z.big) G.dr.push({ x: z.x + 34, y: z.y, k: 'b', id: 'heal', l: 20 });
  const pr = z.big ? 1 : z.t === 'brute' ? .16 : z.t === 'tank' ? .07 : .012;
  if (Math.random() < pr) G.dr.push({ x: z.x + rnd(-24, 24), y: z.y + rnd(12, 28), k: 'p', id: pick(Object.keys(PW)), l: 25 });
}
function take(d) {
  const g = G, p = g.p;
  if (d.k === 'p') {
    const pw = PW[d.id]; if (g.ph === d.id) g.pc = Math.min(pch(d.id) * 2, g.pc + pch(d.id)); else { g.ph = d.id; g.pc = pch(d.id); } sfx('pwpick');
    if (!cur.dp.includes(d.id)) { cur.dp.push(d.id); g.ft.push({ x: p.x, y: p.y - 44, t: 1.6, s: 'Pouvoir découvert !', c: '#7fb8ff' }); }
    g.ft.push({ x: p.x, y: p.y - 22, t: 1.4, s: pw.name + ' ×' + g.pc + ' : clic droit', c: pw.col }); return;
  }
  if (d.k === 'w') {
    const w = WP[d.id]; const got = addAmmo(d.id, maxAm(d.id) * PICK_PCT * (1 + .12 * wlv(d.id))); setWp(d.id); g.wk[d.id] = (g.wk[d.id] || 0) + 1; sfx('pick');
    if (!cur.dw.includes(d.id)) { cur.dw.push(d.id); g.ft.push({ x: p.x, y: p.y - 44, t: 1.6, s: 'Arme découverte !', c: '#7fb8ff' }); }
    g.ft.push({ x: p.x, y: p.y - 22, t: 1.2, s: w.name + ' +' + got, c: w.col });
  } else {
    const b = BONUS[d.id]; sfx('bonus');
    if (d.id === 'ammo') addAmmoAll(BOX_PCT);
    else if (d.id === 'heal') p.hp = Math.min(p.mhp, p.hp + 30);
    else if (d.id === 'nuke') { g.z.forEach(z => { if (z.big) z.hp -= Math.max(40, z.mx * .08); else z.hp = 0; }); shake = 20; sfx('boom'); }
    else g.tmr[d.id] = { shield: 6, speed: 8, x2: 12, freeze: 6, rage: 8, magnet: 12 }[d.id] * (1 + .1 * g.pk.bo);
    g.ft.push({ x: p.x, y: p.y - 22, t: 1.2, s: b.n, c: b.c });
  }
}
async function end() {
  if (G.over) return; G.over = true; sfx('over');
  for (let i = 0; i < 40 && G.saving; i++) await new Promise(r => setTimeout(r, 50));
  G.playing = false; hud(false); show('over');
  $('fs').textContent = G.score; $('fd').textContent = 'Enregistrement du score…'; $('fc').textContent = ''; $('ft').replaceChildren();
  let u, rec = false; try { u = (await getUser(ckey)) || cur; } catch (e) { $('fd').textContent = 'Hors ligne : score non enregistré. Vérifiez votre connexion.'; return; } if ((u.rv || 0) !== (cur.rv || 0)) cur = u;
  u.games = (u.games || 0) + 1; u.kills = (u.kills || 0) + G.kills;
  u.total = (u.total || 0) + G.score; u.dist = (u.dist || 0) + G.dist; u.tp = (u.tp || 0) + G.t; u.shots = (u.shots || 0) + G.shots; u.bw = Math.max(u.bw || 0, G.wave);
  ['zk', 'wk'].forEach(f => { u[f] = u[f] || {}; for (const k in G[f]) u[f][k] = (u[f][k] || 0) + G[f][k]; });
  u.av = u.av || cur.av; u.col = u.col || cur.col;
  u.ti = cur.ti || ''; u.tu = [...new Set([...(u.tu || []), ...(cur.tu || [])])]; u.bc = Math.max(u.bc || 0, G.bc || 0);
  u.sk = cur.sk; u.sc = cur.sc; u.os = [...new Set([...(u.os || []), ...(cur.os || [])])]; u.dp = [...new Set([...(u.dp || []), ...(cur.dp || [])])];
  const gn = cashParts(), rest = G.cash - G.cs; u.money = (u.money || 0) + rest; u.earned = (u.earned || 0) + rest; u.pk = u.pk || {}; for (const k in G.pu) u.pk[k] = (u.pk[k] || 0) + G.pu[k]; norm(u);
  u.dw = [...new Set([...(u.dw || []), ...cur.dw])]; u.dz = [...new Set([...(u.dz || []), ...cur.dz])];
  if (G.score > (u.best || 0)) { u.best = G.score; rec = true; }
  const nt = checkTitles(u);
  try { await putUser(ckey, u); } catch (e) { $('fd').textContent = 'Hors ligne : score non enregistré.'; return; }
  cur = u;
  $('fd').textContent = 'Vague ' + G.wave + ', ' + G.kills + ' zombies abattus. ' + (rec ? 'Nouveau record personnel !' : 'Record : ' + u.best);
  $('fc').textContent = '+' + gn.total + ' $ gagnés (zombies ' + gn.k + ', combos ' + gn.c + ', distance ' + gn.d + ', vagues ' + gn.w + ') · Solde : ' + u.money + ' $';
  const ftb = $('ft'); ftb.replaceChildren(); if (nt.length) { ftb.append(nt.length > 1 ? 'Titres débloqués : ' : 'Titre débloqué : '); nt.forEach(id => ftb.append(ttlEl(id, true), ' ')); ftb.append(mk('br'), 'À équiper dans Mon espace › Titres.'); }
  renderLB($('lb2'));
}

/* ---------- Mise à jour ---------- */
function update(dt) {
  const g = G, p = g.p; g.t += dt; edge -= dt; g.ct -= dt; if (g.ct <= 0) g.combo = 0; g.flash -= dt;
  for (const k in g.tmr) g.tmr[k] -= dt;
  const cx = clamp(p.x - W / 2, -60, WORLD - W + 60), cy = clamp(p.y - H / 2, -60, WORLD - H + 60);
  let x = (K.r ? 1 : 0) - (K.l ? 1 : 0), y = (K.d ? 1 : 0) - (K.u ? 1 : 0);
  const kl = Math.hypot(x, y); if (kl > 1) { x /= kl; y /= kl; }
  if (joy.on) { const dx = joy.x - joy.ox, dy = joy.y - joy.oy, d = Math.hypot(dx, dy); if (d > 8) { const m = Math.min(d, 60) / 60; x = dx / d * m; y = dy / d * m; } }
  if (g.dc > 0) g.dc -= dt;
  if (K.s && g.dc <= 0 && (x || y)) { p.dt = .15; g.dc = 1.6 * (1 - .05 * g.pk.dh); sfx('dash'); }
  p.dt = Math.max(0, p.dt - dt);
  const spd = (g.tmr.speed > 0 ? 300 : 215) * (p.dt > 0 ? 3.2 : 1) * (1 + .04 * g.pk.sp);
  p.x = clamp(p.x + x * spd * dt, p.r, WORLD - p.r); p.y = clamp(p.y + y * spd * dt, p.r, WORLD - p.r); pushOut(p, p.r); g.dist += Math.hypot(p.x - g.lx, p.y - g.ly) / 40; g.lx = p.x; g.ly = p.y;
  const dd = Math.floor(g.dist / 10) - g.dpd; if (dd > 0) { g.dpd += dd; gainCash(dd, 'cd'); }
  g.sv += dt; if (g.sv > 8) { g.sv = 0; saveCash(); }
  p.hit = Math.max(0, p.hit - dt); p.cd -= dt; if (g.pk.rg) p.hp = Math.min(p.mhp, p.hp + .3 * g.pk.rg * dt); p.sl = Math.max(0, (p.sl || 0) - dt);
  // visée à la souris, tir au clic (tactile : automatique)
  const w = WP[g.wp]; let want = false;
  if (touch) {
    let best = null, bd = 580;
    for (const z of g.z) { const d = Math.hypot(z.x - p.x, z.y - p.y); if (d < bd) { bd = d; best = z; } }
    if (best) { p.ang = Math.atan2(best.y - p.y, best.x - p.x); want = true; } else if (x || y) p.ang = Math.atan2(y, x);
  } else { p.ang = Math.atan2(my - (p.y - cy), mx - (p.x - cx)); want = w.auto ? down : edge > 0; }
  if (want && p.cd <= 0) {
    const lv = wlv(g.wp), dm = (1 + .15 * lv) * (1 + .06 * g.pk.dm);
    p.cd = w.rate * (1 - .05 * lv) * Math.pow(.96, g.pk.rt) * (g.tmr.rage > 0 ? .5 : 1); edge = 0; g.shots++; shotSfx(g.wp); g.flash = .06; if (g.wp === 'knife') { p.sd = -(p.sd || 1); p.sl = .24; }
    for (let i = 0; i < w.n; i++) {
      const a = p.ang + rnd(-w.sp, w.sp) / 2;
      g.b.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, vx: Math.cos(a) * w.v, vy: Math.sin(a) * w.v, l: w.life, d: w.dmg * dm * (Math.random() < .04 * g.pk.cr ? 2 : 1), pl: w.pl + (lv >= 3 ? 1 : 0) + g.pk.pl, ex: w.ex ? { r: w.ex.r, d: w.ex.d * dm } : null, h: [], c: w.col });
    }
    if (g.wp !== 'knife') blood(p.x + Math.cos(p.ang) * 28, p.y + Math.sin(p.ang) * 28, '#ffd27a', 3, 120);
    if (w.n > 3 || w.dmg > 5) shake = Math.max(shake, 4);
    if (g.wp !== 'knife' && --g.am[g.wp] <= 0) outOfAmmo();
  }
  for (let i = g.b.length - 1; i >= 0; i--) {
    const b = g.b[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.l -= dt; let dead = b.l <= 0;
    if (!dead) for (const s of obst) if (Math.hypot(b.x - s.x, b.y - s.y) < s.r) { dead = true; break; }
    if (!dead) for (const z of g.z) {
      if (b.h.includes(z)) continue;
      if (Math.hypot(b.x - z.x, b.y - z.y) < z.r + 4) {
        z.hp -= b.d; z.fl = .08; const a = Math.atan2(b.vy, b.vx); z.kx = Math.cos(a) * 90; z.ky = Math.sin(a) * 90;
        blood(b.x, b.y, z.c, 2, 120); gore(b.x, b.y, a, g.wp === 'knife' ? 16 : b.d > 4 ? 14 : 8, 400); gore(b.x, b.y, a + Math.PI, 3, 200); sfx('hit');
        if (b.pl > 0) { b.pl--; b.h.push(z); } else { dead = true; break; }
      }
    }
    if (dead) { if (b.ex) bexplode(b); g.b.splice(i, 1); }
  }
  powerTick(dt);
  if (g.spawnLeft > 0 && g.z.length < zcap()) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) { spawnZ(pickType()); g.spawnLeft--; g.spawnT = Math.max(.1, 1 - g.wave * .05); }
  }
  const scr = g.z.filter(q => q.t === 'scream');
  for (let i = g.z.length - 1; i >= 0; i--) {
    const z = g.z[i];
    if (z.hp <= 0) {
      g.combo++; if (g.combo > g.bc) g.bc = g.combo; g.ct = 2.5; g.zk[z.t] = (g.zk[z.t] || 0) + 1; sfx('kill');
      const pts = Math.max(1, Math.round((z.pts + Math.floor(g.combo / 5)) * (g.tmr.x2 > 0 ? 2 : 1) * g.df.sc * (1 + .05 * g.pk.pt)));
      g.score += pts; g.kills++; if (g.pk.vm) p.hp = Math.min(p.mhp, p.hp + .25 * g.pk.vm); const cg = gainCash(z.pts, 'cz') + (g.combo >= 5 ? gainCash(Math.floor(g.combo / 5), 'cc') : 0); blood(z.x, z.y, z.c, z.big ? 50 : 16, 220); gore(z.x, z.y, Math.atan2(z.ky || 0, z.kx || 1), z.big ? 46 : 18, 360); splat(z.x, z.y, z.r); splat(z.x, z.y, z.r);
      g.ft.push({ x: z.x, y: z.y - z.r, t: 1, s: '+' + pts + (cg ? '  +' + cg + ' $' : ''), c: z.big ? '#ff5a5a' : '#ffb347' });
      if (!cur.dz.includes(z.t)) { cur.dz.push(z.t); g.ft.push({ x: z.x, y: z.y - z.r - 24, t: 1.6, s: 'Zombie découvert !', c: '#7fb8ff' }); }
      if (z.t === 'bomb') boom(z);
      if (z.t === 'splitter') for (let k = 0; k < 2; k++) spawnZ('crawler', z.x + rnd(-14, 14), z.y + rnd(-14, 14));
      dropFrom(z); if (z.big) shake = 14; g.z.splice(i, 1); continue;
    }
    const dx = p.x - z.x, dy = p.y - z.y, d = Math.hypot(dx, dy) || 1; let mv = 1;
    if (z.t === 'spit') {
      if (d < 230) mv = -.6; else if (d < 300) mv = 0;
      z.sh -= dt;
      if (z.sh <= 0 && d < 520) { z.sh = 2.2; const a = Math.atan2(dy, dx); g.eb.push({ x: z.x, y: z.y, vx: Math.cos(a) * 250, vy: Math.sin(a) * 250, l: 3 }); }
    }
    if (z.t === 'archer') { if (d < 330) mv = -.6; else if (d < 420) mv = 0; z.sh -= dt; if (z.sh <= 0 && d < 650) { z.sh = 1.5; const a = Math.atan2(dy, dx); g.eb.push({ x: z.x, y: z.y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, l: 2.2, d: 14 }); } }
    if (z.t === 'necro') {
      if (d < 260) mv = -.6; else if (d < 340) mv = 0;
      z.sh -= dt; if (z.sh <= 0 && g.z.length < zcap()) { z.sh = 5; sfx('wave'); for (let k = 0; k < 2; k++) spawnZ('walk', z.x + rnd(-30, 30), z.y + rnd(-30, 30)); }
    } else if (z.t === 'leaper') {
      z.sh -= dt; if (z.sh <= 0 && d > 120 && d < 430) { z.sh = rnd(2, 3.2); z.kx += dx / d * 1300; z.ky += dy / d * 1300; }
    } else if (z.t === 'phantom') {
      z.sh -= dt; if (z.sh <= 0 && d > 200) { z.sh = rnd(3, 4.5); const a = rnd(0, 6.283); z.x = clamp(p.x + Math.cos(a) * 150, 30, WORLD - 30); z.y = clamp(p.y + Math.sin(a) * 150, 30, WORLD - 30); g.fx.push({ k: 'ring', x: z.x, y: z.y, t: .35, m: .35, r: 50, c: z.c }); }
    } else if (z.t === 'medic') {
      if (d < 250) mv = -.5; else if (d < 330) mv = 0;
      for (const o of g.z) if (o !== z && o.hp < o.mx && Math.hypot(o.x - z.x, o.y - z.y) < 230) o.hp = Math.min(o.mx, o.hp + 4 * dt);
    } else if (z.t === 'titan') {
      z.sh -= dt; if (z.sh <= 0 && d < 750) { z.sh = 3; for (let k = 0; k < 10; k++) { const a = g.t + k * .628; g.eb.push({ x: z.x, y: z.y, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, l: 3.2 }); } }
    }
    if (z.ab) bossAI(z, d, dx, dy, dt);
    let boost = 1; for (const s of scr) if (s !== z && Math.hypot(s.x - z.x, s.y - z.y) < 260) { boost = 1.35; break; }
    let vx = dx / d * mv, vy = dy / d * mv;
    for (const s of obst) {
      const ox = s.x - z.x, oy = s.y - z.y, od = Math.hypot(ox, oy) || 1, m = s.r + z.r + 34;
      if (od < m && ox * vx + oy * vy > 0) { const sg = vx * oy - vy * ox > 0 ? -1 : 1, f = (m - od) / m * 2.6; vx += -oy / od * sg * f; vy += ox / od * sg * f; }
    }
    const vl = Math.hypot(vx, vy) || 1; if (vl > Math.abs(mv)) { vx = vx / vl * Math.abs(mv); vy = vy / vl * Math.abs(mv); }
    const fz = g.tmr.freeze > 0 ? .4 : 1; z.x += (vx * z.sp * fz * boost + z.kx) * dt; z.y += (vy * z.sp * fz * boost + z.ky) * dt;
    z.kx *= .88; z.ky *= .88; z.fl -= dt; z.cd -= dt;
    for (let j = i + 1; j < g.z.length; j++) {
      const o = g.z[j], ox = z.x - o.x, oy = z.y - o.y, od = Math.hypot(ox, oy), m = z.r + o.r - 4;
      if (od < m && od > .01) { const f = (m - od) / 2 / od; z.x += ox * f; z.y += oy * f; o.x -= ox * f; o.y -= oy * f; }
    }
    pushOut(z, z.r);
    const touching = d < z.r + p.r + 2;
    if (touching && z.t === 'bomb') z.hp = 0;
    else if (touching && z.cd <= 0) { hurt(z.dmg); z.cd = .8; }
  }
  for (let i = g.eb.length - 1; i >= 0; i--) {
    const e = g.eb[i]; e.x += e.vx * dt; e.y += e.vy * dt; e.l -= dt;
    if (Math.hypot(e.x - p.x, e.y - p.y) < p.r + 6) { hurt(e.d || 10); e.l = 0; }
    if (e.l <= 0) g.eb.splice(i, 1);
  }
  for (let i = g.dr.length - 1; i >= 0; i--) {
    const d = g.dr[i]; d.l -= dt;
    if (g.tmr.magnet > 0) { const mdx = p.x - d.x, mdy = p.y - d.y, md = Math.hypot(mdx, mdy); if (md < 520 && md > 1) { d.x += mdx / md * 420 * dt; d.y += mdy / md * 420 * dt; } }
    if (Math.hypot(d.x - p.x, d.y - p.y) < 32) { take(d); g.dr.splice(i, 1); } else if (d.l <= 0) g.dr.splice(i, 1);
  }
  for (let i = g.pt.length - 1; i >= 0; i--) { const q = g.pt[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .93; q.vy *= .93; q.l -= dt; if (q.l <= 0) { if (q.g && Math.random() < .3) splat(q.x, q.y, q.s * .6); g.pt.splice(i, 1); } }
  for (let i = g.ft.length - 1; i >= 0; i--) { const f = g.ft[i]; f.y -= 40 * dt; f.t -= dt; if (f.t <= 0) g.ft.splice(i, 1); }
  shake *= .9;
  for (let i = g.fx.length - 1; i >= 0; i--) { g.fx[i].t -= dt; if (g.fx[i].t <= 0) g.fx.splice(i, 1); }
  for (let i = g.sp.length - 1; i >= 0; i--) { g.sp[i].l -= dt; if (g.sp[i].l <= 0) g.sp.splice(i, 1); }
  if (g.spawnLeft === 0 && g.z.length === 0 && g.brk <= 0) g.brk = 2.6;
  if (g.brk > 0) { g.brk -= dt; if (g.brk <= 0) nextWave(); }
  $('cash').textContent = fmt((cur.money || 0) + g.cash - g.cs); $('sc').textContent = g.score; $('kl').textContent = g.kills; $('rem').textContent = g.spawnLeft + g.z.length;
  $('wv').textContent = 'Vague ' + g.wave; $('hp').style.width = Math.max(0, p.hp / p.mhp * 100) + '%'; $('hpn').textContent = Math.max(0, Math.ceil(p.hp)) + ' / ' + p.mhp;
  invDraw(); pwUI();
  $('wpn').textContent = w.name + (wlv(g.wp) ? ' Niv.' + wlv(g.wp) : '') + (g.wp === 'knife' ? ' · Sans munitions (couteau)' : ' · Munitions ' + g.am[g.wp] + ' / ' + maxAm(g.wp));
  const bt = []; for (const k of ['shield', 'speed', 'x2', 'freeze', 'rage', 'magnet']) if (g.tmr[k] > 0) bt.push(BONUS[k].n + ' ' + Math.ceil(g.tmr[k]) + ' s');
  if (g.combo >= 3) bt.push('Combo ×' + g.combo); bt.push(g.dc > 0 ? 'Esquive ' + g.dc.toFixed(1) + ' s' : 'Esquive prête');
  if (p.hp < 30 && g.t - (g.hb || 0) > .9) { g.hb = g.t; tone(60, .14, 'sine', .3, .5); tone(55, .14, 'sine', .25, .5, .18); }
  $('bon').textContent = bt.join('   ');
  if (p.hp <= 0) end();
}

/* ---------- Rendu ---------- */
function drawGround(cx, cy) {
  ctx.fillStyle = '#0c1424'; ctx.fillRect(0, 0, W, H);
  const i0 = Math.max(0, Math.floor(cx / TILE)), j0 = Math.max(0, Math.floor(cy / TILE));
  const i1 = Math.min(WORLD / TILE - 1, Math.floor((cx + W) / TILE)), j1 = Math.min(WORLD / TILE - 1, Math.floor((cy + H) / TILE));
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const n = ((i * 73856093) ^ (j * 19349663)) >>> 0;
    ctx.fillStyle = 'hsl(' + (150 + n % 20) + ',22%,' + (13 + n % 5) + '%)';
    ctx.fillRect(i * TILE - cx, j * TILE - cy, TILE + 1, TILE + 1);
  }
  ctx.strokeStyle = 'rgba(160,200,255,.9)'; ctx.lineWidth = 1.2; ctx.globalAlpha = .1; ctx.beginPath();
  for (const q of grass) { const sx = q.x - cx, sy = q.y - cy; if (sx < -10 || sy < -10 || sx > W + 10 || sy > H + 10) continue; ctx.moveTo(sx, sy); ctx.lineTo(sx - 2, sy - q.s); ctx.moveTo(sx, sy); ctx.lineTo(sx + 2, sy - q.s * .8); }
  ctx.stroke(); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 6; ctx.shadowColor = '#ff4d5e'; ctx.shadowBlur = 24;
  ctx.strokeRect(-cx, -cy, WORLD, WORLD); ctx.shadowBlur = 0;
}
function drawObst(s, cx, cy) {
  const x = s.x - cx, y = s.y - cy; if (x < -80 || y < -80 || x > W + 80 || y > H + 80) return;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 6, y + 8, s.r, s.r * .8, 0, 0, 7); ctx.fill();
  if (s.tree) {
    ctx.fillStyle = '#17402f'; ctx.beginPath(); ctx.arc(x, y, s.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#23694c'; ctx.beginPath(); ctx.arc(x - s.r * .15, y - s.r * .2, s.r * .72, 0, 7); ctx.fill();
    ctx.fillStyle = '#34896a'; ctx.beginPath(); ctx.arc(x - s.r * .3, y - s.r * .35, s.r * .35, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = '#4a5468'; ctx.beginPath(); ctx.arc(x, y, s.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a7690'; ctx.beginPath(); ctx.arc(x - s.r * .2, y - s.r * .25, s.r * .62, 0, 7); ctx.fill();
  }
}
function drawZ(z, cx, cy) {
  const x = z.x - cx, y = z.y - cy; if (x < -90 || y < -90 || x > W + 90 || y > H + 90) return;
  const a = Math.atan2(G.p.y - z.y, G.p.x - z.x), sw = Math.sin(G.t * 8 + z.ph) * z.r * .18;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, z.r, z.r * .8, 0, 0, 7); ctx.fill();
  ctx.save(); if (z.t === 'phantom') ctx.globalAlpha = .55 + Math.sin(G.t * 5 + z.ph) * .2; ctx.translate(x, y); ctx.rotate(a); zArt(ctx, z.r, z, z.t, z.fl > 0, sw); ctx.restore(); ctx.shadowBlur = 0;
  if (z.t === 'scream') { ctx.strokeStyle = 'rgba(217,160,232,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 260, 0, 7); ctx.stroke(); }
  if (G.tmr.freeze > 0) { ctx.fillStyle = 'rgba(155,231,255,.35)'; ctx.beginPath(); ctx.arc(x, y, z.r, 0, 7); ctx.fill(); }
  if (z.mx > 8 && z.hp < z.mx) {
    const w = z.r * 2; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2, y - z.r - 12, w, 5);
    ctx.fillStyle = '#ff5a5a'; ctx.fillRect(x - w / 2, y - z.r - 12, w * z.hp / z.mx, 5);
  }
}
function knifeArt(p) {
  const sd = p.sd || 1, k = p.sl > 0 ? 1 - p.sl / .24 : 1, e = 1 - Math.pow(1 - k, 3), sw = sd * (1.2 - 2.4 * e), th = Math.sin(k * Math.PI) * 9;
  if (p.sl > 0 && k > .04) { ctx.strokeStyle = 'rgba(255,255,255,' + (.75 * (1 - k)).toFixed(2) + ')'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, 42, sd * 1.2, sw, sd > 0); ctx.stroke(); }
  ctx.save(); ctx.rotate(sw);
  ctx.fillStyle = G.sk.tone; ctx.beginPath(); ctx.arc(5 + th, 0, 4.4, 0, 7); ctx.fill();
  ctx.translate(15 + th, 0); ctx.scale(.62, .62); wArt(ctx, 'knife', '#dfe6f1'); ctx.restore();
}
function drawPlayer(cx, cy) {
  const p = G.p, x = p.x - cx, y = p.y - cy, knife = G.wp === 'knife';
  const lg = ctx.createRadialGradient(x, y, 10, x, y, 280); lg.addColorStop(0, 'rgba(255,200,130,.16)'); lg.addColorStop(1, 'rgba(255,200,130,0)');
  ctx.fillStyle = lg; ctx.fillRect(x - 280, y - 280, 560, 560);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 7, 17, 13, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.ang);
  if (!knife) { ctx.save(); ctx.translate(22, 0); ctx.scale(.55, .55); wArt(ctx, G.wp, WP[G.wp].col); ctx.restore(); if (G.flash > 0) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(44, 0, 7, 0, 7); ctx.fill(); } }
  skinArt(ctx, G.sk, p.hit > 0);
  if (knife) knifeArt(p);
  ctx.restore();
}
function render() {
  const g = G; let cx, cy;
  if (g.playing) { cx = clamp(g.p.x - W / 2, -60, WORLD - W + 60); cy = clamp(g.p.y - H / 2, -60, WORLD - H + 60); }
  else { const t = performance.now() / 6000; cx = WORLD / 2 - W / 2 + Math.cos(t) * 300; cy = WORLD / 2 - H / 2 + Math.sin(t * .8) * 300; }
  if (shake > .5) { cx += rnd(-shake, shake); cy += rnd(-shake, shake); }
  drawGround(cx, cy);
  cv.style.cursor = g.playing && !touch ? 'none' : 'default';
  if (!g.playing) return;
  drawSplats(cx, cy);
  g.dr.forEach(d => {
    if (d.l < 4 && Math.floor(g.t * 8) % 2) return;
    const x = d.x - cx, y = d.y - cy + Math.sin(g.t * 4 + d.x) * 3, col = d.k === 'w' ? WP[d.id].col : d.k === 'p' ? PW[d.id].col : BONUS[d.id].c;
    ctx.save(); ctx.translate(x, y); ctx.shadowColor = col; ctx.shadowBlur = 20; ctx.fillStyle = 'rgba(13,21,36,.9)'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
    if (d.k === 'w') ctx.roundRect(-30, -20, 60, 40, 10); else if (d.k === 'p') { for (let i = 0; i < 6; i++) { const q = i * 1.0472 + .5236; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(q) * 25, Math.sin(q) * 25); } ctx.closePath(); } else ctx.arc(0, 0, 21, 0, 7);
    ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    if (d.k === 'w') { ctx.scale(.75, .75); wArt(ctx, d.id, col); } else if (d.k === 'p') { ctx.rotate(Math.sin(g.t * 2) * .2); ctx.scale(1.15, 1.15); pArt(ctx, d.id, col); } else bArt(ctx, d.id, col);
    ctx.restore();
  });
  ctx.textBaseline = 'alphabetic';
  g.pt.forEach(q => { ctx.globalAlpha = Math.max(0, q.l / q.m); ctx.fillStyle = q.c; ctx.fillRect(q.x - cx, q.y - cy, q.s, q.s); }); ctx.globalAlpha = 1;
  g.z.forEach(z => drawZ(z, cx, cy));
  ctx.fillStyle = '#7fe3d0'; ctx.shadowColor = '#7fe3d0'; ctx.shadowBlur = 12;
  g.eb.forEach(e => { ctx.beginPath(); ctx.arc(e.x - cx, e.y - cy, 6, 0, 7); ctx.fill(); }); ctx.shadowBlur = 0;
  drawFx(cx, cy);
  drawPlayer(cx, cy);
  if (g.tmr.shield > 0) { ctx.strokeStyle = '#7fb8ff'; ctx.lineWidth = 3; ctx.globalAlpha = .5 + Math.sin(g.t * 10) * .2; ctx.beginPath(); ctx.arc(g.p.x - cx, g.p.y - cy, 26, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  g.b.forEach(b => { ctx.strokeStyle = b.c; ctx.shadowColor = b.c; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(b.x - cx, b.y - cy); ctx.lineTo(b.x - cx - b.vx * .018, b.y - cy - b.vy * .018); ctx.stroke(); }); ctx.shadowBlur = 0;
  obst.forEach(s => drawObst(s, cx, cy));
  ctx.font = '20px Impact, sans-serif'; ctx.textAlign = 'center';
  g.ft.forEach(f => { ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c; ctx.fillText(f.s, f.x - cx, f.y - cy); }); ctx.globalAlpha = 1;
  minimap();
  if (joy.on) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 60, 0, 7); ctx.stroke();
    const d = Math.hypot(joy.x - joy.ox, joy.y - joy.oy) || 1, m = Math.min(d, 60);
    ctx.fillStyle = 'rgba(255,122,47,.7)'; ctx.beginPath(); ctx.arc(joy.ox + (joy.x - joy.ox) / d * m, joy.oy + (joy.y - joy.oy) / d * m, 26, 0, 7); ctx.fill();
  }
  if (!touch) {
    ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, 11, 0, 7);
    ctx.moveTo(mx - 19, my); ctx.lineTo(mx - 6, my); ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 19, my);
    ctx.moveTo(mx, my - 19); ctx.lineTo(mx, my - 6); ctx.moveTo(mx, my + 6); ctx.lineTo(mx, my + 19); ctx.stroke();
  }
}

/* ---------- Sons (WebAudio) ---------- */
let AC = null, muted = localStorage.getItem('dn_mute') === '1', NB = null;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, d, type, vol, slide, delay) {
  if (muted || !AC) return; const t = AC.currentTime + (delay || 0), o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
  g.gain.setValueAtTime(vol || .1, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + .02);
}
function noise(d, vol, lp) {
  if (muted || !AC) return;
  if (!NB) { NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const c = NB.getChannelData(0); for (let i = 0; i < c.length; i++) c[i] = Math.random() * 2 - 1; }
  const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter(), t = AC.currentTime; s.buffer = NB; f.type = 'lowpass'; f.frequency.value = lp || 2000;
  g.gain.setValueAtTime(vol || .2, t); g.gain.exponentialRampToValueAtTime(.001, t + d); s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t); s.stop(t + d);
}
const _ls = {};
function sfx(n) {
  const t = performance.now(); if ((_ls[n] || 0) > t - 45) return; _ls[n] = t;
  if (n === 'pick') { tone(500, .08, 'square', .08, 2); tone(900, .12, 'square', .08, 1.5, .07); }
  else if (n === 'bonus') { tone(700, .1, 'triangle', .12, 1.8); tone(1200, .15, 'triangle', .1, 1.3, .08); }
  else if (n === 'hurt') { tone(110, .2, 'sawtooth', .18, .5); noise(.12, .2, 800); }
  else if (n === 'hit') noise(.03, .08, 1500);
  else if (n === 'kill') tone(140, .15, 'sawtooth', .1, .4);
  else if (n === 'boom') { noise(.5, .5, 600); tone(70, .4, 'sine', .3, .3); }
  else if (n === 'wave') { tone(110, .6, 'sawtooth', .12, .7); tone(165, .6, 'sawtooth', .08, .7, .15); }
  else if (n === 'over') tone(220, .9, 'sawtooth', .15, .25);
  else if (n === 'dash') noise(.1, .1, 3000);
  else if (n === 'pwpick') { tone(400, .1, 'triangle', .12, 1.6); tone(600, .1, 'triangle', .12, 1.6, .09); tone(900, .22, 'triangle', .12, 1.5, .18); }
  else if (n === 'laser') { tone(1500, .45, 'sawtooth', .12, .15); noise(.3, .12, 5000); }
  else if (n === 'lz') tone(180 + Math.random() * 30, .16, 'sawtooth', .05, 1.2);
  else if (n === 'nova') { noise(.6, .45, 900); tone(160, .6, 'sine', .35, .2); tone(480, .35, 'triangle', .12, .3); }
  else if (n === 'blades') { noise(.35, .18, 6000); tone(300, .4, 'triangle', .1, 3); }
  else if (n === 'whirl') noise(.07, .06, 5000);
  else if (n === 'strike') { tone(1800, .7, 'sine', .12, .12); noise(.2, .1, 6000); }
  else if (n === 'storm') { noise(.3, .2, 3500); tone(260, .4, 'square', .08, 2.2); }
  else if (n === 'shield') { tone(300, .4, 'triangle', .12, 2); tone(600, .3, 'sine', .1, 1.5, .1); }
  else if (n === 'fury') { tone(120, .5, 'sawtooth', .14, 2.5); noise(.3, .15, 3000); }
  else if (n === 'inferno') { noise(.5, .3, 1200); tone(200, .4, 'sawtooth', .1, 1.8); }
  else if (n === 'thunder') { noise(.4, .5, 4000); tone(90, .5, 'sawtooth', .25, .3); tone(1400, .1, 'square', .1, .3); }
  else if (n === 'drain') { tone(500, .5, 'sine', .12, .4); tone(250, .5, 'triangle', .1, .5, .1); }
}
function shotSfx(id) {
  if (id === 'knife') noise(.1, .15, 6000);
  else if (id === 'shotgun') { noise(.25, .4, 1500); tone(90, .2, 'sawtooth', .15, .4); }
  else if (id === 'sniper' || id === 'railgun') { noise(.3, .3, 4000); tone(id === 'railgun' ? 900 : 200, .35, 'sawtooth', .12, id === 'railgun' ? .2 : .3); }
  else if (id === 'plasma') tone(500, .15, 'sawtooth', .08, 2.5);
  else if (id === 'rocket') { noise(.3, .35, 900); tone(70, .3, 'sawtooth', .18, .4); }
  else if (id === 'gauss') { noise(.3, .3, 4500); tone(1100, .35, 'sawtooth', .12, .15); }
  else if (id === 'laser') tone(900, .08, 'sawtooth', .06, .6);
  else if (id === 'disint') tone(420, .12, 'sawtooth', .08, 2);
  else if (id === 'lmg') noise(.05, .16, 2200);
  else if (id === 'duo') { noise(.3, .45, 1300); tone(80, .22, 'sawtooth', .16, .4); }
  else if (id === 'magnum') { noise(.1, .3, 2500); tone(150, .14, 'square', .09, .4); }
  else if (id === 'flame') noise(.12, .12, 900);
  else if (id === 'crossbow') tone(220, .12, 'triangle', .12, .4);
  else if (id === 'mini' || id === 'smg') noise(.04, .12, 2500);
  else { noise(.07, .25, 3000); tone(260, .08, 'square', .06, .4); }
}
const sndLbl = () => document.querySelectorAll('.snd').forEach(b => b.textContent = 'Son : ' + (muted ? 'coupé' : 'activé'));
function toggleSnd() { muted = !muted; try { localStorage.setItem('dn_mute', muted ? '1' : '0'); } catch (e) {} sndLbl(); }
document.querySelectorAll('.snd').forEach(b => b.onclick = toggleSnd);

/* ---------- Dessins : armes, bonus, zombies ---------- */
function wArt(x, id, c) {
  x.fillStyle = c; x.strokeStyle = '#0d1524'; x.lineWidth = 2; x.lineCap = 'round';
  const R = (a, b, w, h) => { x.fillRect(a, b, w, h); x.strokeRect(a, b, w, h); }, dk = () => { x.fillStyle = '#2a3144'; };
  switch (id) {
    case 'knife': R(-26, -3, 15, 7); x.beginPath(); x.moveTo(-11, -9); x.lineTo(27, -1); x.lineTo(-11, 4); x.closePath(); x.fill(); x.stroke(); break;
    case 'pistol': R(-12, -8, 32, 8); dk(); R(-12, 0, 10, 15); break;
    case 'revolver': R(-8, -8, 34, 6); x.beginPath(); x.arc(-3, -4, 8, 0, 7); x.fill(); x.stroke(); dk(); R(-16, 0, 10, 16); break;
    case 'smg': R(-18, -8, 36, 9); dk(); R(-6, 1, 7, 17); R(9, 1, 6, 10); R(-26, -6, 8, 5); break;
    case 'shotgun': R(-28, -7, 56, 5); R(-28, -2, 56, 5); dk(); R(-38, -4, 11, 10); R(2, 4, 16, 5); break;
    case 'rifle': R(-24, -7, 40, 8); R(16, -5, 14, 3); dk(); R(-8, 1, 8, 14); R(-36, -6, 12, 9); R(-14, -13, 20, 5); break;
    case 'sniper': R(-32, -4, 66, 5); dk(); R(-32, 1, 24, 6); R(-20, -14, 24, 6); R(8, 3, 8, 12); break;
    case 'mini': R(-24, -10, 28, 20); for (let i = 0; i < 4; i++) R(4, -10 + i * 5.5, 28, 4); dk(); R(-12, 10, 10, 10); break;
    case 'crossbow': R(-26, -2, 52, 5); x.strokeStyle = c; x.lineWidth = 5; x.beginPath(); x.arc(10, 0, 20, -1.4, 1.4); x.stroke(); x.lineWidth = 2; x.beginPath(); x.moveTo(12, -20); x.lineTo(12, 20); x.stroke(); break;
    case 'flame': R(-18, -6, 34, 12); dk(); R(-28, -13, 11, 26); x.fillStyle = '#ff4d2e'; x.beginPath(); x.moveTo(16, 0); x.lineTo(32, -7); x.lineTo(28, 0); x.lineTo(32, 7); x.closePath(); x.fill(); break;
    case 'plasma': R(-24, -8, 34, 16); x.beginPath(); x.arc(14, 0, 11, 0, 7); x.fillStyle = '#e9d6ff'; x.fill(); x.stroke(); dk(); R(-12, 8, 9, 11); break;
    case 'railgun': R(-32, -9, 66, 5); R(-32, 4, 66, 5); dk(); R(-36, -11, 9, 24); x.fillStyle = '#e8fffa'; x.fillRect(-20, -3, 50, 6); break;
    case 'dual': R(-10, -13, 30, 7); R(-10, 6, 30, 7); dk(); R(-10, -6, 9, 12); break;
    case 'launcher': R(-26, -8, 52, 16); dk(); R(-12, 8, 9, 12); x.fillStyle = '#ffd24a'; R(26, -10, 6, 20); break;
    case 'autoshot': R(-26, -8, 54, 10); R(-26, 2, 54, 5); dk(); R(-36, -6, 10, 12); R(-4, 7, 10, 12); break;
    case 'magnum': R(-6, -8, 36, 7); dk(); R(-16, -2, 12, 17); x.fillStyle = c; R(-8, -11, 6, 4); break;
    case 'duo': R(-26, -9, 52, 5); R(-26, -3, 52, 5); dk(); R(-38, -6, 11, 11); R(-4, 4, 12, 12); break;
    case 'lmg': R(-26, -8, 44, 10); R(18, -6, 14, 5); dk(); R(-8, 2, 8, 12); R(-38, -6, 12, 9); R(-22, -13, 22, 5); break;
    case 'rocket': R(-30, -9, 56, 18); dk(); R(-14, 9, 9, 11); x.fillStyle = '#ff4d2e'; x.beginPath(); x.moveTo(26, -9); x.lineTo(40, 0); x.lineTo(26, 9); x.closePath(); x.fill(); x.stroke(); x.fillStyle = '#ffd24a'; R(-30, -9, 6, 18); break;
    case 'laser': R(-26, -8, 44, 14); x.fillStyle = '#fff0fb'; x.fillRect(-14, -3, 34, 4); x.beginPath(); x.arc(22, -1, 6, 0, 7); x.fill(); x.stroke(); dk(); R(-12, 6, 9, 12); R(-34, -6, 8, 10); break;
    case 'gauss': R(-34, -10, 70, 6); R(-34, 4, 70, 6); dk(); R(-38, -12, 10, 26); x.fillStyle = '#e8fdff'; for (let i = 0; i < 4; i++) x.fillRect(-20 + i * 13, -3, 6, 6); dk(); R(-10, 10, 8, 10); break;
    case 'disint': R(-26, -10, 40, 20); x.beginPath(); x.arc(20, 0, 13, 0, 7); x.fill(); x.stroke(); x.fillStyle = '#f4ffd0'; x.beginPath(); x.arc(20, 0, 6, 0, 7); x.fill(); dk(); R(-14, 10, 9, 11); R(-34, -6, 8, 12); break;
    default: R(-12, -8, 32, 8);
  }
}
function bArt(x, id, c) {
  x.fillStyle = c; x.strokeStyle = c; x.lineWidth = 3; x.lineCap = 'round'; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (id === 'heal') { x.fillRect(-4, -11, 8, 22); x.fillRect(-11, -4, 22, 8); }
  else if (id === 'shield') { x.beginPath(); x.moveTo(-9, -10); x.lineTo(9, -10); x.lineTo(9, 1); x.quadraticCurveTo(9, 10, 0, 13); x.quadraticCurveTo(-9, 10, -9, 1); x.closePath(); x.fill(); }
  else if (id === 'speed') { x.beginPath(); x.moveTo(-9, -9); x.lineTo(0, 0); x.lineTo(-9, 9); x.moveTo(1, -9); x.lineTo(10, 0); x.lineTo(1, 9); x.stroke(); }
  else if (id === 'x2') { x.font = '18px Impact,sans-serif'; x.fillText('×2', 0, 1); }
  else if (id === 'nuke') { x.beginPath(); x.arc(0, 3, 9, 0, 7); x.fill(); x.beginPath(); x.moveTo(4, -5); x.quadraticCurveTo(8, -12, 12, -9); x.stroke(); }
  else if (id === 'magnet') { x.lineWidth = 5; x.beginPath(); x.arc(0, 1, 8, 0, Math.PI); x.moveTo(-8, 1); x.lineTo(-8, -9); x.moveTo(8, 1); x.lineTo(8, -9); x.stroke(); }
  else if (id === 'ammo') { x.fillStyle = '#7a5a30'; x.fillRect(-12, -5, 24, 15); x.fillStyle = c; for (let i = 0; i < 3; i++) x.fillRect(-9 + i * 7, -12, 4, 8); }
  else if (id === 'freeze') { for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(0, -11); x.lineTo(0, 11); x.stroke(); x.rotate(1.047); } }
  else { x.font = '24px Impact,sans-serif'; x.fillText('!', 0, 1); }
}
function zArt(x, r, o, t, fl, sw) {
  x.fillStyle = o.dk; x.beginPath(); x.arc(r * .95, -r * .68 + sw, r * .3, 0, 7); x.arc(r * .95, r * .68 - sw, r * .3, 0, 7); x.fill();
  if (o.big) for (let i = 0; i < 10; i++) { const a = i * .628; x.beginPath(); x.moveTo(Math.cos(a - .15) * r * .95, Math.sin(a - .15) * r * .95); x.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); x.lineTo(Math.cos(a + .15) * r * .95, Math.sin(a + .15) * r * .95); x.fill(); }
  if (t === 'tank') { x.beginPath(); x.arc(0, -r * .85, r * .45, 0, 7); x.arc(0, r * .85, r * .45, 0, 7); x.fill(); }
  x.fillStyle = fl ? '#fff' : o.c; x.strokeStyle = o.dk; x.lineWidth = Math.max(2, r * .12); x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.stroke();
  x.fillStyle = o.dk;
  if (t === 'walk' || t === 'toxic') { x.globalAlpha = .5; x.beginPath(); x.arc(-r * .35, -r * .3, r * .22, 0, 7); x.arc(-r * .2, r * .4, r * .16, 0, 7); x.fill(); x.globalAlpha = 1; }
  if (t === 'brute') { x.fillStyle = '#5a6479'; x.beginPath(); x.arc(0, 0, r * .92, 1.3, 5); x.fill(); x.fillStyle = '#121a2b'; x.fillRect(r * .2, -r * .3, r * .3, r * .6); }
  if (t === 'bomb') { x.fillStyle = '#d33'; x.fillRect(-r * .5, -r * .25, r * .5, r * .5); x.fillStyle = '#ffd24a'; x.fillRect(-r * .35, -r * .08, r * .3, r * .16); }
  if (t === 'spit') { x.fillStyle = '#bfffe9'; x.beginPath(); x.arc(r * .75, 0, r * .2, 0, 7); x.fill(); }
  if (t === 'berserk') { x.strokeStyle = '#220010'; x.lineWidth = 3; x.beginPath(); x.moveTo(r * .2, -r * .6); x.lineTo(r * .6, -r * .2); x.moveTo(r * .2, r * .6); x.lineTo(r * .6, r * .2); x.stroke(); }
  if (t === 'splitter') { x.strokeStyle = o.dk; x.lineWidth = 2; x.beginPath(); x.moveTo(-r, 0); x.lineTo(r * .2, 0); x.stroke(); }
  if (t === 'fast') { x.fillStyle = '#c33'; x.fillRect(-r * .25, -r * .9, r * .22, r * 1.8); }
  if (t === 'leaper') { x.fillStyle = o.dk; x.fillRect(-r * .6, -r * .5, r * .22, r); x.fillRect(-r * .25, -r * .6, r * .22, r * 1.2); }
  if (t === 'scream') { x.strokeStyle = o.dk; x.lineWidth = 2.5; for (const q of [.55, .85]) { x.beginPath(); x.arc(r * .3, 0, r * q, -.7, .7); x.stroke(); } x.fillStyle = '#26121a'; x.beginPath(); x.arc(r * .75, 0, r * .2, 0, 7); x.fill(); }
  if (t === 'necro') { x.fillStyle = '#121a3a'; x.beginPath(); x.arc(0, 0, r * .95, 1.8, 4.5); x.fill(); x.fillStyle = '#9be7ff'; x.beginPath(); x.arc(r * .4, 0, r * .16, 0, 7); x.fill(); }
  if (t === 'medic') { x.fillStyle = '#fff'; x.fillRect(-r * .5, -r * .12, r * .6, r * .24); x.fillRect(-r * .3, -r * .32, r * .24, r * .64); }
  x.fillStyle = '#ff3b3b'; x.beginPath(); x.arc(r * .45, -r * .33, r * .15, 0, 7); x.arc(r * .45, r * .33, r * .15, 0, 7); x.fill();
}
function minimap() {
  const S = 130, x0 = W - S - 16, y0 = H - S - 16, k = S / WORLD; ctx.fillStyle = 'rgba(8,13,25,.6)'; ctx.fillRect(x0, y0, S, S); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.strokeRect(x0, y0, S, S);
  G.z.forEach(z => { ctx.fillStyle = z.big ? '#ff5a5a' : z.c; ctx.fillRect(x0 + z.x * k - 1, y0 + z.y * k - 1, 3, 3); });
  G.dr.forEach(d => { ctx.fillStyle = '#ffd24a'; ctx.fillRect(x0 + d.x * k - 2, y0 + d.y * k - 2, 4, 4); });
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x0 + G.p.x * k, y0 + G.p.y * k, 3, 0, 7); ctx.fill();
}

/* ---------- Boucle principale ---------- */
let last = performance.now();
function loop(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (G.playing && !G.paused) update(dt);
  render(); requestAnimationFrame(loop);
}
showMenu(); requestAnimationFrame(loop); sndLbl(); initOnline().then(() => { renderLB($('lb')); autoLogin(); });

