/* Mobile controls for F-35. Runs after game.js (classic script). */
(() => {
 const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
 if (!touchDevice) return;
 document.documentElement.classList.add('touch-device');
 renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
 renderer.shadowMap.enabled = false;
 const root = document.createElement('div'); root.id='mobile-controls';
 root.innerHTML = `<div id="mobile-stick" aria-label="Joystick di volo"><div id="mobile-knob"></div><span>VOLO</span></div>
 <div id="mobile-throttle"><button data-hold="thrUp">＋</button><span>SPINTA</span><button data-hold="thrDown">－</button></div>
 <div id="mobile-actions"><button data-action="missile">🚀<small>MISSILE</small></button><button data-action="flare">✳<small>FLARE</small></button><button data-hold="fire" class="fire">◎<small>CANNONE</small></button><button data-action="bomb">💣<small>BOMBA</small></button><button data-action="cluster">✹<small>CLUSTER</small></button><button data-hold="brake">▣<small>FRENO</small></button></div>
 <div id="mobile-top"><button data-action="pause">Ⅱ PAUSA</button><button data-action="engine">MOTORE</button><button data-action="gear">CARRELLO</button><button data-action="flaps">FLAP</button><button data-action="yawLeft">↶</button><button data-action="yawRight">↷</button></div>`;
 document.body.appendChild(root);
 const stick=root.querySelector('#mobile-stick'), knob=root.querySelector('#mobile-knob');
 let stickPointer=null;
 function resetStick(){stickPointer=null; mobileInput.pitch=0; mobileInput.roll=0; knob.style.transform='translate(0px,0px)';}
 function moveStick(e){const r=stick.getBoundingClientRect(), radius=Math.min(r.width,r.height)*.36;let x=(e.clientX-(r.left+r.width/2))/radius,y=(e.clientY-(r.top+r.height/2))/radius;const mag=Math.hypot(x,y);if(mag>1){x/=mag;y/=mag;} mobileInput.roll=x;mobileInput.pitch=y;knob.style.transform=`translate(${x*radius}px,${y*radius}px)`;}
 stick.addEventListener('pointerdown',e=>{e.preventDefault();if(stickPointer!==null)return;stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);moveStick(e);});
 stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)moveStick(e);});
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(ev,e=>{if(e.pointerId===stickPointer)resetStick();});
 const actions={missile:()=>fireMissile(),flare:()=>dropFlare(),bomb:()=>dropBomb(false),cluster:()=>dropBomb(true),pause:()=>togglePause(),engine:()=>{if(game.state!=='playing')return;initAudio();startEngine();updateEngineButton();},gear:()=>toggleGear(),flaps:()=>toggleFlaps(),yawLeft:()=>{mobileInput.yaw=-1;setTimeout(()=>mobileInput.yaw=0,250);},yawRight:()=>{mobileInput.yaw=1;setTimeout(()=>mobileInput.yaw=0,250);}};
 const engineButton=root.querySelector('[data-action="engine"]');
 function updateEngineButton(){const on=game.state==='playing'&&game.engineStarted; engineButton.textContent=on?'✓ ACCESO':'⏻ MOTORE'; engineButton.classList.toggle('engine-on',on); engineButton.setAttribute('aria-pressed',String(on));}
 root.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.dataset.action==='pause'||game.state==='playing')actions[b.dataset.action]();}));
 root.querySelectorAll('[data-hold]').forEach(b=>{const name=b.dataset.hold;const release=()=>{mobileInput[name]=false;b.classList.remove('pressed');};b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);mobileInput[name]=true;b.classList.add('pressed');});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>b.addEventListener(ev,release));});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){resetStick();Object.keys(mobileInput).forEach(k=>mobileInput[k]=k==='pitch'||k==='roll'||k==='yaw'?0:false);}});
 const refresh=()=>{root.classList.toggle('in-game',game.state==='playing');updateEngineButton();};
 setInterval(refresh,200);refresh();
 const rotate=document.createElement('div');rotate.id='rotate-notice';rotate.innerHTML='<div>↻</div>Ruota lo smartphone in orizzontale<br><small>F-35 Flight Simulator</small>';document.body.appendChild(rotate);
 window.addEventListener('contextmenu',e=>e.preventDefault());
})();
