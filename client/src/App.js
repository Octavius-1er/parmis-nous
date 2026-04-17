import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './styles/App.css';

const SERVER_URL = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';

const PLAYER_COLORS = {
  red: '#c51111', blue: '#132ed1', green: '#117f2d', purple: '#6b2fbb',
  yellow: '#f5f557', orange: '#ef7d0d', pink: '#ec54bb', white: '#d7e1f1',
  brown: '#71491e', cyan: '#38fedc', lime: '#50ef39', maroon: '#6b2737',
};

const QUICK_CHAT = [
  "C'est moi, je suis crewmate !",
  "J'ai vu quelqu'un tuer !",
  "J'ai un alibi, j'étais aux tâches.",
  "Votez pour lui, c'est l'imposteur !",
  "Je suis innocent !",
  "Passer / Skip le vote",
  "On se regroupe !",
  "Où étais-tu ?",
  "Je te suis depuis un moment.",
  "C'est suspect...",
  "Je viens de finir mes tâches !",
  "Quelqu'un m'a suivie dans les couloirs.",
];

const SHIP_ROOMS = [
  { id: 'cafeteria', name: 'Cafétéria', x: 35, y: 38, w: 26, h: 20 },
  { id: 'weapons', name: 'Armement', x: 63, y: 14, w: 18, h: 16 },
  { id: 'nav', name: 'Navigation', x: 10, y: 12, w: 20, h: 18 },
  { id: 'admin', name: 'Admin', x: 60, y: 38, w: 18, h: 14 },
  { id: 'electrical', name: 'Électrique', x: 12, y: 56, w: 16, h: 16 },
  { id: 'storage', name: 'Stockage', x: 60, y: 60, w: 20, h: 18 },
  { id: 'medbay', name: 'Médical', x: 32, y: 60, w: 16, h: 16 },
  { id: 'security', name: 'Sécurité', x: 12, y: 34, w: 16, h: 16 },
  { id: 'o2', name: 'O2', x: 32, y: 20, w: 14, h: 14 },
  { id: 'comms', name: 'Comm.', x: 48, y: 78, w: 14, h: 14 },
  { id: 'upper-engine', name: 'Moteur Haut', x: 5, y: 12, w: 14, h: 14 },
  { id: 'lower-engine', name: 'Moteur Bas', x: 5, y: 72, w: 14, h: 14 },
  { id: 'reactor', name: 'Réacteur', x: 5, y: 38, w: 14, h: 20 },
  { id: 'shields', name: 'Boucliers', x: 70, y: 68, w: 14, h: 16 },
];

const TASK_SPOTS = [
  { id: 'wires1', name: 'Réparer les fils', room: 'electrical', x: 20, y: 62, type: 'wires' },
  { id: 'wires2', name: 'Réparer les fils', room: 'storage', x: 75, y: 68, type: 'wires' },
  { id: 'cards', name: 'Glisser la carte', room: 'admin', x: 65, y: 43, type: 'swipe' },
  { id: 'asteroids', name: 'Détruire astéroïdes', room: 'weapons', x: 72, y: 20, type: 'asteroids' },
  { id: 'download1', name: 'Télécharger données', room: 'nav', x: 18, y: 18, type: 'download' },
  { id: 'download2', name: 'Télécharger données', room: 'comms', x: 52, y: 82, type: 'download' },
  { id: 'fuel1', name: 'Ravitailler moteur', room: 'lower-engine', x: 10, y: 76, type: 'fuel' },
  { id: 'fuel2', name: 'Ravitailler moteur', room: 'upper-engine', x: 10, y: 18, type: 'fuel' },
  { id: 'med', name: 'Scanner médical', room: 'medbay', x: 38, y: 65, type: 'download' },
  { id: 'trash', name: 'Vider poubelles', room: 'o2', x: 38, y: 25, type: 'download' },
  { id: 'shields1', name: 'Calibrer boucliers', room: 'shields', x: 76, y: 74, type: 'wires' },
  { id: 'reactor1', name: 'Démarrer réacteur', room: 'reactor', x: 10, y: 48, type: 'download' },
];

