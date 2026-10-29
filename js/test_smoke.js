/* ============================================================
   TEST AUTOMATICO per game.js (nessun browser necessario)
   Uso:   npm i three@0.128.0      (una volta, nella cartella del progetto)
          node test_smoke.js game.js
   Simula DOM, WebGL e audio con finti oggetti, carica il gioco e prova:
   menu, 5 missioni, decollo, ondate, tipi di nemico, volo (G, stallo),
   gamepad, hangar, salvataggi, collisioni. Esce con codice 1 se qualcosa fallisce.
   ============================================================ */
const vm = require('vm'), fs = require('fs');
global.THREE = require('three');

// ---------- finti DOM / WebGL ----------
const mkEl = () => ({
  style: {}, children: [], listeners: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, insertBefore(c) { this.children.push(c); return c; },
  addEventListener(t, f) { this.listeners[t] = f; }, setAttribute() {}, remove() {}, querySelector() { return mkEl(); }, querySelectorAll() { return []; },
  getContext() { return new Proxy({}, { get: (t, p) => p in t ? t[p] : () => ({ addColorStop() {} }), set: (t, p, v) => { t[p] = v; return true; } }); }
});
const winL = {}, _ids = {}, store = {};
global.window = { innerWidth: 1280, innerHeight: 720, addEventListener: (t, f) => { (winL[t] = winL[t] || []).push(f); } };
global.document = { body: mkEl(), head: mkEl(), hidden: false, createElement: () => mkEl(), addEventListener() {},
  getElementById: id => (_ids[id] = _ids[id] || mkEl()), querySelector: () => mkEl() };
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
let padState = null;
Object.defineProperty(global, 'navigator', { value: { getGamepads: () => (padState ? [padState] : []) }, configurable: true, writable: true });
THREE.WebGLRenderer = class { constructor() { this.domElement = mkEl(); this.shadowMap = {}; } setSize() {} render() {} };
THREE.GLTFLoader = class { load(path, ok) { setTimeout(() => { const s = new THREE.Group(); s.add(new THREE.Mesh(new THREE.BoxGeometry(10, 1.5, 3), new THREE.MeshStandardMaterial({ color: 0x888888 }))); ok({ scene: s }); }, 0); } };
let raf = null; global.requestAnimationFrame = f => { raf = f; };
const fire = (t, code) => (winL[t] || []).forEach(f => f({ code, repeat: false, preventDefault() {}, deltaY: 0 }));
const run = s => vm.runInThisContext(s);
let now = 1000; const frames = n => { for (let i = 0; i < n; i++) { now += 16.7; raf(now); } };

