/* ============================================================
   F-35 PROJECT — Fase 60: Portaerei GLB corrette (rotazione e colori)
   ============================================================ */
'use strict';

// ============================================================
// 1. CONFIGURAZIONE
// ============================================================
const CONFIG = {
    modelPath: 'models/f-35.glb',
    carrierModelPath: 'models/portaerei_medio_web.glb', // Corretto con la 's'
    modelLength: 15,
    carrierLength: 400,
    allyCount: 4,
    maxEnemies: 16,
    maxEnemyMissiles: 16,
    maxFx: 300,
    particles: 1800,
    shipModels: {            // modelli .glb opzionali per cacciatorpediniere e cargo (prua verso -Z, altrimenti regola yaw)
        enabled: false,      // metti true dopo aver copiato i file in models/
        destroyer: { path: 'models/destroyer.glb', yaw: 0 },
        cargo:     { path: 'models/cargo.glb',     yaw: 0 }
    },
    firstWaveDelay: 20,
    waveBreak: 8,
    dayLengthSec: 480,
    storageKey: 'f35_best_score',
    world: {
        friendlyIsland: { x: 0, z: 800, radius: 1850 },
        allyCarrier: { x: 0, z: 2500, scale: 1.5 },
        enemyBase: { x: 0, z: -12000, radius: 2000 },
        islandHeight: 4,
        seaHeight: 0.5
    },
    jet: {
        thrust: 190,
        drag: 0.0003, gravity: 25,
        stallSpeed: 55,
        controlSpeed: 80,
        pitchRate: 1.5, rollRate: 2.0, yawRate: 0.5,
        fuelBurn: 0.0005, damagedHp: 40,
        maxG: 9.0, gBlackoutThreshold: 7.5,
        aeroG: 1.6,          // carico massimo a velocità di stallo (volo realistico)
        stallAoa: 18,        // angolo d'attacco di stallo (gradi)
        inducedDrag: 12,     // resistenza indotta nelle virate strette
        takeoffSpeed: 55,
        takeoffPitch: 0.05,
        takeoffBoost: 15
    }
};
let DECK_Y = 31 * CONFIG.world.allyCarrier.scale;
const ENEMY_TINT = 0x661111;
const ALLY_TINT = 0x3a5a2a;
const WEATHER = [
    { name: 'SERENO', v: 0 }, { name: 'VARIABILE', v: 0.25 },
    { name: 'NUVOLOSO', v: 0.5 }, { name: 'TEMPESTA', v: 0.8 }
];
const DIFFICULTY = {
    easy:   { name: 'FACILE',    dmg: 0.7, hp: 0.7, missileInterval: 1.5, spread: 0.05,  count: 0.8 },
    normal: { name: 'NORMALE',   dmg: 1.0, hp: 1.0, missileInterval: 1.0, spread: 0.025, count: 1.0 },
    hard:   { name: 'DIFFICILE', dmg: 1.3, hp: 1.4, missileInterval: 0.7, spread: 0.01,  count: 1.3 }
};
const FLIGHT = {
    arcade: { name: 'ARCADE',     limitG: false },
    real:   { name: 'REALISTICO', limitG: true }
};
const ENEMY_TYPES = {
    fighter: { tint: 0x661111, scale: 1.0, hp: 4,  speed: [160, 240], turn: 1.6, radius: 9,  gun: true,  missile: true,  score: 500,  straight: false },
    agile:   { tint: 0x8a4a00, scale: 0.9, hp: 3,  speed: [200, 290], turn: 2.8, radius: 8,  gun: true,  missile: false, score: 700,  straight: false },
    bomber:  { tint: 0x444455, scale: 1.8, hp: 14, speed: [90, 130],  turn: 0.6, radius: 20, gun: false, missile: true,  score: 1500, straight: true },
    drone:   { tint: 0xaaaa22, scale: 0.5, hp: 1,  speed: [220, 290], turn: 2.0, radius: 6,  gun: false, missile: false, score: 200,  straight: true }
};
const UPGRADES = [
    { id: 'missiles', name: 'Missili aggiuntivi', desc: '+2 missili per livello', max: 5 },
    { id: 'flares',   name: 'Dispenser flare',    desc: '+3 flare per livello', max: 5 },
    { id: 'gun',      name: 'Munizioni cannone',  desc: '+250 colpi per livello', max: 5 },
    { id: 'engine',   name: 'Motore potenziato',  desc: '+8% spinta per livello', max: 5 },
    { id: 'armor',    name: 'Corazzatura',        desc: '-10% danni per livello', max: 5 }
];

// ============================================================
// 2. UTILITÀ
// ============================================================
const FWD = new THREE.Vector3(0, 0, -1);
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const smoothstep = t => t * t * (3 - 2 * t);
const lerpNum = (a, b, t) => a + (b - a) * t;

function faceDirection(obj, dir) {
    _s1.copy(dir).normalize();
    obj.quaternion.setFromUnitVectors(FWD, _s1);
}
function segDistSq(a, b, c) {
    _s1.subVectors(b, a);
    const l2 = _s1.lengthSq();
    const t = l2 > 0 ? clamp(_s2.subVectors(c, a).dot(_s1) / l2, 0, 1) : 0;
    _s3.copy(a).addScaledVector(_s1, t);
    return _s3.distanceToSquared(c);
}
function pointInBox(p, t, margin) {
    const b = t.userData.box, tp = t.position;
    return Math.abs(p.x - tp.x) <= b.hx + margin &&
           Math.abs(p.y - (tp.y + b.cy)) <= b.hy + margin &&
           Math.abs(p.z - tp.z) <= b.hz + margin;
}
function aimPoint(obj, out) {
    out.copy(obj.position);
    if (obj.userData.box) out.y += obj.userData.box.cy;
    return out;
}

// ============================================================
// 3. SCENA, CIELO, LUCI
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x9fd4f5, 3000, 20000);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 30000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xbcd8ff, 0.6);
scene.add(ambientLight);
const sun = new THREE.DirectionalLight(0xfff0dd, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -500; sun.shadow.camera.right = 500;
sun.shadow.camera.top = 500; sun.shadow.camera.bottom = -500;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 3000;
sun.shadow.bias = -0.0005;
scene.add(sun); scene.add(sun.target);

const SKY_R = 25000;
const skyGeo = new THREE.SphereGeometry(SKY_R, 24, 32);
skyGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
const skyHeights = new Float32Array(skyGeo.attributes.position.count);
for (let i = 0; i < skyHeights.length; i++) {
    skyHeights[i] = Math.pow(Math.max(skyGeo.attributes.position.getY(i) / SKY_R, 0), 0.55);
}
const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);

const SKY = {
    dayTop: new THREE.Color(0x3a8ee6), dayHor: new THREE.Color(0x9fd4f5),
    duskTop: new THREE.Color(0x2b3a6b), duskHor: new THREE.Color(0xff8a4c),
    nightTop: new THREE.Color(0x03060f), nightHor: new THREE.Color(0x0b1530),
    grayTop: new THREE.Color(0x7d8791), grayHor: new THREE.Color(0x9aa3aa)
};
const AMB_DAY = new THREE.Color(0xbcd8ff), AMB_NIGHT = new THREE.Color(0x6f86c8);
const SUN_DAY = new THREE.Color(0xfff0dd), SUN_DUSK = new THREE.Color(0xff9955);
const WATER_BASE = new THREE.Color(0x1a5a8a);
const _ct = new THREE.Color(), _ch = new THREE.Color(), _cg = new THREE.Color();
const sunDir = new THREE.Vector3();

function paintSky(top, hor) {
    const col = skyGeo.attributes.color;
    for (let i = 0; i < skyHeights.length; i++) {
        const t = skyHeights[i];
        col.setXYZ(i, hor.r + (top.r - hor.r) * t, hor.g + (top.g - hor.g) * t, hor.b + (top.b - hor.b) * t);
    }
    col.needsUpdate = true;
}

// ============================================================
// 4. MONDO STATICO
// ============================================================
// Mare: texture procedurale a onde/schiuma che scorre lentamente (dà il senso della velocità a bassa quota)
function makeWaterTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#c4d6e4'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 320; i++) {
        const px = Math.random() * 256, py = Math.random() * 256, len = 8 + Math.random() * 28, jit = (Math.random() - 0.5) * 6;
        x.strokeStyle = Math.random() < 0.6 ? 'rgba(255,255,255,' + (0.1 + Math.random() * 0.25) + ')' : 'rgba(60,90,120,' + (0.08 + Math.random() * 0.15) + ')';
        x.lineWidth = 1 + Math.random() * 2.2;
        for (let dx = -256; dx <= 256; dx += 256) for (let dy = -256; dy <= 256; dy += 256) {
            x.beginPath(); x.moveTo(px + dx, py + dy); x.lineTo(px + dx + len, py + dy + jit); x.stroke();
        }
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(400, 400);
    if (renderer.capabilities && renderer.capabilities.getMaxAnisotropy) t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return t;
}
const waterTex = makeWaterTexture();
const water = new THREE.Mesh(
    new THREE.PlaneGeometry(60000, 60000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1a5a8a, map: waterTex, roughness: 0.2, metalness: 0.6 })
);
water.receiveShadow = true;
scene.add(water);
let waterTime = 0;

function makeIsland(x, z, rTop, rBottom, color) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, 2, 16), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
    m.position.set(x, 1, z); m.receiveShadow = true; scene.add(m);
    return m;
}
function makeRunway(x, z, w, len, y, color, stripes) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(w, len), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, y, z); r.receiveShadow = true; scene.add(r);
    if (stripes) {
        const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (let i = -550; i < 600; i += 80) {
            const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 40), stripeMat);
            s.rotation.x = -Math.PI / 2; s.position.set(x, y + 0.1, z + i); scene.add(s);
        }
    }
}

const FI = CONFIG.world.friendlyIsland, EB = CONFIG.world.enemyBase, AC = CONFIG.world.allyCarrier;
makeIsland(FI.x, FI.z, FI.radius, 2000, 0x4a6a3a);
makeRunway(FI.x, FI.z, 110, 1800, 4.15, 0x333333, true);
makeIsland(EB.x, EB.z, EB.radius, 2500, 0x3a5a2a);
makeRunway(EB.x, EB.z, 150, 2000, 2.5, 0x2a2a2a, false);

// Base alleata ampliata: struttura procedurale leggera per mobile.
// Le posizioni sono condivise in coordinate mondo, utilizzabili anche per il multiplayer.
const COOP_SPAWNS = [
    [-380, FI.z + 600], [-240, FI.z + 600], [-100, FI.z + 600],
    [100, FI.z + 600], [240, FI.z + 600], [380, FI.z + 600]
];
const baseDeco = new THREE.Group(); scene.add(baseDeco);
function baseBox(x, y, z, w, h, d, color, parent = baseDeco) {
    const ob = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color, roughness:0.88}));
    ob.position.set(x,y,z); parent.add(ob); return ob;
}
function buildAirbase() {
    const z = FI.z;
    // Piazzali per sei piloti, raccordi e hangar con fronte aperto verso la pista.
    for (const side of [-1,1]) {
        baseBox(side*270, 4.08, z+390, 400, 0.25, 610, 0x545c5e);
        baseBox(side*125, 4.1, z+300, 170, 0.24, 85, 0x464b4e);
    }
    COOP_SPAWNS.forEach(([x,sz],i)=>{
        baseBox(x,4.23,sz,95,0.2,86,0x606d6c);
        const line=baseBox(x,4.37,sz,3,0.12,35,0xe1c851);
        baseBox(x,4.48,sz+42,45,0.1,2,0xf5e6a0);
    });
    [-1,1].forEach(side=>{
        for(let i=0;i<3;i++) {
            const x=side*(420+ i*130), zpos=z+175;
            baseBox(x,30,zpos,112,52,155,0x657780);
            baseBox(x,58,zpos,122,8,165,0x394b54);
            // Portone aperto, spazio scuro ben visibile.
            baseBox(x,24,zpos+78,88,39,2,0x15232b);
            baseBox(x-47,25,zpos+79,6,45,3,0xa0abb0);
            baseBox(x+47,25,zpos+79,6,45,3,0xa0abb0);
        }
    });
    // Torre di controllo, magazzini, terminal e fari semplici.
    baseBox(-850,27,z-240,100,50,110,0x71858e);
    baseBox(-850,63,z-240,130,23,130,0x345b70);
    baseBox(-850,76,z-240,145,5,144,0x273f4a);
    for(let i=0;i<5;i++) baseBox(720,14,z-550+i*135,130,25,95,0x66745d);
    const lightGeoB=new THREE.SphereGeometry(3.5,6,5);
    const lightMatB=new THREE.MeshBasicMaterial({color:0xffecc0});
    for(let zi=-850;zi<=850;zi+=130) for(const x of [-68,68]) {
        const l=new THREE.Mesh(lightGeoB,lightMatB);l.position.set(x,5,z+zi);baseDeco.add(l);
    }
    // Base avversaria: infrastrutture visibili, bersagli attivi creati solo nella missione Raid.
    const ez=EB.z;
    for(let i=0;i<4;i++) {
        baseBox(-1350+i*240,28,ez+800,205,48,195,0x746b62);
        baseBox(-950+i*270,55,ez+500,215,6,205,0x494744);
    }
    baseBox(900,50,ez-340,120,95,140,0x6e6761);
    baseBox(900,102,ez-340,165,9,170,0x454443);
    for(let i=0;i<4;i++) baseBox(800+i*120,16,ez+550,75,30,125,0x7b6654);
}
buildAirbase();

// --- Schiuma costiera, montagne e isolette ---
const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
const wakeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });
function addFoamRing(x, z, r) {
    const m = new THREE.Mesh(new THREE.RingGeometry(r - 10, r + 90, 48).rotateX(-Math.PI / 2), foamMat);
    m.position.set(x, 0.3, z); scene.add(m);
}
const mountains = [], smallIslands = [];
function addMountain(x, z, r, h, color) {
    mountains.push({ x, z, r, h });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 24, 1), new THREE.MeshStandardMaterial({ color: color || 0x5a6b4a, roughness: 1, flatShading: true }));
    cone.position.set(x, h / 2, z); cone.castShadow = true; cone.receiveShadow = true; scene.add(cone);
    if (h > 350) {   // cima innevata
        const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 0.29, h * 0.29, 24, 1), new THREE.MeshStandardMaterial({ color: 0xeef2f5, roughness: 0.9, flatShading: true }));
        cap.position.set(x, h - h * 0.145, z); scene.add(cap);
    }
}
function terrainHeight(x, z) {
    let t = 0;
    for (const m of mountains) {
        const d = Math.hypot(x - m.x, z - m.z);
        if (d < m.r) t = Math.max(t, m.h * (1 - d / m.r));
    }
    return t;
}
function addSmallIsland(x, z, r, h) {
    makeIsland(x, z, r, r * 1.15, 0x9a9a6a);
    addFoamRing(x, z, r * 1.15);
    addMountain(x, z, r * 0.7, h, 0x55684a);
    smallIslands.push({ x, z, r });
}
addFoamRing(FI.x, FI.z, 1200); addFoamRing(EB.x, EB.z, 2500);
[[-3500, -2000, 300, 60], [4200, -4500, 500, 120], [-5200, -7000, 400, 90],
 [2500, 5000, 350, 70], [-4800, 3500, 450, 110], [6500, -9000, 600, 160]].forEach(p => addSmallIsland(p[0], p[1], p[2], p[3]));
[[-5500, -15800, 1300, 640], [-2800, -16600, 1500, 780], [0, -17500, 1700, 900], [2900, -16300, 1400, 700],
 [5600, -15600, 1200, 560], [-7500, -13500, 1100, 420], [7600, -13800, 1000, 380],
 [-3600, -11000, 800, 260], [3700, -11200, 900, 300]].forEach(p => addMountain(p[0], p[1], p[2], p[3]));

const CLOUD_RANGE = 10000;
const clouds = [];
const cloudGeo = new THREE.SphereGeometry(1, 8, 8);
const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, flatShading: true });
for (let i = 0; i < 30; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) {
        const m = new THREE.Mesh(cloudGeo, cloudMat);
        m.position.set(rand(-50, 50), rand(-15, 15), rand(-50, 50));
        m.scale.set(rand(30, 60), rand(15, 30), rand(30, 60));
        c.add(m);
    }
    c.position.set(rand(-CLOUD_RANGE, CLOUD_RANGE), rand(1500, 2000), rand(-CLOUD_RANGE, CLOUD_RANGE));
    scene.add(c); clouds.push(c);
}

// ============================================================
// 5. ASSET — F-35 e PORTAEREI (GLB)
// ============================================================
let jetTemplate = null;
let jetTailZ = 7.2;
let jetWingX = 5.5;
let carrierTemplate = null;
let carrierDeckY = 0;
let allyCarrierObj = null;
let ALLY_FOOT = { hx: 97.5, hz: 315 };   // mezza larghezza/lunghezza del ponte della portaerei alleata
const templateCache = {};

function prepareModel(gltfScene) {
    const size = new THREE.Box3().setFromObject(gltfScene).getSize(new THREE.Vector3());
    gltfScene.scale.setScalar(CONFIG.modelLength / Math.max(size.x, size.y, size.z));
    gltfScene.rotation.set(0, Math.PI / 2, 0);
    gltfScene.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(gltfScene).getCenter(new THREE.Vector3());
    gltfScene.position.sub(center);
    const fsz = new THREE.Box3().setFromObject(gltfScene).getSize(new THREE.Vector3());
    jetTailZ = fsz.z / 2; jetWingX = fsz.x / 2;
    const holder = new THREE.Group();
    holder.add(gltfScene);
    return holder;
}

function buildFallbackJet() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.4, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.2, 12, 8), mat); body.rotation.x = -Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.2, 3.5), mat); wing.position.z = 1.5;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.6, 2.5), mat); tail.position.set(0, 1.4, 4.5);
    const tailWing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.2, 1.8), mat); tailWing.position.set(0, 0.3, 5);
    g.add(body, wing, tail, tailWing);
    return g;
}

function getJetTemplate(tint) {
    const key = tint === null ? 'base' : String(tint);
    if (templateCache[key]) return templateCache[key];
    const t = jetTemplate.clone(true);
    t.traverse(n => {
        if (!n.isMesh) return;
        n.castShadow = true; n.receiveShadow = true;
        if (tint === null) return;
        const tintOne = m => { const c = m.clone(); if (c.color) c.color.setHex(tint); return c; };
        n.material = Array.isArray(n.material) ? n.material.map(tintOne) : tintOne(n.material);
    });
    return templateCache[key] = t;
}

// FUNZIONE AGGIORNATA: Raddrizza il modello e lo prepara
function prepareCarrierModel(gltfScene, targetLength) {
    // FIX ROTAZIONE: -90° su X per raddrizzarlo
    gltfScene.rotation.x = -Math.PI / 2; 
    gltfScene.updateMatrixWorld(true);

    const box0 = new THREE.Box3().setFromObject(gltfScene);
    const size0 = box0.getSize(new THREE.Vector3());
    const maxDim = Math.max(size0.x, size0.y, size0.z);
    
    const scale = targetLength / maxDim;
    gltfScene.scale.setScalar(scale);
    gltfScene.updateMatrixWorld(true);

    const box1 = new THREE.Box3().setFromObject(gltfScene);
    const center = box1.getCenter(new THREE.Vector3());
    gltfScene.position.x -= center.x;
    gltfScene.position.z -= center.z;
    gltfScene.position.y -= box1.min.y;

    gltfScene.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(gltfScene);
    const finalSize = finalBox.getSize(new THREE.Vector3());
    const deckY = finalBox.max.y;

    const holder = new THREE.Group();
    holder.add(gltfScene);
    holder.userData.deckY = deckY;
    holder.userData.size = finalSize;
    return holder;
}

