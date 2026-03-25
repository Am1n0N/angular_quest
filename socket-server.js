import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT || 3001);
const RAW_ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "").trim();
const ALLOWED_ORIGINS = RAW_ALLOWED_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

function corsOriginValidator(origin, callback) {
    if (!origin) {
        callback(null, true);
        return;
    }

    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes("*")) {
        callback(null, true);
        return;
    }

    const isAllowed = ALLOWED_ORIGINS.includes(origin);
    callback(isAllowed ? null : new Error("Origin not allowed by CORS"), isAllowed);
}

const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "angular-quest-socket" }));
        return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Angular Quest PvP socket server is running.\n");
});

const io = new Server(httpServer, {
    cors: {
        origin: corsOriginValidator,
        methods: ["GET", "POST"],
    },
});

const rooms = new Map();

function emitPresence(roomCode) {
    const roomMap = rooms.get(roomCode);
    const players = roomMap
        ? [...roomMap.entries()].map(([id, player]) => ({ id, name: player.name }))
        : [];
    io.to(roomCode).emit("race:presence", { roomCode, players });
}

io.on("connection", (socket) => {
    const leaveRoom = () => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) return;

        const roomMap = rooms.get(roomCode);
        if (roomMap) {
            roomMap.delete(socket.id);
            if (roomMap.size === 0) {
                rooms.delete(roomCode);
            }
        }

        socket.to(roomCode).emit("race:opponent-left", {
            playerName: socket.data.playerName || "Opponent",
        });
        emitPresence(roomCode);
        socket.leave(roomCode);
        socket.data.roomCode = "";
    };

    socket.on("race:join", (payload = {}) => {
        const roomCode = String(payload.roomCode || "").trim().toUpperCase();
        if (!roomCode) return;

        leaveRoom();

        const playerName = String(payload.playerName || "Guest").trim().slice(0, 32) || "Guest";
        socket.data.roomCode = roomCode;
        socket.data.playerName = playerName;

        socket.join(roomCode);

        if (!rooms.has(roomCode)) rooms.set(roomCode, new Map());
        rooms.get(roomCode).set(socket.id, { name: playerName });

        emitPresence(roomCode);
    });

    socket.on("race:state", (payload = {}) => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) return;

        socket.to(roomCode).emit("race:state", {
            roomCode,
            playerName: socket.data.playerName || "Opponent",
            distance: Number(payload.distance || 0),
            speed: Number(payload.speed || 0),
            questionIdx: Number(payload.questionIdx || 0),
            result: payload.result || null,
        });
    });

    socket.on("race:leave", leaveRoom);
    socket.on("disconnect", leaveRoom);
});

httpServer.listen(PORT, () => {
    console.log(`Angular Quest PvP socket server listening on port ${PORT}`);
    if (ALLOWED_ORIGINS.length > 0) {
        console.log(`CORS allowlist: ${ALLOWED_ORIGINS.join(", ")}`);
    } else {
        console.log("CORS allowlist: * (all origins)");
    }
});
