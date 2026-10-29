/* F-35 COOP alpha: multiplayer di posizione, non ancora missioni o danni condivisi. */
(() => {
'use strict';
const style=document.createElement('style');style.textContent=`
#coopOpen{position:fixed;bottom:55px;right:12px;z-index:115;background:#123d4e;color:#b8ffe1;border:1px solid #75d5ac;border-radius:9px;padding:8px 12px;font:bold 12px sans-serif;cursor:pointer}
#coopPanel{position:fixed;inset:0;z-index:150;display:none;align-items:center;justify-content:center;background:#06151de8;font:14px system-ui;color:#e3fff6;padding:15px;box-sizing:border-box}
#coopCard{background:#0e2d3d;border:1px solid #49978b;border-radius:15px;max-width:470px;width:100%;padding:20px;display:grid;gap:12px;max-height:90vh;overflow:auto}
#coopCard input{background:#0b202c;border:1px solid #6a9b9d;border-radius:7px;color:white;padding:10px;width:100%;box-sizing:border-box}
#coopCard button{background:#176759;border:1px solid #72bca7;border-radius:7px;color:white;padding:10px;cursor:pointer}
#coopCard button:disabled{opacity:.4} #coopStatus{white-space:pre-wrap;color:#b4dbd9} #coopRoster{color:#dcfff1}
`;document.head.appendChild(style);
const btn=document.createElement('button');btn.id='coopOpen';btn.textContent='✈ STANZA AMICI';document.body.appendChild(btn);
const panel=document.createElement('div');panel.id='coopPanel';panel.innerHTML=`<div id="coopCard"><h2 style="margin:0;color:#a5fbd4">SQUADRIGLIA F-35 · ALPHA</h2><small>Stanze private, fino a 6 piloti. In questa fase sono sincronizzati soltanto gli aerei, non i bersagli e i danni.</small><label>Server WebSocket (wss://...)<input id="coopUrl" placeholder="wss://tuo-server.example" autocomplete="off" /></label><label>Nome pilota<input id="coopName" maxlength="20" placeholder="Maverick" /></label><div style="display:flex;gap:8px"><button id="coopCreate">Crea stanza</button><input id="coopCode" maxlength="8" placeholder="CODICE" style="flex:1;width:35%"><button id="coopJoin">Entra</button></div><div id="coopStatus">Nessuna connessione. Occorre pubblicare il server incluso nello ZIP.</div><div id="coopRoster"></div><button id="coopStart" disabled>AVVIA VOLO DI SQUADRA (HOST)</button><button id="coopClose">Chiudi</button></div>`;document.body.appendChild(panel);
const $=id=>document.getElementById(id);let sock=null, myId=null, room=null, amHost=false, slot=0, sent=0;
const peers=new Map();let running=false;
$('coopUrl').value=localStorage.getItem('f35_server_url')||'';
$('coopName').value=localStorage.getItem('f35_pilot')||'Pilota';
btn.onclick=()=>panel.style.display='flex';$('coopClose').onclick=()=>panel.style.display='none';
const setStatus=s=>$('coopStatus').textContent=s;
function send(obj){if(sock&&sock.readyState===1)sock.send(JSON.stringify(obj));}
function connect(action){
 const endpoint=$('coopUrl').value.trim(), name=$('coopName').value.trim().slice(0,20)||'Pilota';
 if(!/^wss:\/\//i.test(endpoint) && !(/^ws:\/\/localhost(:\d+)?$/i.test(endpoint))){setStatus('Inserisci un URL wss:// pubblico. ws://localhost è consentito solo per test locali.');return;}
 localStorage.setItem('f35_server_url',endpoint);localStorage.setItem('f35_pilot',name);
 if(sock) sock.close();setStatus('Connessione al server...');sock=new WebSocket(endpoint);
 sock.onopen=()=>send({type:action,name,code:$('coopCode').value.trim().toUpperCase()});
 sock.onclose=()=>setStatus('Connessione chiusa. Premi Crea o Entra per riconnetterti.');
 sock.onerror=()=>setStatus('Server irraggiungibile. Verifica che il servizio WebSocket sia online.');
 sock.onmessage=ev=>{let m;try{m=JSON.parse(ev.data)}catch{return;}
 if(m.type==='error'){setStatus(m.message);return;}
 if(m.type==='room'){room=m.code;myId=m.id;slot=m.slot;amHost=m.host;setStatus('STANZA '+room+' · Invita i tuoi amici con questo codice');$('coopCode').value=room;}
 if(m.type==='roster'){amHost=m.hostId===myId;$('coopStart').disabled=!amHost;$('coopRoster').textContent=m.players.map(p=>'#'+(p.slot+1)+' '+p.name+(p.id===myId?' (tu)':'')).join('  ·  ');for(const [id,obj] of peers){if(!m.players.some(p=>p.id===id)){scene.remove(obj.mesh);peers.delete(id);}}}
 if(m.type==='launch'){
  // Partenza in piazzole diverse: stessa mappa, fisica locale.
  startMission('base');jetState.position.set(COOP_SPAWNS[slot][0],CONFIG.world.islandHeight+jetGroundClearance,COOP_SPAWNS[slot][1]);
  panel.style.display='none';running=true;setStatus('Volo di squadra avviato (alpha)');
 }
 if(m.type==='states' && running){for(const p of m.players){if(p.id===myId)continue; if(!peers.has(p.id)){
   const mesh=new THREE.Group();const body=new THREE.Mesh(new THREE.ConeGeometry(9,24,4),new THREE.MeshStandardMaterial({color:0x52e8bf}));body.rotation.x=-Math.PI/2;mesh.add(body);
   const wing=new THREE.Mesh(new THREE.BoxGeometry(28,1.5,6),new THREE.MeshStandardMaterial({color:0x8ffff0}));mesh.add(wing);scene.add(mesh);peers.set(p.id,{mesh});
  }const e=peers.get(p.id),t=p.state;if(t&&Array.isArray(t.p)&&Array.isArray(t.q)) {e.mesh.position.set(t.p[0],t.p[1],t.p[2]);e.mesh.quaternion.set(t.q[0],t.q[1],t.q[2],t.q[3]);}}
 }
 };
}
$('coopCreate').onclick=()=>connect('create');$('coopJoin').onclick=()=>connect('join');
$('coopStart').onclick=()=>send({type:'launch'});
function tick(now){requestAnimationFrame(tick);if(!running||!room||game.state!=='playing'||!sock||sock.readyState!==1||now-sent<70)return;
 sent=now;const p=jetState.position,q=jetState.quaternion;
 send({type:'state',p:[p.x,p.y,p.z],q:[q.x,q.y,q.z,q.w]});}
requestAnimationFrame(tick);
})();