// FUNZIONE AGGIORNATA: Forza i materiali a essere opachi e visibili
function spawnCarrier(x, z, scale, enemy) {
    if (!carrierTemplate) return null;

    const g = carrierTemplate.clone(true);
    
    g.traverse(n => {
        if (!n.isMesh) return;
        n.castShadow = true;
        n.receiveShadow = true;
        
        // FIX TRASPARENZA E CULLING: cloniamo il materiale e forziamo i parametri
        const fixMaterial = (mat) => {
            const m = mat.clone();
            m.transparent = false;          // Rimuove la trasparenza
            m.opacity = 1.0;                // Opacità al 100%
            m.depthWrite = true;            // Scrive nel buffer di profondità (evita effetto fantasma)
            m.side = THREE.DoubleSide;      // Mostra entrambi i lati (se il modello è invertito)
            
            // Se il materiale è scuro o nero, forziamo un colore base visibile (opzionale)
            // if (m.color && m.color.getHex() === 0x000000) m.color.setHex(0x888888);
            
            return m;
        };

        n.material = Array.isArray(n.material) 
            ? n.material.map(fixMaterial) 
            : fixMaterial(n.material);
    });

    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    const sz = carrierTemplate.userData.size;
    addFoam(g, sz.x, sz.z, 0);
    scene.add(g);
    return g;
}

function makeCarrierSimple(x, z, scale, enemy) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(120, 30, 400), new THREE.MeshStandardMaterial({ color: enemy ? 0x5a3a3a : 0x555555 }));
    hull.position.y = 15; hull.castShadow = true; g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(130, 2, 420), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    deck.position.y = 30; deck.receiveShadow = true; g.add(deck);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (let i = -150; i < 150; i += 30) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 20), stripeMat);
        s.rotation.x = -Math.PI / 2; s.position.set(0, 31, i); g.add(s);
    }
    g.scale.setScalar(scale); g.position.set(x, 0, z);
    scene.add(g);
    g.userData.deckY = 31;
    return g;
}

// --- Navi: modelli procedurali (oppure .glb opzionali, vedi CONFIG.shipModels) ---
const shipTemplates = {};
const matCache = {};
const getMat = c => matCache[c] || (matCache[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
const lightGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
const lightMat = new THREE.MeshBasicMaterial({ color: 0xffcc66 });
const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });

// Scafo con prua a punta (verso -Z), estruso in altezza
function hullGeometry(w, len, h, bow) {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, -len / 2); sh.lineTo(w / 2, -len / 2); sh.lineTo(w / 2, len / 2 - bow); sh.lineTo(0, len / 2); sh.lineTo(-w / 2, len / 2 - bow); sh.closePath();
    return new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2);
}
function addBox(parent, w, h, d, x, y, z, color, shadow) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), getMat(color));
    m.position.set(x, y, z); m.castShadow = !!shadow; parent.add(m);
    return m;
}
function addLights(parent, pts, mat) {
    pts.forEach(p => { const m = new THREE.Mesh(lightGeo, mat || lightMat); m.position.set(p[0], p[1], p[2]); parent.add(m); });
}
// Schiuma attorno allo scafo e (se la nave si muove) scia
function addFoam(group, w, len, wake) {
    const hw = w / 2 + 6, hl = len / 2 + 8, sh = new THREE.Shape();
    sh.moveTo(-hw, -hl); sh.lineTo(hw, -hl); sh.lineTo(hw, hl - 30); sh.lineTo(0, hl + 10); sh.lineTo(-hw, hl - 30); sh.closePath();
    const f = new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2), foamMat);
    f.position.y = 0.4; group.add(f);
    if (wake > 0) {
        const ws = new THREE.Shape();
        ws.moveTo(-hw * 0.6, -hl + 10); ws.lineTo(hw * 0.6, -hl + 10); ws.lineTo(0, -hl - wake); ws.closePath();
        const wk = new THREE.Mesh(new THREE.ShapeGeometry(ws).rotateX(-Math.PI / 2), wakeMat);
        wk.position.y = 0.35; group.add(wk);
    }
}
// Modello .glb normalizzato a lunghezza 1 lungo Z, appoggiato sull'acqua e centrato
function normalizeShipModel(root, yaw) {
    root.rotation.y = yaw; root.updateMatrixWorld(true);
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    root.scale.setScalar(1 / Math.max(size.z, 0.001)); root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3());
    root.position.set(-c.x, -box.min.y, -c.z);
    const holder = new THREE.Group(); holder.add(root);
    return holder;
}
function placeModel(kind, x, z, length, width, wake) {
    const g = new THREE.Group(), m = shipTemplates[kind].clone(true);
    m.scale.setScalar(length);
    m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    g.add(m); g.position.set(x, 0, z);
    addFoam(g, width, length, wake);
    scene.add(g);
    return g;
}

function makeDestroyer(x, z, moving) {
    if (shipTemplates.destroyer) return placeModel('destroyer', x, z, 150, 30, moving ? 110 : 0);
    const g = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry(30, 150, 14, 50), getMat(0x586878)); hull.position.y = 3; hull.castShadow = true; g.add(hull);
    addBox(g, 16, 10, 56, 0, 22, 6, 0x3d4a58, true);
    addBox(g, 11, 9, 16, 0, 31.5, 2, 0x34404c, true);
    addBox(g, 8, 4, 10, 0, 19, -42, 0x2e3844, true);
    addBox(g, 8, 4, 10, 0, 19, 46, 0x2e3844, true);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 14, 6).rotateX(Math.PI / 2), getMat(0x222222)); gun.position.set(0, 20, -52); g.add(gun);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 18, 6), getMat(0x222222)); mast.position.set(0, 44, 2); g.add(mast);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 8, 8), getMat(0x2b333c)); funnel.position.set(0, 31, 20); g.add(funnel);
    addLights(g, [[0, 54, 2]], redLightMat); addLights(g, [[-15.5, 12, 0], [15.5, 12, 0]]);   // luci visibili di notte
    g.position.set(x, 0, z);
    addFoam(g, 30, 150, moving ? 110 : 0);
    scene.add(g);
    return g;
}
function makeCargo(x, z, ally) {
    if (shipTemplates.cargo) return placeModel('cargo', x, z, 170, 34, 130);
    const g = new THREE.Group();
    const hull = new THREE.Mesh(hullGeometry(34, 170, 18, 40), getMat(ally ? 0x3a5a6a : 0x6a4a3a)); hull.castShadow = true; g.add(hull);
    addBox(g, 26, 22, 24, 0, 29, 62, 0xdddddd, true);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 10, 8), getMat(ally ? 0x2a7a4a : 0x993322)); funnel.position.set(0, 45, 66); g.add(funnel);
    const cols = [0xb03a2e, 0x2e6db0, 0xd68a1e, 0x3a8a4a, 0x888888];
    for (let r = -1; r <= 1; r++) for (let c = 0; c < 5; c++) for (let lvl = 0; lvl < 2; lvl++) {
        if (lvl === 1 && Math.random() < 0.25) continue;
        addBox(g, 8, 8, 20, r * 9, 22 + lvl * 8, -55 + c * 22, cols[Math.floor(Math.random() * cols.length)], true);
    }
    addLights(g, [[0, 55, 62]], redLightMat); addLights(g, [[-17.5, 14, 0], [17.5, 14, 0]]);
    g.position.set(x, 0, z);
    addFoam(g, 34, 170, 130);
    scene.add(g);
    return g;
}
function makeSam(x, z, ally) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(30, 10, 30), new THREE.MeshStandardMaterial({ color: ally ? 0x336633 : 0x663333 }));
    base.position.y = 5; g.add(base);
    const launcher = new THREE.Mesh(new THREE.BoxGeometry(10, 20, 20), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    launcher.position.y = 20; launcher.rotation.x = -Math.PI / 4; g.add(launcher);
    g.position.set(x, 0, z); scene.add(g);
    return g;
}
function makeRadar(x, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(80, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xff5555, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.position.set(x, 81, z); scene.add(m);
    return m;
}

// ============================================================
// 6. TARGETS
// ============================================================
const world = { targets: [], allySams: [], defend: [] };
const sinking = [];

// Hitbox ricavata dal modello reale della portaerei (così i colpi corrispondono a ciò che si vede)
function carrierBox(scale) {
    const sz = carrierTemplate && carrierTemplate.userData.size;
    return sz ? { hx: sz.x * scale / 2, hy: sz.y * scale / 2, hz: sz.z * scale / 2, cy: sz.y * scale / 2 }
              : { hx: 130, hy: 32, hz: 420, cy: 32 };
}

function buildTargets(kind) {
    kind = kind || 'fleet';
    world.targets.concat(world.allySams, world.defend.filter(d => d !== allyCarrierObj), sinking.map(s => s.obj)).forEach(o => scene.remove(o));
    world.targets.length = 0; world.allySams.length = 0; world.defend.length = 0; sinking.length = 0;

    const add = (obj, data) => {
        obj.userData = Object.assign({ dead: false, maxHp: data.hp, fireTimer: rand(1, 5) }, data);
        world.targets.push(obj);
    };
    const DEST = { type: 'destroyer', hp: 20, box: { hx: 15, hy: 18, hz: 75, cy: 18 }, range: 3500, reload: 5, missile: 'enemy' };

    if (kind === 'fleet') {
        add(makeRadar(EB.x, EB.z - 800), { type: 'radar', hp: 30, box: { hx: 80, hy: 80, hz: 80, cy: 0 } });

        // Portaerei nemiche, lontane dall'isola
        [[0, EB.z + 6000], [-4500, EB.z + 2000], [4500, EB.z + 2000]].forEach(p => {
            let obj = spawnCarrier(p[0], p[1], 2, true);
            if (!obj) obj = makeCarrierSimple(p[0], p[1], 2, true);
            add(obj, { type: 'carrier', hp: 50, box: carrierBox(2), range: 3500, reload: 7, missile: 'enemy' });
        });

        // Cacciatorpediniere (16) in anello attorno alla base
        const numDestroyers = 16;
        for (let i = 0; i < numDestroyers; i++) {
            const angle = (i / numDestroyers) * Math.PI * 2;
            const radius = 4000 + Math.sin(i * 3) * 1000;
            add(makeDestroyer(EB.x + Math.sin(angle) * radius, EB.z + Math.cos(angle) * radius), Object.assign({}, DEST));
        }

        // SAM nemici sull'isola
        [[-800, EB.z], [800, EB.z], [-800, EB.z - 800], [800, EB.z - 800], [0, EB.z + 800]].forEach(p =>
            add(makeSam(p[0], p[1], false),
                { type: 'sam', hp: 15, box: { hx: 15, hy: 15, hz: 15, cy: 15 }, range: 5000, reload: 4, missile: 'sam' }));
    } else if (kind === 'airbase') {
        // Edifici separati dalla scenografia, così i bersagli diventano realmente distruttibili.
        const facility=(x,z,w,h,d,hp)=>{
            const ob=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:0x8b4e45,roughness:0.8}));
            ob.position.set(x,4+h/2,z);scene.add(ob);
            add(ob,{type:'facility',hp,box:{hx:w/2,hy:h/2,hz:d/2,cy:0}});
        };
        add(makeRadar(EB.x,EB.z-850),{type:'radar',hp:30,box:{hx:80,hy:80,hz:80,cy:0}});
        [[-900,EB.z+350],[-600,EB.z+350],[-300,EB.z+350],[0,EB.z+350]].forEach(([x,z])=>facility(x,z,180,50,150,18));
        [[600,EB.z+700],[820,EB.z+700]].forEach(([x,z])=>facility(x,z,110,34,150,14));
        facility(850,EB.z-450,140,100,140,45);
        [[-650,EB.z-850],[650,EB.z-850]].forEach(([x,z])=>
          add(makeSam(x,z,false),{type:'sam',hp:15,box:{hx:15,hy:15,hz:15,cy:15},range:5000,reload:5,missile:'sam'}));
    } else if (kind === 'convoy') {
        // Convoglio in fuga verso nord: 6 cargo + 3 scorte
        const mv = new THREE.Vector3(0, 0, -14);
        [[-1100, -5200], [-600, -5700], [-100, -5200], [400, -5700], [900, -5200], [1400, -5700]].forEach(p => add(makeCargo(p[0], p[1], false),
            { type: 'cargo', hp: 20, box: { hx: 18, hy: 24, hz: 85, cy: 22 }, move: mv, stopZ: -10500 }));
        [[-350, -4700], [650, -4700], [150, -6200]].forEach(p => add(makeDestroyer(p[0], p[1], true),
            Object.assign({}, DEST, { move: mv, stopZ: -10500 })));
    }

    // SAM alleati sulla nostra isola
    [[-400, 800], [400, 800], [-600, 0], [600, 0]].forEach(p => {
        const sm = makeSam(p[0], p[1], true);
        sm.userData = { type: 'sam', ally: true, fireTimer: rand(0.5, 3) };
        world.allySams.push(sm);
    });
}

// Convoglio alleato da scortare
function buildTransports() {
    const mv = new THREE.Vector3(0, 0, -30);
    [[2100, 3000], [2350, 3250], [2100, 3500]].forEach(p => {
        const t = makeCargo(p[0], p[1], true);
        t.userData = { type: 'transport', dead: false, hp: 30, maxHp: 30, box: { hx: 18, hy: 24, hz: 85, cy: 22 }, move: mv };
        world.defend.push(t);
    });
}

// ============================================================
// MISSIONI
// ============================================================
const ESCORT_DEST_Z = -4500;
const aliveTransports = () => world.defend.filter(d => !d.userData.dead).length;
function convoyCenter() {
    const alive = world.defend.filter(d => !d.userData.dead);
    if (!alive.length) return jetState.position;
    const c = new THREE.Vector3(); alive.forEach(d => c.add(d.position));
    return c.divideScalar(alive.length);
}
const FLEET_MIX = w => w < 2 ? { fighter: 1 } : w < 3 ? { fighter: 0.7, drone: 0.3 }
    : w < 5 ? { fighter: 0.5, agile: 0.3, drone: 0.2 } : { fighter: 0.4, agile: 0.3, drone: 0.2, bomber: 0.1 };
const MISSIONS = {
    baseRaid: {
        title: 'OPERAZIONE: BASE NEMICA', kind:'airbase', time:0.17, start:35,
        desc:'Parti dal nuovo hangar, decolla e distruggi radar, 7 edifici strategici e 2 difese SAM. Missione single player preparatoria al cooperativo.',
        size:w=>3+w*2, mix:FLEET_MIX,
        goals:()=>['Radar: '+(game.mission.radar?'DISTRUTTO':'ATTIVO'), 'Strutture: '+game.mission.facilities+'/7', 'Difese SAM: '+game.mission.sams+'/2'],
        won:()=>game.mission.radar && game.mission.facilities>=7 && game.mission.sams>=2
    },
    assault: {
        title: 'ASSALTO ALLA FLOTTA', kind: 'fleet', time: 0.22, start: 20,
        desc: 'Distruggi il radar, le 3 portaerei e 6 cacciatorpediniere nemiche. Il nemico invierà ondate sempre più dure.',
        size: w => 4 + w * 4, mix: FLEET_MIX,
        goals: () => { const m = game.mission; return ['Radar: ' + (m.radar ? 'DISTRUTTO' : 'ATTIVO'), 'Portaerei: ' + m.carriers + '/3', 'Cacciatorpediniere: ' + m.destroyers + '/6']; },
        won: () => { const m = game.mission; return m.radar && m.carriers >= 3 && m.destroyers >= 6; }
    },
    night: {
        title: 'RAID NOTTURNO', kind: 'fleet', time: 0.6, start: 20, maxWeather: 0.25,
        desc: 'Di notte: colpisci il radar, 2 portaerei e 4 cacciatorpediniere. Poca visibilità: affidati al radar e alle luci delle navi.',
        size: w => 3 + w * 3, mix: FLEET_MIX,
        goals: () => { const m = game.mission; return ['Radar: ' + (m.radar ? 'DISTRUTTO' : 'ATTIVO'), 'Portaerei: ' + m.carriers + '/2', 'Cacciatorpediniere: ' + m.destroyers + '/4']; },
        won: () => { const m = game.mission; return m.radar && m.carriers >= 2 && m.destroyers >= 4; }
    },
    convoy: {
        title: 'CACCIA AL CONVOGLIO', kind: 'convoy', time: 0.1, start: 20,
        desc: 'Un convoglio nemico fugge verso nord con 3 scorte. Affonda tutte e 6 le navi cargo.',
        size: w => 3 + w * 3, mix: () => ({ fighter: 0.5, agile: 0.3, drone: 0.2 }),
        goals: () => ['Navi cargo: ' + game.mission.cargo + '/6'],
        won: () => game.mission.cargo >= 6
    },
    defense: {
        title: 'DIFESA DELLA PORTAEREI', kind: 'none', defend: 'carrier', noAllySams: true, time: 0.45, start: 15, waveGoal: 5,
        desc: 'I bombardieri puntano la portaerei alleata e la copertura SAM dell\'isola non la raggiunge. Resisti a 5 ondate: se la nave affonda, la missione è persa.',
        size: w => 3 + w * 2, mix: w => w < 2 ? { bomber: 0.4, fighter: 0.6 } : { bomber: 0.45, fighter: 0.35, drone: 0.2 },
        spawnCenter: () => allyCarrierObj ? allyCarrierObj.position : jetState.position,
        goals: () => ['Ondata ' + Math.min(game.wave, 5) + '/5', 'Portaerei: ' + game.mission.carrierHp + '%'],
        won: () => game.waveDone,
        lost: () => { if (game.mission.carrierHp <= 0) { game.deathReason = 'La portaerei è stata affondata'; return true; } return false; }
    },
    escort: {
        title: 'SCORTA AL CONVOGLIO', kind: 'none', friendly: 'convoy', time: 0.3, start: 15,
        desc: 'Porta almeno 2 trasporti su 3 al punto di arrivo, a 7,5 km a nord. Bombardieri e droni li attaccheranno.',
        size: w => 3 + w * 2, mix: () => ({ bomber: 0.3, drone: 0.3, fighter: 0.4 }),
        spawnCenter: convoyCenter,
        goals: () => {
            const lead = world.defend.filter(d => !d.userData.dead).reduce((m, d) => Math.min(m, d.position.z), Infinity);
            return ['Trasporti in vita: ' + aliveTransports() + '/3 (minimo 2)', 'Distanza all\'arrivo: ' + (isFinite(lead) ? Math.max(0, Math.round(lead - ESCORT_DEST_Z)) : 0) + ' m'];
        },
        won: () => aliveTransports() >= 2 && world.defend.some(d => !d.userData.dead && d.position.z <= ESCORT_DEST_Z),
        lost: () => { if (aliveTransports() < 2) { game.deathReason = 'Troppi trasporti persi'; return true; } return false; }
    }
};

