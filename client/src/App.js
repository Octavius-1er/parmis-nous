// ASSETS loaded globally
const IMGS = {};
function loadAssets() {
  const load = (key, src) => { const img = new Image(); img.src = src; IMGS[key] = img; };
  load("floor",   "/floor.png");
  load("emrg",    "/emergency.png");
}
loadAssets();

import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './style/App.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://parmis-nous.onrender.com';

// ═══════ WORLD ════════════════════════════════════════════════════════════════
const WORLD_W    = 2800;
const WORLD_H    = 1700;
const SPEED      = 3.2;
const VISION_R   = 310;   // fog of war radius (world px)
const NEAR_DIST  = 70;    // interact distance
const EMRG_POS   = { x:820, y:240 }; // emergency button in cafeteria

// ═══════ COLORS ══════════════════════════════════════════════════════════════
const CHX = {
  red:'#c51111', blue:'#132ed1', green:'#117f2d', purple:'#6b2fbb',
  yellow:'#f5f557', orange:'#ef7d0d', pink:'#ec54bb', white:'#d7e1f1',
  brown:'#71491e', cyan:'#38fedc', lime:'#50ef39', maroon:'#6b2737',
};

// ═══════ MAP ═════════════════════════════════════════════════════════════════
// Rooms: col = floor color, name = label
const ROOMS = [
  { x:100,  y:100,  w:220, h:200, col:'#0d2212', name:'Moteur ↑'  },
  { x:100,  y:480,  w:200, h:320, col:'#0c1025', name:'Réacteur'   },
  { x:100,  y:1020, w:220, h:200, col:'#0d2212', name:'Moteur ↓'  },
  { x:360,  y:500,  w:220, h:200, col:'#0d1f1f', name:'Sécurité'   },
  { x:360,  y:820,  w:220, h:200, col:'#1a1600', name:'Électrique' },
  { x:360,  y:1040, w:220, h:185, col:'#0d1a12', name:'Médical'    },
  { x:580,  y:80,   w:460, h:300, col:'#141420', name:'Cafétéria'  },
  { x:660,  y:460,  w:200, h:185, col:'#0d1a0d', name:'O₂'         },
  { x:1160, y:80,   w:290, h:245, col:'#1e0d0d', name:'Armement'   },
  { x:1560, y:80,   w:285, h:285, col:'#0d0d1e', name:'Navigation' },
  { x:1160, y:480,  w:265, h:205, col:'#0d1e0d', name:'Admin'      },
  { x:1000, y:720,  w:365, h:300, col:'#131318', name:'Stockage'   },
  { x:800,  y:1100, w:245, h:205, col:'#0d0d1e', name:'Comm.'      },
  { x:1480, y:900,  w:225, h:265, col:'#1a0d1a', name:'Boucliers'  },
];
const CORRIDORS = [
  { x:140,  y:300,  w:145, h:180 },
  { x:140,  y:800,  w:145, h:220 },
  { x:320,  y:140,  w:265, h:100 },
  { x:280,  y:960,  w:100, h:65  },
  { x:280,  y:540,  w:85,  h:125 },
  { x:580,  y:540,  w:85,  h:80  },
  { x:660,  y:375,  w:125, h:90  },
  { x:1040, y:115,  w:130, h:140 },
  { x:1445, y:115,  w:125, h:100 },
  { x:1300, y:295,  w:100, h:195 },
  { x:1115, y:680,  w:90,  h:65  },
  { x:1360, y:855,  w:130, h:60  },
  { x:900,  y:1015, w:125, h:100 },
  { x:575,  y:855,  w:445, h:80  },
  { x:435,  y:375,  w:165, h:125 },
];
const ALL_FLOORS = [...ROOMS, ...CORRIDORS];

// ═══════ TASKS ═══════════════════════════════════════════════════════════════
const TASKS_DEF = [
  { id:'wires1',    name:'Réparer fils',     x:430,  y:900,  type:'wires'    },
  { id:'wires2',    name:'Réparer fils',     x:1320, y:820,  type:'wires'    },
  { id:'cards',     name:'Glisser carte',    x:1235, y:560,  type:'swipe'    },
  { id:'asteroids', name:'Astéroïdes',       x:1295, y:170,  type:'asteroids'},
  { id:'nav1',      name:'Navigation',       x:1660, y:200,  type:'download' },
  { id:'fuel1',     name:'Ravitailler ↑',    x:165,  y:185,  type:'fuel'     },
  { id:'fuel2',     name:'Ravitailler ↓',    x:165,  y:1105, type:'fuel'     },
  { id:'med',       name:'Scanner médical',  x:455,  y:1115, type:'numpad'   },
  { id:'reactor1',  name:'Réacteur',         x:165,  y:640,  type:'download' },
  { id:'shields1',  name:'Boucliers',        x:1575, y:1025, type:'wires'    },
  { id:'o2fix',     name:'Réparer O₂',       x:745,  y:545,  type:'numpad'   },
  { id:'comms1',    name:'Réparer comm.',    x:910,  y:1195, type:'download' },
];
const QUICK_CHAT = [
  "C'est moi, équipage !","J'ai vu quelqu'un tuer !","J'avais un alibi.",
  "C'est l'imposteur !","Je suis innocent !","On se regroupe !",
  "Où étais-tu ?","C'est suspect…","Tâches finies !","Quelqu'un m'a suivi.",
  "Je n'ai rien vu.","Passer le vote",
];

// ═══════ SOUNDS ══════════════════════════════════════════════════════════════
let _ac = null;
function snd(type) {
  try {
    if (!_ac) _ac = new (window.AudioContext||window.webkitAudioContext)();
    if (_ac.state==='suspended') _ac.resume();
    const c=_ac, t=c.currentTime;
    const tone=(f,s,d,v=0.18,w='sine')=>{
      const o=c.createOscillator(),g=c.createGain();
      o.type=w; o.frequency.setValueAtTime(f,t+s);
      g.gain.setValueAtTime(v,t+s); g.gain.exponentialRampToValueAtTime(.001,t+s+d);
      o.connect(g); g.connect(c.destination); o.start(t+s); o.stop(t+s+d+.01);
    };
    if(type==='btn')    tone(330,0,.08,.1);
    if(type==='task')   [523,659,784].forEach((f,i)=>tone(f,i*.12,.2,.18));
    if(type==='kill')   [220,110,55].forEach((f,i)=>tone(f,i*.12,.4,.3,'sawtooth'));
    if(type==='meet')   {for(let i=0;i<8;i++)tone(i%2?880:660,i*.13,.12,.25);}
    if(type==='vote')   tone(440,0,.12,.15);
    if(type==='imp')    [110,92,73].forEach((f,i)=>tone(f,i*.22,.55,.28,'sawtooth'));
    if(type==='crew')   [523,659].forEach((f,i)=>tone(f,i*.22,.4,.2));
    if(type==='eject')  {
      const o=c.createOscillator(),g=c.createGain();
      o.frequency.setValueAtTime(200,t); o.frequency.exponentialRampToValueAtTime(20,t+2.5);
      g.gain.setValueAtTime(.3,t); g.gain.exponentialRampToValueAtTime(.001,t+2.5);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t+2.6);
    }
    if(type==='win')  [523,659,784,1047].forEach((f,i)=>tone(f,i*.15,.5,.2));
    if(type==='lose') [300,220,165].forEach((f,i)=>tone(f,i*.2,.6,.2,'sawtooth'));
  } catch(e){}
}

