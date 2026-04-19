const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  // Augmenter les timeouts pour éviter les déconnexions intempestives
  pingTimeout: 60000,
  pingInterval: 25000,
});

const PORT = process.env.PORT || 3001;
const rooms = {};
const PLAYER_COLORS = ['red','blue','green','purple','yellow','orange','pink','white','brown','cyan','lime','maroon'];

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
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

function endGame(room, winner) {
  room.phase = 'ended';
  io.to(room.code).emit('gameOver', { winner, players: room.players });
}

function checkWinCondition(room) {
  const allPlayers = Object.values(room.players);
  const alive = allPlayers.filter(p => p.alive);
  const aliveImpostors = alive.filter(p => p.role === 'impostor');
  const aliveCrewmates = alive.filter(p => p.role === 'crewmate');
  const allCrewmates = allPlayers.filter(p => p.role === 'crewmate');

  if (allCrewmates.length === 0) return false;
  if (aliveImpostors.length === 0) { endGame(room, 'crewmate'); return true; }
  if (aliveCrewmates.length > 0 && aliveImpostors.length >= aliveCrewmates.length) { endGame(room, 'impostor'); return true; }

  const totalTasks = allCrewmates.reduce((s, p) => s + (p.taskCount || 0), 0);
  const doneTasks = allCrewmates.reduce((s, p) => s + (p.tasksDone || 0), 0);
  if (totalTasks > 0 && doneTasks >= totalTasks) { endGame(room, 'crewmate'); return true; }
  return false;
}

