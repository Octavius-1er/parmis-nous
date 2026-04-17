const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ─── Game State ───────────────────────────────────────────────────────────────

const COLORS = ['red', 'blue', 'green', 'purple', 'yellow', 'orange', 'pink', 'white', 'brown', 'cyan', 'lime', 'maroon'];

const TASKS = [
  { id: 'wires1', name: 'Fix Wiring', room: 'electrical', x: 18, y: 62, type: 'wires' },
  { id: 'wires2', name: 'Fix Wiring', room: 'storage', x: 75, y: 72, type: 'wires' },
  { id: 'cards', name: 'Swipe Card', room: 'admin', x: 50, y: 35, type: 'swipe' },
  { id: 'asteroids', name: 'Clear Asteroids', room: 'weapons', x: 78, y: 20, type: 'asteroids' },
  { id: 'download1', name: 'Download Data', room: 'nav', x: 22, y: 22, type: 'download' },
  { id: 'download2', name: 'Download Data', room: 'comms', x: 47, y: 80, type: 'download' },
  { id: 'fuel1', name: 'Fuel Engines', room: 'lower-engine', x: 28, y: 85, type: 'fuel' },
  { id: 'fuel2', name: 'Fuel Engines', room: 'upper-engine', x: 28, y: 18, type: 'fuel' },
  { id: 'align', name: 'Align Engine', room: 'upper-engine', x: 18, y: 25, type: 'download' },
  { id: 'med', name: 'Submit Scan', room: 'medbay', x: 44, y: 55, type: 'download' },
  { id: 'trash', name: 'Empty Garbage', room: 'o2', x: 37, y: 42, type: 'download' },
  { id: 'chart', name: 'Chart Course', room: 'nav', x: 15, y: 28, type: 'swipe' },
];

const IMPOSTOR_COUNT = { 1: 0, 2: 0, 3: 1, 4: 1, 6: 1, 8: 2, 10: 2 };

const rooms = {}; // roomCode -> gameState

function createGameState() {
  return {
    phase: 'lobby',       // lobby | game | meeting | victory
    players: {},          // socketId -> player
    deadBodies: [],       // [{x,y,color,id}]
    meetingCaller: null,
    votes: {},            // socketId -> targetId | 'skip'
    chatMessages: [],
    winner: null,         // 'crewmate' | 'impostor'
    emergencyUsed: {},    // socketId -> bool
  };
}

function assignTasks(playerId) {
  const shuffled = [...TASKS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).map(t => ({ ...t, done: false }));
}

function spawnPosition() {
  return { x: 45 + (Math.random() - 0.5) * 10, y: 50 + (Math.random() - 0.5) * 10 };
}