// ============================================================
// 7. STATO E INPUT
// ============================================================
const bullets = [], enemyBullets = [], missiles = [], enemyMissiles = [];
const bombs = [], flares = [], enemies = [], allies = [], fx = [], timers = [];
const cool = { gun: 0, missile: 0, bomb: 0, cluster: 0, flare: 0 };

const game = {
    state: 'loading',
    score: 0, best: 0, wave: 0, enemiesToSpawn: 0, spawnTimer: 0, waveBreak: 0, waveMsgTimer: 0,
    time: 0.22, weather: 0, weatherName: 'SERENO',
    damageFlash: 0, hitMarker: 0, shake: 0, dangerAlert: false, threat: null,
    rearmTimer: 0, smokeTimer: 0, warnTimer: 0,
    targetAltitude: -1, manualThrottle: false, currentTarget: null, targetDist: 0,
    alliesSpawned: false, deathReason: '',
    mission: { radar: false, carriers: 0, destroyers: 0, cargo: 0, carrierHp: 100, facilities: 0, sams: 0 },
    gForce: 1, gLoad: 0, blackout: 0,
    engineStarted: false, engineSpool: 0, flaps: 0, gear: true,
    showEngineWarning: 0,
    sonarSweep: 0,
    missionId: 'assault', spawnQueue: [], waveDone: false,
    aoa: 0, stalled: false, gStress: 0, redout: 0, gloc: 0
};

// --- Impostazioni e progressione (salvate nel browser) ---
const settings = { flightModel: 'real', difficulty: 'normal', sens: 1, invertY: false, ladder: true };
const save = { credits: 0, best: 0, upgrades: { missiles: 0, flares: 0, gun: 0, engine: 0, armor: 0 } };
function loadSave() {
    try {
        const raw = localStorage.getItem(CONFIG.storageKey + '_v2');
        if (raw) {
            const d = JSON.parse(raw);
            Object.assign(settings, d.settings);
            if (d.save) { save.credits = d.save.credits || 0; save.best = d.save.best || 0; Object.assign(save.upgrades, d.save.upgrades); }
        } else save.best = parseInt(localStorage.getItem(CONFIG.storageKey), 10) || 0;
    } catch (e) { /* storage non disponibile */ }
    game.best = save.best;
}
function writeSave() { try { localStorage.setItem(CONFIG.storageKey + '_v2', JSON.stringify({ settings, save })); } catch (e) { /* ignora */ } }
loadSave();

const jetState = {
    position: new THREE.Vector3(0, 4, 1250), quaternion: new THREE.Quaternion(),
    speed: 0, throttle: 0, onGround: true, aoa: 0,
    fuel: 100, hp: 100, ammoGun: 1000, ammoMissile: 8, ammoBomb: 6, ammoCluster: 4, flares: 10,
    max: { gun: 1000, missile: 8, bomb: 6, cluster: 4, flares: 10 }
};
const jetPivot = new THREE.Group();
scene.add(jetPivot);
const playerFwd = new THREE.Vector3(0, 0, -1);

const flameGeo = new THREE.ConeGeometry(0.6, 3.0, 8).translate(0, 1.5, 0).rotateX(Math.PI / 2);
const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));
flame.position.set(0, 0, 7.2); flame.visible = false;
jetPivot.add(flame);

const keys = {};
const THROTTLE_KEYS = { Digit1: 0.2, Digit2: 0.4, Digit3: 0.6, Digit4: 0.8, Digit5: 1.0 };
const ALTITUDE_KEYS = { Digit6: 2000, Digit7: 5000, Digit8: 10000, Digit9: 20000, Digit0: 30000 };
let cameraDistance = 25;

window.addEventListener('wheel', e => { cameraDistance = clamp(cameraDistance + e.deltaY * 0.02, 18, 60); });
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') togglePause(); });

window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyO') toggleAudio();
    if (e.code === 'KeyH') settings.ladder = !settings.ladder;
    if (game.state !== 'playing') return;

    if (e.code === 'KeyS') startEngine();
    if (e.code === 'KeyL') toggleFlaps();
    if (e.code === 'KeyG') toggleGear();

    switch (e.code) {
        case 'KeyB': dropBomb(false); break;
        case 'KeyN': dropBomb(true); break;
        case 'KeyM': fireMissile(); break;
        case 'KeyF': dropFlare(); break;
    }
    if (THROTTLE_KEYS[e.code] !== undefined) { jetState.throttle = THROTTLE_KEYS[e.code]; game.manualThrottle = true; }
    if (ALTITUDE_KEYS[e.code] !== undefined) game.targetAltitude = ALTITUDE_KEYS[e.code];
});

// ============================================================
// COMANDI: tastiera (con rampa per il controllo fine) e gamepad
// ============================================================
const kb = { pitch: 0, roll: 0, yaw: 0 };
const mobileInput = { pitch:0, roll:0, yaw:0, fire:false, thrUp:false, thrDown:false, brake:false };
const input = { pitch: 0, roll: 0, yaw: 0, fire: false, thrUp: false, thrDown: false, brake: false };
const pad = { prev: [], cur: null };

// Legge il gamepad (se collegato) e gestisce i pulsanti "a scatto"
function pollPad() {
    pad.cur = null;
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const list = navigator.getGamepads();
    let gp = null;
    for (let i = 0; list && i < list.length; i++) if (list[i] && list[i].connected) { gp = list[i]; break; }
    if (!gp) return;
    const dz = v => Math.abs(v) < 0.12 ? 0 : Math.sign(v) * (Math.abs(v) - 0.12) / 0.88;
    const ax = i => { const v = dz(gp.axes[i] || 0); return Math.sign(v) * Math.pow(Math.abs(v), 1.5); };   // curva esponenziale: precisione al centro
    const down = i => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.4));
    const edge = i => { const d = down(i), p = !!pad.prev[i]; pad.prev[i] = d; return d && !p; };
    const inv = settings.invertY ? -1 : 1;
    pad.cur = { roll: ax(0), pitch: ax(1) * inv, yaw: -ax(2), fire: down(7), thrUp: down(5), thrDown: down(4), brake: down(6) };
    const a = edge(0), b = edge(1), x = edge(2), y = edge(3), back = edge(8), start = edge(9), dl = edge(14), dr = edge(15);
    if (start) togglePause();
    if (game.state === 'playing') {
        if (a) fireMissile(); if (b) dropFlare(); if (x) dropBomb(false); if (y) dropBomb(true);
        if (back) startEngine(); if (dl) toggleFlaps(); if (dr) toggleGear();
    }
}
function readInput(dt) {
    const k = keys, g = pad.cur;
    const kp = ((k.KeyS || k.ArrowDown) ? 1 : 0) - ((k.KeyW || k.ArrowUp) ? 1 : 0);
    const kr = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const ky = ((k.ArrowLeft || k.KeyQ) ? 1 : 0) - ((k.ArrowRight || k.KeyE) ? 1 : 0);
    const f = damp(9, dt);
    kb.pitch += (kp - kb.pitch) * f; kb.roll += (kr - kb.roll) * f; kb.yaw += (ky - kb.yaw) * f;
    input.pitch = clamp(kb.pitch + (g ? g.pitch : 0) + mobileInput.pitch, -1, 1) * settings.sens;
    input.roll = clamp(kb.roll + (g ? g.roll : 0) + mobileInput.roll, -1, 1) * settings.sens;
    input.yaw = clamp(kb.yaw + (g ? g.yaw : 0) + mobileInput.yaw, -1, 1) * settings.sens;
    input.fire = !!(k.Space || (g && g.fire) || mobileInput.fire);
    input.thrUp = !!(k.ShiftLeft || k.ShiftRight || (g && g.thrUp) || mobileInput.thrUp);
    input.thrDown = !!(k.ControlLeft || k.ControlRight || (g && g.thrDown) || mobileInput.thrDown);
    input.brake = !!(k.KeyB || (g && g.brake) || mobileInput.brake);
}

// ============================================================
// 8. AUDIO
// ============================================================
const audio = { ctx: null, master: null, noise: null, engineFilter: null, engineGain: null, muted: false };

function initAudio() {
    if (audio.ctx) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    const ctx = audio.ctx = new AudioCtor();
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.muted ? 0 : 0.8;
    audio.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    audio.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = audio.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = audio.noise; src.loop = true;
    audio.engineFilter = ctx.createBiquadFilter(); audio.engineFilter.type = 'lowpass';
    audio.engineFilter.frequency.value = 400; audio.engineFilter.Q.value = 2;
    audio.engineGain = ctx.createGain(); audio.engineGain.gain.value = 0;
    src.connect(audio.engineFilter); audio.engineFilter.connect(audio.engineGain); audio.engineGain.connect(audio.master);
    src.start();
}
function toggleAudio() {
    audio.muted = !audio.muted;
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.8;
}
function noiseBurst(filterType, f0, f1, vol, dur) {
    const ctx = audio.ctx, now = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = audio.noise;
    const f = ctx.createBiquadFilter(); f.type = filterType;
    f.frequency.setValueAtTime(f0, now); f.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(f); f.connect(g); g.connect(audio.master);
    src.start(now, Math.random() * 0.5); src.stop(now + dur);
}
function tone(wave, f0, f1, vol, dur, linear) {
    const ctx = audio.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = wave;
    o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, now + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, now);
    if (linear) g.gain.linearRampToValueAtTime(0, now + dur); else g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(audio.master); o.start(now); o.stop(now + dur);
}
function playSound(type, pos) {
    if (!audio.ctx || audio.muted) return;
    const v = pos ? clamp(1 - pos.distanceTo(jetState.position) / 7000, 0.06, 1) : 1;
    switch (type) {
        case 'gun': noiseBurst('highpass', 1000, 1000, 0.15 * v, 0.1); break;
        case 'hit': tone('square', 100, 20, 0.3 * v, 0.2); break;
        case 'missile': tone('sawtooth', 200, 400, 0.1 * v, 0.5, true); break;
        case 'explosion': noiseBurst('lowpass', 500, 50, 0.5 * v, 1.5); break;
        case 'flare': noiseBurst('highpass', 3000, 1500, 0.12, 0.6); break;
        case 'warning': tone('square', 800, 800, 0.05, 0.1); break;
        case 'stall': tone('square', 400, 300, 0.1, 0.2); break;
        case 'startup': tone('sawtooth', 50, 200, 0.2, 3, true); break;
        case 'sonar': tone('sine', 1200, 600, 0.05, 0.4); break;
    }
}
function updateAudio() {
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime, j = jetState;
    const engineLoad = game.engineStarted ? (0.5 + j.throttle * 0.5) : 0;
    audio.engineFilter.frequency.setTargetAtTime(300 + engineLoad * 900 * (j.hp / 100), t, 0.1);
    audio.engineGain.gain.setTargetAtTime(game.state === 'playing' ? engineLoad * 0.15 : 0, t, 0.1);
}

// ============================================================
// 9. GEOMETRIE CONDIVISE
// ============================================================
const GEO = {
    tracer: new THREE.BoxGeometry(0.2, 0.2, 5),
    missile: new THREE.CylinderGeometry(0.12, 0.12, 2, 8).rotateX(Math.PI / 2),
    bomb: new THREE.SphereGeometry(0.4, 6, 6),
    unit: new THREE.SphereGeometry(1, 8, 8)
};
const MAT = {
    tracerPlayer: new THREE.MeshBasicMaterial({ color: 0xffff00 }),
    tracerAlly: new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
    tracerEnemy: new THREE.MeshBasicMaterial({ color: 0xff2200 }),
    mslPlayer: new THREE.MeshStandardMaterial({ color: 0xeeeeee }),
    mslAlly: new THREE.MeshStandardMaterial({ color: 0x44ff44 }),
    mslSam: new THREE.MeshStandardMaterial({ color: 0x66ccff }),
    mslEnemy: new THREE.MeshStandardMaterial({ color: 0xcc3333 }),
    bomb: new THREE.MeshStandardMaterial({ color: 0x444444 }),
    trail: new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, depthWrite: false }),
    spark: new THREE.MeshBasicMaterial({ color: 0xffdd66 })
};
const SHARED_FX = { trail: MAT.trail, spark: MAT.spark };

// ============================================================
// PARTICELLE (InstancedMesh): fumo, scie di condensa, tracce dei missili
// ============================================================
const PART = {
    max: CONFIG.particles, n: 0,
    pos: new Float32Array(CONFIG.particles * 3), vel: new Float32Array(CONFIG.particles * 3),
    age: new Float32Array(CONFIG.particles), life: new Float32Array(CONFIG.particles),
    s0: new Float32Array(CONFIG.particles), s1: new Float32Array(CONFIG.particles), shade: new Float32Array(CONFIG.particles)
};
const partMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 5, 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }), CONFIG.particles);
partMesh.frustumCulled = false; partMesh.count = 0;
scene.add(partMesh);
const _dummy = new THREE.Object3D(), _pc = new THREE.Color();

function emitParticle(pos, vel, life, s0, s1, shade) {
    if (PART.n >= PART.max) return;
    const i = PART.n++, k = i * 3;
    PART.pos[k] = pos.x; PART.pos[k + 1] = pos.y; PART.pos[k + 2] = pos.z;
    PART.vel[k] = vel ? vel.x : 0; PART.vel[k + 1] = vel ? vel.y : 0; PART.vel[k + 2] = vel ? vel.z : 0;
    PART.age[i] = 0; PART.life[i] = life; PART.s0[i] = s0; PART.s1[i] = s1; PART.shade[i] = shade;
}
function updateParticles(dt) {
    let i = 0;
    while (i < PART.n) {
        PART.age[i] += dt;
        if (PART.age[i] >= PART.life[i]) {            // rimozione "swap with last"
            const last = --PART.n;
            if (i !== last) {
                for (let c = 0; c < 3; c++) { PART.pos[i * 3 + c] = PART.pos[last * 3 + c]; PART.vel[i * 3 + c] = PART.vel[last * 3 + c]; }
                PART.age[i] = PART.age[last]; PART.life[i] = PART.life[last]; PART.s0[i] = PART.s0[last]; PART.s1[i] = PART.s1[last]; PART.shade[i] = PART.shade[last];
            }
            continue;
        }
        const k = i * 3;
        PART.pos[k] += PART.vel[k] * dt; PART.pos[k + 1] += PART.vel[k + 1] * dt; PART.pos[k + 2] += PART.vel[k + 2] * dt;
        i++;
    }
    for (let p = 0; p < PART.n; p++) {
        const t = PART.age[p] / PART.life[p], k = p * 3;
        const sc = (PART.s0[p] + (PART.s1[p] - PART.s0[p]) * t) * (t > 0.7 ? (1 - t) / 0.3 : 1);
        _dummy.position.set(PART.pos[k], PART.pos[k + 1], PART.pos[k + 2]);
        _dummy.scale.setScalar(Math.max(sc, 0.001));
        _dummy.updateMatrix();
        partMesh.setMatrixAt(p, _dummy.matrix);
        _pc.setRGB(PART.shade[p], PART.shade[p], PART.shade[p]);
        partMesh.setColorAt(p, _pc);
    }
    partMesh.count = PART.n;
    partMesh.instanceMatrix.needsUpdate = true;
    if (partMesh.instanceColor) partMesh.instanceColor.needsUpdate = true;
}

// ============================================================
// 10. UI / HUD
// ============================================================
const CSS = `
.hud{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:monospace;color:#7dffb0;text-shadow:0 0 4px #000}
.hud *{box-sizing:border-box}
.panel{position:absolute;font-size:12px;line-height:1.5;background:rgba(0,0,0,.5);padding:8px 10px;border-radius:5px;backdrop-filter:blur(4px)}
.bar{position:absolute;left:0;right:0;height:40px;background:rgba(0,0,0,.4);display:flex;align-items:center;padding:0 20px;font-size:12px;backdrop-filter:blur(4px)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);display:none;flex-direction:column;justify-content:center;align-items:center;color:#fff;pointer-events:auto;font-family:monospace;text-align:center}
.btn{padding:15px 30px;font-size:18px;font-weight:bold;background:#0a2440;color:#fff;border:2px solid #4a9eff;border-radius:8px;cursor:pointer;margin-bottom:15px;width:320px;font-family:monospace}
.btn:disabled{opacity:.4;cursor:wait}
.btn:hover:not(:disabled){background:#12407a}
.ctrl-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;position:absolute;right:20px;width:80px;height:80px;background:rgba(10,30,50,0.6);border:2px solid rgba(125,255,176,0.4);border-radius:12px;cursor:pointer;pointer-events:auto;backdrop-filter:blur(8px);transition:all 0.2s ease;color:#7dffb0;font:bold 11px monospace;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.3);}
.ctrl-btn:hover{background:rgba(20,60,100,0.8);border-color:#7dffb0;transform:scale(1.05);}
.ctrl-btn:active{transform:scale(0.95);}
.ctrl-btn .icon{font-size:24px;margin-bottom:4px;}
.ctrl-btn.active{border-color:#ffaa00;color:#ffaa00;box-shadow:0 0 15px rgba(255,170,0,0.3);}

.aircraft-panel{position:absolute;top:60px;right:220px;width:160px;display:flex;flex-direction:column;align-items:center;background:rgba(0,20,10,0.55);border:2px solid rgba(125,255,176,0.4);border-radius:10px;padding:8px;backdrop-filter:blur(6px);box-shadow:0 4px 16px rgba(0,0,0,0.4);transition:border-color 0.15s ease;}
.aircraft-panel svg{width:120px;height:120px;filter:drop-shadow(0 0 6px rgba(125,255,176,0.4));}
.aircraft-panel .health-row{width:100%;margin-top:6px;}
.aircraft-panel .bar-label{font-size:10px;display:flex;justify-content:space-between;margin-bottom:2px;color:#7dffb0;}
.aircraft-panel .bar-track{width:100%;height:8px;background:rgba(0,0,0,0.6);border-radius:4px;overflow:hidden;border:1px solid rgba(125,255,176,0.3);}
.aircraft-panel .bar-fill{height:100%;width:100%;background:#7dffb0;transition:width 0.2s ease,background 0.2s ease;}
.aircraft-panel .weapons-row{display:flex;justify-content:space-around;width:100%;margin-top:6px;font-size:11px;}
.aircraft-panel .weapon{display:flex;flex-direction:column;align-items:center;gap:2px;color:#7dffb0;}
.aircraft-panel .weapon .icon{font-size:16px;}
.aircraft-panel .weapon .count{font-weight:bold;color:#ffaa00;}
.aircraft-panel .weapon .count.empty{color:#ff4444;}

.sonar-panel{position:absolute;bottom:60px;left:20px;width:130px;height:130px;border-radius:50%;border:2px solid #00ffcc;background:rgba(0,20,20,0.7);box-shadow:0 0 15px rgba(0,255,204,0.3);overflow:hidden;z-index:5;}
.sonar-panel canvas{width:100%;height:100%;}

.btn.small{width:auto;padding:5px 10px;font-size:12px;margin:0}
.mbtn{display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:6px;font-size:14px;font-weight:bold;background:#0a2440;color:#fff;border:2px solid #24527f;border-radius:6px;cursor:pointer;font-family:monospace}
.mbtn:hover{background:#12407a}
.mbtn.sel{border-color:#7dffb0;background:#12407a;color:#7dffb0}
.row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:5px 0;font-size:13px}
.overlay select,.overlay input[type=range]{font-family:monospace;background:#0a2440;color:#fff;border:1px solid #4a9eff;border-radius:4px}
@media (max-width: 800px) {
    .aircraft-panel { transform: scale(0.75); transform-origin: top right; top: 40px; right: 180px; }
    #radar { width: 120px !important; height: 120px !important; top: 40px !important; right: 10px !important; }
    .sonar-panel { transform: scale(0.8); transform-origin: bottom left; bottom: 50px; left: 10px; }
}
`;
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: CSS }));

