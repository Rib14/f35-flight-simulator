/* Mobile controls for F-35. Runs after game.js (classic script). */
(() => {
 const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
 if (!touchDevice) return;
 document.documentElement.classList.add('touch-device');
 renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
 renderer.shadowMap.enabled = false;
 const root = document.createElement('div'); root.id='mobile-controls';
 root.innerHTML = `<div id="mobile-stick" aria-label="Joystick di volo"><div id="mobile-knob"></div><span>VOLO</span></div>
 <div id="mobile-yaw" aria-label="Controllo imbardata"><button type="button" data-yaw="left" aria-label="Imbardata a sinistra">←</button><button type="button" data-yaw="right" aria-label="Imbardata a destra">→</button></div>
 <div id="mobile-throttle"><button data-hold="thrUp">＋</button><span>SPINTA</span><button data-hold="thrDown">－</button></div>
 <div id="mobile-actions"><button data-action="missile">🚀<small>MISSILE</small></button><button data-action="flare">✳<small>FLARE</small></button><button data-hold="fire" class="fire">◎<small>CANNONE</small></button><button data-action="bomb">💣<small>BOMBA</small></button><button data-action="cluster">✹<small>CLUSTER</small></button><button data-hold="brake">▣<small>FRENO</small></button></div>
 <div id="mobile-top"><button data-action="pause">Ⅱ PAUSA</button><button data-action="engine">MOTORE</button><button data-action="gear">CARRELLO</button><button data-action="flaps">FLAP</button><button data-action="fullscreen" aria-label="Schermo intero">⛶</button></div>`;
 document.body.appendChild(root);
 const stick=root.querySelector('#mobile-stick'), knob=root.querySelector('#mobile-knob');
 let stickPointer=null;
 function resetStick(){stickPointer=null; mobileInput.pitch=0; mobileInput.roll=0; knob.style.transform='translate(0px,0px)';}
 function moveStick(e){const r=stick.getBoundingClientRect(), radius=Math.min(r.width,r.height)*.36;let x=(e.clientX-(r.left+r.width/2))/radius,y=(e.clientY-(r.top+r.height/2))/radius;const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag;} mobileInput.roll=x;mobileInput.pitch=y;knob.style.transform=`translate(${x*radius}px,${y*radius}px)`;}
 stick.addEventListener('pointerdown',e=>{e.preventDefault();if(stickPointer!==null)return;stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
 stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(ev,e=>{if(e.pointerId===stickPointer)resetStick();});
 const actions={missile:()=>fireMissile(),flare:()=>dropFlare(),bomb:()=>dropBomb(false),cluster:()=>dropBomb(true),pause:()=>togglePause(),engine:()=>{if(game.state!=='playing')return;initAudio();startEngine();updateEngineButton();},gear:()=>toggleGear(),flaps:()=>toggleFlaps(),fullscreen:async()=>{if(document.fullscreenElement){await document.exitFullscreen().catch(()=>{});return;}if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();return;}catch(e){}}showInstallHelp();}};
 const installHelp=document.createElement('div');installHelp.id='install-help';installHelp.innerHTML='<div class="install-dialog"><button id="install-close" aria-label="Chiudi">×</button><strong>Gioca a tutto schermo</strong><p>Su iPhone: apri questa pagina in Safari, tocca <b>Condividi</b> (quadrato con freccia), poi <b>Aggiungi alla schermata Home</b>. Apri il gioco dalla nuova icona, non dalla scheda Safari.</p><p>Su Android: usa il menu del browser e scegli <b>Installa app</b> oppure <b>Aggiungi a schermata Home</b>.</p></div>';document.body.appendChild(installHelp);installHelp.querySelector('#install-close').addEventListener('click',()=>installHelp.classList.remove('show'));installHelp.addEventListener('click',e=>{if(e.target===installHelp)installHelp.classList.remove('show')});function showInstallHelp(){installHelp.classList.add('show');}
 const engineButton=root.querySelector('[data-action="engine"]');
 function updateEngineButton(){const on=game.state==='playing'&&game.engineStarted; engineButton.textContent=on?'✓ ACCESO':'⏻ MOTORE'; engineButton.classList.toggle('engine-on',on); engineButton.setAttribute('aria-pressed',String(on));}
 root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.dataset.action==='pause'||game.state==='playing')actions[b.dataset.action]();}));
 // Hold-to-yaw controls: release immediately when the finger lifts, including cancelled touches.
 const yawButtons = root.querySelectorAll('[data-yaw]');
 const yawHeld = new Set();
 function syncYaw(){mobileInput.yaw=yawHeld.has('left')&&!yawHeld.has('right')?-1:yawHeld.has('right')&&!yawHeld.has('left')?1:0;}
 function resetYaw(){yawHeld.clear();syncYaw();yawButtons.forEach(b=>b.classList.remove('pressed'));}
 yawButtons.forEach(b=>{
   const dir=b.dataset.yaw;
   b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);yawHeld.add(dir);b.classList.add('pressed');syncYaw();});
   const release=()=>{yawHeld.delete(dir);b.classList.remove('pressed');syncYaw();};
   for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,release);
 });
 root.querySelectorAll('[data-hold]').forEach(b=>{const name=b.dataset.hold;const release=()=>{mobileInput[name]=false;b.classList.remove('pressed');};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);mobileInput[name]=true;b.classList.add('pressed');});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,release));});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){resetStick();resetYaw();Object.keys(mobileInput).forEach(k=>mobileInput[k]=k==='pitch'||k==='roll'||k==='yaw'?0:false);}});
 const refresh=()=>{root.classList.toggle('in-game',game.state==='playing');updateEngineButton();};
 setInterval(refresh,200);refresh();
 const rotate=document.createElement('div');rotate.id='rotate-notice';rotate.innerHTML='<div>↻</div>Ruota lo smartphone in orizzontale<br><small>F-35 Flight Simulator</small>';document.body.appendChild(rotate);
 window.addEventListener('contextmenu',e=>e.preventDefault());
})();