// ---------- mini framework ----------
const results = []; let failed = 0;
const check = (name, ok, info) => { results.push((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  [' + info + ']' : '')); if (!ok) failed++; };
const startMission = (id, from) => { run("game.missionId='" + id + "'"); ui.btnBase.listeners.click(); };
const takeoff = () => { fire('keydown', 'KeyS'); fire('keyup', 'KeyS'); fire('keydown', 'Digit5'); run("keys.KeyS=true"); frames(400); run("keys.KeyS=false"); };
const air = (alt, spd) => run("jetState.onGround=false; jetState.position.set(0," + alt + ",1200); jetState.speed=" + spd + "; jetState.throttle=0.7; game.engineStarted=true; jetState.quaternion.identity()");

vm.runInThisContext(fs.readFileSync(process.argv[2] || 'game.js', 'utf8'));

setTimeout(() => {
  try {
    check('carica e mostra il menu', run('game.state') === 'menu');

    // ---- 5 missioni: avvio, obiettivi, nessun errore in 600 frame
    const expect = { assault: t => t > 20, night: t => t > 20, convoy: t => t === 9, defense: t => t === 0, escort: t => t === 0 };
    for (const id of Object.keys(expect)) {
      startMission(id); frames(60);
      const nt = run('world.targets.length'), nd = run('world.defend.length');
      check('missione ' + id + ': mondo costruito', expect[id](nt), 'bersagli=' + nt + ' da difendere=' + nd);
      takeoff(); frames(300);
      check('missione ' + id + ': in volo senza errori', run('game.state') === 'playing' && !run('jetState.onGround'));
      check('missione ' + id + ': obiettivi nell\'HUD', run('MISSIONS[game.missionId].goals().length') >= 1);
      run('endGame(false)'); ui.btnAgain.listeners.click();
    }

    // ---- ondate e tipi di nemico
    startMission('assault'); takeoff();
    run("game.waveBreak=0"); frames(300);
    check('ondata 1 parte', run('game.wave') >= 1 && run('enemies.length') > 0, 'ondata=' + run('game.wave') + ' nemici=' + run('enemies.length'));
    run("enemies.slice().forEach(removeEnemy); game.spawnQueue=['fighter','agile','bomber','drone','fighter','drone']; spawnEnemyFormation()");
    const kinds = run("enemies.map(e=>e.userData.kind).sort().join(',')");
    check('tutti e 4 i tipi di nemico', ['agile', 'bomber', 'drone', 'fighter'].every(k => kinds.includes(k)), kinds);
    air(900, 250); frames(900);
    check('combattimento stabile (900 frame)', run('game.state') === 'playing' || run('game.state') === 'gameover');
    check('particelle attive e coerenti', run('PART.n') >= 0 && run('partMesh.count') === run('PART.n'), 'n=' + run('PART.n'));

    // ---- drone kamikaze
    startMission('assault'); air(900, 250);
    run("game.spawnQueue=['drone']; spawnEnemyFormation(); enemies[0].position.copy(jetState.position).add(new THREE.Vector3(0,0,-40)); enemies[0].userData.target=jetPivot; enemies[0].userData.retarget=99; enemies[0].userData.dir.set(0,0,1)");
    const hp0 = run('jetState.hp'); frames(40);
    check('il drone esplode e danneggia', run('jetState.hp') < hp0 || run('enemies.length') === 0, 'hp ' + hp0 + '->' + run('jetState.hp'));

    // ---- difesa portaerei: il bombardiere colpisce la nave
    startMission('defense'); takeoff();
    run("allies.slice().forEach(a => damageAlly(a, 999)); game.spawnQueue=['bomber']; spawnEnemyFormation(); const b=enemies[0]; b.position.copy(allyCarrierObj.position).add(new THREE.Vector3(0,120,500)); b.userData.target=allyCarrierObj; b.userData.retarget=99; b.userData.dir.copy(allyCarrierObj.position).sub(b.position).normalize()");
    check('difesa: nessun SAM alleato', run('world.allySams.length') === 0);
    frames(400);
    check('bombardiere danneggia la portaerei', run('game.mission.carrierHp') < 100, 'integrità=' + run('game.mission.carrierHp') + '%');
    run("damageDefendable(allyCarrierObj, 9999)"); frames(5);
    check('portaerei affondata = missione persa', run('game.state') === 'gameover' && run('game.deathReason').includes('portaerei'));
    ui.btnAgain.listeners.click();
    startMission('defense'); takeoff(); run("game.wave=5; game.spawnQueue=[]; enemies.slice().forEach(removeEnemy)"); frames(5);
    check('difesa: vittoria dopo 5 ondate', run('game.state') === 'victory');
    ui.btnAgain.listeners.click();

    // ---- scorta
    startMission('escort'); takeoff(); frames(120);
    const z0 = run('world.defend[0].position.z'); frames(120);
    check('trasporti in movimento', run('world.defend[0].position.z') < z0);
    run("world.defend.forEach(d => d.position.z = -4600)"); frames(3);
    check('scorta: vittoria all\'arrivo', run('game.state') === 'victory');
    ui.btnAgain.listeners.click();
    startMission('escort'); takeoff();
    run("damageDefendable(world.defend[0], 999); damageDefendable(world.defend[0], 999)"); frames(5);
    check('scorta: sconfitta se muoiono 2 trasporti', run('game.state') === 'gameover' && run('game.deathReason').includes('trasporti'));
    ui.btnAgain.listeners.click();

    // ---- convoglio
    startMission('convoy'); takeoff();
    const cz = run("world.targets.find(t=>t.userData.type==='cargo').position.z"); frames(120);
    check('convoglio nemico in fuga', run("world.targets.find(t=>t.userData.type==='cargo').position.z") < cz);
    run("world.targets.filter(t=>t.userData.type==='cargo').forEach(t=>damageGround(t,999,true))"); frames(5);
    check('convoglio: vittoria con 6 cargo affondati', run('game.state') === 'victory' && run('game.mission.cargo') === 6);
    ui.btnAgain.listeners.click();

    // ---- modello di volo
    startMission('assault'); takeoff();
    run("settings.flightModel='real'"); air(3000, 300);
    run("keys.KeyS=true"); let maxG = 0, sawGloc = false, bad = false;
    for (let i = 0; i < 700; i++) { frames(1); const g = run('game.gForce'); maxG = Math.max(maxG, g); if (run('game.gloc') > 0) sawGloc = true;
      if (!isFinite(run('jetState.speed')) || !isFinite(run('jetState.position.y')) || !isFinite(g)) bad = true;
      if (run('game.state') !== 'playing') break; }
    run("keys.KeyS=false");
    check('G limitati da maxG (realistico)', maxG > 3 && maxG <= 10.5, 'G max=' + maxG.toFixed(1));
    check('svenimento da G dopo trazione prolungata', sawGloc);
    check('nessun NaN nella fisica', !bad);
    ui.btnAgain.listeners.click(); startMission('assault'); takeoff();
    run("settings.flightModel='real'"); air(3000, 40); run("jetState.throttle=0"); frames(12);
    check('stallo a bassa velocità (realistico)', run('game.stalled') === true, 'AoA=' + run('Math.round(game.aoa)'));
    run("settings.flightModel='arcade'"); air(3000, 40); run("jetState.throttle=0"); frames(12);
    check('arcade: nessuno stallo/G', run('game.stalled') === false && run('game.gForce') < 1.5);
    run("settings.flightModel='real'");

    // ---- terreno
    run("air=0"); air(30, 200); run("jetState.position.set(0, 100, -17500)"); frames(10);
    check('montagna: schianto col terreno', run('jetState.hp') === 0 || run('game.state') === 'gameover', run('game.deathReason'));
    ui.btnAgain.listeners.click();

    // ---- gamepad
    startMission('assault'); takeoff(); air(1500, 250);
    padState = { connected: true, axes: [0.8, -0.9, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    frames(10);
    check('gamepad: stick -> comandi', Math.abs(run('input.roll')) > 0.3 && run('input.pitch') < -0.3, 'roll=' + run('input.roll').toFixed(2) + ' pitch=' + run('input.pitch').toFixed(2));
    const m0 = run('jetState.ammoMissile'); padState.buttons[0] = { pressed: true, value: 1 }; frames(3); padState.buttons[0] = { pressed: false, value: 0 };
    check('gamepad: pulsante A lancia un missile', run('jetState.ammoMissile') < m0);
    padState = null;

    // ---- hangar e salvataggi
    run("save.credits = 20000; save.upgrades.missiles = 0"); run('buyUpgrade("missiles")');
    check('hangar: acquisto potenziamento', run('save.upgrades.missiles') === 1 && run('save.credits') === 18000);
    ui.btnAgain.listeners.click(); startMission('assault');
    check('hangar: +2 missili in missione', run('jetState.ammoMissile') === 10, 'MSL=' + run('jetState.ammoMissile'));
    run("game.score = 5000; endGame(true)");
    const saved = JSON.parse(store['f35_best_score_v2']);
    check('salvataggio crediti e record', saved.save.best >= 5000 && saved.save.credits === 18000 + 1000 + 3000, 'crediti=' + saved.save.credits);
    check('acqua animata', run('waterTex.offset.x') > 0);
    check('mouse rimosso', !/mousemove|rightMouse|requestPointerLock/.test(fs.readFileSync(process.argv[2] || 'game.js', 'utf8')));
  } catch (e) { check('ERRORE A RUNTIME', false, e.stack.split('\n').slice(0, 4).join(' | ')); }
  console.log(results.join('\n'));
  console.log('\n' + (failed ? failed + ' TEST FALLITI' : 'TUTTI I TEST SUPERATI') + ' (' + results.length + ' controlli)');
  process.exit(failed ? 1 : 0);
}, 100);
