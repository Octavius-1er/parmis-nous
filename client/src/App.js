import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './style/App.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'https://parmis-nous.onrender.com';

const COLORS = {
  red: '#c51111', blue: '#132ed1', green: '#117f2d', purple: '#6b2fbb',
  yellow: '#f5f557', orange: '#ef7d0d', pink: '#ec54bb', white: '#d7e1f1',
  brown: '#71491e', cyan: '#38fedc', lime: '#50ef39', maroon: '#6b2737',
};

const QUICK_CHAT = [
  "C'est moi, je suis équipage !", "J'ai vu quelqu'un tuer !",
  "J'avais un alibi, j'étais aux tâches.", "C'est l'imposteur, votez !",
  "Je suis innocent !", "On se regroupe !", "Où étais-tu ?",
  "C'est très suspect...", "Je viens de finir mes tâches !",
  "Quelqu'un m'a suivi.", "Je n'ai rien vu.", "Skip / Passer le vote",
];

const SHIP_ROOMS = [
  { id: 'upper-engine', name: 'Moteur ↑',   x: 3,  y: 8,  w: 13, h: 13 },
  { id: 'reactor',      name: 'Réacteur',    x: 3,  y: 36, w: 13, h: 22 },
  { id: 'lower-engine', name: 'Moteur ↓',   x: 3,  y: 76, w: 13, h: 13 },
  { id: 'security',     name: 'Sécurité',   x: 16, y: 44, w: 14, h: 14 },
  { id: 'medbay',       name: 'Médical',    x: 28, y: 56, w: 14, h: 14 },
  { id: 'electrical',   name: 'Électrique', x: 16, y: 68, w: 14, h: 14 },
  { id: 'cafeteria',    name: 'Cafétéria',  x: 34, y: 4,  w: 28, h: 22 },
  { id: 'o2',           name: 'O₂',         x: 30, y: 34, w: 14, h: 14 },
  { id: 'weapons',      name: 'Armement',   x: 66, y: 4,  w: 20, h: 16 },
  { id: 'nav',          name: 'Navigation', x: 74, y: 26, w: 18, h: 16 },
  { id: 'admin',        name: 'Admin',      x: 60, y: 36, w: 18, h: 14 },
  { id: 'storage',      name: 'Stockage',   x: 54, y: 60, w: 24, h: 20 },
  { id: 'shields',      name: 'Boucliers',  x: 74, y: 68, w: 14, h: 18 },
  { id: 'comms',        name: 'Comm.',      x: 46, y: 82, w: 14, h: 12 },
];

const TASK_SPOTS = [
  { id: 'wires1',    name: 'Réparer fils',       x: 21, y: 72, type: 'wires'     },
  { id: 'wires2',    name: 'Réparer fils',        x: 68, y: 67, type: 'wires'     },
  { id: 'cards',     name: 'Glisser carte',       x: 65, y: 41, type: 'swipe'     },
  { id: 'asteroids', name: 'Astéroïdes',          x: 75, y: 10, type: 'asteroids' },
  { id: 'nav1',      name: 'Navigation',          x: 80, y: 32, type: 'download'  },
  { id: 'fuel1',     name: 'Ravitailler moteur',  x: 7,  y: 12, type: 'fuel'      },
  { id: 'fuel2',     name: 'Ravitailler moteur',  x: 7,  y: 80, type: 'fuel'      },
  { id: 'med',       name: 'Scanner médical',     x: 33, y: 62, type: 'numpad'    },
  { id: 'reactor1',  name: 'Démarrer réacteur',   x: 7,  y: 46, type: 'download'  },
  { id: 'shields1',  name: 'Boucliers',           x: 79, y: 76, type: 'wires'     },
  { id: 'o2fix',     name: 'Réparer O₂',          x: 35, y: 39, type: 'numpad'    },
  { id: 'comms1',    name: 'Réparer comm.',        x: 51, y: 86, type: 'download'  },
];

// ─────────────────────────────────────────────────────────────────
// SOUNDS
// ─────────────────────────────────────────────────────────────────
let _audioCtx = null;
function getCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}
function playSound(type) {
  try {
    const ctx = getCtx();
    const t = ctx.currentTime;
    const tone = (freq, start, dur, vol = 0.2, wave = 'sine') => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(freq, t + start);
      g.gain.setValueAtTime(vol, t + start);
      g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t + start); o.stop(t + start + dur);
    };
    if (type === 'button')   { tone(330, 0, 0.08, 0.1); }
    if (type === 'task')     { [523, 659, 784].forEach((f, i) => tone(f, i * 0.12, 0.2, 0.18)); }
    if (type === 'kill')     { [220, 110, 55].forEach((f, i) => tone(f, i * 0.12, 0.4, 0.3, 'sawtooth')); }
    if (type === 'meeting')  { for (let i = 0; i < 8; i++) tone(i % 2 ? 880 : 660, i * 0.13, 0.12, 0.25); }
    if (type === 'vote')     { tone(440, 0, 0.12, 0.15); }
    if (type === 'impostor') { [110, 92, 73].forEach((f, i) => tone(f, i * 0.22, 0.55, 0.28, 'sawtooth')); }
    if (type === 'crewmate') { [523, 659].forEach((f, i) => tone(f, i * 0.22, 0.4, 0.2)); }
    if (type === 'eject')    {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(20, t + 2.5);
      g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
      o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 2.5);
    }
    if (type === 'win')      { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.15, 0.5, 0.2)); }
    if (type === 'lose')     { [300, 220, 165].forEach((f, i) => tone(f, i * 0.2, 0.6, 0.2, 'sawtooth')); }
  } catch(e) {}
}

