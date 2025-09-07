const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static('.'));

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

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Generate user data
  const userData = {
    id: socket.id,
    username: generateUsername(),
    position: { x: 0, y: 0, z: -3 },
    color: `hsl(${Math.random() * 360}, 70%, 50%)`
  };
  
  users.set(socket.id, userData);
  
  // Send user their own data
  socket.emit('user-data', userData);
  
  // Send current users to new user
  socket.emit('existing-users', Array.from(users.values()).filter(u => u.id !== socket.id));
  
  // Notify others about new user
  socket.broadcast.emit('user-joined', userData);
  
  // Handle position updates
  socket.on('update-position', (position) => {
    const user = users.get(socket.id);
    if (user) {
      user.position = position;
      socket.broadcast.emit('user-moved', { id: socket.id, position });
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
    socket.broadcast.emit('user-left', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});