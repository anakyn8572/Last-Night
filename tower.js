/* =====================================================================
   DERNIÈRE NUIT : MODE « TOWER DEFENSE » (prototype)
   Mêmes mécaniques et même interface que le jeu principal (joueur, armes, munitions,
   bonus, pouvoirs, zombies, pièces, boutique). Les zombies suivent un chemin ; on pose
   des tourelles sur des emplacements pour les empêcher d'atteindre la base au bout.
   Chaque niveau a sa propre carte (taille croissante, chemin, décor et obstacles différents) : voir LEVELS, BIOMES et buildMap().
   Tout est dans ce fichier (style, interface, code). La page HTML ne contient qu'un bouton « Jouer »
   (id="btnPlay") et la balise <script src="tower.js">.
   Connexion à la base de données (comme DN_VILLAGE dans village.js) : le jeu principal (game.js) garde la
   connexion Firebase ; ce fichier lui donne trois fonctions :
     DN_TOWER.open(cfg)   lance le mode en plein écran. cfg = profil du joueur : { name, skin, wl, pl, dw, dz, dp, tl, tst, tbs, money }
                          (tl = niveau débloqué, tst = étoiles par niveau, tbs = meilleurs scores par niveau)
     DN_TOWER.cash(d)     dollars gagnés dans une partie, par source
     DN_TOWER.apply(u, d) ajoute les résultats d'une partie (d) au profil du joueur (u)
   Pendant la partie, le mode envoie au jeu principal :
     { type: 'tower-start', lv }    une partie commence (remet à zéro le compteur d'argent enregistré)
     { type: 'tower-cash', total }  les dollars gagnés jusque-là (enregistrés régulièrement)
     { type: 'tower-end', ... }     le résultat final (niveau, victoire, étoiles, score, vague, zombies, dollars…)
     { type: 'tower-quit' }         le joueur quitte le mode (le jeu principal retire la fenêtre)
   Sans jeu principal (page tower.html seule), la progression est gardée dans le navigateur.
   ===================================================================== */