export default function App() {
  const [screen, setScreen] = useState('menu'); // menu | lobby | game | meeting | victory
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [myId, setMyId] = useState(null);
  const [myColor, setMyColor] = useState('red');
  const [myRole, setMyRole] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [myTasks, setMyTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [notification, setNotification] = useState(null);
  const [ejectedInfo, setEjectedInfo] = useState(null);
  const [killCooldown, setKillCooldown] = useState(0);
  const [nearbyTask, setNearbyTask] = useState(null);
  const [nearbyBody, setNearbyBody] = useState(null);
  const [nearbyPlayer, setNearbyPlayer] = useState(null);
  const [winner, setWinner] = useState(null);
  const [meetingReason, setMeetingReason] = useState('');

  const socketRef = useRef(null);
  const gameAreaRef = useRef(null);
  const killCooldownRef = useRef(null);
  const myPosRef = useRef({ x: 45, y: 50 });
  const keysRef = useRef({});
  const moveIntervalRef = useRef(null);

  // ── Init Socket ──
  useEffect(() => {
    const socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('gameState', (state) => {
      setGameState(state);
      if (state.phase === 'meeting' && screen !== 'meeting') {
        setScreen('meeting');
        setChatMessages(state.chatMessages || []);
      }
      if (state.phase === 'game' && screen === 'meeting') {
        setScreen('game');
        setEjectedInfo(null);
      }
      if (state.phase === 'lobby') setScreen('lobby');
    });

    socket.on('yourRole', ({ role }) => {
      setMyRole(role);
    });

    socket.on('playerMoved', ({ id, x, y }) => {
      setGameState(prev => {
        if (!prev || !prev.players[id]) return prev;
        const updated = { ...prev, players: { ...prev.players, [id]: { ...prev.players[id], x, y } } };
        return updated;
      });
    });

    socket.on('chatMessage', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    socket.on('meetingStart', ({ reason, chatMessages: msgs }) => {
      setMeetingReason(reason);
      setChatMessages(msgs || []);
      setScreen('meeting');
      showNotif('📢 ' + reason);
    });

    socket.on('meetingEnd', () => {
      setScreen('game');
      setEjectedInfo(null);
    });

    socket.on('playerKilled', ({ targetId, bodies }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const updated = { ...prev, deadBodies: bodies };
        if (updated.players[targetId]) {
          updated.players = { ...updated.players, [targetId]: { ...updated.players[targetId], alive: false } };
        }
        return updated;
      });
    });

    socket.on('taskCompleted', ({ playerId, taskId }) => {
      if (playerId === socketRef.current?.id) {
        setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: true } : t));
      }
    });

    socket.on('playerEjected', ({ ejectedId, role }) => {
      setGameState(prev => {
        if (!prev || !prev.players[ejectedId]) return prev;
        const p = prev.players[ejectedId];
        setEjectedInfo({ name: p.name, color: p.color, role });
        return { ...prev, players: { ...prev.players, [ejectedId]: { ...p, alive: false } } };
      });
    });

    socket.on('voteSkipped', () => {
      setEjectedInfo({ skipped: true });
    });

    socket.on('playerLeft', ({ id }) => {
      setGameState(prev => {
        if (!prev) return prev;
        const players = { ...prev.players };
        delete players[id];
        return { ...prev, players };
      });
    });

    socket.on('gameOver', ({ winner: w, players }) => {
      setWinner(w);
      setScreen('victory');
    });

    return () => socket.disconnect();
  }, []);

  // ── Assign my tasks when role arrives ──
  useEffect(() => {
    if (myRole === 'crewmate' && myTasks.length === 0) {
      const shuffled = [...TASK_SPOTS].sort(() => Math.random() - 0.5).slice(0, 4);
      setMyTasks(shuffled.map(t => ({ ...t, done: false })));
    }
  }, [myRole]);

  // ── Movement ──
  useEffect(() => {
    if (screen !== 'game') return;

    const onKey = (e) => { keysRef.current[e.key] = e.type === 'keydown'; };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);

    moveIntervalRef.current = setInterval(() => {
      const k = keysRef.current;
      let { x, y } = myPosRef.current;
      const speed = 0.6;
      if (k['ArrowUp'] || k['z'] || k['w']) y = Math.max(0, y - speed);
      if (k['ArrowDown'] || k['s']) y = Math.min(98, y + speed);
      if (k['ArrowLeft'] || k['q'] || k['a']) x = Math.max(0, x - speed);
      if (k['ArrowRight'] || k['d']) x = Math.min(98, x + speed);

      if (x !== myPosRef.current.x || y !== myPosRef.current.y) {
        myPosRef.current = { x, y };
        socketRef.current?.emit('move', { x, y });
        setGameState(prev => {
          if (!prev || !myId || !prev.players[myId]) return prev;
          return { ...prev, players: { ...prev.players, [myId]: { ...prev.players[myId], x, y } } };
        });
        checkProximity(x, y);
      }
    }, 30);

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      clearInterval(moveIntervalRef.current);
    };
  }, [screen, myId, myTasks]);

  // Kill cooldown
  useEffect(() => {
    if (screen !== 'game') return;
    setKillCooldown(30);
    killCooldownRef.current = setInterval(() => {
      setKillCooldown(p => Math.max(0, p - 1));
    }, 1000);
    return () => clearInterval(killCooldownRef.current);
  }, [screen]);

  const checkProximity = useCallback((x, y) => {
    if (!gameState) return;
    // Check tasks
    const task = myTasks.find(t => !t.done && Math.hypot(x - t.x, y - t.y) < 6);
    setNearbyTask(task || null);
    // Check bodies
    const body = gameState?.deadBodies?.find(b => Math.hypot(x - b.x, y - b.y) < 6);
    setNearbyBody(body || null);
    // Check players (for kill)
    const otherPlayer = Object.values(gameState?.players || {}).find(p =>
      p.id !== myId && p.alive && Math.hypot(x - p.x, y - p.y) < 8
    );
    setNearbyPlayer(otherPlayer || null);
  }, [gameState, myTasks, myId]);

  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  // ── Handlers ──
  const createRoom = () => {
    if (!playerName.trim()) return;
    socketRef.current?.emit('createRoom', { name: playerName }, ({ code, color }) => {
      setRoomCode(code);
      setMyId(socketRef.current.id);
      setMyColor(color);
      setScreen('lobby');
    });
  };

  const joinRoom = () => {
    if (!playerName.trim() || !joinCode.trim()) return;
    socketRef.current?.emit('joinRoom', { name: playerName, code: joinCode.toUpperCase() }, (res) => {
      if (res.error) return showNotif('❌ ' + res.error);
      setRoomCode(joinCode.toUpperCase());
      setMyId(socketRef.current.id);
      setMyColor(res.color);
      setScreen('lobby');
    });
  };

  const startGame = () => socketRef.current?.emit('startGame');

  const handleKill = () => {
    if (!nearbyPlayer || killCooldown > 0 || myRole !== 'impostor') return;
    socketRef.current?.emit('kill', { targetId: nearbyPlayer.id });
    setKillCooldown(30);
  };

  const handleTaskInteract = () => {
    if (!nearbyTask) return;
    setActiveTask(nearbyTask);
  };

  const handleTaskComplete = (taskId) => {
    socketRef.current?.emit('completeTask', { taskId });
    setMyTasks(prev => prev.map(t => t.id === taskId ? { ...t, done: true } : t));
    setActiveTask(null);
    showNotif('✅ Tâche accomplie !');
  };

  const handleReport = () => {
    if (!nearbyBody) return;
    socketRef.current?.emit('reportBody', { bodyId: nearbyBody.id });
  };

  const handleEmergency = () => {
    socketRef.current?.emit('emergencyMeeting');
  };

  const handleSendChat = (text) => {
    socketRef.current?.emit('chat', { text });
  };

  const handleVote = (targetId) => {
    socketRef.current?.emit('vote', { targetId });
  };

  const resetGame = () => {
    setScreen('menu');
    setMyRole(null);
    setMyTasks([]);
    setGameState(null);
    setWinner(null);
    setEjectedInfo(null);
    setRoomCode('');
    setJoinCode('');
    setActiveTask(null);
  };

  // ── Task progress ──
  const taskProgress = myRole === 'crewmate'
    ? myTasks.filter(t => t.done).length / Math.max(myTasks.length, 1)
    : 0;

  const myPlayer = gameState?.players?.[myId];
  const isAlive = myPlayer?.alive ?? true;
  const isHost = myPlayer?.isHost ?? false;

  // ── Render ──
  return (
    <div className="app">
      {screen === 'menu' && <MenuScreen playerName={playerName} setPlayerName={setPlayerName} joinCode={joinCode} setJoinCode={setJoinCode} createRoom={createRoom} joinRoom={joinRoom} />}
      {screen === 'lobby' && <LobbyScreen roomCode={roomCode} players={gameState?.players || {}} isHost={isHost} startGame={startGame} myId={myId} />}
      {screen === 'game' && gameState && (
        <GameScreen
          gameState={gameState}
          myId={myId}
          myRole={myRole}
          myColor={myColor}
          myTasks={myTasks}
          taskProgress={taskProgress}
          nearbyTask={nearbyTask}
          nearbyBody={nearbyBody}
          nearbyPlayer={nearbyPlayer}
          killCooldown={killCooldown}
          isAlive={isAlive}
          activeTask={activeTask}
          notification={notification}
          onKill={handleKill}
          onReport={handleReport}
          onTaskInteract={handleTaskInteract}
          onTaskComplete={handleTaskComplete}
          onEmergency={handleEmergency}
          onCloseTask={() => setActiveTask(null)}
          gameAreaRef={gameAreaRef}
        />
      )}
      {screen === 'meeting' && (
        <MeetingScreen
          players={gameState?.players || {}}
          myId={myId}
          chatMessages={chatMessages}
          ejectedInfo={ejectedInfo}
          reason={meetingReason}
          onChat={handleSendChat}
          onVote={handleVote}
          isAlive={isAlive}
        />
      )}
      {screen === 'victory' && (
        <VictoryScreen winner={winner} players={gameState?.players || {}} myRole={myRole} onPlayAgain={resetGame} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MENU SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function MenuScreen({ playerName, setPlayerName, joinCode, setJoinCode, createRoom, joinRoom }) {
  return (
    <div className="screen menu-screen">
      <div className="menu-stars" />
      <div className="menu-container">
        <h1 className="game-title">AMONG US</h1>
        <div className="astronaut-logo">🧑‍🚀</div>
        <div className="menu-form">
          <input
            className="input"
            placeholder="Votre pseudo..."
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            maxLength={12}
          />
          <div className="menu-buttons">
            <button className="btn btn-primary" onClick={createRoom}>Créer une partie</button>
            <div className="join-row">
              <input
                className="input input-code"
                placeholder="Code..."
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
              />
              <button className="btn btn-secondary" onClick={joinRoom}>Rejoindre</button>
            </div>
          </div>
        </div>
        <p className="menu-hint">Utilisez ZQSD ou les flèches pour bouger</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOBBY SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function LobbyScreen({ roomCode, players, isHost, startGame, myId }) {
  const playerList = Object.values(players);
  return (
    <div className="screen lobby-screen">
      <div className="lobby-container">
        <h2 className="lobby-title">Salle d'attente</h2>
        <div className="room-code">
          Code : <span className="code-text">{roomCode}</span>
        </div>
        <div className="player-list">
          {playerList.map(p => (
            <div key={p.id} className="player-slot" style={{ '--color': PLAYER_COLORS[p.color] }}>
              <svg width="28" height="36" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
                <rect x="22" y="18" width="8" height="12" rx="3" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"/>
                <ellipse cx="15" cy="26" rx="13" ry="12" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"/>
                <ellipse cx="15" cy="14" rx="11" ry="12" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"/>
                <ellipse cx="18" cy="12" rx="7" ry="5" fill="rgba(100,210,255,0.9)"/>
                <ellipse cx="15" cy="10" rx="3" ry="2" fill="rgba(255,255,255,0.5)"/>
                <rect x="8" y="35" width="6" height="5" rx="2" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
                <rect x="16" y="35" width="6" height="5" rx="2" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
              </svg>
              <span className="player-slot-name">{p.name}{p.id === myId ? ' (Moi)' : ''}{p.isHost ? ' 👑' : ''}</span>
            </div>
          ))}
          {Array(Math.max(0, 4 - playerList.length)).fill(0).map((_, i) => (
            <div key={i} className="player-slot empty">
              <span className="player-icon">❓</span>
              <span className="player-slot-name">En attente...</span>
            </div>
          ))}
        </div>
        {isHost ? (
          <div>
            <p className="lobby-hint">{playerList.length < 1 ? 'Entrez votre pseudo !' : playerList.length === 1 ? '🧪 Mode solo activé — prêt à tester !' : 'Prêt à jouer !'}</p>
            <button className="btn btn-start" onClick={startGame} disabled={playerList.length < 1}>
              Démarrer la partie
            </button>
          </div>
        ) : (
          <p className="lobby-hint">En attente que l'hôte démarre...</p>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function GameScreen({
  gameState, myId, myRole, myColor, myTasks, taskProgress,
  nearbyTask, nearbyBody, nearbyPlayer, killCooldown, isAlive, activeTask,
  notification, onKill, onReport, onTaskInteract, onTaskComplete, onEmergency, onCloseTask, gameAreaRef
}) {
  const me = gameState.players[myId];
  const totalTasks = Object.values(gameState.players)
    .reduce((sum, p) => sum + (p.tasksDone || 0), 0);
  const maxTasks = Object.values(gameState.players)
    .reduce((sum, p) => sum + (p.taskCount || 0), 0);
  const overallProgress = maxTasks > 0 ? totalTasks / maxTasks : 0;

  return (
    <div className="screen game-screen">
      {/* HUD */}
      <div className="hud-top">
        <div className="role-badge" style={{ background: myRole === 'impostor' ? '#c51111' : '#117f2d' }}>
          {myRole === 'impostor' ? '🔪 IMPOSTEUR' : '🛸 ÉQUIPAGE'}
        </div>
        <div className="task-bar-container">
          <div className="task-bar-label">Tâches équipage</div>
          <div className="task-bar-outer">
            <div className="task-bar-inner" style={{ width: `${overallProgress * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="game-map" ref={gameAreaRef}>
        {/* Rooms */}
        {SHIP_ROOMS.map(room => (
          <div key={room.id} className="room" style={{ left: `${room.x}%`, top: `${room.y}%`, width: `${room.w}%`, height: `${room.h}%` }}>
            <span className="room-label">{room.name}</span>
          </div>
        ))}

        {/* Task spots */}
        {myRole === 'crewmate' && myTasks.map(task => (
          <div
            key={task.id}
            className={`task-spot ${task.done ? 'done' : ''}`}
            style={{ left: `${task.x}%`, top: `${task.y}%` }}
            title={task.name}
          >
            {task.done ? '✅' : '⚡'}
          </div>
        ))}

        {/* Dead bodies */}
        {gameState.deadBodies?.map(body => (
          <div key={body.id} className="dead-body" style={{ left: `${body.x}%`, top: `${body.y}%`, color: PLAYER_COLORS[body.color] }}>
            💀
          </div>
        ))}

        {/* Players */}
        {Object.values(gameState.players).map(p => (
          <div
            key={p.id}
            className={`player ${!p.alive ? 'dead' : ''} ${p.id === myId ? 'me' : ''}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, '--pcolor': PLAYER_COLORS[p.color] }}
          >
            <svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
              {/* Backpack */}
              <rect x="22" y="18" width="8" height="12" rx="3" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"/>
              {/* Body */}
              <ellipse cx="15" cy="26" rx="13" ry="12" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"/>
              {/* Head */}
              <ellipse cx="15" cy="14" rx="11" ry="12" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"/>
              {/* Visor */}
              <ellipse cx="18" cy="12" rx="7" ry="5" fill="rgba(100,210,255,0.9)" stroke="rgba(80,180,230,0.6)" strokeWidth="1"/>
              {/* Visor shine */}
              <ellipse cx="15" cy="10" rx="3" ry="2" fill="rgba(255,255,255,0.5)"/>
              {/* Left leg */}
              <rect x="8" y="35" width="6" height="5" rx="2" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              {/* Right leg */}
              <rect x="16" y="35" width="6" height="5" rx="2" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              {/* Dead X eyes */}
              {!p.alive && <>
                <line x1="13" y1="10" x2="17" y2="14" stroke="red" strokeWidth="2"/>
                <line x1="17" y1="10" x2="13" y2="14" stroke="red" strokeWidth="2"/>
              </>}
              {/* Host crown */}
              {p.isHost && <text x="8" y="5" fontSize="10">👑</text>}
            </svg>
            <div className="player-name-tag">{p.name}{!p.alive ? ' 💀' : ''}</div>
          </div>
        ))}

        {/* Emergency button */}
        {isAlive && (
          <div className="emergency-btn" onClick={onEmergency} title="Réunion d'urgence">
            🚨
            <span className="emergency-label">URGENCE</span>
          </div>
        )}
      </div>

      {/* Task list sidebar */}
      <div className="task-sidebar">
        <div className="task-sidebar-title">Mes Tâches</div>
        {myRole === 'crewmate' ? myTasks.map(t => (
          <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
            {t.done ? '✅' : '🔵'} {t.name}
          </div>
        )) : (
          <div className="impostor-hint">🔪 Éliminez l'équipage sans vous faire remarquer !</div>
        )}
      </div>

      {/* Action buttons */}
      {isAlive && (
        <div className="action-bar">
          {nearbyBody && (
            <button className="btn btn-report" onClick={onReport}>🚨 SIGNALER</button>
          )}
          {nearbyTask && myRole === 'crewmate' && (
            <button className="btn btn-task" onClick={onTaskInteract}>⚡ TÂCHE : {nearbyTask.name}</button>
          )}
          {myRole === 'impostor' && (
            <button
              className={`btn btn-kill ${killCooldown > 0 || !nearbyPlayer ? 'disabled' : ''}`}
              onClick={onKill}
              disabled={killCooldown > 0 || !nearbyPlayer}
            >
              🔪 TUER {killCooldown > 0 ? `(${killCooldown}s)` : ''}
            </button>
          )}
        </div>
      )}

      {/* Ghost overlay */}
      {!isAlive && (
        <div className="ghost-overlay">👻 Vous êtes mort - continuez vos tâches !</div>
      )}

      {/* Notification */}
      {notification && <div className="notification">{notification}</div>}

      {/* Task modal */}
      {activeTask && (
        <TaskModal task={activeTask} onComplete={onTaskComplete} onClose={onCloseTask} />
      )}

      {/* Controls hint */}
      <div className="controls-hint">ZQSD / ↑↓←→ pour se déplacer</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TASK MODAL
// ══════════════════════════════════════════════════════════════════════════════
function TaskModal({ task, onComplete, onClose }) {
  const [progress, setProgress] = useState(0);
  const [wireState, setWireState] = useState(null);
  const [swipePos, setSwipePos] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const [swipeSuccess, setSwipeSuccess] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (task.type === 'download' || task.type === 'fuel') {
      intervalRef.current = setInterval(() => {
        setDownloadProgress(p => {
          if (p >= 100) {
            clearInterval(intervalRef.current);
            setTimeout(() => onComplete(task.id), 300);
            return 100;
          }
          return p + 2;
        });
      }, 50);
    }
    if (task.type === 'wires') {
      setWireState({ connected: [], dragging: null });
    }
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleSwipe = () => {
    if (swiping) return;
    setSwiping(true);
    let pos = 0;
    const iv = setInterval(() => {
      pos += 4;
      setSwipePos(pos);
      if (pos >= 100) {
        clearInterval(iv);
        setSwipeSuccess(true);
        setTimeout(() => onComplete(task.id), 500);
      }
    }, 20);
  };

  const handleWireConnect = (from, to) => {
    const newConnected = [...(wireState?.connected || []), { from, to }];
    setWireState({ connected: newConnected, dragging: null });
    if (newConnected.length >= 3) {
      setTimeout(() => onComplete(task.id), 400);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="task-modal" onClick={e => e.stopPropagation()}>
        <div className="task-modal-header">
          <span className="task-modal-title">{task.name}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {task.type === 'download' && (
          <div className="task-download">
            <div className="download-bar-outer">
              <div className="download-bar-inner" style={{ width: `${downloadProgress}%` }} />
            </div>
            <div className="download-pct">{downloadProgress}%</div>
            <p>Téléchargement en cours...</p>
          </div>
        )}

        {task.type === 'fuel' && (
          <div className="task-download">
            <div className="download-bar-outer fuel">
              <div className="download-bar-inner fuel-bar" style={{ width: `${downloadProgress}%` }} />
            </div>
            <div className="download-pct">{downloadProgress}%</div>
            <p>Ravitaillement du moteur...</p>
          </div>
        )}

        {task.type === 'swipe' && (
          <div className="task-swipe">
            <p>Glissez la carte de gauche à droite rapidement</p>
            <div className="swipe-track">
              <div className={`swipe-card ${swipeSuccess ? 'success' : ''}`} style={{ left: `${swipePos}%` }} />
            </div>
            <button className="btn btn-primary" onClick={handleSwipe} disabled={swiping}>
              {swiping ? (swipeSuccess ? '✅ Succès !' : 'En cours...') : '→ Glisser'}
            </button>
          </div>
        )}

        {task.type === 'wires' && (
          <WireTask onComplete={() => onComplete(task.id)} connected={wireState?.connected || []} onConnect={handleWireConnect} />
        )}

        {task.type === 'asteroids' && (
          <AsteroidTask onComplete={() => onComplete(task.id)} />
        )}
      </div>
    </div>
  );
}

function WireTask({ onComplete, onConnect }) {
  const colors = ['red', 'blue', 'yellow', 'green'];
  const [connected, setConnected] = useState([]);
  const [selected, setSelected] = useState(null);

  const connect = (color) => {
    if (!selected) { setSelected(color); return; }
    if (selected === color) {
      const newC = [...connected, color];
      setConnected(newC);
      setSelected(null);
      if (newC.length >= 4) setTimeout(onComplete, 300);
    } else {
      setSelected(color);
    }
  };

  return (
    <div className="wire-task">
      <p>Connectez les fils de même couleur</p>
      <div className="wire-columns">
        <div className="wire-col">
          {colors.map(c => (
            <div key={c} className={`wire-node left ${selected === c ? 'selected' : ''} ${connected.includes(c) ? 'done' : ''}`}
              style={{ background: c }} onClick={() => !connected.includes(c) && connect(c)} />
          ))}
        </div>
        <div className="wire-col">
          {[...colors].reverse().map(c => (
            <div key={c} className={`wire-node right ${selected === c ? 'selected' : ''} ${connected.includes(c) ? 'done' : ''}`}
              style={{ background: c }} onClick={() => !connected.includes(c) && connect(c)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AsteroidTask({ onComplete }) {
  const [asteroids, setAsteroids] = useState(() =>
    Array(6).fill(0).map((_, i) => ({ id: i, x: 20 + i * 12, y: 20 + Math.random() * 60, destroyed: false }))
  );
  const [shots, setShots] = useState(0);

  const shoot = (id) => {
    setAsteroids(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, destroyed: true } : a);
      if (updated.every(a => a.destroyed)) setTimeout(onComplete, 300);
      return updated;
    });
  };

  return (
    <div className="asteroid-task">
      <p>Cliquez sur les astéroïdes pour les détruire !</p>
      <div className="asteroid-field">
        {asteroids.map(a => (
          !a.destroyed && (
            <div key={a.id} className="asteroid" style={{ left: `${a.x}%`, top: `${a.y}%` }}
              onClick={() => shoot(a.id)}>☄️</div>
          )
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MEETING SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function MeetingScreen({ players, myId, chatMessages, ejectedInfo, reason, onChat, onVote, isAlive }) {
  const [voted, setVoted] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chatMessages]);

  const handleVote = (targetId) => {
    if (voted || !isAlive) return;
    onVote(targetId);
    setVoted(true);
  };

  const alivePlayers = Object.values(players).filter(p => p.alive);

  return (
    <div className="screen meeting-screen">
      <div className="meeting-container">
        <div className="meeting-header">
          <h2 className="meeting-title">🚨 RÉUNION D'URGENCE 🚨</h2>
          <p className="meeting-reason">{reason}</p>
        </div>

        {ejectedInfo ? (
          <div className="ejected-panel">
            {ejectedInfo.skipped ? (
              <div className="ejected-info">⏭️ Vote passé. Personne n'a été éjecté.</div>
            ) : (
              <div className="ejected-info">
                <div className="ejected-astronaut" style={{ '--color': PLAYER_COLORS[ejectedInfo.color] }}>🧑‍🚀</div>
                <p><strong>{ejectedInfo.name}</strong> a été éjecté dans l'espace !</p>
                <p className="role-reveal">C'était {ejectedInfo.role === 'impostor' ? '🔪 un Imposteur' : '🛸 un membre de l\'équipage'}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="meeting-body">
            {/* Chat */}
            <div className="meeting-chat">
              <div className="chat-messages" ref={chatRef}>
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`chat-msg ${msg.playerId === 'system' ? 'system' : ''}`}>
                    {msg.playerId !== 'system' && (
                      <span className="chat-author" style={{ color: PLAYER_COLORS[msg.color] || '#fff' }}>
                        {msg.playerName}:
                      </span>
                    )}
                    <span className="chat-text">{msg.text}</span>
                  </div>
                ))}
              </div>
              {isAlive && !voted && (
                <div className="quick-chat">
                  {QUICK_CHAT.map((msg, i) => (
                    <button key={i} className="quick-chat-btn" onClick={() => onChat(msg)}>
                      {msg}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Vote */}
            <div className="vote-panel">
              <div className="vote-title">Voter pour éjecter :</div>
              <div className="vote-grid">
                {alivePlayers.map(p => (
                  <div
                    key={p.id}
                    className={`vote-card ${voted ? 'voted' : ''} ${p.id === myId ? 'self' : ''}`}
                    onClick={() => p.id !== myId && handleVote(p.id)}
                    style={{ '--pcolor': PLAYER_COLORS[p.color] }}
                  >
                    <svg width="36" height="44" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">
                      <rect x="22" y="18" width="8" height="12" rx="3" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"/>
                      <ellipse cx="15" cy="26" rx="13" ry="12" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"/>
                      <ellipse cx="15" cy="14" rx="11" ry="12" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1.5"/>
                      <ellipse cx="18" cy="12" rx="7" ry="5" fill="rgba(100,210,255,0.9)"/>
                      <ellipse cx="15" cy="10" rx="3" ry="2" fill="rgba(255,255,255,0.5)"/>
                      <rect x="8" y="35" width="6" height="5" rx="2" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
                      <rect x="16" y="35" width="6" height="5" rx="2" fill={PLAYER_COLORS[p.color]} stroke="rgba(0,0,0,0.3)" strokeWidth="1"/>
                    </svg>
                    <div className="vote-name">{p.name}{p.id === myId ? ' (Moi)' : ''}</div>
                  </div>
                ))}
              </div>
              {!voted && isAlive && (
                <button className="btn btn-skip" onClick={() => handleVote(null)}>⏭️ Passer le vote</button>
              )}
              {voted && <div className="voted-notice">✅ Vote enregistré !</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VICTORY SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function VictoryScreen({ winner, players, myRole, onPlayAgain }) {
  const isWin = (winner === 'crewmate' && myRole === 'crewmate') || (winner === 'impostor' && myRole === 'impostor');
  return (
    <div className="screen victory-screen">
      <div className="victory-container">
        <div className="victory-icon">{winner === 'crewmate' ? '🛸' : '🔪'}</div>
        <h2 className="victory-title">{winner === 'crewmate' ? 'Victoire de l\'Équipage !' : 'Victoire des Imposteurs !'}</h2>
        <p className="victory-sub">{isWin ? '🎉 Vous avez gagné !' : '😢 Vous avez perdu...'}</p>
        <div className="victory-roles">
          {Object.values(players).map(p => (
            <div key={p.id} className="victory-player" style={{ '--color': PLAYER_COLORS[p.color] }}>
              <span>🧑‍🚀 {p.name}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={onPlayAgain}>Retour au menu</button>
      </div>
    </div>
  );
}
