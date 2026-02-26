"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import io, { Socket } from "socket.io-client";

// Change this URL when you deploy to Render!
const SOCKET_URL = "http://localhost:3001";
let socket: Socket;

export default function DuoTimer() {
  const [room, setRoom] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // seconds
  const [duration, setDuration] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  // Initialize Socket
  useEffect(() => {
    socket = io(SOCKET_URL);

    socket.on("timer_started", (data) => {
      setDuration(data.duration);
      setIsRunning(true);
      // Calculate immediate offset if we joined late
      const elapsed = (Date.now() - data.startTime) / 1000;
      setTimeLeft(Math.max(0, data.duration - elapsed));
    });

    socket.on("timer_stopped", () => {
      setIsRunning(false);
      setTimeLeft(25 * 60);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // The "Tick" Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft <= 0 && isRunning) {
      // TIMER DONE! PLAY MUSIC HERE
      setIsRunning(false);
      alert("Meeting in the middle! ❤️");
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  // Calculate position (0% to 50% for each character)
  const progress = isRunning ? ((duration - timeLeft) / duration) * 100 : 0;
  // Cap movement at 50% (center of screen)
  const movePercent = Math.min(progress, 50);

  const joinRoom = () => {
    if (room) {
      socket.emit("join_room", room);
      setIsConnected(true);
    }
  };

  const startTimer = () => {
    socket.emit("start_timer", { roomCode: room, duration: 25 });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white overflow-hidden">
      {/* HEADER / CONTROLS */}
      <div className="z-10 absolute top-10 flex gap-4">
        {!isConnected ? (
          <div className="flex gap-2">
            <input
              className="px-4 py-2 text-black rounded"
              placeholder="Enter Room Code"
              onChange={(e) => setRoom(e.target.value)}
            />
            <button
              onClick={joinRoom}
              className="bg-blue-500 px-6 py-2 rounded hover:bg-blue-600 font-bold"
            >
              Join Room
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-mono">Room: {room}</h1>
            <h2 className="text-4xl font-bold font-mono">
              {Math.floor(timeLeft / 60)}:
              {String(Math.floor(timeLeft % 60)).padStart(2, "0")}
            </h2>
            <button
              onClick={startTimer}
              className="bg-green-500 px-8 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition"
            >
              START SESSION
            </button>
          </div>
        )}
      </div>

      {/* THE 2D WORLD */}
      <div className="relative w-full h-64 bg-emerald-800 border-y-4 border-emerald-600 flex items-end pb-10">
        {/* Left Character (You) */}
        <motion.div
          className="absolute left-10 w-16 h-16 bg-blue-400 border-4 border-white"
          animate={{ left: `${movePercent}%` }}
          transition={{ type: "tween", ease: "linear", duration: 1 }}
        >
          {/* Placeholder for 8-bit Sprite */}
          <div className="text-xs text-center mt-16">P1</div>
        </motion.div>

        {/* Right Character (Partner) */}
        <motion.div
          className="absolute right-10 w-16 h-16 bg-pink-400 border-4 border-white"
          animate={{ right: `${movePercent}%` }}
          transition={{ type: "tween", ease: "linear", duration: 1 }}
        >
          {/* Placeholder for 8-bit Sprite */}
          <div className="text-xs text-center mt-16">P2</div>
        </motion.div>

        {/* The Meeting Point (Center Heart) */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-32 opacity-50">
          ❤️
        </div>
      </div>
    </div>
  );
}
