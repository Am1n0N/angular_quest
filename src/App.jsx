import { useState, useCallback, useRef, useEffect } from "react";
import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

const GAME_CONTENT_SEED_URL = "/seed-levels.json";
const TOTAL_LIVES = 3;
const QUESTION_TIME_LIMIT = 15;
const MEDALS = ["🥇", "🥈", "🥉"];
const SQLITE_IDB_NAME = "angular_quest_db";
const SQLITE_IDB_STORE = "sqlite";
const SQLITE_IDB_KEY = "main";
const LEADERBOARD_CACHE_KEY = "aq_lb_v2";
const USER_PROGRESS_KEY = "aq_user_progress_v1";
const SHARED_LEADERBOARD_API = "/api/leaderboard";
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || "";

let sqliteDbPromise;

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(SQLITE_IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SQLITE_IDB_STORE)) db.createObjectStore(SQLITE_IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDbBytes() {
  if (!window.indexedDB) return null;
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SQLITE_IDB_STORE, "readonly");
    const store = tx.objectStore(SQLITE_IDB_STORE);
    const req = store.get(SQLITE_IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function writeDbBytes(bytes) {
  if (!window.indexedDB) return;
  const db = await openIndexedDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SQLITE_IDB_STORE, "readwrite");
    const store = tx.objectStore(SQLITE_IDB_STORE);
    store.put(bytes, SQLITE_IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getSqliteDb() {
  if (!sqliteDbPromise) {
    sqliteDbPromise = (async () => {
      const SQL = await initSqlJs({ locateFile: (file) => file.endsWith(".wasm") ? sqlWasmUrl : file });
      const existingBytes = await readDbBytes();
      const db = existingBytes ? new SQL.Database(existingBytes) : new SQL.Database();
      db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      db.run(`CREATE TABLE IF NOT EXISTS levels (id INTEGER PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT NOT NULL, color TEXT NOT NULL, light TEXT NOT NULL, icon TEXT NOT NULL, description TEXT NOT NULL)`);
      db.run(`CREATE TABLE IF NOT EXISTS questions (id INTEGER PRIMARY KEY AUTOINCREMENT, level_id INTEGER NOT NULL, position INTEGER NOT NULL, q TEXT NOT NULL, options TEXT NOT NULL, answer INTEGER NOT NULL, explanation TEXT NOT NULL, FOREIGN KEY(level_id) REFERENCES levels(id))`);
      return db;
    })();
  }
  return sqliteDbPromise;
}

async function sqliteGetJson(key) {
  const db = await getSqliteDb();
  const stmt = db.prepare("SELECT value FROM kv WHERE key = ? LIMIT 1");
  stmt.bind([key]);
  let result = null;
  if (stmt.step()) result = stmt.getAsObject().value;
  stmt.free();
  if (!result) return null;
  return JSON.parse(result);
}

async function sqliteSetJson(key, value) {
  const db = await getSqliteDb();
  db.run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [key, JSON.stringify(value)]);
  const bytes = db.export();
  await writeDbBytes(bytes);
}

async function fetchSharedLeaderboard() {
  const response = await fetch(SHARED_LEADERBOARD_API, { method: "GET" });
  if (!response.ok) {
    let message = "Unable to fetch leaderboard";
    try { const payload = await response.json(); if (payload?.detail) message = payload.detail; } catch (_) {}
    throw new Error(message);
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.leaderboard)) return [];
  return payload.leaderboard;
}

async function pushSharedLeaderboardEntry(entry) {
  const response = await fetch(SHARED_LEADERBOARD_API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
  if (!response.ok) {
    let message = "Unable to update leaderboard";
    try { const payload = await response.json(); if (payload?.detail) message = payload.detail; } catch (_) {}
    throw new Error(message);
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.leaderboard)) return [];
  return payload.leaderboard;
}

async function ensureGameContentSeeded() {
  const db = await getSqliteDb();
  const result = db.exec("SELECT COUNT(*) AS count FROM levels");
  const count = result.length > 0 ? Number(result[0].values[0][0]) : 0;
  if (count > 0) return;
  const response = await fetch(GAME_CONTENT_SEED_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Unable to load seed levels file.");
  const seedLevels = await response.json();
  await replaceGameContentInDb(seedLevels);
}

function isValidQuestion(q) {
  return q && typeof q.q === "string" && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => typeof o === "string") && Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 3 && typeof q.explanation === "string";
}

function isValidLevel(level) {
  return level && Number.isInteger(level.id) && typeof level.name === "string" && typeof level.subtitle === "string" && typeof level.color === "string" && typeof level.light === "string" && typeof level.icon === "string" && typeof level.description === "string" && Array.isArray(level.questions) && level.questions.length > 0 && level.questions.every(isValidQuestion);
}

function normalizeImportedLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) throw new Error("Content must be a non-empty levels array.");
  if (!levels.every(isValidLevel)) throw new Error("Invalid level/question structure in imported JSON.");
  const uniqueIds = new Set(levels.map(l => l.id));
  if (uniqueIds.size !== levels.length) throw new Error("Each level must have a unique numeric id.");
  return [...levels].sort((a, b) => a.id - b.id);
}

