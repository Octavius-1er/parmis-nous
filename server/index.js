const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3001;

// ── In-memory rooms ──
const rooms = {}; // code -> room

const PLAYER_COLORS = ['red','blue','green','purple','yellow','orange','pink','white','brown','cyan','lime','maroon'];

const TASK_SPOTS = [
  { id: 'wires1',    name: 'Réparer les fils',      room: 'electrical',   x: 20, y: 62, type: 'wires'     },
  { id: 'wires2',    name: 'Réparer les fils',      room: 'storage',      x: 75, y: 68, type: 'wires'     },
  { id: 'cards',     name: 'Glisser la carte',      room: 'admin',        x: 65, y: 43, type: 'swipe'     },
  { id: 'asteroids', name: 'Détruire astéroïdes',   room: 'weapons',      x: 72, y: 20, type: 'asteroids' },
  { id: 'download1', name: 'Télécharger données',   room: 'nav',          x: 18, y: 18, type: 'download'  },
  { id: 'download2', name: 'Télécharger données',   room: 'comms',        x: 52, y: 82, type: 'download'  },
  { id: 'fuel1',     name: 'Ravitailler moteur',    room: 'lower-engine', x: 10, y: 76, type: 'fuel'      },
  { id: 'fuel2',     name: 'Ravitailler moteur',    room: 'upper-engine', x: 10, y: 18, type: 'fuel'      },
  { id: 'med',       name: 'Scanner médical',       room: 'medbay',       x: 38, y: 65, type: 'download'  },
  { id: 'trash',     name: 'Vider poubelles',       room: 'o2',           x: 38, y: 25, type: 'download'  },
  { id: 'shields1',  name: 'Calibrer boucliers',    room: 'shields',      x: 76, y: 74, type: 'wires'     },
  { id: 'reactor1',  name: 'Démarrer réacteur',     room: 'reactor',      x: 10, y: 48, type: 'download'  },
];

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function getRoom(code) {
  return rooms[code];
}

function broadcastGameState(room) {
  io.to(room.code).emit('gameState', {
    phase: room.phase,
    players: room.players,
    deadBodies: room.deadBodies,
    chatMessages: room.chatMessages,
    maxPlayers: room.maxPlayers,
  });
}

function checkWinCondition(room) {
  const allPlayers = Object.values(room.players);
  const alivePlayers = allPlayers.filter(p => p.alive);
  const aliveImpostors = alivePlayers.filter(p => p.role === 'impostor');
  const aliveCrewmates = alivePlayers.filter(p => p.role === 'crewmate');
  const totalCrewmates = allPlayers.filter(p => p.role === 'crewmate');

  // Mode solo (pas de crewmates) : on laisse jouer, pas de condition de victoire imposteur
  if (totalCrewmates.length === 0) {
    // Check task win uniquement (l'imposteur explore librement)
    return false;
  }

  if (aliveImpostors.length === 0) {
    endGame(room, 'crewmate');
    return true;
  }
  // Les imposteurs gagnent seulement s'il reste des crewmates à égaler
  if (aliveCrewmates.length > 0 && aliveImpostors.length >= aliveCrewmates.length) {
    endGame(room, 'impostor');
    return true;
  }

  // Check task win
  const totalTasks = totalCrewmates.reduce((s, p) => s + (p.taskCount || 0), 0);
  const doneTasks = totalCrewmates.reduce((s, p) => s + (p.tasksDone || 0), 0);
  if (totalTasks > 0 && doneTasks >= totalTasks) {
    endGame(room, 'crewmate');
    return true;
  }

  return false;
}