(function () {
'use strict';
if (window.DN_TOWER) return;
const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.round(n || 0).toLocaleString('fr-FR');
const pick = a => a[Math.floor(Math.random() * a.length)];
function mk(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
const EMB = window.parent !== window;
function post(m) { if (EMB) { try { parent.postMessage(m, '*'); } catch (e) {} } }
const SRC = (document.currentScript && document.currentScript.src) || 'tower.js';
const CFG = window.DN_CFG || {}, HOSTED = EMB && !!window.DN_CFG, NLV = 11, NSTORY = 10;   /* 10 niveaux + le mode infini (niveau 11) */
const num = v => Math.max(0, Number(v) || 0);
const addMap = (to, from) => { for (const k in (from || {})) to[k] = (to[k] || 0) + num(from[k]); };
/* profil du joueur reçu du jeu principal (cfg) : découvertes, niveaux d'armes et de pouvoirs, skin */
const DISC = { w: new Set(CFG.dw || []), z: new Set(CFG.dz || []), p: new Set(CFG.dp || []) };   /* armes / zombies / pouvoirs déjà découverts */
const wlv = id => Math.min(5, (CFG.wl || {})[id] || 0), plv = id => Math.min(5, (CFG.pl || {})[id] || 0);
const pm = id => 1 + .15 * plv(id), pdur = id => PW[id].dur * (1 + .1 * plv(id)), pch = id => PW[id].n + (plv(id) >= 3 ? 1 : 0);
const DEF_SKIN = { shirt: '#ff7a2f', hair: '#2a3144', tone: '#f1d3b0', hs: 1, acc: [] };
const API = {
  /* lance le mode dans une fenêtre plein écran (iframe) : l'interface du mode ne se mélange pas à celle du jeu principal */
  open(cfg) {
    if (document.getElementById('tfr')) return;
    const json = JSON.stringify(cfg || {}).replace(/</g, '\\u003c');
    const doc = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no,viewport-fit=cover"><title>Tower Defense</title><style>body{background:#0d1524}</style></head><body><script>window.DN_CFG=' + json + ';<\/script><script src="' + SRC + '"><\/script></body></html>';
    const f = document.createElement('iframe'); f.id = 'tfr'; f.srcdoc = doc; f.setAttribute('allow', 'autoplay; fullscreen');
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:9999;background:#0d1524';
    f.addEventListener('load', () => { try { f.contentWindow.focus(); } catch (e) {} });
    document.body.appendChild(f);
  },
  /* dollars gagnés dans une partie, par source */
  cash(d) { const o = d.dol || {}, r = { k: Math.floor(num(o.k)), c: Math.floor(num(o.c)), d: Math.floor(num(o.d)), w: Math.floor(num(o.w)) }; r.total = r.k + r.c + r.d + r.w; return r; },
  /* ajoute la partie aux statistiques générales + à celles du Tower Defense. Renvoie true si c'est un nouveau record du niveau. */
  apply(u, d) {
    u.games = (u.games || 0) + 1; u.kills = (u.kills || 0) + num(d.kills); u.total = (u.total || 0) + num(d.score);
    u.dist = (u.dist || 0) + num(d.dist); u.tp = (u.tp || 0) + num(d.t); u.shots = (u.shots || 0) + num(d.shots);
    u.tg = (u.tg || 0) + 1; u.tk = (u.tk || 0) + num(d.kills);
    u.zk = u.zk || {}; addMap(u.zk, d.zk); u.wk = u.wk || {}; addMap(u.wk, d.wk); u.pk = u.pk || {}; addMap(u.pk, d.pu); u.bc = Math.max(u.bc || 0, num(d.bc));
    const nd = d.nd || {};
    u.dw = [...new Set([...(u.dw || []), ...(nd.w || [])])]; u.dz = [...new Set([...(u.dz || []), ...(nd.z || [])])]; u.dp = [...new Set([...(u.dp || []), ...(nd.p || [])])];
    const lv = Math.max(1, Math.min(NLV, Math.floor(num(d.lv)) || 1)), key = 'l' + lv;
    u.tl = Math.max(u.tl || 1, Math.min(NLV, Math.max(1, Math.floor(num(d.tl)))));
    if (d.win) { u.tst = u.tst || {}; u.tst[key] = Math.max(u.tst[key] || 0, Math.min(3, Math.floor(num(d.stars)))); }
    if (lv === NLV) u.tbw = Math.max(u.tbw || 0, Math.floor(num(d.wave)));   /* meilleure vague du mode infini */
    u.tbs = u.tbs || {}; const sc = Math.floor(num(d.score)); if (sc > (u.tbs[key] || 0)) { u.tbs[key] = sc; return true; } return false;
  }
};
/* chargé par le jeu principal (aucune page de jeu ici) : on ne donne que les fonctions ci-dessus */
/* Page du jeu principal (menu avec #mav / #auth, ou window.DN_HOST) : on ne donne que l'API. Sans cette garde, le mode se lançait aussi dans la page du menu (elle contient un bouton #btnPlay), effaçait le menu principal et le remplaçait par le sien. */
const ON_MAIN = !window.DN_CFG && (!!window.DN_HOST || !!document.getElementById('mav') || !!document.getElementById('auth'));
if (ON_MAIN || (!document.getElementById('btnPlay') && !window.DN_CFG)) { window.DN_TOWER = API; return; }

/* ---------- Réglages du mode (à modifier facilement) ---------- */
/* La carte change à chaque niveau (voir buildMap plus bas) : taille, chemin, base, boutique, emplacements, obstacles et décor. */
const PATHW = 76;   /* largeur du chemin */
let WW = 1500, WH = 900, BH = 150;   /* taille de la carte · demi-hauteur de la base */
let PATH = [], SPAWN = [-80, 0], BASEP = { x: 0, y: 0 }, PSTART = { x: 0, y: 0 };   /* chemin des zombies · entrée · base · départ du joueur */
let SHOP = { x: 0, y: 0, w: 82, h: 76, use: 140, name: 'BOUTIQUE' };
const DEMO_T = 1.0;            /* secondes à maintenir X sur une tourelle pour la détruire */
const START_CASH = 0;          /* pièces au départ : on commence toujours avec 0 (voir « cash » dans LEVELS) */
const BASE_HP = 100;           /* PV de la base : chaque zombie qui arrive au bout lui en retire */
const WAVE_BONUS = 70, WAVE_BONUS_STEP = 12;   /* pièces gagnées à la fin de chaque vague : base + pas × vague */
const BREAK = 6;               /* secondes entre deux vagues (touche N : lancer la suivante tout de suite) */
const SPEED = 1.5;             /* vitesse des zombies (× leur vitesse de base) */
const RESPAWN = 6, ZCAP = 170, CASH_WAVE = .04;   /* délai de réapparition · max de zombies · hausse des gains par vague */

/* ---------- Style (repris du jeu principal) ---------- */
const CSS = `:root{--bg:#0d1524;--panel:#16233a;--line:#2a3d5e;--txt:#eef1f6;--mute:#8fa0bd;--acc:#ff7a2f;--acc2:#ffb347;--bad:#ff4d5e;--ok:#5fd6a0}
*{box-sizing:border-box;margin:0}
html,body{height:100%;overflow:hidden;background:var(--bg);color:var(--txt);font-family:"Segoe UI",system-ui,sans-serif;-webkit-user-select:none;user-select:none;touch-action:none;color-scheme:dark}
#c{position:fixed;inset:0;width:100%;height:100%;display:block}
#vig{position:fixed;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 45%,rgba(4,8,18,.78) 100%)}
.hide{display:none!important}
.lvg.two{grid-template-columns:repeat(2,minmax(0,1fr));max-width:640px;margin:14px auto}.lv.big{padding:28px 12px}.lv.big .ln{font-size:70px}.lv.big .lt{font-size:24px}
#mm{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));pointer-events:none;z-index:5;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.5)}
.lv.inf{border-color:var(--acc2);box-shadow:0 0 18px rgba(255,179,71,.28)}
h1,h2,.big,.btn,#hud b,#banner{font-family:Impact,"Arial Black","Haettenschweiler",sans-serif;font-weight:400;letter-spacing:.02em}
.screen{position:fixed;inset:0;display:flex;gap:24px;align-items:center;justify-content:center;padding:20px;background:rgba(8,13,25,.72);backdrop-filter:blur(6px);overflow:auto;flex-wrap:wrap;z-index:20}
.card{background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:28px;width:min(380px,100%);box-shadow:0 24px 60px rgba(0,0,0,.5)}
.card.main{text-align:center}
h1{font-size:64px;line-height:.92;color:var(--acc);text-transform:uppercase;text-shadow:0 0 28px rgba(255,122,47,.45);margin-bottom:12px}
h2{font-size:28px;margin-bottom:14px;color:var(--acc2)}
.sub{color:var(--mute);line-height:1.45;margin-bottom:18px}
.note{color:var(--mute);font-size:13px;line-height:1.45}
.btn{display:block;width:100%;margin-top:10px;padding:14px;border:0;border-radius:12px;background:var(--acc);color:#1a0d02;font-size:22px;cursor:pointer;box-shadow:0 6px 0 #b4501a;transition:transform .08s,box-shadow .08s}
.btn:hover{background:var(--acc2)}
.btn:active{transform:translateY(5px);box-shadow:0 1px 0 #b4501a}
.btn.ghost{background:transparent;color:var(--txt);border:1px solid var(--line);box-shadow:none;font-size:17px}
.btn.ghost:hover{border-color:var(--acc);background:transparent}
.big{font-size:84px;color:var(--acc);line-height:1;margin-bottom:6px}
#fd{color:var(--mute);margin-bottom:10px;line-height:1.5}
.gain{color:var(--acc2);margin-bottom:10px;line-height:1.5;font-size:14px}
.tabs{display:flex;background:#0e1a2e;border-radius:12px;padding:4px;margin-bottom:14px}
.tabs button{flex:1;padding:10px;border:0;border-radius:9px;background:transparent;color:var(--mute);font:400 20px Impact,sans-serif;cursor:pointer}
.tabs button.on{background:var(--acc);color:#1a0d02}
/* HUD */
#hud{position:fixed;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;padding:14px 18px;pointer-events:none;gap:10px;z-index:10}
#hud b{font-size:38px;display:block;line-height:1;text-shadow:0 2px 10px #000}
#hud span,#hud small{font-size:14px;color:var(--txt)}
#hud .hl{text-align:left}#hud .hr{text-align:right}#hud .hc{flex:1;max-width:320px;text-align:center}
#hud .hc small{display:block}#hud .hc small b,#hud .hr small b{display:inline;font-size:inherit;color:var(--acc2);text-shadow:none}
#wv{font-family:Impact,"Arial Black",sans-serif;font-size:34px;color:#fff;text-shadow:0 2px 10px #000}
#vbar{position:fixed;top:calc(78px + env(safe-area-inset-top,0px));left:0;right:0;display:flex;justify-content:center;gap:22px;pointer-events:none;flex-wrap:wrap;padding:0 12px;z-index:10}
#vbar span{font-size:14px;color:var(--txt);background:rgba(8,13,25,.6);border:1px solid rgba(42,61,94,.8);border-radius:10px;padding:4px 12px;text-shadow:0 1px 4px #000}
#vbar b{font-family:Impact,"Arial Black",sans-serif;font-weight:400;letter-spacing:.02em;color:var(--acc2);margin-left:6px;font-size:17px}
#vbar .money{border-color:rgba(255,210,74,.65);background:rgba(40,30,6,.62)}#vbar .money b{color:#ffd24a}#vbar .money i{font-style:normal}
#vbar .bhp{border-color:rgba(255,77,94,.6)}
#hbot{position:fixed;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:6px;padding:0 16px calc(16px + env(safe-area-inset-bottom,0px));pointer-events:none;z-index:10}
#bon{color:var(--acc2);font-size:14px;min-height:16px;text-shadow:0 2px 6px #000}
#hrow{display:flex;align-items:center;gap:10px;width:min(520px,100%)}
#hpb{position:relative;flex:1;height:18px;border-radius:9px;background:rgba(0,0,0,.55);border:1px solid var(--line);overflow:hidden}
#hp{display:block;height:100%;width:100%;background:linear-gradient(90deg,var(--bad),var(--ok));transition:width .15s}
#hpn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:normal 13px Impact,sans-serif;text-shadow:0 1px 3px #000}
#pw{position:relative;flex:none;width:70px;height:64px;border-radius:12px;border:2px solid var(--line);background:rgba(0,0,0,.55);pointer-events:auto;cursor:pointer;overflow:hidden}
#pwc{position:absolute;inset:0;width:100%;height:100%;display:block}
#pwk{position:absolute;left:0;right:0;top:2px;text-align:center;font-size:9px;color:var(--mute);z-index:1}
#pwn{position:absolute;left:0;right:0;bottom:2px;text-align:center;font:400 10px Impact,sans-serif;color:#fff;text-shadow:0 1px 3px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px;z-index:1}
#pw.on{border-color:var(--acc2);box-shadow:0 0 14px rgba(255,179,71,.6)}#pw.act{border-color:var(--bad);box-shadow:0 0 16px rgba(255,77,94,.7)}
#inv{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;width:min(520px,100%);padding:4px;border-radius:12px;background:rgba(8,13,25,.5);border:1px solid rgba(42,61,94,.7);backdrop-filter:blur(4px);pointer-events:auto}
#inv:empty{display:none}
#inv .ic{display:flex;align-items:center;gap:5px;padding:2px 7px 2px 5px;border-radius:8px;border:1px solid transparent;background:rgba(22,35,58,.75);color:var(--mute);font-size:10px;line-height:1.3;cursor:pointer}
#inv .ic:hover{border-color:var(--line);color:var(--txt)}
#inv .ik{font-style:normal;font-size:9px;color:var(--wc,var(--acc2));opacity:.85;min-width:7px;text-align:center}
#inv .in{white-space:nowrap;max-width:110px;overflow:hidden;text-overflow:ellipsis}
#inv .ia{font:400 11px Impact,sans-serif;color:var(--txt);letter-spacing:.03em;min-width:12px;text-align:right}
#inv .ic.sel{border-color:var(--wc,var(--acc2));color:#fff;background:rgba(40,60,96,.92);box-shadow:0 0 0 1px var(--wc,var(--acc2))}
#inv .ic.low .ia{color:var(--bad)}
#banner{position:fixed;top:30%;left:0;right:0;text-align:center;font-size:clamp(40px,9vw,92px);color:#fff;text-shadow:0 0 30px var(--acc),0 4px 0 #000;pointer-events:none;animation:ban 2.4s ease both;z-index:10}
@keyframes ban{0%{opacity:0;transform:scale(1.5)}15%{opacity:1;transform:scale(1)}80%{opacity:1}100%{opacity:0}}
body.ingame,body.ingame *{cursor:none!important}
body.ingame #hlp,body.ingame #dem,body.ingame #pw,body.ingame #inv,body.ingame #inv *,body.ingame #shp,body.ingame #shop,body.ingame #shop *,body.ingame #pause,body.ingame #pause *{cursor:pointer!important}
/* pièces + boutique */
.coin{display:inline-block;width:17px;height:17px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6bf 0,#ffd24a 42%,#d99a12 100%);border:2px solid #9a6a08;box-shadow:inset 0 0 0 2px rgba(255,255,255,.22),0 0 8px rgba(255,210,74,.5);vertical-align:-3px;margin:0 6px 0 0;flex:none;position:relative}
.coin::after{content:"";position:absolute;inset:3px;border-radius:50%;border:1.5px solid rgba(154,106,8,.55)}
.coin.lg{width:30px;height:30px;vertical-align:-7px;margin-right:8px}
.card.shop{width:min(960px,100%);padding:26px 28px;background:linear-gradient(180deg,#182a46 0,#121f36 100%);border-color:#34507a}
.shh{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.shh h2{margin:0;font-size:38px}
.purse{display:flex;align-items:center;font:400 34px Impact,sans-serif;color:#ffd24a;text-shadow:0 0 18px rgba(255,210,74,.4);padding:6px 16px;border-radius:14px;background:rgba(255,210,74,.08);border:1px solid rgba(255,210,74,.35)}
.shl{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:12px;max-height:60vh;overflow:auto;margin:12px 0 4px;padding:2px 4px 2px 0;touch-action:pan-y}
.shl>.note{grid-column:1/-1}
@media(max-width:700px){.shl{grid-template-columns:1fr}}
.it{display:flex;gap:14px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(160deg,#13233d,#0d1a2f)}
.it.can:hover{border-color:#ffb347}
.it canvas{width:80px;height:80px;flex:none;border-radius:14px;background:radial-gradient(circle at 50% 40%,#1a2d4a,#0a1220)}
.it .tx{flex:1;min-width:0}.it .tx b{display:block;font:400 20px Impact,sans-serif;color:var(--txt);letter-spacing:.02em}
.it .tx small{display:block;color:var(--mute);font-size:13px;line-height:1.35;margin-top:4px}
.buy{flex:none;display:flex;align-items:center;gap:4px;padding:10px 16px;border-radius:12px;border:1px solid #b8860b;background:linear-gradient(180deg,rgba(255,210,74,.26),rgba(255,210,74,.1));color:#ffd24a;font:400 18px Impact,sans-serif;cursor:pointer;white-space:nowrap;box-shadow:0 3px 0 rgba(120,80,6,.55)}
.buy:hover:not(:disabled){background:linear-gradient(180deg,rgba(255,210,74,.42),rgba(255,210,74,.2))}
.buy:active:not(:disabled){transform:translateY(2px);box-shadow:none}
.buy:disabled{opacity:.45;cursor:default;border-color:var(--line);color:var(--mute);background:transparent;box-shadow:none}
.buy .coin{width:14px;height:14px;margin:0 0 0 3px;vertical-align:-2px}
#shp{position:fixed;top:calc(124px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:10;display:flex;align-items:center;gap:10px;padding:8px 16px;border-radius:12px;border:1px solid #ffd24a;background:rgba(40,30,6,.78);color:#ffd24a;font:400 18px Impact,sans-serif;cursor:pointer;box-shadow:0 0 18px rgba(255,210,74,.35)}
#dem{position:fixed;top:calc(176px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:10;display:flex;align-items:center;gap:10px;padding:8px 16px;border-radius:12px;border:1px solid #ff4d5e;background:rgba(58,10,20,.82);color:#ff8a96;font:400 18px Impact,sans-serif;cursor:pointer;box-shadow:0 0 18px rgba(255,77,94,.35);overflow:hidden;white-space:nowrap}
#dem kbd{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;background:#ff4d5e;color:#2a0a10;font:400 14px Impact,sans-serif}
#hlp{position:fixed;left:16px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:10;display:flex;align-items:center;gap:10px;padding:6px 14px 6px 6px;border-radius:999px;border:1px solid #2a3a55;background:rgba(12,19,34,.88);color:#eef1f6;font:600 16px "Segoe UI",system-ui,sans-serif;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.45);backdrop-filter:blur(4px)}
#hlp:hover{border-color:#4a6290}
#hlp i{width:34px;height:34px;border-radius:50%;background:#ff7a2f;color:#1a0d02;display:grid;place-items:center;font:700 20px "Segoe UI",system-ui,sans-serif;font-style:normal}
#hlp kbd{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:5px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);color:#c6cfdf;font:600 12px "Segoe UI",system-ui,sans-serif}
.card.help{width:min(580px,100%);text-align:left}
.card.help ul{list-style:none;padding:0;margin:14px 0 6px;display:grid;gap:10px;font-size:15px;line-height:1.4}
.card.help li{display:flex;gap:12px;align-items:baseline}
.card.help li b{flex:none;min-width:104px;color:var(--acc2);font:400 16px Impact,sans-serif;letter-spacing:.02em}
.card.help kbd{display:inline-block;min-width:20px;padding:0 5px;border-radius:5px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);color:#dfe6f3;font:600 12px "Segoe UI",system-ui,sans-serif;text-align:center}
#shp kbd{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:6px;background:#ffd24a;color:#2a1c10;font:400 14px Impact,sans-serif}
@media(max-width:600px){h1{font-size:48px}.card{padding:20px}}
.card.lvm{width:min(1000px,100%);text-align:center}
.lvg{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:6px 0 14px}
.lv{display:flex;flex-direction:column;align-items:center;gap:3px;padding:12px 8px;border:1px solid var(--line);border-radius:14px;background:#0f1b30;color:var(--txt);cursor:pointer;font:inherit;text-align:center}
.lv:hover:not(:disabled){border-color:var(--acc);background:#14233d}
.lv.lock{opacity:.45;cursor:not-allowed}
.lv .ln{font:400 38px Impact,sans-serif;color:var(--acc);line-height:1}
.lv .lt{font:400 17px Impact,sans-serif}
.lv small{color:var(--mute);font-size:12px;line-height:1.3}
.lv .nw{color:var(--ok)}
.lv .stars{font-style:normal;color:#ffd24a;letter-spacing:2px}
@media(max-width:820px){.lvg{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(prefers-reduced-motion:reduce){#banner{animation:none}}`;
(function () { const s = document.createElement('style'); s.id = 'td-css'; s.textContent = CSS; document.head.appendChild(s); })();

/* ---------- Interface (créée par le script) ---------- */
const UI = `<canvas id="c"></canvas><div id="vig"></div><canvas id="mm" class="hide"></canvas>
<div id="hud" class="hide">
  <div class="hl"><span>Zombies tués</span><b id="kl">0</b></div>
  <div class="hc"><small>Zombies restants : <b id="rem">0</b></small><div id="wv">Vague 1</div></div>
  <div class="hr"><span class="hide">Points</span><b id="sc" class="hide">0</b><small>Argent <b id="usd">0</b> $</small></div>
</div>
<div id="vbar" class="hide"><span class="bhp">Base<b id="vb">100 / 100</b></span><span id="vm" class="money">Pièces<b><i class="coin"></i><i id="cash">0</i></b></span></div>
<div id="hbot" class="hide"><small id="bon"></small><div id="hrow"><div id="hpb"><i id="hp"></i><em id="hpn">100 / 100</em></div><div id="pw" class="hide" role="button" aria-label="Utiliser le pouvoir"><span id="pwk">Clic droit</span><canvas id="pwc" width="70" height="64"></canvas><span id="pwn">Aucun</span></div></div><div id="inv" aria-label="Armes"></div></div>
<div id="banner" class="hide"></div>
<button id="hlp" class="hide" type="button"><i>?</i><span>Comment jouer</span><kbd>I</kbd></button>
<section id="help" class="screen hide"><div class="card help"><h2>Comment jouer</h2><ul>
  <li><b>Objectif</b><span>Tenez toutes les vagues sans que la base soit détruite (elle peut être abîmée). Réussir un niveau débloque le suivant.</span></li>
  <li><b>Déplacement</b><span><kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> / <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou les flèches · <kbd>Maj</kbd> pour foncer.</span></li>
  <li><b>Tirer</b><span>Visez à la souris, clic gauche pour tirer. Les munitions sont infinies. Molette, <kbd>Q</kbd> ou <kbd>1</kbd>-<kbd>9</kbd> pour changer d’arme.</span></li>
  <li><b>Tourelles</b><span>Approchez-vous d’une dalle jaune et appuyez sur <kbd>B</kbd> pour construire ou améliorer. Maintenez <kbd>X</kbd> sur une tourelle pour la détruire (50 % remboursés).</span></li>
  <li><b>Boutique</b><span>Près du bâtiment, <kbd>B</kbd> : armes, réparation de la base, soins et améliorations. C’est le seul endroit pour se soigner.</span></li>
  <li><b>Argent</b><span>On commence avec 0 pièce : tuez des zombies et tenez les vagues pour en gagner. La base ne se répare pas toute seule.</span></li>
  <li><b>Autres touches</b><span><kbd>N</kbd> vague suivante tout de suite · <kbd>P</kbd> / <kbd>Échap</kbd> pause · <kbd>M</kbd> son · <kbd>I</kbd> cette aide.</span></li>
</ul><button id="btnHelpClose" class="btn">Compris</button></div></section>
<button id="shp" class="hide" type="button"><span id="shpT">Boutique</span><kbd>B</kbd></button>
<button id="dem" class="hide" type="button"><span id="demT">Démolir</span><kbd>X</kbd></button>
<section id="over" class="screen hide"><div class="card"><h2 id="ovT">La base est tombée</h2><div class="big" id="fs">0</div><p id="fd"></p><p id="fc" class="gain"></p>
  <button id="btnNext" class="btn hide">Niveau suivant</button><button id="btnAgain" class="btn">Rejouer</button><button id="btnMenu" class="btn ghost">Niveaux</button></div></section>
<section id="pause" class="screen hide"><div class="card"><h2>Pause</h2><button id="btnResume" class="btn">Reprendre</button><button class="btn ghost snd"></button><button id="btnQuit" class="btn ghost">Abandonner</button></div></section>
<section id="shop" class="screen hide"><div class="card wide shop">
  <div class="shh"><h2 id="shT">Boutique</h2><div class="purse"><i class="coin lg"></i><b id="shc">0</b></div></div>
  <div class="tabs" id="shTabs"><button data-t="w" class="on">Armes</button><button data-t="v">Base et soins</button><button data-t="u">Améliorations</button><button data-t="m" class="hide">Carte</button></div>
  <div id="shL" class="shl"></div>
  <button id="btnShopClose" class="btn ghost">Fermer (B)</button>
</div></section>`;
{ const w = document.createElement('div'); w.innerHTML = UI; while (w.firstChild) document.body.appendChild(w.firstChild); }

/* ---------- Canvas ---------- */
const cv = $('c'), ctx = cv.getContext('2d', { alpha: false });
let W = 0, H = 0, DPR = 1;
function resize() { DPR = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight; cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); }
addEventListener('resize', resize); resize();

/* ---------- Cartes : chaque niveau a sa taille, son chemin, ses emplacements et son décor ---------- */
function segDist(px, py, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy; const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1); return Math.hypot(px - a[0] - t * dx, py - a[1] - t * dy); }
function pathDist(x, y) { let m = 1e9; for (let i = 1; i < PATH.length; i++) m = Math.min(m, segDist(x, y, PATH[i - 1], PATH[i])); return m; }
/* hasard « gradué » : une carte est toujours la même pour un niveau donné */
const prng = seed => { let a = seed | 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
let SR = prng(1);
const sr = (a, b) => a + SR() * (b - a);
const wpick = l => { let s = 0; for (const e of l) s += e[1]; let r = SR() * s; for (const e of l) if ((r -= e[1]) < 0) return e[0]; return l[0][0]; };

/* Forme du chemin de chaque niveau : S n = escalier à n virages, Z = serpentin en 3 couloirs */
const PSHAPE = ['S1', 'S2', 'S3', 'Z', 'S4', 'Z', 'S5', 'Z', 'S5', 'Z'];
/* Décors (un par niveau). g = couleur du sol [teinte, variation, saturation, clarté, variation] · tc arbres · rc rochers · wc murs · pool mare/lave/glace
   det = petits détails au sol (sans collision) · obs = obstacles SOLIDES (type, fréquence) */
const BIOMES = {
  meadow: { label: 'Prairie', void: '#0a1710', g: [105, 25, 30, 15, 6], blot: 'rgba(120,200,110,.08)', tint: 'rgba(0,10,30,.05)',
    path: ['#2c2014', '#6e5232', '#8a6a40'], dash: 'rgba(255,235,190,.16)', pad: ['rgba(70,82,100,.55)', 'rgba(30,38,52,.9)'],
    tc: ['#17402f', '#23694c', '#34896a'], rc: ['#4a5468', '#6a7690', '#8a96ae'], wc: ['#3c4250', '#5b6578', '#7b86a0'],
    det: [{ s: 'blade', c: 'rgba(170,230,150,1)', a: [3, 8], p: .7 }, { s: 'dot', c: ['#f5f0c0', '#ffd24a', '#ff9ac0', '#b8d8ff'], a: [1.4, 2.4], p: .1 }],
    obs: [['tree', 6], ['rock', 3], ['boulder', .5]] },
  village: { label: 'Village en ruine', void: '#14110d', g: [58, 26, 16, 17, 6], blot: 'rgba(160,140,90,.09)', tint: 'rgba(40,20,0,.08)',
    path: ['#2a2018', '#64503a', '#83694a'], dash: 'rgba(255,235,190,.14)', pad: ['rgba(90,84,74,.6)', 'rgba(36,32,28,.9)'],
    tc: ['#2f3a1c', '#4a5a28', '#6a7c38'], rc: ['#4a4640', '#6d675e', '#908a7e'], wc: ['#3a3632', '#6d665d', '#8f887e'], roof: '#6b3a2a', dc: '#33291f',
    det: [{ s: 'rect', c: ['#4a443c', '#5b5448', '#2e2a26', '#6b3a2a'], a: [2, 6], p: .25 }, { s: 'line', c: 'rgba(20,14,8,1)', a: [8, 22], p: .1 }, { s: 'blade', c: 'rgba(150,170,90,1)', a: [3, 7], p: .25 }],
    obs: [['house', 6], ['wall', 3], ['fence', 3], ['crate', 2], ['dead', 2], ['rock', 1], ['lamp', .6]] },
  desert: { label: 'Désert', void: '#1a1208', g: [34, 10, 46, 30, 6], blot: 'rgba(255,225,150,.1)', tint: 'rgba(255,150,30,.07)',
    path: ['#4a3418', '#8a6a3a', '#a8844c'], dash: 'rgba(255,235,190,.12)', pad: ['rgba(120,100,70,.6)', 'rgba(60,45,25,.9)'],
    tc: ['#6a5a2a', '#8a7a3a', '#a89a50'], rc: ['#6e4a2a', '#a07040', '#c89a5c'], wc: ['#7a5c36', '#b08a56', '#d0aa72'], dc: '#4a3826',
    det: [{ s: 'arc', c: 'rgba(255,236,180,1)', a: [14, 42], p: .35 }, { s: 'dot', c: ['#7a5a30', '#c8a870', '#5a4220'], a: [1.2, 2.6], p: .18 }],
    obs: [['cactus', 5], ['rock', 3], ['boulder', 1], ['dead', 1.5], ['wall', 1]] },
  forest: { label: 'Forêt noire', void: '#050c0a', g: [150, 20, 22, 8, 5], blot: 'rgba(60,140,110,.07)', tint: 'rgba(0,10,30,.2)',
    path: ['#1c1610', '#4a3826', '#6a5238'], dash: 'rgba(255,235,190,.1)', pad: ['rgba(60,80,80,.55)', 'rgba(20,30,32,.9)'],
    tc: ['#0f2a20', '#17402f', '#245c46'], pc: ['#0c2219', '#14392a', '#1f5440'], rc: ['#2c3a36', '#44574f', '#5f776c'], wc: ['#2c3a36', '#44574f', '#5f776c'], dc: '#2a211a',
    det: [{ s: 'blade', c: 'rgba(120,200,170,1)', a: [3, 8], p: .5 }, { s: 'dot', c: ['#7fe3d0', '#a8ffcb', '#5fb89e'], a: [1.2, 2.2], p: .06 }, { s: 'dot', c: 'rgba(10,30,22,.5)', a: [6, 16], p: .12 }],
    obs: [['pine', 7], ['tree', 2], ['rock', 2], ['dead', 1], ['boulder', .4]] },
  mountain: { label: 'Montagnes', void: '#0c1016', g: [215, 14, 9, 22, 6], blot: 'rgba(200,215,240,.09)', tint: 'rgba(120,150,200,.06)', snow: true,
    path: ['#2a241e', '#5e5448', '#7c705e'], dash: 'rgba(255,235,190,.12)', pad: ['rgba(90,100,120,.6)', 'rgba(30,36,48,.9)'],
    tc: ['#22503f', '#2f6b55', '#3f8a6e'], pc: ['#17342c', '#22503f', '#2f6b55'], rc: ['#454a56', '#6b7282', '#939bac'], wc: ['#454a56', '#6b7282', '#939bac'], dc: '#3a3330',
    det: [{ s: 'dot', c: ['#5a6070', '#7a8294', '#3a3f4a'], a: [1.4, 3.4], p: .35 }, { s: 'dot', c: 'rgba(235,243,255,.55)', a: [3, 9], p: .08 }],
    obs: [['boulder', 4], ['rock', 5], ['ridge', 2], ['pine', 2], ['dead', .5]] },
  ruins: { label: 'Ruines antiques', void: '#100f0c', g: [45, 12, 8, 21, 6], blot: 'rgba(200,190,150,.08)', tint: 'rgba(40,30,0,.06)', grid: true,
    path: ['#2a251d', '#5a5142', '#7a6e58'], dash: 'rgba(255,235,190,.12)', pad: ['rgba(100,96,84,.6)', 'rgba(36,34,28,.9)'],
    tc: ['#2f3a1c', '#4a5a28', '#6a7c38'], rc: ['#4b4a44', '#7d7b70', '#a7a597'], wc: ['#4b4a44', '#7d7b70', '#a7a597'], dc: '#3a3328',
    det: [{ s: 'line', c: 'rgba(0,0,0,1)', a: [8, 30], p: .3 }, { s: 'rect', c: ['#6a685c', '#4a4840', '#8a8878'], a: [2, 7], p: .2 }, { s: 'blade', c: 'rgba(150,180,90,1)', a: [3, 7], p: .12 }],
    obs: [['pillar', 5], ['wall', 5], ['rock', 2], ['tree', 1], ['boulder', .5], ['crate', .5]] },
  swamp: { label: 'Marais', void: '#080d05', g: [88, 14, 26, 13, 5], blot: 'rgba(110,150,60,.1)', tint: 'rgba(40,80,20,.1)',
    path: ['#1f1a10', '#4a3e22', '#645530'], dash: 'rgba(230,220,160,.1)', pad: ['rgba(70,84,60,.55)', 'rgba(24,32,20,.9)'],
    tc: ['#26391a', '#3f5c24', '#617f34'], rc: ['#2c3a30', '#45584a', '#62786a'], wc: ['#2c3a30', '#45584a', '#62786a'], dc: '#3b3a22',
    pool: ['#2a2f14', '#2f4a3a', '#5b8a6a', 'water'],
    det: [{ s: 'reed', c: 'rgba(150,190,70,1)', a: [6, 16], p: .5 }, { s: 'dot', c: 'rgba(20,28,10,.55)', a: [5, 14], p: .14 }],
    obs: [['pool', 5], ['dead', 4], ['tree', 2], ['rock', 1], ['boulder', .3]] },
  snow: { label: 'Toundra gelée', void: '#0c1522', g: [205, 10, 22, 60, 6], blot: 'rgba(255,255,255,.14)', tint: 'rgba(120,170,255,.06)', snow: true,
    path: ['#2d3646', '#55607a', '#78849c'], dash: 'rgba(255,255,255,.18)', pad: ['rgba(70,90,120,.6)', 'rgba(30,40,60,.9)'],
    tc: ['#1c4a44', '#2a6a5c', '#3e8a78'], pc: ['#1c4a44', '#2a6a5c', '#3e8a78'], rc: ['#7d8aa0', '#a9b6cc', '#dbe6f5'], wc: ['#7d8aa0', '#a9b6cc', '#dbe6f5'], dc: '#4a4038',
    pool: ['#4a6a8a', '#a8d4f0', '#e8f6ff', 'ice'],
    det: [{ s: 'dot', c: 'rgba(255,255,255,.55)', a: [2, 6], p: .35 }, { s: 'arc', c: 'rgba(255,255,255,1)', a: [10, 30], p: .12 }],
    obs: [['pine', 5], ['rock', 3], ['pool', 3], ['boulder', 1], ['dead', 1]] },
  hell: { label: 'Terres de feu', void: '#0a0404', g: [8, 14, 34, 10, 5], blot: 'rgba(255,80,30,.08)', tint: 'rgba(255,30,0,.07)',
    path: ['#120a0a', '#3c2420', '#5a352c'], dash: 'rgba(255,160,90,.14)', pad: ['rgba(90,50,45,.6)', 'rgba(30,14,14,.95)'],
    tc: ['#1a1010', '#2a1818', '#3a2420'], rc: ['#1e1414', '#382524', '#573a35'], wc: ['#1e1414', '#3a2a28', '#5c423c'], dc: '#150d0d',
    pool: ['#2a1008', '#ff5a1a', '#ffd27a', 'lava'],
    det: [{ s: 'dot', c: ['#ff7a2f', '#ffb347', '#ff4d2a'], a: [1, 2.2], p: .2 }, { s: 'line', c: 'rgba(255,90,30,1)', a: [8, 26], p: .08 }, { s: 'line', c: 'rgba(0,0,0,1)', a: [8, 26], p: .2 }],
    obs: [['pool', 5], ['rock', 5], ['boulder', 2], ['dead', 2], ['pillar', 1]] },
  city: { label: 'Ville en ruine', void: '#07090d', g: [218, 8, 8, 12, 4], blot: 'rgba(150,170,200,.06)', tint: 'rgba(10,20,50,.12)', grid: true,
    path: ['#07090d', '#232830', '#323944'], dash: 'rgba(255,215,90,.45)', pad: ['rgba(80,90,110,.55)', 'rgba(25,30,40,.9)'],
    tc: ['#1c2a1c', '#2c4026', '#3e5a34'], rc: ['#2a2e36', '#4a505c', '#6a7282'], wc: ['#2a2e36', '#4a505c', '#6a7282'], roof: '#3a3f48', dc: '#2a2622',
    det: [{ s: 'line', c: 'rgba(0,0,0,1)', a: [8, 30], p: .35 }, { s: 'rect', c: ['#3a404a', '#2a2e36', '#555c68'], a: [2, 6], p: .2 }, { s: 'dot', c: 'rgba(0,0,0,.4)', a: [4, 10], p: .06 }],
    obs: [['car', 4], ['barrier', 3], ['wall', 2], ['house', 2], ['lamp', 1.5], ['crate', 2], ['rock', .5]] },
  wasteland: { label: 'Terres désolées', void: '#0a0710', g: [268, 18, 14, 13, 5], blot: 'rgba(170,120,220,.07)', tint: 'rgba(30,0,50,.12)',
    path: ['#0a0710', '#2c2436', '#3b3248'], dash: 'rgba(210,170,255,.32)', pad: ['rgba(90,80,120,.55)', 'rgba(28,22,44,.9)'],
    tc: ['#2a2238', '#3f3454', '#574a72'], rc: ['#2e2a3a', '#4e4862', '#6e6888'], wc: ['#2e2a3a', '#4e4862', '#6e6888'], roof: '#3c3350', dc: '#2a2030',
    det: [{ s: 'line', c: 'rgba(0,0,0,1)', a: [8, 30], p: .3 }, { s: 'rect', c: ['#3a3046', '#2a2236', '#554a68'], a: [2, 6], p: .2 }, { s: 'dot', c: ['#b78bff', '#7fe3d0', '#ff6ad5'], a: [1, 2.2], p: .08 }],
    obs: [['dead', 4], ['rock', 4], ['car', 2], ['wall', 2], ['crate', 2], ['boulder', 1], ['pillar', 1], ['barrier', 1.5], ['lamp', 1]] }
};

let TH = BIOMES.meadow;
/* dimensions des obstacles : r/cr = rayon dessiné / rayon de collision · w/h = rectangle (le côté long est tiré au hasard à l'horizontale ou à la verticale) */
const OSZ = {
  tree: () => { const r = sr(24, 42); return { r, cr: r * .55 }; },
  pine: () => { const r = sr(20, 34); return { r, cr: r * .5 }; },
  dead: () => { const r = sr(18, 30); return { r, cr: 11 }; },
  rock: () => { const r = sr(22, 40); return { r, cr: r * .86 }; },
  boulder: () => { const r = sr(46, 68); return { r, cr: r * .9 }; },
  cactus: () => { const r = sr(13, 19); return { r, cr: r * .9 }; },
  pillar: () => { const r = sr(15, 20); return { r, cr: r }; },
  lamp: () => ({ r: 8, cr: 8 }),
  pool: () => { const r = sr(34, 62); return { r, cr: r }; },
  crate: () => { const s = sr(30, 40); return { w: s, h: s }; },
  wall: () => ({ w: sr(90, 200), h: sr(22, 30) }),
  ridge: () => ({ w: sr(140, 260), h: sr(34, 50) }),
  house: () => ({ w: sr(110, 150), h: sr(90, 120) }),
  car: () => ({ w: 86, h: 42 }),
  barrier: () => ({ w: 70, h: 20 }),
  fence: () => ({ w: sr(90, 150), h: 9 })
};
const RECTK = new Set(['crate', 'wall', 'ridge', 'house', 'car', 'barrier', 'fence']);

/* chemin : de l'entrée (à gauche) jusqu'à la porte de la base (à droite) */
function genPath(shape, by) {
  const endx = BASEP.x - 85, P = [];
  if (shape[0] === 'S') {   /* escalier : n virages, qui montent et descendent */
    const n = +shape[1], xa = 300, xb = WW - 640, step = (xb - xa) / n, ys = [];
    ys[n] = by;
    for (let k = n - 1; k >= 0; k--) ys[k] = ((n - k) % 2 ? sr(.17, .25) : sr(.58, .7)) * WH;
    P.push([-80, Math.round(ys[0])]);
    for (let i = 1; i <= n; i++) { const xi = Math.round(xa + step * (i - .5) + sr(-.1, .1) * step); P.push([xi, Math.round(ys[i - 1])], [xi, Math.round(ys[i])]); }
    P.push([endx, by]);
  } else {   /* serpentin : trois grands couloirs */
    const yt = Math.round(sr(.14, .2) * WH), ym = Math.round((yt + by) / 2 + sr(-.05, .05) * WH), xr = Math.round(WW - sr(640, 760)), xl = Math.round(sr(300, 420));
    P.push([-80, yt], [xr, yt], [xr, ym], [xl, ym], [xl, by], [endx, by]);
  }
  return P;
}
/* emplacements de tourelles : générés automatiquement des deux côtés du chemin */
let PADS = [];
function genPads() {
  PADS = [];
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    for (let s = 130; s < len - 70; s += 170) {
      const px = a[0] + dx / len * s, py = a[1] + dy / len * s;
      for (const side of [-1, 1]) {
        const x = Math.round(px + nx * side * 104), y = Math.round(py + ny * side * 104);
        if (x < 70 || x > WW - 270 || y < 70 || y > WH - 70) continue;
        if (pathDist(x, y) < 92) continue;
        if (PADS.some(q => Math.hypot(q.x - x, q.y - y) < 150)) continue;
        if (Math.hypot(x - SHOP.x, y - SHOP.y) < 150) continue;
        PADS.push({ id: PADS.length, x, y, w: 96, h: 96 });
      }
    }
  }
}
/* obstacles : TOUS solides (arbres, rochers, murs, maisons, voitures, mares, lave…). On ne peut ni marcher dessus ni les traverser.
   Ils laissent toujours au moins 46 px entre eux : le joueur peut passer partout, et rien n'est jamais enfermé. */
let OBST = [], CIRCS = [], WALLS = [];
function genObstacles() {
  OBST = [];
  const target = Math.round(WW * WH / 34000);
  for (let n = 0; n < target; n++) {
    /* on choisit d'abord le type (selon sa fréquence dans le décor), puis on cherche une place : les grands obstacles (maisons, murs) restent donc bien représentés */
    const k = wpick(TH.obs);
    for (let tries = 0; tries < 70; tries++) {
      const o = Object.assign({ k, v: Math.floor(SR() * 1e9), x: 0, y: 0 }, OSZ[k]());
      if (RECTK.has(k)) { o.rect = true; o.L = o.w; o.T = o.h; o.vert = k !== 'crate' && SR() < .5; if (o.vert) { o.w = o.T; o.h = o.L; } o.br = Math.hypot(o.w, o.h) / 2; } else o.br = o.r;
      const br = o.br;
      o.x = Math.round(sr(br + 24, WW - br - 24)); o.y = Math.round(sr(br + 24, WH - br - 24));
      if (pathDist(o.x, o.y) < br + 64) continue;
      if (Math.hypot(o.x - SHOP.x, o.y - SHOP.y) < br + 130 || Math.hypot(o.x - PSTART.x, o.y - PSTART.y) < br + 90) continue;
      if (o.x + br > BASEP.x - 330 && Math.abs(o.y - BASEP.y) < BH + br + 90) continue;
      if (PADS.some(q => Math.hypot(q.x - o.x, q.y - o.y) < br + 84)) continue;
      if (OBST.some(q => Math.hypot(q.x - o.x, q.y - o.y) < q.br + br + 46)) continue;
      OBST.push(o); break;
    }
  }
}
function buildSolids() {
  CIRCS = OBST.filter(o => !o.rect).map(o => ({ x: o.x, y: o.y, r: o.cr }));
  for (const s of [-1, 1]) CIRCS.push({ x: BASEP.x - 59, y: BASEP.y + s * BH, r: 30 });   /* les deux tours de la base */
  WALLS = [
    { x0: SHOP.x - SHOP.w / 2 - 4, y0: SHOP.y - SHOP.h / 2 - 16, x1: SHOP.x + SHOP.w / 2 + 4, y1: SHOP.y + SHOP.h / 2 },
    { x0: BASEP.x - 76, y0: BASEP.y - BH, x1: WW, y1: BASEP.y + BH }
  ].concat(OBST.filter(o => o.rect).map(o => ({ x0: o.x - o.w / 2, y0: o.y - o.h / 2, x1: o.x + o.w / 2, y1: o.y + o.h / 2 })));
}
/* prépare la carte du niveau lv : taille (de plus en plus grande), chemin, boutique, emplacements, obstacles, décor */
function buildMap(lv) {
  lv = clamp(Math.floor(lv) || 1, 1, LEVELS.length); const L = LEVELS[lv - 1];
  if (L.inf) { buildInf(L); return; }
  XL = 0; UNL = 0; FULLP = null;
  SR = prng(lv * 7919 + 13); TH = BIOMES[L.bi];
  WW = Math.round(1500 + (lv - 1) * 188.9); WH = 900 + (lv - 1) * 100;   /* niveau 1 : 1500 × 900 · niveau 10 : 3200 × 1800 */
  BH = lv <= 2 ? 150 : 200;
  const shape = PSHAPE[lv - 1], by = shape[0] === 'S' ? Math.round(WH * .62) : WH - BH - 50;
  BASEP = { x: WW - 115, y: by };
  SHOP = { x: BASEP.x - 295, y: by - 210, w: 82, h: 76, use: 140, name: 'BOUTIQUE' };
  PSTART = { x: BASEP.x - 225, y: by - 150 };
  PATH = genPath(shape, by); SPAWN = PATH[0];
  genPads(); genObstacles(); buildSolids(); BG = null;
}
/* ---------- Mode infini : terrain extensible (1 zone de départ + 6 zones à acheter, à gauche) ---------- */
const INF_N = 7, INF_W0 = 1500, INF_W = 1100, INF_H = 1200, EXP_COST = [500, 900, 1500, 2300, 3300, 4600];
let XL = 0, UNL = 0, FSEC = [], SECX = [], FULLP = null;   /* FULLP : chemin complet (dessiné d'un coup, même dans les zones pas encore ouvertes) */   /* bord gauche de la zone ouverte · zones achetées · points du chemin par zone */
function buildInf(L) {
  SR = prng(424242); TH = BIOMES[L.bi]; UNL = 0; XL = 0;
  WW = INF_W0 + (INF_N - 1) * INF_W; WH = INF_H; BH = 200;
  const by = Math.round(WH * .62), ys = [];
  BASEP = { x: WW - 115, y: by };
  SHOP = { x: BASEP.x - 295, y: by - 210, w: 82, h: 76, use: 140, name: 'BOUTIQUE' };
  PSTART = { x: BASEP.x - 225, y: by - 150 };
  for (let k = 0; k < INF_N; k++) ys[k] = Math.round(sr(.22, .78) * WH);
  SECX = []; FSEC = [];
  for (let k = 0; k < INF_N; k++) {
    const last = k === INF_N - 1, w = last ? INF_W0 : INF_W, x0 = (WW - INF_W0) - (INF_N - 1 - k) * INF_W, yin = ys[k], yout = last ? by : ys[k + 1];
    const av = (yin + yout) / 2, ym = clamp(av < WH / 2 ? Math.max(yin, yout) + sr(260, 380) : Math.min(yin, yout) - sr(260, 380), WH * .14, WH * .86), xa = Math.round(x0 + w * (last ? .25 : .3)), xb = Math.round(x0 + w * (last ? .55 : .7));
    SECX[k] = { x0, y: yin };
    FSEC[k] = last ? [[xa, yin], [xa, Math.round(ym)], [xb, Math.round(ym)], [xb, by], [BASEP.x - 85, by]] : [[xa, yin], [xa, Math.round(ym)], [xb, Math.round(ym)], [xb, yout], [x0 + w, yout]];
  }
  PATH = [[-80, ys[0]]].concat(...FSEC); SPAWN = PATH[0]; FULLP = PATH;
  genPads(); genObstacles(); buildSolids(); BG = null;
  applyUnl(true);
}
/* ouvre la carte jusqu'à la zone achetée : le chemin commence au bord de la zone la plus à gauche ouverte */
function applyUnl(init) {
  const f = INF_N - 1 - UNL, old = init ? 0 : pcum()[PATH.length - 1], oldLen = PATH.length;
  XL = SECX[f].x0; PATH = [[XL - 80, SECX[f].y]].concat(...FSEC.slice(f)); SPAWN = PATH[0];
  if (!init) { const d = pcum()[PATH.length - 1] - old, dn = PATH.length - oldLen; G.gd.forEach(u => { u.s += d; }); G.z.forEach(z => { z.wi += dn; }); }   /* zombies et unités déjà là restent où ils sont : on décale seulement leur numéro de point du chemin */
}
function expandMap() {
  const g = G; if (!LV().inf || UNL >= INF_N - 1) return; const c = EXP_COST[UNL]; if (g.cash < c) return;
  g.cash -= c; UNL++; applyUnl(); sfx('wave'); shake = Math.max(shake, 10);
  g.ft.push({ x: g.p.x, y: g.p.y - 70, t: 2.4, s: 'Nouvelle zone ouverte !', c: '#7fe3d0' });
  g.fx.push({ k: 'ring', x: XL + 40, y: SECX[INF_N - 1 - UNL].y, t: .8, m: .8, r: 200, c: '#7fe3d0' });
}
function pushRect(p, w) {
  const qx = clamp(p.x, w.x0, w.x1), qy = clamp(p.y, w.y0, w.y1), dx = p.x - qx, dy = p.y - qy, d = Math.hypot(dx, dy); if (d >= p.r) return;
  if (d > .001) { p.x += dx / d * (p.r - d); p.y += dy / d * (p.r - d); }
  else { const l = p.x - w.x0, r = w.x1 - p.x, tp = p.y - w.y0, b = w.y1 - p.y, m = Math.min(l, r, tp, b); if (m === l) p.x = w.x0 - p.r; else if (m === r) p.x = w.x1 + p.r; else if (m === tp) p.y = w.y0 - p.r; else p.y = w.y1 + p.r; }
}
function solid(p) {
  for (let it = 0; it < 2; it++) {
    for (const o of CIRCS) {
      const dx = p.x - o.x, dy = p.y - o.y, rr = o.r + p.r; if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
      const d = Math.hypot(dx, dy); if (d >= rr) continue;
      if (d > .001) { p.x += dx / d * (rr - d); p.y += dy / d * (rr - d); } else p.x += rr;
    }
    for (const w of WALLS) pushRect(p, w);
    for (const pd of PADS) { if (G.tw[pd.id]) pushRect(p, { x0: pd.x - pd.w / 2, y0: pd.y - pd.h / 2, x1: pd.x + pd.w / 2, y1: pd.y + pd.h / 2 }); }   /* une tourelle posée est un mur : on ne marche plus dessus */
  }
  p.x = clamp(p.x, XL + p.r, WW - p.r); p.y = clamp(p.y, p.r, WH - p.r);
}

/* ---------- Dessin du décor (une seule fois par niveau, dans une image) ---------- */
function star(x, cx, cy, r, n, k, rot) { x.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, rr = i % 2 ? r * k : r; x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); }
function rockArt(x, cx, cy, r, R) {
  const B = TH, rr = []; for (let i = 0; i < 9; i++) rr.push(.8 + .26 * R());
  const poly = (ox, oy, s) => { x.beginPath(); rr.forEach((q, i) => { const a = i / 9 * 6.2832; x[i ? 'lineTo' : 'moveTo'](cx + ox + Math.cos(a) * r * q * s, cy + oy + Math.sin(a) * r * q * s); }); x.closePath(); };
  x.fillStyle = 'rgba(0,0,0,.35)'; poly(6, 8, 1); x.fill();
  x.fillStyle = B.rc[0]; poly(0, 0, 1); x.fill();
  x.fillStyle = B.rc[1]; poly(-r * .12, -r * .16, .74); x.fill();
  x.fillStyle = B.rc[2]; poly(-r * .26, -r * .3, .36); x.fill();
  if (B.snow && R() < .8) { x.fillStyle = 'rgba(240,248,255,.85)'; poly(-r * .14, -r * .2, .52); x.fill(); }
}
function drawObst(x, o) {
  const B = TH, R = prng(o.v), r = o.r, k = o.k; x.save(); x.translate(o.x, o.y);
  const dot = (cx, cy, rr, c) => { x.fillStyle = c; x.beginPath(); x.arc(cx, cy, rr, 0, 7); x.fill(); };
  const sh = (rx, ry) => { x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(6, 8, rx, ry, 0, 0, 7); x.fill(); };
  if (k === 'tree') { sh(r, r * .8); dot(0, 0, r, B.tc[0]); dot(-r * .15, -r * .2, r * .72, B.tc[1]); dot(-r * .3, -r * .35, r * .35, B.tc[2]); }
  else if (k === 'pine') {
    sh(r, r * .8); const cs = B.pc || B.tc, rot = R() * 3;
    for (let i = 0; i < 3; i++) { x.fillStyle = cs[i]; star(x, -i * r * .05, -i * r * .07, r * (1 - i * .27), 9, .62, rot); x.fill(); }
    if (B.snow) { x.fillStyle = 'rgba(245,250,255,.88)'; star(x, -r * .1, -r * .14, r * .5, 9, .6, rot); x.fill(); }
  } else if (k === 'dead') {
    x.strokeStyle = B.dc || '#3a2f26'; x.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = R() * 6.283, l = r * (.75 + .5 * R()), mx0 = Math.cos(a) * l * .55, my0 = Math.sin(a) * l * .55;
      x.lineWidth = 4; x.beginPath(); x.moveTo(0, 0); x.lineTo(mx0, my0); x.lineTo(Math.cos(a + .35) * l, Math.sin(a + .35) * l); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.moveTo(mx0, my0); x.lineTo(Math.cos(a - .5) * l * .9, Math.sin(a - .5) * l * .9); x.stroke();
    }
    dot(0, 0, r * .2, '#2a211a');
  } else if (k === 'rock' || k === 'boulder') {
    rockArt(x, 0, 0, r, R);
    if (k === 'boulder') { x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 2; x.beginPath(); x.moveTo(-r * .1, -r * .6); x.lineTo(r * .05, -r * .1); x.lineTo(-r * .2, r * .3); x.moveTo(r * .05, -r * .1); x.lineTo(r * .4, r * .15); x.stroke(); }
  } else if (k === 'cactus') {
    sh(r, r); dot(0, 0, r, '#1f4d2a'); dot(0, 0, r * .78, '#3a8a46'); x.strokeStyle = 'rgba(15,50,25,.7)'; x.lineWidth = 1.5; x.beginPath();
    for (let i = 0; i < 7; i++) { const a = i * .898; x.moveTo(Math.cos(a) * r * .2, Math.sin(a) * r * .2); x.lineTo(Math.cos(a) * r * .75, Math.sin(a) * r * .75); } x.stroke(); dot(0, 0, r * .2, '#ff8ab8');
  } else if (k === 'pillar') {
    sh(r, r); dot(0, 0, r, B.wc[0]); dot(0, 0, r * .84, B.wc[1]); dot(-r * .15, -r * .18, r * .5, B.wc[2]);
    x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(r * .2, -r * .8); x.lineTo(r * .05, -r * .1); x.lineTo(r * .4, r * .4); x.stroke();
  } else if (k === 'lamp') {
    x.save(); x.globalCompositeOperation = 'lighter'; const g = x.createRadialGradient(0, 0, 0, 0, 0, 120); g.addColorStop(0, 'rgba(255,214,120,.3)'); g.addColorStop(1, 'rgba(255,214,120,0)'); x.fillStyle = g; x.fillRect(-120, -120, 240, 240); x.restore();
    dot(0, 0, 8, '#1a1d24'); dot(0, 0, 5, '#ffe08a');
  } else if (k === 'pool') {
    const pc = B.pool, rr = []; for (let i = 0; i < 11; i++) rr.push(.82 + .26 * R());
    const bl = s => { x.beginPath(); rr.forEach((q, i) => { const a = i / 11 * 6.2832; x[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * q * s, Math.sin(a) * r * q * s * .88); }); x.closePath(); };
    x.fillStyle = pc[0]; bl(1.12); x.fill(); x.fillStyle = pc[1]; bl(.95); x.fill();
    if (pc[3] === 'lava') {
      x.save(); x.globalCompositeOperation = 'lighter'; const g = x.createRadialGradient(0, 0, r * .3, 0, 0, r * 2); g.addColorStop(0, 'rgba(255,110,30,.4)'); g.addColorStop(1, 'rgba(255,60,0,0)'); x.fillStyle = g; x.fillRect(-r * 2, -r * 2, r * 4, r * 4); x.restore();
      for (let i = 0; i < 6; i++) dot((R() - .5) * r * 1.1, (R() - .5) * r * .8, 2 + R() * 4, pc[2]);
    } else {
      x.globalAlpha = .35; x.fillStyle = pc[2]; x.beginPath(); x.ellipse(-r * .2, -r * .22, r * .45, r * .2, -.3, 0, 7); x.fill(); x.globalAlpha = 1;
      if (pc[3] === 'ice') { x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-r * .5, r * .1); x.lineTo(-r * .1, -r * .1); x.lineTo(r * .3, r * .2); x.moveTo(-r * .1, -r * .1); x.lineTo(0, -r * .5); x.stroke(); }
      else for (let i = 0; i < 3; i++) { x.fillStyle = '#4b7a2a'; x.beginPath(); x.ellipse((R() - .5) * r * 1.1, (R() - .5) * r * .8, 6 + R() * 4, 4 + R() * 3, R() * 3, 0, 7); x.fill(); }
    }
  } else {   /* obstacles rectangulaires */
    if (o.vert) x.rotate(Math.PI / 2); const L = o.L, T = o.T;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-L / 2 + 5, -T / 2 + 7, L, T);
    if (k === 'crate') {
      x.fillStyle = '#3a2614'; x.fillRect(-L / 2, -T / 2, L, T); x.fillStyle = '#7a5630'; x.fillRect(-L / 2 + 3, -T / 2 + 3, L - 6, T - 6);
      x.strokeStyle = '#3a2614'; x.lineWidth = 2; x.beginPath(); x.moveTo(-L / 2 + 3, -T / 2 + 3); x.lineTo(L / 2 - 3, T / 2 - 3); x.moveTo(L / 2 - 3, -T / 2 + 3); x.lineTo(-L / 2 + 3, T / 2 - 3); x.stroke();
      x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(-L / 2 + 3, -T / 2 + 3, L - 6, 3);
    } else if (k === 'wall') {
      x.fillStyle = B.wc[0]; x.fillRect(-L / 2, -T / 2, L, T);
      for (let px = -L / 2; px < L / 2 - 1;) { const bl = Math.min(14 + R() * 16, L / 2 - px); x.fillStyle = R() < .3 ? B.wc[2] : B.wc[1]; x.fillRect(px + 1, -T / 2 + 1, bl - 2, T - 2); px += bl; }
      x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(-L / 2, -T / 2, L, 3);
      for (let i = 0; i < 4; i++) { x.fillStyle = B.wc[0]; x.fillRect(-L / 2 - 6 + R() * (L + 4), R() < .5 ? -T / 2 - 5 : T / 2 + 1, 5 + R() * 5, 4); }
    } else if (k === 'ridge') {
      const n = Math.ceil(L / (T * .85));
      for (let i = 0; i < n; i++) rockArt(x, -L / 2 + T * .45 + (L - T * .9) * (n > 1 ? i / (n - 1) : .5), (R() - .5) * T * .2, T * (.55 + R() * .1), R);
    } else if (k === 'house') {
      x.fillStyle = B.wc[0]; x.fillRect(-L / 2, -T / 2, L, T); x.fillStyle = B.wc[1]; x.fillRect(-L / 2 + 3, -T / 2 + 3, L - 6, T - 6);
      x.fillStyle = '#1d1915'; x.fillRect(-L / 2 + 13, -T / 2 + 13, L - 26, T - 26);
      for (let i = 0; i < 5; i++) { x.fillStyle = R() < .5 ? B.wc[0] : '#3a322a'; x.fillRect(-L / 2 + 16 + R() * (L - 44), -T / 2 + 16 + R() * (T - 40), 6 + R() * 10, 5 + R() * 8); }
      const rw = L * .55; x.fillStyle = B.roof || '#6b3a2a'; x.beginPath(); x.moveTo(L / 2 - rw, -T / 2); x.lineTo(L / 2, -T / 2); x.lineTo(L / 2, T / 2); x.lineTo(L / 2 - rw * .8, T / 2); x.lineTo(L / 2 - rw * .95, 0); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 1.5; x.beginPath(); for (let px = L / 2 - rw + 8; px < L / 2; px += 11) { x.moveTo(px, -T / 2); x.lineTo(px + 2, T / 2); } x.stroke();
      x.fillStyle = 'rgba(0,0,0,.45)'; x.beginPath(); x.arc(L / 2 - rw * .35, -T * .12, T * .17, 0, 7); x.fill();
    } else if (k === 'car') {
      const cols = ['#7a3a2a', '#3a5a7a', '#6a6a52', '#555a62', '#6a2f3a'], c = cols[Math.floor(R() * cols.length)];
      x.fillStyle = '#15181d'; for (const px of [-L * .3, L * .3]) { x.fillRect(px - 8, -T / 2 - 3, 16, 5); x.fillRect(px - 8, T / 2 - 2, 16, 5); }
      x.fillStyle = c; x.beginPath(); x.roundRect(-L / 2, -T / 2, L, T, 9); x.fill();
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(-L * .08, -T / 2 + 3, L * .36, T - 6);
      x.fillStyle = '#1a2230'; x.fillRect(L * .22, -T / 2 + 4, L * .14, T - 8); x.fillRect(-L * .38, -T / 2 + 5, L * .1, T - 10);
      x.fillStyle = 'rgba(255,255,255,.15)'; x.fillRect(-L / 2 + 4, -T / 2 + 2, L - 8, 3);
      for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(90,50,20,.45)'; x.beginPath(); x.arc((R() - .5) * L * .8, (R() - .5) * T * .7, 2 + R() * 3, 0, 7); x.fill(); }
    } else if (k === 'barrier') {
      x.fillStyle = '#9ea4ad'; x.fillRect(-L / 2, -T / 2, L, T);
      for (let i = 0, px = -L / 2; px < L / 2 - 6; px += 14, i++) { x.fillStyle = i % 2 ? '#e8e8e8' : '#e0701c'; x.fillRect(px, -T / 2 + 3, 7, T - 6); }
    } else {   /* fence */
      x.fillStyle = '#5a3f26'; x.fillRect(-L / 2, -T / 2 + 1, L, 2.5); x.fillRect(-L / 2, T / 2 - 3.5, L, 2.5);
      x.fillStyle = '#3a2816'; for (let px = -L / 2; px <= L / 2; px += 22) x.fillRect(px - 3, -T / 2 - 3, 6, T + 6);
    }
  }
  x.restore();
}
/* petits détails au sol (fleurs, gravats, ossements, braises, fissures…) : décoratifs, sans collision */
function drawDetails(x) {
  const n = Math.round(WW * WH / 2200);
  for (const d of TH.det) {
    x.save(); x.lineWidth = 1.2; x.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      if (Math.random() > d.p) continue;
      const px = rnd(6, WW - 6), py = rnd(6, WH - 6), s = rnd(d.a[0], d.a[1]), c = Array.isArray(d.c) ? pick(d.c) : d.c;
      x.fillStyle = x.strokeStyle = c;
      if (d.s === 'dot') { x.beginPath(); x.arc(px, py, s, 0, 7); x.fill(); }
      else if (d.s === 'rect') x.fillRect(px, py, s, s * rnd(.5, 1));
      else if (d.s === 'blade') { x.globalAlpha = .14; x.beginPath(); x.moveTo(px, py); x.lineTo(px - 2, py - s); x.moveTo(px, py); x.lineTo(px + 2, py - s * .8); x.stroke(); }
      else if (d.s === 'reed') { x.globalAlpha = .55; x.beginPath(); x.moveTo(px, py); x.lineTo(px + rnd(-2, 2), py - s); x.stroke(); }
      else if (d.s === 'line') { x.globalAlpha = .5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + rnd(-s, s), py + rnd(-s, s) * .6); x.stroke(); }
      else if (d.s === 'arc') { x.globalAlpha = .3; x.beginPath(); x.arc(px, py, s, rnd(0, 3), rnd(3.5, 5.5)); x.stroke(); }
    }
    x.restore();
  }
}
let BG = null;
function buildBG() {
  const keepP = PATH; if (FULLP) PATH = FULLP;   /* le décor montre tout le chemin, y compris les zones à acheter */
  const B = TH; BG = document.createElement('canvas'); BG.width = WW; BG.height = WH; const x = BG.getContext('2d');
  const T = 96, [h0, hr, s0, l0, lr] = B.g;
  for (let i = 0; i * T < WW; i++) for (let j = 0; j * T < WH; j++) { const n = ((i * 73856093) ^ (j * 19349663)) >>> 0; x.fillStyle = 'hsl(' + (h0 + n % hr) + ',' + s0 + '%,' + (l0 + n % lr) + '%)'; x.fillRect(i * T, j * T, T + 1, T + 1); }
  if (B.grid) { x.strokeStyle = 'rgba(0,0,0,.2)'; x.lineWidth = 1.5; for (let i = 0; i * T < WW; i++) for (let j = 0; j * T < WH; j++) x.strokeRect(i * T, j * T, T, T); }
  for (let n = 0, m = WW * WH / 90000; n < m; n++) { const px = rnd(0, WW), py = rnd(0, WH), r = rnd(80, 200), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, B.blot); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
  drawDetails(x);
  /* le chemin : bords sombres, surface, ligne centrale */
  x.lineCap = 'round'; x.lineJoin = 'round';
  const path = () => { x.beginPath(); PATH.forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); x.stroke(); };
  x.strokeStyle = B.path[0]; x.lineWidth = PATHW + 18; path();
  x.strokeStyle = B.path[1]; x.lineWidth = PATHW + 4; path();
  x.strokeStyle = B.path[2]; x.lineWidth = PATHW - 10; path();
  x.setLineDash([16, 22]); x.strokeStyle = B.dash; x.lineWidth = 4; path(); x.setLineDash([]);
  for (let n = 0; n < WW * WH / 4000; n++) { const i = 1 + Math.floor(Math.random() * (PATH.length - 1)), a = PATH[i - 1], q = PATH[i], t = Math.random(); x.fillStyle = Math.random() < .5 ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.1)'; x.fillRect(a[0] + (q[0] - a[0]) * t + rnd(-30, 30), a[1] + (q[1] - a[1]) * t + rnd(-30, 30), rnd(2, 5), rnd(1, 3)); }
  /* emplacements de tourelles (dalles) */
  for (const p of PADS) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(p.x - p.w / 2 + 4, p.y - p.h / 2 + 5, p.w, p.h); x.fillStyle = B.pad[0]; x.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h); x.strokeStyle = B.pad[1]; x.lineWidth = 2; x.strokeRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h); }
  for (const o of OBST.slice().sort((a, b) => a.y - b.y)) drawObst(x, o);
  x.fillStyle = B.tint; x.fillRect(0, 0, WW, WH);
  x.strokeStyle = 'rgba(255,77,94,.25)'; x.lineWidth = 18; x.strokeRect(0, 0, WW, WH); x.strokeStyle = '#ff4d5e'; x.lineWidth = 6; x.strokeRect(0, 0, WW, WH);
  PATH = keepP;
}