async function replaceGameContentInDb(rawLevels) {
  const gameLevels = normalizeImportedLevels(rawLevels);
  const db = await getSqliteDb();
  db.run("BEGIN");
  try {
    db.run("DELETE FROM questions");
    db.run("DELETE FROM levels");
    const levelStmt = db.prepare("INSERT INTO levels (id, name, subtitle, color, light, icon, description) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const questionStmt = db.prepare("INSERT INTO questions (level_id, position, q, options, answer, explanation) VALUES (?, ?, ?, ?, ?, ?)");
    gameLevels.forEach(level => {
      levelStmt.run([level.id, level.name, level.subtitle, level.color, level.light, level.icon, level.description]);
      level.questions.forEach((q, idx) => { questionStmt.run([level.id, idx, q.q, JSON.stringify(q.options), q.answer, q.explanation]); });
    });
    levelStmt.free(); questionStmt.free();
    db.run("COMMIT");
  } catch (error) { db.run("ROLLBACK"); throw error; }
  const bytes = db.export();
  await writeDbBytes(bytes);
}

async function loadGameContentFromDb() {
  const db = await getSqliteDb();
  const levelsResult = db.exec("SELECT id, name, subtitle, color, light, icon, description FROM levels ORDER BY id");
  if (levelsResult.length === 0) return [];
  const rows = levelsResult[0].values;
  const questionStmt = db.prepare("SELECT q, options, answer, explanation FROM questions WHERE level_id = ? ORDER BY position");
  const levels = rows.map(row => {
    const [id, name, subtitle, color, light, icon, description] = row;
    questionStmt.bind([id]);
    const questions = [];
    while (questionStmt.step()) {
      const qRow = questionStmt.getAsObject();
      questions.push({ q: qRow.q, options: JSON.parse(qRow.options), answer: Number(qRow.answer), explanation: qRow.explanation });
    }
    questionStmt.reset();
    return { id: Number(id), name, subtitle, color, light, icon, description, questions };
  });
  questionStmt.free();
  return levels;
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffleQuestionsInLevels(levels) {
  return levels.map(level => ({ ...level, questions: shuffleArray(level.questions) }));
}

// ─── CASINO COMPONENTS ──────────────────────────────────────────────────────

function NeonText({ children, color = "#ffd700", size = "inherit", weight = 900, style = {} }) {
  return (
    <span style={{
      color,
      fontWeight: weight,
      fontSize: size,
      textShadow: `0 0 10px ${color}, 0 0 20px ${color}, 0 0 40px ${color}88, 0 0 80px ${color}44`,
      ...style
    }}>
      {children}
    </span>
  );
}

function CasinoChip({ value, color = "#ffd700" }) {
  return (
    <div style={{
      width: 52, height: 52, borderRadius: "50%",
      background: `radial-gradient(circle at 35% 35%, ${color}ff, ${color}88)`,
      border: `3px solid ${color}`,
      boxShadow: `0 0 12px ${color}88, inset 0 2px 4px rgba(255,255,255,0.3)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 900, color: "#1a0a00",
      fontFamily: "'Playfair Display', serif",
      position: "relative", flexShrink: 0
    }}>
      <div style={{
        position: "absolute", inset: 4, borderRadius: "50%",
        border: `2px dashed ${color}88`
      }} />
      {value}
    </div>
  );
}

function SpinningCard({ icon, color }) {
  return (
    <div style={{
      width: 54, height: 54, borderRadius: 12,
      background: `linear-gradient(135deg, #fffdf8, #f8f0de)`,
      border: `2px solid ${color}`,
      boxShadow: `0 0 15px ${color}33, inset 0 1px 0 rgba(255,255,255,0.8)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 24, animation: "cardFloat 3s ease-in-out infinite",
      cursor: "default"
    }}>
      {icon}
    </div>
  );
}

function GoldDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "20px 0" }}>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #ffd700, transparent)" }} />
      <span style={{ color: "#ffd700", fontSize: 16, textShadow: "0 0 10px #ffd700" }}>♦</span>
      <div style={{ flex: 1, height: 1, background: "linear-gradient(90deg, transparent, #ffd700, transparent)" }} />
    </div>
  );
}

function Confetti({ active }) {
  if (!active) return null;
  const colors = ["#ffd700", "#ff6b00", "#ff3366", "#00ffaa", "#7b3fe4", "#00d4ff", "#ff00ff", "#ffff00"];
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }}>
      {Array.from({ length: 80 }, (_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: `${Math.random() * 100}%`,
          top: "-20px",
          width: 8 + Math.random() * 10,
          height: 8 + Math.random() * 10,
          borderRadius: Math.random() > 0.5 ? "50%" : 2,
          background: colors[i % colors.length],
          boxShadow: `0 0 6px ${colors[i % colors.length]}`,
          animation: `confFall ${1 + Math.random() * 1.6}s ease-in forwards`,
          animationDelay: `${Math.random() * 1}s`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }} />
      ))}
    </div>
  );
}

function LivesDisplay({ lives }) {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {Array.from({ length: TOTAL_LIVES }, (_, i) => (
        <div key={i} style={{
          fontSize: 20,
          filter: i < lives ? "drop-shadow(0 0 6px #ff3366)" : "grayscale(1) opacity(0.3)",
          transition: "all 0.3s",
          animation: i < lives ? "heartPulse 1.5s ease-in-out infinite" : "none",
          animationDelay: `${i * 0.2}s`
        }}>♥</div>
      ))}
    </div>
  );
}

function TimerRing({ value, max = QUESTION_TIME_LIMIT }) {
  const pct = value / max;
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const dash = pct * circumference;
  const color = value <= 5 ? "#ff3366" : value <= 9 ? "#ff6b00" : "#00ffaa";

  return (
    <div style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}>
      <svg width="60" height="60" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="30" cy="30" r={radius} fill="none" stroke="#ffffff11" strokeWidth="4" />
        <circle
          cx="30" cy="30" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: "all 0.25s", filter: `drop-shadow(0 0 4px ${color})` }}
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Playfair Display', serif",
        fontSize: 18, fontWeight: 700,
        color, textShadow: `0 0 8px ${color}`
      }}>{value}</div>
    </div>
  );
}

function ScorePopup({ pts, speed, multiplier }) {
  if (!pts) return null;
  return (
    <div style={{
      position: "fixed", top: "20%", right: "5%", zIndex: 200,
      animation: "scoreFloat 2s ease-out forwards",
      textAlign: "center", pointerEvents: "none"
    }}>
      <div style={{ fontSize: 42, fontWeight: 900, color: "#ffd700", textShadow: "0 0 20px #ffd700, 0 0 40px #ffd70066", fontFamily: "'Playfair Display', serif" }}>
        +{pts}
      </div>
      {multiplier > 1 && (
        <div style={{ fontSize: 14, color: "#ff6b00", textShadow: "0 0 8px #ff6b00" }}>×{multiplier.toFixed(1)} STREAK!</div>
      )}
      {speed > 0 && (
        <div style={{ fontSize: 13, color: "#00ffaa", textShadow: "0 0 8px #00ffaa" }}>+{speed} SPEED</div>
      )}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("intro");
  const [prevScreen, setPrevScreen] = useState("intro");
  const [playerName, setPlayerName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [levels, setLevels] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [leaderboardError, setLeaderboardError] = useState("");
  const [levelIdx, setLevelIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [lives, setLives] = useState(TOTAL_LIVES);
  const [score, setScore] = useState(0);
  const [lvlScore, setLvlScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [fastAnswersCount, setFastAnswersCount] = useState(0);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_TIME_LIMIT);
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [lastAwardedPoints, setLastAwardedPoints] = useState(0);
  const [lastSpeedBonus, setLastSpeedBonus] = useState(0);
  const [lastMultiplier, setLastMultiplier] = useState(1);
  const [earnedAchievements, setEarnedAchievements] = useState([]);
  const [picked, setPicked] = useState(null);
  const [showFB, setShowFB] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [shake, setShake] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [adminNotice, setAdminNotice] = useState("");
  const [adminPinInput, setAdminPinInput] = useState("");
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [userProgress, setUserProgress] = useState(null);
  const [showScorePop, setShowScorePop] = useState(false);
  const importFileRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        await ensureGameContentSeeded();
        const dbLevels = await loadGameContentFromDb();
        if (isMounted && dbLevels.length > 0) setLevels(dbLevels);
      } catch (_) {}
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const stored = await sqliteGetJson(USER_PROGRESS_KEY);
        if (isMounted && stored) setUserProgress(stored);
      } catch (_) {}
    })();
    return () => { isMounted = false; };
  }, []);

  const refreshLeaderboard = useCallback(async ({ clearOnError = false } = {}) => {
    try {
      const remote = await fetchSharedLeaderboard();
      setLeaderboard(remote);
      setLeaderboardError("");
      await sqliteSetJson(LEADERBOARD_CACHE_KEY, remote);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unable to load shared leaderboard.";
      setLeaderboardError(msg);
      if (clearOnError) setLeaderboard([]);
    }
  }, []);

  useEffect(() => { refreshLeaderboard({ clearOnError: true }); }, [refreshLeaderboard]);

  useEffect(() => {
    if (screen !== "leaderboard") return undefined;
    refreshLeaderboard();
    const id = setInterval(() => refreshLeaderboard(), 4000);
    return () => clearInterval(id);
  }, [screen, refreshLeaderboard]);

  const level = levels[levelIdx];
  const question = level?.questions[qIdx];

  const boom = () => { setConfetti(true); setTimeout(() => setConfetti(false), 2600); };

  const addScore = useCallback((name, s) => {
    const entry = { name, score: s, date: new Date().toLocaleDateString() };
    (async () => {
      try {
        const updated = await pushSharedLeaderboardEntry(entry);
        setLeaderboard(updated);
        setLeaderboardError("");
        await sqliteSetJson(LEADERBOARD_CACHE_KEY, updated);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unable to update shared leaderboard.";
        setLeaderboardError(msg);
      }
    })();
  }, []);

  useEffect(() => {
    if (screen !== "game" || !question || showFB) return undefined;
    const startedAt = Date.now();
    setQuestionStartedAt(startedAt);
    setQuestionTimeLeft(QUESTION_TIME_LIMIT);
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, QUESTION_TIME_LIMIT - elapsed);
      setQuestionTimeLeft(left);
      if (left <= 0) { clearInterval(id); handleAnswer(-1); }
    }, 250);
    return () => clearInterval(id);
  }, [screen, question, showFB, levelIdx, qIdx]);

  const handleAnswer = useCallback((idx) => {
    if (showFB) return;
    clearTimeout(timer.current);
    setPicked(idx);
    const correct = idx === question.answer;
    setIsCorrect(correct);
    setShowFB(true);
    if (correct) {
      const elapsed = Math.min(QUESTION_TIME_LIMIT, Math.floor((Date.now() - questionStartedAt) / 1000));
      const speedBonus = Math.max(0, (QUESTION_TIME_LIMIT - elapsed) * 5);
      const nextStreak = streak + 1;
      const multiplier = Number((1 + Math.min(nextStreak, 8) * 0.1).toFixed(2));
      const pts = Math.round((100 * multiplier) + speedBonus);
      setLastAwardedPoints(pts);
      setLastSpeedBonus(speedBonus);
      setLastMultiplier(multiplier);
      setScore(s => s + pts);
      setLvlScore(s => s + pts);
      setStreak(nextStreak);
      setBestStreak(prev => Math.max(prev, nextStreak));
      if (elapsed <= 5) setFastAnswersCount(c => c + 1);
      setShowScorePop(true);
      setTimeout(() => setShowScorePop(false), 2000);
    } else {
      setStreak(0);
      setLastAwardedPoints(0);
      setLastSpeedBonus(0);
      setLastMultiplier(1);
      setLives(l => l - 1);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
    timer.current = setTimeout(() => {
      setShowFB(false); setPicked(null);
      if (correct) {
        if (qIdx + 1 >= level.questions.length) { boom(); setScreen("levelDone"); }
        else setQIdx(q => q + 1);
      } else {
        if (lives - 1 <= 0) { addScore(playerName, score); setScreen("gameOver"); }
      }
    }, 2100);
  }, [showFB, question, qIdx, level, lives, score, playerName, addScore, streak, questionStartedAt]);

  const nextLevel = () => {
    if (levelIdx + 1 >= levels.length) { addScore(playerName, score); boom(); setScreen("victory"); }
    else { setLevelIdx(l => l + 1); setQIdx(0); setLvlScore(0); setScreen("game"); }
  };

  const startGame = (name) => {
    setLevels(curr => shuffleQuestionsInLevels(curr));
    setPlayerName(name); setLevelIdx(0); setQIdx(0); setLives(TOTAL_LIVES);
    setScore(0); setLvlScore(0); setStreak(0); setBestStreak(0); setFastAnswersCount(0);
    setQuestionTimeLeft(QUESTION_TIME_LIMIT); setLastAwardedPoints(0); setLastSpeedBonus(0); setLastMultiplier(1);
    setPicked(null); setShowFB(false); setScreen("game");
  };

  const goLeaderboard = (from) => { setPrevScreen(from); setScreen("leaderboard"); };
  const goAdminLogin = (from) => { setPrevScreen(from); setAdminNotice(""); setAdminPinInput(""); setScreen("adminLogin"); };

  const zoneCount = levels.length;
  const totalQuestionCount = levels.reduce((t, z) => t + z.questions.length, 0);
  const progress = level ? (qIdx / level.questions.length) * 100 : 0;
  const overallProgress = zoneCount === 0 ? 0 : Math.min(100, Math.round((((levelIdx) + (level ? qIdx / Math.max(level.questions.length, 1) : 0)) / zoneCount) * 100));
  const currentZoneIndex = Math.min(levelIdx + 1, Math.max(zoneCount, 1));

  useEffect(() => {
    const achievements = [
      { id: "score-500", title: "High Roller", unlocked: score >= 500 },
      { id: "streak-3", title: "Hot Streak", unlocked: bestStreak >= 3 },
      { id: "streak-5", title: "On Fire!", unlocked: bestStreak >= 5 },
      { id: "fast-3", title: "Speed Dealer", unlocked: fastAnswersCount >= 3 },
      { id: "survivor", title: "Survivor", unlocked: lives === TOTAL_LIVES && score >= 300 },
      { id: "victory", title: "The House Wins", unlocked: screen === "victory" },
    ];
    setEarnedAchievements(achievements);
  }, [score, bestStreak, fastAnswersCount, lives, screen]);

  useEffect(() => {
    const snapshot = {
      playerName: playerName || "Guest", screen, score, lives,
      currentZone: level ? level.name : "-",
      currentQuestion: level ? `${Math.min(qIdx + 1, level.questions.length)} / ${level.questions.length}` : "-",
      overallProgress, zonesCompleted: Math.min(levelIdx, zoneCount),
      totalZones: zoneCount, lastUpdated: new Date().toLocaleString(),
    };
    setUserProgress(snapshot);
    (async () => { try { await sqliteSetJson(USER_PROGRESS_KEY, snapshot); } catch (_) {} })();
  }, [playerName, screen, score, lives, level, qIdx, overallProgress, levelIdx, zoneCount]);

  const handleExportLevels = useCallback(async () => {
    try {
      const dbLevels = await loadGameContentFromDb();
      const blob = new Blob([JSON.stringify(dbLevels, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "angular-quest-levels.json"; a.click();
      URL.revokeObjectURL(url);
      setAdminNotice("Levels exported successfully.");
    } catch (_) { setAdminNotice("Failed to export levels."); }
  }, []);

  const handleImportLevels = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      await replaceGameContentInDb(json);
      const dbLevels = await loadGameContentFromDb();
      if (dbLevels.length > 0) {
        setLevels(dbLevels); setLevelIdx(0); setQIdx(0); setScreen("intro");
        setAdminNotice("Levels imported successfully.");
      }
    } catch (_) { setAdminNotice("Import failed. Check JSON format."); }
    finally { event.target.value = ""; }
  }, []);

  const handleAdminLogin = useCallback(() => {
    if (!ADMIN_PIN) { setAdminNotice("Admin PIN not configured."); return; }
    if (adminPinInput === ADMIN_PIN) { setIsAdminAuthenticated(true); setAdminNotice(""); setScreen("admin"); return; }
    setAdminNotice("Invalid admin PIN.");
  }, [adminPinInput]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a") { e.preventDefault(); goAdminLogin("intro"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Casino color palette
  const C = {
    bg: "#f7f3e9",
    felt: "#ffffff",
    card: "#fffaf2",
    border: "#d4b24c66",
    borderBright: "#ffd700",
    text: "#2f2211",
    muted: "#735f45",
    faint: "#927d61",
    gold: "#ffd700",
    red: "#ff3366",
    green: "#00ffaa",
    cyan: "#00d4ff",
    purple: "#bf00ff",
    orange: "#ff6b00",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: C.bg,
      backgroundImage: `
        radial-gradient(ellipse at 20% 50%, #fff6dc 0%, transparent 60%),
        radial-gradient(ellipse at 80% 20%, #f3f9ff 0%, transparent 60%),
        repeating-linear-gradient(0deg, transparent, transparent 60px, #b78d1d0a 60px, #b78d1d0a 61px),
        repeating-linear-gradient(90deg, transparent, transparent 60px, #b78d1d0a 60px, #b78d1d0a 61px)
      `,
      fontFamily: "'Crimson Pro', 'Georgia', serif",
      color: C.text,
      position: "relative",
      overflow: "hidden"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Crimson+Pro:wght@400;500;600&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; }

        @keyframes fadeUp    { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes popIn     { 0%{transform:scale(.8);opacity:0} 60%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
        @keyframes shake     { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-12px)} 40%{transform:translateX(12px)} 60%{transform:translateX(-7px)} 80%{transform:translateX(7px)} }
        @keyframes confFall  { to{transform:translateY(110vh) rotate(720deg);opacity:0} }
        @keyframes neonPulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
        @keyframes cardFloat { 0%,100%{transform:translateY(0) rotate(-1deg)} 50%{transform:translateY(-6px) rotate(1deg)} }
        @keyframes heartPulse{ 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        @keyframes scoreFloat{ 0%{opacity:1;transform:translateY(0) scale(1)} 80%{opacity:1;transform:translateY(-60px) scale(1.1)} 100%{opacity:0;transform:translateY(-80px) scale(0.9)} }
        @keyframes goldShimmer{ 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes marqueeGlow{ 0%,100%{box-shadow:0 0 20px #ffd70066,0 0 40px #ffd70033} 50%{box-shadow:0 0 30px #ffd700aa,0 0 60px #ffd70055} }
        @keyframes borderDance{ 0%{border-color:#ffd700} 25%{border-color:#ff3366} 50%{border-color:#00ffaa} 75%{border-color:#00d4ff} 100%{border-color:#ffd700} }
        @keyframes spinIn    { from{transform:rotateY(90deg);opacity:0} to{transform:rotateY(0deg);opacity:1} }
        @keyframes tickerScroll{ 0%{transform:translateX(100%)} 100%{transform:translateX(-100%)} }

        .casino-btn {
          font-family: 'Playfair Display', serif;
          font-weight: 700;
          letter-spacing: 1px;
          cursor: pointer;
          border: none;
          transition: transform 0.15s, box-shadow 0.15s, filter 0.15s;
        }
        .casino-btn:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.02);
          filter: brightness(1.15);
        }
        .casino-btn:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }

        .opt-casino {
          font-family: 'Crimson Pro', serif;
          transition: transform 0.12s, box-shadow 0.12s, background 0.15s;
          cursor: pointer;
          border: none;
          text-align: left;
        }
        .opt-casino:hover:not(:disabled) {
          transform: translateX(6px) scale(1.01);
        }
        .opt-casino:disabled { cursor: default; }

        .felt-table {
          background: radial-gradient(ellipse at center, #ffffff 0%, #f6efdf 100%);
          border: 2px solid #d4b24c66;
          box-shadow: inset 0 1px 10px rgba(255,255,255,0.9), 0 8px 28px rgba(67,44,7,0.14);
        }

        @media (max-width: 860px) {
          .intro-stats { grid-template-columns:1fr 1fr !important; }
          .question-options { grid-template-columns:1fr !important; }
          .hud-casino { flex-wrap:wrap; gap:10px !important; }
        }
        @media (max-width: 640px) {
          .intro-stats { grid-template-columns:1fr !important; }
          .game-container { padding:12px !important; }
        }
      `}</style>

      <Confetti active={confetti} />
      {showScorePop && <ScorePopup pts={lastAwardedPoints} speed={lastSpeedBonus} multiplier={lastMultiplier} />}


      {/* ─── INTRO ─────────────────────────────────────────────────────────── */}
      {screen === "intro" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 24px 40px", paddingTop: 40, animation: "fadeUp 0.5s ease" }}>
          {/* Casino lights ring at top */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {["♠","♥","♦","♣","★","♠","♥","♦","♣","★"].map((s, i) => (
              <div key={i} style={{
                fontSize: 20, color: i % 2 === 0 ? C.gold : C.red,
                textShadow: `0 0 10px ${i % 2 === 0 ? C.gold : C.red}`,
                animation: `neonPulse ${0.8 + i * 0.15}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`
              }}>{s}</div>
            ))}
          </div>

          <div className="felt-table" style={{
            borderRadius: 28, padding: "44px 40px", maxWidth: 620, width: "100%", textAlign: "center",
            animation: "marqueeGlow 3s ease-in-out infinite",
            position: "relative", overflow: "hidden"
          }}>
            {/* Corner diamonds */}
            {["top:12px;left:12px", "top:12px;right:12px", "bottom:12px;left:12px", "bottom:12px;right:12px"].map((pos, i) => (
              <div key={i} style={{ position: "absolute", ...(Object.fromEntries(pos.split(";").map(p => p.split(":")))), fontSize: 18, color: C.gold, opacity: 0.5, animation: `neonPulse ${1.5 + i * 0.3}s ease-in-out infinite` }}>♦</div>
            ))}

            {/* Zone badges */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 28 }}>
              {levels.map(l => (
                <SpinningCard key={l.id} icon={l.icon} color={l.color} />
              ))}
            </div>

            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(52px, 10vw, 76px)",
              letterSpacing: 4,
              lineHeight: 1,
              margin: "0 0 8px",
              background: "linear-gradient(180deg, #fff8e1 0%, #ffd700 40%, #ff8c00 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 20px #ffd70066)",
            }}>
              Angular Quest
            </div>
            <div style={{ color: C.muted, margin: "0 0 8px", fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}>
              ─ The Knowledge Casino ─
            </div>
            <div style={{ color: C.muted, margin: "0 0 28px", fontSize: 13, lineHeight: 1.7, opacity: 0.8 }}>
              Place your bets on Angular mastery<br />
              Components · Directives · Services · Pipes · Routing · Forms
            </div>

            <GoldDivider />

            <div className="intro-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, margin: "20px 0 28px" }}>
              {[
                ["🎰", `${zoneCount}`, "Zones"],
                ["🃏", `${totalQuestionCount}`, "Questions"],
                ["♥", `${TOTAL_LIVES}`, "Lives"]
              ].map(([em, t, s]) => (
                <div key={t + s} style={{
                  background: "rgba(255,215,0,0.05)",
                  borderRadius: 14, padding: "16px 10px",
                  border: "1px solid #ffd70033",
                  boxShadow: "inset 0 1px 0 rgba(255,215,0,0.1)"
                }}>
                  <div style={{ fontSize: 26, marginBottom: 4, filter: "drop-shadow(0 0 6px currentColor)" }}>{em}</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: C.gold, textShadow: "0 0 10px #ffd70088" }}>{t}</div>
                  <div style={{ color: C.faint, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>{s}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                className="casino-btn"
                disabled={zoneCount === 0}
                onClick={() => setScreen("namePicker")}
                style={{
                  background: zoneCount === 0 ? "#e8dcc4" : "linear-gradient(135deg, #ffd700, #ff8c00, #ffd700)",
                  backgroundSize: "200% 100%",
                  color: zoneCount === 0 ? C.faint : "#3a2400",
                  padding: "15px 44px", borderRadius: 14, fontSize: 18,
                  letterSpacing: 2, textTransform: "uppercase",
                  boxShadow: zoneCount === 0 ? "none" : "0 6px 30px #ffd70066, 0 0 20px #ffd70044",
                  animation: zoneCount > 0 ? "goldShimmer 2s linear infinite" : "none"
                }}>
                🎲 Place Your Bet
              </button>
              <button
                className="casino-btn"
                onClick={() => goLeaderboard("intro")}
                style={{
                  background: "rgba(255,215,0,0.08)", color: C.gold,
                  border: `1.5px solid ${C.border}`, padding: "15px 24px",
                  borderRadius: 14, fontSize: 16, letterSpacing: 1
                }}>
                🏆 Hall of Fame
              </button>
            </div>

            {leaderboardError && <div style={{ marginTop: 10, fontSize: 12, color: C.red, textAlign: "center", opacity: 0.8 }}>{leaderboardError}</div>}
            {zoneCount === 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.faint, animation: "neonPulse 1.2s infinite" }}>Loading the deck…</div>}
          </div>
        </div>
      )}

      {/* ─── NAME PICKER ───────────────────────────────────────────────────── */}
      {screen === "namePicker" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 24, padding: "48px 40px", maxWidth: 440, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 60, marginBottom: 12, animation: "cardFloat 3s ease-in-out infinite" }}>🎭</div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, letterSpacing: 3,
              color: C.gold, textShadow: "0 0 20px #ffd70088",
              marginBottom: 6
            }}>Who's at the Table?</div>
            <p style={{ color: C.muted, margin: "0 0 30px", fontSize: 14, letterSpacing: 0.5 }}>
              Your alias for the leaderboard
            </p>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && nameInput.trim() && startGame(nameInput.trim())}
              placeholder="Enter your alias…"
              maxLength={20}
              style={{
                width: "100%", padding: "14px 18px",
                border: `2px solid ${nameInput.trim() ? C.gold : C.border}`,
                borderRadius: 12, fontSize: 18,
                fontFamily: "'Playfair Display', serif",
                outline: "none", marginBottom: 16,
                background: "rgba(255,215,0,0.05)",
                color: C.text,
                transition: "border-color 0.2s, box-shadow 0.2s",
                boxShadow: nameInput.trim() ? "0 0 15px #ffd70033" : "none",
                letterSpacing: 1
              }}
            />
            <button
              className="casino-btn"
              disabled={!nameInput.trim()}
              onClick={() => nameInput.trim() && startGame(nameInput.trim())}
              style={{
                width: "100%",
                background: nameInput.trim() ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "#e8dcc4",
                color: nameInput.trim() ? "#3a2400" : C.faint,
                padding: "15px", borderRadius: 12, fontSize: 18,
                letterSpacing: 2, textTransform: "uppercase",
                boxShadow: nameInput.trim() ? "0 6px 24px #ffd70055" : "none"
              }}>
              🃏 Deal Me In →
            </button>
            <button
              onClick={() => setScreen("intro")}
              style={{ display: "block", width: "100%", marginTop: 12, background: "none", border: "none", color: C.faint, cursor: "pointer", fontFamily: "'Crimson Pro', serif", fontSize: 14, padding: "6px 0", letterSpacing: 1 }}>
              ← Fold
            </button>
          </div>
        </div>
      )}

      {/* ─── GAME ──────────────────────────────────────────────────────────── */}
      {screen === "game" && level && question && (
        <div className="game-container" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", animation: shake ? "shake .4s ease" : "none", paddingTop: 6 }}>

          {/* Casino HUD */}
          <div style={{
            background: "linear-gradient(180deg, #ffffff 0%, #f7f0e2 100%)",
            borderBottom: `1px solid ${C.border}`,
            padding: "10px 20px",
            position: "sticky", top: 6, zIndex: 10,
            boxShadow: "0 4px 20px rgba(67,44,7,0.12)"
          }}>
            <div className="hud-casino" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              {/* Zone info */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: `linear-gradient(135deg, #fffaf0, #f1e5c8)`,
                  border: `2px solid ${level.color}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 20, boxShadow: `0 0 12px ${level.color}66`
                }}>{level.icon}</div>
                <div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, letterSpacing: 2, color: level.color, textShadow: `0 0 8px ${level.color}` }}>{level.name}</div>
                  <div style={{ fontSize: 11, color: C.faint, letterSpacing: 0.5 }}>{level.subtitle}</div>
                </div>
              </div>

              {/* Metrics */}
              <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Player</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 13, color: C.text }}>{playerName}</div>
                </div>
                <div style={{ width: 1, height: 30, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Chips</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: C.gold, textShadow: "0 0 10px #ffd70088", letterSpacing: 1 }}>{score}</div>
                </div>
                <div style={{ width: 1, height: 30, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Lives</div>
                  <LivesDisplay lives={lives} />
                </div>
                <div style={{ width: 1, height: 30, background: C.border }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Streak</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: streak >= 3 ? "#ff6b00" : C.green, textShadow: `0 0 8px ${streak >= 3 ? "#ff6b00" : C.green}`, letterSpacing: 1 }}>
                    {streak >= 3 ? "🔥" : "⚡"} {streak}
                  </div>
                </div>
                <div style={{ width: 1, height: 30, background: C.border }} />
                <TimerRing value={questionTimeLeft} />
              </div>
            </div>
          </div>

          {/* Progress bar — casino gold */}
          <div style={{ height: 4, background: "#eadfc8" }}>
            <div style={{
              height: "100%", width: `${progress}%`,
              background: "linear-gradient(90deg, #ffd700, #ff8c00)",
              transition: "width 0.4s ease",
              boxShadow: "0 0 10px #ffd70088"
            }} />
          </div>

          {/* Content */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", maxWidth: 720, margin: "0 auto", width: "100%" }}>

            {/* Step dots */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {level.questions.map((_, i) => (
                <div key={i} style={{
                  width: 36, height: 5, borderRadius: 3,
                  background: i < qIdx ? C.gold : i === qIdx ? `${C.gold}66` : "#eadfc8",
                  transition: "background 0.3s",
                  boxShadow: i === qIdx ? `0 0 8px ${C.gold}88` : i < qIdx ? `0 0 5px ${C.gold}44` : "none"
                }} />
              ))}
            </div>

            {/* Zone description */}
            <div style={{
              background: `linear-gradient(135deg, rgba(255,215,0,0.06), rgba(255,215,0,0.02))`,
              border: `1px solid ${level.color}44`,
              borderLeft: `3px solid ${level.color}`,
              borderRadius: 10, padding: "10px 16px", marginBottom: 20,
              fontSize: 13, color: C.muted, width: "100%", lineHeight: 1.65,
              boxShadow: `0 0 15px ${level.color}11`
            }}>
              <b style={{ color: level.color, textShadow: `0 0 6px ${level.color}88` }}>Zone: </b>{level.description}
            </div>

            {/* Question card */}
            <div className="felt-table" style={{
              borderRadius: 20, padding: "28px", width: "100%",
              animation: "spinIn 0.3s ease"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <div style={{
                  background: `rgba(255,215,0,0.1)`, color: C.gold,
                  borderRadius: 8, padding: "4px 12px", fontSize: 12,
                  fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2,
                  border: "1px solid #ffd70033"
                }}>Card {qIdx + 1} / {level.questions.length}</div>
                <div style={{ height: 3, flex: 1, background: "#eadfc8", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${(qIdx / level.questions.length) * 100}%`, background: "linear-gradient(90deg, #ffd700, #ff8c00)", borderRadius: 2, transition: "width 0.4s", boxShadow: "0 0 6px #ffd70066" }} />
                </div>
                {streak >= 3 && (
                  <div style={{ fontSize: 12, color: C.orange, textShadow: "0 0 8px #ff6b00", fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, animation: "neonPulse 0.8s infinite" }}>
                    🔥 HOT STREAK ×{lastMultiplier.toFixed(1)}
                  </div>
                )}
              </div>

              <div style={{
                fontSize: "clamp(15px,2.2vw,19px)", fontFamily: "'Playfair Display', serif",
                fontWeight: 500, marginBottom: 22, lineHeight: 1.6, color: C.text,
                padding: "16px", background: "rgba(255,215,0,0.04)", borderRadius: 12,
                border: "1px solid rgba(255,215,0,0.1)"
              }}>
                {question.q}
              </div>

              <div className="question-options" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {question.options.map((opt, i) => {
                  const labels = ["A", "B", "C", "D"];
                  const labelColors = [C.gold, C.cyan, C.green, C.purple];

                  let bg = "rgba(255,255,255,0.03)";
                  let border = "1.5px solid rgba(255,215,0,0.15)";
                  let clr = C.text;
                  let shadow = "none";
                  let badgeBg = "rgba(255,215,0,0.15)";
                  let badgeClr = labelColors[i];

                  if (showFB) {
                    if (isCorrect && i === question.answer) {
                      bg = "rgba(0,255,170,0.12)"; border = "1.5px solid #00ffaa";
                      clr = C.green; shadow = "0 0 0 3px #00ffaa22, 0 0 20px #00ffaa22";
                      badgeBg = "#00ffaa"; badgeClr = "#001a0f";
                    } else if (i === picked && !isCorrect) {
                      bg = "rgba(255,51,102,0.12)"; border = "1.5px solid #ff3366";
                      clr = C.red; shadow = "0 0 0 3px #ff336622, 0 0 20px #ff336622";
                      badgeBg = "#ff3366"; badgeClr = "#fff";
                    }
                  } else if (picked === i) {
                    bg = `rgba(255,215,0,0.1)`; border = `1.5px solid ${C.gold}`;
                    clr = C.gold; badgeBg = C.gold; badgeClr = "#1a0800";
                    shadow = "0 0 15px #ffd70033";
                  }

                  return (
                    <button key={i} className="opt-casino" disabled={showFB} onClick={() => handleAnswer(i)} style={{
                      background: bg, border, borderRadius: 12,
                      padding: "13px 14px", color: clr,
                      fontFamily: "'Crimson Pro', serif", fontSize: 15, lineHeight: 1.5,
                      boxShadow: shadow, display: "flex", gap: 10, alignItems: "flex-start"
                    }}>
                      <span style={{
                        minWidth: 26, height: 26, background: badgeBg, color: badgeClr,
                        borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 700, flexShrink: 0, fontFamily: "'Bebas Neue', sans-serif",
                        letterSpacing: 1, transition: "all 0.2s",
                        boxShadow: `0 0 8px ${badgeClr}44`
                      }}>{labels[i]}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {showFB && (
                <div style={{
                  marginTop: 18, padding: "16px 18px", borderRadius: 12,
                  background: isCorrect ? "rgba(0,255,170,0.08)" : "rgba(255,51,102,0.08)",
                  border: `1.5px solid ${isCorrect ? C.green : C.red}`,
                  boxShadow: `0 0 20px ${isCorrect ? C.green : C.red}22`,
                  animation: "popIn 0.3s ease"
                }}>
                  <div style={{
                    fontFamily: "'Playfair Display', serif", fontWeight: 700,
                    color: isCorrect ? C.green : C.red, marginBottom: 6, fontSize: 16,
                    textShadow: `0 0 10px ${isCorrect ? C.green : C.red}88`
                  }}>
                    {isCorrect ? `✓ Winner! +${lastAwardedPoints} chips 🎉` : "✗ House wins this round — life lost"}
                  </div>
                  {isCorrect && (
                    <div style={{ fontSize: 12, color: "#00cc88", marginBottom: 6, letterSpacing: 0.5 }}>
                      +100 base · ×{lastMultiplier.toFixed(1)} streak · +{lastSpeedBonus} speed bonus
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: isCorrect ? "#00cc88" : "#cc3355", lineHeight: 1.65 }}>{question.explanation}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── LEVEL DONE ────────────────────────────────────────────────────── */}
      {screen === "levelDone" && level && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 28, padding: "52px 44px", maxWidth: 500, width: "100%", textAlign: "center", animation: "marqueeGlow 2s ease-in-out infinite" }}>
            <div style={{
              width: 86, height: 86, borderRadius: 22,
              background: "linear-gradient(135deg, #1a0800, #2d1500)",
              border: `2px solid ${level.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 40, margin: "0 auto 16px",
              boxShadow: `0 0 30px ${level.color}88, 0 0 60px ${level.color}44`
            }}>{level.icon}</div>

            <div style={{ fontSize: 12, color: level.color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 3, marginBottom: 8, textShadow: `0 0 10px ${level.color}` }}>
              ZONE CLEARED ✓
            </div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, margin: "0 0 4px", color: C.gold, textShadow: "0 0 20px #ffd70066" }}>{level.name}</h2>
            <p style={{ color: C.muted, margin: "0 0 28px", fontSize: 15 }}>{level.subtitle}</p>

            <GoldDivider />

            <div style={{ display: "flex", justifyContent: "center", gap: 36, margin: "20px 0 32px" }}>
              {[["Zone Score", lvlScore, C.gold], ["Total Chips", score, level.color], ["Lives Left", "♥".repeat(lives), C.red]].map(([l, v, c]) => (
                <div key={l}>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: c, textShadow: `0 0 15px ${c}88`, letterSpacing: 1 }}>{v}</div>
                  <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>{l}</div>
                </div>
              ))}
            </div>

            {levelIdx + 1 < levels.length && (
              <div style={{
                background: `rgba(255,215,0,0.06)`,
                border: `1px solid ${levels[levelIdx + 1].color}44`,
                borderRadius: 14, padding: "12px 18px", marginBottom: 22,
                display: "flex", alignItems: "center", gap: 12, justifyContent: "center"
              }}>
                <span style={{ fontSize: 24, filter: `drop-shadow(0 0 6px ${levels[levelIdx + 1].color})` }}>{levels[levelIdx + 1].icon}</span>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Next Zone</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: levels[levelIdx + 1].color, fontSize: 15, textShadow: `0 0 8px ${levels[levelIdx + 1].color}88` }}>{levels[levelIdx + 1].name}</div>
                </div>
              </div>
            )}

            <button className="casino-btn" onClick={nextLevel} style={{
              background: `linear-gradient(135deg, ${C.gold}, #ff8c00)`,
              color: "#1a0800", padding: "15px 48px", borderRadius: 14,
              fontSize: 18, letterSpacing: 2, textTransform: "uppercase",
              boxShadow: "0 6px 24px #ffd70055, 0 0 40px #ffd70022"
            }}>
              {levelIdx + 1 >= levels.length ? "🎊 Final Results" : "Next Zone →"}
            </button>
          </div>
        </div>
      )}

      {/* ─── GAME OVER ─────────────────────────────────────────────────────── */}
      {screen === "gameOver" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 28, padding: "52px 44px", maxWidth: 460, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 72, marginBottom: 12, animation: "cardFloat 2s ease-in-out infinite", filter: "drop-shadow(0 0 20px #ff3366)" }}>💔</div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: 4,
              color: C.red, textShadow: "0 0 30px #ff336688, 0 0 60px #ff336644",
              margin: "0 0 6px"
            }}>Bust!</div>
            <p style={{ color: C.muted, margin: "0 0 6px", fontSize: 15 }}>
              Out of lives in <b style={{ color: level?.color, textShadow: `0 0 8px ${level?.color}88` }}>{level?.name}</b>
            </p>
            <p style={{ color: C.faint, fontSize: 13, margin: "0 0 28px", letterSpacing: 0.5 }}>Score saved to the leaderboard</p>

            <GoldDivider />

            <div style={{ margin: "20px 0 32px" }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, color: C.gold, textShadow: "0 0 30px #ffd70099", letterSpacing: 2 }}>{score}</div>
              <div style={{ fontSize: 12, color: C.faint, letterSpacing: 2, textTransform: "uppercase" }}>Final Chips</div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="casino-btn" onClick={() => goLeaderboard("gameOver")} style={{
                background: "rgba(255,215,0,0.08)", color: C.gold,
                border: `1.5px solid ${C.border}`, padding: "12px 20px",
                borderRadius: 12, fontSize: 15, letterSpacing: 1
              }}>🏆 Hall of Fame</button>
              <button className="casino-btn" onClick={() => setScreen("namePicker")} style={{
                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                color: "#1a0800", padding: "12px 28px", borderRadius: 12,
                fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
                boxShadow: "0 4px 20px #ffd70055"
              }}>🎲 Rematch</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VICTORY ───────────────────────────────────────────────────────── */}
      {screen === "victory" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.5s ease" }}>
          <div className="felt-table" style={{ borderRadius: 28, padding: "56px 48px", maxWidth: 560, width: "100%", textAlign: "center", animation: "marqueeGlow 2s ease-in-out infinite" }}>
            <div style={{ fontSize: 80, marginBottom: 10, filter: "drop-shadow(0 0 30px #ffd700)", animation: "cardFloat 2s ease-in-out infinite" }}>🏆</div>
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: "clamp(36px, 8vw, 60px)", letterSpacing: 4,
              background: "linear-gradient(180deg, #fff8e1, #ffd700, #ff8c00)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              filter: "drop-shadow(0 0 20px #ffd70066)",
              margin: "0 0 8px"
            }}>Angular Mastered!</div>
            <p style={{ color: C.muted, margin: "0 0 28px", fontSize: 16 }}>
              Well played, <span style={{ color: C.gold, textShadow: "0 0 10px #ffd70088", fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>{playerName}</span>! All 6 zones conquered.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 28 }}>
              {levels.map(l => (
                <div key={l.id} style={{
                  background: `rgba(255,215,0,0.06)`,
                  border: `1px solid ${l.color}55`,
                  borderRadius: 12, padding: "10px 6px", textAlign: "center",
                  boxShadow: `0 0 10px ${l.color}22`
                }}>
                  <div style={{ fontSize: 22, filter: `drop-shadow(0 0 6px ${l.color})` }}>{l.icon}</div>
                  <div style={{ fontSize: 10, color: l.color, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 1, marginTop: 4 }}>✓ {l.name}</div>
                </div>
              ))}
            </div>

            <GoldDivider />

            <div style={{ display: "flex", justifyContent: "center", gap: 48, margin: "20px 0 32px" }}>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: C.gold, textShadow: "0 0 25px #ffd700aa", letterSpacing: 2 }}>{score}</div>
                <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Final Chips</div>
              </div>
              <div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: C.red, textShadow: "0 0 20px #ff336688", letterSpacing: 2 }}>{"♥".repeat(lives)}</div>
                <div style={{ fontSize: 11, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Lives Left</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="casino-btn" onClick={() => goLeaderboard("victory")} style={{
                background: "rgba(255,215,0,0.08)", color: C.gold,
                border: `1.5px solid ${C.border}`, padding: "13px 22px",
                borderRadius: 14, fontSize: 15, letterSpacing: 1
              }}>🏆 Hall of Fame</button>
              <button className="casino-btn" onClick={() => setScreen("namePicker")} style={{
                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                color: "#1a0800", padding: "13px 32px", borderRadius: 14,
                fontSize: 17, letterSpacing: 2, textTransform: "uppercase",
                boxShadow: "0 6px 24px #ffd70066"
              }}>🎲 Play Again</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── LEADERBOARD ───────────────────────────────────────────────────── */}
      {screen === "leaderboard" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 28, padding: "44px 36px", maxWidth: 540, width: "100%", animation: "marqueeGlow 3s ease-in-out infinite" }}>
            <div style={{ textAlign: "center", marginBottom: 28 }}>
              <div style={{ fontSize: 52, marginBottom: 8, animation: "cardFloat 3s ease-in-out infinite", filter: "drop-shadow(0 0 20px #ffd700)" }}>🏆</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, letterSpacing: 4, color: C.gold, textShadow: "0 0 20px #ffd70088" }}>Hall of Fame</div>
              <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>Top Angular Quest Players</p>
            </div>

            <GoldDivider />

            {leaderboard.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.faint }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 15, fontFamily: "'Playfair Display', serif" }}>
                  {leaderboardError ? "Leaderboard unavailable" : "No scores yet — be the first!"}
                </div>
                {leaderboardError && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{leaderboardError}</div>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                <div style={{ display: "flex", gap: 12, padding: "0 16px", fontSize: 11, color: C.faint, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
                  <div style={{ minWidth: 32 }}>#</div>
                  <div style={{ flex: 1 }}>Player</div>
                  <div>Date</div>
                  <div style={{ minWidth: 60, textAlign: "right" }}>Score</div>
                </div>
                {leaderboard.slice(0, 10).map((entry, i) => {
                  const glows = ["0 0 20px #ffd70044", "0 0 15px #c0c4cc33", "0 0 12px #cd7f3233", "none"];
                  const borders = ["1.5px solid #ffd70055", "1.5px solid #c0c4cc44", "1.5px solid #cd7f3255", "1px solid rgba(255,215,0,0.1)"];
                  const bgs = [
                    "linear-gradient(135deg, rgba(255,215,0,0.1), rgba(255,140,0,0.05))",
                    "linear-gradient(135deg, rgba(192,196,204,0.1), rgba(148,163,184,0.05))",
                    "linear-gradient(135deg, rgba(205,127,50,0.1), rgba(160,100,30,0.05))",
                    "rgba(255,215,0,0.03)"
                  ];
                  const scoreColors = [C.gold, "#c0c4cc", "#cd7f32", C.muted];
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 12,
                      background: bgs[Math.min(i, 3)],
                      border: borders[Math.min(i, 3)],
                      borderRadius: 14, padding: "13px 16px",
                      animation: `fadeUp ${0.1 + i * 0.06}s ease both`,
                      boxShadow: glows[Math.min(i, 3)]
                    }}>
                      <div style={{ fontSize: 22, minWidth: 32, filter: i < 3 ? "drop-shadow(0 0 6px currentColor)" : "none" }}>
                        {MEDALS[i] || <span style={{ fontFamily: "'Bebas Neue', sans-serif", color: C.faint, fontSize: 16, letterSpacing: 1 }}>{i + 1}</span>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, color: C.text }}>{entry.name}</div>
                      </div>
                      <div style={{ fontSize: 12, color: C.faint, letterSpacing: 0.5 }}>{entry.date}</div>
                      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: scoreColors[Math.min(i, 3)], minWidth: 60, textAlign: "right", textShadow: i < 3 ? `0 0 10px ${scoreColors[i]}88` : "none", letterSpacing: 1 }}>
                        {entry.score}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 28, justifyContent: "center" }}>
              <button className="casino-btn" onClick={() => setScreen(prevScreen)} style={{
                background: "rgba(255,215,0,0.06)", color: C.gold,
                border: `1.5px solid ${C.border}`, padding: "12px 20px",
                borderRadius: 12, fontSize: 15, letterSpacing: 1
              }}>← Back</button>
              <button className="casino-btn" onClick={() => setScreen("namePicker")} style={{
                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                color: "#1a0800", padding: "12px 30px", borderRadius: 12,
                fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
                boxShadow: "0 4px 20px #ffd70055"
              }}>🎲 Play Now</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADMIN LOGIN ───────────────────────────────────────────────────── */}
      {screen === "adminLogin" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 24, padding: "36px 32px", maxWidth: 430, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>🔐</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 3, color: C.gold, textShadow: "0 0 15px #ffd70088" }}>VIP Access</div>
            <p style={{ color: C.muted, margin: "0 0 24px", fontSize: 14, letterSpacing: 0.5 }}>Enter admin PIN to open the backroom</p>
            <input
              autoFocus
              value={adminPinInput}
              onChange={e => setAdminPinInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
              placeholder="Admin PIN"
              type="password"
              style={{
                width: "100%", padding: "14px 18px",
                border: `2px solid ${C.border}`, borderRadius: 12,
                fontSize: 20, fontFamily: "'Playfair Display', serif",
                outline: "none", marginBottom: 12,
                background: "rgba(255,215,0,0.05)",
                color: C.text, letterSpacing: 4, textAlign: "center"
              }}
            />
            <button className="casino-btn" onClick={handleAdminLogin} style={{
              width: "100%", background: "linear-gradient(135deg, #ffd700, #ff8c00)",
              color: "#1a0800", padding: "13px", borderRadius: 12, fontSize: 17,
              letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 4px 20px #ffd70055"
            }}>Enter Backroom</button>
            {adminNotice && <div style={{ marginTop: 10, fontSize: 12, color: C.red, textAlign: "center" }}>{adminNotice}</div>}
            <button onClick={() => setScreen(prevScreen || "intro")} style={{ display: "block", width: "100%", marginTop: 10, background: "none", border: "none", color: C.faint, cursor: "pointer", fontFamily: "'Crimson Pro', serif", fontSize: 14, padding: "6px 0", letterSpacing: 1 }}>← Exit</button>
          </div>
        </div>
      )}

      {/* ─── ADMIN ─────────────────────────────────────────────────────────── */}
      {screen === "admin" && isAdminAuthenticated && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24, animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 24, padding: "34px 30px", maxWidth: 780, width: "100%" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 44, marginBottom: 6 }}>🎰</div>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, letterSpacing: 3, color: C.gold, textShadow: "0 0 20px #ffd70088" }}>The Backroom</div>
              <p style={{ margin: 0, color: C.muted, fontSize: 14, letterSpacing: 0.5 }}>Admin Dashboard — manage game content and monitor progress</p>
            </div>

            <GoldDivider />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "16px 0" }}>
              {[
                ["PLAYER", userProgress?.playerName || "Guest"],
                ["SCREEN", userProgress?.screen || "intro"],
                ["PROGRESS", `${userProgress?.overallProgress ?? 0}%`],
                ["SESSION", `Score: ${userProgress?.score ?? 0} · Lives: ${userProgress?.lives ?? TOTAL_LIVES}`],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12, padding: "14px 14px" }}>
                  <div style={{ fontSize: 11, color: C.faint, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 17, color: C.text }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,215,0,0.04)", border: "1px solid rgba(255,215,0,0.15)", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: C.faint, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 4 }}>LAST UPDATE</div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 600, fontSize: 14, color: C.text }}>{userProgress?.lastUpdated || "Not available"}</div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <button className="casino-btn" onClick={handleExportLevels} style={{ background: "rgba(255,215,0,0.08)", color: C.gold, border: `1.5px solid ${C.border}`, padding: "11px 18px", borderRadius: 10, fontSize: 14, letterSpacing: 1 }}>Export Levels JSON</button>
              <button className="casino-btn" onClick={() => importFileRef.current?.click()} style={{ background: "rgba(255,215,0,0.08)", color: C.gold, border: `1.5px solid ${C.border}`, padding: "11px 18px", borderRadius: 10, fontSize: 14, letterSpacing: 1 }}>Import Levels JSON</button>
              <input ref={importFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportLevels} />
            </div>

            {adminNotice && <div style={{ marginTop: 6, fontSize: 12, color: C.muted, textAlign: "center" }}>{adminNotice}</div>}

            <div style={{ marginTop: 14, background: "rgba(255,215,0,0.03)", border: "1px solid rgba(255,215,0,0.12)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: C.faint, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2, marginBottom: 10 }}>ACHIEVEMENTS (SESSION)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}>
                {earnedAchievements.map(a => (
                  <div key={a.id} style={{
                    background: a.unlocked ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${a.unlocked ? "#ffd70055" : "rgba(255,215,0,0.1)"}`,
                    borderRadius: 10, padding: "10px",
                    boxShadow: a.unlocked ? "0 0 10px #ffd70022" : "none"
                  }}>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 13, color: a.unlocked ? C.gold : C.faint, textShadow: a.unlocked ? "0 0 8px #ffd70066" : "none" }}>
                      {a.unlocked ? "🏅" : "🔒"} {a.title}
                    </div>
                    <div style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>{a.unlocked ? "Unlocked" : "Locked"}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20, flexWrap: "wrap" }}>
              <button className="casino-btn" onClick={() => setScreen(prevScreen)} style={{ background: "rgba(255,215,0,0.06)", color: C.gold, border: `1.5px solid ${C.border}`, padding: "12px 20px", borderRadius: 12, fontSize: 14, letterSpacing: 1 }}>← Back</button>
              <button className="casino-btn" onClick={() => { setIsAdminAuthenticated(false); setScreen("intro"); }} style={{ background: "rgba(255,255,255,0.04)", color: C.muted, border: `1.5px solid rgba(255,215,0,0.15)`, padding: "12px 20px", borderRadius: 12, fontSize: 14, letterSpacing: 1 }}>🔓 Logout</button>
              <button className="casino-btn" onClick={() => setScreen("namePicker")} style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", color: "#1a0800", padding: "12px 28px", borderRadius: 12, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 4px 20px #ffd70055" }}>Play Now →</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