function endGame(room, winner) {
  room.phase = 'ended';
  io.to(room.code).emit('gameOver', { winner, players: room.players });
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // ── Create room ──
  socket.on('createRoom', ({ name, maxPlayers }, cb) => {
    const code = generateCode();
    const color = PLAYER_COLORS[0];
    const player = {
      id: socket.id,
      name: name || 'Joueur',
      color,
      isHost: true,
      alive: true,
      role: null,
      x: 45,
      y: 50,
      tasksDone: 0,
      taskCount: 0,
    };
    rooms[code] = {
      code,
      phase: 'lobby',
      players: { [socket.id]: player },
      deadBodies: [],
      chatMessages: [],
      votes: {},
      maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 10, 1), 10),
      usedColors: [color],
    };
    socket.join(code);
    socket.roomCode = code;
    cb({ code, color });
    broadcastGameState(rooms[code]);
  });

  // ── Join room ──
  socket.on('joinRoom', ({ name, code }, cb) => {
    const room = getRoom(code);
    if (!room) return cb({ error: 'Salle introuvable.' });
    if (room.phase !== 'lobby') return cb({ error: 'Partie déjà en cours.' });
    if (Object.keys(room.players).length >= room.maxPlayers) return cb({ error: 'Salle pleine.' });

    const usedColors = room.usedColors || [];
    const color = PLAYER_COLORS.find(c => !usedColors.includes(c)) || PLAYER_COLORS[0];
    usedColors.push(color);
    room.usedColors = usedColors;

    const player = {
      id: socket.id,
      name: name || 'Joueur',
      color,
      isHost: false,
      alive: true,
      role: null,
      x: 45 + Math.random() * 10 - 5,
      y: 50 + Math.random() * 10 - 5,
      tasksDone: 0,
      taskCount: 0,
    };
    room.players[socket.id] = player;
    socket.join(code);
    socket.roomCode = code;
    cb({ color });
    broadcastGameState(room);
  });

  // ── Start game ──
  socket.on('startGame', () => {
    const room = getRoom(socket.roomCode);
    if (!room) return;
    if (!room.players[socket.id]?.isHost) return;

    const playerList = Object.values(room.players);
    const count = playerList.length;

    // Assign roles: 1 impostor per 5 players (min 1)
    const impostorCount = Math.max(1, Math.floor(count / 5));
    const shuffled = [...playerList].sort(() => Math.random() - 0.5);
    const impostors = new Set(shuffled.slice(0, impostorCount).map(p => p.id));

    playerList.forEach(p => {
      p.role = impostors.has(p.id) ? 'impostor' : 'crewmate';
      p.alive = true;
      p.tasksDone = 0;
      p.taskCount = p.role === 'crewmate' ? 4 : 0;
      p.x = 40 + Math.random() * 20;
      p.y = 40 + Math.random() * 20;
    });

    room.phase = 'game';
    room.deadBodies = [];
    room.chatMessages = [];
    room.votes = {};

    // Notify each player of their role
    playerList.forEach(p => {
      io.to(p.id).emit('yourRole', { role: p.role });
    });

    broadcastGameState(room);
  });

  // ── Move ──
  socket.on('move', ({ x, y }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'game') return;
    const player = room.players[socket.id];
    if (!player || !player.alive) return;
    player.x = Math.max(0, Math.min(98, x));
    player.y = Math.max(0, Math.min(98, y));
    io.to(room.code).emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
  });

  // ── Kill ──
  socket.on('kill', ({ targetId }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'game') return;
    const killer = room.players[socket.id];
    const target = room.players[targetId];
    if (!killer || !target) return;
    if (killer.role !== 'impostor' || !killer.alive || !target.alive) return;

    target.alive = false;
    const body = { id: uuidv4(), playerId: targetId, color: target.color, x: target.x, y: target.y };
    room.deadBodies.push(body);

    io.to(room.code).emit('playerKilled', { targetId, bodies: room.deadBodies });

    if (!checkWinCondition(room)) {
      broadcastGameState(room);
    }
  });

  // ── Report body ──
  socket.on('reportBody', ({ bodyId }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'game') return;
    const reporter = room.players[socket.id];
    if (!reporter || !reporter.alive) return;

    room.phase = 'meeting';
    room.votes = {};
    room.chatMessages = [];

    const reason = `${reporter.name} a signalé un cadavre !`;
    io.to(room.code).emit('meetingStart', { reason, chatMessages: [] });
    broadcastGameState(room);
  });

  // ── Emergency meeting ──
  socket.on('emergencyMeeting', () => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'game') return;
    const caller = room.players[socket.id];
    if (!caller || !caller.alive) return;

    room.phase = 'meeting';
    room.votes = {};
    room.chatMessages = [];

    const reason = `${caller.name} a appelé une réunion d'urgence !`;
    io.to(room.code).emit('meetingStart', { reason, chatMessages: [] });
    broadcastGameState(room);
  });

  // ── Chat ──
  socket.on('chat', ({ text }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'meeting') return;
    const player = room.players[socket.id];
    if (!player || !player.alive) return;

    const msg = {
      id: uuidv4(),
      playerId: socket.id,
      playerName: player.name,
      color: player.color,
      text: text.substring(0, 200),
    };
    room.chatMessages.push(msg);
    io.to(room.code).emit('chatMessage', msg);
  });

  // ── Vote ──
  socket.on('vote', ({ targetId }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'meeting') return;
    const voter = room.players[socket.id];
    if (!voter || !voter.alive) return;
    if (room.votes[socket.id] !== undefined) return; // already voted

    room.votes[socket.id] = targetId || null; // null = skip

    const alivePlayers = Object.values(room.players).filter(p => p.alive);
    const votedCount = alivePlayers.filter(p => room.votes[p.id] !== undefined).length;

    // When everyone voted, resolve
    if (votedCount >= alivePlayers.length) {
      resolveVotes(room);
    }
  });

  // ── Complete task ──
  socket.on('completeTask', ({ taskId }) => {
    const room = getRoom(socket.roomCode);
    if (!room || room.phase !== 'game') return;
    const player = room.players[socket.id];
    if (!player || player.role !== 'crewmate') return;

    player.tasksDone = Math.min((player.tasksDone || 0) + 1, player.taskCount);
    io.to(room.code).emit('taskCompleted', { playerId: socket.id, taskId });

    if (!checkWinCondition(room)) {
      broadcastGameState(room);
    }
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const room = getRoom(socket.roomCode);
    if (!room) return;

    delete room.players[socket.id];
    io.to(room.code).emit('playerLeft', { id: socket.id });

    const remaining = Object.values(room.players);
    if (remaining.length === 0) {
      delete rooms[room.code];
      return;
    }

    // Transfer host if needed
    if (!remaining.some(p => p.isHost)) {
      remaining[0].isHost = true;
    }

    if (room.phase === 'game') {
      checkWinCondition(room);
    }
    broadcastGameState(room);
  });
});

function resolveVotes(room) {
  const tally = {};
  Object.values(room.votes).forEach(targetId => {
    if (targetId === null) return;
    tally[targetId] = (tally[targetId] || 0) + 1;
  });

  let maxVotes = 0;
  let ejected = null;
  let tie = false;

  Object.entries(tally).forEach(([id, count]) => {
    if (count > maxVotes) {
      maxVotes = count;
      ejected = id;
      tie = false;
    } else if (count === maxVotes) {
      tie = true;
    }
  });

  if (tie || !ejected) {
    io.to(room.code).emit('voteSkipped');
  } else {
    const player = room.players[ejected];
    if (player) {
      player.alive = false;
      io.to(room.code).emit('playerEjected', { ejectedId: ejected, role: player.role });
    }
  }

  // Resume game after delay
  setTimeout(() => {
    room.phase = 'game';
    room.votes = {};
    if (!checkWinCondition(room)) {
      io.to(room.code).emit('meetingEnd');
      broadcastGameState(room);
    }
  }, 5000);
}

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