// ═══════ CANVAS DRAW HELPERS ═════════════════════════════════════════════════
function rRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  const rr=Math.min(r,w/2,h/2);
  ctx.moveTo(x+rr,y); ctx.lineTo(x+w-rr,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+rr);
  ctx.lineTo(x+w,y+h-rr);
  ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
  ctx.lineTo(x+rr,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-rr);
  ctx.lineTo(x,y+rr);
  ctx.quadraticCurveTo(x,y,x+rr,y);
  ctx.closePath();
}

function drawAstro(ctx, x, y, col, sz=36, dead=false, isMe=false, ring=false) {
  const c = CHX[col] || '#c51111';
  const s = sz / 36;
  ctx.save();
  ctx.translate(x, y - sz * 0.1);
  ctx.scale(s, s);

  const fill=(fc,sc,fn)=>{
    ctx.fillStyle=fc; ctx.strokeStyle=sc||'rgba(0,0,0,.75)';
    ctx.lineWidth=1.8/s; ctx.beginPath(); fn(); ctx.fill(); ctx.stroke();
  };

  if (ring) {
    ctx.strokeStyle='rgba(255,230,0,.85)'; ctx.lineWidth=2.5/s;
    ctx.beginPath(); ctx.arc(0,4,24,0,Math.PI*2); ctx.stroke();
  }
  if (isMe) {
    ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1.5/s;
    ctx.setLineDash([4/s,4/s]);
    ctx.beginPath(); ctx.arc(0,4,26,0,Math.PI*2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Backpack
  fill(c,null,()=>ctx.rect(11,-3,9,12));
  // Body
  fill(c,null,()=>ctx.ellipse(0,7,12,12,0,0,Math.PI*2));
  // Head
  fill(c,null,()=>ctx.ellipse(0,-5,10,11,0,0,Math.PI*2));
  // Visor bg
  fill('#1a3a9c','rgba(80,180,255,.4)',()=>ctx.ellipse(3,-7,7,5,0,0,Math.PI*2));
  // Visor shine
  fill('#2a5aec',false,()=>ctx.ellipse(1,-9,5,3.5,0,0,Math.PI*2));
  ctx.fillStyle='rgba(180,235,255,.7)'; ctx.beginPath(); ctx.ellipse(-1,-11,2,1.2,0,0,Math.PI*2); ctx.fill();
  // Feet
  fill(c,null,()=>{rRect(ctx,-9,17,6,5,2.5);});
  fill(c,null,()=>{rRect(ctx,2,17,6,5,2.5);});

  if (dead) {
    ctx.strokeStyle='#e00'; ctx.lineWidth=2.5/s;
    ctx.beginPath(); ctx.moveTo(-4,-11); ctx.lineTo(2,-5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2,-11); ctx.lineTo(-4,-5); ctx.stroke();
  }
  ctx.restore();
}

function drawMap(ctx) {
  const floorImg = IMGS.floor;
  const tileSize = 60;

  ALL_FLOORS.forEach(f => {
    // Draw base color
    ctx.fillStyle = f.col || '#0a0a18';
    ctx.beginPath(); ctx.rect(f.x,f.y,f.w,f.h); ctx.fill();

    // Tile floor texture if loaded
    if (floorImg && floorImg.complete && floorImg.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.beginPath(); ctx.rect(f.x,f.y,f.w,f.h); ctx.clip();
      for(let tx=f.x; tx<f.x+f.w; tx+=tileSize){
        for(let ty=f.y; ty<f.y+f.h; ty+=tileSize){
          ctx.drawImage(floorImg, tx, ty, tileSize, tileSize);
        }
      }
      ctx.restore();
    }

    // Border
    ctx.strokeStyle = 'rgba(40,90,160,.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(f.x,f.y,f.w,f.h); ctx.stroke();

    // Room name
    if(f.name){
      ctx.fillStyle='rgba(180,210,255,.45)';
      ctx.font='bold 13px Nunito,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='bottom';
      ctx.fillText(f.name, f.x+f.w/2, f.y+f.h-6);
    }
  });

  // Cafeteria tables
  ctx.fillStyle='rgba(60,50,30,.6)'; ctx.strokeStyle='rgba(140,110,60,.5)'; ctx.lineWidth=2;
  [[640,170,140,60],[640,280,140,60],[800,170,140,60],[800,280,140,60]].forEach(([x,y,w,h])=>{
    rRect(ctx,x,y,w,h,6); ctx.fill(); ctx.stroke();
  });

  // Security monitor
  ctx.fillStyle='rgba(0,200,200,.15)'; ctx.strokeStyle='rgba(0,200,200,.4)'; ctx.lineWidth=1.5;
  rRect(ctx,390,530,160,100,4); ctx.fill(); ctx.stroke();
  ctx.fillStyle='rgba(0,200,200,.08)'; ctx.beginPath(); ctx.rect(400,540,140,80); ctx.fill();

  // Reactor tanks
  ctx.fillStyle='rgba(0,100,255,.12)'; ctx.strokeStyle='rgba(0,150,255,.35)'; ctx.lineWidth=1.5;
  [[130,520,140,100],[130,700,140,100]].forEach(([x,y,w,h])=>{
    rRect(ctx,x,y,w,h,8); ctx.fill(); ctx.stroke();
  });

  // Emergency button — use asset image if loaded, otherwise draw
  const t = Date.now()/1000;
  const pulse = 0.5+Math.sin(t*2.5)*0.5;
  const emrgImg = IMGS.emrg;
  if (emrgImg && emrgImg.complete && emrgImg.naturalWidth > 0) {
    const ew = 110, eh = 110;
    ctx.save();
    ctx.shadowColor = `rgba(220,30,30,${pulse*.9})`;
    ctx.shadowBlur = 20 * pulse;
    ctx.drawImage(emrgImg, EMRG_POS.x - ew/2, EMRG_POS.y - eh/2, ew, eh);
    ctx.restore();
  } else {
    ctx.shadowColor=`rgba(220,30,30,${pulse*.8})`; ctx.shadowBlur=16*pulse;
    ctx.fillStyle='#aa0000'; ctx.strokeStyle='#ff3333'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(EMRG_POS.x,EMRG_POS.y,22,0,Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.fillStyle='#fff'; ctx.font='bold 16px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('!',EMRG_POS.x,EMRG_POS.y);
  }
  ctx.shadowBlur=0;
  ctx.fillStyle='rgba(255,180,180,.7)'; ctx.font='bold 9px Nunito,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText('URGENCE',EMRG_POS.x,EMRG_POS.y+58);
}

function drawTasks(ctx, tasks) {
  const t = Date.now()/1000;
  tasks.forEach(tk => {
    if(tk.done){
      ctx.fillStyle='rgba(80,230,80,.55)';
      ctx.beginPath(); ctx.arc(tk.x,tk.y,10,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#50ef39'; ctx.font='bold 13px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('✓',tk.x,tk.y);
    } else {
      const p=0.55+Math.sin(t*3+tk.x*.01)*.45;
      ctx.shadowColor=`rgba(255,230,0,${.7*p})`; ctx.shadowBlur=14*p;
      ctx.fillStyle=`rgba(255,225,0,${.8+.2*p})`;
      ctx.beginPath(); ctx.arc(tk.x,tk.y,12,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      ctx.fillStyle='#111'; ctx.font='bold 14px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText('!',tk.x,tk.y);
      // Task name
      ctx.fillStyle='rgba(255,230,100,.6)'; ctx.font='bold 10px Nunito,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText(tk.name,tk.x,tk.y+16);
    }
  });
}

function drawBodies(ctx, bodies) {
  (bodies||[]).forEach(b => {
    const wx=b.x/100*WORLD_W, wy=b.y/100*WORLD_H;
    ctx.save(); ctx.shadowColor='rgba(200,0,0,.5)'; ctx.shadowBlur=8;
    drawAstro(ctx,wx,wy,b.color,30,true); ctx.restore();
  });
}

function drawPlayers(ctx, players, myId, myWPos) {
  Object.values(players||{}).forEach(p => {
    const wx = p.id===myId ? myWPos.x : p.x/100*WORLD_W;
    const wy = p.id===myId ? myWPos.y : p.y/100*WORLD_H;
    const isMe = p.id===myId;
    if(!p.alive) ctx.globalAlpha=.4;
    drawAstro(ctx,wx,wy,p.color,isMe?38:34,false,isMe);
    if(!p.alive) ctx.globalAlpha=1;
    ctx.save();
    ctx.shadowColor='rgba(0,0,0,1)'; ctx.shadowBlur=5;
    ctx.fillStyle = isMe ? '#fff' : (CHX[p.color]||'#aac');
    ctx.font=`bold ${isMe?12:11}px Nunito,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='top';
    ctx.fillText(p.name+(p.isHost?' 👑':'')+((!p.alive)?' 💀':''), wx, wy+34);
    ctx.restore();
  });
}

function drawMinimap(ctx, W, H, gs, myId, myWPos) {
  const mw=165, mh=105, mx=W-mw-10, my=H-mh-10;
  const sx=mw/WORLD_W, sy=mh/WORLD_H;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.75)'; ctx.strokeStyle='rgba(80,140,200,.4)'; ctx.lineWidth=1;
  rRect(ctx,mx,my,mw,mh,4); ctx.fill(); ctx.stroke();
  // Rooms
  ctx.fillStyle='rgba(35,65,120,.7)';
  ROOMS.forEach(f=>{
    ctx.beginPath(); ctx.rect(mx+f.x*sx, my+f.y*sy, f.w*sx, f.h*sy); ctx.fill();
  });
  // Players
  Object.values(gs?.players||{}).forEach(p=>{
    const wx=p.id===myId?myWPos.x:p.x/100*WORLD_W;
    const wy=p.id===myId?myWPos.y:p.y/100*WORLD_H;
    ctx.fillStyle = p.alive ? (CHX[p.color]||'#fff') : 'rgba(200,200,200,.3)';
    ctx.beginPath(); ctx.arc(mx+wx*sx, my+wy*sy, 3, 0, Math.PI*2); ctx.fill();
  });
  // My pos marker
  ctx.strokeStyle='rgba(255,255,255,.6)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.arc(mx+myWPos.x*sx, my+myWPos.y*sy, 4.5, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}

// ═══════ APP ═════════════════════════════════════════════════════════════════
export default function App() {
  const [screen,  setScreen ] = useState('menu');
  const [pName,   setPName  ] = useState('');
  const [rCode,   setRCode  ] = useState('');
  const [jCode,   setJCode  ] = useState('');
  const [myId,    setMyId   ] = useState(null);
  const [myColor, setMyColor] = useState('red');
  const [myRole,  setMyRole ] = useState(null);
  const [gs,      setGs     ] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [chat,    setChat   ] = useState([]);
  const [notif,   setNotif  ] = useState(null);
  const [ejected, setEjected] = useState(null);
  const [killCD,  setKillCD ] = useState(0);
  const [winner,  setWinner ] = useState(null);
  const [reason,  setReason ] = useState('');
  const [maxPl,   setMaxPl  ] = useState(10);
  const [flash,   setFlash  ] = useState(false);
  const [finPl,   setFinPl  ] = useState({});

  const sockRef  = useRef(null);
  const cdRef    = useRef(null);
  const scrRef   = useRef(screen);
  const myIdRef  = useRef(null);
  scrRef.current = screen;
  myIdRef.current= myId;

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('room'); if(c) setJCode(c.toUpperCase());
  }, []);

  const updUrl = (code) => window.history.replaceState(null,'',
    code ? `${window.location.pathname}?room=${code}` : window.location.pathname);

  const notifMsg = (m,d=3000) => { setNotif(m); setTimeout(()=>setNotif(null),d); };

  useEffect(()=>{
    const sock = io(SERVER_URL, { transports:['websocket','polling'] });
    sockRef.current = sock;

    sock.on('connect',()=>{
      setMyId(sock.id); myIdRef.current=sock.id;
      const sc=sessionStorage.getItem('roomCode');
      const sn=sessionStorage.getItem('playerName');
      if(sc&&sn) sock.emit('rejoinRoom',{code:sc,playerName:sn});
    });

    sock.on('gameState', st=>{
      setGs(st);
      const pr = scrRef.current;
      if(st.phase==='meeting' && pr!=='meeting'){ setScreen('meeting'); setChat(st.chatMessages||[]); }
      if(st.phase==='game' && (pr==='meeting'||pr==='lobby'||pr==='roleReveal')){ setScreen('game'); setEjected(null); }
      if(st.phase==='lobby') setScreen('lobby');
    });

    sock.on('yourRole',({role})=>{
      setMyRole(role); setMyTasks([]);
      if(role==='crewmate'){
        const sh=[...TASKS_DEF].sort(()=>Math.random()-.5).slice(0,4);
        setMyTasks(sh.map(t=>({...t,done:false})));
      }
      setScreen('roleReveal');
      snd(role==='impostor'?'imp':'crew');
    });

    sock.on('playerMoved',({id,x,y})=>{
      setGs(prev=>{ if(!prev?.players[id]) return prev; return {...prev,players:{...prev.players,[id]:{...prev.players[id],x,y}}}; });
    });
    sock.on('chatMessage',m=>setChat(p=>[...p,m]));
    sock.on('meetingStart',({reason:r,chatMessages:m})=>{ setReason(r); setChat(m||[]); setScreen('meeting'); snd('meet'); });
    sock.on('meetingEnd',()=>{ setScreen('game'); setEjected(null); });
    sock.on('playerKilled',({targetId,bodies})=>{
      setGs(prev=>{
        if(!prev) return prev;
        const pl={...prev.players};
        if(pl[targetId]) pl[targetId]={...pl[targetId],alive:false};
        return {...prev,deadBodies:bodies,players:pl};
      });
      if(targetId===myIdRef.current){ setFlash(true); setTimeout(()=>setFlash(false),800); snd('kill'); }
    });
    sock.on('playerEjected',({ejectedId,role})=>{
      setGs(prev=>{
        if(!prev?.players[ejectedId]) return prev;
        const p=prev.players[ejectedId];
        setEjected({name:p.name,color:p.color,role});
        return {...prev,players:{...prev.players,[ejectedId]:{...p,alive:false}}};
      });
      snd('eject');
    });
    sock.on('voteSkipped',()=>setEjected({skipped:true}));
    sock.on('playerLeft',({id})=>{
      setGs(prev=>{ if(!prev) return prev; const pl={...prev.players}; delete pl[id]; return {...prev,players:pl}; });
    });
    sock.on('taskCompleted',({playerId,taskId})=>{
      if(playerId===sock.id) setMyTasks(p=>p.map(t=>t.id===taskId?{...t,done:true}:t));
    });
    sock.on('gameOver',({winner:w,players:pl})=>{
      setWinner(w); setFinPl(pl||{}); setScreen('victory');
      snd(w==='crewmate'?'win':'lose');
    });
    return ()=>sock.disconnect();
  },[]);

  useEffect(()=>{
    if(screen!=='game') return;
    setKillCD(30);
    cdRef.current=setInterval(()=>setKillCD(p=>Math.max(0,p-1)),1000);
    return ()=>clearInterval(cdRef.current);
  },[screen]);

  const createRoom = () => {
    if(!pName.trim()) return; snd('btn');
    sockRef.current?.emit('createRoom',{name:pName.trim(),maxPlayers:maxPl},({code,color})=>{
      setRCode(code); setMyId(sockRef.current.id); setMyColor(color);
      updUrl(code); sessionStorage.setItem('roomCode',code); sessionStorage.setItem('playerName',pName.trim());
      setScreen('lobby');
    });
  };

  const joinRoom = (ov) => {
    const code=(ov||jCode).trim().toUpperCase();
    if(!pName.trim()||!code) return; snd('btn');
    sockRef.current?.emit('joinRoom',{name:pName.trim(),code},res=>{
      if(res.error) return notifMsg('❌ '+res.error);
      setRCode(code); setMyId(sockRef.current.id); setMyColor(res.color);
      updUrl(code); sessionStorage.setItem('roomCode',code); sessionStorage.setItem('playerName',pName.trim());
      setScreen('lobby');
    });
  };

  const startGame  = () => { snd('btn'); sockRef.current?.emit('startGame',{code:rCode}); };
  const handleKill = (tid) => {
    snd('kill'); setFlash(true); setTimeout(()=>setFlash(false),600);
    sockRef.current?.emit('kill',{targetId:tid});
    setKillCD(30); clearInterval(cdRef.current);
    cdRef.current=setInterval(()=>setKillCD(p=>Math.max(0,p-1)),1000);
  };

  const resetGame = () => {
    setScreen('menu'); setMyRole(null); setMyTasks([]); setGs(null);
    setWinner(null); setEjected(null); setRCode(''); setJCode(''); setFinPl({});
    updUrl(null); sessionStorage.removeItem('roomCode'); sessionStorage.removeItem('playerName');
  };

  const myPlayer = gs?.players?.[myId];
  const isAlive  = myPlayer?.alive ?? true;
  const isHost   = Object.values(gs?.players||{}).find(p=>p.id===myId)?.isHost ?? false;
  const allP     = Object.values(gs?.players||{});
  const tDone    = allP.reduce((s,p)=>s+(p.tasksDone||0),0);
  const tTotal   = allP.filter(p=>p.role==='crewmate').reduce((s,p)=>s+(p.taskCount||0),0);
  const tPct     = tTotal>0 ? tDone/tTotal : 0;

  return (
    <div className="app">
      {screen==='menu'       && <MenuScreen pName={pName} setPName={setPName} jCode={jCode} setJCode={setJCode} create={createRoom} join={joinRoom} maxPl={maxPl} setMaxPl={setMaxPl} />}
      {screen==='lobby'      && <LobbyScreen rCode={rCode} players={gs?.players||{}} isHost={isHost} start={startGame} myId={myId} maxPl={gs?.maxPlayers||maxPl} myColor={myColor} />}
      {screen==='roleReveal' && <RoleReveal role={myRole} myColor={myColor} onGo={()=>setScreen('game')} />}
      {screen==='game' && gs && (
        <GameCanvas gs={gs} myId={myId} myRole={myRole} myColor={myColor}
          myTasks={myTasks} tPct={tPct} isAlive={isAlive}
          killCD={killCD} flash={flash} notif={notif}
          onMove={p=>{ sockRef.current?.emit('move',p); setGs(prev=>{ if(!prev||!myIdRef.current||!prev.players[myIdRef.current]) return prev; return {...prev,players:{...prev.players,[myIdRef.current]:{...prev.players[myIdRef.current],...p}}}; }); }}
          onKill={handleKill}
          onReport={id=>{ snd('meet'); sockRef.current?.emit('reportBody',{bodyId:id}); }}
          onEmergency={()=>{ snd('meet'); sockRef.current?.emit('emergencyMeeting'); }}
          onTask={(taskId)=>{ snd('task'); sockRef.current?.emit('completeTask',{taskId}); setMyTasks(p=>p.map(t=>t.id===taskId?{...t,done:true}:t)); notifMsg('✅ Tâche accomplie !'); }}
        />
      )}
      {screen==='meeting' && <Meeting players={gs?.players||{}} myId={myId} msgs={chat} ejected={ejected} reason={reason}
        onChat={t=>sockRef.current?.emit('chat',{text:t})}
        onVote={id=>{ snd('vote'); sockRef.current?.emit('vote',{targetId:id}); }}
        isAlive={isAlive} />}
      {screen==='victory' && <Victory winner={winner} players={finPl||gs?.players||{}} myRole={myRole} onBack={resetGame} />}
    </div>
  );
}

// ═══════ MENU ════════════════════════════════════════════════════════════════
function MenuScreen({pName,setPName,jCode,setJCode,create,join,maxPl,setMaxPl}) {
  return (
    <div className="screen menu-screen">
      <div className="stars-bg"/>
      <div className="menu-cont">
        <div className="menu-logo">
          <AstroSvg color="red" size={80} anim />
          <h1 className="title">PARMIS NOUS</h1>
          <p className="subtitle">— Among Us FR —</p>
        </div>
        <div className="menu-form">
          <input className="inp" placeholder="Votre pseudo…" value={pName}
            onChange={e=>setPName(e.target.value)} maxLength={12}
            onKeyDown={e=>e.key==='Enter'&&(jCode?join():create())} />
          <div className="size-sel">
            <span className="size-lbl">Joueurs max :</span>
            <div className="size-opts">
              {[1,2,3,4,5,6,7,8,9,10].map(n=>(
                <button key={n} className={`sz-btn ${maxPl===n?'on':''}`} onClick={()=>setMaxPl(n)}>{n}</button>
              ))}
            </div>
          </div>
          <button className="btn primary big" onClick={create}>🚀 Créer une partie</button>
          <div className="join-row">
            <input className="inp code-inp" placeholder="CODE" value={jCode}
              onChange={e=>setJCode(e.target.value.toUpperCase())} maxLength={4}
              onKeyDown={e=>e.key==='Enter'&&join()} />
            <button className="btn secondary big" onClick={()=>join()}>Rejoindre</button>
          </div>
        </div>
        <p className="hint">ZQSD / Flèches · E pour interagir</p>
      </div>
    </div>
  );
}

// ═══════ LOBBY ═══════════════════════════════════════════════════════════════
function LobbyScreen({rCode,players,isHost,start,myId,maxPl,myColor}) {
  const [cp,setCp]=useState(false);
  const list=Object.values(players);
  const link=`${window.location.origin}${window.location.pathname}?room=${rCode}`;
  const copy=()=>{ snd('btn'); navigator.clipboard.writeText(link).then(()=>{ setCp(true); setTimeout(()=>setCp(false),2000); }); };
  const empty=Math.max(0,Math.min(maxPl,8)-list.length);
  const hint = list.length===1?'🧪 Solo — vous êtes imposteur !':list.length<4?`${list.length} joueur(s) — invitez des amis !`:`${list.length} joueurs 🚀`;
  return (
    <div className="screen lobby-screen">
      <div className="stars-bg"/>
      <div className="lobby-box">
        <h2 className="lby-title">🛸 Salle d'attente</h2>
        <div className="code-block">
          <div className="room-code">Code : <span className="code-val">{rCode}</span></div>
          <button className="btn copy-btn" onClick={copy}>{cp?'✅ Copié !':'🔗 Copier le lien'}</button>
        </div>
        <div className="pgrid">
          {list.map(p=>(
            <div key={p.id} className="pcard" style={{'--pc':CHX[p.color]}}>
              <AstroSvg color={p.color} size={46} isHost={p.isHost} />
              <span className="pname">{p.name}{p.id===myId?' (Moi)':''}</span>
            </div>
          ))}
          {Array(empty).fill(0).map((_,i)=>(
            <div key={i} className="pcard empty">
              <span className="empty-ico">?</span>
              <span className="pname">En attente…</span>
            </div>
          ))}
        </div>
        {isHost
          ? <><p className="lby-hint">{hint}</p><button className="btn start-btn" onClick={start}>▶ DÉMARRER</button></>
          : <p className="lby-hint">En attente que l'hôte démarre…</p>
        }
      </div>
    </div>
  );
}

// ═══════ ROLE REVEAL ═════════════════════════════════════════════════════════
function RoleReveal({role,myColor,onGo}) {
  const [ph,setPh]=useState(0);
  useEffect(()=>{
    setTimeout(()=>setPh(1),400);
    setTimeout(()=>setPh(2),2000);
    setTimeout(()=>onGo(),4800);
  },[]);
  const imp=role==='impostor';
  return (
    <div className={`screen role-screen ${imp?'role-imp':'role-crew'} ph${ph}`}>
      <div className="role-glow"/>
      <div className="role-cont">
        <div className={`role-astro ${ph>=1?'show':''}`}><AstroSvg color={myColor} size={120}/></div>
        <div className={`role-text ${ph>=2?'show':''}`}>
          <div className="role-youare">Vous êtes</div>
          <div className={`role-name ${imp?'red':'blue'}`}>{imp?'🔪 IMPOSTEUR':'🛸 ÉQUIPAGE'}</div>
          <div className="role-desc">{imp?"Éliminez l'équipage sans vous faire démasquer !":"Complétez vos tâches et trouvez l'imposteur !"}</div>
          <button className={`btn role-go ${ph>=2?'show':''}`} onClick={onGo}>{imp?"😈 C'est parti !":"💪 En avant !"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════ GAME CANVAS ═════════════════════════════════════════════════════════
function GameCanvas({gs,myId,myRole,myColor,myTasks,tPct,isAlive,killCD,flash,notif,onMove,onKill,onReport,onEmergency,onTask}) {
  const canvRef = useRef(null);
  const posRef  = useRef(null);
  const camRef  = useRef({x:0,y:0});
  const keysRef = useRef({});
  const joyRef  = useRef({dx:0,dy:0}); // joystick virtuel
  const rafRef  = useRef(null);
  const sendRef = useRef(0);
  const gsRef   = useRef(gs);
  const tkRef   = useRef(myTasks);
  const alRef   = useRef(isAlive);
  const myIdRef = useRef(myId);
  gsRef.current = gs; tkRef.current=myTasks; alRef.current=isAlive; myIdRef.current=myId;

  const [near, setNear]  = useState({task:null,body:null,player:null,emrg:false});
  const [actTask,setAct] = useState(null);
  const setActRef = useRef(setAct); setActRef.current=setAct;
  const setNearRef= useRef(setNear); setNearRef.current=setNear;

  // Init position
  useEffect(()=>{
    if(!posRef.current && gs?.players?.[myId]){
      const p=gs.players[myId];
      posRef.current={x:p.x/100*WORLD_W, y:p.y/100*WORLD_H};
    }
    if(!posRef.current) posRef.current={x:820,y:230};
  },[]);

  useEffect(()=>{
    const canvas=canvRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d');

    const resize=()=>{ canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight; };
    resize(); window.addEventListener('resize',resize);

    const onKey=e=>{
      keysRef.current[e.key]=e.type==='keydown';
      if(e.type==='keydown' && (e.key==='e'||e.key==='E')){
        const pos=posRef.current; if(!pos) return;
        const tasks=tkRef.current;
        const nt=tasks.find(t=>!t.done && Math.hypot(pos.x-t.x,pos.y-t.y)<NEAR_DIST);
        if(nt){ setActRef.current(nt); snd('btn'); }
      }
    };
    window.addEventListener('keydown',onKey);
    window.addEventListener('keyup',onKey);

    let lastT=0;
    const loop=(ts)=>{
      const dt=Math.min((ts-lastT)/16.67,3); lastT=ts;
      const W=canvas.width, H=canvas.height;
      if(!posRef.current) posRef.current={x:820,y:230};

      // Movement (clavier + joystick tactile)
      if(alRef.current){
        const k=keysRef.current;
        const joy=joyRef.current;
        let {x,y}=posRef.current;
        let dx=(k['ArrowRight']||k['d']?1:0)-(k['ArrowLeft']||k['q']||k['a']?1:0);
        let dy=(k['ArrowDown'] ||k['s']?1:0)-(k['ArrowUp']  ||k['z']||k['w']?1:0);
        // Joystick override si actif
        if(Math.abs(joy.dx)>0.05||Math.abs(joy.dy)>0.05){ dx=joy.dx; dy=joy.dy; }
        if(dx||dy){
          const len=Math.sqrt(dx*dx+dy*dy)||1;
          x=Math.max(60,Math.min(WORLD_W-60, x+(dx/len)*SPEED*dt));
          y=Math.max(60,Math.min(WORLD_H-60, y+(dy/len)*SPEED*dt));
          posRef.current={x,y};
          if(ts-sendRef.current>45){
            sendRef.current=ts;
            onMove({x:x/WORLD_W*100,y:y/WORLD_H*100});
          }
        }
      }

      const {x:px,y:py}=posRef.current;

      // Camera smooth follow
      const cam=camRef.current;
      cam.x+=(px-W/2-cam.x)*.1*dt;
      cam.y+=(py-H/2-cam.y)*.1*dt;
      cam.x=Math.max(0,Math.min(WORLD_W-W,cam.x));
      cam.y=Math.max(0,Math.min(WORLD_H-H,cam.y));
      const psx=px-cam.x, psy=py-cam.y;

      // Proximity check
      const tasks=tkRef.current; const gst=gsRef.current;
      const nt=tasks.find(t=>!t.done&&Math.hypot(px-t.x,py-t.y)<NEAR_DIST)||null;
      const bodies=gst?.deadBodies||[];
      const nb=bodies.find(b=>{ const bx=b.x/100*WORLD_W,by=b.y/100*WORLD_H; return Math.hypot(px-bx,py-by)<NEAR_DIST; })||null;
      const np=myRole==='impostor'?Object.values(gst?.players||{}).find(p=>p.id!==myIdRef.current&&p.alive&&Math.hypot(px-p.x/100*WORLD_W,py-p.y/100*WORLD_H)<NEAR_DIST):null;
      const ne=Math.hypot(px-EMRG_POS.x,py-EMRG_POS.y)<NEAR_DIST+10;
      setNearRef.current({task:nt,body:nb,player:np||null,emrg:ne});

      // ── RENDER ──
      ctx.fillStyle='#04040e';
      ctx.fillRect(0,0,W,H);

      const drawWorld=()=>{
        ctx.save(); ctx.translate(-cam.x,-cam.y);
        drawMap(ctx);
        if(myRole==='crewmate') drawTasks(ctx,tasks);
        drawBodies(ctx,bodies);
        drawPlayers(ctx,gst?.players||{},myIdRef.current,posRef.current);
        ctx.restore();
      };

      if(!alRef.current){
        // Ghost sees all
        drawWorld();
        ctx.fillStyle='rgba(0,0,30,.4)'; ctx.fillRect(0,0,W,H);
      } else {
        // Draw world first
        drawWorld();
        // Apply fog of war
        ctx.save();
        const vis=ctx.createRadialGradient(psx,psy,VISION_R*.62,psx,psy,VISION_R*1.05);
        vis.addColorStop(0,'rgba(0,0,0,1)');
        vis.addColorStop(1,'rgba(0,0,0,0)');
        ctx.globalCompositeOperation='destination-in';
        ctx.fillStyle=vis; ctx.fillRect(0,0,W,H);
        ctx.globalCompositeOperation='destination-over';
        ctx.fillStyle='#04040e'; ctx.fillRect(0,0,W,H);
        ctx.restore();
      }

      // Minimap
      drawMinimap(ctx,W,H,gst,myIdRef.current,posRef.current);

      rafRef.current=requestAnimationFrame(loop);
    };
    rafRef.current=requestAnimationFrame(loop);

    return ()=>{
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize',resize);
      window.removeEventListener('keydown',onKey);
      window.removeEventListener('keyup',onKey);
    };
  },[myId,myRole,onMove]);

  const canKill = myRole==='impostor' && near.player && killCD===0;

  return (
    <div className="game-wrap">
      {flash && <div className="kill-flash"/>}
      <canvas ref={canvRef} className="game-canvas"/>

      {/* HUD */}
      <div className="hud">
        <div className={`role-badge ${myRole}`}>{myRole==='impostor'?'🔪 IMPOSTEUR':'🛸 ÉQUIPAGE'}</div>
        <div className="tbar-wrap">
          <div className="tbar-lbl">Tâches équipage</div>
          <div className="tbar-out"><div className="tbar-in" style={{width:`${tPct*100}%`}}/></div>
        </div>
        {!isAlive && <div className="ghost-badge">👻 FANTÔME</div>}
        {myRole==='crewmate' && (
          <div className="task-pips">
            {myTasks.map(t=><span key={t.id} className={`pip ${t.done?'done':''}`} title={t.name}/>)}
          </div>
        )}
      </div>

      {/* Actions */}
      {isAlive && (
        <div className="act-bar">
          {near.body && (
            <button className="btn act-report" onClick={()=>onReport(near.body.id)}>🚨 SIGNALER LE CORPS</button>
          )}
          {near.task && myRole==='crewmate' && (
            <button className="btn act-task" onClick={()=>{ snd('btn'); setAct(near.task); }}>
              ⚡ {near.task.name} <kbd>E</kbd>
            </button>
          )}
          {near.emrg && (
            <button className="btn act-emrg" onClick={onEmergency}>🚨 RÉUNION D'URGENCE</button>
          )}
          {myRole==='impostor' && (
            <button className={`btn act-kill ${canKill?'rdy':'cd'}`}
              onClick={()=>canKill&&onKill(near.player.id)} disabled={!canKill}>
              🔪 TUER {killCD>0?`(${killCD}s)`:near.player?`— ${near.player.name}`:'— Approchez'}
            </button>
          )}
        </div>
      )}

      {notif && <div className="notif">{notif}</div>}
      {actTask && <TaskModal task={actTask} onComplete={onTask} onClose={()=>setAct(null)}/>}
      <Joystick joyRef={joyRef} onAction={()=>{
        if(near.task && myRole==='crewmate'){ snd('btn'); setAct(near.task); }
        else if(near.body){ onReport(near.body.id); }
        else if(near.emrg){ onEmergency(); }
        else if(canKill){ onKill(near.player.id); }
      }} actionLabel={
        near.body?'🚨':near.task?'⚡':near.emrg?'🚨':canKill?'🔪':null
      }/>
      <div className="ctrl-hint">ZQSD · ↑↓←→ · E pour tâche</div>
    </div>
  );
}


// ═══════ JOYSTICK VIRTUEL (mobile) ═══════════════════════════════════════════
function Joystick({joyRef, onAction, actionLabel}) {
  const baseRef = useRef(null);
  const stickRef = useRef(null);
  const touchRef = useRef(null);
  const [stickPos, setStickPos] = useState({x:0,y:0});
  const [active, setActive] = useState(false);

  const MAX_R = 48;

  const onTouchStart = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    touchRef.current = touch.identifier;
    setActive(true);
  };

  const onTouchMove = (e) => {
    e.preventDefault();
    const base = baseRef.current;
    if(!base) return;
    const touch = Array.from(e.touches).find(t=>t.identifier===touchRef.current);
    if(!touch) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top  + rect.height/2;
    let dx = touch.clientX - cx;
    let dy = touch.clientY - cy;
    const dist = Math.sqrt(dx*dx+dy*dy);
    if(dist > MAX_R){ dx = dx/dist*MAX_R; dy = dy/dist*MAX_R; }
    setStickPos({x:dx,y:dy});
    joyRef.current = {dx: dx/MAX_R, dy: dy/MAX_R};
  };

  const onTouchEnd = (e) => {
    e.preventDefault();
    setStickPos({x:0,y:0});
    setActive(false);
    joyRef.current = {dx:0,dy:0};
  };

  return (
    <>
      {/* Joystick base — bas gauche */}
      <div
        ref={baseRef}
        className={`joy-base ${active?'joy-active':''}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div
          ref={stickRef}
          className="joy-stick"
          style={{transform:`translate(${stickPos.x}px,${stickPos.y}px)`}}
        />
      </div>
      {/* Bouton action — bas droite */}
      {actionLabel && (
        <button className="joy-action" onTouchStart={e=>{e.preventDefault();onAction();}}>
          {actionLabel}
        </button>
      )}
    </>
  );
}

// ═══════ TASK MODAL ══════════════════════════════════════════════════════════
function TaskModal({task,onComplete,onClose}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="task-modal" onClick={e=>e.stopPropagation()}>
        <div className="tm-head">
          <span className="tm-title">⚡ {task.name}</span>
          <button className="tm-close" onClick={onClose}>✕</button>
        </div>
        <div className="tm-body">
          {task.type==='wires'     && <WireTask     onDone={()=>onComplete(task.id)}/>}
          {task.type==='swipe'     && <SwipeTask    onDone={()=>onComplete(task.id)}/>}
          {task.type==='download'  && <DlTask       onDone={()=>onComplete(task.id)} lbl="Téléchargement"/>}
          {task.type==='fuel'      && <DlTask       onDone={()=>onComplete(task.id)} lbl="Ravitaillement" col="#ff8800"/>}
          {task.type==='asteroids' && <AstTask      onDone={()=>onComplete(task.id)}/>}
          {task.type==='numpad'    && <NumTask      onDone={()=>onComplete(task.id)}/>}
        </div>
      </div>
    </div>
  );
}
function DlTask({onDone,lbl,col}){
  const [p,setP]=useState(0);
  useEffect(()=>{
    const iv=setInterval(()=>setP(v=>{ if(v>=100){clearInterval(iv);setTimeout(onDone,300);return 100;} return v+1.8; }),50);
    return ()=>clearInterval(iv);
  },[]);
  const c=col||'#38fedc';
  return(<div className="dl-task"><div className="dl-lbl">{lbl}…</div><div className="dl-bar"><div className="dl-fill" style={{width:`${p}%`,background:c}}/></div><div className="dl-pct" style={{color:c}}>{Math.floor(p)}%</div></div>);
}
function SwipeTask({onDone}){
  const [pos,setPos]=useState(0);
  const [st,setSt]=useState('idle');
  const go=()=>{
    if(st!=='idle') return; setSt('go');
    let p=0; const iv=setInterval(()=>{ p+=3.5; setPos(p); if(p>=100){clearInterval(iv);setSt('ok');setTimeout(onDone,400);} },18);
  };
  return(<div className="sw-task"><p>Glissez la carte rapidement de gauche à droite</p><div className="sw-track"><div className="sw-arrow">→→→</div><div className={`sw-card ${st==='ok'?'ok':''}`} style={{left:`${Math.min(pos,90)}%`}}/></div><button className="btn primary" onClick={go} disabled={st!=='idle'}>{st==='idle'?'→ Glisser':st==='go'?'…':'✅ Réussi !'}</button></div>);
}
function WireTask({onDone}){
  const colors=['#c51111','#132ed1','#f5f557','#117f2d'];
  const right=[2,0,3,1];
  const [conn,setConn]=useState([]);
  const [sel,setSel]=useState(null);
  const pickL=i=>{ if(conn.includes(i)) return; setSel(i); };
  const pickR=i=>{
    if(sel===null) return;
    if(sel===right[i]){ const nc=[...conn,sel]; setConn(nc); setSel(null); if(nc.length>=4) setTimeout(onDone,400); }
    else setSel(null);
  };
  return(<div className="wire-task"><p>Connectez les fils de même couleur</p><div className="wire-cols"><div className="wire-col">{colors.map((c,i)=><div key={i} className={`wire-nd ${sel===i?'sel':''} ${conn.includes(i)?'done':''}`} style={{background:c}} onClick={()=>!conn.includes(i)&&pickL(i)}/>)}</div><div className="wire-col">{right.map((li,i)=><div key={i} className={`wire-nd ${conn.includes(li)?'done':''}`} style={{background:colors[li]}} onClick={()=>!conn.includes(li)&&pickR(i)}/>)}</div></div><p className="wire-hint">Clic gauche → puis prise droite correspondante</p></div>);
}
function AstTask({onDone}){
  const [asts,setAsts]=useState(()=>Array(7).fill(0).map((_,i)=>({id:i,x:6+i*13,y:20+Math.random()*55,d:false})));
  const hit=id=>{ setAsts(p=>{ const u=p.map(a=>a.id===id?{...a,d:true}:a); if(u.every(a=>a.d)) setTimeout(onDone,350); return u; }); snd('btn'); };
  return(<div className="ast-task"><p>🎯 Détruisez tous les astéroïdes !</p><div className="ast-field">{asts.map(a=>!a.d&&<div key={a.id} className="ast" style={{left:`${a.x}%`,top:`${a.y}%`}} onClick={()=>hit(a.id)}>☄️</div>)}<div className="turret">🔫</div></div></div>);
}
function NumTask({onDone}){
  const [code]=useState(()=>Array(4).fill(0).map(()=>Math.floor(Math.random()*9)+1).join(''));
  const [inp,setInp]=useState('');
  const [shk,setShk]=useState(false);
  const press=d=>{
    if(inp.length>=4) return; snd('btn');
    const n=inp+d;
    setInp(n);
    if(n.length===4){ if(n===code) setTimeout(onDone,400); else{ setShk(true); setTimeout(()=>{ setInp(''); setShk(false); },600); } }
  };
  return(<div className="num-task"><div className="num-lbl">Entrez le code :</div><div className="num-disp">{code.split('').map((d,i)=><div key={i} className={`num-dig ${inp.length>i?'on':''}`}>{inp.length>i?inp[i]:'·'}</div>)}</div><div className={`num-grid ${shk?'shk':''}`}>{[1,2,3,4,5,6,7,8,9].map(d=><button key={d} className="nk" onClick={()=>press(String(d))}>{d}</button>)}<button className="nk clr" onClick={()=>setInp('')}>⌫</button><button className="nk" onClick={()=>press('0')}>0</button><button className="nk ok">OK</button></div></div>);
}

// ═══════ MEETING ═════════════════════════════════════════════════════════════
function Meeting({players,myId,msgs,ejected,reason,onChat,onVote,isAlive}){
  const [voted,setVoted]=useState(false);
  const [myVote,setMyVote]=useState(null);
  const [timer,setTimer]=useState(60);
  const chatRef=useRef(null);
  useEffect(()=>{ if(chatRef.current) chatRef.current.scrollTop=chatRef.current.scrollHeight; },[msgs]);
  useEffect(()=>{
    if(ejected) return;
    const iv=setInterval(()=>setTimer(t=>{ if(t<=1){clearInterval(iv);return 0;} return t-1; }),1000);
    return ()=>clearInterval(iv);
  },[ejected]);
  const vote=(id)=>{ if(voted||!isAlive) return; onVote(id); setVoted(true); setMyVote(id); };
  const alive=Object.values(players).filter(p=>p.alive);
  const tc=timer<=10?'#ff4444':timer<=20?'#ff8800':'#38fedc';
  return(
    <div className="screen meet-screen">
      <div className="meet-alarm"/>
      <div className="meet-cont">
        <div className="meet-head">
          <div className="siren">🚨</div>
          <h2 className="meet-title">RÉUNION D'URGENCE</h2>
          <p className="meet-rsn">{reason}</p>
          {!ejected && <div className="meet-timer" style={{color:tc}}>⏱ {timer}s</div>}
        </div>
        {ejected ? (
          <div className="ejected-pan">
            {ejected.skipped
              ? <div className="ej-cont"><div className="ej-ico">⏭️</div><h3>Vote passé</h3><p>Personne n'a été éjecté.</p></div>
              : <div className="ej-cont">
                  <div className="ej-astro"><AstroSvg color={ejected.color} size={100}/></div>
                  <h3 style={{color:CHX[ejected.color]}}>{ejected.name} a été éjecté !</h3>
                  <div className={`ej-role ${ejected.role}`}>{ejected.role==='impostor'?"🔪 C'était l'IMPOSTEUR":"🛸 C'était un ÉQUIPIER"}</div>
                </div>
            }
          </div>
        ):(
          <div className="meet-body">
            <div className="meet-chat">
              <div className="chat-msgs" ref={chatRef}>
                {msgs.length===0 && <div className="chat-empty">Personne n'a encore parlé…</div>}
                {msgs.map(m=>(
                  <div key={m.id} className="chat-msg">
                    <AstroSvg color={m.color} size={22}/>
                    <div className="chat-bubble">
                      <span className="chat-auth" style={{color:CHX[m.color]||'#fff'}}>{m.playerName}</span>
                      <span className="chat-txt">{m.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              {isAlive && !voted && (
                <div className="qchat">{QUICK_CHAT.map((m,i)=><button key={i} className="qbtn" onClick={()=>onChat(m)}>{m}</button>)}</div>
              )}
              {!isAlive && <div className="ghost-note">👻 Les fantômes ne peuvent pas parler</div>}
            </div>
            <div className="vote-panel">
              <div className="vote-ttl">🗳️ Qui éjecter ?</div>
              <div className="vote-grid">
                {alive.map(p=>(
                  <div key={p.id}
                    className={`vcard ${voted?'vd':''} ${p.id===myId?'self':'oth'} ${myVote===p.id?'pick':''}`}
                    onClick={()=>p.id!==myId&&vote(p.id)}
                    style={{'--pc':CHX[p.color]}}>
                    <AstroSvg color={p.color} size={46}/>
                    <div className="vname">{p.name}{p.id===myId?' (Moi)':''}</div>
                    {myVote===p.id&&<div className="vcheck">✓</div>}
                  </div>
                ))}
              </div>
              {!voted&&isAlive&&<button className="btn skip-btn" onClick={()=>vote(null)}>⏭️ Passer</button>}
              {voted&&<div className="voted-ok">{myVote?'✅ Vote enregistré !':'⏭️ Passé !'}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════ VICTORY ═════════════════════════════════════════════════════════════
function Victory({winner,players,myRole,onBack}){
  const win=(winner==='crewmate'&&myRole==='crewmate')||(winner==='impostor'&&myRole==='impostor');
  const crew=winner==='crewmate';
  const list=Object.values(players);
  return(
    <div className={`screen vic-screen ${crew?'v-crew':'v-imp'}`}>
      <div className="stars-bg"/>
      <div className="vic-cont">
        <div className="vic-astros">{list.slice(0,5).map((p,i)=><div key={p.id} className="vic-float" style={{'--i':i}}><AstroSvg color={p.color} size={52}/></div>)}</div>
        <div className={`vic-banner ${win?'win':'lose'}`}>{win?'🎉 VICTOIRE !':'😵 DÉFAITE…'}</div>
        <h2 className="vic-title">{crew?"🛸 L'Équipage a gagné !":"🔪 Les Imposteurs ont gagné !"}</h2>
        <div className="vic-roles">
          {list.map(p=>(
            <div key={p.id} className={`vic-pc ${p.role}`} style={{'--pc':CHX[p.color]}}>
              <AstroSvg color={p.color} size={36}/>
              <div className="vpc-info"><div className="vpc-name">{p.name}</div><div className={`vpc-role ${p.role}`}>{p.role==='impostor'?'🔪 Imposteur':'🛸 Équipage'}</div></div>
            </div>
          ))}
        </div>
        <button className="btn primary big" onClick={onBack}>↩ Retour au menu</button>
      </div>
    </div>
  );
}

// ═══════ SVG ASTRONAUT (for HTML screens) ════════════════════════════════════
function AstroSvg({color,size=40,isHost=false,anim=false}){
  const c=CHX[color]||'#c51111';
  return(
    <svg width={size} height={size*1.15} viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg"
      style={anim?{animation:'floatY 3s ease-in-out infinite'}:{}}>
      <rect x="22" y="16" width="9" height="13" rx="3" fill={c} stroke="rgba(0,0,0,.6)" strokeWidth="1.5"/>
      <ellipse cx="15" cy="26" rx="13" ry="12" fill={c} stroke="rgba(0,0,0,.6)" strokeWidth="1.5"/>
      <ellipse cx="15" cy="13" rx="11" ry="12" fill={c} stroke="rgba(0,0,0,.6)" strokeWidth="1.5"/>
      <ellipse cx="18" cy="11" rx="7.5" ry="5.5" fill="#1a3a9c" stroke="rgba(80,180,255,.4)" strokeWidth=".8"/>
      <ellipse cx="16" cy="9" rx="5" ry="3.5" fill="#2a5aec"/>
      <ellipse cx="14" cy="7.5" rx="2.2" ry="1.4" fill="rgba(180,235,255,.75)"/>
      <rect x="7" y="36" width="7" height="5" rx="2.5" fill={c} stroke="rgba(0,0,0,.6)" strokeWidth="1"/>
      <rect x="17" y="36" width="7" height="5" rx="2.5" fill={c} stroke="rgba(0,0,0,.6)" strokeWidth="1"/>
      {isHost&&<text x="4" y="5" fontSize="9" dominantBaseline="hanging">👑</text>}
    </svg>
  );
}