// ─────────────────────────────────────────────────────────────────
// ASTRONAUT SVG
// ─────────────────────────────────────────────────────────────────
function Astronaut({ color, size = 40, dead = false, isHost = false }) {
  const c = COLORS[color] || '#c51111';
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
      {/* Backpack */}
      <rect x="22" y="16" width="9" height="13" rx="3" fill={c} stroke="rgba(0,0,0,0.6)" strokeWidth="1.5"/>
      <rect x="24" y="19" width="5" height="7" rx="1.5" fill="rgba(0,0,0,0.35)"/>
      {/* Body */}
      <ellipse cx="15" cy="26" rx="13" ry="13" fill={c} stroke="rgba(0,0,0,0.6)" strokeWidth="1.5"/>
      {/* Head */}
      <ellipse cx="15" cy="13" rx="11" ry="12" fill={c} stroke="rgba(0,0,0,0.6)" strokeWidth="1.5"/>
      {/* Visor */}
      <ellipse cx="18" cy="11" rx="7.5" ry="5.5" fill="#1a3a9c" stroke="rgba(80,180,255,0.5)" strokeWidth="0.8"/>
      <ellipse cx="17" cy="9.5" rx="5" ry="3.5" fill="#2a5aec"/>
      <ellipse cx="15" cy="8" rx="2.5" ry="1.5" fill="rgba(160,230,255,0.75)"/>
      <ellipse cx="21" cy="9.5" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.55)"/>
      {/* Feet */}
      <rect x="7" y="36" width="7" height="5" rx="2.5" fill={c} stroke="rgba(0,0,0,0.6)" strokeWidth="1"/>
      <rect x="16" y="36" width="7" height="5" rx="2.5" fill={c} stroke="rgba(0,0,0,0.6)" strokeWidth="1"/>
      {dead && <>
        <line x1="10" y1="9" x2="16" y2="15" stroke="#ff0000" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="16" y1="9" x2="10" y2="15" stroke="#ff0000" strokeWidth="2.5" strokeLinecap="round"/>
      </>}
      {isHost && <text x="4" y="5" fontSize="9">👑</text>}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
