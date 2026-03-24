import { kv } from "@vercel/kv";

const LEADERBOARD_KEY = "aq_leaderboard_v1";
const MAX_LEADERBOARD_ENTRIES = 20;

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
    const stored = await kv.get(LEADERBOARD_KEY);
    if (!Array.isArray(stored)) {
        return [];
    }
    return stored;
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

            await kv.set(LEADERBOARD_KEY, updatedLeaderboard);
            return res.status(200).json({ leaderboard: updatedLeaderboard });
        }

        return res.status(405).json({ message: "Method not allowed" });
    } catch (error) {
        return res.status(500).json({
            message: "Leaderboard storage is unavailable.",
            detail: error instanceof Error ? error.message : "Unknown error",
        });
    }
}