/* ---------- Zombies (mêmes types et mêmes stats que le jeu principal) ---------- */
const TYPES = {
  walk:  { name: 'Rôdeur', r: 14, hp: 3, sp: 58, pts: 1, c: '#79c283', dk: '#3f7a52', dmg: 10 },
  fast:  { name: 'Coureur', r: 11, hp: 2, sp: 125, pts: 2, c: '#e6d96b', dk: '#9a8f2c', dmg: 8 },
  bomb:  { name: 'Kamikaze', r: 14, hp: 4, sp: 95, pts: 3, c: '#ff9a3c', dk: '#a84a10', dmg: 30 },
  spit:  { name: 'Cracheur', r: 15, hp: 5, sp: 50, pts: 4, c: '#7fe3d0', dk: '#2a8f86', dmg: 10 },
  tank:  { name: 'Costaud', r: 23, hp: 14, sp: 40, pts: 5, c: '#a98be0', dk: '#5e3fa0', dmg: 20 },
  brute: { name: 'Blindé', r: 28, hp: 34, sp: 46, pts: 10, c: '#8a97ad', dk: '#4a5468', dmg: 25 },
  boss:  { big: true, name: 'Colosse', r: 42, hp: 140, sp: 50, pts: 25, c: '#ff5a5a', dk: '#9c2230', dmg: 30 },
  crawler: { name: 'Rampant', r: 9, hp: 1.5, sp: 150, pts: 2, c: '#c9a27a', dk: '#7a5a3a', dmg: 6 },
  toxic: { name: 'Putréfié', r: 19, hp: 9, sp: 66, pts: 6, c: '#9bd24a', dk: '#4f7a1c', dmg: 16 },
  berserk: { name: 'Enragé', r: 18, hp: 10, sp: 115, pts: 8, c: '#ff6fa0', dk: '#a02050', dmg: 22 },
  splitter: { name: 'Gluant', r: 17, hp: 6, sp: 70, pts: 5, c: '#7fc8a0', dk: '#2f7a58', dmg: 12 },
  ghoul: { name: 'Goule', r: 15, hp: 16, sp: 128, pts: 9, c: '#b8c97a', dk: '#5a6a2a', dmg: 18 },
  archer: { name: 'Tireur', r: 14, hp: 8, sp: 55, pts: 10, c: '#e8b87a', dk: '#8a5a2a', dmg: 10 },
  juggernaut: { name: 'Mastodonte', r: 34, hp: 70, sp: 40, pts: 18, c: '#7a8aa8', dk: '#3a4660', dmg: 34 },
  medic: { name: 'Soigneur', r: 16, hp: 12, sp: 56, pts: 14, c: '#a8e8d0', dk: '#2a8a6a', dmg: 8 }
};
const waveCount = w => Math.min(600, Math.round(8 + w * 3.6 + (w > 8 ? (w - 8) * (w - 8) * .35 : 0)));
function pickType() {
  const w = dw(), t = [['walk', Math.max(8, 30 - w)], ['fast', w >= 2 ? 18 : 0], ['bomb', w >= 3 ? 8 : 0], ['tank', w >= 3 ? 6 : 0], ['crawler', w >= 4 ? 8 : 0], ['spit', w >= 4 ? 7 : 0], ['toxic', w >= 5 ? 5 : 0], ['splitter', w >= 6 ? 5 : 0], ['brute', w >= 6 ? 3 + Math.min(w, 20) * .2 : 0], ['berserk', w >= 8 ? 5 : 0], ['ghoul', w >= 12 ? 6 : 0], ['archer', w >= 14 ? 5 : 0], ['juggernaut', w >= 15 ? 3 : 0], ['medic', w >= 18 ? 3 : 0]];
  if (w > 20) for (const e of t) { if (e[0] === 'walk' || e[0] === 'fast' || e[0] === 'crawler') e[1] *= .5; else e[1] *= 1 + (w - 20) * .08; }
  let s = 0; for (const e of t) s += e[1]; let r = Math.random() * s;
  for (const e of t) { if ((r -= e[1]) < 0) return e[0]; }
  return 'walk';
}
let zid = 0;
function spawnZ(type, px, py, wi) {
  const T = TYPES[type], w = dw(), sc0 = 1 + w * .24 + w * w * .007, sc = T.big ? Math.pow(sc0, .75) : sc0;
  G.z.push({
    id: ++zid, t: type, x: px ?? SPAWN[0] + rnd(-30, 10), y: py ?? SPAWN[1] + rnd(-26, 26), wi: wi || 1, pr: 0,
    r: T.r, hp: T.hp * sc * LV().hp * easeW() * lng(.03) * infHp(), mx: T.hp * sc * LV().hp * easeW() * lng(.03) * infHp(), sp: T.sp * SPEED * LV().sp * (.75 + .25 * easeW()) * lng(.004) * (infHard() ? 1 + Math.min(G.wave - 9, 20) * .012 : 1) * (1 + Math.min(w, 25) * .02) * rnd(.9, 1.1),
    pts: T.pts, c: T.c, dk: T.dk, dmg: T.dmg * (1 + Math.min(w, 100) * .008) * lng(.03) * (infHard() ? 1 + (G.wave - 9) * .04 : 1), dm: 1 + w * .06, big: !!T.big, kr: infKr(), bp: -1e18, stk: 0, gh: 0, sh: rnd(1, 2.5), cd: 0, fl: 0, kx: 0, ky: 0, ph: rnd(0, 6), tsl: 1, sm: 4
  });
}

/* ---------- Armes (mêmes données que le jeu principal, sélection) ---------- */
const WP = {
  pistol:  { name: 'Pistolet', ab: 'PI', rate: .28, dmg: 1, n: 1, sp: .03, v: 780, life: .8, auto: false, pl: 0, col: '#ffd27a', len: 16 },
  revolver:{ name: 'Revolver', ab: 'RV', rate: .5, dmg: 2, n: 1, sp: .02, v: 820, life: .8, auto: false, pl: 0, col: '#ffd24a', len: 18 },
  smg:     { name: 'Mitraillette', ab: 'MI', rate: .09, dmg: .8, n: 1, sp: .1, v: 800, life: .8, auto: true, pl: 0, col: '#ffb347', len: 22 },
  shotgun: { name: 'Fusil à pompe', ab: 'FP', rate: .75, dmg: 1, n: 6, sp: .38, v: 700, life: .45, auto: false, pl: 0, col: '#ff7a2f', len: 30 },
  rifle:   { name: 'Fusil d’assaut', ab: 'FA', rate: .14, dmg: 2, n: 1, sp: .04, v: 900, life: .9, auto: true, pl: 0, col: '#5fd6a0', len: 32 },
  sniper:  { name: 'Sniper', ab: 'SN', rate: .95, dmg: 9, n: 1, sp: 0, v: 1100, life: 1, auto: false, pl: 5, col: '#7fb8ff', len: 40 },
  launcher:{ name: 'Lance-grenades', ab: 'LG', rate: .9, dmg: 2, n: 1, sp: .02, v: 520, life: .9, auto: false, pl: 0, col: '#ff9a3c', ex: { r: 90, d: 7 }, len: 30 },
  mini:    { name: 'Minigun', ab: 'MG', rate: .045, dmg: .7, n: 1, sp: .15, v: 850, life: .8, auto: true, pl: 1, col: '#ff4d5e', len: 28 },
  laser:   { name: 'Fusil laser', ab: 'FL', rate: .07, dmg: 1.6, n: 1, sp: .02, v: 1300, life: .7, auto: true, pl: 4, col: '#ff6ad5', len: 30 },
  knife:   { name: 'Couteau', ab: 'CO', rate: .4, dmg: 1.6, n: 1, sp: 0, v: 520, life: .1, auto: false, pl: 2, col: '#cfd6e2', len: 0 }
};
Object.entries({ revolver: 2, smg: 3, shotgun: 4, rifle: 6, sniper: 8, launcher: 10, mini: 12, laser: 15 }).forEach(([k, v]) => WP[k].tier = v);
const MAXAM = { pistol: 90, revolver: 48, smg: 160, shotgun: 32, rifle: 120, sniper: 20, launcher: 16, mini: 360, laser: 340 };
const WPRICE = { revolver: 150, smg: 275, shotgun: 400, rifle: 650, sniper: 850, launcher: 1100, mini: 1500, laser: 2200 };   /* prix des armes à la boutique */
const SHOP_W = ['pistol'].concat(Object.keys(WPRICE));
const PICK_PCT = .5, BOX_PCT = .35;
const BONUS = { heal: { c: '#5fd6a0', n: 'Soin' }, ammo: { c: '#ffd27a', n: 'Munitions' }, freeze: { c: '#9be7ff', n: 'Gel' }, rage: { c: '#ff8a3a', n: 'Furie' }, shield: { c: '#7fb8ff', n: 'Bouclier' }, speed: { c: '#ffd24a', n: 'Vitesse' }, x2: { c: '#ff7ad9', n: 'Points ×2' }, nuke: { c: '#ff4d5e', n: 'Bombe' }, magnet: { c: '#c0b8ff', n: 'Aimant' } };
const BP = ['freeze', 'rage', 'ammo', 'ammo', 'ammo', 'shield', 'shield', 'speed', 'x2', 'x2', 'nuke', 'magnet'];
const PW = {
  nova: { name: 'Onde de choc', col: '#7fb8ff', dur: 0, n: 5, ab: 'OC' },
  thunder: { name: 'Foudre', col: '#ffe27a', dur: 0, n: 4, ab: 'FO' },
  shield: { name: 'Barrière', col: '#7fb8ff', dur: 6, n: 3, ab: 'BA' },
  fury: { name: 'Furie', col: '#ff8a3a', dur: 7, n: 3, ab: 'FU' }
};
const PERKS = [
  { id: 'dm', n: 'Balles lourdes', d: '+6 % de dégâts', mx: 12, p: 120, g: 'DM' },
  { id: 'rt', n: 'Gâchette facile', d: 'Tir 4 % plus rapide', mx: 10, p: 120, g: 'RT' },
  { id: 'sp', n: 'Vitesse', d: '+5 % de vitesse de déplacement', mx: 10, p: 110, g: 'VI' }
];

/* ---------- Tourelles (posées sur les emplacements ; 3 améliorations chacune) ---------- */
const TOW = {
  mg:     { n: 'Mitrailleuse', p: 100, col: '#ffb347', rng: 270, rate: .22, dmg: 1.1, v: 900, pl: 0, d: 'Tir rapide et précis. Polyvalente.' },
  sniper: { n: 'Tourelle sniper', p: 240, col: '#7fb8ff', rng: 560, rate: 1.3, dmg: 9, v: 1300, pl: 3, d: 'Très longue portée : balle perforante qui traverse 4 zombies.' },
  cannon: { n: 'Canon', p: 280, col: '#ff7a2f', rng: 340, rate: 1.1, dmg: 2.5, v: 600, ex: 85, exd: 5, d: 'Obus explosifs : dégâts de zone sur les groupes.' },
  frost:  { n: 'Tour de gel', p: 200, col: '#9be7ff', rng: 230, rate: .5, dmg: .5, v: 700, slow: .4, d: 'Ralentit tous les zombies à portée (et les blesse un peu).' },
  laser:  { n: 'Tour laser', p: 520, col: '#ff6ad5', rng: 380, rate: .1, dmg: .9, v: 1400, pl: 4, d: 'Cadence folle, rayon qui perfore 5 zombies.' },
  flame:  { n: 'Lance-flammes', p: 260, col: '#ff6a2f', rng: 175, rate: .06, dmg: .4, v: 520, pl: 2, sp: .24, d: 'Courte portée : gerbe de flammes qui brûle plusieurs zombies à la fois.' },
  tesla:  { n: 'Tour Tesla', p: 420, col: '#b78bff', rng: 300, rate: .85, dmg: 2.4, chain: 4, d: 'Éclair instantané qui rebondit de zombie en zombie.' },
  mortar: { n: 'Mortier', p: 460, col: '#c8a070', rng: 640, rate: 2.1, dmg: 3, v: 430, ex: 125, exd: 7, d: 'Portée immense : obus qui explosent en grande zone.' },
  sonic:  { n: 'Tour sonique', p: 380, col: '#7fe3d0', rng: 210, rate: 1.1, dmg: 1.6, pulse: 1, d: 'Onde de choc autour de la tour : blesse et repousse tous les zombies à portée.' },
  rail:   { n: 'Canon rail', p: 700, col: '#9bf0ff', rng: 720, rate: 2.2, dmg: 20, v: 2600, pl: 9, d: 'Portée énorme : un trait d’énergie qui traverse jusqu’à 10 zombies.' },
  bank:   { n: 'Banque', p: 350, col: '#ffd24a', rng: 0, rate: 1, dmg: 0, eco: 1, d: 'Ne tire pas : rapporte de l’argent à la fin de chaque vague. Plus elle est améliorée, plus elle rapporte.',
    inf: t => 'Revenu : +' + bankInc(t) + ' à la fin de chaque vague' },
  barracks: { n: 'Caserne', p: 350, col: '#8fbf6a', rng: 240, rate: 1, dmg: 1, unit: 'barracks', d: 'Libère des soldats à la base : ils remontent le chemin à l’envers et tirent sur les zombies. Chacun porte une arme du jeu (fusil d’assaut, mitraillette, fusil à pompe, sniper, minigun, lance-grenades, fusil laser) : plus le niveau est haut, plus il y a de soldats et d’armes différentes. Attention : les zombies les attaquent.',
    inf: t => { const ids = GW.slice(0, GUARD_N[t.l]), hp = ids.map(id => soldHp(id, t.l)), rg = ids.map(id => soldRng(id, t.l)); return 'Soldats : ' + ids.length + ' (' + ids.map(id => SOLD[id].nm).join(', ') + ') · PV ' + Math.round(Math.min(...hp)) + ' à ' + Math.round(Math.max(...hp)) + ' · portée ' + Math.round(Math.min(...rg)) + ' à ' + Math.round(Math.max(...rg)); } },
  tank: { n: 'Hangar à tanks', p: 650, col: '#a8b070', rng: 330, rate: 1, dmg: 1, unit: 'tank', d: 'Un hangar qui abrite un seul tank, toujours : il remonte le chemin jusqu’à l’entrée des zombies et tire des obus explosifs. S’il est détruit, un nouveau sort du hangar.',
    inf: t => 'PV ' + Math.round(260 * (1 + .7 * t.l) * lvm()) + ' · dégâts de zone ' + (Math.round(5 * (1 + .7 * t.l) * lvm() * 10) / 10) + ' · portée ' + Math.round(twRng(t)) },
  plane: { n: 'Avions', p: 800, col: '#7fb8ff', rng: 230, rate: 1, dmg: 1, unit: 'plane', d: 'Des avions survolent la zone et bombardent dès qu’ils passent au-dessus du chemin, quand des zombies y sont.',
    inf: t => 'Avions : ' + PLANE_N[t.l] + ' · bombe ' + (Math.round(6 * (1 + .7 * t.l) * lvm() * 10) / 10) + ' (rayon ' + Math.round(60 + 8 * t.l) + ') · zone ' + Math.round(twRng(t)) }
};
const TLIM = { barracks: 4, tank: 2, plane: 3 };   /* maximum par partie (tous les modes) : casernes · hangars à tanks · avions */
const tCount = key => Object.values(G.tw).filter(t => t.t === key).length;
const T_ORDER = ['mg', 'frost', 'cannon', 'sniper', 'flame', 'laser', 'tesla', 'mortar', 'sonic', 'rail'];
const UNIT_UNLOCK = { barracks: 3, bank: 4, tank: 5, plane: 7 };   /* niveau à partir duquel chaque tourelle spéciale (unités alliées) est disponible */   /* ordre de déblocage des tourelles */
/* ---------- Niveaux ----------
   waves : vagues à tenir pour gagner · off : décalage de difficulté (les types de zombies et leurs stats suivent « vague + off »)
   hp / sp / cnt : multiplicateurs de vie, de vitesse et de nombre de zombies · tn : nombre de tourelles débloquées (ordre T_ORDER)
   Pour régler la difficulté, modifiez simplement ce tableau. */
const LEVELS = [
  { n: 'La clairière',        bi: 'meadow',   waves: 5,  off: 0,  hp: .6,  sp: .8,  cnt: .6,  cash: 0, bhp: 100, tn: 1 },
  { n: 'Le village en ruine', bi: 'village',  waves: 6,  off: 0,  hp: .65, sp: .85, cnt: .65, cash: 0, bhp: 100, tn: 2 },
  { n: 'Le désert',           bi: 'desert',   waves: 8,  off: 1,  hp: .7,  sp: .9,  cnt: .7,  cash: 0, bhp: 100, tn: 3 },
  { n: 'La forêt noire',      bi: 'forest',   waves: 10, off: 2,  hp: .75, sp: .9,  cnt: .75, cash: 0, bhp: 100, tn: 4 },
  { n: 'Les montagnes',       bi: 'mountain', waves: 12, off: 3,  hp: .85, sp: .95, cnt: .8,  cash: 0, bhp: 100, tn: 5 },
  { n: 'Les ruines antiques', bi: 'ruins',    waves: 14, off: 4,  hp: .95, sp: 1,   cnt: .85, cash: 0, bhp: 100, tn: 6 },
  { n: 'Le marais',           bi: 'swamp',    waves: 16, off: 5,  hp: 1.05, sp: 1,  cnt: .9,  cash: 0, bhp: 100, tn: 7 },
  { n: 'La toundra gelée',    bi: 'snow',     waves: 18, off: 6,  hp: 1.2, sp: 1.05, cnt: .95, cash: 0, bhp: 100, tn: 8 },
  { n: 'Les terres de feu',   bi: 'hell',     waves: 20, off: 8,  hp: 1.4, sp: 1.1, cnt: 1,   cash: 0, bhp: 100, tn: 9 },
  { n: 'Dernière nuit',       bi: 'city',     waves: 25, off: 8,  hp: 1.7, sp: 1.15, cnt: 1,  cash: 0, bhp: 100, tn: 10 },
  { n: 'Mode infini',         bi: 'wasteland', waves: Infinity, off: 0, hp: 1, sp: 1, cnt: 1, cash: 0, bhp: 100, tn: 10, inf: true }   /* vagues sans fin, carte extensible */
];
const LV = () => LEVELS[G.lv - 1], dw = () => G.wave + LV().off, towList = () => T_ORDER.slice(0, LV().tn).concat(Object.keys(UNIT_UNLOCK).filter(k => G.lv >= UNIT_UNLOCK[k]));
/* Difficulté : début de niveau en douceur (zombies fragiles, peu nombreux) puis, plus la partie dure, plus ils sont résistants, forts, rapides et nombreux */
/* Mode infini : à partir de la vague 10, zombies très résistants qui reculent à peine ; l'argent gagné diminue avec le temps */
const infHard = () => !!LV().inf && G.wave >= 10;
const infHp = () => infHard() ? 1 + .45 * (G.wave - 9) + .045 * Math.pow(G.wave - 9, 2) : 1;
const infKr = () => infHard() ? Math.max(.06, 1 / (1 + (G.wave - 9) * .7)) : 1;   /* part du recul subie */
const incF = () => LV().inf ? Math.max(.08, 1 / (1 + G.t / 300 + Math.max(0, G.wave - 5) * .05)) : 1;   /* part des gains conservée */
const easeW = () => Math.min(1, .45 + .11 * (G.wave - 1));   /* vague 1 : 45 % de la vie, 100 % à partir de la vague 6 */
const lng = k => 1 + Math.min(G.t / 60, 60) * k;             /* grandit chaque minute de jeu (plafonné à 60 min) */
const dolMul = () => .5 * (1 + .12 * (G.lv - 1)) * incF();   /* dollars gagnés par point de zombie : un peu plus à chaque niveau */
const TW_UP = [1, 1.8, 3], TW_MAX = 3, SELL = .5;   /* prix d'amélioration = prix de base × TW_UP[niveau] · remboursement à la vente */
const twDmg = t => TOW[t.t].dmg * (1 + .7 * t.l), twRng = t => TOW[t.t].rng * (1 + .1 * t.l), twRate = t => TOW[t.t].rate * Math.pow(.9, t.l);
const BANK_INC = [60, 120, 200, 320];   /* argent rapporté par une Banque à chaque fin de vague, selon son niveau (0 à 3) */
const bankInc = t => Math.round(BANK_INC[t.l] * (1 + .1 * (G.lv - 1)) * incF());
const twUp = t => Math.round(TOW[t.t].p * TW_UP[t.l]);

/* ---------- État de la partie ---------- */
function makeState(lv) {
  const L = LEVELS[(lv || 1) - 1];
  return { lv: lv || 1, dol: { k: 0, c: 0, d: 0, w: 0 }, dist: 0, lx: PSTART.x, ly: PSTART.y, dpd: 0, playing: false, paused: false, over: false, shop: false, t: 0, wave: 0, score: 0, kills: 0, combo: 0, ct: 0, bc: 0, cash: L.cash, dist: 0,
    p: { x: PSTART.x, y: PSTART.y, hp: 100, mhp: 100, r: 15, cd: 0, hit: 0, ang: 0, dt: 0, dead: false, sl: 0, sd: 1 },
    base: { hp: L.bhp, mhp: L.bhp, fl: 0, lv: 0 }, z: [], b: [], pt: [], ft: [], dr: [], fx: [], eb: [], sp: [], tw: {}, gd: [], pl: [], pb: [], dem: null, tmr: {},
    wp: 'pistol', last: 'pistol', am: { pistol: 90 }, own: { pistol: 1 }, pk: { dm: 0, rt: 0, sp: 0, hp: 0, ar: 0, am: 0 }, ph: null, pc: 0, pa: null,
    spawnLeft: 0, spawnT: 0, brk: 0, dc: 0, resp: 0, dieT: 0, shots: 0, flash: 0, zk: {}, wk: {}, pu: {}, nd: { w: [], z: [], p: [] }, sk: CFG.skin || DEF_SKIN, ih: 0, ns: '', cf: 0, leak: 0, bt: 0 };
}
buildMap(1);
let G = makeState(1);
/* dollars gagnés dans la partie (zombies + combos + distance + vagues) */
const dolTotal = () => { const d = G.dol; return d.k + d.c + d.d + d.w; };
/* première fois que ce joueur voit une arme / un zombie / un pouvoir : le jeu principal l'enregistre dans son profil */
function disc(k, id, x, y, msg) { if (DISC[k].has(id)) return; DISC[k].add(id); G.nd[k].push(id); G.ft.push({ x, y, t: 1.6, s: msg, c: '#7fb8ff' }); }
let shake = 0, mx = 0, my = 0, down = false, edge = 0;
const K = {};
const maxAm = id => Math.ceil((MAXAM[id] || 0) * (1 + .1 * G.pk.am));
const cashMul = () => (1 + CASH_WAVE * G.wave) * incF();
const gainCash = n => { const g = G; g.cf += n * cashMul(); const v = Math.floor(g.cf + 1e-9); g.cf -= v; if (v > 0) g.cash += v; return v; };
const towerCount = () => Object.keys(G.tw).length;

/* ---------- Sons (repris du jeu principal) ---------- */
let AC = null, muted = false, NB = null;
try { muted = localStorage.getItem('dn_mute') === '1'; } catch (e) {}
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
  else if (n === 'coin') { tone(1250, .07, 'square', .05, 1.4); tone(1850, .12, 'square', .05, 1.2, .06); }
  else if (n === 'hurt') { tone(110, .2, 'sawtooth', .18, .5); noise(.12, .2, 800); }
  else if (n === 'hit') noise(.03, .08, 1500);
  else if (n === 'kill') tone(140, .15, 'sawtooth', .1, .4);
  else if (n === 'boom') { noise(.5, .5, 600); tone(70, .4, 'sine', .3, .3); }
  else if (n === 'wave') { tone(110, .6, 'sawtooth', .12, .7); tone(165, .6, 'sawtooth', .08, .7, .15); }
  else if (n === 'over') tone(220, .9, 'sawtooth', .15, .25);
  else if (n === 'dash') noise(.1, .1, 3000);
  else if (n === 'build') { tone(300, .1, 'square', .1, 1.6); tone(450, .14, 'square', .1, 1.5, .09); noise(.12, .12, 1800); }
  else if (n === 'twshot') noise(.04, .05, 2600);
  else if (n === 'nova') { noise(.6, .45, 900); tone(160, .6, 'sine', .35, .2); }
  else if (n === 'thunder') { noise(.4, .5, 4000); tone(90, .5, 'sawtooth', .25, .3); }
  else if (n === 'shield') { tone(300, .4, 'triangle', .12, 2); tone(600, .3, 'sine', .1, 1.5, .1); }
  else if (n === 'fury') { tone(120, .5, 'sawtooth', .14, 2.5); noise(.3, .15, 3000); }
  else if (n === 'regen') { tone(400, .3, 'triangle', .1, 1.6); tone(600, .3, 'triangle', .1, 1.5, .12); }
}
function shotSfx(id) {
  if (id === 'knife') noise(.1, .15, 6000);
  else if (id === 'shotgun') { noise(.25, .4, 1500); tone(90, .2, 'sawtooth', .15, .4); }
  else if (id === 'sniper') { noise(.3, .3, 4000); tone(200, .35, 'sawtooth', .12, .3); }
  else if (id === 'laser') tone(900, .08, 'sawtooth', .06, .6);
  else if (id === 'mini' || id === 'smg') noise(.04, .12, 2500);
  else { noise(.07, .25, 3000); tone(260, .08, 'square', .06, .4); }
}
const sndLbl = () => document.querySelectorAll('.snd').forEach(b => b.textContent = 'Son : ' + (muted ? 'coupé' : 'activé'));
function toggleSnd() { muted = !muted; try { localStorage.setItem('dn_mute', muted ? '1' : '0'); } catch (e) {} sndLbl(); }

/* ---------- Effets ---------- */
const GC = ['#b3121f', '#d61f2c', '#8e0e19', '#e0323d'];
function blood(x, y, c, n, sp) { if (G.pt.length > 700) return; for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(30, sp); G.pt.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: rnd(.3, .7), m: .7, c, s: rnd(1.5, 4) }); } }
function gore(x, y, ang, n, sp) { if (G.pt.length > 600) return; for (let i = 0; i < n; i++) { const a = ang + rnd(-.5, .5), v = rnd(70, sp || 340); G.pt.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: rnd(.35, .9), m: .9, c: pick(GC), s: rnd(2, 5.5), g: 1 }); } }
function splat(x, y, r) { if (G.sp.length > 160) G.sp.shift(); G.sp.push({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), r: Math.max(2, r * rnd(.35, .8)), l: 16, m: 16, c: pick(GC) }); }
const HUDC = {}, HUDE = {};
function setT(id, v) { if (HUDC[id] === v) return; HUDC[id] = v; (HUDE[id] || (HUDE[id] = $(id))).textContent = v; }