function el(tag, parent, css, html) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html !== undefined) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
}
function setText(node, text) { if (node._t !== text) { node._t = text; node.textContent = text; } }
function setColor(node, c) { if (node._c !== c) { node._c = c; node.style.color = c; } }
function setShow(node, show) { const d = show ? 'block' : 'none'; if (node._d !== d) { node._d = d; node.style.display = d; } }

const ui = {};
(function buildUI() {
    const root = ui.root = el('div', document.body); root.className = 'hud';
    ui.damage = el('div', root, 'position:absolute;inset:0;background:rgba(255,0,0,0)');
    ui.blackout = el('div', root, 'position:absolute;inset:0;background:radial-gradient(circle, transparent 20%, black 100%);opacity:0;transition:opacity .2s; pointer-events:none');

    ui.crosshair = el('div', root, 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:200px;height:200px;border:2px solid rgba(125,255,176,.4);border-radius:50%;display:flex;justify-content:center;align-items:center');
    el('div', ui.crosshair, 'position:absolute;width:20px;height:20px;border:2px solid rgba(125,255,176,.8);border-radius:50%');
    el('div', ui.crosshair, 'position:absolute;width:4px;height:4px;background:#7dffb0;border-radius:50%');
    el('div', ui.crosshair, 'position:absolute;width:2px;height:300px;background:rgba(125,255,176,.2)');
    el('div', ui.crosshair, 'position:absolute;width:300px;height:2px;background:rgba(125,255,176,.2)');
    ui.hitMarker = el('div', root, 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:34px;font-weight:bold;color:#fff;opacity:0', '✕');

    ui.horizon = el('canvas', root, 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none');
    ui.horizon.width = 560; ui.horizon.height = 560;
    ui.hctx = ui.horizon.getContext('2d');

    ui.radar = el('canvas', root, 'position:absolute;top:60px;right:20px;border-radius:50%;border:2px solid #7dffb0;background:rgba(0,20,0,.6)');
    ui.radar.id = 'radar';
    ui.radar.width = 180; ui.radar.height = 180;
    ui.rctx = ui.radar.getContext('2d');

    ui.sonarPanel = el('div', root, ''); ui.sonarPanel.className = 'sonar-panel';
    ui.sonarCanvas = el('canvas', ui.sonarPanel);
    ui.sonarCanvas.width = 130; ui.sonarCanvas.height = 130;
    ui.sctx = ui.sonarCanvas.getContext('2d');

    ui.aircraftPanel = el('div', root, '');
    ui.aircraftPanel.className = 'aircraft-panel';
    ui.aircraftPanel.innerHTML = `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 6 L54 30 L52 60 L56 78 L50 88 L44 78 L48 60 L46 30 Z"
          fill="#5a7a8a" stroke="#7dffb0" stroke-width="1.5"/>
    <path d="M48 38 L10 72 L14 76 L46 56 Z" fill="#4a6a7a" stroke="#7dffb0" stroke-width="1.2"/>
    <path d="M52 38 L90 72 L86 76 L54 56 Z" fill="#4a6a7a" stroke="#7dffb0" stroke-width="1.2"/>
    <path d="M48 76 L30 92 L34 94 L48 82 Z" fill="#3a5a6a" stroke="#7dffb0" stroke-width="1"/>
    <path d="M52 76 L70 92 L66 94 L52 82 Z" fill="#3a5a6a" stroke="#7dffb0" stroke-width="1"/>
    <ellipse cx="50" cy="28" rx="3" ry="6" fill="#88ccff" opacity="0.8"/>
    <rect x="46" y="86" width="8" height="4" fill="#ffaa00" opacity="0.9"/>
</svg>
<div class="health-row">
    <div class="bar-label"><span>HULL</span><span id="apHullVal">100%</span></div>
    <div class="bar-track"><div class="bar-fill" id="apHullBar" style="width:100%"></div></div>
</div>
<div class="health-row">
    <div class="bar-label"><span>FUEL</span><span id="apFuelVal">100%</span></div>
    <div class="bar-track"><div class="bar-fill" id="apFuelBar" style="width:100%"></div></div>
</div>
<div class="weapons-row">
    <div class="weapon"><span class="icon">🚀</span><span class="count" id="apMsl">8</span></div>
    <div class="weapon"><span class="icon">💣</span><span class="count" id="apBmb">6</span></div>
    <div class="weapon"><span class="icon">✳️</span><span class="count" id="apClu">4</span></div>
    <div class="weapon"><span class="icon">🔥</span><span class="count" id="apFlr">10</span></div>
</div>
`;
    ui.apHullBar = document.getElementById('apHullBar');
    ui.apHullVal = document.getElementById('apHullVal');
    ui.apFuelBar = document.getElementById('apFuelBar');
    ui.apFuelVal = document.getElementById('apFuelVal');
    ui.apMsl = document.getElementById('apMsl');
    ui.apBmb = document.getElementById('apBmb');
    ui.apClu = document.getElementById('apClu');
    ui.apFlr = document.getElementById('apFlr');

    ui.topBar = el('div', root, 'top:0;border-bottom:1px solid #7dffb0;justify-content:space-between'); ui.topBar.className = 'bar';
    el('div', ui.topBar, '', 'F-35 CAMPAGNA');
    el('div', ui.topBar, '', 'OPERAZIONE TEMPESTA DI FERRO');
    ui.clock = el('div', ui.topBar);
    ui.score = el('div', root, 'position:absolute;top:50px;left:50%;transform:translateX(-50%);font-size:20px;font-weight:bold;color:#ffaa00');
    ui.compass = el('div', root, 'position:absolute;top:50px;left:20px;width:64px;height:64px;border-radius:50%;border:2px solid #7dffb0;background:rgba(0,0,0,.3);display:flex;flex-direction:column;justify-content:center;align-items:center;font-size:16px;font-weight:bold');
    ui.compassDir = el('div', ui.compass); ui.compassDeg = el('div', ui.compass, 'font-size:10px;font-weight:normal');
    ui.obj = el('div', root, 'top:124px;left:20px;border-left:3px solid #ffaa00'); ui.obj.className = 'panel';
    el('div', ui.obj, 'font-weight:bold;margin-bottom:2px', 'OBIETTIVI:');
    ui.obj0 = el('div', ui.obj); ui.obj1 = el('div', ui.obj); ui.obj2 = el('div', ui.obj); ui.obj3 = el('div', ui.obj);

    ui.waveMsg = el('div', root, 'position:absolute;top:30%;left:50%;transform:translate(-50%,-50%);font-size:36px;font-weight:bold;color:#ffdd44;text-align:center;text-shadow:0 0 10px #000;display:none');
    ui.rearmMsg = el('div', root, 'position:absolute;top:36%;left:50%;transform:translate(-50%,-50%);font-size:22px;font-weight:bold;color:#7dffb0;text-align:center;display:none', 'RIARMAMENTO IN CORSO...');

    ui.engineWarn = el('div', root, 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:30px;font-weight:bold;color:#ffaa00;text-align:center;display:none;text-shadow:0 0 10px #000;background:rgba(0,0,0,0.6);padding:10px 20px;border-radius:8px;border:2px solid #ffaa00');
    ui.engineWarn.innerHTML = '⚠ ACCENDERE MOTORE ⚠<br><span style="font-size:16px">Premi S o clicca il pulsante</span>';

    ui.mslWarn = el('div', root, 'position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);font-size:30px;font-weight:bold;color:#f00;text-align:center;display:none;text-shadow:0 0 10px #f00');
    ui.mslWarnText = el('div', ui.mslWarn);
    el('div', ui.mslWarn, 'font-size:16px', 'PREMI F PER FLARE · MANOVRA PER SCHIVARE');
    ui.warn = el('div', root, 'position:absolute;top:62%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:bold;color:#ffaa00;text-align:center;white-space:pre-line;text-shadow:0 0 6px #000');

    ui.lock = el('div', root, 'position:absolute;width:80px;height:80px;border:2px dashed #f00;display:none;transform:translate(-50%,-50%);border-radius:10px');
    ui.lockBar = el('div', ui.lock, 'position:absolute;top:-10px;left:0;height:4px;width:100%;background:#f00');
    ui.lockText = el('div', ui.lock, 'position:absolute;bottom:-25px;width:100%;text-align:center;font-size:12px;color:#f00;font-weight:bold;white-space:nowrap');

    ui.controls = el('div', root, 'top:260px;left:20px;font-size:11px'); ui.controls.className = 'panel';
    ui.controls.innerHTML = '<b>[COMANDI]</b><br>W/S = Beccheggio | A/D = Rollio<br>← / → o Q/E = Imbardata<br>Shift/Ctrl = Motore | 1-5 = Motore %<br>6-0 = Quota auto (2k-30k ft)<br>S = Avvia motore | L = Flap | G = Carrello<br>Spazio = Cannone | M = Missile | F = Flare<br>B/N = Bombe (B = freno a terra)<br>H = Orizzonte | P = Pausa | O = Audio<br>Gamepad: stick, RT cannone, A/B/X/Y armi';

    ui.weapons = el('div', root, 'bottom:50px;left:170px;text-align:left;color:#ffaa00;font-weight:bold;font-size:14px'); ui.weapons.className = 'panel';
    ui.wGun = el('div', ui.weapons); ui.wMsl = el('div', ui.weapons); ui.wBmb = el('div', ui.weapons); ui.wClu = el('div', ui.weapons);
    ui.wFlr = el('div', ui.weapons, 'color:#ff0');

    ui.statsBar = el('div', root, 'bottom:0;border-top:1px solid #7dffb0;justify-content:space-around;font-size:14px'); ui.statsBar.className = 'bar';
    ['wave', 'speed', 'aoa', 'alt', 'engine', 'fuel', 'hull', 'gforce'].forEach(k => { ui[k] = el('div', ui.statsBar); });

    ui.btnEngine = el('div', root, '', '<div class="icon">🔌</div>AVVIA'); ui.btnEngine.className = 'ctrl-btn'; ui.btnEngine.style.cssText = 'bottom:220px;';
    ui.btnFlaps = el('div', root, '', '<div class="icon">✈️</div>FLAP'); ui.btnFlaps.className = 'ctrl-btn'; ui.btnFlaps.style.cssText = 'bottom:130px;';
    ui.btnGear = el('div', root, '', '<div class="icon">🛞</div>CARRELLO'); ui.btnGear.className = 'ctrl-btn'; ui.btnGear.style.cssText = 'bottom:40px;';

    ui.menu = el('div', document.body, 'z-index:100;overflow-y:auto;justify-content:flex-start;padding:20px 0'); ui.menu.className = 'overlay';
    el('h1', ui.menu, 'color:#7dffb0;font-size:34px;margin:0 0 4px', 'F-35: OPERAZIONE TEMPESTA DI FERRO');
    ui.menuStatus = el('p', ui.menu, 'color:#ffdd44;margin:0 0 10px', 'Caricamento dei modelli...');
    const cols = el('div', ui.menu, 'display:flex;gap:22px;flex-wrap:wrap;justify-content:center;max-width:1150px;width:96%;text-align:left');
    const colM = el('div', cols, 'flex:1;min-width:320px'), colS = el('div', cols, 'flex:1;min-width:300px'), colH = el('div', cols, 'flex:1;min-width:320px');

    // Missioni
    el('h3', colM, 'color:#7dffb0;margin:0 0 8px', 'MISSIONE');
    ui.missionBtns = {};
    Object.keys(MISSIONS).forEach(id => {
        const b = el('button', colM, '', MISSIONS[id].title); b.className = 'mbtn';
        b.addEventListener('click', () => selectMission(id));
        ui.missionBtns[id] = b;
    });
    ui.missionDesc = el('p', colM, 'color:#ccc;font-size:13px;min-height:54px;margin:8px 0 0');

    // Impostazioni
    el('h3', colS, 'color:#7dffb0;margin:0 0 8px', 'IMPOSTAZIONI');
    const addSel = (label, opts, get, set) => {
        const row = el('div', colS); row.className = 'row'; el('span', row, '', label);
        const sel = el('select', row);
        opts.forEach(o => { const op = el('option', sel, '', o[1]); op.value = o[0]; });
        sel.value = get(); sel.addEventListener('change', () => { set(sel.value); writeSave(); });
    };
    const addRange = (label, min, max, step, get, set) => {
        const row = el('div', colS); row.className = 'row'; el('span', row, '', label);
        const r = el('input', row); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = get();
        r.addEventListener('input', () => { set(parseFloat(r.value)); writeSave(); });
    };
    const addCheck = (label, get, set) => {
        const row = el('div', colS); row.className = 'row'; el('span', row, '', label);
        const c = el('input', row); c.type = 'checkbox'; c.checked = get();
        c.addEventListener('change', () => { set(c.checked); writeSave(); });
    };
    addSel('Modello di volo', Object.keys(FLIGHT).map(k => [k, FLIGHT[k].name]), () => settings.flightModel, v => { settings.flightModel = v; });
    addSel('Difficoltà', Object.keys(DIFFICULTY).map(k => [k, DIFFICULTY[k].name]), () => settings.difficulty, v => { settings.difficulty = v; });
    addRange('Sensibilità comandi', 0.5, 2, 0.1, () => settings.sens, v => { settings.sens = v; });
    addCheck('Inverti asse Y (gamepad)', () => settings.invertY, v => { settings.invertY = v; });
    addCheck('Orizzonte artificiale (H)', () => settings.ladder, v => { settings.ladder = v; });
    el('p', colS, 'color:#999;font-size:12px;margin:10px 0 0', 'Realistico: limiti di G, stallo, svenimento da G. Arcade: comandi più permissivi. Gamepad: stick = beccheggio/rollio e imbardata, RT cannone, A missile, B flare, X/Y bombe, RB/LB motore, Back avvia motore, croce = flap/carrello, Start pausa.');

    // Hangar
    el('h3', colH, 'color:#7dffb0;margin:0 0 8px', 'HANGAR');
    ui.credits = el('div', colH, 'color:#ffaa00;font-weight:bold;margin-bottom:6px');
    ui.upRows = {};
    UPGRADES.forEach(u => {
        const row = el('div', colH); row.className = 'row';
        el('span', row, 'flex:1', '<b>' + u.name + '</b><br><span style="color:#999;font-size:11px">' + u.desc + '</span>');
        const lvl = el('span', row, 'width:44px;text-align:center');
        const btn = el('button', row); btn.className = 'btn small';
        btn.addEventListener('click', () => buyUpgrade(u.id));
        ui.upRows[u.id] = { lvl, btn };
    });

    ui.menuBest = el('p', ui.menu, 'color:#ffaa00;margin:14px 0 6px');
    const startRow = el('div', ui.menu, 'display:flex;gap:16px;flex-wrap:wrap;justify-content:center');
    ui.btnBase = el('button', startRow, '', 'DECOLLA DALLA BASE'); ui.btnBase.className = 'btn'; ui.btnBase.disabled = true;
    ui.btnCarrier = el('button', startRow, '', 'DECOLLA DALLA PORTAEREI'); ui.btnCarrier.className = 'btn'; ui.btnCarrier.disabled = true;

    ui.pause = el('div', document.body, 'z-index:90'); ui.pause.className = 'overlay';
    el('h1', ui.pause, 'font-size:50px;margin:0 0 10px;color:#7dffb0', 'PAUSA');
    el('p', ui.pause, 'color:#ccc', 'Premi P per riprendere');

    ui.over = el('div', document.body, 'z-index:95'); ui.over.className = 'overlay';
    ui.overTitle = el('h1', ui.over, 'font-size:50px;margin:0 0 10px');
    ui.overReason = el('p', ui.over, 'color:#ccc;margin:0 0 20px;font-size:18px');
    ui.overScore = el('h2', ui.over, 'font-size:24px;margin:0 0 6px');
    ui.overBest = el('p', ui.over, 'color:#ffaa00;margin:0 0 6px');
    ui.overCredits = el('p', ui.over, 'color:#7dffb0;margin:0 0 30px');
    ui.btnAgain = el('button', ui.over, '', 'RIGIOCA'); ui.btnAgain.className = 'btn';
})();
ui.btnBase.addEventListener('click', () => startMission('base'));
ui.btnCarrier.addEventListener('click', () => startMission('carrier'));
ui.btnAgain.addEventListener('click', showMenu);

ui.btnEngine.addEventListener('click', startEngine);
ui.btnFlaps.addEventListener('click', toggleFlaps);
ui.btnGear.addEventListener('click', toggleGear);

function startEngine() {
    if (game.state !== 'playing' || game.engineStarted) return;
    initAudio();
    game.engineStarted = true;
    game.engineSpool = 0;
    playSound('startup');
    ui.btnEngine.classList.add('active');
    ui.btnEngine.innerHTML = '<div class="icon">✅</div>ACCESO';
    ui.engineWarn.style.display = 'none';
}
function toggleFlaps() {
    if (!game.engineStarted) return;
    game.flaps = game.flaps === 0 ? 1 : 0;
    ui.btnFlaps.classList.toggle('active');
}
function toggleGear() {
    game.gear = !game.gear;
    ui.btnGear.classList.toggle('active');
}

// ============================================================
// 11. ENTITÀ E COMBATTIMENTO
// ============================================================
function spawnFx(pos, o) {
    if (fx.length >= CONFIG.maxFx) return;
    const shared = o.shared ? SHARED_FX[o.shared] : null;
    const mat = shared || new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity, depthWrite: false });
    const mesh = new THREE.Mesh(GEO.unit, mat);
    mesh.position.copy(pos); mesh.scale.setScalar(o.scale);
    scene.add(mesh);
    fx.push({ mesh, shared: !!shared, age: 0, life: o.life, s0: o.scale, s1: o.endScale, opacity: o.opacity, vel: o.vel || null });
}
function removeFx(i) {
    const f = fx[i];
    scene.remove(f.mesh);
    if (!f.shared) f.mesh.material.dispose();
    fx.splice(i, 1);
}
function createExplosion(pos, scale) {
    playSound('explosion', pos);
    spawnFx(pos, { color: 0xffaa00, scale: scale * 0.5, endScale: scale * 4, life: 0.9, opacity: 0.9 });
    if (scale >= 8) {
        spawnFx(pos, { color: 0xff5500, scale: scale * 0.3, endScale: scale * 2.5, life: 0.6, opacity: 1 });
        for (let q = 0; q < 5; q++) {   // colonna di fumo
            _v3.set(pos.x + rand(-scale, scale) * 0.4, pos.y, pos.z + rand(-scale, scale) * 0.4);
            emitParticle(_v3, _v2.set(rand(-1, 1) * scale * 0.2, scale * rand(0.4, 0.9), rand(-1, 1) * scale * 0.2), 3, scale * 0.6, scale * 2.6, 0.12);
        }
    }
}
function schedule(delay, fn) { timers.push({ t: delay, fn }); }

function damagePlayer(amount) {
    if (game.state !== 'playing') return;
    amount *= DIFFICULTY[settings.difficulty].dmg * (1 - 0.1 * save.upgrades.armor);
    jetState.hp = Math.max(0, jetState.hp - amount);
    game.damageFlash = 0.5 + amount / 60;
    game.shake = Math.min(1.5, amount / 20);
    playSound('hit');
}
function crashPlayer(reason) {
    if (jetState.hp <= 0) return;
    jetState.hp = 0; game.deathReason = reason;
    createExplosion(jetState.position, 20);
}
function damageAlly(a, dmg) {
    a.userData.hp -= dmg;
    if (a.userData.hp <= 0 && !a.userData.dead) {
        a.userData.dead = true;
        createExplosion(a.position, 10);
        scene.remove(a);
        const i = allies.indexOf(a); if (i > -1) allies.splice(i, 1);
    }
}
function removeEnemy(e) {
    e.userData.dead = true; scene.remove(e);
    const i = enemies.indexOf(e); if (i > -1) enemies.splice(i, 1);
}
function damageEnemy(e, dmg, byPlayer) {
    if (e.userData.dead) return;
    e.userData.hp -= dmg;
    if (byPlayer) game.hitMarker = 0.15;
    if (e.userData.hp > 0) return;
    game.score += ENEMY_TYPES[e.userData.kind].score;
    createExplosion(e.position, e.userData.kind === 'bomber' ? 16 : 10);
    removeEnemy(e);
}
// Danni a una nave da difendere (portaerei o trasporto)
function damageDefendable(d, dmg) {
    const u = d.userData;
    if (u.dead) return;
    u.hp -= dmg;
    const b = u.box;
    createExplosion(_v3.set(d.position.x + rand(-b.hx, b.hx), b.cy * 2, d.position.z + rand(-b.hz * 0.8, b.hz * 0.8)), 12);
    if (u.type === 'carrier') game.mission.carrierHp = Math.max(0, Math.round(u.hp / u.maxHp * 100));
    if (u.hp > 0) return;
    u.dead = true;
    for (let k = 0; k < (u.type === 'carrier' ? 6 : 3); k++) {
        schedule(k * 0.4, () => createExplosion(_v3.set(d.position.x + rand(-b.hx, b.hx), b.cy * 2, d.position.z + rand(-b.hz, b.hz)), u.type === 'carrier' ? 25 : 18));
    }
    if (u.type === 'transport') {
        const i = world.defend.indexOf(d); if (i > -1) world.defend.splice(i, 1);
        sinking.push({ obj: d, age: 0, tilt: rand(-0.4, 0.4), rate: 4 });
    }
}
function damageGround(t, dmg, byPlayer) {
    if (t.userData.dead) return;
    t.userData.hp -= dmg;
    if (byPlayer) game.hitMarker = 0.15;
    if (t.userData.hp > 0) return;
    t.userData.dead = true;
    const i = world.targets.indexOf(t); if (i > -1) world.targets.splice(i, 1);
    const type = t.userData.type, m = game.mission;
    if (type === 'radar') { game.score += 5000; m.radar = true; }
    else if (type === 'carrier') { game.score += 10000; m.carriers++; }
    else if (type === 'destroyer') { game.score += 3000; m.destroyers++; }
    else if (type === 'cargo') { game.score += 2000; m.cargo++; }
    else if (type === 'sam') { game.score += 1000; m.sams++; }
    else if (type === 'facility') { game.score += 2500; m.facilities++; }

    if (type === 'carrier' || type === 'destroyer' || type === 'cargo') {
        const n = type === 'carrier' ? 6 : 2, b = t.userData.box;
        for (let k = 0; k < n; k++) {
            schedule(k * 0.35, () => {
                createExplosion(_v3.set(t.position.x + rand(-b.hx, b.hx), b.cy * 2, t.position.z + rand(-b.hz, b.hz)), type === 'carrier' ? 25 : 12);
            });
        }
        sinking.push({ obj: t, age: 0, tilt: rand(-0.4, 0.4), rate: type === 'carrier' ? 6 : 4 });
    } else {
        createExplosion(t.position, type === 'radar' ? 40 : 20);
        scene.remove(t);
    }
}

function spawnBullet(owner, pos, dir, speed) {
    const mat = owner === 'player' ? MAT.tracerPlayer : owner === 'ally' ? MAT.tracerAlly : MAT.tracerEnemy;
    const m = new THREE.Mesh(GEO.tracer, mat);
    m.position.copy(pos); faceDirection(m, dir);
    m.userData = { vel: dir.clone().normalize().multiplyScalar(speed), life: 2, owner, prev: pos.clone() };
    scene.add(m);
    (owner === 'enemy' ? enemyBullets : bullets).push(m);
}
function spawnMissile(owner, origin, dir, speed, target) {
    const friendly = owner === 'player' || owner === 'ally' || owner === 'allysam';
    const mat = owner === 'player' ? MAT.mslPlayer : owner === 'enemy' ? MAT.mslEnemy : owner === 'sam' ? MAT.mslSam : MAT.mslAlly;
    const m = new THREE.Mesh(GEO.missile, mat);
    m.position.copy(origin); faceDirection(m, dir);
    m.userData = { vel: dir.clone().normalize().multiplyScalar(speed), speed, life: friendly ? 8 : 10, target, homing: 0.5, trail: 0, decoy: null, rolled: false };
    scene.add(m);
    (friendly ? missiles : enemyMissiles).push(m);
    playSound('missile', origin);
}
function spawnBomb(pos, vel, kind) {
    const m = new THREE.Mesh(GEO.bomb, MAT.bomb);
    m.position.copy(pos); m.scale.setScalar(kind === 'sub' ? 0.5 : kind === 'cluster' ? 1.3 : 1);
    m.userData = { vel, kind };
    scene.add(m); bombs.push(m);
}
function detonateBomb(p, kind) {
    const splash = { bomb: 35, cluster: 20, sub: 14 }[kind];
    const dmg = { bomb: 40, cluster: 14, sub: 14 }[kind];
    createExplosion(p, kind === 'bomb' ? 10 : 5);

    if (kind === 'cluster') {
        let targetsHit = 0;
        for (let i = world.targets.length - 1; i >= 0; i--) {
            if (pointInBox(p, world.targets[i], splash * 1.5)) {
                damageGround(world.targets[i], dmg * 1.5, true);
                targetsHit++;
            }
        }
        if (targetsHit >= 2) {
            schedule(0.2, () => {
                createExplosion(p, 8);
                for (let i = world.targets.length - 1; i >= 0; i--) {
                    if (pointInBox(p, world.targets[i], splash * 2)) {
                        damageGround(world.targets[i], dmg, true);
                    }
                }
            });
        }
    } else {
        for (let i = world.targets.length - 1; i >= 0; i--) {
            if (pointInBox(p, world.targets[i], splash)) damageGround(world.targets[i], dmg, true);
        }
    }
}

function fireGun() {
    const j = jetState;
    if (cool.gun > 0 || j.ammoGun < 1 || !game.engineStarted) return;
    j.ammoGun--; cool.gun = 0.08; playSound('gun');
    spawnBullet('player', _v1.copy(j.position).addScaledVector(playerFwd, 8), playerFwd, 600 + j.speed);
}
function fireMissile() {
    const j = jetState;
    if (j.onGround || cool.missile > 0 || j.ammoMissile < 1 || !game.engineStarted) return;
    j.ammoMissile--; cool.missile = 0.8;
    spawnMissile('player', _v1.copy(j.position).addScaledVector(playerFwd, 5), playerFwd, 300 + j.speed, game.currentTarget);
}
function dropBomb(cluster) {
    const j = jetState, key = cluster ? 'cluster' : 'bomb', ammo = cluster ? 'ammoCluster' : 'ammoBomb';
    if (j.onGround || cool[key] > 0 || j[ammo] < 1) return;
    j[ammo]--; cool[key] = cluster ? 1.0 : 0.5;
    const vel = playerFwd.clone().multiplyScalar(j.speed); vel.y -= 10;
    spawnBomb(_v1.copy(j.position).setY(j.position.y - 1), vel, cluster ? 'cluster' : 'bomb');
}
function dropFlare() {
    const j = jetState;
    if (j.onGround || cool.flare > 0 || j.flares < 1 || !game.engineStarted) return;
    j.flares--; cool.flare = 1.5; playSound('flare');
    for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(GEO.unit, new THREE.MeshBasicMaterial({ color: 0xffdd00, transparent: true, opacity: 1 }));
        f.scale.setScalar(0.6);
        f.position.copy(j.position).addScaledVector(playerFwd, -6);
        f.userData = {
            vel: playerFwd.clone().multiplyScalar(j.speed * 0.5).add(new THREE.Vector3(rand(-15, 15), rand(-12, 0), rand(-15, 15))),
            life: 4, dead: false, ownMat: true
        };
        scene.add(f); flares.push(f);
    }
}

function nearestEnemy(pos, maxDist) {
    let best = null, bd = maxDist;
    for (const e of enemies) { const d = pos.distanceTo(e.position); if (d < bd) { bd = d; best = e; } }
    return best;
}
function pickFriendlyTarget(pos) {
    let best = jetPivot, bd = pos.distanceTo(jetPivot.position) * 0.7;
    for (const a of allies) { const d = pos.distanceTo(a.position); if (d < bd) { bd = d; best = a; } }
    return best;
}

function chooseEnemyTarget(e, kind) {
    if ((kind === 'bomber' || (kind === 'drone' && Math.random() < 0.6)) && world.defend.length) {
        let best = null, bd = Infinity;
        for (const d of world.defend) {
            if (d.userData.dead) continue;
            const dd = e.position.distanceTo(d.position);
            if (dd < bd) { bd = dd; best = d; }
        }
        if (best) return best;
    }
    return pickFriendlyTarget(e.position);
}
// Compone l'ondata in base alla missione, al numero d'ondata e alla difficoltà
function buildSpawnQueue(wave) {
    const M = MISSIONS[game.missionId], mix = M.mix(wave), kinds = Object.keys(mix);
    const total = kinds.reduce((a, k) => a + mix[k], 0);
    const n = Math.max(2, Math.round(M.size(wave) * DIFFICULTY[settings.difficulty].count));
    const q = [];
    for (let i = 0; i < n; i++) {
        let r = Math.random() * total, kind = kinds[0];
        for (const k of kinds) { r -= mix[k]; if (r <= 0) { kind = k; break; } }
        q.push(kind);
    }
    return q;
}
function spawnEnemyFormation() {
    const n = Math.min(6, game.spawnQueue.length, CONFIG.maxEnemies - enemies.length);
    if (n <= 0) return;
    const M = MISSIONS[game.missionId], D = DIFFICULTY[settings.difficulty];
    const center = M.spawnCenter ? M.spawnCenter() : jetState.position;
    const a = rand(-1.5, 1.5), dist = rand(4500, 7000);
    const base = new THREE.Vector3(Math.sin(a) * dist, 0, -Math.cos(a) * dist).add(center);
    base.y = rand(600, 1600);

    for (let i = 0; i < n; i++) {
        const kind = game.spawnQueue.shift(), T = ENEMY_TYPES[kind];
        const e = getJetTemplate(T.tint).clone(true);
        e.scale.setScalar(T.scale);
        const offset = i - Math.floor(n / 2);
        e.position.copy(base).add(_v2.set(offset * 80, rand(-30, 30), Math.abs(offset) * 60));
        const dir = jetState.position.clone().sub(e.position).normalize();
        const hp = Math.max(1, Math.round(T.hp * D.hp));
        e.userData = {
            type: 'jet', kind, hp, maxHp: hp, dead: false, dir, radius: T.radius, straight: T.straight,
            speed: T.speed[0], minSpeed: T.speed[0], maxSpeed: Math.min(T.speed[1] + 80, T.speed[1] + game.wave * 8),
            turnRate: Math.min(T.turn + 1.2, T.turn + game.wave * 0.08),
            state: 'attack', stateTimer: 0, breakDir: new THREE.Vector3(),
            fireTimer: rand(0, 1), missileTimer: rand(3, 6) * D.missileInterval, retarget: 0, target: jetPivot,
            evasive: rand(0, 2), formationLeader: i === 0,
            jink: 0, jinkDir: new THREE.Vector3(), bombed: false
        };
        faceDirection(e, dir);
        scene.add(e); enemies.push(e);
    }
}
function formationOffset(slot, out) {
    const side = slot % 2 === 0 ? -1 : 1, rank = Math.floor(slot / 2) + 1;
    return out.set(side * 38 * rank, rank % 2 ? -4 : 6, 55 * rank).applyQuaternion(jetState.quaternion);
}
function spawnAlly(slot) {
    const a = getJetTemplate(ALLY_TINT).clone(true);
    a.position.copy(jetState.position).add(formationOffset(slot, _v2));
    a.position.y = Math.max(a.position.y, 25);
    a.quaternion.copy(jetState.quaternion);
    a.userData = { type: 'ally', slot, hp: 10, maxHp: 10, dead: false, fireTimer: rand(0, 1), missileTimer: rand(3, 6) };
    scene.add(a); allies.push(a);
}
function topUpAllies() {
    if (!game.alliesSpawned) return;
    for (let slot = 0; slot < CONFIG.allyCount; slot++) {
        if (!allies.some(a => a.userData.slot === slot)) spawnAlly(slot);
    }
}

// ============================================================
// 12. SISTEMI DI GIOCO
// ============================================================
function getSurface(p) {
    const c = AC, W = CONFIG.world;
    // Portaerei alleata (impronta ricavata dal modello)
    if (Math.abs(p.x - c.x) < ALLY_FOOT.hx && Math.abs(p.z - c.z) < ALLY_FOOT.hz) {
        return p.y < DECK_Y - 10 ? { height: Infinity, kind: 'hull' } : { height: DECK_Y, kind: 'carrier' };
    }
    const th = terrainHeight(p.x, p.z);
    if (th > W.islandHeight) return { height: th, kind: 'mountain' };
    if (Math.hypot(p.x - FI.x, p.z - FI.z) < FI.radius) return { height: W.islandHeight, kind: 'island' };
    if (Math.hypot(p.x - EB.x, p.z - EB.z) < EB.radius) return { height: W.islandHeight, kind: 'enemyIsland' };
    for (const isl of smallIslands) if (Math.hypot(p.x - isl.x, p.z - isl.z) < isl.r * 1.15) return { height: 2, kind: 'rock' };
    return { height: W.seaHeight, kind: 'sea' };
}

function updatePlayer(dt) {
    const j = jetState, k = keys, J = CONFIG.jet;
    for (const key in cool) cool[key] = Math.max(0, cool[key] - dt);

    readInput(dt);
    if (game.gloc > 0) {   // g-LOC: il pilota è svenuto, i comandi non rispondono
        game.gloc -= dt;
        input.pitch = input.roll = input.yaw = 0; input.fire = false;
    }
    let pitchIn = input.pitch, rollIn = input.roll;
    const yawIn = input.yaw;
    if (j.hp < J.damagedHp && !j.onGround) rollIn += 0.3;
    pitchIn = clamp(pitchIn, -2, 2);
    rollIn = clamp(rollIn, -2, 2);

    const maxThrottle = j.hp < J.damagedHp ? 0.7 : 1;

    if (game.engineStarted) {
        game.engineSpool = Math.min(1, game.engineSpool + dt * 0.2);
        const up = (input.thrUp || k.thp) ? 1 : 0;
        const down = (input.thrDown || k.thm) ? 1 : 0;
        j.throttle = clamp(j.throttle + (up - down) * 0.6 * dt, 0, maxThrottle);
    } else {
        j.throttle = 0;
        if (input.thrUp || k.KeyW || k.ArrowUp || k.KeyS || k.ArrowDown) {
            game.showEngineWarning = 1.0;
        }
    }

    if (j.fuel <= 0) j.throttle = 0;

    if (input.fire && !j.onGround) fireGun();

    if (Math.abs(input.pitch) > 0.05) game.targetAltitude = -1;
    if (game.targetAltitude > 0 && !j.onGround) {
        const err = game.targetAltitude - j.position.y * 3.28084;
        const wantPitch = clamp(err * 0.0015, -0.5, 0.5);
        pitchIn = clamp((wantPitch - Math.asin(clamp(playerFwd.y, -1, 1))) * 3, -1, 1);
    }

    const real = FLIGHT[settings.flightModel].limitG;
    const auth = j.onGround ? (j.speed > 60 ? 1 : 0) : Math.min(1, j.speed / J.controlSpeed);
    const vv = Math.max(j.speed, 1);
    const upY = _v1.set(0, 1, 0).applyQuaternion(j.quaternion).y;
    let rate = pitchIn * J.pitchRate;          // velocità di beccheggio richiesta (rad/s, positivo = muso su)
    let stalled = false;
    if (real && !j.onGround) {
        const v30 = Math.max(vv, 30);
        // limite strutturale: ad alta velocità non si può tirare quanto si vuole
        rate = pitchIn >= 0 ? Math.min(rate, (J.maxG - upY) * 9.81 / v30) : Math.max(rate, -(upY + 3) * 9.81 / v30);
        // limite aerodinamico: a bassa velocità l'ala non genera abbastanza portanza (i flap aiutano)
        const nAero = (J.aeroG + (game.flaps ? 0.4 : 0)) * Math.pow(Math.max(vv, 20) / J.stallSpeed, 2);
        const nDemand = upY + rate * v30 / 9.81;
        const aoaD = J.stallAoa * Math.max(nDemand, 0.3) / nAero;
        game.aoa += (Math.min(aoaD, 40) - game.aoa) * damp(6, dt);
        if (nDemand > nAero) rate *= clamp((nAero - upY) / (nDemand - upY), 0.1, 1);
        stalled = aoaD > J.stallAoa * 1.1;
        if (stalled) rate = rate * 0.5 - 0.5 * clamp((aoaD - J.stallAoa) / 10, 0.3, 1);   // lo stallo fa cadere il muso
    } else game.aoa += (0 - game.aoa) * damp(6, dt);
    game.stalled = stalled;
    j.aoa = game.aoa * Math.PI / 180;

    _e1.set(rate * dt * auth, yawIn * J.yawRate * dt * auth, -rollIn * J.rollRate * dt * auth, 'YXZ');
    j.quaternion.multiply(_q1.setFromEuler(_e1)).normalize();

    if (j.onGround || Math.abs(rollIn) < 0.03) {
        _e1.setFromQuaternion(j.quaternion, 'YXZ');
        if (j.onGround || Math.abs(_e1.x) < 1.2) {
            _e1.z *= 1 - damp(j.onGround ? 8 : 0.6, dt);
            if (j.onGround) {
                if (j.speed < 60) _e1.x *= 1 - damp(2, dt);
                _e1.x = Math.max(_e1.x, 0);
            }
            j.quaternion.setFromEuler(_e1);
        }
    }
    playerFwd.copy(FWD).applyQuaternion(j.quaternion);

    const thrust = j.fuel > 0 ? j.throttle * J.thrust * (1 + 0.08 * save.upgrades.engine) * (j.hp / 100) : 0;
    const drag = J.drag * j.speed * j.speed;
    const gravity = j.onGround ? 0 : playerFwd.y * J.gravity;
    const brake = (j.onGround && input.brake) ? 50 : 0;
    const induced = (real && !j.onGround) ? J.inducedDrag * game.gForce * game.gForce * Math.pow(J.stallSpeed / Math.max(j.speed, 40), 2) : 0;
    if (j.fuel > 0) j.fuel = Math.max(0, j.fuel - thrust * J.fuelBurn * dt);
    j.speed = Math.max(0, j.speed + (thrust - drag - induced - gravity - brake) * dt);

    if (j.onGround && game.engineStarted && j.throttle > 0.9 && j.speed < 45) {
        j.speed += J.takeoffBoost * dt;
    }

    j.position.addScaledVector(playerFwd, j.speed * dt);

    const flapLift = game.flaps ? 15 : 0;
    let stallFactor = 0;
    if (!real) {   // modello arcade: stallo approssimato sull'assetto
        const pitchA = Math.asin(clamp(playerFwd.y, -1, 1));
        if (!j.onGround && Math.abs(pitchA) > 0.4 && j.speed < 100 && j.position.y > 30) {
            stallFactor = (Math.abs(pitchA) - 0.4) * 2;
            j.speed = Math.max(0, j.speed - stallFactor * 50 * dt);
        }
    } else if (!j.onGround && stalled) { j.speed = Math.max(0, j.speed - 6 * dt); stallFactor = 0.6; }

    const sink = j.onGround ? 0 : Math.max(0, (1 - Math.min(1, (j.speed + flapLift) / J.stallSpeed)) * 40);
    j.position.y -= (sink + stallFactor * 40) * dt;
    const vy = playerFwd.y * j.speed - sink;

    // Fattore di carico (G) reale e svenimento (solo volo realistico)
    const nAct = (real && !j.onGround) ? upY + rate * vv / 9.81 : 1;
    game.gForce += (clamp(nAct, -4, 12) - game.gForce) * damp(8, dt);
    if (real && !j.onGround) {
        const g = game.gForce, g0 = J.gBlackoutThreshold - 2;
        if (g > g0) game.gStress += (g - g0) * 0.12 * dt; else if (g < 4.5) game.gStress = Math.max(0, game.gStress - 0.35 * dt);
        game.redout = g < -1.5 ? Math.min(1, game.redout + (-1.5 - g) * 0.25 * dt) : Math.max(0, game.redout - 0.5 * dt);
        if (game.gStress >= 1 && game.gloc <= 0) { game.gloc = 2.5; game.gStress = 0.5; }
        if (game.redout >= 1 && game.gloc <= 0) { game.gloc = 2.0; game.redout = 0.5; }
    } else {
        game.gStress = Math.max(0, game.gStress - 0.5 * dt); game.redout = Math.max(0, game.redout - 0.5 * dt);
    }
    game.blackout = game.gloc > 0 ? 1 : clamp(game.gStress, 0, 1);

    const wasAirborne = !j.onGround;
    const surf = getSurface(j.position);

    let minHeight = surf.height;
    if (game.gear && surf.height < 10) minHeight = Math.max(surf.height, 4.0);

    if (j.onGround && surf.kind !== 'hull' && surf.kind !== 'sea' &&
        j.speed > J.takeoffSpeed && playerFwd.y > J.takeoffPitch) {
        j.onGround = false;
        j.position.y = minHeight + 0.5;
    }

    if (!j.onGround && j.position.y <= minHeight) {
        if (surf.kind === 'hull') crashPlayer('Impatto con la portaerei');
        else if (surf.kind === 'sea') crashPlayer('Ammaraggio forzato');
        else if (surf.kind === 'mountain' || surf.kind === 'rock') crashPlayer('Impatto col terreno');
        else {
            if (wasAirborne) {
                const upY = _v1.set(0, 1, 0).applyQuaternion(j.quaternion).y;
                if (-vy > 28 || playerFwd.y < -0.3 || upY < 0.6) crashPlayer('Atterraggio violento');
                else if (-vy > 12) damagePlayer((-vy - 12) * 3);
            }
            j.position.y = minHeight; j.onGround = true; game.targetAltitude = -1;
        }
    } else if (!j.onGround) {
        // già in volo
    } else {
        j.position.y = minHeight;
    }

    for (const t of world.targets) {
        if (pointInBox(j.position, t, 3)) { crashPlayer('Collisione con un bersaglio'); break; }
    }

    const friendlyBase = surf.kind === 'island' || surf.kind === 'carrier';
    if (j.onGround && friendlyBase && j.speed < 5) {
        game.rearmTimer += dt;
        if (game.rearmTimer > 1.5) {
            j.hp = Math.min(100, j.hp + 15 * dt);
            j.fuel = Math.min(100, j.fuel + 20 * dt);
            j.ammoGun = Math.min(j.max.gun, j.ammoGun + 100 * dt);
            j.ammoMissile = Math.min(j.max.missile, j.ammoMissile + 1 * dt);
            j.ammoBomb = Math.min(j.max.bomb, j.ammoBomb + 0.8 * dt);
            j.ammoCluster = Math.min(j.max.cluster, j.ammoCluster + 0.6 * dt);
            j.flares = Math.min(j.max.flares, j.flares + 1 * dt);
        }
    } else game.rearmTimer = 0;

    jetPivot.position.copy(j.position); jetPivot.quaternion.copy(j.quaternion);
    const burning = j.hp < J.damagedHp && !j.onGround;
    flame.visible = burning || (j.throttle > 0.8 && j.fuel > 0);
    flame.material.color.setHex(burning ? 0xff4400 : 0x88ccff);
    flame.scale.set(1, 1, burning ? 1.5 + Math.random() : 1 + Math.random() * 0.5);

    if (j.hp < 50 && !j.onGround) {
        game.smokeTimer += dt;
        if (game.smokeTimer > 0.15) {
            game.smokeTimer = 0;
            _v1.copy(j.position).addScaledVector(playerFwd, -7);
            emitParticle(_v1, _v2.set(rand(-5, 5), 10, rand(-5, 5)), 1.6, 1, 8, 0.15);
        }
    }

    // Scie di condensa (alta quota o G elevati) e scia del motore
    if (!j.onGround && ((j.position.y > 2500 && j.speed > 150) || game.gForce > 5)) {
        for (const sg of [-1, 1]) {
            _v1.set(sg * jetWingX, 0, jetTailZ * 0.2).applyQuaternion(j.quaternion).add(j.position);
            emitParticle(_v1, null, 3.5, 0.6, 4.5, 1.0);
        }
    }
    if (!j.onGround && j.throttle > 0.5 && Math.random() < 0.5) {
        _v1.set(0, 0, jetTailZ + 1).applyQuaternion(j.quaternion).add(j.position);
        _v2.copy(playerFwd).multiplyScalar(-6);
        emitParticle(_v1, _v2, 1.2, 0.5, 2.5, 0.55);
    }
}

// Navi in movimento (convogli)
function updateMovers(dt) {
    const step = t => {
        const u = t.userData;
        if (u.move && !(u.stopZ !== undefined && t.position.z <= u.stopZ)) t.position.addScaledVector(u.move, dt);
    };
    world.targets.forEach(step); world.defend.forEach(step);
}

function updateWaves(dt) {
    const M = MISSIONS[game.missionId];
    if (game.spawnQueue.length > 0) {
        game.spawnTimer += dt;
        if (game.spawnTimer > 2.5 && enemies.length < CONFIG.maxEnemies) { spawnEnemyFormation(); game.spawnTimer = 0; }
    } else if (enemies.length === 0) {
        if (M.waveGoal && game.wave >= M.waveGoal) game.waveDone = true;
        else { game.waveBreak -= dt; if (game.waveBreak <= 0) startWave(); }
    }
    if (game.waveMsgTimer > 0) {
        game.waveMsgTimer -= dt;
        if (game.waveMsgTimer <= 0) setShow(ui.waveMsg, false);
    }
    if (!game.alliesSpawned && !jetState.onGround) {
        game.alliesSpawned = true;
        for (let sl = 0; sl < CONFIG.allyCount; sl++) spawnAlly(sl);
    }
}
function startWave() {
    game.wave++;
    game.spawnQueue = buildSpawnQueue(game.wave);
    game.waveBreak = CONFIG.waveBreak; game.spawnTimer = 2.5;
    game.waveMsgTimer = 3;
    ui.waveMsg.innerHTML = 'ONDATA ' + game.wave + (game.wave === 1 ? "<br><span style='font-size:20px'>Il nemico sta arrivando</span>" : '');
    setShow(ui.waveMsg, true);
    topUpAllies();
}

function updateEnemies(dt) {
    game.dangerAlert = false;
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i], u = e.userData, T = ENEMY_TYPES[u.kind], D = DIFFICULTY[settings.difficulty];
        u.retarget -= dt;
        u.evasive -= dt;

        if (u.retarget <= 0 || u.target.userData.dead) {
            u.target = chooseEnemyTarget(e, u.kind);
            u.retarget = rand(1.5, 3);
        }

        const toT = _v1.subVectors(u.target.position, e.position), dist = toT.length();
        toT.divideScalar(dist || 1);
        const isDefend = u.target !== jetPivot && u.target.userData.type !== 'ally';

        // Il drone è un kamikaze: esplode contro il bersaglio
        if (u.kind === 'drone' && dist < 16) {
            if (u.target === jetPivot) damagePlayer(20);
            else if (u.target.userData.type === 'ally') damageAlly(u.target, 5);
            else damageDefendable(u.target, 12);
            createExplosion(e.position, 6); removeEnemy(e); continue;
        }

        u.stateTimer -= dt;

        const playerBehind = jetState.position.clone().sub(e.position).normalize().dot(e.userData.dir) > 0.8;
        const underFire = e.userData.hp < e.userData.maxHp;

        if (u.state === 'attack' && !u.straight && (dist < 300 || playerBehind || underFire)) {
            u.state = 'break';
            u.stateTimer = rand(2.0, 4.0);
            u.breakDir.copy(toT).negate()
                .add(_v2.set(rand(-1.5, 1.5), rand(0.5, 1.5), rand(-1.5, 1.5)))
                .normalize();
        } else if (u.state === 'break' && u.stateTimer <= 0) {
            u.state = 'attack';
        } else if (u.state === 'attack' && !u.straight && dist < 150) {
            u.state = 'scissors';
            u.stateTimer = rand(1.0, 2.0);
            u.breakDir.copy(toT).negate().add(_v2.set(rand(-2, 2), rand(-0.5, 0.5), rand(-2, 2))).normalize();
        } else if (u.state === 'scissors' && u.stateTimer <= 0) {
            u.state = 'attack';
        }

        let want;
        if (u.state === 'attack') want = toT;
        else if (u.state === 'break') want = u.breakDir;
        else if (u.state === 'scissors') {
            want = _v3.copy(toT).applyAxisAngle(_v2.set(0,1,0), Math.sin(performance.now() * 0.005) * 1.5);
        }

        // Caccia agile: zig-zag durante l'avvicinamento
        if (u.kind === 'agile' && u.state === 'attack' && dist > 300) {
            u.jink -= dt;
            if (u.jink <= 0) { u.jink = rand(1.2, 2.4); u.jinkDir.set(rand(-1, 1), rand(-0.5, 0.5), rand(-1, 1)).normalize(); }
            want = _v2.copy(toT).addScaledVector(u.jinkDir, 0.9).normalize();
        }
        // Bombardiere: sgancia sulla nave da difendere, poi si allontana
        if (u.kind === 'bomber' && isDefend) {
            if (u.bombed) {
                want = _v2.set(0, 0.1, -1).normalize();
                if (dist > 5500) { removeEnemy(e); continue; }
            } else if (dist < 320) {
                damageDefendable(u.target, 25 * D.dmg); u.bombed = true; game.shake = Math.max(game.shake, 0.4);
            }
        }
        u.dir.lerp(want, damp(u.turnRate, dt)).normalize();

        if (e.position.y < 150 && u.dir.y < 0.2) {
            u.dir.y += 0.8 * dt;
            u.dir.normalize();
        }

        const targetSpeed = u.state === 'attack'
            ? clamp(jetState.speed * 0.95, u.minSpeed, u.maxSpeed)
            : clamp(jetState.speed * 0.7, u.minSpeed * 0.75, u.maxSpeed * 0.8);
        u.speed += (targetSpeed - u.speed) * damp(0.6, dt);

        e.position.addScaledVector(u.dir, u.speed * dt);
        faceDirection(e, u.dir);

        if (jetState.position.distanceTo(e.position) < 1200) game.dangerAlert = true;
        const targetAirborne = u.target !== jetPivot || !jetState.onGround;

        u.missileTimer -= dt;
        if (T.missile && !isDefend && dist < 2500 && u.missileTimer <= 0 && targetAirborne && enemyMissiles.length < CONFIG.maxEnemyMissiles) {
            u.missileTimer = rand(5, 9) * D.missileInterval;
            if (u.formationLeader) u.missileTimer *= 0.7;
            spawnMissile('enemy', e.position, u.dir, 320, u.target);
        }

        u.fireTimer -= dt;
        if (T.gun && dist < 1100 && u.dir.angleTo(toT) < 0.25 && u.fireTimer <= 0 && targetAirborne) {
            u.fireTimer = u.state === 'attack' ? 0.6 : 1.2;
            _v3.copy(u.dir).add(_v2.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(D.spread)).normalize();
            spawnBullet('enemy', _v2.copy(e.position).addScaledVector(u.dir, 5), _v3, 520);
        }

        if (e.position.distanceTo(jetState.position) < T.radius + 4) {
            damagePlayer(u.kind === 'bomber' ? 60 : 40); damageEnemy(e, 99, false);
        }

        if (u.evasive <= 0 && !u.straight && enemyMissiles.length === 0) {
            for (const m of missiles) {
                if (m.position.distanceTo(e.position) < 300) {
                    u.evasive = rand(1.5, 3);
                    u.state = 'break';
                    u.stateTimer = 1.5;
                    u.breakDir.copy(m.userData.vel).negate().add(_v2.set(rand(-1,1), rand(-0.5,1), rand(-1,1))).normalize();
                    break;
                }
            }
        }
    }
}

