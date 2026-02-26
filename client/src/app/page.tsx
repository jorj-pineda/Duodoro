import DuoTimer from "@/components/DuoTimer";

export default function Home() {
  return (
    <main>
      <DuoTimer />
    </main>
  );
}

// Add a state for character selection (e.g., 'cat', 'dog', 'robot')
const [myChar, setMyChar] = useState("cat");

const joinRoom = () => {
  if (room) {
    // Send your character choice to the server
    socket.emit("join_room", { roomCode: room, character: myChar });
    setIsConnected(true);
  }
};