/* ---------- Armes du joueur : munitions, inventaire ---------- */
const ammoOf = id => Infinity;   /* munitions infinies */
function lowAmmo() { return G.wp === 'knife' || ammoOf(G.wp) < maxAm(G.wp) * .25; }
function addAmmo(id, n) { const g = G; if (id === 'knife' || !MAXAM[id]) return 0; const b = g.am[id] || 0; g.am[id] = Math.min(maxAm(id), b + Math.max(1, Math.ceil(n))); if (g.wp === 'knife' && g.am[id] > 0) setWp(id); return g.am[id] - b; }
function addAmmoAll(pct) { Object.keys(G.own).forEach(id => addAmmo(id, maxAm(id) * pct)); }
function setWp(id) { const g = G; g.wp = id; if (id !== 'knife') { g.last = id; g.own[id] = 1; } }
function ownedList() { const l = Object.keys(G.own).filter(id => ammoOf(id) > 0).sort((a, b) => (WP[a].tier || 0) - (WP[b].tier || 0)); l.push('knife'); return l; }
function cycleWp(dir) { const g = G; if (!g.playing || g.paused) return; const l = ownedList(); if (l.length < 2) return; setWp(l[(Math.max(0, l.indexOf(g.wp)) + dir + l.length) % l.length]); g.p.cd = Math.max(g.p.cd, .15); sfx('pick'); g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1, s: WP[g.wp].name, c: WP[g.wp].col }); }
function selectWp(id) { const g = G; if (!g.playing || g.paused || id === g.wp || !ownedList().includes(id)) return; setWp(id); g.p.cd = Math.max(g.p.cd, .15); sfx('pick'); g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1, s: WP[id].name, c: WP[id].col }); }
const INV = { sig: '', el: {} };
function invDraw() {
  const g = G, box = $('inv'), l = ownedList(), sig = l.join(',');
  if (sig !== INV.sig) {
    INV.sig = sig; INV.el = {}; box.replaceChildren();
    l.forEach((id, i) => {
      const c = mk('div', 'ic'), a = mk('b', 'ia'); c.style.setProperty('--wc', WP[id].col);
      if (i < 9) c.append(mk('i', 'ik', String(i + 1)));
      c.append(mk('span', 'in', WP[id].name), a);
      c.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); selectWp(id); });
      box.appendChild(c); INV.el[id] = { c, a, k: null };
    });
  }
  for (const id of l) {
    const o = INV.el[id], am = '∞', low = false, sel = id === g.wp, k = am + '|' + low + '|' + sel;
    if (o.k !== k) { o.k = k; o.a.textContent = am; o.c.classList.toggle('sel', sel); o.c.classList.toggle('low', low); }
  }
}
function outOfAmmo() {
  const g = G; g.am[g.wp] = 0; const nx = ownedList().filter(id => id !== 'knife').pop(); g.p.cd = Math.max(g.p.cd, .2);
  if (nx) { setWp(nx); g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1.4, s: 'Plus de munitions : ' + WP[nx].name, c: '#ff4d5e' }); }
  else { g.wp = 'knife'; g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1.4, s: 'Plus de munitions : couteau', c: '#ff4d5e' }); }
}
const pickWeapon = rare => { const l = Object.keys(WP).filter(k => WP[k].tier && WP[k].tier <= dw()).sort((a, b) => WP[a].tier - WP[b].tier); if (!l.length) return null; return rare ? pick(l.slice(-3)) : pick(l.slice(0, Math.max(2, Math.ceil(l.length * .7)))); };
function dropFrom(z) {
  return;   /* aucun bonus, arme ni pouvoir ne tombe au sol */
  const low = lowAmmo(), rw = (z.big ? .3 : z.t === 'brute' ? .1 : z.t === 'tank' ? .06 : z.t === 'juggernaut' ? .08 : .006) + (low ? .004 : 0);
  const wid = Math.random() < rw ? pickWeapon(z.big || z.t === 'brute') : null;
  if (wid) G.dr.push({ x: z.x + rnd(-10, 10), y: z.y, k: 'w', id: wid, l: 20 });
  else if (Math.random() < .04) G.dr.push({ x: z.x, y: z.y, k: 'b', id: low && Math.random() < .4 ? 'ammo' : pick(BP), l: 18 });
  const pr = z.big ? .3 : z.t === 'brute' ? .04 : z.t === 'tank' ? .02 : .003;
  if (Math.random() < pr) G.dr.push({ x: z.x + rnd(-24, 24), y: z.y + rnd(12, 28), k: 'p', id: pick(Object.keys(PW)), l: 25 });
}
function take(d) {
  const g = G, p = g.p;
  if (d.k === 'p') { const pw = PW[d.id]; if (g.ph === d.id) g.pc = Math.min(pch(d.id) * 2, g.pc + pch(d.id)); else { g.ph = d.id; g.pc = pch(d.id); } sfx('pick'); disc('p', d.id, p.x, p.y - 44, 'Pouvoir découvert !'); g.ft.push({ x: p.x, y: p.y - 22, t: 1.4, s: pw.name + ' ×' + g.pc + ' : clic droit', c: pw.col }); return; }
  if (d.k === 'w') { const w = WP[d.id], got = addAmmo(d.id, maxAm(d.id) * PICK_PCT * (1 + .12 * wlv(d.id))); setWp(d.id); g.wk[d.id] = (g.wk[d.id] || 0) + 1; sfx('pick'); disc('w', d.id, p.x, p.y - 44, 'Arme découverte !'); g.ft.push({ x: p.x, y: p.y - 22, t: 1.2, s: w.name + ' +' + got, c: w.col }); return; }
  const b = BONUS[d.id]; sfx('bonus');
  if (d.id === 'ammo') addAmmoAll(BOX_PCT);
  else if (d.id === 'nuke') {
    const R = 520, dmg = 10 + g.wave * 1.2; g.fx.push({ k: 'ring', x: p.x, y: p.y, t: .6, m: .6, r: R, c: '#ff4d5e' });
    g.z.forEach(z => { if (Math.hypot(z.x - p.x, z.y - p.y) > R + z.r) return; z.hp -= z.big ? Math.max(40, z.mx * .05) : dmg; z.fl = .1; gore(z.x, z.y, Math.atan2(z.y - p.y, z.x - p.x), 6, 280); });
    shake = 20; sfx('boom');
  } else g.tmr[d.id] = { shield: 6, speed: 8, x2: 12, freeze: 6, rage: 8, magnet: 12 }[d.id];
  g.ft.push({ x: p.x, y: p.y - 22, t: 1.2, s: b.n, c: b.c });
}
function hurt(d) { const p = G.p; if (p.dead) return; if (G.tmr.shield > 0) return; p.hp -= d * (1 - .03 * G.pk.ar); p.hit = .25; shake = Math.max(shake, 7); sfx('hurt'); }

/* ---------- Pouvoirs (clic droit / E) ---------- */
function usePower() {
  const g = G; if (!g.playing || g.paused || !g.ph || g.pa || g.p.dead) return;
  const id = g.ph, p = g.p; if (--g.pc <= 0) { g.ph = null; g.pc = 0; } g.pu[id] = (g.pu[id] || 0) + 1; sfx(id);
  if (id === 'nova') {
    g.fx.push({ k: 'ring', x: p.x, y: p.y, t: .55, m: .55, r: 290, c: PW.nova.col });
    for (const z of g.z) { const dx = z.x - p.x, dy = z.y - p.y, d = Math.hypot(dx, dy) || 1; if (d < 290) { z.hp -= (z.big ? 8 : 6) * pm('nova'); z.fl = .1; z.kx += dx / d * 250; z.ky += dy / d * 250; gore(z.x, z.y, Math.atan2(dy, dx), 8, 300); } }
    g.eb.length = 0; shake = 16;
  } else if (id === 'thunder') {
    g.z.slice().sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 8).forEach(z => { z.hp -= (z.big ? 10 : 12) * pm('thunder'); z.fl = .15; gore(z.x, z.y, Math.atan2(z.y - p.y, z.x - p.x), 8, 300); g.fx.push({ k: 'bolt', x: p.x, y: p.y, x2: z.x, y2: z.y, t: .3, m: .3, c: PW.thunder.col }); });
    shake = Math.max(shake, 10);
  } else g.pa = { id, t: pdur(id) };
}
function powerTick(dt) {
  const g = G, a = g.pa; if (!a) return; a.t -= dt;
  if (a.id === 'shield') g.tmr.shield = Math.max(g.tmr.shield || 0, .3);
  else if (a.id === 'fury') { g.tmr.rage = Math.max(g.tmr.rage || 0, .3); g.tmr.speed = Math.max(g.tmr.speed || 0, .3); }
  if (a.t <= 0) g.pa = null;
}
let pwKey = '';
function pwUI() {
  const g = G, id = g.pa ? g.pa.id : g.ph, el = $('pw'), key = (id || '') + (g.pa ? 'a' : '');
  el.classList.toggle('on', !!g.ph && !g.pa); el.classList.toggle('act', !!g.pa);
  setT('pwn', g.pa ? Math.ceil(g.pa.t) + ' s' : g.ph ? PW[g.ph].name : 'Aucun'); setT('pwk', g.ph ? 'Clic droit ×' + g.pc : 'Clic droit');
  if (key !== pwKey) {
    pwKey = key; const c = $('pwc'), x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, 70, 64);
    if (id) { x.fillStyle = PW[id].col; x.globalAlpha = .25; x.beginPath(); x.arc(35, 30, 20, 0, 7); x.fill(); x.globalAlpha = 1; x.strokeStyle = PW[id].col; x.lineWidth = 2.5; x.beginPath(); x.arc(35, 30, 20, 0, 7); x.stroke(); x.fillStyle = '#fff'; x.font = '18px Impact,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(PW[id].ab, 35, 31); }
  }
}

/* ---------- Tourelles : tir ---------- */
function bexplode(b) {
  const g = G; sfx('boom'); shake = Math.max(shake, 5);
  g.fx.push({ k: 'ring', x: b.x, y: b.y, t: .3, m: .3, r: b.ex.r, c: '#ff9a3c' }); blood(b.x, b.y, '#ff9a3c', 14, 260);
  for (const z of g.z) { const dx = z.x - b.x, dy = z.y - b.y; if (Math.hypot(dx, dy) < b.ex.r + z.r) { z.hp -= b.ex.d; z.fl = .1; gore(z.x, z.y, Math.atan2(dy, dx), 6, 280); } }
}
function towerStep(dt) {
  const g = G; let shot = false;
  for (const id in g.tw) {
    const t = g.tw[id], K0 = TOW[t.t], pad = PADS[+id], rng = twRng(t); t.cd -= dt; t.sh -= dt; if (K0.unit || K0.eco) continue;   /* caserne, tank, avions : gérés par unitsStep */
    let best = null, bp = -1e18; const r2 = rng * rng;
    for (const z of g.z) {
      const dx = z.x - pad.x, dy = z.y - pad.y; if (dx * dx + dy * dy > r2) continue;
      if (K0.slow) z.tsl = Math.min(z.tsl, 1 - K0.slow - .08 * t.l);   /* la tour de gel ralentit tout ce qui est à portée */
      if (z.pr > bp) { bp = z.pr; best = z; }   /* vise celui qui est le plus avancé sur le chemin */
    }
    if (!best) continue;
    t.ang = Math.atan2(best.y - pad.y, best.x - pad.x);
    if (t.cd > 0) continue;
    t.cd = twRate(t); t.sh = .07; shot = true;
    if (K0.pulse) {   /* Tour sonique : onde de choc autour de la tour */
      const dm = twDmg(t);
      for (const z of g.z) { const dx = z.x - pad.x, dy = z.y - pad.y, d = Math.hypot(dx, dy) || 1; if (d > rng + z.r) continue; z.hp -= dm; z.fl = .1; z.kx += dx / d * 20; z.ky += dy / d * 20; blood(z.x, z.y, z.c, 2, 120); }
      g.fx.push({ k: 'ring', x: pad.x, y: pad.y, t: .4, m: .4, r: rng, c: K0.col }); sfx('hit'); continue;
    }
    if (K0.chain) {   /* Tesla : éclair instantané qui rebondit de zombie en zombie */
      const hit = [best]; let cur = best;
      for (let k = 0; k < K0.chain + t.l; k++) {
        let nx = null, nd = 160 * 160;
        for (const z of g.z) { if (hit.includes(z)) continue; const dx = z.x - cur.x, dy = z.y - cur.y, d2 = dx * dx + dy * dy; if (d2 < nd) { nd = d2; nx = z; } }
        if (!nx) break; hit.push(nx); cur = nx;
      }
      let dm = twDmg(t), px = pad.x + Math.cos(t.ang) * 30, py = pad.y + Math.sin(t.ang) * 30;
      for (const z of hit) { z.hp -= dm; z.fl = .1; blood(z.x, z.y, z.c, 3, 160); g.fx.push({ k: 'bolt', x: px, y: py, x2: z.x, y2: z.y, t: .18, m: .18, c: K0.col }); px = z.x; py = z.y; dm *= .85; }
      sfx('hit'); continue;
    }
    const a = t.ang + rnd(-(K0.sp || .02), K0.sp || .02);
    g.b.push({ x: pad.x + Math.cos(a) * 34, y: pad.y + Math.sin(a) * 34, vx: Math.cos(a) * K0.v, vy: Math.sin(a) * K0.v, l: rng / K0.v + .1, d: twDmg(t), pl: (K0.pl || 0) + (t.l >= 3 && K0.pl !== undefined ? 1 : 0), ex: K0.ex ? { r: K0.ex * (1 + .1 * t.l), d: K0.exd * (1 + .7 * t.l) } : null, h: [], c: K0.col, tw: 1 });
  }
  return shot;
}
function stepBullet(b, dt) {
  const g = G, sp = Math.hypot(b.vx, b.vy) || 1, n = Math.max(1, Math.min(12, Math.ceil(sp * dt / 12))), sd = dt / n;
  for (let s = 0; s < n; s++) {
    b.x += b.vx * sd; b.y += b.vy * sd; b.l -= sd;
    if (b.l <= 0) return true;
    for (const z of g.z) {
      const zx = b.x - z.x, zy = b.y - z.y, zr = z.r + 4;
      if (zx > zr || zx < -zr || zy > zr || zy < -zr) continue;
      if (b.h.includes(z)) continue;
      if (zx * zx + zy * zy < zr * zr) {
        z.hp -= b.d; z.fl = .08; const a = Math.atan2(b.vy, b.vx); z.kx += Math.cos(a) * 10; z.ky += Math.sin(a) * 10;
        blood(b.x, b.y, z.c, 2, 120); gore(b.x, b.y, a, b.tw ? 3 : (b.d > 4 ? 14 : 6), 400); sfx('hit');
        if (b.pl > 0) { b.pl--; b.h.push(z); } else return true;
      }
    }
  }
  return false;
}

/* ---------- Boutique et menus ---------- */
let shMode = 'shop', shPad = null, shTab = 'w';
function show(id) { ['over', 'pause', 'shop', 'help'].forEach(s => $(s).classList.toggle('hide', s !== id)); }
function hud(v) { ['hud', 'hbot', 'vbar', 'hlp', 'mm'].forEach(i => $(i).classList.toggle('hide', !v)); if (!v) { $('shp').classList.add('hide'); $('dem').classList.add('hide'); } }
function nearSpot() {
  const g = G, p = g.p; if (!g.playing || p.dead) return null;
  if (Math.hypot(p.x - SHOP.x, p.y - SHOP.y) < SHOP.use) return { k: 'shop', t: 'Boutique' };
  for (const pad of PADS) if (pad.x >= XL && Math.hypot(p.x - pad.x, p.y - pad.y) < 95) { const t = g.tw[pad.id]; return { k: 'pad', pad, t: t ? 'Améliorer : ' + TOW[t.t].n + ' (niv. ' + (t.l + 1) + ')' : 'Construire une tourelle' }; }
  return null;
}
function openShop() {
  const g = G; if (!g.playing || g.paused || g.p.dead) return; const sp = nearSpot(); if (!sp) return;
  shMode = sp.k; shPad = sp.pad || null; g.paused = true; g.shop = true; down = false; for (const kk in K) K[kk] = 0;
  shopRender(); show('shop'); sfx('pick');
}
function demolish(pad) {
  const g = G, t = g.tw[pad.id]; if (!t) return; const K0 = TOW[t.t], ref = Math.round(t.inv * SELL);
  g.cash += ref; delete g.tw[pad.id]; g.dem = null;
  /* animation de destruction : la tourelle s'écrase, flash, gravats, poussière, onde de choc */
  g.fx.push({ k: 'crumble', x: pad.x, y: pad.y, t: .8, m: .8, ty: t.t, tl: t.l, ang: t.ang });
  g.fx.push({ k: 'dust', x: pad.x, y: pad.y, t: 1.1, m: 1.1, r: 80, c: '#a9a39a', sd: Math.random() * 99 });
  g.fx.push({ k: 'flash', x: pad.x, y: pad.y, t: .22, m: .22, r: 90, c: '#fff3c4' });
  g.fx.push({ k: 'ring', x: pad.x, y: pad.y, t: .5, m: .5, r: 120, c: K0.col });
  blood(pad.x, pad.y, '#8a8f99', 26, 340); blood(pad.x, pad.y, '#5b5f68', 18, 260); blood(pad.x, pad.y, K0.col, 16, 300); blood(pad.x, pad.y, '#ffb347', 12, 380);
  shake = Math.max(shake, 12); sfx('boom');
  g.ft.push({ x: pad.x, y: pad.y - 50, t: 1.8, s: K0.n + ' détruite : +' + ref, c: '#c8a070' });
}
function openHelp() { const g = G; if (!g.playing || g.shop || g.help) return; g.help = true; g.hwp = g.paused; g.paused = true; down = false; for (const kk in K) K[kk] = 0; show('help'); sfx('pick'); }
function closeHelp() { const g = G; if (!g.help) return; g.help = false; g.paused = g.hwp; show(g.hwp ? 'pause' : null); sfx('pick'); }
function closeShop() { if (!G.shop) return; G.shop = false; G.paused = false; show(null); }
const coinEl = () => mk('i', 'coin');
function shopRow(ic, name, desc, cost, label, can, act) {
  const r = mk('div', 'it' + (can ? ' can' : '')), c = document.createElement('canvas'); c.width = c.height = 80;
  const x = c.getContext('2d'); x.translate(40, 40); ic(x);
  const tx = mk('div', 'tx'); tx.append(mk('b', '', name), mk('small', '', desc));
  const b = mk('button', 'buy'); b.type = 'button';
  if (label) b.append(mk('span', '', label));
  if (cost != null) b.append(mk('span', '', fmt(cost)), coinEl());
  b.disabled = !can; b.onclick = () => { act(); sfx('coin'); shopRender(); };
  r.append(c, tx, b); return r;
}
const icW = id => x => { x.fillStyle = WP[id].col; x.globalAlpha = .2; x.beginPath(); x.arc(0, 0, 32, 0, 7); x.fill(); x.globalAlpha = 1; x.save(); x.scale(.85, .85); wArt(x, id, WP[id].col); x.restore(); };
const icG = (t, col) => x => { x.fillStyle = col; x.beginPath(); x.arc(0, 0, 26, 0, 7); x.fill(); x.fillStyle = '#10141f'; x.font = (t.length > 1 ? 22 : 32) + 'px Impact,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 0, 2); };
const icT = (key, l) => x => { x.scale(.82, .82); towerArt(x, key, l, -.6, 0); };
const ownsW = id => id === 'pistol' || !!G.own[id];
function refillCost(id) { return 0;
   const mx = maxAm(id), am = G.am[id] || 0; if (am >= mx) return 0; const full = id === 'pistol' ? 15 : Math.max(8, Math.round(WPRICE[id] * .35)); return Math.max(3, Math.ceil(full * (mx - am) / mx)); }
function buyWeapon(id) { const g = G, pr = WPRICE[id]; if (ownsW(id) || g.cash < pr) return; g.cash -= pr; g.own[id] = 1; g.am[id] = 0; addAmmo(id, maxAm(id)); setWp(id); g.ft.push({ x: g.p.x, y: g.p.y - 30, t: 1.4, s: WP[id].name, c: WP[id].col }); }
function buyAmmo(id) { const g = G, c = refillCost(id); if (!c || g.cash < c) return; g.cash -= c; addAmmo(id, maxAm(id)); }
function shopWeapons(box) {
  const g = G, own = SHOP_W.filter(ownsW), tot = own.reduce((a, id) => a + refillCost(id), 0), all = Math.round(tot * .85);
  for (const id of SHOP_W) {
    const w = WP[id], mx = maxAm(id), am = g.am[id] || 0, ds = 'Dégâts ' + w.dmg + (w.n > 1 ? ' ×' + w.n : '') + ' · ' + (w.auto ? 'automatique' : 'coup par coup') + (w.pl ? ' · perforant' : '') + (w.ex ? ' · explosif' : '') + '.';
    if (!ownsW(id)) { const pr = WPRICE[id]; box.appendChild(shopRow(icW(id), w.name, ds, pr, 'Acheter', g.cash >= pr, () => buyWeapon(id))); }
    else { const c = refillCost(id); box.appendChild(shopRow(icW(id), w.name, 'Possédée · munitions infinies. ' + ds, null, 'Possédée', false, () => {})); }
  }
}
const baseUpCost = () => 300 * (G.base.lv + 1), BASE_UP_MAX = 10;
function shopBase(box) {
  const g = G, p = g.p, b = g.base, miss = b.mhp - b.hp, rc = miss > .5 ? Math.max(10, Math.ceil(miss * 2 * (1 + .03 * g.wave))) : 0;
  const hc = Math.ceil(25 * (1 + .03 * g.wave)), full = b.lv >= BASE_UP_MAX, uc = baseUpCost();
  box.append(
    shopRow(icG('B', '#c8a070'), 'Réparer la base', 'PV de la base : ' + Math.ceil(b.hp) + ' / ' + b.mhp + '. Chaque zombie qui arrive au bout du chemin lui en retire.', rc || null, rc ? 'Réparer' : 'Intacte', rc > 0 && g.cash >= rc, () => { g.cash -= rc; b.hp = b.mhp; g.fx.push({ k: 'ring', x: BASEP.x, y: BASEP.y, t: .6, m: .6, r: 140, c: '#5fd6a0' }); }),
    shopRow(icG('B+', '#ff9a3c'), 'Renforcer la base', '+50 PV maximum, répare 50 PV et embellit la base (niveau ' + b.lv + ' / ' + BASE_UP_MAX + ').', full ? null : uc, full ? 'Maximum' : 'Renforcer', !full && g.cash >= uc, () => { g.cash -= uc; b.lv++; b.mhp += 50; b.hp = Math.min(b.mhp, b.hp + 50); sfx('wave'); shake = Math.max(shake, 8); g.fx.push({ k: 'ring', x: BASEP.x, y: BASEP.y, t: .8, m: .8, r: 200, c: '#ffd24a' }); g.ft.push({ x: BASEP.x - 40, y: BASEP.y - 90, t: 2, s: 'Base niveau ' + b.lv + ' !', c: '#ffd24a' }); }),
    shopRow(icG('+', '#ff4d5e'), 'Trousse de soins', 'Vous rend 50 PV (' + Math.ceil(p.hp) + ' / ' + p.mhp + ').', p.hp < p.mhp ? hc : null, p.hp < p.mhp ? 'Se soigner' : 'PV pleins', p.hp < p.mhp && g.cash >= hc, () => { g.cash -= hc; p.hp = Math.min(p.mhp, p.hp + 50); })
  );
}
function applyPerk(k) { const g = G; g.pk[k.id]++; if (k.id === 'hp') { g.p.mhp += 10; g.p.hp = Math.min(g.p.mhp, g.p.hp + 10); } if (k.id === 'am') addAmmoAll(.2); }
function shopUpg(box) {
  const g = G;
  for (const k of PERKS) { const lv = g.pk[k.id], c = k.p * (lv + 1), mx = lv >= k.mx; box.appendChild(shopRow(icG(k.g, '#ffb347'), k.n + (lv ? ' (niv. ' + lv + ')' : ''), k.d, mx ? null : c, mx ? 'Maximum' : 'Acheter', !mx && g.cash >= c, () => { g.cash -= c; applyPerk(k); })); }
}
function twInfo(t) { if (TOW[t.t].inf) return TOW[t.t].inf(t); return 'Dégâts ' + (Math.round(twDmg(t) * 10) / 10) + ' · portée ' + Math.round(twRng(t)) + ' · ' + (1 / twRate(t)).toFixed(1) + ' tirs/s'; }
function shopPad(box) {
  const g = G, pad = shPad, t = g.tw[pad.id];
  if (!t) {
    box.appendChild(mk('p', 'note', 'Emplacement libre. Choisissez une tourelle : elle tirera seule sur les zombies qui passent sur le chemin. Chaque tourelle peut être améliorée 3 fois.'));
    for (const key of towList()) {
      const K0 = TOW[key];
      const lim = TLIM[key], used = lim ? tCount(key) : 0, capped = !!lim && used >= lim;
      box.appendChild(shopRow(icT(key, 0), K0.n, K0.d + (K0.eco ? '' : ' Portée ' + K0.rng + '.') + (lim ? ' Maximum ' + lim + ' par partie (' + used + ' / ' + lim + ').' : ''), capped ? null : K0.p, capped ? 'Limite atteinte' : 'Construire', !capped && g.cash >= K0.p, () => {
        if (capped) return; g.cash -= K0.p; g.tw[pad.id] = { id: pad.id, t: key, l: 0, cd: 0, ang: -1.57, sh: 0, inv: K0.p }; sfx('build');
        g.ft.push({ x: pad.x, y: pad.y - 60, t: 2, s: K0.n + ' construite !', c: K0.col }); g.fx.push({ k: 'ring', x: pad.x, y: pad.y, t: .5, m: .5, r: 90, c: K0.col }); closeShop();
      }));
    }
    return;
  }
  const K0 = TOW[t.t];
  box.appendChild(shopRow(icT(t.t, t.l), K0.n + ' · niveau ' + (t.l + 1) + ' / ' + (TW_MAX + 1), K0.d + ' ' + twInfo(t) + '.', null, 'Niveau ' + (t.l + 1), false, () => {}));
  if (t.l < TW_MAX) {
    const c = twUp(t), n = { l: t.l + 1, t: t.t };
    box.appendChild(shopRow(icT(t.t, t.l + 1), 'Améliorer', 'Niveau ' + (t.l + 2) + ' : ' + twInfo(n) + '.', c, 'Améliorer', g.cash >= c, () => {
      g.cash -= c; t.inv += c; t.l++; sfx('build'); g.ft.push({ x: pad.x, y: pad.y - 60, t: 2, s: K0.n + ' niveau ' + (t.l + 1) + ' !', c: '#ffd24a' }); g.fx.push({ k: 'ring', x: pad.x, y: pad.y, t: .6, m: .6, r: 110, c: '#ffd24a' }); closeShop();
    }));
  } else box.appendChild(mk('p', 'note', 'Cette tourelle est au niveau maximum.'));
  const ref = Math.round(t.inv * SELL);
  box.appendChild(shopRow(icG('$', '#c8a070'), 'Vendre', 'Récupère ' + Math.round(SELL * 100) + ' % de ce que vous avez dépensé sur cette tourelle. L’emplacement redevient libre.', ref, 'Vendre', true, () => {
    g.cash += ref; delete g.tw[pad.id]; g.ft.push({ x: pad.x, y: pad.y - 50, t: 1.6, s: 'Tourelle vendue', c: '#c8a070' }); closeShop();
  }));
}
function shopMap(box) {
  const g = G, full = UNL >= INF_N - 1, c = full ? 0 : EXP_COST[UNL], idle = true, np = PADS.filter(q => q.x >= XL).length;
  box.append(shopRow(icG('+', '#7fe3d0'), 'Agrandir la carte (zone ' + UNL + ' / ' + (INF_N - 1) + ')',
    'Ouvre une nouvelle zone : chemin plus long, plus d\u2019emplacements de tourelles (' + np + ' ouverts) et plus de distance de tir. Possible même pendant une vague : les zombies déjà présents restent où ils sont, les suivants apparaissent dans la nouvelle zone.',
    full ? null : c, full ? 'Carte complète' : idle ? 'Agrandir' : 'Entre deux vagues', !full && idle && g.cash >= c, expandMap));
}
function shopRender() {
  const g = G; if (!g.shop) return;
  const box = $('shL'), st = box.scrollTop; box.replaceChildren(); $('shc').textContent = fmt(g.cash);
  $('shT').textContent = shMode === 'pad' ? (g.tw[shPad.id] ? 'Amélioration' : 'Construire une tourelle') : 'Boutique';
  { const mb = document.querySelector('#shTabs button[data-t="m"]'); if (mb) mb.classList.toggle('hide', !LV().inf); if (shTab === 'm' && !LV().inf) shTab = 'w'; }
  $('shTabs').classList.toggle('hide', shMode !== 'shop');
  document.querySelectorAll('#shTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === shTab));
  if (shMode === 'pad') shopPad(box); else if (shTab === 'w') shopWeapons(box); else if (shTab === 'v') shopBase(box); else if (shTab === 'm') shopMap(box); else shopUpg(box);
  box.scrollTop = st;
}

/* ---------- Partie ---------- */
let sentCash = 0;
function start(lv) {
  lv = Math.max(1, Math.min(LEVELS.length, Math.floor(+lv || 1))); if (lv <= NSTORY && lv > PROG.tl) lv = PROG.tl;
  audio(); Object.keys(K).forEach(k => K[k] = 0); sentCash = 0;
  buildMap(lv); G = makeState(lv); G.playing = true; G.am.pistol = maxAm('pistol');
  const m = $('menu'); if (m) m.classList.add('hide');
  clearTimeout(bannerTm); $('banner').classList.add('hide'); show(null); hud(true); down = false; edge = 0; INV.sig = ''; pwKey = ''; HUDC.mats = null;
  $('btnNext').classList.add('hide');
  G.ft.push({ x: G.p.x, y: G.p.y - 60, t: 5, s: 'Posez des tourelles sur les dalles : touche B', c: '#ffd24a' });
  post({ type: 'tower-start', lv });
  nextWave();
}
let bannerTm = 0;
function banner(txt, ms) { const bn = $('banner'); clearTimeout(bannerTm); bn.textContent = txt; bn.classList.remove('hide'); bn.style.animation = 'none'; void bn.offsetWidth; bn.style.animation = ''; bannerTm = setTimeout(() => bn.classList.add('hide'), ms || 2400); }
function nextWave() {
  const g = G; g.wave++;
  if (g.wave > 1) {
    g.dol.w += 8 * incF();
    const bonus = Math.round((WAVE_BONUS + WAVE_BONUS_STEP * (g.wave - 1)) * (1 + .1 * (g.lv - 1)) * incF()); g.cash += bonus; g.ft.push({ x: g.p.x, y: g.p.y - 86, t: 2.6, s: 'Fin de vague : +' + bonus, c: '#ffd24a' }); sfx('coin');
    for (const id in g.tw) { const t = g.tw[id]; if (!TOW[t.t].eco) continue; const inc = bankInc(t); g.cash += inc; g.ft.push({ x: PADS[+id].x, y: PADS[+id].y - 56, t: 2.4, s: 'Banque : +' + inc, c: '#ffd24a', coin: true }); }
  }
  addAmmo('pistol', 30);
  const L = LV(), last = g.wave === L.waves, bossW = g.wave % 5 === 0 || last;
  sfx('wave'); g.spawnLeft = Math.max(3, Math.round(waveCount(dw()) * L.cnt * Math.min(1, .6 + .1 * (g.wave - 1)) * lng(.02) * (infHard() ? 1 + (g.wave - 9) * .03 : 1))); g.spawnT = 1.2; g.brk = 0;
  banner((g.wave === 1 ? (L.inf ? L.n : 'Niveau ' + g.lv + ' : ' + L.n) + ' · ' : '') + (last ? 'Dernière vague (' + g.wave + '/' + L.waves + ') : un colosse arrive' : bossW ? 'Vague ' + g.wave + ' : un colosse arrive' : 'Vague ' + g.wave), g.wave === 1 ? 3600 : 0);
  if (bossW) for (let k = 0; k < 1 + Math.floor(dw() / 25) + (last && g.lv >= 6 ? 1 : 0); k++) spawnZ('boss');
}
function end(why) {
  const g = G; if (g.over) return; g.over = true; g.playing = false; hud(false); closeShop();
  const L = LV(), win = why === 'win', key = 'l' + g.lv;
  sfx(win ? 'wave' : 'over');
  if (win) g.dol.w += 20 * g.lv;
  const perfect = win;   /* niveau réussi à 100 % = toutes les vagues tenues sans que la base soit détruite (même abîmée) */
  const stars = win ? (g.base.hp >= g.base.mhp * .9 ? 3 : g.base.hp >= g.base.mhp * .5 ? 2 : 1) : 0;
  if (win) { PROG.st[key] = Math.max(PROG.st[key] || 0, stars); if (perfect && g.lv >= PROG.tl && g.lv < NSTORY) PROG.tl = g.lv + 1; }
  const bestB = PROG.bs[key] || 0, rec = g.score > bestB; if (rec) PROG.bs[key] = g.score;
  saveProg();
  const gn = API.cash(g);
  post({ type: 'tower-end', why, lv: g.lv, win, perfect, stars, tl: PROG.tl, score: g.score, wave: g.wave, kills: g.kills, bc: g.bc, dist: g.dist, t: g.t, shots: g.shots, zk: g.zk, wk: g.wk, pu: g.pu, nd: g.nd, dol: g.dol, towers: towerCount() });
  show('over');
  $('ovT').textContent = win ? 'Niveau ' + g.lv + ' réussi !' : why === 'quit' ? 'Partie abandonnée' : 'La base est tombée';
  $('fs').textContent = g.score;
  $('fd').textContent = (L.inf ? L.n + ' : vague ' + g.wave + ' atteinte, ' : 'Niveau ' + g.lv + ' · ' + L.n + ' : vague ' + g.wave + ' / ' + L.waves + ', ') + '' + g.kills + ' zombies abattus. ' + (rec ? 'Nouveau record !' : 'Record du niveau : ' + bestB);
  $('fc').textContent = (win ? '★'.repeat(stars) + '☆'.repeat(3 - stars) + ' · ' + (g.lv < NSTORY ? 'Niveau ' + (g.lv + 1) + ' débloqué !' : 'Tous les niveaux sont terminés !') + ' · ' : '') + 'Tourelles posées : ' + towerCount() + ' · Zombies arrivés au bout : ' + g.leak + (HOSTED ? ' · +' + gn.total + ' $' : '');
  $('btnNext').classList.toggle('hide', !(perfect && g.lv < NSTORY));
}
function setPause(v) { G.paused = v; K.x = 0; show(v ? 'pause' : null); }
function leak(z) {
  const g = G, d = Math.max(3, Math.round(z.pts * 1.2 * (z.dm || 1))); g.base.hp -= d; g.base.fl = .25; g.leak++; shake = Math.max(shake, 9); sfx('hurt');
  g.ft.push({ x: BASEP.x - 40, y: BASEP.y - 70, t: 1.6, s: 'Base touchée ! -' + d, c: '#ff4d5e' }); blood(BASEP.x - 60, BASEP.y, '#ff4d5e', 12, 240);
}
function boom(z) {
  const g = G, p = g.p; sfx('boom'); blood(z.x, z.y, '#ff9a3c', 30, 320); shake = Math.max(shake, 8);
  g.fx.push({ k: 'ring', x: z.x, y: z.y, t: .3, m: .3, r: 95, c: '#ff9a3c' });
  g.z.forEach(o => { if (o !== z && Math.hypot(o.x - z.x, o.y - z.y) < 95) o.hp -= 8; });
}

/* ---------- Unités alliées : gardes (caserne), tank, avions ---------- */
const GUARD_N = [2, 3, 5, 7], PLANE_N = [1, 2, 2, 3];   /* soldats / avions selon le niveau de la tourelle */
/* Soldats de la caserne : chacun porte une arme du jeu (WP), dans l'ordre de son emplacement (GW).
   hp / rg = PV et portée des soldats du menu de recrutement (réduits pour cette carte par SOLD_HPM et SOLD_RG) · couleurs = celles du menu */
const GW = ['rifle', 'smg', 'shotgun', 'sniper', 'mini', 'launcher', 'laser'];
const SOLD = {
  rifle:    { nm: 'Fusilier',          hp: 140, rg: 720,  body: '#7d8a2e', dk: '#4a5420', head: '#5c6a22' },
  smg:      { nm: 'Mitrailleur',       hp: 130, rg: 600,  body: '#5b87a6', dk: '#2e4d66', head: '#3f6f94' },
  shotgun:  { nm: 'Fusilier à pompe',  hp: 180, rg: 340,  body: '#96623a', dk: '#58361a', head: '#704826' },
  sniper:   { nm: 'Tireur d’élite',    hp: 110, rg: 1000, body: '#46634a', dk: '#26382a', head: '#35523a' },
  launcher: { nm: 'Grenadier',         hp: 150, rg: 640,  body: '#b03a26', dk: '#661e12', head: '#8f2c1c' },
  mini:     { nm: 'Mitrailleur lourd', hp: 240, rg: 620,  body: '#45454b', dk: '#1a1a1e', head: '#2e2e33' },
  laser:    { nm: 'Soldat laser',      hp: 160, rg: 800,  body: '#8a46bd', dk: '#4a2670', head: '#a05cd6' }
};
const SOLD_RG = .5, SOLD_HPM = .4, SOLD_DM = .55, SOLD_RT = 2.4;   /* portée · PV · dégâts · lenteur de tir, par rapport aux armes du jeu */
const MZ = { smg: 24, rifle: 30, shotgun: 29, sniper: 34, launcher: 31, mini: 31, laser: 29 };   /* distance du bout du canon */
const soldRng = (id, l) => SOLD[id].rg * SOLD_RG * (1 + .06 * l);
const soldHp = (id, l) => SOLD[id].hp * SOLD_HPM * (1 + .5 * l) * lvm();
const soldDm = l => SOLD_DM * (1 + .5 * l) * lvm();
const ZRANGED = { spit: 170, archer: 210 };   /* zombies qui attaquent à distance les soldats et les tanks (les autres : au corps à corps) */
const lvm = () => 1 + .1 * (G.lv - 1);   /* les unités gagnent un peu en force à chaque niveau du jeu */
let _pc = null, _pp = null;
function pcum() { if (_pp !== PATH) { _pp = PATH; _pc = [0]; for (let i = 1; i < PATH.length; i++) _pc[i] = _pc[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]); } return _pc; }
function pathAt(s) {   /* position et direction (sens des zombies) à la distance s du début du chemin */
  const c = pcum(); s = clamp(s, 0, c[c.length - 1]); let i = 1; while (i < c.length - 1 && c[i] < s) i++;
  const a = PATH[i - 1], b = PATH[i], l = (c[i] - c[i - 1]) || 1, u = (s - c[i - 1]) / l;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, Math.atan2(b[1] - a[1], b[0] - a[0])];
}
function nearPath(x, y) {
  let m = 1e9;
  for (let i = 1; i < PATH.length; i++) {
    const a = PATH[i - 1], b = PATH[i], sx = b[0] - a[0], sy = b[1] - a[1], l2 = sx * sx + sy * sy || 1, u = clamp(((x - a[0]) * sx + (y - a[1]) * sy) / l2, 0, 1);
    m = Math.min(m, Math.hypot(x - a[0] - sx * u, y - a[1] - sy * u));
  }
  return m;
}
function pickOff() {   /* décalage latéral aléatoire, le plus éloigné possible des autres soldats */
  let bo = 0, bs = -1;
  for (let k = 0; k < 8; k++) { const c = rnd(-26, 26); let mn = 99; for (const v of G.gd) if (v.k === 'soldier') mn = Math.min(mn, Math.abs(v.off - c)); if (mn > bs) { bs = mn; bo = c; } }
  return bo;
}
function unitsStep(dt) {
  const g = G, tot = pcum()[PATH.length - 1], sfxOk = (g.us = (g.us || 0) - 1) <= 0;
  g.gd = g.gd.filter(u => g.tw[u.own]); g.pl = g.pl.filter(q => g.tw[q.own]);   /* tourelle vendue ou détruite : ses unités disparaissent */
  const m = lvm();
  for (const id in g.tw) {
    const t = g.tw[id], K0 = TOW[t.t]; if (!K0.unit) continue;
    if (K0.unit === 'plane') { let have = g.pl.filter(q => q.own === id).length; const n = PLANE_N[t.l]; while (have < n) { g.pl.push({ own: id, a: have * 6.283 / n, cd: .8, x: PADS[+id].x, y: PADS[+id].y, h: 0 }); have++; } continue; }
    const tank = K0.unit === 'tank', cap = tank ? 1 : GUARD_N[t.l], mine = g.gd.filter(u => u.own === id).length;
    if (t.sp == null) t.sp = 1;
    if (mine < cap) {
      t.sp -= dt;
      if (t.sp <= 0) {
        t.sp = tank ? 9 : 2.2; let si = 0, wid = null;
        if (!tank) { const used = g.gd.filter(u => u.own === id).map(u => u.si); while (used.includes(si)) si++; wid = GW[Math.min(si, GW.length - 1)]; }   /* arme selon l'emplacement libre */
        const p0 = pathAt(tot), hp = tank ? 260 * (1 + .7 * t.l) * m : soldHp(wid, t.l), off = tank ? 0 : pickOff();
        { const bx0 = p0[0] - Math.sin(p0[2]) * off, by0 = p0[1] + Math.cos(p0[2]) * off; if (g.gd.some(v => Math.hypot(v.x - bx0, v.y - by0) < v.r + (tank ? 24 : 12) + 5)) { t.sp = .5; continue; } }   /* la place d'apparition est occupée : on attend un peu */
        g.gd.push({ own: id, k: tank ? 'tank' : 'soldier', w: wid, si, off, s: tot, x: p0[0] - Math.sin(p0[2]) * off, y: p0[1] + Math.cos(p0[2]) * off, ang: p0[2] + Math.PI, ha: p0[2] + Math.PI, hp, mhp: hp, cd: .4, fl: 0, hf: 0, ph: Math.random() * 6, mv: 0, r: tank ? 24 : 12, sp: tank ? 48 : 62 });
        g.fx.push({ k: 'ring', x: p0[0], y: p0[1], t: .4, m: .4, r: tank ? 60 : 36, c: K0.col }); sfx('pick');
      }
    } else t.sp = Math.max(t.sp, tank ? 6 : 1.5);
  }
  for (let i = g.gd.length - 1; i >= 0; i--) {
    const u = g.gd[i], t = g.tw[u.own], l = t.l, tank = u.k === 'tank', W0 = tank ? null : WP[u.w], rng = tank ? twRng(t) : soldRng(u.w, l);
    u.fl -= dt; u.cd -= dt; u.hf -= dt; u.mv = 0;
    let best = null, bd = rng * rng;
    for (const z of g.z) {
      const dx = z.x - u.x, dy = z.y - u.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = z; }
    }   /* les zombies attaquent eux-mêmes les unités (voir la boucle des zombies dans update) */
    if (u.hp <= 0) {
      blood(u.x, u.y, tank ? '#6f8148' : SOLD[u.w].body, tank ? 40 : 14, 260); gore(u.x, u.y, rnd(0, 6.28), tank ? 16 : 8, 260);
      g.fx.push({ k: 'ring', x: u.x, y: u.y, t: .4, m: .4, r: tank ? 90 : 40, c: '#ff9a3c' });
      if (tank) { g.fx.push({ k: 'flash', x: u.x, y: u.y, t: .3, m: .3, r: 120, c: '#ffd27a' }, { k: 'dust', x: u.x, y: u.y, t: 1.2, m: 1.2, r: 90, c: '#6b665c', sd: Math.random() * 99 }); sfx('boom'); shake = Math.max(shake, 8); }
      g.ft.push({ x: u.x, y: u.y - 30, t: 1.4, s: tank ? 'Tank détruit !' : SOLD[u.w].nm + ' tombé', c: '#ff8a96' }); t.sp = tank ? 9 : 3; g.gd.splice(i, 1); continue;
    }
    if (best) {
      u.ang = Math.atan2(best.y - u.y, best.x - u.x);
      if (u.cd <= 0) {
        if (tank) {
          const dm = 5 * (1 + .7 * l) * m, v = 620; u.fl = .08; u.cd = 1.5 * Math.pow(.9, l);
          g.b.push({ x: u.x + Math.cos(u.ang) * 44, y: u.y + Math.sin(u.ang) * 44, vx: Math.cos(u.ang) * v, vy: Math.sin(u.ang) * v, l: rng / v + .1, d: dm * .4, pl: 0, ex: { r: 80 + 8 * l, d: dm }, h: [], c: '#ffb347' });
          blood(u.x + Math.cos(u.ang) * 46, u.y + Math.sin(u.ang) * 46, '#ffd27a', 5, 170);
          if (sfxOk) { g.us = 3; sfx('boom'); }
        } else {   /* le soldat tire avec les caractéristiques de son arme (WP) */
          const dm = soldDm(l), mz = MZ[u.w]; u.fl = .08; u.cd = W0.rate * SOLD_RT * Math.pow(.92, l);
          for (let k = 0; k < W0.n; k++) {
            const a = u.ang + rnd(-W0.sp, W0.sp) / 2;
            g.b.push({ x: u.x + Math.cos(a) * mz, y: u.y + Math.sin(a) * mz, vx: Math.cos(a) * W0.v, vy: Math.sin(a) * W0.v, l: rng / W0.v + .1, d: W0.dmg * dm, pl: W0.pl, ex: W0.ex ? { r: W0.ex.r * .8, d: W0.ex.d * dm } : null, h: [], c: W0.col });
          }
          if (sfxOk) { g.us = 3; if (u.w === 'shotgun' || u.w === 'sniper' || u.w === 'launcher') shotSfx(u.w); else sfx('twshot'); }
        }
      }
    } else if (u.s > unitStop(u)) {
      const ns = u.s - u.sp * dt, np = pathAt(ns), nx = np[0] - Math.sin(np[2]) * u.off, ny = np[1] + Math.cos(np[2]) * u.off;
      let blk = false;   /* bloqué par l'unité qui est devant : on ne peut pas se rentrer dedans */
      for (let j = 0; j < g.gd.length; j++) { const v = g.gd[j]; if (v === u || v.s > u.s || (v.s === u.s && j > i)) continue; if (Math.hypot(v.x - nx, v.y - ny) < u.r + v.r + 4) { blk = true; break; } }
      if (!blk) { u.s = ns; u.mv = 1; u.ph += u.sp * dt * (tank ? 1 : .14); u.x = nx; u.y = ny; u.ang = u.ha = np[2] + Math.PI; }
      else { const p = pathAt(u.s); u.ha = p[2] + Math.PI; }
    }
    else { const p = pathAt(u.s); u.ha = p[2] + Math.PI; }
    if (best && tank) { const p = pathAt(u.s); u.ha = p[2] + Math.PI; }
  }
  for (const q of g.pl) {   /* avions : ils tournent autour de leur emplacement et bombardent au-dessus du chemin */
    const t = g.tw[q.own], pad = PADS[+q.own], R = twRng(t) * .9, l = t.l;
    q.a += (210 + 15 * l) / R * dt; q.x = pad.x + Math.cos(q.a) * R; q.y = pad.y + Math.sin(q.a) * R * .75; q.h = Math.atan2(Math.cos(q.a) * .75, -Math.sin(q.a)); q.cd -= dt;
    if (q.cd <= 0 && nearPath(q.x, q.y) < 46) {
      const br = 60 + 8 * l; let hit = false;
      for (const z of g.z) if (Math.hypot(z.x - q.x, z.y - q.y) < br + 70) { hit = true; break; }
      if (hit) { g.pb.push({ x: q.x, y: q.y, t: .55, m: .55, ex: { r: br, d: 6 * (1 + .7 * l) * m } }); q.cd = .5 - .05 * l; sfx('twshot'); }
    }
  }
  for (let i = g.pb.length - 1; i >= 0; i--) { const b = g.pb[i]; b.t -= dt; if (b.t <= 0) { bexplode(b); g.pb.splice(i, 1); } }
}