function updateAllies(dt) {
    for (let i = allies.length - 1; i >= 0; i--) {
        const a = allies[i], u = a.userData;
        formationOffset(u.slot, _v2).add(jetState.position);
        _v2.y = Math.max(_v2.y, 25);
        a.position.lerp(_v2, damp(2, dt));

        u.fireTimer -= dt; u.missileTimer -= dt;
        const tgt = nearestEnemy(a.position, 4000);
        if (tgt) {
            const dir = _v3.subVectors(tgt.position, a.position), d = dir.length();
            dir.divideScalar(d);
            a.quaternion.slerp(_q1.setFromUnitVectors(FWD, dir), damp(4, dt));
            if (d < 1200 && u.fireTimer <= 0) {
                u.fireTimer = 0.3;
                const aimDir = dir.clone().add(_v2.set(rand(-0.02, 0.02), rand(-0.02, 0.02), rand(-0.02, 0.02))).normalize();
                spawnBullet('ally', a.position, aimDir, 700);
            }
            if (d < 2500 && u.missileTimer <= 0) {
                u.missileTimer = 6;
                spawnMissile('ally', a.position, dir, 350, tgt);
            }
        } else a.quaternion.slerp(jetState.quaternion, damp(2, dt));
    }
}

function updateGroundDefenses(dt) {
    for (const t of world.targets) {
        const u = t.userData;
        if (!u.range) continue;
        u.fireTimer -= dt;
        if (u.fireTimer > 0 || enemyMissiles.length >= CONFIG.maxEnemyMissiles) continue;
        if (jetState.onGround || t.position.distanceTo(jetState.position) >= u.range) continue;
        u.fireTimer = u.reload * rand(0.8, 1.2);
        const origin = _v1.copy(t.position).setY(20);
        spawnMissile(u.missile, origin, _v2.subVectors(jetState.position, origin), u.missile === 'sam' ? 400 : 300, jetPivot);
    }
    for (const s of world.allySams) {
        s.userData.fireTimer -= dt;
        if (s.userData.fireTimer > 0) continue;
        const tgt = nearestEnemy(s.position, 4000);
        if (!tgt) continue;
        s.userData.fireTimer = 1.5;
        const origin = _v1.copy(s.position).setY(20);
        spawnMissile('allysam', origin, _v2.subVectors(tgt.position, origin), 450, tgt);
    }
}

