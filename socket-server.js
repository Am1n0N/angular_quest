import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = Number(process.env.PORT || 3001);
const MAX_PLAYERS_PER_ROOM = 2;
const RAW_ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "").trim();
const ALLOWED_ORIGINS = RAW_ALLOWED_ORIGINS
    .split(/[\n,;]+/)
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter(Boolean);

function normalizeOrigin(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toOriginMatcher(pattern) {
    pattern = normalizeOrigin(pattern);
    if (pattern === "*") return /^.*$/;
    if (!pattern.includes("*")) return null;
    const regexSource = `^${pattern.split("*").map(escapeRegex).join(".*")}$`;
    return new RegExp(regexSource);
}

const ALLOWED_ORIGIN_MATCHERS = ALLOWED_ORIGINS
    .map(toOriginMatcher)
    .filter(Boolean);

function isOriginAllowed(origin) {
    origin = normalizeOrigin(origin);
    if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes("*")) return true;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    return ALLOWED_ORIGIN_MATCHERS.some((matcher) => matcher.test(origin));
}

function corsOriginValidator(origin, callback) {
    if (!origin) {
        callback(null, true);
        return;
    }

    const allowed = isOriginAllowed(origin);
    if (!allowed) {
        console.warn(`CORS blocked origin: ${origin}`);
    }
    callback(allowed ? null : new Error("Origin not allowed by CORS"), allowed);
}

const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "angular-quest-socket", allowedOrigins: ALLOWED_ORIGINS }));
        return;
    }

    if (req.url?.startsWith("/debug/cors")) {
        const base = `http://localhost:${PORT}`;
        const url = new URL(req.url, base);
        const origin = normalizeOrigin(url.searchParams.get("origin") || "");
        const allowed = origin ? isOriginAllowed(origin) : false;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ origin, allowed, allowedOrigins: ALLOWED_ORIGINS }));
        return;
    }

    if (req.url === "/rooms") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessions: getActiveSessions() }));
        return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Angular Quest PvP socket server is running.\n");
});

const io = new Server(httpServer, {
    cors: {
        origin: corsOriginValidator,
        methods: ["GET", "POST"],
        credentials: true,
    },
});

const rooms = new Map();

function getActiveSessions() {
    return [...rooms.entries()].map(([roomCode, roomMap]) => {
        const players = [...roomMap.values()].map((player) => player.name || "Guest");
        return {
            roomCode,
            players,
            playerCount: roomMap.size,
            maxPlayers: MAX_PLAYERS_PER_ROOM,
            isJoinable: roomMap.size < MAX_PLAYERS_PER_ROOM,
        };
    });
}

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

        const roomMap = rooms.get(roomCode);
        if (roomMap && roomMap.size >= MAX_PLAYERS_PER_ROOM) {
            socket.emit("race:room-full", {
                roomCode,
                maxPlayers: MAX_PLAYERS_PER_ROOM,
                currentPlayers: roomMap.size,
            });
            return;
        }

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

    socket.on("race:finish", (payload = {}) => {
        const roomCode = socket.data.roomCode;
        if (!roomCode) return;

        socket.to(roomCode).emit("race:finish", {
            roomCode,
            winnerName: String(payload.winnerName || socket.data.playerName || "Opponent").trim().slice(0, 32),
            playerName: socket.data.playerName || "Opponent",
            playerDistance: Number(payload.playerDistance || 0),
            opponentDistance: Number(payload.opponentDistance || 0),
            endedAt: Number(payload.endedAt || Date.now()),
            reason: payload.reason || "finish",
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
