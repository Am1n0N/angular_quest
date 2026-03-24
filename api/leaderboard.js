import { createClient } from "redis";

const LEADERBOARD_KEY = "aq_leaderboard_v1";
const MAX_LEADERBOARD_ENTRIES = 20;
let redisClientPromise;

async function getRedisClient() {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
        throw new Error("Leaderboard storage is not configured. Set REDIS_URL in Vercel environment variables.");
    }

    if (!redisClientPromise) {
        redisClientPromise = (async () => {
            const client = createClient({ url: redisUrl });
            client.on("error", () => {});
            await client.connect();
            return client;
        })();
    }

    return redisClientPromise;
}

function sanitizeEntry(entry) {
    const safeName = String(entry?.name ?? "Anonymous").trim().slice(0, 20) || "Anonymous";
    const safeScore = Number.isFinite(Number(entry?.score)) ? Number(entry.score) : 0;
    const safeDate = String(entry?.date ?? new Date().toLocaleDateString());

    return {
        name: safeName,
        score: safeScore,
        date: safeDate,
    };
}

async function readLeaderboard() {
    const redisClient = await getRedisClient();
    const stored = await redisClient.get(LEADERBOARD_KEY);

    if (!stored) {
        return [];
    }

    try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

async function writeLeaderboard(leaderboard) {
    const redisClient = await getRedisClient();
    await redisClient.set(LEADERBOARD_KEY, JSON.stringify(leaderboard));
}

export default async function handler(req, res) {
    try {
        if (req.method === "GET") {
            const leaderboard = await readLeaderboard();
            return res.status(200).json({ leaderboard });
        }

        if (req.method === "POST") {
            const currentLeaderboard = await readLeaderboard();
            const incoming = sanitizeEntry(req.body ?? {});

            const updatedLeaderboard = [...currentLeaderboard, incoming]
                .sort((first, second) => second.score - first.score)
                .slice(0, MAX_LEADERBOARD_ENTRIES);

            await writeLeaderboard(updatedLeaderboard);
            return res.status(200).json({ leaderboard: updatedLeaderboard });
        }

        return res.status(405).json({ message: "Method not allowed" });
    } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown error";
        const isConfigurationError = detail.toLowerCase().includes("not configured") || detail.includes("REDIS_URL");

        return res.status(isConfigurationError ? 503 : 500).json({
            message: "Leaderboard storage is unavailable.",
            detail,
        });
    }
}