function updateBullets(dt) {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i], u = b.userData, byPlayer = u.owner === 'player';
        u.prev.copy(b.position); b.position.addScaledVector(u.vel, dt); u.life -= dt;
        let hit = false;
        for (let j = enemies.length - 1; j >= 0 && !hit; j--) {
            if (segDistSq(u.prev, b.position, enemies[j].position) < enemies[j].userData.radius * enemies[j].userData.radius) { damageEnemy(enemies[j], 1, byPlayer); hit = true; }
        }
        for (let j = world.targets.length - 1; j >= 0 && !hit; j--) {
            if (pointInBox(b.position, world.targets[j], 1)) { damageGround(world.targets[j], 1, byPlayer); hit = true; }
        }
        if (hit) spawnFx(b.position, { shared: 'spark', scale: 2, endScale: 0.2, life: 0.2 });
        if (hit || u.life <= 0 || b.position.y < 0) { scene.remove(b); bullets.splice(i, 1); }
    }
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i], u = b.userData;
        u.prev.copy(b.position); b.position.addScaledVector(u.vel, dt); u.life -= dt;
        let hit = false;
        if (segDistSq(u.prev, b.position, jetState.position) < 36) { damagePlayer(8); hit = true; }
        for (let j = allies.length - 1; j >= 0 && !hit; j--) {
            if (segDistSq(u.prev, b.position, allies[j].position) < 36) { damageAlly(allies[j], 3); hit = true; }
        }
        if (hit || u.life <= 0 || b.position.y < 0) { scene.remove(b); enemyBullets.splice(i, 1); }
    }
}

