const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.NODE_ENV === 'production' ? (process.env.CORS_ORIGIN || 'https://your-domain.com') : '*';
const io = socketIo(server, {
  cors: {
    origin: allowedOrigin,
    methods: ["GET", "POST"]
  }
});

// Serve static files from public directory only
app.use(express.static(path.join(__dirname, 'public')));

// Generate random usernames
const adjectives = ['Swift', 'Bright', 'Bold', 'Quick', 'Calm', 'Cool', 'Sharp', 'Wild', 'Free', 'Wise'];
const nouns = ['Fox', 'Wolf', 'Eagle', 'Bear', 'Lion', 'Tiger', 'Shark', 'Owl', 'Hawk', 'Raven'];

function generateUsername() {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
}

// Store connected users
const users = new Map();
// Basic server-side movement hygiene
const lastUpdateAt = new Map();
const POSITION_LIMIT = 50; // world bounds clamp
const UPDATE_INTERVAL_MS = 50; // 20 updates/sec per client
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Generate user data
  const avatarTypes = ['alien', 'robot', 'dino'];
  const userData = {
    id: socket.id,
    username: generateUsername(),
    position: { x: 0, y: 0, z: -3 },
    color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    modelType: avatarTypes[Math.floor(Math.random() * avatarTypes.length)]
  };
  
  users.set(socket.id, userData);
  
  // Send user their own data
  socket.emit('user-data', userData);
  
  // Send current users to new user
  socket.emit('existing-users', Array.from(users.values()).filter(u => u.id !== socket.id));
  
  // Notify others about new user
  socket.broadcast.emit('user-joined', userData);
  
  // Handle position updates (rate-limited + clamped)
  socket.on('update-position', (position) => {
    const now = Date.now();
    const prev = lastUpdateAt.get(socket.id) || 0;
    if (now - prev < UPDATE_INTERVAL_MS) return; // drop overly frequent updates
    lastUpdateAt.set(socket.id, now);

    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
      return;
    }

    const clamped = {
      x: clamp(position.x, -POSITION_LIMIT, POSITION_LIMIT),
      y: clamp(position.y, -POSITION_LIMIT, POSITION_LIMIT),
      z: clamp(position.z, -POSITION_LIMIT, POSITION_LIMIT)
    };

    const user = users.get(socket.id);
    if (user) {
      user.position = clamped;
      socket.broadcast.emit('user-moved', { id: socket.id, position: clamped });
    }
  });
  
  // WebRTC signaling
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      sender: socket.id
    });
  });
  
  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      sender: socket.id
    });
  });
  
  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    users.delete(socket.id);
    lastUpdateAt.delete(socket.id);
    socket.broadcast.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});