function pickImpostors(players) {
  const ids = Object.keys(players);
  const count = IMPOSTOR_COUNT[Math.min(Math.max(ids.length, 4), 10)] || 1;
  const shuffled = [...ids].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function checkVictory(state) {
  const alive = Object.values(state.players).filter(p => p.alive);
  const impostors = alive.filter(p => p.role === 'impostor');
  const crewmates = alive.filter(p => p.role === 'crewmate');

  // Only check impostor-based conditions if the game has impostors
  if (state.hadImpostors) {
    if (impostors.length === 0) return 'crewmate';
    if (impostors.length >= crewmates.length) return 'impostor';
  }

  // Check task completion (works in solo mode too)
  const allCrewmates = Object.values(state.players).filter(p => p.role === 'crewmate');
  if (allCrewmates.length > 0 && allCrewmates.every(p => p.tasks.every(t => t.done))) return 'crewmate';

  return null;
}

function roomCodeExists(code) {
  return !!rooms[code];
}

function generateCode() {
  let code;
  do { code = Math.random().toString(36).substring(2, 6).toUpperCase(); }
  while (roomCodeExists(code));
  return code;
}

// ─── Socket.io ────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  console.log('connect', socket.id);

  // ── Create Room ──
  socket.on('createRoom', ({ name }, callback) => {
    const code = generateCode();
    rooms[code] = createGameState();
    const color = COLORS[0];
    rooms[code].players[socket.id] = {
      id: socket.id, name, color, x: 45, y: 50,
      alive: true, role: null, tasks: [], isHost: true, roomCode: code,
    };
    socket.join(code);
    callback({ code, color });
    io.to(code).emit('gameState', sanitize(rooms[code], socket.id));
  });

  // ── Join Room ──
  socket.on('joinRoom', ({ name, code }, callback) => {
    const state = rooms[code];
    if (!state) return callback({ error: 'Room not found' });
    if (state.phase !== 'lobby') return callback({ error: 'Game already started' });
    if (Object.keys(state.players).length >= 12) return callback({ error: 'Room full' });

    const usedColors = Object.values(state.players).map(p => p.color);
    const color = COLORS.find(c => !usedColors.includes(c)) || COLORS[0];

    state.players[socket.id] = {
      id: socket.id, name, color, x: 45, y: 50,
      alive: true, role: null, tasks: [], isHost: false, roomCode: code,
    };
    socket.join(code);
    callback({ code, color });
    io.to(code).emit('gameState', sanitize(state, socket.id));
  });

  // ── Start Game ──
  socket.on('startGame', () => {
    const player = findPlayer(socket.id);
    if (!player || !player.isHost) return;
    const state = rooms[player.roomCode];
    if (Object.keys(state.players).length < 1) return;

    state.phase = 'game';
    state.deadBodies = [];
    state.chatMessages = [];

    const impostorIds = pickImpostors(state.players);
    state.hadImpostors = impostorIds.length > 0;
    Object.values(state.players).forEach(p => {
      p.role = impostorIds.includes(p.id) ? 'impostor' : 'crewmate';
      p.tasks = p.role === 'crewmate' ? assignTasks(p.id) : [];
      p.alive = true;
      const pos = spawnPosition();
      p.x = pos.x; p.y = pos.y;
    });

    state.emergencyUsed = {};
    io.to(player.roomCode).emit('gameState', sanitize(state, null));
    Object.keys(state.players).forEach(id => {
      io.to(id).emit('yourRole', { role: state.players[id].role });
    });
  });

  // ── Player Move ──
  socket.on('move', ({ x, y }) => {
    const player = findPlayer(socket.id);
    if (!player || !player.alive) return;
    const state = rooms[player.roomCode];
    if (state.phase !== 'game') return;
    player.x = Math.max(0, Math.min(100, x));
    player.y = Math.max(0, Math.min(100, y));
    io.to(player.roomCode).emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
  });

  // ── Complete Task ──
  socket.on('completeTask', ({ taskId }) => {
    const player = findPlayer(socket.id);
    if (!player || !player.alive || player.role !== 'crewmate') return;
    const state = rooms[player.roomCode];
    const task = player.tasks.find(t => t.id === taskId);
    if (task && !task.done) {
      task.done = true;
      io.to(player.roomCode).emit('taskCompleted', { playerId: socket.id, taskId });

      const winner = checkVictory(state);
      if (winner) endGame(state, winner, player.roomCode);
    }
  });

  // ── Kill ──
  socket.on('kill', ({ targetId }) => {
    const killer = findPlayer(socket.id);
    if (!killer || !killer.alive || killer.role !== 'impostor') return;
    const state = rooms[killer.roomCode];
    if (state.phase !== 'game') return;

    const target = state.players[targetId];
    if (!target || !target.alive) return;

    const dist = Math.hypot(killer.x - target.x, killer.y - target.y);
    if (dist > 8) return; // must be close

    target.alive = false;
    state.deadBodies.push({ x: target.x, y: target.y, color: target.color, id: uuidv4() });

    io.to(killer.roomCode).emit('playerKilled', { targetId, bodies: state.deadBodies });

    const winner = checkVictory(state);
    if (winner) endGame(state, winner, killer.roomCode);
  });

  // ── Report Body ──
  socket.on('reportBody', ({ bodyId }) => {
    const player = findPlayer(socket.id);
    if (!player || !player.alive) return;
    const state = rooms[player.roomCode];
    if (state.phase !== 'game') return;
    startMeeting(state, player.roomCode, player.id, `${player.name} a reporté un corps !`);
  });

  // ── Emergency Meeting ──
  socket.on('emergencyMeeting', () => {
    const player = findPlayer(socket.id);
    if (!player || !player.alive) return;
    const state = rooms[player.roomCode];
    if (state.phase !== 'game') return;
    if (state.emergencyUsed[socket.id]) return;
    state.emergencyUsed[socket.id] = true;
    startMeeting(state, player.roomCode, player.id, `${player.name} a appelé une réunion d'urgence !`);
  });

  // ── Chat ──
  socket.on('chat', ({ text }) => {
    const player = findPlayer(socket.id);
    if (!player || !player.alive) return;
    const state = rooms[player.roomCode];
    if (state.phase !== 'meeting') return;

    const msg = { id: uuidv4(), playerId: socket.id, playerName: player.name, color: player.color, text };
    state.chatMessages.push(msg);
    io.to(player.roomCode).emit('chatMessage', msg);
  });

  // ── Vote ──
  socket.on('vote', ({ targetId }) => {
    const player = findPlayer(socket.id);
    if (!player || !player.alive) return;
    const state = rooms[player.roomCode];
    if (state.phase !== 'meeting' || state.votes[socket.id]) return;

    state.votes[socket.id] = targetId || 'skip';
    io.to(player.roomCode).emit('voted', { voterId: socket.id });

    const alivePlayers = Object.values(state.players).filter(p => p.alive);
    if (Object.keys(state.votes).length >= alivePlayers.length) {
      resolveVote(state, player.roomCode);
    }
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    const player = findPlayer(socket.id);
    if (!player) return;
    const code = player.roomCode;
    const state = rooms[code];
    delete state.players[socket.id];

    if (Object.keys(state.players).length === 0) {
      delete rooms[code];
      return;
    }

    // Assign new host if needed
    if (!Object.values(state.players).some(p => p.isHost)) {
      Object.values(state.players)[0].isHost = true;
    }

    io.to(code).emit('playerLeft', { id: socket.id });
    io.to(code).emit('gameState', sanitize(state, null));
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findPlayer(socketId) {
  for (const state of Object.values(rooms)) {
    if (state.players[socketId]) return state.players[socketId];
  }
  return null;
}

function startMeeting(state, code, callerId, reason) {
  state.phase = 'meeting';
  state.meetingCaller = callerId;
  state.votes = {};
  const systemMsg = { id: uuidv4(), playerId: 'system', playerName: 'Système', color: 'white', text: reason };
  state.chatMessages = [systemMsg];
  io.to(code).emit('meetingStart', { reason, chatMessages: state.chatMessages });
  io.to(code).emit('gameState', sanitize(state, null));
}

function resolveVote(state, code) {
  const tally = {};
  Object.values(state.votes).forEach(v => { tally[v] = (tally[v] || 0) + 1; });

  let ejected = null;
  let maxVotes = 0;
  let tie = false;

  for (const [id, count] of Object.entries(tally)) {
    if (id === 'skip') continue;
    if (count > maxVotes) { maxVotes = count; ejected = id; tie = false; }
    else if (count === maxVotes) { tie = true; }
  }

  if (tie || !ejected || (tally['skip'] || 0) >= maxVotes) ejected = null;

  if (ejected && state.players[ejected]) {
    state.players[ejected].alive = false;
    const role = state.players[ejected].role;
    io.to(code).emit('playerEjected', { ejectedId: ejected, role });
  } else {
    io.to(code).emit('voteSkipped');
  }

  const winner = checkVictory(state);
  if (winner) {
    setTimeout(() => endGame(state, winner, code), 3000);
  } else {
    setTimeout(() => {
      state.phase = 'game';
      io.to(code).emit('meetingEnd');
      io.to(code).emit('gameState', sanitize(state, null));
    }, 3000);
  }
}

function endGame(state, winner, code) {
  state.phase = 'victory';
  state.winner = winner;
  io.to(code).emit('gameOver', { winner, players: state.players });
}

function sanitize(state, requesterId) {
  const players = {};
  Object.values(state.players).forEach(p => {
    players[p.id] = {
      id: p.id, name: p.name, color: p.color, x: p.x, y: p.y,
      alive: p.alive, isHost: p.isHost,
      taskCount: p.tasks.length,
      tasksDone: p.tasks.filter(t => t.done).length,
    };
  });
  return {
    phase: state.phase,
    players,
    deadBodies: state.deadBodies,
    chatMessages: state.chatMessages,
    winner: state.winner,
  };
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