/* ---------- Mise à jour ---------- */
const camAx = (p, V, M) => M <= V ? (M - V) / 2 : clamp(p - V / 2, 0, M - V);   /* carte plus petite que l'écran : elle reste centrée */
function cam() { return [XL + camAx(G.p.x - XL, W, WW - XL), camAx(G.p.y, H, WH)]; }
function update(dt) {
  const g = G, p = g.p; g.t += dt; edge -= dt; g.ct -= dt; if (g.ct <= 0) g.combo = 0; g.flash -= dt; g.base.fl -= dt;
  for (const k in g.tmr) g.tmr[k] -= dt;
  const [cx, cy] = cam();
  /* ----- joueur ----- */
  let x = (K.r ? 1 : 0) - (K.l ? 1 : 0), y = (K.d ? 1 : 0) - (K.u ? 1 : 0);
  const kl = Math.hypot(x, y); if (kl > 1) { x /= kl; y /= kl; }
  if (p.dead) { x = 0; y = 0; }
  if (g.dc > 0) g.dc -= dt;
  if (K.s && g.dc <= 0 && (x || y)) { p.dt = .15; g.dc = 1.6; sfx('dash'); }
  p.dt = Math.max(0, p.dt - dt);
  const spd = (g.tmr.speed > 0 ? 300 : 215) * (p.dt > 0 ? 3.2 : 1) * (1 + .05 * g.pk.sp);
  p.x = clamp(p.x + x * spd * dt, XL + p.r, WW - p.r); p.y = clamp(p.y + y * spd * dt, p.r, WH - p.r);
  solid(p);   /* ni arbres, ni boutique, ni base : ce sont des murs */
  g.dist += Math.hypot(p.x - g.lx, p.y - g.ly) / 40; g.lx = p.x; g.ly = p.y;
  { const dd = Math.floor(g.dist / 10) - g.dpd; if (dd > 0) { g.dpd += dd; g.dol.d += dd; } }
  p.hit = Math.max(0, p.hit - dt); p.cd -= dt; p.sl = Math.max(0, (p.sl || 0) - dt);
  /* ----- visée et tir ----- */
  const w = WP[g.wp]; p.ang = Math.atan2(my + cy - p.y, mx + cx - p.x);
  const want = w.auto ? down : edge > 0;
  if (want && p.cd <= 0 && !p.dead) {
    const lv = wlv(g.wp), dm = (1 + .15 * lv) * (1 + .06 * g.pk.dm);
    p.cd = Math.max(-dt, p.cd) + w.rate * (1 - .05 * lv) * Math.pow(.96, g.pk.rt) * (g.tmr.rage > 0 ? .5 : 1); edge = 0; g.shots++; shotSfx(g.wp); g.flash = .06;
    if (g.wp === 'knife') { p.sd = -(p.sd || 1); p.sl = .24; }
    for (let i = 0; i < w.n; i++) {
      const a = p.ang + rnd(-w.sp, w.sp) / 2;
      g.b.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, vx: Math.cos(a) * w.v, vy: Math.sin(a) * w.v, l: w.life, d: w.dmg * dm, pl: w.pl + (lv >= 3 ? 1 : 0), ex: w.ex ? { r: w.ex.r, d: w.ex.d * dm } : null, h: [], c: w.col });
    }
    if (g.wp !== 'knife') blood(p.x + Math.cos(p.ang) * 28, p.y + Math.sin(p.ang) * 28, '#ffd27a', 3, 120);
    if (w.n > 3 || w.dmg > 5) shake = Math.max(shake, 4);
  }
  /* ----- tourelles ----- */
  for (const z of g.z) z.tsl = 1;
  if (towerStep(dt)) { if ((g.sy = (g.sy || 0) - 1) <= 0) { g.sy = 3; sfx('twshot'); } }
  unitsStep(dt);
  for (let i = g.b.length - 1; i >= 0; i--) { const b = g.b[i]; if (stepBullet(b, dt)) { if (b.ex) bexplode(b); g.b.splice(i, 1); } }
  powerTick(dt);
  /* ----- apparition des zombies ----- */
  if (g.spawnLeft > 0 && g.z.length < ZCAP) {
    g.spawnT -= dt;
    if (g.spawnT <= 0) { spawnZ(pickType()); g.spawnLeft--; g.spawnT = Math.max(.1, (1.1 - dw() * .035) / lng(.02)); }
  }
  /* ----- zombies : ils suivent uniquement le chemin jusqu'à la base (ils n'attaquent jamais le joueur) ----- */
  for (let i = g.z.length - 1; i >= 0; i--) {
    const z = g.z[i];
    if (z.hp <= 0) {
      g.combo++; if (g.combo > g.bc) g.bc = g.combo; g.ct = 2.5; g.zk[z.t] = (g.zk[z.t] || 0) + 1; sfx('kill'); disc('z', z.t, z.x, z.y - z.r - 24, 'Zombie découvert !');
      const pts = Math.max(1, Math.round((z.pts + Math.floor(g.combo / 5)) * (g.tmr.x2 > 0 ? 2 : 1)));
      g.score += pts; g.kills++;
      { const dm = dolMul(); g.dol.k += z.pts * dm; if (g.combo >= 5) g.dol.c += Math.min(3, Math.floor(g.combo / 5)) * dm; }
      const cg = gainCash(z.pts) + (g.combo >= 5 ? gainCash(Math.floor(g.combo / 5)) : 0);
      blood(z.x, z.y, z.c, z.big ? 50 : 16, 220); gore(z.x, z.y, Math.atan2(z.ky || 0, z.kx || 1), z.big ? 46 : 18, 360); splat(z.x, z.y, z.r);
      g.ft.push({ x: z.x, y: z.y - z.r, t: 1, s: '+' + pts, c: z.big ? '#ff5a5a' : '#ffb347' });
      if (cg) { g.ft.push({ x: z.x, y: z.y - z.r - 20, t: 1.1, s: '+' + cg, c: '#ffd24a', coin: true }); sfx('coin'); }
      if (z.t === 'bomb') boom(z);
      if (z.t === 'splitter') for (let k = 0; k < 2; k++) spawnZ('crawler', z.x + rnd(-14, 14), z.y + rnd(-14, 14), z.wi);
      dropFrom(z); if (z.big) shake = 14; g.z.splice(i, 1); continue;
    }
    let wp = PATH[Math.min(z.wi, PATH.length - 1)], tx = wp[0], ty = wp[1]; z.pass = false; if (z.gh > 0) z.gh -= dt;
    { /* trop éloigné de sa route (repoussé…) : il rejoint le chemin en avançant en biais, puis le suit à nouveau */
      const A = PATH[Math.max(0, Math.min(z.wi, PATH.length - 1) - 1)], sx = wp[0] - A[0], sy = wp[1] - A[1], sl = Math.hypot(sx, sy);
      if (sl > 1) {
        const ru = ((z.x - A[0]) * sx + (z.y - A[1]) * sy) / (sl * sl), u = clamp(ru, 0, 1), qx = A[0] + sx * u, qy = A[1] + sy * u, off = Math.hypot(z.x - qx, z.y - qy);
        z.pass = ru >= 1;   /* il a dépassé le coin : on passe au tronçon suivant même s'il n'a pas pu toucher le point exact */
        if (off > 34 + z.r * .6) z.ret = true; else if (off < 12 + z.r * .3) z.ret = false;
        if (z.ret && !z.pass) { const v = Math.min(1, u + 110 / sl); tx = A[0] + sx * v; ty = A[1] + sy * v; }
      }
    }
    z.hold = false;
    if (g.gd.length) {   /* les zombies attaquent les soldats et les tanks qui barrent la route : ils s'arrêtent au contact (à distance pour les cracheurs et les tireurs) */
      const rg = ZRANGED[z.t] || 0, reach = rg || z.r + 4; let tu = null, td = 1e9;
      for (const u of g.gd) { const ud = Math.hypot(u.x - z.x, u.y - z.y) - u.r; if (ud < reach + 96 && ud < td) { td = ud; tu = u; } }
      if (tu) {
        tx = tu.x; ty = tu.y;
        if (td <= reach) {
          z.hold = true; z.stk = 0;
          if (z.cd <= 0) {
            const tk = tu.k === 'tank', dmg = z.dmg * .45 * (1 + .04 * Math.min(dw(), 40)) * (tk ? .5 : 1);
            z.cd = rg ? 1.3 : .85; tu.hf = .18; sfx('hit');
            if (z.t === 'bomb') {   /* le kamikaze explose au contact : tous les alliés proches sont touchés */
              for (const u of g.gd) if (Math.hypot(u.x - z.x, u.y - z.y) < 100 + u.r) { u.hp -= z.dmg * 1.6 * (u.k === 'tank' ? .5 : 1); u.hf = .25; }
              z.hp = 0;
            } else {
              tu.hp -= dmg;
              if (rg) g.fx.push({ k: 'bolt', x: z.x, y: z.y, x2: tu.x, y2: tu.y, t: .14, m: .14, c: z.c }); else blood(tu.x + rnd(-6, 6), tu.y + rnd(-6, 6), '#ff4d5e', 4, 150);
              if (g.ft.length < 70) g.ft.push({ x: tu.x + rnd(-10, 10), y: tu.y - 20, t: .7, s: '-' + Math.max(1, Math.round(dmg)), c: '#ff6a6a' });
            }
          }
        }
      }
    }
    const dx = tx - z.x, dy = ty - z.y, d = Math.hypot(dx, dy) || 1; z.fa = Math.atan2(dy, dx);
    if (z.t === 'medic') for (const o of g.z) if (o !== z && o.hp < o.mx && Math.hypot(o.x - z.x, o.y - z.y) < 230) o.hp = Math.min(o.mx, o.hp + 4 * dt);
    if (z.big && (z.sm -= dt) <= 0 && g.z.length < ZCAP) { z.sm = 7; sfx('wave'); for (let k = 0; k < 2; k++) spawnZ('walk', z.x + rnd(-40, 40), z.y + rnd(-40, 40), z.wi); }
    const fz = (g.tmr.freeze > 0 ? .4 : 1) * (1 - (1 - z.tsl) * (.5 + .5 * z.kr)) * (z.ret ? 1.25 : 1) * (z.hold ? 0 : 1);
    z.x += (dx / d * z.sp * fz + z.kx * z.kr) * dt; z.y += (dy / d * z.sp * fz + z.ky * z.kr) * dt;
    z.kx *= .88; z.ky *= .88; z.fl -= dt; z.cd -= dt;
    for (let j = i + 1; j < g.z.length; j++) {
      const o = g.z[j], ox = z.x - o.x, oy = z.y - o.y, m = z.r + o.r - 4;
      if (ox > m || ox < -m || oy > m || oy < -m) continue;
      const od = Math.hypot(ox, oy);
      if (od < m && od > .01 && !(z.gh > 0 || o.gh > 0)) {   /* le plus lourd bouge le moins ; poussée limitée pour éviter les bousculades en chaîne */
        const a2 = z.r * z.r, b2 = o.r * o.r, wz = b2 / (a2 + b2), f = Math.min(m - od, 8) / od;
        z.x += ox * f * wz; z.y += oy * f * wz; o.x -= ox * f * (1 - wz); o.y -= oy * f * (1 - wz);
      }
    }
    z.x = clamp(z.x, -120, WW - z.r); z.y = clamp(z.y, z.r, WH - z.r);
    if (z.pass || Math.hypot(wp[0] - z.x, wp[1] - z.y) < Math.max(16, z.r * .8) || (z.gh > 0 && Math.hypot(wp[0] - z.x, wp[1] - z.y) < z.r + 60)) {
      z.wi++;
      if (z.wi >= PATH.length) { leak(z); g.z.splice(i, 1); continue; }   /* arrivé au bout du chemin : la base est touchée */
    }
    wp = PATH[Math.min(z.wi, PATH.length - 1)]; z.pr = z.wi * 1e5 - Math.hypot(wp[0] - z.x, wp[1] - z.y);
    if (z.pr > z.bp + .5) { z.bp = z.pr; z.stk = 0; } else if (z.hold) z.stk = 0; else if ((z.stk += dt) > 1.6) { z.stk = 0; z.gh = 1; }   /* bloqué plus de 1,6 s : il traverse les autres le temps de se dégager */
  }
  /* ----- objets lâchés ----- */
  for (let i = g.dr.length - 1; i >= 0; i--) {
    const d = g.dr[i]; d.l -= dt;
    if (g.tmr.magnet > 0) { const mdx = p.x - d.x, mdy = p.y - d.y, md = Math.hypot(mdx, mdy); if (md < 520 && md > 1) { d.x += mdx / md * 420 * dt; d.y += mdy / md * 420 * dt; } }
    if (!p.dead && Math.hypot(d.x - p.x, d.y - p.y) < 32) { take(d); g.dr.splice(i, 1); } else if (d.l <= 0) g.dr.splice(i, 1);
  }
  for (let i = g.pt.length - 1; i >= 0; i--) { const q = g.pt[i]; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= .93; q.vy *= .93; q.l -= dt; if (q.l <= 0) { if (q.g && Math.random() < .3) splat(q.x, q.y, q.s * .6); g.pt.splice(i, 1); } }
  for (let i = g.ft.length - 1; i >= 0; i--) { const f = g.ft[i]; f.y -= 40 * dt; f.t -= dt; if (f.t <= 0) g.ft.splice(i, 1); }
  for (let i = g.fx.length - 1; i >= 0; i--) { g.fx[i].t -= dt; if (g.fx[i].t <= 0) g.fx.splice(i, 1); }
  for (let i = g.sp.length - 1; i >= 0; i--) { g.sp[i].l -= dt; if (g.sp[i].l <= 0) g.sp.splice(i, 1); }
  shake *= .9;
  /* ----- fin de vague ----- */
  if (g.spawnLeft === 0 && g.z.length === 0 && g.brk <= 0) { if (g.wave >= LV().waves && g.base.hp > 0) { end('win'); return; } g.brk = BREAK; }
  if (g.brk > 0) { g.brk -= dt; if (g.brk <= 0) nextWave(); }
  /* ----- la base est tombée ----- */
  if (g.base.hp <= 0) { g.base.hp = 0; end('base'); return; }
  /* ----- joueur à terre ----- */
  if (!p.dead && p.hp <= 0) {
    p.dead = true; p.hp = 0; g.resp = RESPAWN; g.dieT = 0; sfx('over'); shake = Math.max(shake, 22);
    gore(p.x, p.y, 0, 40, 380); gore(p.x, p.y, Math.PI, 30, 340); splat(p.x, p.y, 30); g.fx.push({ k: 'ring', x: p.x, y: p.y, t: .7, m: .7, r: 220, c: '#ff4d5e' });
  }
  if (p.dead) { g.resp -= dt; g.dieT += dt; if (g.resp <= 0) { p.dead = false; p.hp = p.mhp * .5; p.x = PSTART.x; p.y = PSTART.y; g.tmr.shield = 3; g.ft.push({ x: p.x, y: p.y - 40, t: 1.6, s: 'De retour !', c: '#5fd6a0' }); sfx('pick'); } }
  /* ----- démolition : maintenir X près d'une tourelle ----- */
  { const sd = nearSpot(), td = sd && sd.k === 'pad' && sd.pad && g.tw[sd.pad.id] ? sd.pad : null;
    if (K.x && td && !p.dead) {
      if (!g.dem || g.dem.id !== td.id) g.dem = { id: td.id, t: 0, n: 0 };
      g.dem.t += dt; g.dem.n -= dt;
      if (g.dem.n <= 0) { g.dem.n = .09; blood(td.x + rnd(-26, 26), td.y + rnd(-26, 26), pick(['#8a8f99', '#c8a070', TOW[g.tw[td.id].t].col]), 4, 170); sfx('hit'); }
      shake = Math.max(shake, 2 + 3 * g.dem.t / DEMO_T);
      if (g.dem.t >= DEMO_T) demolish(td);
    } else g.dem = null; }
  { const sd = nearSpot(), tw = sd && sd.k === 'pad' && g.tw[sd.pad.id], dn = tw ? 'Démolir : ' + TOW[tw.t].n : '', de = $('dem');
    if (dn !== g.dn) { g.dn = dn; de.classList.toggle('hide', !dn); if (dn) $('demT').textContent = dn; }
    de.style.background = dn && g.dem ? 'linear-gradient(90deg,rgba(255,77,94,.55) ' + Math.round(100 * g.dem.t / DEMO_T) + '%,rgba(58,10,20,.82) ' + Math.round(100 * g.dem.t / DEMO_T) + '%)' : ''; }
  /* ----- invite (boutique / emplacement) ----- */
  const sp = nearSpot(), ns = sp ? sp.t : '';
  if (ns !== g.ns) { g.ns = ns; $('shp').classList.toggle('hide', !sp); if (sp) $('shpT').textContent = sp.t; }
  /* ----- HUD ----- */
  setT('usd', fmt((CFG.money || 0) + dolTotal())); setT('cash', fmt(g.cash)); if (g.cash > (g.lc || 0)) { const vm = $('vm'); vm.style.transform = 'scale(1.18)'; setTimeout(() => { vm.style.transform = ''; }, 150); } g.lc = g.cash;
  setT('sc', g.score); setT('kl', g.kills); setT('rem', g.spawnLeft + g.z.length); setT('wv', LV().inf ? 'Vague ' + g.wave + ' · ∞' : 'Vague ' + g.wave + ' / ' + LV().waves);
  const hw = Math.max(0, p.hp / p.mhp * 100).toFixed(1) + '%'; if (HUDC.hpw !== hw) { HUDC.hpw = hw; $('hp').style.width = hw; } setT('hpn', Math.max(0, Math.ceil(p.hp)) + ' / ' + p.mhp);
  setT('vb', Math.ceil(g.base.hp) + ' / ' + g.base.mhp);
  if ((g.ih -= dt) <= 0) { g.ih = .1; invDraw(); pwUI(); }
  const bt = []; for (const k of ['shield', 'speed', 'x2', 'freeze', 'rage', 'magnet']) if (g.tmr[k] > 0) bt.push(BONUS[k].n + ' ' + Math.ceil(g.tmr[k]) + ' s');
  if (g.combo >= 3) bt.push('Combo ×' + g.combo); bt.push(g.dc > 0 ? 'Esquive ' + g.dc.toFixed(1) + ' s' : 'Esquive prête');
  if (g.brk > 0) bt.unshift('Prochaine vague dans ' + Math.ceil(g.brk) + ' s (N : tout de suite)');
  if (p.dead) bt.unshift('Réanimation dans ' + Math.ceil(g.resp) + ' s');
  setT('bon', bt.join('   '));
}

