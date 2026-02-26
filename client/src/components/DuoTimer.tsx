"use client";
import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import io, { Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
let socket: Socket;

// Available characters (keys must match your CSS classes or image names)
const CHARACTERS = [
  { id: "cat", label: "🐱 Cat" },
  { id: "dog", label: "🐶 Dog" },
  { id: "bot", label: "🤖 Bot" },
];

export default function DuoTimer() {
  const [room, setRoom] = useState("");
  const [myChar, setMyChar] = useState("cat"); // Default character
  const [isConnected, setIsConnected] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [duration, setDuration] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  // Store all players: { [socketId]: { char: 'cat' } }
  const [players, setPlayers] = useState<Record<string, { char: string }>>({});

  // Ref to access current state inside socket listeners if needed
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    socket = io(SOCKET_URL);

    socket.on("sync_state", (data) => {
      setDuration(data.duration);
      setIsRunning(data.isRunning);
      setPlayers(data.players || {});

      if (data.isRunning && data.startTime) {
        const elapsed = (Date.now() - data.startTime) / 1000;
        setTimeLeft(Math.max(0, data.duration - elapsed));
      }
    });

    socket.on("timer_started", (data) => {
      setDuration(data.duration);
      setIsRunning(true);
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

  // Timer Tick & End Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft <= 0 && isRunning) {
      // TIMER DONE!
      setIsRunning(false);

      // Play Sound
      const audio = new Audio("/victory.mp3"); // Make sure this file exists in /public
      audio.play().catch((e) => console.log("Audio play failed:", e));

      alert("Meeting in the middle! ❤️");
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const joinRoom = () => {
    if (room) {
      // Send selected character to server
      socket.emit("join_room", { roomCode: room, character: myChar });
      setIsConnected(true);
    }
  };

  const startTimer = () => {
    socket.emit("start_timer", { roomCode: room, duration: 25 });
  };

  // Helper to find "Partner" (anyone who isn't me)
  // Note: socket.id might not be immediately available on first render, handled safely
  const myPlayerId = socket?.id;
  const partnerId = Object.keys(players).find((id) => id !== myPlayerId);
  const partnerChar = partnerId ? players[partnerId].char : null;

  // Animation values
  const progress = isRunning ? ((duration - timeLeft) / duration) * 100 : 0;
  const movePercent = Math.min(progress, 50);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white overflow-hidden">
      {/* HEADER / CONTROLS */}
      <div className="z-10 absolute top-10 flex gap-4 flex-col items-center">
        {!isConnected ? (
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-700">
            <h2 className="text-xl mb-4 font-bold text-center">
              Choose Your Hero
            </h2>

            {/* Character Selector */}
            <div className="flex gap-4 mb-6">
              {CHARACTERS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setMyChar(c.id)}
                  className={`p-3 rounded-lg border-2 transition-all ${
                    myChar === c.id
                      ? "border-green-400 bg-green-900/30"
                      : "border-gray-600 hover:border-gray-400"
                  }`}
                >
                  <div className="text-2xl">{c.label}</div>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="px-4 py-2 text-black rounded w-full"
                placeholder="Enter Room Code"
                onChange={(e) => setRoom(e.target.value)}
              />
              <button
                onClick={joinRoom}
                className="bg-blue-500 px-6 py-2 rounded hover:bg-blue-600 font-bold whitespace-nowrap"
              >
                Join
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <h1 className="text-2xl font-mono text-emerald-400">
              Room: {room}
            </h1>
            <h2 className="text-6xl font-bold font-mono tracking-widest drop-shadow-md">
              {Math.floor(timeLeft / 60)}:
              {String(Math.floor(timeLeft % 60)).padStart(2, "0")}
            </h2>
            <button
              onClick={startTimer}
              className="bg-green-500 px-8 py-2 rounded-full font-bold shadow-lg hover:scale-105 transition hover:bg-green-400 mt-4"
            >
              {isRunning ? "FOCUSING..." : "START SESSION"}
            </button>
          </div>
        )}
      </div>

      {/* THE 2D WORLD */}
      <div className="relative w-full h-64 bg-emerald-800 border-y-8 border-emerald-900 flex items-end pb-10 shadow-inner">
        {/* DECORATION: Clouds/Trees could go here */}

        {/* Left Character (YOU) */}
        {isConnected && (
          <motion.div
            className="absolute left-10 z-20"
            animate={{ left: `calc(${movePercent}% - 32px)` }} // Subtract half width to center on meeting point
            transition={{ type: "tween", ease: "linear", duration: 1 }}
          >
            {/* The Sprite Div */}
            <div
              className={`pixel-sprite ${myChar} ${isRunning ? "walking" : "idle"}`}
            ></div>
            <div className="text-xs text-center mt-2 font-bold bg-black/50 rounded px-1">
              YOU
            </div>
          </motion.div>
        )}

        {/* Right Character (PARTNER) */}
        {isConnected && partnerChar && (
          <motion.div
            className="absolute right-10 z-20"
            animate={{ right: `calc(${movePercent}% - 32px)` }}
            transition={{ type: "tween", ease: "linear", duration: 1 }}
          >
            {/* Flip the partner sprite to face left */}
            <div
              className={`pixel-sprite ${partnerChar} ${isRunning ? "walking" : "idle"} scale-x-[-1]`}
            ></div>
            <div className="text-xs text-center mt-2 font-bold bg-black/50 rounded px-1">
              P2
            </div>
          </motion.div>
        )}

        {/* The Meeting Point */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-20 opacity-50 flex flex-col items-center">
          <div className="text-4xl animate-bounce">❤️</div>
          <div className="w-1 h-12 bg-white/20 rounded-full mt-2"></div>
        </div>
      </div>
    </div>
  );
}
