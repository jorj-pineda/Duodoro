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
    origin: "*", // Allow connections from anywhere (change this for prod!)
    methods: ["GET", "POST"]
  }
});

// Store room state in memory for now (MVP)
// In production, use Redis for this.
const rooms = {}; 

io.on('connection', (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // 1. Join Room
  socket.on('join_room', (roomCode) => {
    socket.join(roomCode);
    
    if (!rooms[roomCode]) {
      rooms[roomCode] = { 
        timer: null, 
        duration: 25 * 60, // Default 25 mins in seconds
        startTime: null,
        isRunning: false 
      };
    }
    
    // Send current status to the user who just joined
    socket.emit('sync_state', rooms[roomCode]);
    console.log(`User ${socket.id} joined room: ${roomCode}`);
  });

  // 2. Start Timer
  socket.on('start_timer', ({ roomCode, duration }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].duration = duration * 60;
      rooms[roomCode].startTime = Date.now();
      rooms[roomCode].isRunning = true;
      
      // Tell everyone in the room (including sender) to start
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
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});