/* ---------- Dessin ---------- */
function drawCoin(x, y, r, spin) {
  const sx = spin == null ? 1 : Math.max(.3, Math.abs(Math.cos(spin)));
  ctx.save(); ctx.translate(x, y); ctx.scale(sx, 1);
  ctx.fillStyle = '#a8740c'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(0, 0, r * .82, 0, 7); ctx.fill();
  ctx.strokeStyle = '#e0a020'; ctx.lineWidth = Math.max(1, r * .16); ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(-r * .3, -r * .32, r * .24, r * .12, -.7, 0, 7); ctx.fill();
  ctx.restore();
}
const fk = (T, s) => .82 + .12 * Math.sin(T * 9 + s) + .06 * Math.sin(T * 23 + s * 2.7);
let _gs = null;
function glowSp() { if (_gs) return _gs; _gs = document.createElement('canvas'); _gs.width = _gs.height = 128; const x = _gs.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,196,110,1)'); g.addColorStop(.35, 'rgba(255,150,60,.4)'); g.addColorStop(1, 'rgba(255,120,30,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return _gs; }
function warm(x, y, r, a) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(a, 0, 1); ctx.drawImage(glowSp(), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
function bankArt(x, l) {
  const pad = ['#6b7385', '#7d8594', '#8a93a8', '#c8a24a'][l], T = performance.now() / 1000;
  x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(5, 8, 42, 32, 0, 0, 7); x.fill();
  x.fillStyle = '#3b4252'; x.beginPath(); x.arc(0, 0, 40, 0, 7); x.fill(); x.fillStyle = pad; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fill();
  for (let k = 0; k < 3; k++) { x.fillStyle = k < l ? '#ffd24a' : 'rgba(0,0,0,.4)'; x.beginPath(); x.arc(-12 + k * 12, 27, 3.6, 0, 7); x.fill(); }
  x.fillStyle = '#2b3a2a'; x.beginPath(); x.arc(0, -2, 24, 0, 7); x.fill();
  x.strokeStyle = '#8a6a1a'; x.lineWidth = 3; x.stroke();
  for (let k = 0; k <= l; k++) { const a = k * 1.9 + .6; x.fillStyle = '#e0b020'; x.beginPath(); x.arc(Math.cos(a) * 15, -2 + Math.sin(a) * 15, 5, 0, 7); x.fill(); x.strokeStyle = '#8a6a1a'; x.lineWidth = 1.5; x.stroke(); }
  x.fillStyle = '#ffd24a'; x.beginPath(); x.arc(0, -2, 15 + Math.sin(T * 3) * .8, 0, 7); x.fill(); x.strokeStyle = '#b8860b'; x.lineWidth = 2.5; x.stroke();
  x.fillStyle = '#7a5a10'; x.font = '20px Impact,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', 0, -1);
}
/* tourelle : dessinée en (0,0). ang = orientation du canon, sh = éclair de tir */
function towerArt(x, key, l, ang, sh) {
  const K0 = TOW[key], pad = ['#6b7385', '#7d8594', '#8a93a8', '#c8a24a'][l];
  if (key === 'tank') { hangarArt(x, l, ang); return; }
  if (key === 'barracks') { barracksArt(x, l); return; }
  if (key === 'bank') { bankArt(x, l); return; }
  x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.ellipse(5, 8, 42, 32, 0, 0, 7); x.fill();
  x.fillStyle = '#3b4252'; x.beginPath(); x.arc(0, 0, 40, 0, 7); x.fill(); x.fillStyle = pad; x.beginPath(); x.arc(0, 0, 34, 0, 7); x.fill();
  for (let k = 0; k < 3; k++) { x.fillStyle = k < l ? '#ffd24a' : 'rgba(0,0,0,.4)'; x.beginPath(); x.arc(-12 + k * 12, 27, 3.6, 0, 7); x.fill(); }
  x.save(); x.rotate(ang);
  if (key === 'frost') {
    x.rotate(-ang); const T = performance.now() / 1000; x.rotate(T * .8);
    x.fillStyle = '#4a6a8a'; x.beginPath(); x.arc(0, 0, 18 + l * 1.5, 0, 7); x.fill();
    for (let k = 0; k < 6; k++) { x.rotate(1.047); x.fillStyle = k % 2 ? '#bff3ff' : K0.col; x.beginPath(); x.moveTo(8, -5); x.lineTo(26 + l * 2, 0); x.lineTo(8, 5); x.closePath(); x.fill(); }
    x.fillStyle = '#e8fbff'; x.beginPath(); x.arc(0, 0, 7, 0, 7); x.fill();
  } else if (key === 'sonic') {
    x.rotate(-ang); const T = performance.now() / 1000;
    x.fillStyle = '#24424a'; x.beginPath(); x.arc(0, 0, 17 + l * 1.5, 0, 7); x.fill();
    x.strokeStyle = K0.col; x.lineWidth = 3; for (let k = 0; k < 3; k++) { const ph = (T * 1.4 + k / 3) % 1; x.globalAlpha = 1 - ph; x.beginPath(); x.arc(0, 0, 10 + ph * (22 + l * 2), 0, 7); x.stroke(); }
    x.globalAlpha = 1; x.fillStyle = '#e8fffb'; x.beginPath(); x.arc(0, 0, 6, 0, 7); x.fill();
  } else if (key === 'tesla') {
    x.rotate(-ang); const T = performance.now() / 1000;
    x.fillStyle = '#2b2f40'; x.beginPath(); x.arc(0, 0, 16 + l * 1.5, 0, 7); x.fill();
    x.strokeStyle = K0.col; x.lineWidth = 3; for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(0, 0, 8 + k * 4, 0, 7); x.stroke(); }
    x.fillStyle = '#efe4ff'; x.beginPath(); x.arc(0, 0, 6 + Math.sin(T * 12) * 1.2, 0, 7); x.fill();
    x.lineWidth = 2; for (let k = 0; k < 4 + l; k++) { const a = T * 3 + k * 6.283 / (4 + l); x.beginPath(); x.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); x.lineTo(Math.cos(a + .2) * 24, Math.sin(a + .2) * 24); x.stroke(); }
  } else if (key === 'plane') {
    x.rotate(-ang); x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.setLineDash([6, 5]); x.beginPath(); x.arc(0, 0, 27, 0, 7); x.stroke(); x.setLineDash([]);
    x.rotate(-.5); x.scale(.72, .72); planeArt(x, { T: performance.now() / 1000, l });
  } else {
    let bl = 30 + l * 5, bw = 6, offs = l >= 2 ? [-6, 6] : [0];
    if (key === 'sniper') { bl = 50 + l * 5; bw = 5; offs = [0]; } else if (key === 'cannon') { bl = 30 + l * 3; bw = 15; offs = [0]; } else if (key === 'laser') { bl = 34 + l * 4; bw = 4; offs = [-6, 6]; } else if (key === 'flame') { bl = 24 + l * 3; bw = 10; offs = [0]; } else if (key === 'mortar') { bl = 22 + l * 2; bw = 22; offs = [0]; } else if (key === 'rail') { bl = 46 + l * 4; bw = 7; offs = l >= 2 ? [-5, 5] : [0]; }
    for (const o of offs) { x.fillStyle = '#23262f'; x.fillRect(8, o - bw / 2, bl, bw); x.fillStyle = K0.col; x.fillRect(8 + bl - 6, o - bw / 2 - 1, 7, bw + 2); }
    x.fillStyle = ['#5d6475', '#7d8594', '#9aa2b2', '#3a3f55'][l]; x.beginPath(); x.arc(0, 0, 15 + l * 1.5, 0, 7); x.fill(); x.strokeStyle = '#23262f'; x.lineWidth = 2.5; x.stroke();
    x.fillStyle = K0.col; x.beginPath(); x.arc(0, 0, 6, 0, 7); x.fill();
    if (key === 'sniper') { x.fillStyle = '#23262f'; x.fillRect(-4, -14, 18, 6); x.fillStyle = '#7fb8ff'; x.fillRect(12, -13, 3, 4); }
    if (sh > 0) { x.fillStyle = '#fff3b0'; for (const o of offs) { x.beginPath(); x.arc(8 + bl + 7, o, key === 'cannon' ? 11 : 7, 0, 7); x.fill(); } }
  }
  x.restore();
}
/* ---------- Dessins des armes et des bonus (identiques au jeu principal) ---------- */
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
  if (t === 'tank' || t === 'juggernaut') { x.beginPath(); x.arc(0, -r * .85, r * .45, 0, 7); x.arc(0, r * .85, r * .45, 0, 7); x.fill(); }
  x.fillStyle = fl ? '#fff' : o.c; x.strokeStyle = o.dk; x.lineWidth = Math.max(2, r * .12); x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.stroke();
  x.fillStyle = o.dk;
  if (t === 'walk' || t === 'toxic') { x.globalAlpha = .5; x.beginPath(); x.arc(-r * .35, -r * .3, r * .22, 0, 7); x.arc(-r * .2, r * .4, r * .16, 0, 7); x.fill(); x.globalAlpha = 1; }
  if (t === 'brute') { x.fillStyle = '#5a6479'; x.beginPath(); x.arc(0, 0, r * .92, 1.3, 5); x.fill(); x.fillStyle = '#121a2b'; x.fillRect(r * .2, -r * .3, r * .3, r * .6); }
  if (t === 'bomb') { x.fillStyle = '#d33'; x.fillRect(-r * .5, -r * .25, r * .5, r * .5); x.fillStyle = '#ffd24a'; x.fillRect(-r * .35, -r * .08, r * .3, r * .16); }
  if (t === 'spit') { x.fillStyle = '#bfffe9'; x.beginPath(); x.arc(r * .75, 0, r * .2, 0, 7); x.fill(); }
  if (t === 'berserk') { x.strokeStyle = '#220010'; x.lineWidth = 3; x.beginPath(); x.moveTo(r * .2, -r * .6); x.lineTo(r * .6, -r * .2); x.moveTo(r * .2, r * .6); x.lineTo(r * .6, r * .2); x.stroke(); }
  if (t === 'splitter') { x.strokeStyle = o.dk; x.lineWidth = 2; x.beginPath(); x.moveTo(-r, 0); x.lineTo(r * .2, 0); x.stroke(); }
  if (t === 'fast') { x.fillStyle = '#c33'; x.fillRect(-r * .25, -r * .9, r * .22, r * 1.8); }
  if (t === 'medic') { x.fillStyle = '#fff'; x.fillRect(-r * .5, -r * .12, r * .6, r * .24); x.fillRect(-r * .3, -r * .32, r * .24, r * .64); }
  x.fillStyle = '#ff3b3b'; x.beginPath(); x.arc(r * .45, -r * .33, r * .15, 0, 7); x.arc(r * .45, r * .33, r * .15, 0, 7); x.fill();
}
function drawZ(z, cx, cy) {
  const x = z.x - cx, y = z.y - cy; if (x < -90 || y < -90 || x > W + 90 || y > H + 90) return;
  const sw = Math.sin(G.t * 8 + z.ph) * z.r * .18;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 6, z.r, z.r * .8, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(z.fa || 0); zArt(ctx, z.r, z, z.t, z.fl > 0, sw); ctx.restore();
  if (G.tmr.freeze > 0 || z.tsl < 1) { ctx.fillStyle = 'rgba(155,231,255,' + (G.tmr.freeze > 0 ? .35 : .22) + ')'; ctx.beginPath(); ctx.arc(x, y, z.r, 0, 7); ctx.fill(); }
  if (z.mx > 8 && z.hp < z.mx) { const w = z.r * 2; ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - w / 2, y - z.r - 12, w, 5); ctx.fillStyle = '#ff5a5a'; ctx.fillRect(x - w / 2, y - z.r - 12, w * Math.max(0, z.hp) / z.mx, 5); }
}
function drawPlayer(cx, cy) {
  const p = G.p, x = p.x - cx, y = p.y - cy, knife = G.wp === 'knife', w = WP[G.wp];
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(x + 4, y + 7, 17, 13, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(p.ang);
  if (!knife) { ctx.save(); ctx.translate(22, 0); ctx.scale(.55, .55); wArt(ctx, G.wp, w.col); ctx.restore(); if (G.flash > 0) { ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(44, 0, 7, 0, 7); ctx.fill(); } }
  skinArt(ctx, G.sk, p.hit > 0);
  if (knife) {
    const sd = p.sd || 1, k = p.sl > 0 ? 1 - p.sl / .24 : 1, e = 1 - Math.pow(1 - k, 3), sw = sd * (1.2 - 2.4 * e), th = Math.sin(k * Math.PI) * 9;
    if (p.sl > 0 && k > .04) { ctx.strokeStyle = 'rgba(255,255,255,' + (.75 * (1 - k)).toFixed(2) + ')'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, 0, 42, sd * 1.2, sw, sd > 0); ctx.stroke(); }
    ctx.save(); ctx.rotate(sw); ctx.fillStyle = G.sk.tone || '#f1d3b0'; ctx.beginPath(); ctx.arc(5 + th, 0, 4.4, 0, 7); ctx.fill(); ctx.translate(15 + th, 0); ctx.scale(.62, .62); wArt(ctx, 'knife', '#dfe6f1'); ctx.restore();
  }
  ctx.restore();
}
function drawShop(cx, cy, T) {
  const S = SHOP, x = S.x - cx, y = S.y - cy; if (x < -170 || y < -170 || x > W + 170 || y > H + 170) return;
  const w = S.w, h = S.h, L = x - w / 2, Tp = y - h / 2, aw = Tp - 16, near = G.playing && !G.p.dead && Math.hypot(G.p.x - S.x, G.p.y - S.y) < S.use;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(L + 6, Tp + 8, w, h); ctx.fillStyle = '#4a3320'; ctx.fillRect(L, Tp, w, h);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let k = 8; k < w; k += 10) ctx.fillRect(L + k, Tp, 1.5, h);
  ctx.fillStyle = '#7a5a38'; ctx.fillRect(L + w - 18, Tp, 18, h); ctx.fillStyle = '#a07a4c'; ctx.fillRect(L + w - 18, Tp, 4, h);
  for (let k = 0; k < 5; k++) drawCoin(L + 10 + (k % 3) * 6, Tp + h - 12 - Math.floor(k / 3) * 4 - k * .5, 5);
  ctx.fillStyle = '#f1d3b0'; ctx.beginPath(); ctx.arc(L + 36, y, 9, 0, 7); ctx.fill(); ctx.fillStyle = '#c8873a'; ctx.beginPath(); ctx.ellipse(L + 36, y, 14, 12, 0, 0, 7); ctx.globalCompositeOperation = 'destination-over'; ctx.fill(); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#2a1c10'; for (const px of [L - 2, L + w + 2]) for (const py of [aw + 20, Tp + h]) { ctx.beginPath(); ctx.arc(px, py, 4, 0, 7); ctx.fill(); }
  const sw = (w + 8) / 8; for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#f2f5fa' : '#d63a3a'; ctx.fillRect(L - 4 + k * sw, aw, sw + .5, 20); }
  ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(L - 4, aw + 20, w + 8, 4);
  ctx.font = '17px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
  ctx.strokeText(S.name, x, aw - 7); ctx.fillStyle = near ? '#fff' : '#ffd24a'; ctx.fillText(S.name, x, aw - 7);
  ctx.restore(); drawCoin(x - 52, aw - 13, 8, T * 2); drawCoin(x + 52, aw - 13, 8, T * 2 + 1.5);
  warm(x + 6, y, 130, .5 * fk(T, 7)); if (near) warm(x, y, 90, .25);
}
function drawBase(cx, cy, T) {
  const x = BASEP.x - cx, y = BASEP.y - cy, B = BH; if (x < -300 || y < -B - 160 || x > W + 300 || y > H + B + 160) return;
  const hit = G.base.fl > 0, f = G.base.hp / G.base.mhp, X0 = x - 76, gate = 34;
  const U = G.base.lv | 0, SP = [['#8a8478', '#5e5a50'], ['#948e82', '#625e54'], ['#9e988c', '#686358'], ['#a4a9b0', '#5e6672'], ['#adb4be', '#646e7c'], ['#b8c0cc', '#6a7586'], ['#c8c2b0', '#807a62'], ['#d6d0bc', '#8f8868'], ['#e2deee', '#8a86a6'], ['#ecdca0', '#a8883a'], ['#f6e6a8', '#b8962e']][Math.min(U, 10)];
  const stone = hit ? '#ffb0a8' : SP[0], stoneD = hit ? '#d77a74' : SP[1];
  ctx.save();
  /* cour pavée derrière la muraille */
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(X0 + 6, y - B + 8, 190, B * 2);
  ctx.fillStyle = '#4d4a44'; ctx.fillRect(x - 36, y - B, 150, B * 2);
  ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let k = 0; k <= B * 2; k += 26) { ctx.moveTo(x - 36, y - B + k); ctx.lineTo(x + 114, y - B + k); }
  for (let k = 0; k <= 150; k += 30) { ctx.moveTo(x - 36 + k, y - B); ctx.lineTo(x - 36 + k, y + B); }
  ctx.stroke();
  /* muraille de pierre (haut et bas), crénelée, avec la porte au milieu */
  for (const [a, b] of [[y - B, y - gate], [y + gate, y + B]]) {
    ctx.fillStyle = stoneD; ctx.fillRect(X0, a, 40, b - a); ctx.fillStyle = stone; ctx.fillRect(X0, a, 34, b - a);
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let yy = a + 14, r = 0; yy < b; yy += 14, r++) { ctx.moveTo(X0, yy); ctx.lineTo(X0 + 34, yy); for (let xx = X0 + (r % 2 ? 9 : 17); xx < X0 + 34; xx += 17) { ctx.moveTo(xx, yy - 14); ctx.lineTo(xx, yy); } }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(X0, a, 4, b - a);
    for (let yy = a + 6; yy < b - 16; yy += 26) { ctx.fillStyle = stoneD; ctx.fillRect(X0 - 8, yy + 3, 11, 16); ctx.fillStyle = stone; ctx.fillRect(X0 - 9, yy, 11, 16); }
  }
  /* porte en bois cerclée de fer, éclairée par deux torches */
  ctx.fillStyle = '#20140a'; ctx.fillRect(X0 - 4, y - gate, 46, gate * 2);
  ctx.fillStyle = hit ? '#ff8a7a' : '#6a4526'; ctx.fillRect(X0 + 2, y - gate + 2, 30, gate * 2 - 4);
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let k = 8; k < 30; k += 7) { ctx.moveTo(X0 + 2 + k, y - gate + 2); ctx.lineTo(X0 + 2 + k, y + gate - 2); } ctx.stroke();
  ctx.fillStyle = '#2b2f38'; for (const o of [-22, 18]) ctx.fillRect(X0 + 2, y + o, 30, 5);
  ctx.fillStyle = '#10131a'; ctx.fillRect(X0 + 17, y - gate + 2, 1.5, gate * 2 - 4);
  ctx.fillStyle = '#c8a24a'; for (const o of [-5, 5]) { ctx.beginPath(); ctx.arc(X0 + 13 + (o > 0 ? 8 : 0), y, 2.4, 0, 7); ctx.fill(); }
  for (const s of [-1, 1]) {
    const tx = X0 - 14, ty = y + s * (gate + 10);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(tx - 2, ty - 2, 4, 4);
    warm(tx, ty, 70, .5 * fk(T, 3 + s)); ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(tx, ty, 4 + Math.sin(T * 14 + s) * 1.2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff1b0'; ctx.beginPath(); ctx.arc(tx, ty, 2, 0, 7); ctx.fill();
  }
  /* sacs de sable devant la muraille */
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
    const sx = X0 - 26 - (k % 2) * 4, sy = y + s * (gate + 34 + k * 14);
    ctx.fillStyle = '#6a5a3a'; ctx.beginPath(); ctx.ellipse(sx + 1, sy + 2, 13, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#b09c6c'; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6.5, 0, 0, 7); ctx.fill();
  }
  /* deux tours aux extrémités, avec leur drapeau */
  for (const s of [-1, 1]) {
    const tx = X0 + 17, ty = y + s * B;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(tx + 6, ty + 8, 36, 0, 7); ctx.fill();
    ctx.fillStyle = stoneD; ctx.beginPath(); ctx.arc(tx, ty, 36, 0, 7); ctx.fill(); ctx.fillStyle = stone; ctx.beginPath(); ctx.arc(tx, ty, 31, 0, 7); ctx.fill();
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#a0472f' : '#8a3a2a'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.arc(tx, ty, 25, k * .785, (k + 1) * .785); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#d8a35a'; ctx.beginPath(); ctx.arc(tx, ty, 3.5, 0, 7); ctx.fill();
    const wv = Math.sin(T * 4 + s) * 3; ctx.fillStyle = '#ff7a2f'; ctx.beginPath(); ctx.moveTo(tx, ty - 3); ctx.lineTo(tx - 24, ty - 8 + wv); ctx.lineTo(tx - 17, ty - 1 + wv * .6); ctx.lineTo(tx - 24, ty + 5 + wv); ctx.lineTo(tx, ty + 2); ctx.closePath(); ctx.fill();
  }
  /* deux maisons dans la cour */
  for (const o of [[26, -B * .58, '#a0472f'], [26, B * .58, '#8a3a2a']]) {
    const hx = x + o[0], hy = y + o[1];
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(hx - 24, hy - 14, 66, 50); ctx.fillStyle = '#5a4026'; ctx.fillRect(hx - 30, hy - 24, 60, 48);
    ctx.fillStyle = o[2]; ctx.beginPath(); ctx.moveTo(hx - 38, hy - 20); ctx.lineTo(hx, hy - 50); ctx.lineTo(hx + 38, hy - 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.moveTo(hx, hy - 50); ctx.lineTo(hx + 38, hy - 20); ctx.lineTo(hx, hy - 20); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.fillRect(hx - 8, hy - 2, 16, 14); ctx.fillStyle = '#3a2a1a'; ctx.fillRect(hx - 1, hy - 2, 2, 14);
  }
  /* feu central (le cœur de la base) */
  ctx.fillStyle = '#6d7686'; for (let k = 0; k < 10; k++) { const a = k * .628; ctx.beginPath(); ctx.arc(x + 30 + Math.cos(a) * 24, y + Math.sin(a) * 24, 5, 0, 7); ctx.fill(); }
  warm(x + 30, y, 200, .5 * fk(T, 1)); warm(x + 30, y, 70, .8 * fk(T, 2));
  for (let k = 0; k < 5; k++) { const a = k * 1.26 + T * 1.5, fr = 9 + Math.sin(T * 8 + k * 2) * 3; ctx.fillStyle = k % 2 ? '#ff7a2f' : '#ffb347'; ctx.beginPath(); ctx.arc(x + 30 + Math.cos(a) * 5, y + Math.sin(a) * 4, fr * .8, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(x + 30, y, 5 + Math.sin(T * 14) * 1.5, 0, 7); ctx.fill();
  /* améliorations : à chaque niveau (10 au total) la base est plus belle */
  if (U >= 1) { ctx.fillStyle = U >= 7 ? '#d4a73a' : '#39414f'; for (const [a, b] of [[y - B, y - gate], [y + gate, y + B]]) for (let yy = a + 12; yy < b - 8; yy += 40) ctx.fillRect(X0 - 2, yy, 38, 4); }
  if (U >= 2) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const sx = X0 - 46, sy = y + s * (gate + 40 + k * 14); ctx.fillStyle = '#6a5a3a'; ctx.beginPath(); ctx.ellipse(sx + 1, sy + 2, 13, 7, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#c0ab78'; ctx.beginPath(); ctx.ellipse(sx, sy, 12, 6.5, 0, 0, 7); ctx.fill(); }
  if (U >= 3) for (const s of [-1, 1]) for (let k = 0; k < 5; k++) { const yy = y + s * (gate + 18 + k * (B - gate - 30) / 4); ctx.fillStyle = '#4a4f58'; ctx.beginPath(); ctx.moveTo(X0 - 72, yy - 8); ctx.lineTo(X0 - 54, yy); ctx.lineTo(X0 - 72, yy + 8); ctx.closePath(); ctx.fill(); }
  if (U >= 4) for (const s of [-1, 1]) { ctx.strokeStyle = U >= 7 ? '#d4a73a' : '#c0c8d4'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X0 + 17, y + s * B, 34, 0, 7); ctx.stroke(); }
  if (U >= 5) for (const s of [-1, 1]) { const bx = X0 + 4, by2 = y + s * B * .5 - 16, wv = Math.sin(T * 3 + s) * 2; ctx.fillStyle = '#3a6fd8'; ctx.beginPath(); ctx.moveTo(bx, by2); ctx.lineTo(bx + 26, by2); ctx.lineTo(bx + 26 + wv, by2 + 40); ctx.lineTo(bx + 13, by2 + 32); ctx.lineTo(bx + wv, by2 + 40); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.arc(bx + 13, by2 + 13, 5, 0, 7); ctx.fill(); }
  if (U >= 6) { ctx.fillStyle = 'rgba(70,82,104,.9)'; ctx.fillRect(X0 + 2, y - gate + 2, 30, gate * 2 - 4); ctx.fillStyle = '#c8d0dc'; for (let k = 0; k < 4; k++) for (const o of [-24, 20]) { ctx.beginPath(); ctx.arc(X0 + 7 + k * 7, y + o, 1.6, 0, 7); ctx.fill(); } ctx.fillStyle = '#10131a'; ctx.fillRect(X0 + 17, y - gate + 2, 1.5, gate * 2 - 4); }
  if (U >= 7) { ctx.fillStyle = '#e6bd4a'; for (const [a, b] of [[y - B, y - gate], [y + gate, y + B]]) for (let yy = a + 4; yy < b - 6; yy += 20) ctx.fillRect(X0 + 28, yy, 7, 9); }
  if (U >= 8) for (const s of [-1, 1]) { const tx = X0 + 17, ty = y + s * B, ang = Math.PI + Math.sin(T * .8 + s) * .5 * s; warm(tx, ty, 80, .55); ctx.fillStyle = 'rgba(255,245,190,.13)'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(ang - .16) * 300, ty + Math.sin(ang - .16) * 300); ctx.lineTo(tx + Math.cos(ang + .16) * 300, ty + Math.sin(ang + .16) * 300); ctx.closePath(); ctx.fill(); }
  if (U >= 9) { ctx.strokeStyle = 'rgba(120,220,255,' + (.45 + Math.sin(T * 3) * .15) + ')'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X0 - 6, y, 92, B + 40, 0, -Math.PI / 2, Math.PI / 2, true); ctx.stroke(); ctx.fillStyle = 'rgba(120,220,255,.07)'; ctx.fill(); }
  if (U >= 10) { const cxx = X0 + 13, cyy = y - gate - 22; ctx.fillStyle = '#ffd24a'; ctx.beginPath(); ctx.moveTo(cxx - 16, cyy + 10); ctx.lineTo(cxx - 16, cyy - 8); ctx.lineTo(cxx - 8, cyy); ctx.lineTo(cxx, cyy - 12); ctx.lineTo(cxx + 8, cyy); ctx.lineTo(cxx + 16, cyy - 8); ctx.lineTo(cxx + 16, cyy + 10); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(cxx, cyy + 2, 3, 0, 7); ctx.fill(); for (let k = 0; k < 6; k++) { const ph = (T * .9 + k / 6) % 1; ctx.globalAlpha = Math.sin(ph * 3.14); ctx.fillStyle = '#fff3c4'; ctx.fillRect(x - 40 + k * 28 + Math.sin(T + k) * 6, y - B + 20 + ph * (B * 2 - 40), 3, 3); } ctx.globalAlpha = 1; }
  /* dégâts : fissures puis fumée quand la base est mal en point */
  if (f < .6) {
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let k = 0, n = f < .3 ? 6 : 3; k < n; k++) { const yy = y - B + 40 + k * (B * 2 - 80) / 5; if (Math.abs(yy - y) < gate + 16) continue; ctx.moveTo(X0 + 2, yy); ctx.lineTo(X0 + 12, yy + 8); ctx.lineTo(X0 + 8, yy + 18); ctx.lineTo(X0 + 22, yy + 26); }
    ctx.stroke();
  }
  if (f < .35) for (let k = 0; k < 4; k++) { const ph = (T * .6 + k * .25) % 1; ctx.globalAlpha = (1 - ph) * .35; ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(X0 + 8 + k * 22, y - B * .4 - ph * 60, 8 + ph * 14, 0, 7); ctx.fill(); }
  ctx.globalAlpha = 1;
  /* barre de vie + nom */
  const bx = x - 56, by = y - B - 66, bw = 150;
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.beginPath(); ctx.roundRect(bx - 3, by - 3, bw + 6, 16, 6); ctx.fill();
  ctx.fillStyle = f > .5 ? '#5fd6a0' : f > .25 ? '#ffb347' : '#ff4d5e'; ctx.beginPath(); ctx.roundRect(bx, by, Math.max(0, bw * f), 10, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(bx + 2, by + 1, Math.max(0, bw * f - 4), 2);
  ctx.font = '19px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = '#000'; ctx.strokeText('BASE', bx + bw / 2, by - 8); ctx.fillStyle = '#ffd24a'; ctx.fillText('BASE', bx + bw / 2, by - 8);
  ctx.restore();
}
function drawSpawn(cx, cy, T) {
  const x = SPAWN[0] + 90 - cx, y = SPAWN[1] - cy; if (x < -200 || y < -200 || x > W + 200 || y > H + 200) return;
  warm(x, y, 150, .35 * fk(T, 4));
  for (let k = 0; k < 3; k++) { ctx.strokeStyle = 'rgba(255,77,94,' + (.6 - k * .15) + ')'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(x, y, 30 + k * 12 + Math.sin(T * 3 + k) * 3, 70 + k * 14, 0, 0, 7); ctx.stroke(); }
  ctx.font = '16px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.strokeText('ENTRÉE DES ZOMBIES', x + 50, y - 100); ctx.fillStyle = '#ff8a96'; ctx.fillText('ENTRÉE DES ZOMBIES', x + 50, y - 100);
}
function drawPads(cx, cy, T) {
  const g = G;
  for (const pad of PADS) {
    const x = pad.x - cx, y = pad.y - cy; if (x < -140 || y < -140 || x > W + 140 || y > H + 140) continue;
    const t = g.tw[pad.id], near = g.playing && !g.p.dead && Math.hypot(g.p.x - pad.x, g.p.y - pad.y) < 95;
    if (!t) {
      ctx.save(); ctx.setLineDash([8, 7]); ctx.strokeStyle = near ? '#ffd24a' : 'rgba(255,210,74,.5)'; ctx.lineWidth = 2; ctx.strokeRect(x - pad.w / 2, y - pad.h / 2, pad.w, pad.h); ctx.setLineDash([]);
      ctx.fillStyle = near ? '#ffd24a' : 'rgba(255,210,74,.6)'; ctx.font = '34px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', x, y + 2); ctx.restore();
    } else {
      const dm = g.dem && g.dem.id === pad.id ? g.dem.t / DEMO_T : 0;
      ctx.save(); ctx.translate(x + (dm ? rnd(-3, 3) * (.4 + dm) : 0), y + (dm ? rnd(-2, 2) * (.4 + dm) : 0)); if (dm) ctx.globalAlpha = 1 - .35 * dm; towerArt(ctx, t.t, t.l, t.ang, t.sh);
      if (dm) { ctx.globalAlpha = .55 * dm; ctx.strokeStyle = '#1a1208'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(2, -12); ctx.lineTo(-8, 2); ctx.lineTo(4, 22); ctx.moveTo(14, -20); ctx.lineTo(8, -4); ctx.lineTo(18, 10); ctx.stroke(); }
      ctx.restore();
      if (dm) { ctx.save(); ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(x, y, 52, 0, 7); ctx.stroke(); ctx.strokeStyle = '#ff4d5e'; ctx.beginPath(); ctx.arc(x, y, 52, -1.5708, -1.5708 + 6.2832 * dm); ctx.stroke(); ctx.restore(); }
      if (t.l >= 3) warm(x, y, 110, .22 + .08 * Math.sin(T * 3));
      if (near) { ctx.strokeStyle = TOW[t.t].col; ctx.globalAlpha = .45; ctx.lineWidth = 2; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(x, y, twRng(t), 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    }
  }
}
/* ---------- Textures des unités alliées : soldats (un look par arme), tanks, avions ---------- */
/* Soldat vu de dessus, tourné vers +x. Même style que le menu de recrutement : corps ovale, casque brillant, arme colorée.
   o = { ph (pas), mv (en marche), fl (éclair de tir), hf (touché) } */
function soldierArt(c, id, T, o) {
  const S = SOLD[id], W0 = WP[id], hit = o.hf > 0, body = hit ? '#ff7a70' : S.body, st = o.mv ? Math.sin(o.ph * 1.6) * 5 : 0;
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  /* bottes (alternées quand le soldat marche) */
  c.fillStyle = '#1b1d22'; c.strokeStyle = '#08090c'; c.lineWidth = 1;
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(-2 + st * s, s * 5.8, 5.2, 3.2, 0, 0, 7); c.fill(); c.stroke(); }
  /* sac à dos */
  c.fillStyle = S.dk; c.beginPath(); c.roundRect(-15, -7.5, 10, 15, 3); c.fill();
  c.fillStyle = 'rgba(255,255,255,.14)'; c.fillRect(-14, -6, 2.2, 12); c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(-9.5, -6, 1.6, 12);
  /* arme du jeu */
  c.save(); c.translate(15, 2.4); c.scale(.5, .5); wArt(c, id, W0.col); c.restore();
  /* corps */
  const bg = c.createRadialGradient(-2.5, -4, 1, 0, 0, 17); bg.addColorStop(0, body); bg.addColorStop(.7, body); bg.addColorStop(1, hit ? '#a03030' : S.dk);
  c.fillStyle = bg; c.strokeStyle = S.dk; c.lineWidth = 1.7; c.beginPath(); c.ellipse(0, 0, 9.8, 14.8, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.ellipse(-2, -6.5, 4.2, 6.5, .25, 0, 7); c.fill();
  /* épaulettes de la couleur de l'arme */
  for (const s of [-1, 1]) { c.fillStyle = W0.col; c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = .8; c.beginPath(); c.ellipse(1.5, s * 13, 3.6, 2.4, 0, 0, 7); c.fill(); c.stroke(); }
  /* équipement propre à chaque arme */
  if (id === 'rifle') { c.fillStyle = '#2b3112'; c.fillRect(3.5, -6.5, 3.4, 4.2); c.fillRect(3.5, 2.3, 3.4, 4.2); }
  else if (id === 'smg') { c.fillStyle = W0.col; c.beginPath(); c.moveTo(-5, -2.2); c.lineTo(-12, -5.5); c.lineTo(-10, 0); c.lineTo(-12, 5.5); c.lineTo(-5, 2.2); c.closePath(); c.fill(); }
  else if (id === 'shotgun') { c.strokeStyle = '#3b230e'; c.lineWidth = 3; c.beginPath(); c.moveTo(-5, -11); c.lineTo(5, 11); c.stroke(); c.fillStyle = '#ff7a2f'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(-5 + k * 2.5, -11 + k * 5.5, 1.3, 0, 7); c.fill(); } }
  else if (id === 'sniper') { c.globalAlpha = .75; for (let k = 0; k < 7; k++) { c.fillStyle = k % 2 ? '#2a4230' : '#7a9a62'; c.beginPath(); c.arc(-6 + (k * 37 % 13) * .9, -9 + (k * 53 % 19), 2.2 + (k % 3) * .6, 0, 7); c.fill(); } c.globalAlpha = 1; }
  else if (id === 'launcher') { for (let k = 0; k < 3; k++) { c.fillStyle = '#34322e'; c.beginPath(); c.arc(-5 + k * 4.6, 10.4, 2.5, 0, 7); c.fill(); c.fillStyle = W0.col; c.beginPath(); c.arc(-5 + k * 4.6, 10.4, 1.2, 0, 7); c.fill(); } }
  else if (id === 'mini') { c.fillStyle = '#d9b24a'; for (let k = 0; k < 7; k++) { c.beginPath(); c.arc(-6 + k * 2.9, 9 - k * 1.1, 1.5, 0, 7); c.fill(); } c.fillStyle = '#2a2a2f'; c.strokeStyle = '#0b0b0d'; c.lineWidth = 1; for (const s of [-1, 1]) { c.beginPath(); c.roundRect(-3, s * 14 - 2.8, 10, 5.6, 2); c.fill(); c.stroke(); } }
  else if (id === 'laser') { const pg = c.createRadialGradient(0, 0, 0, 0, 0, 8); pg.addColorStop(0, 'rgba(255,255,255,.95)'); pg.addColorStop(.4, 'rgba(255,106,213,.7)'); pg.addColorStop(1, 'rgba(255,106,213,0)'); c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = .7 + .3 * Math.sin(T * 6); c.fillStyle = pg; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill(); c.restore(); }
  /* bras et mains sur l'arme */
  const arm = (x1, y1, x2, y2) => { c.strokeStyle = S.dk; c.lineWidth = 5.6; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = body; c.lineWidth = 3.6; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.fillStyle = '#e3bf98'; c.beginPath(); c.arc(x2, y2, 2.3, 0, 7); c.fill(); };
  arm(1.5, 12, 13, 3.6); arm(1.5, -12, 19, -.8);
  /* tête : casque brillant, lunettes */
  c.fillStyle = S.head; c.strokeStyle = S.dk; c.lineWidth = 1.5; c.beginPath(); c.arc(1, 0, 7.6, 0, 7); c.fill(); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.3)'; c.lineWidth = 1; c.beginPath(); c.arc(1, 0, 5.2, 0, 7); c.stroke();
  c.fillStyle = W0.col; c.globalAlpha = .8; c.fillRect(-5, -1, 9, 2); c.globalAlpha = 1;
  c.fillStyle = 'rgba(255,255,255,.42)'; c.beginPath(); c.ellipse(-1, -3, 3.6, 2.2, -.5, 0, 7); c.fill();
  c.fillStyle = 'rgba(12,15,22,.9)'; c.beginPath(); c.ellipse(6.6, 0, 1.9, 4.3, 0, 0, 7); c.fill();
  c.fillStyle = id === 'laser' ? '#7ff6ff' : 'rgba(170,215,255,.75)'; c.beginPath(); c.ellipse(7, -1.5, .7, 1.3, 0, 0, 7); c.fill();
  /* éclair de tir au bout du canon */
  if (o.fl > 0) {
    const mz = MZ[id], k = Math.min(1, o.fl / .08), r = (id === 'shotgun' || id === 'launcher' ? 12 : id === 'mini' ? 10 : 8) * (.7 + .3 * k), fg = c.createRadialGradient(mz, 0, 0, mz, 0, r * 1.6);
    fg.addColorStop(0, 'rgba(255,255,255,.95)'); fg.addColorStop(.35, W0.col); fg.addColorStop(1, 'rgba(255,150,40,0)');
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = fg; c.beginPath(); c.arc(mz + 2, 0, r * 1.6, 0, 7); c.fill(); c.restore();
  }
  c.restore();
}
/* Tank vu de dessus. o = { ha (cap de la caisse), ang (visée de la tourelle), l (niveau), fl (tir), hf (touché), ph (distance parcourue : chenilles), T } */
function tankArt(c, o) {
  const l = o.l || 0, T = o.T || 0, hit = o.hf > 0;
  const hc = ['#5f6f40', '#687b44', '#76904c', '#b09a4c'][l], hd = ['#3f4a2a', '#46552d', '#506434', '#7a6a30'][l], hl = ['#7d8f58', '#899f5b', '#9ab565', '#d4be6c'][l];
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  /* ---- caisse et chenilles ---- */
  c.save(); c.rotate(o.ha || 0);
  const off = (((-(o.ph || 0)) % 5) + 5) % 5;
  for (const s of [-1, 1]) {
    const y0 = s < 0 ? -22 : 11;
    c.fillStyle = '#14161b'; c.beginPath(); c.roundRect(-31, y0, 62, 11, 4); c.fill();
    c.fillStyle = '#2e323c'; for (let xx = -29 + off; xx < 29; xx += 5) c.fillRect(xx, y0 + 1, 2.4, 9);
    c.strokeStyle = '#0b0c0f'; c.lineWidth = 1; c.fillStyle = '#4b5060';
    for (const wx of [-23, -11.5, 0, 11.5, 23]) { c.beginPath(); c.arc(wx, y0 + 5.5, 3.3, 0, 7); c.fill(); c.stroke(); }
    for (const wx of [-27, 27]) { c.fillStyle = '#6a7084'; c.beginPath(); c.arc(wx, y0 + 5.5, 4.4, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#2a2d36'; c.beginPath(); c.arc(wx, y0 + 5.5, 1.6, 0, 7); c.fill(); }
  }
  c.fillStyle = hd; for (const s of [-1, 1]) { c.beginPath(); c.roundRect(-29, s < 0 ? -17.5 : 13.5, 58, 4, 1.5); c.fill(); }
  const hg = c.createLinearGradient(0, -14, 0, 14); hg.addColorStop(0, hit ? '#ff8a80' : hl); hg.addColorStop(.35, hit ? '#e05a50' : hc); hg.addColorStop(1, hit ? '#a03030' : hd);
  c.fillStyle = hg; c.strokeStyle = '#1b2011'; c.lineWidth = 1.8; c.beginPath(); c.roundRect(-28, -14, 56, 28, 5); c.fill(); c.stroke();
  c.fillStyle = hd; c.globalAlpha = .5; for (const b of [[-6, -7, 8, 3.6, .3], [10, 6, 7, 3.2, -.4], [-17, 3, 5, 3, .2], [18, -8, 4, 2.4, .6]]) { c.beginPath(); c.ellipse(b[0], b[1], b[2], b[3], b[4], 0, 7); c.fill(); } c.globalAlpha = 1;
  c.fillStyle = hl; c.globalAlpha = .5; c.beginPath(); c.moveTo(28, -14); c.lineTo(28, 14); c.lineTo(19, 11); c.lineTo(19, -11); c.closePath(); c.fill(); c.globalAlpha = 1;
  c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1; c.beginPath(); c.moveTo(19, -11); c.lineTo(19, 11); c.stroke();
  c.fillStyle = '#ffe9a0'; for (const s of [-1, 1]) { c.beginPath(); c.arc(26.5, s * 9, 1.9, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(-26, -11, 12, 22); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1; c.beginPath(); for (let xx = -25; xx < -14; xx += 2.5) { c.moveTo(xx, -10); c.lineTo(xx, 10); } c.stroke();
  c.fillStyle = '#1b1d22'; for (const s of [-1, 1]) { c.beginPath(); c.arc(-30, s * 8, 2.4, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(0,0,0,.35)'; for (let xx = -22; xx <= 22; xx += 6) for (const s of [-1, 1]) { c.beginPath(); c.arc(xx, s * 12.3, .9, 0, 7); c.fill(); }
  c.fillStyle = '#ffd24a'; for (let k = 0; k <= l; k++) c.fillRect(8 + k * 4.2, 14.5, 2.4, 2);
  c.restore();
  /* ---- tourelle ---- */
  c.save(); c.rotate(o.ang || 0);
  const rec = o.fl > 0 ? -4.5 * Math.min(1, o.fl / .08) : 0, bl = 30 + 2 * l, bx = 10 + rec;
  const bgd = c.createLinearGradient(0, -3.6, 0, 3.6); bgd.addColorStop(0, '#6a7082'); bgd.addColorStop(.5, '#3d414d'); bgd.addColorStop(1, '#1d1f26');
  c.fillStyle = bgd; c.strokeStyle = '#0d0e11'; c.lineWidth = 1; c.beginPath(); c.rect(bx, -3.6, bl, 7.2); c.fill(); c.stroke();
  c.fillStyle = '#3a3f4c'; c.fillRect(bx + bl * .55, -4.5, 3.6, 9);
  c.fillStyle = '#ffd24a'; for (let k = 0; k < l; k++) c.fillRect(bx + 4 + k * 4.2, -3.8, 2, 7.6);
  c.fillStyle = '#1a1c22'; c.beginPath(); c.roundRect(bx + bl - 1, -4.9, 8.5, 9.8, 1.5); c.fill(); c.stroke();
  c.strokeStyle = '#4b5060'; c.beginPath(); c.moveTo(bx + bl + 2.5, -4.9); c.lineTo(bx + bl + 2.5, 4.9); c.moveTo(bx + bl + 5.5, -4.9); c.lineTo(bx + bl + 5.5, 4.9); c.stroke();
  c.fillStyle = '#34382a'; c.strokeStyle = '#14160e'; c.lineWidth = 1.2; c.beginPath(); c.roundRect(4, -8.5, 9, 17, 3); c.fill(); c.stroke();
  c.fillStyle = hd; c.beginPath(); c.roundRect(-22, -9, 9, 18, 2.5); c.fill(); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.4)'; c.beginPath(); c.moveTo(-22, -3); c.lineTo(-13, -3); c.moveTo(-22, 3); c.lineTo(-13, 3); c.stroke();
  const tg = c.createRadialGradient(-3, -4, 1, 0, 0, 17); tg.addColorStop(0, hit ? '#ffa095' : hl); tg.addColorStop(.6, hit ? '#e0584d' : hc); tg.addColorStop(1, hit ? '#a03030' : hd);
  c.fillStyle = tg; c.strokeStyle = '#1b2011'; c.lineWidth = 2; c.beginPath(); c.moveTo(-15, -8); c.lineTo(-7, -13); c.lineTo(8, -12.5); c.lineTo(15, -7); c.lineTo(15, 7); c.lineTo(8, 12.5); c.lineTo(-7, 13); c.lineTo(-15, 8); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#14160e'; c.lineWidth = 1.2;
  c.fillStyle = hd; c.beginPath(); c.arc(-3, -5, 4.4, 0, 7); c.fill(); c.stroke(); c.fillStyle = hc; c.beginPath(); c.arc(-3, -5, 2.8, 0, 7); c.fill(); c.stroke();
  c.fillStyle = hd; c.beginPath(); c.arc(-5.5, 5.5, 3.6, 0, 7); c.fill(); c.stroke(); c.fillStyle = hc; c.beginPath(); c.arc(-5.5, 5.5, 2.2, 0, 7); c.fill(); c.stroke();
  c.strokeStyle = '#22252c'; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, -5); c.lineTo(7, -6.4); c.stroke();
  const sw = Math.sin(T * 2.4 + (o.ph || 0) * .05) * 2.5; c.strokeStyle = '#d8dce8'; c.lineWidth = .9; c.beginPath(); c.moveTo(-12, 7); c.quadraticCurveTo(-22, 8 + sw * .5, -30, 7 + sw); c.stroke();
  c.fillStyle = '#ff4d5e'; c.beginPath(); c.arc(-30, 7 + sw, 1.2, 0, 7); c.fill();
  if (o.fl > 0) {   /* éclair de bouche */
    const k = Math.min(1, o.fl / .08), mx0 = bx + bl + 9, fg = c.createRadialGradient(mx0, 0, 0, mx0, 0, 18);
    fg.addColorStop(0, 'rgba(255,255,255,1)'); fg.addColorStop(.3, '#ffb347'); fg.addColorStop(1, 'rgba(255,120,30,0)');
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = fg; c.beginPath(); c.arc(mx0, 0, 18 * (.6 + .4 * k), 0, 7); c.fill(); c.restore();
  }
  c.restore(); c.restore();
}
/* Avion vu de dessus, nez vers +x. o = { T, l } · o.sh = couleur → seulement la silhouette (ombre) */
function planeArt(c, o) {
  const T = o.T || 0, l = o.l || 0, acc = TOW.plane.col;
  const wing = s => { c.beginPath(); c.moveTo(9, s * 3); c.lineTo(-5, s * 28); c.lineTo(-13, s * 28); c.lineTo(-9, s * 3); c.closePath(); };
  const tail = s => { c.beginPath(); c.moveTo(-16, s * 2.5); c.lineTo(-25, s * 12.5); c.lineTo(-29, s * 12.5); c.lineTo(-25, s * 2.5); c.closePath(); };
  const fus = () => { c.beginPath(); c.moveTo(32, 0); c.bezierCurveTo(25, -4.8, 6, -6.4, -8, -5.6); c.bezierCurveTo(-20, -4.8, -27, -3.6, -31, -2.7); c.lineTo(-31, 2.7); c.bezierCurveTo(-27, 3.6, -20, 4.8, -8, 5.6); c.bezierCurveTo(6, 6.4, 25, 4.8, 32, 0); c.closePath(); };
  if (o.sh) { c.fillStyle = o.sh; for (const s of [-1, 1]) { wing(s); c.fill(); tail(s); c.fill(); } fus(); c.fill(); return; }
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  /* flammes des réacteurs */
  c.save(); c.globalCompositeOperation = 'lighter';
  for (const s of [-1, 1]) { const len = 9 + 6 * (.75 + .25 * Math.sin(T * 38 + s * 2)), g = c.createLinearGradient(-31, 0, -31 - len, 0); g.addColorStop(0, 'rgba(255,240,200,.95)'); g.addColorStop(.4, 'rgba(255,150,50,.6)'); g.addColorStop(1, 'rgba(255,80,20,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(-31, s * 2.8 - 2); c.lineTo(-31 - len, s * 2.8); c.lineTo(-31, s * 2.8 + 2); c.closePath(); c.fill(); }
  c.restore();
  for (const s of [-1, 1]) {
    /* ailes : bord d'attaque clair, volets, munitions sous l'aile, cocarde, feu de position */
    wing(s); const wg = c.createLinearGradient(8, 0, -13, 0); wg.addColorStop(0, '#e6ebf5'); wg.addColorStop(1, '#a9b3c7'); c.fillStyle = wg; c.fill(); c.strokeStyle = '#6c778d'; c.lineWidth = .9; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(9, s * 3); c.lineTo(-5, s * 28); c.stroke();
    c.strokeStyle = 'rgba(50,60,80,.45)'; c.lineWidth = .8; c.beginPath(); c.moveTo(-2, s * 6); c.lineTo(-9.5, s * 27.5); c.moveTo(-6, s * 4.5); c.lineTo(-11, s * 27.7); c.stroke();
    for (let k = 0; k < (l >= 2 ? 2 : 1); k++) { const by = s * (21 - k * 9); c.fillStyle = '#2b2f3a'; c.beginPath(); c.ellipse(-2, by, 4.6, 1.9, 0, 0, 7); c.fill(); c.fillStyle = '#ff4d3a'; c.beginPath(); c.ellipse(1.6, by, 1.4, 1.5, 0, 0, 7); c.fill(); }
    c.fillStyle = acc; c.beginPath(); c.arc(-3, s * 14.5, 3.8, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(-3, s * 14.5, 2.5, 0, 7); c.fill(); c.fillStyle = acc; c.beginPath(); c.arc(-3, s * 14.5, 1.3, 0, 7); c.fill();
    const bl = .6 + .4 * Math.sin(T * 5); c.save(); c.globalAlpha = bl; c.fillStyle = s < 0 ? '#ff3b3b' : '#3bff7a'; c.beginPath(); c.arc(-9.5, s * 28.2, 1.6, 0, 7); c.fill(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = bl * .5; c.beginPath(); c.arc(-9.5, s * 28.2, 4, 0, 7); c.fill(); c.restore();
    tail(s); c.fillStyle = '#bcc6d8'; c.fill(); c.strokeStyle = '#6c778d'; c.lineWidth = .9; c.stroke();
  }
  /* fuselage */
  const fg = c.createLinearGradient(0, -6.4, 0, 6.4); fg.addColorStop(0, '#f4f7fc'); fg.addColorStop(.5, '#d3dae8'); fg.addColorStop(1, '#98a3ba');
  fus(); c.fillStyle = fg; c.fill(); c.strokeStyle = '#6c778d'; c.lineWidth = .9; c.stroke();
  c.strokeStyle = acc; c.lineWidth = 2; c.globalAlpha = .9; c.beginPath(); c.moveTo(24, 0); c.lineTo(-27, 0); c.stroke(); c.globalAlpha = 1;
  c.fillStyle = acc; for (let k = 0; k <= l; k++) c.fillRect(-9 - k * 4.4, -4.6, 2.2, 9.2);
  c.strokeStyle = 'rgba(60,70,90,.35)'; c.lineWidth = .8; c.beginPath(); c.moveTo(-1, -5.4); c.lineTo(-1, 5.4); c.moveTo(-17, -4.4); c.lineTo(-17, 4.4); c.stroke();
  c.fillStyle = '#2a2f3a'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(3, s * 5.2, 3.6, 1.5, 0, 0, 7); c.fill(); }
  const cg = c.createLinearGradient(0, -3.4, 0, 3.4); cg.addColorStop(0, '#bfe4ff'); cg.addColorStop(.5, '#3d6ea3'); cg.addColorStop(1, '#1b3556');
  c.fillStyle = cg; c.strokeStyle = '#1d2a3f'; c.lineWidth = .9; c.beginPath(); c.ellipse(13, 0, 7.6, 3.4, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(9.6, -3.1); c.lineTo(9.6, 3.1); c.moveTo(16, -2.7); c.lineTo(16, 2.7); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(13.5, -1.3, 3.4, .9, 0, 0, 7); c.fill();
  c.fillStyle = '#4a5266'; c.beginPath(); c.ellipse(29.6, 0, 2.6, 1.7, 0, 0, 7); c.fill(); c.strokeStyle = '#4a5266'; c.lineWidth = 1; c.beginPath(); c.moveTo(32, 0); c.lineTo(35, 0); c.stroke();
  for (const s of [-1, 1]) { c.fillStyle = '#1c1e25'; c.beginPath(); c.arc(-31, s * 2.8, 2.3, 0, 7); c.fill(); c.fillStyle = 'rgba(255,154,60,' + (.6 + .4 * Math.sin(T * 38 + s)).toFixed(2) + ')'; c.beginPath(); c.arc(-31, s * 2.8, 1.2, 0, 7); c.fill(); }
  if (Math.sin(T * 6) > .75) { c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,255,255,.9)'; c.beginPath(); c.arc(-27, 0, 2.4, 0, 7); c.fill(); c.restore(); }
  c.restore();
}
/* Distance (le long du chemin, depuis l'entrée) où les unités s'arrêtent : un peu avant l'entrée des zombies. Le tank se place devant, les soldats derrière. */
const unitStop = u => u.k === 'tank' ? 170 : 215 + (u.si % 3) * 16 + Math.floor(u.si / 3) * 34;
/* ---------- Hangar à tanks (emplacement « Tank ») : vu de dessus, porte vers la droite ---------- */
function hangarArt(x, l, ang) {
  const T = performance.now() / 1000, tr = ['#7a8a5a', '#8fa060', '#a3b86a', '#d9b94a'][l], ro = ['#6d7566', '#737e6c', '#7c8a74', '#8a8f78'][l];
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  /* dalle de béton, ombre, voie de sortie peinte */
  x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.roundRect(-40, -38, 92, 92, 8); x.fill();
  const ag = x.createLinearGradient(-46, -46, 46, 46); ag.addColorStop(0, '#85888e'); ag.addColorStop(1, '#5b5e66');
  x.fillStyle = ag; x.strokeStyle = '#2f3238'; x.lineWidth = 2; x.beginPath(); x.roundRect(-46, -46, 92, 92, 7); x.fill(); x.stroke();
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -46); x.lineTo(0, 46); x.moveTo(-46, 0); x.lineTo(46, 0); x.stroke();
  x.strokeStyle = 'rgba(255,214,74,.7)'; x.lineWidth = 1.6; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(36, -13); x.lineTo(45, -13); x.moveTo(36, 13); x.lineTo(45, 13); x.stroke(); x.setLineDash([]);
  /* annexes (ateliers) selon le niveau */
  const annex = (ax, ay, w, h) => {
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(ax + 3, ay + 4, w, h);
    x.fillStyle = '#585f55'; x.strokeStyle = '#23271f'; x.lineWidth = 1.5; x.beginPath(); x.roundRect(ax, ay, w, h, 2); x.fill(); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(ax + 1, ay + 1, w - 2, 2.5); x.fillStyle = '#2f342c'; for (let k = 0; k < 3; k++) x.fillRect(ax + 5 + k * 11, ay + 4, 6, h - 8);
  };
  if (l >= 1) annex(-36, -42, 36, 12);
  if (l >= 2) annex(-36, 30, 36, 12);
  /* corps du hangar : toit en demi-cylindre de tôle ondulée */
  x.fillStyle = 'rgba(0,0,0,.32)'; x.fillRect(-37, -26, 66, 60);
  const rg = x.createLinearGradient(0, -30, 0, 30); rg.addColorStop(0, '#3f453c'); rg.addColorStop(.22, ro); rg.addColorStop(.5, '#a3ad9e'); rg.addColorStop(.78, ro); rg.addColorStop(1, '#3a3f37');
  x.fillStyle = rg; x.strokeStyle = '#1f231c'; x.lineWidth = 2; x.beginPath(); x.roundRect(-40, -30, 66, 60, 4); x.fill(); x.stroke();
  x.lineWidth = 1; for (let xx = -37; xx < 25; xx += 3.2) { x.strokeStyle = 'rgba(0,0,0,.16)'; x.beginPath(); x.moveTo(xx, -29); x.lineTo(xx, 29); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.moveTo(xx + 1.4, -29); x.lineTo(xx + 1.4, 29); x.stroke(); }
  x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = 1.6; x.beginPath(); for (const sx of [-18, 4]) { x.moveTo(sx, -30); x.lineTo(sx, 30); } x.stroke();
  x.fillStyle = 'rgba(0,0,0,.45)'; for (const sx of [-18, 4]) for (let yy = -26; yy <= 26; yy += 8.7) { x.beginPath(); x.arc(sx, yy, .9, 0, 7); x.fill(); }
  x.fillStyle = tr; x.fillRect(-40, -30, 3, 60); x.fillRect(22, -30, 4, 60);
  /* passerelle centrale, ventilateurs, verrières */
  x.fillStyle = 'rgba(30,34,28,.55)'; x.fillRect(-36, -2, 54, 4); x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = .8; x.beginPath(); for (let xx = -35; xx < 18; xx += 3) { x.moveTo(xx, -2); x.lineTo(xx, 2); } x.stroke();
  for (const fx of [-26, -8]) {
    x.fillStyle = '#2d3129'; x.strokeStyle = '#11130f'; x.lineWidth = 1; x.beginPath(); x.arc(fx, 0, 5.4, 0, 7); x.fill(); x.stroke();
    x.strokeStyle = '#aeb6a6'; x.lineWidth = 1.7; for (let k = 0; k < 3; k++) { const a = T * 8 + k * 2.094; x.beginPath(); x.moveTo(fx, 0); x.lineTo(fx + Math.cos(a) * 4.4, Math.sin(a) * 4.4); x.stroke(); }
  }
  for (const sx of [-30, -8]) for (const s of [-1, 1]) {
    const vy = s * 14; x.fillStyle = '#22303f'; x.fillRect(sx - 7, vy - 4.5, 14, 9); x.fillStyle = 'rgba(150,215,255,.8)'; x.fillRect(sx - 6, vy - 3.5, 12, 7);
    x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.moveTo(sx - 5, vy + 3); x.lineTo(sx - 1, vy - 3.2); x.lineTo(sx + 1.5, vy - 3.2); x.lineTo(sx - 2.5, vy + 3); x.closePath(); x.fill();
    x.strokeStyle = '#22303f'; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, vy - 4.5); x.lineTo(sx, vy + 4.5); x.stroke();
  }
  /* emblème de tank peint sur le toit */
  x.save(); x.translate(13, -15); x.globalAlpha = .85; x.fillStyle = '#2a2d26'; x.fillRect(-8, -6, 16, 2.4); x.fillRect(-8, 3.6, 16, 2.4);
  x.fillStyle = tr; x.strokeStyle = '#1f231c'; x.lineWidth = .8; x.fillRect(-7, -4.5, 14, 9); x.strokeRect(-7, -4.5, 14, 9); x.beginPath(); x.arc(-1, 0, 3.2, 0, 7); x.fill(); x.stroke(); x.fillRect(1, -.9, 10, 1.8); x.restore();
  /* cheminée d'échappement + mât radio */
  x.fillStyle = '#2a2d26'; x.strokeStyle = '#777'; x.lineWidth = 1; x.beginPath(); x.arc(-33, 23, 3, 0, 7); x.fill(); x.stroke();
  for (let k = 0; k < 2; k++) { const ph = (T * .6 + k * .5) % 1; x.globalAlpha = (1 - ph) * .35; x.fillStyle = '#d0d0d0'; x.beginPath(); x.arc(-33 + ph * 5, 23 - ph * 14, 2.4 + ph * 5, 0, 7); x.fill(); } x.globalAlpha = 1;
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = .8; x.beginPath(); for (const [dx, dy] of [[9, 9], [-9, 9], [9, -9], [-9, -9]]) { x.moveTo(14, 21); x.lineTo(14 + dx, 21 + dy); } x.stroke();
  x.fillStyle = '#c8ccd6'; x.beginPath(); x.arc(14, 21, 2, 0, 7); x.fill(); x.fillStyle = Math.sin(T * 5) > 0 ? '#ff4d5e' : '#5a1a20'; x.beginPath(); x.arc(14, 21, 1.1, 0, 7); x.fill();
  if (l >= 3) { x.strokeStyle = '#ffd24a'; x.lineWidth = 1.6; x.beginPath(); x.roundRect(-40, -30, 66, 60, 4); x.stroke(); }
  /* grande porte : intérieur sombre, tank qui attend, phares, cadre rayé, volet relevé */
  x.fillStyle = '#17191d'; x.fillRect(26, -25, 9, 50);
  const dg = x.createLinearGradient(26, 0, 35, 0); dg.addColorStop(0, '#0c0d10'); dg.addColorStop(1, '#2c313b'); x.fillStyle = dg; x.fillRect(27, -22, 7, 44);
  x.fillStyle = '#4a5632'; x.beginPath(); x.roundRect(26.5, -13, 6, 26, 2); x.fill(); x.fillStyle = '#2a2d26'; x.fillRect(26.5, -15, 6, 3); x.fillRect(26.5, 12, 6, 3);
  x.save(); x.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) { const hg = x.createRadialGradient(32, s * 9, 0, 32, s * 9, 8); hg.addColorStop(0, 'rgba(255,235,160,.9)'); hg.addColorStop(1, 'rgba(255,200,80,0)'); x.fillStyle = hg; x.beginPath(); x.arc(32, s * 9, 8, 0, 7); x.fill(); } x.restore();
  for (let yy = -26, k = 0; yy < 26; yy += 5, k++) { x.fillStyle = k % 2 ? '#1b1b1b' : '#f2c230'; x.fillRect(34, yy, 3.2, Math.min(5, 26 - yy)); }
  x.fillStyle = '#f2c230'; x.fillRect(26, -27, 9, 2.4); x.fillStyle = '#1b1b1b'; x.fillRect(30.5, -27, 4.5, 2.4); x.fillStyle = '#f2c230'; x.fillRect(26, 24.6, 9, 2.4); x.fillStyle = '#1b1b1b'; x.fillRect(30.5, 24.6, 4.5, 2.4);
  x.fillStyle = '#8d949f'; x.fillRect(24, -26, 3, 52); x.strokeStyle = 'rgba(0,0,0,.4)'; x.lineWidth = .7; x.beginPath(); for (let yy = -24; yy < 26; yy += 3) { x.moveTo(24, yy); x.lineTo(27, yy); } x.stroke();
  /* projecteurs, sacs de sable, fûts */
  for (const s of [-1, 1]) {
    x.fillStyle = '#c8ccd6'; x.beginPath(); x.arc(38, s * 29, 2.2, 0, 7); x.fill();
    x.save(); x.globalCompositeOperation = 'lighter'; const lg = x.createRadialGradient(38, s * 29, 0, 38, s * 29, 20); lg.addColorStop(0, 'rgba(255,235,170,.4)'); lg.addColorStop(1, 'rgba(255,235,170,0)'); x.fillStyle = lg; x.beginPath(); x.arc(38, s * 29, 20, 0, 7); x.fill(); x.restore();
    for (let k = 0; k < 3; k++) { x.fillStyle = '#b09c6c'; x.strokeStyle = '#6a5a3a'; x.lineWidth = .8; x.beginPath(); x.ellipse(41 + (k % 2) * 2, s * (34 + k * 4), 4.6, 2.8, 0, 0, 7); x.fill(); x.stroke(); }
  }
  for (const [bx, by, bc] of [[-43, -38, '#c0392b'], [-43, -32, '#2c6fb0']]) { x.fillStyle = bc; x.strokeStyle = '#1a1a1a'; x.lineWidth = 1; x.beginPath(); x.arc(bx, by, 3.2, 0, 7); x.fill(); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(bx, by, 1.8, 0, 7); x.stroke(); }
  /* drapeau et radar du niveau maximum */
  if (l >= 3) {
    x.fillStyle = '#c8ccd6'; x.beginPath(); x.arc(41, -42, 1.8, 0, 7); x.fill(); x.fillStyle = '#ffd24a'; x.beginPath(); x.moveTo(41, -43.5);
    for (let i = 0; i <= 8; i++) { const t = i / 8; x.lineTo(41 - t * 14, -43.5 + Math.sin(T * 5 + t * 5) * 1.8 * t); } for (let i = 8; i >= 0; i--) { const t = i / 8; x.lineTo(41 - t * 14, -37.5 + Math.sin(T * 5 + t * 5) * 1.8 * t); } x.closePath(); x.fill();
    x.save(); x.translate(-14, -36); x.rotate(T * 1.2); x.fillStyle = '#cfd6e0'; x.strokeStyle = '#555'; x.lineWidth = .8; x.beginPath(); x.ellipse(0, 0, 6, 3, 0, 0, 7); x.fill(); x.stroke(); x.beginPath(); x.moveTo(0, 0); x.lineTo(6, 0); x.stroke(); x.restore();
  }
  for (let k = 0; k < 3; k++) { x.fillStyle = k < l ? '#ffd24a' : 'rgba(0,0,0,.45)'; x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1; x.beginPath(); x.arc(8 + k * 9, 41, 3.2, 0, 7); x.fill(); x.stroke(); }
  x.restore();
}
/* ---------- Caserne (emplacement « Caserne ») : bâtiment à toit de tuiles, cour d'exercice avec ses soldats, drapeau, miradors ---------- */
function barracksArt(x, l) {
  const T = performance.now() / 1000, K0 = TOW.barracks, roof = ['#8a3b2c', '#9c4a34', '#b05a3a', '#c8a24a'][l], roofD = ['#6a2c20', '#7a3826', '#8c4630', '#9c7e30'][l];
  x.save(); x.lineJoin = 'round'; x.lineCap = 'round';
  x.fillStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.roundRect(-40, -38, 92, 92, 8); x.fill();
  const gg = x.createLinearGradient(0, -46, 0, 46); gg.addColorStop(0, '#5d6054'); gg.addColorStop(1, '#43463d');
  x.fillStyle = gg; x.strokeStyle = '#25271f'; x.lineWidth = 2; x.beginPath(); x.roundRect(-46, -46, 92, 92, 7); x.fill(); x.stroke();
  /* cour d'exercice */
  x.fillStyle = '#74776a'; x.beginPath(); x.roundRect(-40, -9, 80, 41, 3); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = 1.2; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(-38, 13.5); x.lineTo(38, 13.5); x.stroke(); x.setLineDash([]);
  x.strokeStyle = 'rgba(255,255,255,.22)'; x.beginPath(); x.rect(-38, -7, 76, 37); x.stroke();
  /* bâtiment principal : toit à deux pans, tuiles, faîtage, cheminées, lucarnes éclairées, étoile */
  x.fillStyle = '#4a4036'; x.fillRect(-43, -44, 86, 32);
  x.fillStyle = roof; x.fillRect(-42, -43, 84, 15); x.fillStyle = roofD; x.fillRect(-42, -28, 84, 15);
  x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(-42, -43, 84, 4);
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1;
  for (let r = 0; r < 8; r++) { const yy = -43 + r * 3.75; x.beginPath(); x.moveTo(-42, yy); x.lineTo(42, yy); for (let xx = -42 + (r % 2) * 4; xx < 42; xx += 8) { x.moveTo(xx, yy); x.lineTo(xx, yy + 3.75); } x.stroke(); }
  x.fillStyle = '#2b1e18'; x.fillRect(-42, -29.2, 84, 2.4); x.fillStyle = 'rgba(255,255,255,.3)'; x.fillRect(-42, -29.2, 84, .8);
  x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(-42, -13, 84, 3);
  if (l >= 3) { x.strokeStyle = '#ffd24a'; x.lineWidth = 1.5; x.strokeRect(-42, -43, 84, 30); }
  for (const cx0 of [-28, 26]) {
    x.fillStyle = '#5a3a2e'; x.fillRect(cx0 - 3.5, -40, 7, 7); x.fillStyle = '#2a1a14'; x.fillRect(cx0 - 2.4, -38.9, 4.8, 4.8);
    for (let k = 0; k < 2; k++) { const ph = (T * .5 + k * .5 + cx0 * .01) % 1; x.globalAlpha = (1 - ph) * .35; x.fillStyle = '#ddd'; x.beginPath(); x.arc(cx0 + ph * 6, -36.5 - ph * 16, 2.4 + ph * 5, 0, 7); x.fill(); } x.globalAlpha = 1;
  }
  for (const dx of [-30, -18, 18, 30]) {
    x.fillStyle = '#2a2218'; x.strokeStyle = '#150f0a'; x.lineWidth = 1; x.fillRect(dx - 5, -23.5, 10, 6.5); x.strokeRect(dx - 5, -23.5, 10, 6.5);
    x.fillStyle = 'rgba(255,210,122,' + (.75 + .15 * Math.sin(T * 3 + dx)).toFixed(2) + ')'; x.fillRect(dx - 4, -22.5, 8, 4.5); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(dx - .5, -22.5, 1, 4.5);
  }
  x.fillStyle = '#ffd24a'; x.strokeStyle = '#7a5a10'; x.lineWidth = .8; star(x, 0, -35.5, 5.5, 5, .45, -Math.PI / 2); x.fill(); x.stroke();
  x.fillStyle = '#9a9a92'; x.strokeStyle = '#3a3a35'; x.lineWidth = 1; x.fillRect(-9, -13, 18, 6.5); x.strokeRect(-9, -13, 18, 6.5); x.fillStyle = '#2b2a28'; x.fillRect(-4, -12, 8, 5);
  x.save(); x.globalCompositeOperation = 'lighter'; for (const s of [-1, 1]) { const lg = x.createRadialGradient(s * 11, -9, 0, s * 11, -9, 9); lg.addColorStop(0, 'rgba(255,220,140,.5)'); lg.addColorStop(1, 'rgba(255,220,140,0)'); x.fillStyle = lg; x.beginPath(); x.arc(s * 11, -9, 9, 0, 7); x.fill(); } x.restore();
  /* soldats à l'exercice : un par arme du jeu, qui marchent sur place */
  const n = GUARD_N[l];
  for (let i = 0; i < n; i++) { const row = i % 2, col = (i - row) / 2; x.save(); x.translate(-27 + col * 18, row ? 21 : 6); x.rotate(-Math.PI / 2); x.scale(.5, .5); soldierArt(x, GW[i], T, { ph: T * 7 + i * 1.3, mv: 1, fl: 0, hf: 0 }); x.restore(); }
  for (let k = 0; k < 2; k++) { x.fillStyle = '#7a5630'; x.strokeStyle = '#3a2614'; x.lineWidth = .9; x.fillRect(32, -4 + k * 9, 7, 7); x.strokeRect(32, -4 + k * 9, 7, 7); x.beginPath(); x.moveTo(32, -4 + k * 9); x.lineTo(39, 3 + k * 9); x.stroke(); }
  /* drapeau */
  x.fillStyle = '#c8ccd6'; x.beginPath(); x.arc(-37, -5, 2, 0, 7); x.fill(); x.fillStyle = K0.col; x.beginPath(); x.moveTo(-37, -8.5);
  for (let i = 0; i <= 8; i++) { const t = i / 8; x.lineTo(-37 + t * 14, -8.5 + Math.sin(T * 5 + t * 5) * 1.8 * t); } for (let i = 8; i >= 0; i--) { const t = i / 8; x.lineTo(-37 + t * 14, -1.5 + Math.sin(T * 5 + t * 5) * 1.8 * t); } x.closePath(); x.fill();
  x.fillStyle = '#fff'; x.beginPath(); x.arc(-32, -5 + Math.sin(T * 5 + 2.3) * .8, 1.4, 0, 7); x.fill();
  /* clôture, portail à barrière, sacs de sable */
  x.fillStyle = '#24261f'; x.fillRect(-44, 31, 34, 2); x.fillRect(10, 31, 34, 2); for (let xx = -44; xx <= 44; xx += 8) if (Math.abs(xx) > 10) x.fillRect(xx - 1, 29.5, 2, 5);
  x.fillStyle = '#3a3c34'; x.fillRect(-12, 29, 3, 6); x.fillRect(9, 29, 3, 6);
  for (let k = 0; k < 5; k++) { x.fillStyle = k % 2 ? '#f2f2f2' : '#d6342c'; x.fillRect(-9 + k * 4, 31.6, 4, 2.4); }
  for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { x.fillStyle = '#b09c6c'; x.strokeStyle = '#6a5a3a'; x.lineWidth = .8; x.beginPath(); x.ellipse(s * (17 + k * 6.5), 38.5, 3.8, 2.4, 0, 0, 7); x.fill(); x.stroke(); }
  /* miradors avec projecteurs tournants */
  const tower = (tx, ty, a) => {
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(tx - 5, ty - 4, 16, 16); x.fillStyle = '#6d6a60'; x.strokeStyle = '#2a2824'; x.lineWidth = 1.2; x.fillRect(tx - 8, ty - 8, 16, 16); x.strokeRect(tx - 8, ty - 8, 16, 16);
    for (const [pts, c] of [[[-9, -9, 9, -9, 0, 0], roof], [[9, -9, 9, 9, 0, 0], roofD], [[9, 9, -9, 9, 0, 0], '#4a2118'], [[-9, 9, -9, -9, 0, 0], '#b0705a']]) { x.fillStyle = c; x.beginPath(); x.moveTo(tx + pts[0], ty + pts[1]); x.lineTo(tx + pts[2], ty + pts[3]); x.lineTo(tx + pts[4], ty + pts[5]); x.closePath(); x.fill(); }
    x.save(); x.globalCompositeOperation = 'lighter'; const bg = x.createRadialGradient(tx, ty, 0, tx, ty, 46); bg.addColorStop(0, 'rgba(255,240,170,.42)'); bg.addColorStop(1, 'rgba(255,240,170,0)'); x.fillStyle = bg; x.beginPath(); x.moveTo(tx, ty); x.arc(tx, ty, 46, a - .2, a + .2); x.closePath(); x.fill(); x.restore();
    x.fillStyle = '#ffe9a0'; x.beginPath(); x.arc(tx, ty, 2.4, 0, 7); x.fill();
  };
  tower(35, 37, T * 1.2); if (l >= 2) tower(-35, 37, T * 1.2 + 2);
  for (let k = 0; k < 3; k++) { x.fillStyle = k < l ? '#ffd24a' : 'rgba(0,0,0,.45)'; x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1; x.beginPath(); x.arc(-6 + k * 6, 41, 2.5, 0, 7); x.fill(); x.stroke(); }
  x.restore();
}
function drawUnits(cx, cy) {
  const T = performance.now() / 1000;
  for (const u of G.gd) {
    const x = u.x - cx, y = u.y - cy; if (x < -90 || y < -90 || x > W + 90 || y > H + 90) continue;
    const tank = u.k === 'tank', f = clamp(u.hp / u.mhp, 0, 1), tw = G.tw[u.own];
    ctx.save(); ctx.translate(x, y);
    ctx.save(); ctx.translate(4, 7); ctx.fillStyle = 'rgba(0,0,0,.32)';
    if (tank) { ctx.rotate(u.ha); ctx.beginPath(); ctx.roundRect(-31, -22, 62, 44, 7); ctx.fill(); } else { ctx.beginPath(); ctx.ellipse(0, 0, 13, 16, u.ang, 0, 7); ctx.fill(); }
    ctx.restore();
    if (tank) tankArt(ctx, { ha: u.ha, ang: u.ang, l: tw ? tw.l : 0, fl: u.fl, hf: u.hf, ph: u.ph, T });
    else { ctx.rotate(u.ang); soldierArt(ctx, u.w, T, u); }
    ctx.restore();
    if (tank && f < .45) {   /* tank endommagé : fumée noire puis flammes */
      for (let k = 0; k < 3; k++) { const ph = (T * .8 + k / 3) % 1; ctx.globalAlpha = (1 - ph) * (f < .25 ? .55 : .35); ctx.fillStyle = '#1e1e22'; ctx.beginPath(); ctx.arc(x + (k - 1) * 7 + Math.sin(T * 3 + k) * 3, y - 6 - ph * 38, 6 + ph * 11, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1; if (f < .25) warm(x, y - 4, 40, .5 * fk(T, 9));
    }
    ctx.globalAlpha = 1;
    const w = tank ? 50 : 26, by = y - (tank ? 32 : 22);
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - w / 2 - 1, by - 1, w + 2, 6); ctx.fillStyle = f > .5 ? '#5fd6a0' : f > .25 ? '#ffd24a' : '#ff4d5e'; ctx.fillRect(x - w / 2, by, w * f, 4);
    if (!tank) { ctx.fillStyle = WP[u.w].col; ctx.fillRect(x - w / 2 - 1, by - 3, w + 2, 1.5); }
  }
}
function drawAir(cx, cy) {
  const g = G;
  for (const b of g.pb) {
    const k = b.t / b.m, x = b.x - cx, y = b.y - cy;
    ctx.fillStyle = 'rgba(0,0,0,' + (.2 + .2 * (1 - k)).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(x, y, 8 + 12 * (1 - k), 5 + 7 * (1 - k), 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#2b2f3a'; ctx.beginPath(); ctx.ellipse(x, y - k * 90, 5, 8, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#ff6a2f'; ctx.fillRect(x - 2, y - k * 90 - 12, 4, 5);
  }
  const T = performance.now() / 1000;
  for (const q of g.pl) {
    const x = q.x - cx, y = q.y - cy; if (x < -80 || y < -80 || x > W + 80 || y > H + 80) continue;
    const tw = g.tw[q.own];
    ctx.save(); ctx.translate(x + 16, y + 28); ctx.rotate(q.h); ctx.scale(1.15, 1.15); planeArt(ctx, { sh: 'rgba(0,0,0,.25)' }); ctx.restore();
    ctx.save(); ctx.translate(x, y); ctx.rotate(q.h); ctx.scale(1.15, 1.15); planeArt(ctx, { T: T + q.a, l: tw ? tw.l : 0 }); ctx.restore();
  }
}
function drawFx(cx, cy) {
  const g = G;
  g.fx.forEach(f => {
    if (f.k === 'bolt') {
      ctx.save(); ctx.globalAlpha = Math.max(0, f.t / f.m); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = f.c; ctx.shadowBlur = 16;
      const x1 = f.x - cx, y1 = f.y - cy, x2 = f.x2 - cx, y2 = f.y2 - cy, n = 7; ctx.beginPath(); ctx.moveTo(x1, y1);
      for (let i = 1; i < n; i++) ctx.lineTo(x1 + (x2 - x1) * i / n + (Math.random() - .5) * 28, y1 + (y2 - y1) * i / n + (Math.random() - .5) * 28);
      ctx.lineTo(x2, y2); ctx.strokeStyle = f.c; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); return;
    }
    if (f.k === 'crumble') {   /* la tourelle s'effondre sur elle-même */
      const kk = 1 - f.t / f.m, x = f.x - cx, y = f.y - cy; ctx.save(); ctx.translate(x, y + 26); ctx.scale(1 + kk * .35, Math.max(.02, 1 - kk * kk)); ctx.translate(0, -26); ctx.rotate((f.x % 2 ? 1 : -1) * kk * .25); ctx.globalAlpha = Math.max(0, 1 - kk * 1.1); towerArt(ctx, f.ty, f.tl, f.ang, 0); ctx.restore(); return;
    }
    if (f.k === 'dust') {   /* nuage de poussière qui monte et se dissipe */
      const kk = 1 - f.t / f.m; ctx.save(); ctx.fillStyle = f.c;
      for (let i = 0; i < 9; i++) { const a = i * 0.698 + f.sd, d = f.r * (.25 + kk * .75) * (.6 + (i % 3) * .25); ctx.globalAlpha = Math.max(0, .5 * (1 - kk)); ctx.beginPath(); ctx.arc(f.x - cx + Math.cos(a) * d, f.y - cy + Math.sin(a) * d * .7 - kk * 34, 12 + kk * 20 + (i % 4) * 3, 0, 7); ctx.fill(); }
      ctx.restore(); return;
    }
    if (f.k === 'flash') { const kk = 1 - f.t / f.m, gr = ctx.createRadialGradient(f.x - cx, f.y - cy, 0, f.x - cx, f.y - cy, f.r * (.4 + kk)); gr.addColorStop(0, f.c); gr.addColorStop(1, 'rgba(255,200,100,0)'); ctx.save(); ctx.globalAlpha = Math.max(0, 1 - kk); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x - cx, f.y - cy, f.r * (.4 + kk), 0, 7); ctx.fill(); ctx.restore(); return; }
    const k = 1 - f.t / f.m; ctx.globalAlpha = Math.max(0, 1 - k); ctx.strokeStyle = f.c; ctx.lineWidth = 6 * (1 - k) + 2; ctx.beginPath(); ctx.arc(f.x - cx, f.y - cy, f.r * k, 0, 7); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}
function drawDeath(cx, cy) {
  const g = G, p = g.p; if (!p.dead) return;
  const T = g.dieT, tot = RESPAWN, left = Math.max(0, g.resp), f = clamp(1 - left / tot, 0, 1), a = Math.min(1, T * 2.5);
  ctx.save();
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .15, W / 2, H / 2, Math.max(W, H) * .75);
  vg.addColorStop(0, 'rgba(60,0,10,' + (.25 * a).toFixed(3) + ')'); vg.addColorStop(1, 'rgba(90,0,14,' + (.8 * a).toFixed(3) + ')'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (T < .25) { ctx.fillStyle = 'rgba(255,255,255,' + (.7 * (1 - T / .25)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
  const x = p.x - cx, y = p.y - cy;
  ctx.globalAlpha = a; ctx.fillStyle = '#8a94a8'; ctx.strokeStyle = '#4a5468'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(x - 14, y - 30, 28, 38, [14, 14, 2, 2]); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#4a5468'; ctx.fillRect(x - 2, y - 24, 4, 18); ctx.fillRect(x - 7, y - 19, 14, 4);
  ctx.globalAlpha = Math.min(1, T * 4); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const fs = Math.round(Math.min(76, W / 9)), ty = H * .3;
  ctx.font = fs + 'px Impact, sans-serif'; ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.shadowColor = '#ff4d5e'; ctx.shadowBlur = 24; ctx.strokeText('VOUS ÊTES MORT', W / 2, ty); ctx.fillStyle = '#ff4d5e'; ctx.fillText('VOUS ÊTES MORT', W / 2, ty); ctx.shadowBlur = 0;
  ctx.font = '28px Impact, sans-serif'; ctx.lineWidth = 5; const msg = 'Réapparition dans ' + Math.ceil(left) + ' s'; ctx.strokeText(msg, W / 2, ty + 56); ctx.fillStyle = '#fff'; ctx.fillText(msg, W / 2, ty + 56);
  const bw = Math.min(300, W - 60), by = ty + 88; ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(W / 2 - bw / 2 - 2, by - 2, bw + 4, 14); ctx.fillStyle = '#5fd6a0'; ctx.fillRect(W / 2 - bw / 2, by, bw * f, 10);
  ctx.restore();
}
function minimap() {
  const el = $('mm'); if (!el) return;
  const MW = WW - XL, S = Math.round(clamp(180 + (MW - 1500) / 1700 * 70, 180, 400)), Hh = Math.round(S * WH / MW), x0 = 0, y0 = 0, k = S / MW;
  if (el._w !== S || el._h !== Hh || el._d !== DPR) { el._w = S; el._h = Hh; el._d = DPR; el.width = S * DPR; el.height = Hh * DPR; el.style.width = S + 'px'; el.style.height = Hh + 'px'; }
  const c = el.getContext('2d'); c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, S, Hh);   /* en bas à droite, par-dessus la vignette */
  c.fillStyle = 'rgba(8,13,25,.85)'; c.fillRect(x0, y0, S, Hh); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.strokeRect(x0, y0, S, Hh);
  c.strokeStyle = 'rgba(160,120,70,.8)'; c.lineWidth = 4; c.lineJoin = 'round'; c.beginPath(); PATH.forEach((q, i) => i ? c.lineTo(x0 + (q[0] - XL) * k, y0 + q[1] * k) : c.moveTo(x0 + (q[0] - XL) * k, y0 + q[1] * k)); c.stroke();
  for (const pad of PADS) { if (pad.x < XL) continue; const t = G.tw[pad.id]; c.fillStyle = t ? TOW[t.t].col : 'rgba(255,210,74,.35)'; c.fillRect(x0 + (pad.x - XL) * k - 2, y0 + pad.y * k - 2, 4, 4); }
  c.fillStyle = '#ff9a3c'; c.fillRect(x0 + (BASEP.x - XL) * k - 3, y0 + BASEP.y * k - 3, 6, 6);
  c.fillStyle = '#ffd24a'; c.fillRect(x0 + (SHOP.x - XL) * k - 2, y0 + SHOP.y * k - 2, 4, 4);
  G.z.forEach(z => { c.fillStyle = z.big ? '#ff5a5a' : z.c; c.fillRect(x0 + (z.x - XL) * k - 1, y0 + z.y * k - 1, 3, 3); });
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x0 + (G.p.x - XL) * k, y0 + G.p.y * k, 3, 0, 7); c.fill();
}
function drawFog(cx) {   /* zone pas encore achetée (mode infini) : noir total + message */
  const fx = XL - cx; if (XL <= 0 || fx <= 0) return;
  ctx.fillStyle = '#000'; ctx.fillRect(-60, -60, fx + 60, H + 120);
  const gr = ctx.createLinearGradient(fx, 0, fx + 110, 0); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = gr; ctx.fillRect(fx, 0, 110, H);
  ctx.strokeStyle = 'rgba(255,77,94,.85)'; ctx.lineWidth = 3; ctx.setLineDash([14, 10]); ctx.beginPath(); ctx.moveTo(fx, 0); ctx.lineTo(fx, H); ctx.stroke(); ctx.setLineDash([]);
  if (fx > 120 && UNL < INF_N - 1) {
    const big = fx > 330, tx = big ? fx / 2 : fx - 16, y = H / 2; ctx.textAlign = big ? 'center' : 'right'; ctx.textBaseline = 'alphabetic';
    ctx.font = (big ? 28 : 18) + 'px Impact, sans-serif'; ctx.fillStyle = '#ff8a96'; ctx.fillText('ZONE VERROUILLÉE', tx, y);
    ctx.font = (big ? 16 : 12) + 'px "Segoe UI", sans-serif'; ctx.fillStyle = '#8fa0bd';
    ctx.fillText('Achetez cette extension pour voir la zone', tx, y + (big ? 28 : 20));
    ctx.fillText('Boutique › onglet Carte · ' + fmt(EXP_COST[UNL]) + ' $', tx, y + (big ? 50 : 38));
  }
}
function render() {
  const g = G, T = performance.now() / 1000; let cx, cy;
  if (g.playing) [cx, cy] = cam(); else { const t = performance.now() / 6000; cx = camAx(WW / 2 + Math.cos(t) * 400, W, WW); cy = camAx(WH / 2 + Math.sin(t * .8) * 250, H, WH); }
  ctx.fillStyle = TH.void; ctx.fillRect(0, 0, W, H);
  if (!BG) buildBG();
  ctx.save(); if (shake > .5) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  { const sx = Math.max(0, cx), sy = Math.max(0, cy), sw = Math.min(WW, cx + W) - sx, sh = Math.min(WH, cy + H) - sy; if (sw > 0 && sh > 0) ctx.drawImage(BG, sx, sy, sw, sh, sx - cx, sy - cy, sw, sh); }
  drawSpawn(cx, cy, T); drawBase(cx, cy, T); drawShop(cx, cy, T);
  if (!g.playing) { ctx.restore(); drawPads(cx, cy, T); return; }
  g.sp.forEach(s => { const sx = s.x - cx, sy = s.y - cy; if (sx < -40 || sy < -40 || sx > W + 40 || sy > H + 40) return; ctx.globalAlpha = Math.min(.6, s.l / s.m * .9); ctx.fillStyle = s.c; ctx.beginPath(); ctx.ellipse(sx, sy, s.r, s.r * .75, s.x, 0, 7); ctx.fill(); }); ctx.globalAlpha = 1;
  drawPads(cx, cy, T);
  g.dr.forEach(d => {
    if (d.l < 4 && Math.floor(g.t * 8) % 2) return;
    const x = d.x - cx, y = d.y - cy + Math.sin(g.t * 4 + d.x) * 3, col = d.k === 'w' ? WP[d.id].col : d.k === 'p' ? PW[d.id].col : BONUS[d.id].c;
    ctx.save(); ctx.translate(x, y); ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.fillStyle = 'rgba(13,21,36,.9)'; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath();
    if (d.k === 'w') ctx.roundRect(-30, -20, 60, 40, 10); else if (d.k === 'p') { for (let i = 0; i < 6; i++) { const q = i * 1.0472 + .5236; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(q) * 25, Math.sin(q) * 25); } ctx.closePath(); } else ctx.arc(0, 0, 21, 0, 7);
    ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
    if (d.k === 'w') { ctx.scale(.75, .75); wArt(ctx, d.id, col); }
    else if (d.k === 'p') { ctx.fillStyle = col; ctx.font = '17px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(PW[d.id].ab, 0, 1); }
    else bArt(ctx, d.id, col);
    ctx.restore();
  });
  ctx.textBaseline = 'alphabetic';
  g.pt.forEach(q => { const px = q.x - cx, py = q.y - cy; if (px < -10 || py < -10 || px > W + 10 || py > H + 10) return; ctx.globalAlpha = Math.max(0, q.l / q.m); ctx.fillStyle = q.c; ctx.fillRect(px, py, q.s, q.s); }); ctx.globalAlpha = 1;
  g.z.forEach(z => drawZ(z, cx, cy));
  drawUnits(cx, cy);
  if (!g.p.dead) drawPlayer(cx, cy);
  if (g.tmr.shield > 0 && !g.p.dead) { ctx.strokeStyle = '#7fb8ff'; ctx.lineWidth = 3; ctx.globalAlpha = .5 + Math.sin(g.t * 10) * .2; ctx.beginPath(); ctx.arc(g.p.x - cx, g.p.y - cy, 26, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
  ctx.lineWidth = 3; ctx.lineCap = 'round';
  g.b.forEach(b => { const bx = b.x - cx, by = b.y - cy; if (bx < -40 || by < -40 || bx > W + 40 || by > H + 40) return; ctx.strokeStyle = b.c; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - b.vx * .018, by - b.vy * .018); ctx.stroke(); });
  drawAir(cx, cy);
  drawFx(cx, cy);
  ctx.font = '20px Impact, sans-serif'; ctx.textAlign = 'center';
  g.ft.forEach(f => { ctx.globalAlpha = Math.min(1, f.t * 2); ctx.fillStyle = f.c; if (f.coin) { const tw = ctx.measureText(f.s).width, tx = f.x - cx - 9; ctx.fillText(f.s, tx, f.y - cy); drawCoin(tx + tw / 2 + 12, f.y - cy - 7, 8, g.t * 6); } else ctx.fillText(f.s, f.x - cx, f.y - cy); }); ctx.globalAlpha = 1;
  drawFog(cx);
  ctx.restore();
  drawDeath(cx, cy); minimap();
  if (!g.p.dead && !g.paused) { ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, 11, 0, 7); ctx.moveTo(mx - 19, my); ctx.lineTo(mx - 6, my); ctx.moveTo(mx + 6, my); ctx.lineTo(mx + 19, my); ctx.moveTo(mx, my - 19); ctx.lineTo(mx, my - 6); ctx.moveTo(mx, my + 6); ctx.lineTo(mx, my + 19); ctx.stroke(); }
}

/* ---------- Entrées ---------- */
const MAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ShiftLeft: 's', ShiftRight: 's', Space: 's' };
addEventListener('keydown', e => {
  if (G.playing && G.shop) { if (e.code === 'Escape' || e.code === 'KeyB' || e.code === 'KeyP') closeShop(); return; }
  if (G.playing && G.help) { if (e.code === 'Escape' || e.code === 'KeyI') closeHelp(); e.preventDefault(); return; }
  if (!G.playing) return;
  if (e.code === 'KeyI') { openHelp(); return; }
  if (e.code === 'KeyB' && !G.paused) { if (!e.repeat) openShop(); return; }
  if (e.code === 'KeyM') { toggleSnd(); return; }
  if (e.code === 'KeyN' && !G.paused && G.brk > 0) { G.brk = .01; return; }
  if (e.code === 'KeyQ' && !G.paused) { cycleWp(1); return; }
  if (/^Digit[1-9]$/.test(e.code) && !G.paused) { const id = ownedList()[+e.code.slice(5) - 1]; if (id) selectWp(id); return; }
  if (e.code === 'KeyE' && !G.paused) { usePower(); return; }
  if (e.code === 'KeyX') { if (!G.paused) K.x = 1; e.preventDefault(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { setPause(!G.paused); return; }
  if (MAP[e.code]) { K[MAP[e.code]] = 1; e.preventDefault(); }
});
addEventListener('keyup', e => { if (MAP[e.code]) K[MAP[e.code]] = 0; if (e.code === 'KeyX') K.x = 0; });
addEventListener('blur', () => { K.x = 0; if (G.playing && !G.paused) setPause(true); });
addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
cv.addEventListener('mousedown', e => { if (!G.playing || G.paused) return; if (e.button === 0) { down = true; edge = .15; } else if (e.button === 2) usePower(); e.preventDefault(); });
addEventListener('mouseup', () => { down = false; });
addEventListener('contextmenu', e => { if (G.playing) e.preventDefault(); });
cv.addEventListener('wheel', e => { if (G.playing && !G.paused) { cycleWp(e.deltaY > 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
$('pw').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); usePower(); });
$('dem').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); K.x = 1; });
addEventListener('pointerup', () => { K.x = 0; });
$('shp').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); openShop(); });
$('btnShopClose').onclick = closeShop;
$('hlp').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); openHelp(); });
$('btnHelpClose').onclick = closeHelp;
document.querySelectorAll('#shTabs button').forEach(b => b.onclick = () => { shTab = b.dataset.t; sfx('pick'); shopRender(); });
document.querySelectorAll('.snd').forEach(b => b.onclick = toggleSnd);
$('btnResume').onclick = () => setPause(false);
$('btnQuit').onclick = () => { if (G.playing) end('quit'); };
/* retour au vrai menu principal du jeu (jouer, classements, boutique…) depuis la pause et l'écran de fin */
if (EMB) {
  const toMain = () => { const b = mk('button', 'btn ghost', '← Menu principal'); b.type = 'button'; return b; };
  const bo = toMain(); bo.onclick = () => post({ type: 'tower-quit' }); $('over').firstElementChild.appendChild(bo);
  const bp = toMain(); bp.onclick = () => { if (G.playing) end('quit'); post({ type: 'tower-quit' }); }; $('pause').firstElementChild.appendChild(bp);
}
$('btnAgain').onclick = () => start(G.lv);
$('btnNext').onclick = () => start(G.lv + 1);
$('btnMenu').onclick = showMenu;