function resolveVotes(room) {
  const tally = {};
  Object.values(room.votes).forEach(targetId => {
    if (targetId) tally[targetId] = (tally[targetId] || 0) + 1;
  });

  let maxVotes = 0, ejected = null, tie = false;
  Object.entries(tally).forEach(([id, count]) => {
    if (count > maxVotes) { maxVotes = count; ejected = id; tie = false; }
    else if (count === maxVotes) { tie = true; }
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

  setTimeout(() => {
    room.phase = 'game';
    room.votes = {};
    if (!checkWinCondition(room)) {
      io.to(room.code).emit('meetingEnd');
      broadcastGameState(room);
    }
  }, 5000);
}

// Trouver la salle d'un joueur (par socket.id OU par son roomCode stocké)
function findRoomForSocket(socket, codeHint) {
  if (codeHint && rooms[codeHint]) return rooms[codeHint];
  if (socket.roomCode && rooms[socket.roomCode]) return rooms[socket.roomCode];
  return Object.values(rooms).find(r => r.players[socket.id]);
}

io.on('connection', (socket) => {
  console.log('Connecté:', socket.id);

  socket.on('createRoom', ({ name, maxPlayers }, cb) => {
    const code = generateCode();
    const color = PLAYER_COLORS[0];
    const player = { id: socket.id, name: name || 'Joueur', color, isHost: true, alive: true, role: null, x: 45, y: 50, tasksDone: 0, taskCount: 0 };
    rooms[code] = { code, phase: 'lobby', players: { [socket.id]: player }, deadBodies: [], chatMessages: [], votes: {}, maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 10, 1), 10), usedColors: [color] };
    socket.join(code);
    socket.roomCode = code;
    console.log('Salle créée:', code, 'par', socket.id);
    cb({ code, color });
    broadcastGameState(rooms[code]);
  });

  socket.on('joinRoom', ({ name, code }, cb) => {
    const room = rooms[code];
    if (!room) return cb({ error: 'Salle introuvable.' });
    if (room.phase !== 'lobby') return cb({ error: 'Partie déjà en cours.' });
    if (Object.keys(room.players).length >= room.maxPlayers) return cb({ error: 'Salle pleine.' });

    const color = PLAYER_COLORS.find(c => !room.usedColors.includes(c)) || PLAYER_COLORS[0];
    room.usedColors.push(color);
    const player = { id: socket.id, name: name || 'Joueur', color, isHost: false, alive: true, role: null, x: 45 + Math.random() * 10 - 5, y: 50 + Math.random() * 10 - 5, tasksDone: 0, taskCount: 0 };
    room.players[socket.id] = player;
    socket.join(code);
    socket.roomCode = code;
    cb({ color });
    broadcastGameState(room);
  });

  socket.on('startGame', ({ code } = {}) => {
    console.log('startGame reçu de', socket.id, 'code:', code, 'roomCode:', socket.roomCode);

    const room = findRoomForSocket(socket, code);
    if (!room) { console.log('startGame: salle introuvable'); return; }

    socket.roomCode = room.code;

    // Trouver l'hôte — peu importe son socket.id actuel
    const host = room.players[socket.id] || Object.values(room.players).find(p => p.isHost);
    if (!host) { console.log('startGame: aucun hôte trouvé'); return; }
    if (!host.isHost) { console.log('startGame: joueur pas hôte'); return; }

    // Réassocier l'hôte au socket.id actuel si différent
    if (host.id !== socket.id) {
      console.log('Réassociation hôte:', host.id, '->', socket.id);
      delete room.players[host.id];
      host.id = socket.id;
      room.players[socket.id] = host;
    }

    console.log('Démarrage de la partie dans la salle', room.code);
    const playerList = Object.values(room.players);
    const impostorCount = Math.max(1, Math.floor(playerList.length / 5));
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

    playerList.forEach(p => io.to(p.id).emit('yourRole', { role: p.role }));
    broadcastGameState(room);
  });

  socket.on('move', ({ x, y }) => {
    const room = findRoomForSocket(socket);
    if (!room || room.phase !== 'game') return;
    const player = room.players[socket.id];
    if (!player || !player.alive) return;
    player.x = Math.max(0, Math.min(98, x));
    player.y = Math.max(0, Math.min(98, y));
    io.to(room.code).emit('playerMoved', { id: socket.id, x: player.x, y: player.y });
  });

  socket.on('kill', ({ targetId }) => {
    const room = findRoomForSocket(socket);
    if (!room || room.phase !== 'game') return;
    const killer = room.players[socket.id];
    const target = room.players[targetId];
    if (!killer || !target || killer.role !== 'impostor' || !killer.alive || !target.alive) return;
    target.alive = false;
    const body = { id: uuidv4(), playerId: targetId, color: target.color, x: target.x, y: target.y };
    room.deadBodies.push(body);
    io.to(room.code).emit('playerKilled', { targetId, bodies: room.deadBodies });
    if (!checkWinCondition(room)) broadcastGameState(room);
  });

  socket.on('reportBody', ({ bodyId }) => {
    const room = findRoomForSocket(socket);
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

  socket.on('emergencyMeeting', () => {
    const room = findRoomForSocket(socket);
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

  socket.on('chat', ({ text }) => {
    const room = findRoomForSocket(socket);
    if (!room || room.phase !== 'meeting') return;
    const player = room.players[socket.id];
    if (!player || !player.alive) return;
    const msg = { id: uuidv4(), playerId: socket.id, playerName: player.name, color: player.color, text: text.substring(0, 200) };
    room.chatMessages.push(msg);
    io.to(room.code).emit('chatMessage', msg);
  });

  socket.on('vote', ({ targetId }) => {
    const room = findRoomForSocket(socket);
    if (!room || room.phase !== 'meeting') return;
    const voter = room.players[socket.id];
    if (!voter || !voter.alive || room.votes[socket.id] !== undefined) return;
    room.votes[socket.id] = targetId || null;
    const alivePlayers = Object.values(room.players).filter(p => p.alive);
    if (alivePlayers.filter(p => room.votes[p.id] !== undefined).length >= alivePlayers.length) resolveVotes(room);
  });

  socket.on('completeTask', ({ taskId }) => {
    const room = findRoomForSocket(socket);
    if (!room || room.phase !== 'game') return;
    const player = room.players[socket.id];
    if (!player || player.role !== 'crewmate') return;
    player.tasksDone = Math.min((player.tasksDone || 0) + 1, player.taskCount);
    io.to(room.code).emit('taskCompleted', { playerId: socket.id, taskId });
    if (!checkWinCondition(room)) broadcastGameState(room);
  });

  socket.on('disconnect', () => {
    console.log('Déconnecté:', socket.id);
    const room = findRoomForSocket(socket);
    if (!room) return;

    // Ne pas supprimer le joueur immédiatement — attendre 10s pour les reconnexions
    setTimeout(() => {
      // Vérifier si le joueur s'est reconnecté entre temps (son id aurait changé dans room.players)
      if (!room.players[socket.id]) return; // déjà réassocié ou déjà supprimé

      delete room.players[socket.id];
      io.to(room.code).emit('playerLeft', { id: socket.id });

      const remaining = Object.values(room.players);
      if (remaining.length === 0) { delete rooms[room.code]; return; }
      if (!remaining.some(p => p.isHost)) remaining[0].isHost = true;
      if (room.phase === 'game') checkWinCondition(room);
      broadcastGameState(room);
    }, 10000);
  });
});

app.get('/health', (_, res) => res.json({ status: 'ok', rooms: Object.keys(rooms).length }));
server.listen(PORT, () => console.log(`Serveur démarré sur le port ${PORT}`));
