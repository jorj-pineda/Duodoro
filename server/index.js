const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

// Store room state
// Structure: { roomCode: { timer: null, duration: int, startTime: int, isRunning: bool, players: { socketId: { char: string } } } }
const rooms = {}; 

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // 1. Join Room with Character Selection
  socket.on('join_room', ({ roomCode, character }) => {
    socket.join(roomCode);
    
    if (!rooms[roomCode]) {
      rooms[roomCode] = { 
        duration: 25 * 60, 
        startTime: null,
        isRunning: false,
        players: {} // Store players here
      };
    }

    // Add/Update the player in the room
    rooms[roomCode].players[socket.id] = { char: character };
    
    // Send full room state (timer + players) to everyone in the room
    io.to(roomCode).emit('sync_state', rooms[roomCode]);
    console.log(`User ${socket.id} joined ${roomCode} as ${character}`);
  });

  // 2. Start Timer
  socket.on('start_timer', ({ roomCode, duration }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].duration = duration * 60;
      rooms[roomCode].startTime = Date.now();
      rooms[roomCode].isRunning = true;
      
      io.to(roomCode).emit('timer_started', { 
        startTime: rooms[roomCode].startTime,
        duration: rooms[roomCode].duration 
      });
    }
  });

  // 3. Stop/Reset Timer
  socket.on('stop_timer', (roomCode) => {
    if (rooms[roomCode]) {
      rooms[roomCode].isRunning = false;
      rooms[roomCode].startTime = null;
      io.to(roomCode).emit('timer_stopped');
    }
  });

  // Optional: Handle disconnect (remove player from visual)
  socket.on('disconnect', () => {
    // In a real app, you'd find which room they were in and remove them from rooms[code].players
    console.log("User Disconnected", socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});