/* ---------- Progression et menu des niveaux ---------- */
const PKEY = 'dn_td_prog';
const PROG = (function () {
  const mk0 = o => ({ tl: Math.max(1, Math.min(NSTORY, Math.floor(num(o.tl)) || 1)), st: Object.assign({}, o.st || {}), bs: Object.assign({}, o.bs || {}) });
  if (HOSTED) return mk0({ tl: CFG.tl, st: CFG.tst, bs: CFG.tbs });   /* profil du joueur, lu dans la base de données par le jeu principal */
  try { return mk0(JSON.parse(localStorage.getItem(PKEY) || '{}')); } catch (e) { return mk0({}); }
})();
function saveProg() { if (HOSTED) return; try { localStorage.setItem(PKEY, JSON.stringify(PROG)); } catch (e) {} }
function buildLevels() {
  let m = $('menu'); if (!m) { m = mk('section', 'screen'); m.id = 'menu'; document.body.appendChild(m); }
  m.className = 'screen'; m.replaceChildren();
  const card = mk('div', 'card lvm'); card.append(mk('h1', '', 'Tower Defense'), mk('p', 'sub', 'Choisissez un niveau : tenez toutes les vagues pour gagner. Plus le niveau est élevé, plus les vagues sont longues et dures, et plus il y a de tourelles différentes à votre disposition. Pour débloquer le suivant, il faut tenir toutes les vagues sans que la base soit détruite (elle peut être abîmée).'));
  const grid = mk('div', 'lvg');
  LEVELS.slice(0, NSTORY).forEach((L, i) => {
    const n = i + 1, open = n <= PROG.tl, st = PROG.st['l' + n] || 0, dif = Math.ceil(n / 2), nw = [L.tn > (i ? LEVELS[i - 1].tn : 0) ? TOW[T_ORDER[L.tn - 1]].n : ''].concat(Object.keys(UNIT_UNLOCK).filter(k => UNIT_UNLOCK[k] === n).map(k => TOW[k].n)).filter(Boolean).join(' + '), nt = L.tn + Object.keys(UNIT_UNLOCK).filter(k => UNIT_UNLOCK[k] <= n).length;
    const b = mk('button', 'lv' + (open ? '' : ' lock')); b.type = 'button'; b.disabled = !open;
    b.append(mk('b', 'ln', String(n)), mk('span', 'lt', L.n), mk('small', 'nw', BIOMES[L.bi].label), mk('small', '', L.waves + ' vagues · ' + nt + ' tourelle' + (nt > 1 ? 's' : '')), mk('small', '', 'Difficulté ' + '■'.repeat(dif) + '□'.repeat(5 - dif)), mk('small', 'nw', nw ? 'Nouveau : ' + nw : ' '), mk('em', 'stars', open ? '★'.repeat(st) + '☆'.repeat(3 - st) : 'Verrouillé'));
    b.onclick = () => launch(n); grid.appendChild(b);
  });
  card.appendChild(grid);
  { const q = mk('button', 'btn ghost', 'Retour'); q.type = 'button'; q.onclick = buildMain; card.appendChild(q); }
  m.appendChild(card);
}
/* menu principal : Infini (lance la partie tout de suite) ou Niveaux (menu de tous les niveaux) */
function buildMain() {
  let m = $('menu'); if (!m) { m = mk('section', 'screen'); m.id = 'menu'; document.body.appendChild(m); }
  m.className = 'screen'; m.replaceChildren();
  const card = mk('div', 'card lvm'); card.append(mk('h1', '', 'Tower Defense'), mk('p', 'sub', 'Choisissez votre mode de jeu.'));
  const grid = mk('div', 'lvg two'), L = LEVELS[NSTORY], stars = Object.keys(PROG.st).reduce((a, k) => a + (PROG.st[k] || 0), 0);
  const bi = mk('button', 'lv big inf'); bi.type = 'button';
  bi.append(mk('b', 'ln', '∞'), mk('span', 'lt', 'Infini'), mk('small', 'nw', BIOMES[L.bi].label), mk('small', '', 'Vagues sans fin · carte extensible'), mk('small', '', 'Base améliorable (10 niveaux)'), mk('small', 'nw', 'Record : ' + fmt(PROG.bs['l' + (NSTORY + 1)] || 0)), mk('em', 'stars', 'Jouer'));
  bi.onclick = () => launch(NSTORY + 1);
  const bl = mk('button', 'lv big'); bl.type = 'button';
  bl.append(mk('b', 'ln', String(NSTORY)), mk('span', 'lt', 'Niveaux'), mk('small', 'nw', 'Une carte différente par niveau'), mk('small', '', 'Tenez toutes les vagues pour débloquer la suite'), mk('small', '', PROG.tl + ' / ' + NSTORY + ' débloqués'), mk('small', 'nw', stars + ' ★ gagnées'), mk('em', 'stars', 'Choisir un niveau'));
  bl.onclick = buildLevels;
  grid.append(bi, bl); card.appendChild(grid);
  if (EMB) { const q = mk('button', 'btn ghost', '← Retour au menu principal'); q.type = 'button'; q.id = 'btnMain'; q.onclick = () => post({ type: 'tower-quit' }); card.appendChild(q); }   /* affiché dès que le mode est ouvert dans le jeu principal */
  m.appendChild(card);
}
function showMenu() { if (G.lv && G.lv <= NSTORY) buildLevels(); else buildMain(); show(null); hud(false); $('menu').classList.remove('hide'); }
function launch(n) { if (!HOSTED) { try { const d = document.documentElement; if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen().catch(() => {}); } catch (e) {} } start(n); }
setInterval(() => {   /* argent gagné : envoyé au jeu principal toutes les 8 s environ */
  if (!HOSTED || !G.playing || G.over) return; const tt = API.cash(G).total; if (tt !== sentCash) { sentCash = tt; post({ type: 'tower-cash', total: tt }); }
}, 8000);

/* ---------- Boucle principale ---------- */
let last = performance.now(), curHide = null;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  try {
    if (G.playing && !G.paused) update(Math.min(.05, dt));
    const h = G.playing && !G.paused; if (h !== curHide) { curHide = h; document.body.classList.toggle('ingame', h); }
    render();
  } catch (e) { console.error(e); }
}
addEventListener('visibilitychange', () => { if (document.hidden && HOSTED && G.playing && !G.over) post({ type: 'tower-cash', total: dolTotal() }); });   /* l'onglet se cache : on enregistre l'argent gagné */
buildMain(); sndLbl(); hud(false); requestAnimationFrame(loop);
window.DN_TOWER = { start, open: API.open, cash: API.cash, apply: API.apply };
})();