// APP
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen]           = useState('menu');
  const [playerName, setPlayerName]   = useState('');
  const [roomCode, setRoomCode]       = useState('');
  const [joinCode, setJoinCode]       = useState('');
  const [myId, setMyId]               = useState(null);
  const [myColor, setMyColor]         = useState('red');
  const [myRole, setMyRole]           = useState(null);
  const [gameState, setGameState]     = useState(null);
  const [myTasks, setMyTasks]         = useState([]);
  const [activeTask, setActiveTask]   = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [notification, setNotification] = useState(null);
  const [ejectedInfo, setEjectedInfo] = useState(null);
  const [killCooldown, setKillCooldown] = useState(0);
  const [nearbyTask, setNearbyTask]   = useState(null);
  const [nearbyBody, setNearbyBody]   = useState(null);
  const [nearbyPlayer, setNearbyPlayer] = useState(null);
  const [winner, setWinner]           = useState(null);
  const [meetingReason, setMeetingReason] = useState('');
  const [maxPlayers, setMaxPlayers]   = useState(10);
  const [killFlash, setKillFlash]     = useState(false);
  const [finalPlayers, setFinalPlayers] = useState({});

  const socketRef      = useRef(null);
  const killCooldownRef= useRef(null);
  const myPosRef       = useRef({ x: 45, y: 50 });
  const keysRef        = useRef({});
  const moveIntervalRef= useRef(null);
  const screenRef      = useRef(screen);
  screenRef.current    = screen;
  const gameStateRef   = useRef(null);
  gameStateRef.current = gameState;
  const myIdRef        = useRef(null);
  myIdRef.current      = myId;
  const myTasksRef     = useRef([]);
  myTasksRef.current   = myTasks;

  // URL room code
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('room');
    if (c) setJoinCode(c.toUpperCase());
  }, []);

  const updateUrl = (code) => {
    window.history.replaceState(null, '',
      code ? `${window.location.pathname}?room=${code}` : window.location.pathname
    );
  };

  const showNotif = (msg, dur = 3000) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), dur);
  };

  // ── Socket ──
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setMyId(socket.id);
      const sc = sessionStorage.getItem('roomCode');
      const sn = sessionStorage.getItem('playerName');
      if (sc && sn) socket.emit('rejoinRoom', { code: sc, playerName: sn });
    });

    socket.on('gameState', (state) => {
      setGameState(state);
      const prev = screenRef.current;
      if (state.phase === 'meeting' && prev !== 'meeting') {
        setScreen('meeting');
        setChatMessages(state.chatMessages || []);
      }
      if (state.phase === 'game' && (prev === 'meeting' || prev === 'lobby' || prev === 'roleReveal')) {
        setScreen('game');
        setEjectedInfo(null);
      }
      if (state.phase === 'lobby') setScreen('lobby');
    });

    socket.on('yourRole', ({ role }) => {
      setMyRole(role);
      setMyTasks([]);
      if (role === 'crewmate') {
        const shuffled = [...TASK_SPOTS].sort(() => Math.random() - 0.5).slice(0, 4);
        setMyTasks(shuffled.map(t => ({ ...t, done: false })));
      }
      setScreen('roleReveal');
      playSound(role);
    });

    socket.on('playerMoved', ({ id, x, y }) => {
      setGameState(prev => {
        if (!prev?.players[id]) return prev;
        return { ...prev, players: { ...prev.players, [id]: { ...prev.players[id], x, y } } };
      });
    });

    socket.on('chatMessage', (msg) => setChatMessages(prev => [...prev, msg]));

    socket.on('meetingStart', ({ reason, chatMessages: msgs }) => {
      setMeetingReason(reason);
      setChatMessages(msgs || []);
      setScreen('meeting');
      playSound('meeting');
    });

    socket.on('meetingEnd', () => {
      setScreen('game');
      setEjectedInfo(null);
    });

    socket.on('playerKilled', ({ targetId, bodies }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const players = { ...prev.players };
        if (players[targetId]) players[targetId] = { ...players[targetId], alive: false };
        return { ...prev, deadBodies: bodies, players };
      });
      if (targetId === myIdRef.current) {
        setKillFlash(true);
        setTimeout(() => setKillFlash(false), 800);
        playSound('kill');
      }
    });

    socket.on('playerEjected', ({ ejectedId, role }) => {
      setGameState(prev => {
        if (!prev?.players[ejectedId]) return prev;
        const p = prev.players[ejectedId];
        setEjectedInfo({ name: p.name, color: p.color, role });
        return { ...prev, players: { ...prev.players, [ejectedId]: { ...p, alive: false } } };
      });
      playSound('eject');
    });

    socket.on('voteSkipped', () => { setEjectedInfo({ skipped: true }); });

    socket.on('playerLeft', ({ id }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const players = { ...prev.players };
        delete players[id];
        return { ...prev, players };
      });
    });

    socket.on('taskCompleted', ({ playerId, taskId }) => {
      if (playerId === socket.id) {
        setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: true } : t));
      }
    });

    socket.on('gameOver', ({ winner: w, players }) => {
      setWinner(w);
      setFinalPlayers(players || {});
      setScreen('victory');
      playSound(w === 'crewmate' ? 'win' : 'lose');
    });

    return () => socket.disconnect();
  }, []);

  // ── Movement ──
  useEffect(() => {
    if (screen !== 'game') return;
    const onKey = (e) => { keysRef.current[e.key] = e.type === 'keydown'; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    moveIntervalRef.current = setInterval(() => {
      const k = keysRef.current;
      let { x, y } = myPosRef.current;
      const speed = 0.55;
      if (k['ArrowUp']    || k['z'] || k['w']) y = Math.max(1, y - speed);
      if (k['ArrowDown']  || k['s'])            y = Math.min(97, y + speed);
      if (k['ArrowLeft']  || k['q'] || k['a']) x = Math.max(1, x - speed);
      if (k['ArrowRight'] || k['d'])            x = Math.min(97, x + speed);

      if (x !== myPosRef.current.x || y !== myPosRef.current.y) {
        myPosRef.current = { x, y };
        socketRef.current?.emit('move', { x, y });
        setGameState(prev => {
          if (!prev || !myIdRef.current || !prev.players[myIdRef.current]) return prev;
          return { ...prev, players: { ...prev.players, [myIdRef.current]: { ...prev.players[myIdRef.current], x, y } } };
        });
        checkProximity(x, y);
      }
    }, 28);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      clearInterval(moveIntervalRef.current);
    };
  }, [screen]);

  // Kill cooldown
  useEffect(() => {
    if (screen !== 'game') return;
    setKillCooldown(30);
    killCooldownRef.current = setInterval(() => setKillCooldown(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(killCooldownRef.current);
  }, [screen]);

  const checkProximity = useCallback((x, y) => {
    const gs = gameStateRef.current;
    const tasks = myTasksRef.current;
    if (!gs) return;
    setNearbyTask(tasks.find(t => !t.done && Math.hypot(x - t.x, y - t.y) < 6) || null);
    setNearbyBody(gs.deadBodies?.find(b => Math.hypot(x - b.x, y - b.y) < 7) || null);
    setNearbyPlayer(Object.values(gs.players).find(p => p.id !== myIdRef.current && p.alive && Math.hypot(x - p.x, y - p.y) < 8) || null);
  }, []);

  // ── Actions ──
  const createRoom = () => {
    if (!playerName.trim()) return;
    playSound('button');
    socketRef.current?.emit('createRoom', { name: playerName.trim(), maxPlayers }, ({ code, color }) => {
      setRoomCode(code); setMyId(socketRef.current.id); setMyColor(color);
      updateUrl(code);
      sessionStorage.setItem('roomCode', code);
      sessionStorage.setItem('playerName', playerName.trim());
      setScreen('lobby');
    });
  };

  const joinRoom = (codeOverride) => {
    const code = (codeOverride || joinCode).trim().toUpperCase();
    if (!playerName.trim() || !code) return;
    playSound('button');
    socketRef.current?.emit('joinRoom', { name: playerName.trim(), code }, (res) => {
      if (res.error) return showNotif('❌ ' + res.error);
      setRoomCode(code); setMyId(socketRef.current.id); setMyColor(res.color);
      updateUrl(code);
      sessionStorage.setItem('roomCode', code);
      sessionStorage.setItem('playerName', playerName.trim());
      setScreen('lobby');
    });
  };

  const startGame = () => {
    playSound('button');
    socketRef.current?.emit('startGame', { code: roomCode });
  };

  const handleKill = () => {
    if (!nearbyPlayer || killCooldown > 0 || myRole !== 'impostor') return;
    playSound('kill');
    setKillFlash(true);
    setTimeout(() => setKillFlash(false), 600);
    socketRef.current?.emit('kill', { targetId: nearbyPlayer.id });
    setKillCooldown(30);
    clearInterval(killCooldownRef.current);
    killCooldownRef.current = setInterval(() => setKillCooldown(p => Math.max(0, p - 1)), 1000);
  };

  const handleReport = () => {
    if (!nearbyBody) return;
    playSound('meeting');
    socketRef.current?.emit('reportBody', { bodyId: nearbyBody.id });
  };

  const handleEmergency = () => {
    playSound('meeting');
    socketRef.current?.emit('emergencyMeeting');
  };

  const handleTaskInteract = () => {
    if (!nearbyTask) return;
    playSound('button');
    setActiveTask(nearbyTask);
  };

  const handleTaskComplete = (taskId) => {
    playSound('task');
    socketRef.current?.emit('completeTask', { taskId });
    setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: true } : t));
    setActiveTask(null);
    showNotif('✅ Tâche accomplie !');
  };

  const handleVote = (targetId) => {
    playSound('vote');
    socketRef.current?.emit('vote', { targetId });
  };

  const handleChat = (text) => socketRef.current?.emit('chat', { text });

  const resetGame = () => {
    setScreen('menu'); setMyRole(null); setMyTasks([]); setGameState(null);
    setWinner(null); setEjectedInfo(null); setRoomCode(''); setJoinCode('');
    setActiveTask(null); setFinalPlayers({});
    updateUrl(null);
    sessionStorage.removeItem('roomCode');
    sessionStorage.removeItem('playerName');
  };

  const myPlayer = gameState?.players?.[myId];
  const isAlive  = myPlayer?.alive ?? true;
  const isHost   = Object.values(gameState?.players || {}).find(p => p.id === myId)?.isHost ?? false;
  const tasksDone = myTasks.filter(t => t.done).length;
  const allTasks  = Object.values(gameState?.players || {});
  const overallTasksDone = allTasks.reduce((s, p) => s + (p.tasksDone || 0), 0);
  const overallTasksTotal = allTasks.filter(p => p.role === 'crewmate').reduce((s, p) => s + (p.taskCount || 0), 0);
  const taskBarPct = overallTasksTotal > 0 ? overallTasksDone / overallTasksTotal : 0;

  return (
    <div className="app">
      {screen === 'menu' && (
        <MenuScreen playerName={playerName} setPlayerName={setPlayerName}
          joinCode={joinCode} setJoinCode={setJoinCode}
          createRoom={createRoom} joinRoom={joinRoom}
          maxPlayers={maxPlayers} setMaxPlayers={setMaxPlayers} />
      )}
      {screen === 'lobby' && (
        <LobbyScreen roomCode={roomCode} players={gameState?.players || {}}
          isHost={isHost} startGame={startGame} myId={myId}
          maxPlayers={gameState?.maxPlayers || maxPlayers} myColor={myColor} />
      )}
      {screen === 'roleReveal' && (
        <RoleRevealScreen role={myRole} myColor={myColor}
          onContinue={() => setScreen('game')} />
      )}
      {screen === 'game' && gameState && (
        <GameScreen
          gameState={gameState} myId={myId} myRole={myRole} myColor={myColor}
          myTasks={myTasks} taskBarPct={taskBarPct} tasksDone={tasksDone}
          nearbyTask={nearbyTask} nearbyBody={nearbyBody} nearbyPlayer={nearbyPlayer}
          killCooldown={killCooldown} isAlive={isAlive} activeTask={activeTask}
          notification={notification} killFlash={killFlash}
          onKill={handleKill} onReport={handleReport}
          onTaskInteract={handleTaskInteract} onTaskComplete={handleTaskComplete}
          onEmergency={handleEmergency} onCloseTask={() => setActiveTask(null)} />
      )}
      {screen === 'meeting' && (
        <MeetingScreen players={gameState?.players || {}} myId={myId}
          chatMessages={chatMessages} ejectedInfo={ejectedInfo}
          reason={meetingReason} onChat={handleChat}
          onVote={handleVote} isAlive={isAlive} />
      )}
      {screen === 'victory' && (
        <VictoryScreen winner={winner} players={finalPlayers || gameState?.players || {}}
          myRole={myRole} onPlayAgain={resetGame} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MENU SCREEN
// ═══════════════════════════════════════════════════════════════
function MenuScreen({ playerName, setPlayerName, joinCode, setJoinCode, createRoom, joinRoom, maxPlayers, setMaxPlayers }) {
  return (
    <div className="screen menu-screen">
      <div className="stars-bg" />
      <div className="floating-astros">
        {['red','blue','green','purple','yellow'].map((c, i) => (
          <div key={c} className="floating-astro" style={{ '--i': i }}>
            <Astronaut color={c} size={36} />
          </div>
        ))}
      </div>
      <div className="menu-container">
        <div className="menu-logo">
          <div className="menu-astro"><Astronaut color="red" size={70} /></div>
          <h1 className="game-title">PARMIS NOUS</h1>
          <p className="game-subtitle">— Among Us FR —</p>
        </div>
        <div className="menu-form">
          <input className="input" placeholder="Votre pseudo..." value={playerName}
            onChange={e => setPlayerName(e.target.value)} maxLength={12}
            onKeyDown={e => e.key === 'Enter' && (joinCode ? joinRoom() : createRoom())} />
          <div className="size-selector">
            <span className="size-label">Joueurs max :</span>
            <div className="size-options">
              {[1,2,3,4,5,6,7,8,9,10].map(n => (
                <button key={n} className={`size-btn ${maxPlayers === n ? 'active' : ''}`}
                  onClick={() => setMaxPlayers(n)}>{n}</button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary btn-big" onClick={createRoom}>🚀 Créer une partie</button>
          <div className="join-row">
            <input className="input input-code" placeholder="CODE" value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())} maxLength={4}
              onKeyDown={e => e.key === 'Enter' && joinRoom()} />
            <button className="btn btn-secondary btn-big" onClick={() => joinRoom()}>Rejoindre</button>
          </div>
        </div>
        <p className="menu-hint">ZQSD / Flèches pour se déplacer</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LOBBY SCREEN
// ═══════════════════════════════════════════════════════════════
function LobbyScreen({ roomCode, players, isHost, startGame, myId, maxPlayers, myColor }) {
  const [copied, setCopied] = useState(false);
  const playerList = Object.values(players);
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;

  const copyLink = () => {
    playSound('button');
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  const emptyCount = Math.max(0, Math.min(maxPlayers, 8) - playerList.length);

  const hint = () => {
    if (playerList.length === 1) return '🧪 Solo — vous serez imposteur !';
    if (playerList.length < 4)   return `${playerList.length} joueur(s) — invitez des amis !`;
    return `${playerList.length} joueurs — prêt pour le décollage ! 🚀`;
  };

  return (
    <div className="screen lobby-screen">
      <div className="stars-bg" />
      <div className="lobby-container">
        <h2 className="lobby-title">🛸 Salle d'attente</h2>
        <div className="room-code-block">
          <div className="room-code">
            Code : <span className="code-text">{roomCode}</span>
          </div>
          <button className="btn btn-copy" onClick={copyLink}>
            {copied ? '✅ Lien copié !' : '🔗 Copier le lien d\'invitation'}
          </button>
        </div>
        <div className="player-grid">
          {playerList.map(p => (
            <div key={p.id} className="player-card" style={{ '--pcolor': COLORS[p.color] }}>
              <Astronaut color={p.color} size={44} isHost={p.isHost} />
              <span className="player-card-name">
                {p.name}{p.id === myId ? ' (Moi)' : ''}
              </span>
            </div>
          ))}
          {Array(emptyCount).fill(0).map((_, i) => (
            <div key={i} className="player-card empty">
              <div className="empty-astro">?</div>
              <span className="player-card-name">En attente…</span>
            </div>
          ))}
        </div>
        {isHost ? (
          <>
            <p className="lobby-hint">{hint()}</p>
            <button className="btn btn-start" onClick={startGame}>▶ DÉMARRER</button>
          </>
        ) : (
          <p className="lobby-hint">En attente que l'hôte démarre…</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ROLE REVEAL SCREEN
// ═══════════════════════════════════════════════════════════════
function RoleRevealScreen({ role, myColor, onContinue }) {
  const [phase, setPhase] = useState('fade');
  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 400);
    const t2 = setTimeout(() => setPhase('ready'), 2200);
    const t3 = setTimeout(() => onContinue(), 4500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const isImpostor = role === 'impostor';
  return (
    <div className={`screen role-reveal-screen ${isImpostor ? 'impostor' : 'crewmate'} phase-${phase}`}>
      <div className="role-reveal-bg" />
      <div className="role-reveal-content">
        <div className={`role-astro-wrap ${phase === 'reveal' || phase === 'ready' ? 'show' : ''}`}>
          <Astronaut color={myColor} size={110} />
        </div>
        <div className={`role-text-wrap ${phase === 'ready' ? 'show' : ''}`}>
          <div className="role-you-are">Vous êtes</div>
          <div className={`role-big-name ${isImpostor ? 'red' : 'blue'}`}>
            {isImpostor ? '🔪 IMPOSTEUR' : '🛸 ÉQUIPAGE'}
          </div>
          <div className="role-desc">
            {isImpostor
              ? 'Éliminez l\'équipage sans vous faire démasquer !'
              : 'Complétez vos tâches et trouvez l\'imposteur !'}
          </div>
        </div>
        <button className={`btn btn-role-go ${phase === 'ready' ? 'show' : ''}`} onClick={onContinue}>
          {isImpostor ? '😈 C\'est parti !' : '💪 En avant !'}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// GAME SCREEN
// ═══════════════════════════════════════════════════════════════
function GameScreen({
  gameState, myId, myRole, myColor, myTasks, taskBarPct, tasksDone,
  nearbyTask, nearbyBody, nearbyPlayer, killCooldown, isAlive, activeTask,
  notification, killFlash, onKill, onReport, onTaskInteract, onTaskComplete,
  onEmergency, onCloseTask
}) {
  const joystickRef = useRef(null);
  const [joystick, setJoystick] = useState(null);

  // Mobile joystick
  const handleTouchStart = (e) => {
    const touch = e.touches[0];
    setJoystick({ baseX: touch.clientX, baseY: touch.clientY, dx: 0, dy: 0 });
  };
  const handleTouchMove = (e) => {
    if (!joystick) return;
    const touch = e.touches[0];
    const dx = Math.max(-1, Math.min(1, (touch.clientX - joystick.baseX) / 50));
    const dy = Math.max(-1, Math.min(1, (touch.clientY - joystick.baseY) / 50));
    setJoystick(j => ({ ...j, dx, dy }));
  };
  const handleTouchEnd = () => setJoystick(null);

  const isImpostor = myRole === 'impostor';
  const canKill = isImpostor && nearbyPlayer && killCooldown === 0;

  return (
    <div className="screen game-screen"
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>

      {/* Kill flash */}
      {killFlash && <div className="kill-flash" />}

      {/* HUD top */}
      <div className="hud-top">
        <div className={`role-badge ${isImpostor ? 'impostor' : 'crewmate'}`}>
          {isImpostor ? '🔪 IMPOSTEUR' : '🛸 ÉQUIPAGE'}
        </div>
        <div className="task-bar-wrap">
          <div className="task-bar-label">Tâches équipage</div>
          <div className="task-bar-outer">
            <div className="task-bar-inner" style={{ width: `${taskBarPct * 100}%` }} />
          </div>
        </div>
        {!isAlive && <div className="ghost-badge">👻 FANTÔME</div>}
      </div>

      {/* Map */}
      <div className="game-map">
        {/* Rooms */}
        {SHIP_ROOMS.map(room => (
          <div key={room.id} className="room"
            style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }}>
            <span className="room-label">{room.name}</span>
          </div>
        ))}

        {/* Task spots */}
        {myRole === 'crewmate' && myTasks.map(t => (
          <div key={t.id} className={`task-spot ${t.done ? 'done' : ''} ${nearbyTask?.id === t.id ? 'nearby' : ''}`}
            style={{ left: `${t.x}%`, top: `${t.y}%` }} title={t.name}>
            {t.done ? '✅' : '⚡'}
          </div>
        ))}

        {/* Dead bodies */}
        {gameState.deadBodies?.map(b => (
          <div key={b.id} className={`dead-body ${nearbyBody?.id === b.id ? 'nearby' : ''}`}
            style={{ left: `${b.x}%`, top: `${b.y}%` }}>
            <Astronaut color={b.color} size={30} dead={true} />
          </div>
        ))}

        {/* Players */}
        {Object.values(gameState.players).map(p => (
          <div key={p.id} className={`player-entity ${p.id === myId ? 'me' : ''} ${!p.alive ? 'ghost' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <Astronaut color={p.color} size={p.id === myId ? 38 : 34} dead={!p.alive} isHost={p.isHost} />
            <div className="player-nametag" style={{ color: COLORS[p.color] }}>
              {p.name}{p.id === myId ? ' ◀' : ''}{!p.alive ? ' 💀' : ''}
            </div>
          </div>
        ))}

        {/* Emergency button */}
        {isAlive && (
          <div className="emergency-btn" onClick={() => { playSound('button'); onEmergency(); }}>
            <div className="emergency-icon">🚨</div>
            <div className="emergency-label">URGENCE</div>
          </div>
        )}
      </div>

      {/* Task sidebar */}
      <div className="task-sidebar">
        <div className="sidebar-title">
          {isImpostor ? '😈 Imposteur' : `📋 Tâches (${tasksDone}/${myTasks.length})`}
        </div>
        {isImpostor
          ? <div className="impostor-tip">Éliminez l'équipage. Appelez des réunions. Semez la confusion.</div>
          : myTasks.map(t => (
              <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                <span className="task-icon">{t.done ? '✅' : '🔵'}</span>
                <span>{t.name}</span>
              </div>
            ))
        }
      </div>

      {/* Action bar */}
      {isAlive && (
        <div className="action-bar">
          {nearbyBody && (
            <button className="btn btn-report" onClick={onReport}>🚨 SIGNALER LE CORPS</button>
          )}
          {nearbyTask && myRole === 'crewmate' && (
            <button className="btn btn-task" onClick={onTaskInteract}>
              ⚡ {nearbyTask.name}
            </button>
          )}
          {isImpostor && (
            <button
              className={`btn btn-kill ${!canKill ? 'cooldown' : 'ready'}`}
              onClick={onKill} disabled={!canKill}>
              🔪 TUER {killCooldown > 0 ? `(${killCooldown}s)` : nearbyPlayer ? '' : '— Approchez'}
            </button>
          )}
        </div>
      )}

      {notification && <div className="notif">{notification}</div>}
      {activeTask && <TaskModal task={activeTask} onComplete={onTaskComplete} onClose={onCloseTask} />}
      <div className="controls-hint">ZQSD · ↑↓←→ · ou tactile</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TASK MODAL
// ═══════════════════════════════════════════════════════════════
function TaskModal({ task, onComplete, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="task-modal" onClick={e => e.stopPropagation()}>
        <div className="task-modal-header">
          <span className="task-modal-title">⚡ {task.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="task-modal-body">
          {task.type === 'wires'     && <WireTask     onComplete={() => onComplete(task.id)} />}
          {task.type === 'swipe'     && <SwipeTask    onComplete={() => onComplete(task.id)} />}
          {task.type === 'download'  && <DownloadTask onComplete={() => onComplete(task.id)} label="Téléchargement" />}
          {task.type === 'fuel'      && <DownloadTask onComplete={() => onComplete(task.id)} label="Ravitaillement" color="#ff8800" />}
          {task.type === 'asteroids' && <AsteroidTask onComplete={() => onComplete(task.id)} />}
          {task.type === 'numpad'    && <NumpadTask   onComplete={() => onComplete(task.id)} />}
        </div>
      </div>
    </div>
  );
}

function DownloadTask({ onComplete, label, color }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setPct(p => {
      if (p >= 100) { clearInterval(iv); setTimeout(onComplete, 300); return 100; }
      return p + 1.8;
    }), 50);
    return () => clearInterval(iv);
  }, []);
  const barColor = color || 'var(--cyan)';
  return (
    <div className="task-download">
      <div className="dl-label">{label || 'Téléchargement'} en cours…</div>
      <div className="dl-bar-outer"><div className="dl-bar-inner" style={{ width: `${pct}%`, background: barColor }} /></div>
      <div className="dl-pct" style={{ color: barColor }}>{Math.floor(pct)}%</div>
    </div>
  );
}

function SwipeTask({ onComplete }) {
  const [pos, setPos] = useState(0);
  const [state, setState] = useState('idle'); // idle, swiping, done

  const doSwipe = () => {
    if (state !== 'idle') return;
    setState('swiping');
    let p = 0;
    const iv = setInterval(() => {
      p += 3.5;
      setPos(p);
      if (p >= 100) {
        clearInterval(iv); setState('done');
        setTimeout(onComplete, 400);
      }
    }, 18);
  };

  return (
    <div className="task-swipe">
      <p>Glissez la carte rapidement de gauche à droite</p>
      <div className="swipe-track">
        <div className="swipe-track-bg">
          <div className="swipe-arrow">→</div>
        </div>
        <div className={`swipe-card ${state === 'done' ? 'success' : ''}`} style={{ left: `${Math.min(pos, 90)}%` }} />
      </div>
      <button className="btn btn-primary" onClick={doSwipe} disabled={state !== 'idle'}>
        {state === 'idle' ? '→ Glisser la carte' : state === 'swiping' ? '…' : '✅ Réussi !'}
      </button>
    </div>
  );
}

function WireTask({ onComplete }) {
  const colors = ['#c51111', '#132ed1', '#f5f557', '#117f2d'];
  const labels = ['Rouge', 'Bleu', 'Jaune', 'Vert'];
  const rightOrder = [2, 0, 3, 1]; // index in right column maps to which left color
  const [connected, setConnected] = useState([]);
  const [selected, setSelected] = useState(null);

  const selectLeft = (i) => {
    if (connected.includes(i)) return;
    setSelected(i);
  };

  const selectRight = (i) => {
    if (selected === null) return;
    const expectedLeft = rightOrder[i];
    const newConnected = [...connected, selectedLeft => selectedLeft];
    // correct if selected left matches what the right expects
    if (selected === rightOrder[i]) {
      const nc = [...connected, selected];
      setConnected(nc);
      setSelected(null);
      if (nc.length >= 4) setTimeout(onComplete, 400);
    } else {
      // wrong wire, shake
      setSelected(null);
    }
  };

  return (
    <div className="wire-task">
      <p>Connectez chaque fil à sa prise correspondante</p>
      <div className="wire-columns">
        <div className="wire-col left-col">
          {colors.map((c, i) => (
            <div key={i}
              className={`wire-node ${selected === i ? 'selected' : ''} ${connected.includes(i) ? 'done' : ''}`}
              style={{ '--wc': c }} onClick={() => !connected.includes(i) && selectLeft(i)}>
              <div className="wire-dot" style={{ background: c }} />
              <div className="wire-line" style={{ background: c }} />
            </div>
          ))}
        </div>
        <div className="wire-col right-col">
          {rightOrder.map((li, i) => (
            <div key={i}
              className={`wire-node ${connected.includes(li) ? 'done' : ''}`}
              style={{ '--wc': colors[li] }} onClick={() => !connected.includes(li) && selectRight(i)}>
              <div className="wire-line" style={{ background: colors[li] }} />
              <div className="wire-dot" style={{ background: colors[li] }} />
            </div>
          ))}
        </div>
      </div>
      <p className="wire-hint">Cliquez un fil gauche, puis sa prise droite</p>
    </div>
  );
}

function AsteroidTask({ onComplete }) {
  const [asteroids, setAsteroids] = useState(() =>
    Array(7).fill(0).map((_, i) => ({ id: i, x: 8 + (i * 13), y: 20 + Math.random() * 55, destroyed: false }))
  );
  const [shots, setShots] = useState([]);

  const shoot = (id, x, y) => {
    setAsteroids(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, destroyed: true } : a);
      if (updated.every(a => a.destroyed)) setTimeout(onComplete, 400);
      return updated;
    });
    setShots(s => [...s, { id: Date.now(), x, y }]);
    setTimeout(() => setShots(s => s.filter(sh => sh.id !== Date.now())), 300);
    playSound('button');
  };

  return (
    <div className="asteroid-task">
      <p>🎯 Tirez sur tous les astéroïdes !</p>
      <div className="asteroid-field">
        {asteroids.map(a => !a.destroyed && (
          <div key={a.id} className="asteroid" style={{ left: `${a.x}%`, top: `${a.y}%` }}
            onClick={(e) => shoot(a.id, a.x, a.y)}>☄️</div>
        ))}
        <div className="turret">🔫</div>
      </div>
    </div>
  );
}

function NumpadTask({ onComplete }) {
  const [code] = useState(() => Array(4).fill(0).map(() => Math.floor(Math.random() * 9) + 1).join(''));
  const [input, setInput] = useState('');
  const [shake, setShake] = useState(false);

  const press = (d) => {
    if (input.length >= 4) return;
    playSound('button');
    const next = input + d;
    setInput(next);
    if (next.length === 4) {
      if (next === code) {
        setTimeout(onComplete, 400);
      } else {
        setShake(true);
        setTimeout(() => { setInput(''); setShake(false); }, 600);
      }
    }
  };

  return (
    <div className="numpad-task">
      <div className="numpad-screen-label">Entrez le code :</div>
      <div className="numpad-code-display">{code.split('').map((d, i) => (
        <div key={i} className={`code-digit ${input.length > i ? 'filled' : ''}`}>
          {input.length > i ? input[i] : '·'}
        </div>
      ))}</div>
      <div className={`numpad-grid ${shake ? 'shake' : ''}`}>
        {[1,2,3,4,5,6,7,8,9].map(d => (
          <button key={d} className="numpad-key" onClick={() => press(String(d))}>{d}</button>
        ))}
        <button className="numpad-key numpad-clear" onClick={() => setInput('')}>⌫</button>
        <button className="numpad-key" onClick={() => press('0')}>0</button>
        <button className="numpad-key numpad-ok" onClick={() => {}}>OK</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MEETING SCREEN
// ═══════════════════════════════════════════════════════════════
function MeetingScreen({ players, myId, chatMessages, ejectedInfo, reason, onChat, onVote, isAlive }) {
  const [voted, setVoted] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [timer, setTimer] = useState(60);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  useEffect(() => {
    if (ejectedInfo) return;
    const iv = setInterval(() => setTimer(t => {
      if (t <= 1) { clearInterval(iv); return 0; }
      return t - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [ejectedInfo]);

  const handleVote = (targetId) => {
    if (voted || !isAlive) return;
    onVote(targetId);
    setVoted(true);
    setMyVote(targetId);
  };

  const alivePlayers = Object.values(players).filter(p => p.alive);
  const timerColor = timer <= 10 ? '#ff4444' : timer <= 20 ? '#ff8800' : '#38fedc';

  return (
    <div className="screen meeting-screen">
      <div className="meeting-alarm" />
      <div className="meeting-container">
        <div className="meeting-header">
          <div className="meeting-siren">🚨</div>
          <h2 className="meeting-title">RÉUNION D'URGENCE</h2>
          <p className="meeting-reason">{reason}</p>
          {!ejectedInfo && (
            <div className="meeting-timer" style={{ color: timerColor }}>⏱ {timer}s</div>
          )}
        </div>

        {ejectedInfo ? (
          <div className="ejected-panel">
            {ejectedInfo.skipped ? (
              <div className="ejected-content">
                <div className="ejected-icon">⏭️</div>
                <h3>Vote passé</h3>
                <p>Personne n'a été éjecté dans l'espace.</p>
              </div>
            ) : (
              <div className="ejected-content">
                <div className="ejected-astro-wrap">
                  <Astronaut color={ejectedInfo.color} size={90} />
                </div>
                <h3><span style={{ color: COLORS[ejectedInfo.color] }}>{ejectedInfo.name}</span> a été éjecté !</h3>
                <div className={`role-reveal-badge ${ejectedInfo.role}`}>
                  {ejectedInfo.role === 'impostor' ? '🔪 C\'était l\'IMPOSTEUR' : '🛸 C\'était un ÉQUIPIER'}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="meeting-body">
            {/* Chat */}
            <div className="meeting-chat">
              <div className="chat-messages" ref={chatRef}>
                {chatMessages.length === 0 && (
                  <div className="chat-empty">Personne n'a encore parlé…</div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className="chat-msg">
                    <div className="chat-avatar">
                      <Astronaut color={msg.color} size={22} />
                    </div>
                    <div className="chat-bubble">
                      <span className="chat-author" style={{ color: COLORS[msg.color] || '#fff' }}>
                        {msg.playerName}
                      </span>
                      <span className="chat-text">{msg.text}</span>
                    </div>
                  </div>
                ))}
              </div>
              {isAlive && !voted && (
                <div className="quick-chat">
                  {QUICK_CHAT.map((msg, i) => (
                    <button key={i} className="quick-chat-btn" onClick={() => onChat(msg)}>{msg}</button>
                  ))}
                </div>
              )}
              {!isAlive && <div className="ghost-chat-notice">👻 Les fantômes ne peuvent pas parler</div>}
            </div>

            {/* Votes */}
            <div className="vote-panel">
              <div className="vote-title">🗳️ Qui éjecter ?</div>
              <div className="vote-grid">
                {alivePlayers.map(p => (
                  <div key={p.id}
                    className={`vote-card ${voted ? 'voted' : ''} ${p.id === myId ? 'self' : 'other'} ${myVote === p.id ? 'my-pick' : ''}`}
                    onClick={() => p.id !== myId && handleVote(p.id)}
                    style={{ '--pcolor': COLORS[p.color] }}>
                    <Astronaut color={p.color} size={46} />
                    <div className="vote-name">{p.name}{p.id === myId ? ' (Moi)' : ''}</div>
                    {myVote === p.id && <div className="vote-check">✓</div>}
                  </div>
                ))}
              </div>
              {!voted && isAlive && (
                <button className="btn btn-skip" onClick={() => handleVote(null)}>⏭️ Passer le vote</button>
              )}
              {voted && (
                <div className="voted-notice">
                  {myVote ? '✅ Vote enregistré !' : '⏭️ Vote passé !'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// VICTORY SCREEN
// ═══════════════════════════════════════════════════════════════
function VictoryScreen({ winner, players, myRole, onPlayAgain }) {
  const isWin = (winner === 'crewmate' && myRole === 'crewmate') ||
                (winner === 'impostor' && myRole === 'impostor');
  const crewWon = winner === 'crewmate';
  const playerList = Object.values(players);

  return (
    <div className={`screen victory-screen ${crewWon ? 'crew-won' : 'imp-won'}`}>
      <div className="stars-bg" />
      <div className="victory-container">
        <div className="victory-astros">
          {playerList.slice(0, 5).map(p => (
            <div key={p.id} className="victory-float" style={{ '--i': playerList.indexOf(p) }}>
              <Astronaut color={p.color} size={50} />
            </div>
          ))}
        </div>
        <div className={`victory-banner ${isWin ? 'win' : 'lose'}`}>
          {isWin ? '🎉 VICTOIRE !' : '😵 DÉFAITE…'}
        </div>
        <h2 className="victory-title">
          {crewWon ? "🛸 L'Équipage a gagné !" : '🔪 Les Imposteurs ont gagné !'}
        </h2>
        <div className="victory-roles">
          {playerList.map(p => (
            <div key={p.id} className={`victory-player-card ${p.role}`} style={{ '--pcolor': COLORS[p.color] }}>
              <Astronaut color={p.color} size={36} />
              <div className="vpc-info">
                <div className="vpc-name">{p.name}</div>
                <div className={`vpc-role ${p.role}`}>
                  {p.role === 'impostor' ? '🔪 Imposteur' : '🛸 Équipage'}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn-primary btn-big" onClick={onPlayAgain}>↩ Retour au menu</button>
      </div>
    </div>
  );
}