function updateMissiles(dt) {
    for (let i = missiles.length - 1; i >= 0; i--) {
        const m = missiles[i], u = m.userData;
        u.homing -= dt;
        if (u.target && u.target.userData.kind === 'agile' && !u.rolled && m.position.distanceTo(u.target.position) < 300) {
            u.rolled = true;                                  // il caccia agile può far perdere l'aggancio
            if (Math.random() < 0.45) { u.target = null; emitParticle(m.position, null, 1.2, 2, 6, 1.0); }
        }
        if (u.target && !u.target.userData.dead && u.homing <= 0) {
            aimPoint(u.target, _v1).sub(m.position).setLength(u.speed);
            u.vel.lerp(_v1, damp(4, dt)).setLength(u.speed);
        }
        m.position.addScaledVector(u.vel, dt); faceDirection(m, u.vel); u.life -= dt;
        u.trail -= dt;
        if (u.trail <= 0) { u.trail = 0.04; emitParticle(m.position, null, 0.9, 0.7, 1.6, 0.9); }

        let hit = false;
        for (let j = enemies.length - 1; j >= 0 && !hit; j--) {
            if (m.position.distanceTo(enemies[j].position) < enemies[j].userData.radius + 6) { damageEnemy(enemies[j], 4, true); hit = true; }
        }
        for (let j = world.targets.length - 1; j >= 0 && !hit; j--) {
            if (pointInBox(m.position, world.targets[j], 6)) { damageGround(world.targets[j], 25, true); hit = true; }
        }
        if (hit || u.life <= 0 || m.position.y < 0.5) {
            createExplosion(m.position, hit ? 6 : 3);
            scene.remove(m); missiles.splice(i, 1);
        }
    }

    game.threat = null;
    let threatDist = 1500;
    for (let i = enemyMissiles.length - 1; i >= 0; i--) {
        const m = enemyMissiles[i], u = m.userData;
        u.homing -= dt;
        if (u.target.userData.dead) u.target = jetPivot;

        if (u.homing <= 0 && !u.decoy && !u.rolled) {
            for (const f of flares) {
                if (!f.userData.dead && m.position.distanceTo(f.position) < 120) {
                    u.rolled = true;
                    if (Math.random() < 0.8) u.decoy = f;
                    break;
                }
            }
        }
        if (u.decoy && u.decoy.userData.dead) u.decoy = null;
        const aim = u.decoy ? u.decoy.position : u.target.position;
        if (u.homing <= 0) u.vel.lerp(_v1.subVectors(aim, m.position).setLength(u.speed), damp(3.2, dt)).setLength(u.speed);
        m.position.addScaledVector(u.vel, dt); faceDirection(m, u.vel); u.life -= dt;
        u.trail -= dt;
        if (u.trail <= 0) { u.trail = 0.04; emitParticle(m.position, null, 0.9, 0.7, 1.6, 0.9); }

        let done = false;
        if (u.decoy) {
            if (m.position.distanceTo(u.decoy.position) < 12) { createExplosion(m.position, 4); done = true; }
        } else if (m.position.distanceTo(u.target.position) < 10) {
            if (u.target === jetPivot) damagePlayer(30); else damageAlly(u.target, 10);
            createExplosion(m.position, 6); done = true;
        }
        if (!done && u.target === jetPivot && !u.decoy) {
            const d = m.position.distanceTo(jetState.position);
            if (d < threatDist) { threatDist = d; game.threat = m.position; }
        }
        if (done || u.life <= 0 || m.position.y < 0.5) {
            if (!done) createExplosion(m.position, 5);
            scene.remove(m); enemyMissiles.splice(i, 1);
        }
    }
}

function updateBombs(dt) {
    for (let i = bombs.length - 1; i >= 0; i--) {
        const b = bombs[i], u = b.userData;
        u.vel.y -= 9.8 * dt; b.position.addScaledVector(u.vel, dt);
        if (u.kind === 'cluster' && b.position.y < 150) {
            let targetsNear = 0;
            for (const t of world.targets) {
                if (t.position.distanceTo(b.position) < 300) targetsNear++;
            }
            const count = Math.min(20, 8 + targetsNear * 2);
            for (let k = 0; k < count; k++) {
                const angle = (k / count) * Math.PI * 2;
                const radius = rand(10, 50) * (targetsNear > 1 ? 1.5 : 1);
                spawnBomb(_v1.copy(b.position).add(_v2.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)),
                    u.vel.clone().multiplyScalar(0.5).add(new THREE.Vector3(rand(-15, 15), rand(-5, 0), rand(-15, 15))), 'sub');
            }
            scene.remove(b); bombs.splice(i, 1);
            continue;
        }
        let impact = b.position.y <= 2.5;
        for (let t = 0; t < world.targets.length && !impact; t++) impact = pointInBox(b.position, world.targets[t], 1);
        if (impact) { detonateBomb(b.position, u.kind); scene.remove(b); bombs.splice(i, 1); }
    }
}

function updateFlares(dt) {
    for (let i = flares.length - 1; i >= 0; i--) {
        const f = flares[i], u = f.userData;
        u.vel.y -= 4 * dt; u.vel.multiplyScalar(1 - 0.3 * dt);
        f.position.addScaledVector(u.vel, dt); u.life -= dt;
        f.material.opacity = clamp(u.life / 1.5, 0, 1);
        if (u.life <= 0 || f.position.y < 0.5) {
            u.dead = true; scene.remove(f); f.material.dispose(); flares.splice(i, 1);
        }
    }
}

function updateFx(dt) {
    for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.age += dt;
        const t = f.age / f.life;
        if (t >= 1) { removeFx(i); continue; }
        f.mesh.scale.setScalar(f.s0 + (f.s1 - f.s0) * t);
        if (!f.shared) f.mesh.material.opacity = f.opacity * (1 - t);
        if (f.vel) f.mesh.position.addScaledVector(f.vel, dt);
    }
}
function updateTimers(dt) {
    for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) { const fn = timers[i].fn; timers.splice(i, 1); fn(); }
    }
}
function updateSinking(dt) {
    for (let i = sinking.length - 1; i >= 0; i--) {
        const sk = sinking[i];
        sk.age += dt; sk.obj.position.y -= sk.rate * dt; sk.obj.rotation.z += sk.tilt * dt * 0.3;
        if (Math.random() < dt * 3) {
            _v1.set(sk.obj.position.x + rand(-40, 40), 30, sk.obj.position.z + rand(-80, 80));
            emitParticle(_v1, _v2.set(0, 12, 0), 3, 8, 28, 0.12);
        }
        if (sk.age > 12) { scene.remove(sk.obj); sinking.splice(i, 1); }
    }
}

function updateEnvironment(dt) {
    game.time = (game.time + dt / CONFIG.dayLengthSec) % 1;
    const a = game.time * Math.PI * 2, h = Math.sin(a), w = game.weather;
    const day = smoothstep(clamp((h + 0.1) / 0.4, 0, 1));
    const dusk = clamp(1 - Math.abs(h) / 0.3, 0, 1);

    _ct.copy(SKY.nightTop).lerp(SKY.dayTop, day).lerp(SKY.duskTop, dusk * 0.7);
    _ch.copy(SKY.nightHor).lerp(SKY.dayHor, day).lerp(SKY.duskHor, dusk * 0.85);
    const light = 0.2 + 0.8 * day;
    _ct.lerp(_cg.copy(SKY.grayTop).multiplyScalar(light), w * 0.7);
    _ch.lerp(_cg.copy(SKY.grayHor).multiplyScalar(light), w * 0.7);
    paintSky(_ct, _ch);
    scene.background.copy(_ch); scene.fog.color.copy(_ch);
    scene.fog.near = 3000 - 2300 * w; scene.fog.far = 20000 - 11000 * w;

    sunDir.set(Math.cos(a) * 0.7, h, 0.45).normalize();
    sun.position.copy(jetState.position).addScaledVector(sunDir, 800);
    sun.target.position.copy(jetState.position);
    sun.intensity = (0.05 + 2.4 * day) * (1 - 0.5 * w);
    sun.color.copy(SUN_DAY).lerp(SUN_DUSK, dusk);
    ambientLight.intensity = 0.25 + 0.45 * day;
    ambientLight.color.copy(AMB_NIGHT).lerp(AMB_DAY, day);
    water.material.color.copy(WATER_BASE).multiplyScalar(0.35 + 0.65 * day);

    const gray = lerpNum(1, 0.55, w) * (0.25 + 0.75 * day);
    cloudMat.color.setRGB(gray, gray, gray);
    cloudMat.opacity = 0.6 + 0.3 * w;
    for (const c of clouds) {
        c.position.x -= 20 * dt;
        const dx = c.position.x - jetState.position.x, dz = c.position.z - jetState.position.z;
        if (dx < -CLOUD_RANGE) c.position.x += 2 * CLOUD_RANGE; else if (dx > CLOUD_RANGE) c.position.x -= 2 * CLOUD_RANGE;
        if (dz < -CLOUD_RANGE) c.position.z += 2 * CLOUD_RANGE; else if (dz > CLOUD_RANGE) c.position.z -= 2 * CLOUD_RANGE;
    }

    // Mare: la texture scorre, la schiuma pulsa e si scurisce di notte
    waterTime += dt;
    waterTex.offset.x = (waterTime * 0.0035) % 1; waterTex.offset.y = (waterTime * 0.0015) % 1;
    const wl = 0.35 + 0.65 * day;
    foamMat.opacity = 0.4 + 0.1 * Math.sin(waterTime * 1.3);
    foamMat.color.setRGB(wl, wl, wl); wakeMat.color.setRGB(wl, wl, wl);
}

function updateCamera(dt) {
    const j = jetState;
    _v1.set(0, cameraDistance * 0.45, cameraDistance).applyQuaternion(j.quaternion);
    camera.position.copy(j.position).add(_v1);
    camera.position.y = Math.max(camera.position.y, 1);

    const shake = Math.max(game.shake, (j.hp < 20 && !j.onGround) ? 0.4 : 0, game.stalled ? 0.35 : 0);
    if (shake > 0) {
        camera.position.x += rand(-0.5, 0.5) * shake; camera.position.y += rand(-0.5, 0.5) * shake;
        game.shake = Math.max(0, game.shake - dt * 2);
    }
    // FOV dinamico: sensazione di velocità
    const fovTarget = 65 + 14 * smoothstep(clamp(j.speed / 470, 0, 1)) + (j.throttle > 0.8 ? 2 : 0);
    if (Math.abs(camera.fov - fovTarget) > 0.05) { camera.fov += (fovTarget - camera.fov) * damp(3, dt); camera.updateProjectionMatrix(); }

    _v2.copy(j.position).addScaledVector(playerFwd, 30);
    camera.up.set(0, 1, 0).applyQuaternion(j.quaternion);
    camera.lookAt(_v2);
    camera.updateMatrixWorld();
    sky.position.copy(camera.position);
}

function updateTargeting() {
    let best = null, bestAngle = 0.3, bestDist = 0;
    const consider = (obj, range) => {
        aimPoint(obj, _v1).sub(jetState.position);
        const d = _v1.length();
        if (d > range || d < 1) return;
        const ang = playerFwd.angleTo(_v1);
        if (ang < bestAngle) { bestAngle = ang; best = obj; bestDist = d; }
    };
    for (const e of enemies) consider(e, 5000);
    for (const t of world.targets) consider(t, 7000);
    game.currentTarget = best; game.targetDist = bestDist;
}

function drawHorizon() {
    setShow(ui.horizon, settings.ladder);
    if (!settings.ladder) return;
    const c = ui.hctx, S = 560, R = 250, ppd = 7, j = jetState;
    c.clearRect(0, 0, S, S);
    const pitchDeg = Math.asin(clamp(playerFwd.y, -1, 1)) * 57.2958;
    _v1.set(1, 0, 0).applyQuaternion(j.quaternion);
    _v2.set(0, 1, 0).applyQuaternion(j.quaternion);
    const roll = Math.atan2(-_v1.y, _v2.y);      // positivo = semiala destra in basso
    c.save();
    c.translate(S / 2, S / 2);
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
    c.rotate(-roll);
    c.strokeStyle = '#7dffb0'; c.fillStyle = '#7dffb0'; c.lineWidth = 2; c.font = '12px monospace'; c.textAlign = 'center';
    c.shadowColor = '#000'; c.shadowBlur = 4;
    for (let a = -90; a <= 90; a += 5) {
        const y = (pitchDeg - a) * ppd;
        if (y < -R - 20 || y > R + 20) continue;
        const major = a % 10 === 0, half = a === 0 ? 170 : major ? 55 : 24, gap = a === 0 ? 30 : 22;
        c.setLineDash(a < 0 ? [7, 5] : []);
        c.beginPath();
        c.moveTo(-half - gap, y); c.lineTo(-gap, y); c.moveTo(gap, y); c.lineTo(half + gap, y);
        c.stroke();
        if (major && a !== 0) { c.fillText(String(Math.abs(a)), -half - gap - 16, y + 4); c.fillText(String(Math.abs(a)), half + gap + 16, y + 4); }
    }
    c.restore();
    // scala di rollio e puntatore
    c.save();
    c.translate(S / 2, S / 2);
    c.strokeStyle = '#7dffb0'; c.fillStyle = '#7dffb0'; c.setLineDash([]); c.lineWidth = 2; c.shadowColor = '#000'; c.shadowBlur = 4;
    [0, 10, 20, 30, 45, 60].forEach(d => [d, -d].forEach(sg => {
        const ang = sg * Math.PI / 180, len = d % 30 === 0 ? 16 : 9;
        c.beginPath(); c.moveTo(Math.sin(ang) * R, -Math.cos(ang) * R); c.lineTo(Math.sin(ang) * (R - len), -Math.cos(ang) * (R - len)); c.stroke();
    }));
    c.rotate(-roll);
    c.beginPath(); c.moveTo(0, -R + 20); c.lineTo(-6, -R + 32); c.lineTo(6, -R + 32); c.closePath(); c.fill();
    c.restore();
    // vettore velocità: sotto il muso di un valore pari all'angolo d'attacco
    const fy = FLIGHT[settings.flightModel].limitG ? Math.min(game.aoa, 25) * ppd * 0.6 : 0;
    c.save();
    c.translate(S / 2, S / 2 + fy);
    c.strokeStyle = '#7dffb0'; c.lineWidth = 2; c.shadowColor = '#000'; c.shadowBlur = 4;
    c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2);
    c.moveTo(-8, 0); c.lineTo(-20, 0); c.moveTo(8, 0); c.lineTo(20, 0); c.moveTo(0, -8); c.lineTo(0, -16);
    c.stroke();
    c.restore();
}

function drawRadar() {
    const c = ui.rctx, j = jetState;
    c.clearRect(0, 0, 180, 180);
    c.strokeStyle = 'rgba(125,255,176,.3)'; c.lineWidth = 1;
    [30, 60, 90].forEach(r => { c.beginPath(); c.arc(90, 90, r, 0, Math.PI * 2); c.stroke(); });
    c.strokeStyle = '#7dffb0'; c.lineWidth = 2; c.beginPath(); c.moveTo(90, 90); c.lineTo(90, 10); c.stroke();
    c.fillStyle = '#7dffb0'; c.beginPath(); c.moveTo(90, 85); c.lineTo(85, 95); c.lineTo(95, 95); c.fill();

    let hx = playerFwd.x, hz = playerFwd.z;
    const l = Math.hypot(hx, hz);
    if (l < 0.01) { hx = 0; hz = -1; } else { hx /= l; hz /= l; }
    const rx = -hz, rz = hx;

    const plot = (p, color, shape, size) => {
        const relX = p.x - j.position.x, relZ = p.z - j.position.z;
        const x = 90 + ((relX * rx + relZ * rz) / 15000) * 90;
        const y = 90 - ((relX * hx + relZ * hz) / 15000) * 90;
        if (Math.hypot(x - 90, y - 90) > 85) return;
        c.fillStyle = color;
        if (shape === 'square') c.fillRect(x - size, y - size, size * 2, size * 2);
        else {
            const dy = p.y - j.position.y;
            c.beginPath();
            if (Math.abs(dy) > 200) {
                const s = dy > 0 ? -1 : 1;
                c.moveTo(x, y + s * size * 1.3); c.lineTo(x - size, y - s * size); c.lineTo(x + size, y - s * size);
            } else c.arc(x, y, size, 0, Math.PI * 2);
            c.fill();
        }
    };
    enemies.forEach(e => plot(e.position, e.userData.kind === 'bomber' ? '#ff8800' : e.userData.kind === 'drone' ? '#ffee33' : '#ff4444', 'circle', e.userData.kind === 'bomber' ? 4 : e.userData.kind === 'drone' ? 2 : 3));
    allies.forEach(a => plot(a.position, '#44ff44', 'circle', 3));
    enemyMissiles.forEach(m => plot(m.position, '#ff0000', 'circle', 2));
    world.targets.forEach(t => {
        const ty = t.userData.type;
        plot(t.position, ty === 'radar' ? '#ff0000' : ty === 'carrier' ? '#00ffff' : ty === 'destroyer' ? '#0099ff' : ty === 'cargo' ? '#ffcc00' : '#ffaa00',
            'square', ty === 'radar' || ty === 'carrier' ? 10 : ty === 'destroyer' || ty === 'cargo' ? 6 : 3);
    });
    world.defend.forEach(d => { if (!d.userData.dead) plot(d.position, '#44ff88', 'square', d.userData.type === 'carrier' ? 8 : 5); });
}

function drawSonar() {
    const c = ui.sctx;
    c.clearRect(0, 0, 130, 130);

    c.fillStyle = 'rgba(0, 30, 30, 0.8)';
    c.beginPath(); c.arc(65, 65, 63, 0, Math.PI * 2); c.fill();

    c.strokeStyle = 'rgba(0, 255, 204, 0.2)'; c.lineWidth = 1;
    [18, 36, 54].forEach(r => { c.beginPath(); c.arc(65, 65, r, 0, Math.PI * 2); c.stroke(); });

    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 4;
        c.beginPath();
        c.moveTo(65 + Math.cos(a) * 60, 65 + Math.sin(a) * 60);
        c.lineTo(65 - Math.cos(a) * 60, 65 - Math.sin(a) * 60);
        c.stroke();
    }

    game.sonarSweep = (game.sonarSweep + 0.02) % (Math.PI * 2);
    const sweepAngle = game.sonarSweep;
    const grad = c.createRadialGradient(65, 65, 0, 65, 65, 63);
    grad.addColorStop(0, 'rgba(0, 255, 204, 0.4)');
    grad.addColorStop(1, 'rgba(0, 255, 204, 0)');

    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(65, 65);
    c.arc(65, 65, 63, sweepAngle, sweepAngle + 0.8);
    c.closePath();
    c.fill();

    const allTargets = [];
    world.targets.forEach(t => allTargets.push({ pos: t.position, type: t.userData.type, ally: false }));

    allTargets.forEach(t => {
        const relX = t.pos.x - jetState.position.x;
        const relZ = t.pos.z - jetState.position.z;
        const dist = Math.hypot(relX, relZ);
        if (dist > 15000) return;

        const heading = Math.atan2(playerFwd.x, -playerFwd.z);
        const cosH = Math.cos(-heading), sinH = Math.sin(-heading);
        const rotX = relX * cosH - relZ * sinH;
        const rotZ = relX * sinH + relZ * cosH;

        const px = 65 + (rotX / 15000) * 60;
        const py = 65 + (rotZ / 15000) * 60;

        if (Math.hypot(px - 65, py - 65) > 60) return;

        if (t.type === 'carrier' || t.type === 'destroyer') {
            c.fillStyle = t.type === 'carrier' ? '#00ffff' : '#00aaff';
            c.beginPath();
            c.arc(px, py, t.type === 'carrier' ? 3.5 : 2, 0, Math.PI * 2);
            c.fill();

            const targetAngle = Math.atan2(py - 65, px - 65);
            const angleDiff = Math.abs(((targetAngle - sweepAngle + Math.PI) % (Math.PI * 2)) - Math.PI);
            if (angleDiff < 0.4) {
                c.strokeStyle = 'rgba(0, 255, 204, 0.8)';
                c.lineWidth = 1.5;
                c.beginPath();
                c.arc(px, py, 5 + Math.sin(performance.now() * 0.01) * 1.5, 0, Math.PI * 2);
                c.stroke();
            }
        }
    });

    c.fillStyle = '#7dffb0';
    c.beginPath(); c.arc(65, 65, 2.5, 0, Math.PI * 2); c.fill();

    c.strokeStyle = '#7dffb0';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(65, 65); c.lineTo(65, 55); c.stroke();
}

function updateHUD(dt) {
    const j = jetState;

    game.damageFlash -= dt * 2;
    const alert = (game.dangerAlert ? Math.sin(performance.now() * 0.01) * 0.2 + 0.2 : 0) + game.redout * 0.5;
    const a = Math.round(Math.max(0, game.damageFlash, alert) * 50) / 50;
    if (ui._dmg !== a) { ui._dmg = a; ui.damage.style.background = 'rgba(255,0,0,' + a + ')'; }

    const gTarget = game.blackout > 0 ? game.blackout : 0;
    if (ui._gload !== gTarget) { ui._gload = gTarget; ui.blackout.style.opacity = gTarget; }

    drawHorizon();

    game.hitMarker = Math.max(0, game.hitMarker - dt);
    const hm = game.hitMarker > 0 ? 1 : 0;
    if (ui._hm !== hm) { ui._hm = hm; ui.hitMarker.style.opacity = hm; }

    const tg = game.currentTarget;
    if (tg) {
        const sp = aimPoint(tg, _v1).project(camera);
        if (sp.z < 1) {
            setShow(ui.lock, true);
            ui.lock.style.left = ((sp.x * 0.5 + 0.5) * window.innerWidth).toFixed(0) + 'px';
            ui.lock.style.top = ((-sp.y * 0.5 + 0.5) * window.innerHeight).toFixed(0) + 'px';
            ui.lockBar.style.width = Math.max(0, tg.userData.hp / tg.userData.maxHp * 100).toFixed(0) + '%';
            setText(ui.lockText, 'LOCK ' + Math.round(game.targetDist) + ' m');
        } else setShow(ui.lock, false);
        ui.crosshair.style.borderColor = 'rgba(255,0,0,.8)';
    } else { setShow(ui.lock, false); ui.crosshair.style.borderColor = 'rgba(125,255,176,.4)'; }

    if (game.threat) {
        _v1.subVectors(game.threat, j.position).applyQuaternion(_q1.copy(j.quaternion).conjugate());
        let hour = Math.round(Math.atan2(_v1.x, -_v1.z) / (Math.PI / 6));
        if (hour <= 0) hour += 12;
        setText(ui.mslWarnText, '⚠ MISSILE ORE ' + hour + ' ⚠');
        setShow(ui.mslWarn, true);
        game.warnTimer -= dt;
        if (game.warnTimer <= 0) { playSound('warning'); game.warnTimer = 0.4; }
    } else setShow(ui.mslWarn, false);

    setShow(ui.rearmMsg, j.onGround && game.rearmTimer > 1.5 && (j.hp < 100 || j.fuel < 100 || j.ammoMissile < j.max.missile));

    game.showEngineWarning = Math.max(0, game.showEngineWarning - dt);
    setShow(ui.engineWarn, game.showEngineWarning > 0 && !game.engineStarted);

    const warns = [];
    const realFlight = FLIGHT[settings.flightModel].limitG;
    if (realFlight ? game.stalled : (!j.onGround && j.speed < CONFIG.jet.stallSpeed)) { warns.push('STALL'); if (Math.random() < 0.05) playSound('stall'); }
    if (game.gloc > 0) warns.push('G-LOC');
    if (j.fuel < 15) warns.push('COMBUSTIBILE BASSO');
    if (j.hp < CONFIG.jet.damagedHp) warns.push('DANNI CRITICI');
    setText(ui.warn, warns.join('\n'));

    const goals = MISSIONS[game.missionId].goals();
    for (let gi = 0; gi < 4; gi++) { const gn = ui['obj' + gi]; setText(gn, goals[gi] || ''); setShow(gn, !!goals[gi]); }
    setText(ui.score, 'SCORE: ' + game.score);

    const heading = ((Math.atan2(playerFwd.x, -playerFwd.z) * 180 / Math.PI) + 360) % 360;
    setText(ui.compassDir, ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(heading / 45) % 8]);
    setText(ui.compassDeg, Math.round(heading) + '°');

    const hours = (6 + game.time * 24) % 24;
    setText(ui.clock, 'ORA ' + String(Math.floor(hours)).padStart(2, '0') + ':' + String(Math.floor((hours % 1) * 60)).padStart(2, '0') + ' · ' + game.weatherName);

    const altFt = j.onGround ? 0 : Math.round(Math.max(0, j.position.y - 1.5) * 3.28084);
    setText(ui.wave, 'Ondata: ' + game.wave);
    setText(ui.speed, 'Speed = ' + Math.round(j.speed * 1.94384) + ' kts');
    setShow(ui.aoa, realFlight); setShow(ui.gforce, realFlight);
    setText(ui.aoa, 'AoA = ' + Math.round(j.aoa * 180 / Math.PI) + '°');
    setColor(ui.aoa, game.stalled ? '#ff4444' : '#7dffb0');
    setText(ui.alt, 'Alt = ' + altFt + ' ft' + (game.targetAltitude > 0 ? ' -> TGT: ' + game.targetAltitude : ''));
    setText(ui.engine, 'Engine = ' + Math.round(j.throttle * 100) + '%');
    setText(ui.fuel, 'Fuel = ' + Math.round(j.fuel) + '%');
    setColor(ui.fuel, j.fuel < 15 ? '#ff4444' : '#7dffb0');
    setText(ui.hull, 'HULL = ' + Math.round(j.hp) + '%');
    setColor(ui.hull, j.hp < CONFIG.jet.damagedHp ? '#ff4444' : '#7dffb0');
    setText(ui.gforce, 'G = ' + game.gForce.toFixed(1));
    setColor(ui.gforce, game.gForce > 7.5 ? '#ff4444' : '#7dffb0');

    setText(ui.wGun, 'GUN: ' + Math.floor(j.ammoGun));
    setText(ui.wMsl, 'MSL: ' + Math.floor(j.ammoMissile));
    setText(ui.wBmb, 'BMB: ' + Math.floor(j.ammoBomb));
    setText(ui.wClu, 'CLU: ' + Math.floor(j.ammoCluster));
    setText(ui.wFlr, 'FLARE: ' + Math.floor(j.flares));

    const hullPct = Math.round(j.hp);
    const fuelPct = Math.round(j.fuel);
    const hullText = hullPct + '%';
    if (ui.apHullVal.textContent !== hullText) ui.apHullVal.textContent = hullText;
    ui.apHullBar.style.width = hullPct + '%';
    ui.apHullBar.style.background = hullPct < 40 ? '#ff4444' : hullPct < 70 ? '#ffaa00' : '#7dffb0';

    const fuelText = fuelPct + '%';
    if (ui.apFuelVal.textContent !== fuelText) ui.apFuelVal.textContent = fuelText;
    ui.apFuelBar.style.width = fuelPct + '%';
    ui.apFuelBar.style.background = fuelPct < 15 ? '#ff4444' : fuelPct < 40 ? '#ffaa00' : '#7dffb0';

    const setWeaponCount = (node, val) => {
        const v = Math.floor(val);
        if (node.textContent !== String(v)) node.textContent = v;
        node.classList.toggle('empty', v === 0);
    };
    setWeaponCount(ui.apMsl, j.ammoMissile);
    setWeaponCount(ui.apBmb, j.ammoBomb);
    setWeaponCount(ui.apClu, j.ammoCluster);
    setWeaponCount(ui.apFlr, j.flares);

    if (game.damageFlash > 0.1) {
        ui.aircraftPanel.style.borderColor = 'rgba(255,68,68,' + Math.min(1, game.damageFlash * 2) + ')';
    } else {
        ui.aircraftPanel.style.borderColor = 'rgba(125,255,176,0.4)';
    }

    drawRadar();
    drawSonar();
}

// ============================================================
// 13. FLUSSO DI GIOCO
// ============================================================
const upgradeCost = id => 2000 * (save.upgrades[id] + 1);
function computeMaxAmmo() {
    const u = save.upgrades, m = jetState.max;
    m.gun = 1000 + 250 * u.gun; m.missile = 8 + 2 * u.missiles; m.bomb = 6; m.cluster = 4; m.flares = 10 + 3 * u.flares;
}
function refreshHangar() {
    setText(ui.credits, 'Crediti: ' + save.credits);
    UPGRADES.forEach(u => {
        const lv = save.upgrades[u.id], r = ui.upRows[u.id], cost = upgradeCost(u.id);
        r.lvl.textContent = lv + '/' + u.max;
        r.btn.textContent = lv >= u.max ? 'MAX' : 'ACQUISTA ' + cost;
        r.btn.disabled = lv >= u.max || save.credits < cost;
    });
}
function buyUpgrade(id) {
    const u = UPGRADES.find(x => x.id === id), cost = upgradeCost(id);
    if (save.upgrades[id] >= u.max || save.credits < cost) return;
    save.credits -= cost; save.upgrades[id]++;
    writeSave(); refreshHangar();
}
function selectMission(id) {
    game.missionId = id;
    for (const k in ui.missionBtns) ui.missionBtns[k].className = 'mbtn' + (k === id ? ' sel' : '');
    ui.missionDesc.textContent = MISSIONS[id].desc;
}

function clearEntities() {
    [bullets, enemyBullets, missiles, enemyMissiles, bombs, flares, enemies, allies].forEach(list => {
        list.forEach(o => { scene.remove(o); if (o.userData.ownMat) o.material.dispose(); });
        list.length = 0;
    });
    for (let i = fx.length - 1; i >= 0; i--) removeFx(i);
    timers.length = 0;
    PART.n = 0; partMesh.count = 0;
}

function resetGame() {
    const M = MISSIONS[game.missionId];
    clearEntities();
    buildTargets(M.kind);
    if (M.noAllySams) { world.allySams.forEach(o => scene.remove(o)); world.allySams.length = 0; }   // difesa: niente copertura SAM, la nave dipende da te
    if (M.friendly === 'convoy') buildTransports();
    if (M.defend === 'carrier' && allyCarrierObj) {
        allyCarrierObj.userData = { type: 'carrier', dead: false, hp: 100, maxHp: 100, box: { hx: ALLY_FOOT.hx, hy: DECK_Y / 2, hz: ALLY_FOOT.hz, cy: DECK_Y / 2 } };
        world.defend.push(allyCarrierObj);
    }
    computeMaxAmmo();
    const j = jetState;
    j.quaternion.identity(); j.speed = 0; j.throttle = 0; j.onGround = true;
    j.fuel = 100; j.hp = 100; j.ammoGun = j.max.gun; j.ammoMissile = j.max.missile; j.ammoBomb = j.max.bomb; j.ammoCluster = j.max.cluster; j.flares = j.max.flares;
    j.aoa = 0;
    for (const k in cool) cool[k] = 0;
    const pool = WEATHER.filter(x => x.v <= (M.maxWeather !== undefined ? M.maxWeather : 1));
    const w = pool[Math.floor(Math.random() * pool.length)];
    Object.assign(game, {
        score: 0, wave: 0, enemiesToSpawn: 0, spawnTimer: 0, waveBreak: M.start, waveMsgTimer: 0, spawnQueue: [], waveDone: false,
        time: M.time, weather: w.v, weatherName: w.name,
        damageFlash: 0, hitMarker: 0, shake: 0, dangerAlert: false, threat: null,
        rearmTimer: 0, smokeTimer: 0, targetAltitude: -1, manualThrottle: false, currentTarget: null,
        alliesSpawned: false, deathReason: '', mission: { radar: false, carriers: 0, destroyers: 0, cargo: 0, carrierHp: 100, facilities: 0, sams: 0 },
        gForce: 1, gLoad: 0, blackout: 0, aoa: 0, stalled: false, gStress: 0, redout: 0, gloc: 0,
        engineStarted: false, engineSpool: 0, flaps: 0, gear: true, showEngineWarning: 0,
        sonarSweep: 0
    });
    jetPivot.visible = true;
    kb.pitch = kb.roll = kb.yaw = 0;
    setShow(ui.waveMsg, false);
    ui.blackout.style.opacity = 0; ui._gload = 0;
    ui.btnEngine.classList.remove('active');
    ui.btnEngine.innerHTML = '<div class="icon">🔌</div>AVVIA';
    ui.btnFlaps.classList.remove('active');
    ui.btnGear.classList.add('active');
}

function startMission(from) {
    initAudio();
    resetGame();
    if (from === 'carrier') {
        jetState.position.set(AC.x, DECK_Y + 0.1, AC.z + 220);
    } else {
        jetState.position.set(COOP_SPAWNS[0][0], CONFIG.world.islandHeight + 0.35, COOP_SPAWNS[0][1]);
    }
    ui.menu.style.display = 'none'; ui.over.style.display = 'none'; ui.pause.style.display = 'none';
    game.state = 'playing';
    ui.waveMsg.innerHTML = MISSIONS[game.missionId].title + '<br><span style="font-size:20px">Premi AVVIA MOTORE o il tasto S</span>';
    setShow(ui.waveMsg, true); game.waveMsgTimer = 4;
}

function showMenu() {
    game.state = 'menu';
    ui.over.style.display = 'none';
    selectMission(game.missionId);
    refreshHangar();
    ui.menuBest.textContent = 'Record: ' + save.best + '   |   Crediti: ' + save.credits;
    ui.menu.style.display = 'flex';
}

function endGame(victory) {
    game.state = victory ? 'victory' : 'gameover';
    if (!victory) { jetPivot.visible = false; createExplosion(jetState.position, 25); }
    const earned = Math.round(game.score * 0.2) + (victory ? 3000 : 0);   // crediti per l'hangar
    save.credits += earned;
    if (game.score > save.best) save.best = game.score;
    game.best = save.best;
    writeSave();
    ui.overTitle.textContent = victory ? 'MISSIONE COMPIUTA' : 'MISSIONE FALLITA';
    ui.overTitle.style.color = victory ? '#44ff44' : '#ff4444';
    ui.overReason.textContent = victory ? MISSIONS[game.missionId].title + ': obiettivi raggiunti.' : (game.deathReason || 'Velivolo abbattuto');
    ui.overScore.textContent = 'Punteggio finale: ' + game.score;
    ui.overBest.textContent = 'Record: ' + save.best;
    ui.overCredits.textContent = 'Crediti guadagnati: ' + earned + ' (totale ' + save.credits + ')';
    ui.over.style.display = 'flex';
    setShow(ui.lock, false); setShow(ui.mslWarn, false); setShow(ui.rearmMsg, false);
    ui.blackout.style.opacity = 0; ui._gload = 0;
}

function togglePause() {
    if (game.state === 'playing') {
        game.state = 'paused'; ui.pause.style.display = 'flex';
        if (audio.ctx) audio.ctx.suspend();
    } else if (game.state === 'paused') {
        game.state = 'playing'; ui.pause.style.display = 'none';
        if (audio.ctx) audio.ctx.resume();
    }
}

// ============================================================
// 14. CARICAMENTO ASSET
// ============================================================
const loader = new THREE.GLTFLoader();
let assetsReady = 0;
const ASSETS_TOTAL = 2 + (CONFIG.shipModels.enabled ? 2 : 0);

function onAllAssetsReady() {
    console.log('[LOADER] Tutti gli asset caricati. Costruisco il mondo.');
    buildTargets();
    ui.menuStatus.textContent = '';
    ui.btnBase.disabled = false;
    ui.btnCarrier.disabled = false;
    showMenu();
}

// --- F-35 ---
loader.load(
    CONFIG.modelPath,
    gltf => {
        console.log('[LOADER] F-35 caricato.');
        jetTemplate = prepareModel(gltf.scene);
        jetPivot.add(getJetTemplate(null).clone(true));
        flame.position.z = jetTailZ;
        assetsReady++;
        if (assetsReady >= ASSETS_TOTAL) onAllAssetsReady();
    },
    undefined,
    err => {
        console.error('[LOADER] Errore F-35:', err);
        jetTemplate = buildFallbackJet();
        jetTailZ = 6;
        jetPivot.add(getJetTemplate(null).clone(true));
        flame.position.z = jetTailZ;
        ui.menuStatus.textContent = 'F-35 non trovato: uso un jet semplificato.';
        assetsReady++;
        if (assetsReady >= ASSETS_TOTAL) onAllAssetsReady();
    }
);

// --- PORTAEREI (template globale) ---
loader.load(
    CONFIG.carrierModelPath,
    gltf => {
        console.log('[LOADER] Portaerei caricata.');
        carrierTemplate = prepareCarrierModel(gltf.scene, CONFIG.carrierLength);
        carrierDeckY = carrierTemplate.userData.deckY;

        // Calcola DECK_Y globale per la portaerei alleata (scalata di AC.scale)
        DECK_Y = carrierDeckY * AC.scale;

        // Aggiungi la portaerei ALLEATA alla scena (in posizione AC, scala AC.scale)
        const ally = carrierTemplate.clone(true);
        ally.traverse(n => {
            if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; }
        });
        ally.position.set(AC.x, 0, AC.z);
        ally.scale.setScalar(AC.scale);
        scene.add(ally);
        allyCarrierObj = ally;
        { const sz = carrierTemplate.userData.size; ALLY_FOOT = { hx: sz.x * AC.scale / 2, hz: sz.z * AC.scale / 2 }; addFoam(ally, sz.x, sz.z, 0); }

        console.log('[LOADER] Portaerei alleata posizionata a', AC.x, AC.z, 'scale', AC.scale);
        console.log('[LOADER] DECK_Y (con scala AC):', DECK_Y.toFixed(2));

        assetsReady++;
        if (assetsReady >= ASSETS_TOTAL) onAllAssetsReady();
    },
    undefined,
    err => {
        console.error('[LOADER] Errore portaerei:', err);
        ui.menuStatus.textContent = 'Portaerei non trovata: uso il modello base.';
        carrierTemplate = makeCarrierSimple(0, 0, 1, false); 
        scene.remove(carrierTemplate);
        carrierDeckY = 31;
        DECK_Y = 31 * AC.scale;
        allyCarrierObj = makeCarrierSimple(AC.x, AC.z, AC.scale, false);
        assetsReady++;
        if (assetsReady >= ASSETS_TOTAL) onAllAssetsReady();
    }
);

// --- Navi opzionali (.glb) ---
if (CONFIG.shipModels.enabled) {
    ['destroyer', 'cargo'].forEach(kind => {
        const cfg = CONFIG.shipModels[kind];
        loader.load(cfg.path,
            gltf => { shipTemplates[kind] = normalizeShipModel(gltf.scene, cfg.yaw); assetsReady++; if (assetsReady >= ASSETS_TOTAL) onAllAssetsReady(); },
            undefined,
            () => { console.warn('[LOADER] Modello nave non trovato, uso quello procedurale:', cfg.path); assetsReady++; if (assetsReady >= ASSETS_TOTAL) onAllAssetsReady(); });
    });
}

// ============================================================
// 15. LOOP PRINCIPALE
// ============================================================
let last = performance.now();

function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05) || 0.016;
    last = now;
    pollPad();

    if (game.state === 'playing') {
        updateTimers(dt);
        updateEnvironment(dt);
        updatePlayer(dt);
        updateWaves(dt);
        updateEnemies(dt);
        updateAllies(dt);
        updateGroundDefenses(dt);
        updateMovers(dt);
        updateBullets(dt);
        updateMissiles(dt);
        updateBombs(dt);
        updateFlares(dt);
        updateFx(dt);
        updateParticles(dt);
        updateSinking(dt);
        updateCamera(dt);
        updateTargeting();
        updateAudio();
        updateHUD(dt);

        const M = MISSIONS[game.missionId];
        if (jetState.hp <= 0) endGame(false);
        else if (M.lost && M.lost()) endGame(false);
        else if (M.won()) endGame(true);
    } else if (game.state === 'gameover' || game.state === 'victory') {
        updateTimers(dt); updateFx(dt); updateParticles(dt); updateSinking(dt); updateAudio();
    }
    renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});