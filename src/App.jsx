import { useState, useCallback, useRef, useEffect } from "react";
import initSqlJs from "sql.js";

const GAME_CONTENT_SEED_URL = "/seed-levels.json";

const TOTAL_LIVES = 3;
const MEDALS = ["🥇", "🥈", "🥉"];

const SQLITE_IDB_NAME = "angular_quest_db";
const SQLITE_IDB_STORE = "sqlite";
const SQLITE_IDB_KEY = "main";
const COMPANY_NAME = "ARAB SOFT";
const COMPANY_LOGO_SRC = "/company-logo.svg";

let sqliteDbPromise;

function openIndexedDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(SQLITE_IDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SQLITE_IDB_STORE)) {
        db.createObjectStore(SQLITE_IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDbBytes() {
  if (!window.indexedDB) return null;
  const db = await openIndexedDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SQLITE_IDB_STORE, "readonly");
    const store = transaction.objectStore(SQLITE_IDB_STORE);
    const request = store.get(SQLITE_IDB_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function writeDbBytes(bytes) {
  if (!window.indexedDB) return;
  const db = await openIndexedDb();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(SQLITE_IDB_STORE, "readwrite");
    const store = transaction.objectStore(SQLITE_IDB_STORE);
    store.put(bytes, SQLITE_IDB_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function getSqliteDb() {
  if (!sqliteDbPromise) {
    sqliteDbPromise = (async () => {
      const SQL = await initSqlJs({
        locateFile: (file) => `https://sql.js.org/dist/${file}`,
      });

      const existingBytes = await readDbBytes();
      const db = existingBytes ? new SQL.Database(existingBytes) : new SQL.Database();
      db.run("CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      db.run(`
        CREATE TABLE IF NOT EXISTS levels (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          subtitle TEXT NOT NULL,
          color TEXT NOT NULL,
          light TEXT NOT NULL,
          icon TEXT NOT NULL,
          description TEXT NOT NULL
        )
      `);
      db.run(`
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          q TEXT NOT NULL,
          options TEXT NOT NULL,
          answer INTEGER NOT NULL,
          explanation TEXT NOT NULL,
          FOREIGN KEY(level_id) REFERENCES levels(id)
        )
      `);
      return db;
    })();
  }
  return sqliteDbPromise;
}

async function sqliteGetJson(key) {
  const db = await getSqliteDb();
  const statement = db.prepare("SELECT value FROM kv WHERE key = ? LIMIT 1");
  statement.bind([key]);
  let result = null;
  if (statement.step()) {
    const row = statement.getAsObject();
    result = row.value;
  }
  statement.free();
  if (!result) return null;
  return JSON.parse(result);
}

async function sqliteSetJson(key, value) {
  const db = await getSqliteDb();
  db.run(
    "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)]
  );
  const bytes = db.export();
  await writeDbBytes(bytes);
}

async function ensureGameContentSeeded() {
  const db = await getSqliteDb();
  const result = db.exec("SELECT COUNT(*) AS count FROM levels");
  const count = result.length > 0 ? Number(result[0].values[0][0]) : 0;
  if (count > 0) return;

  const response = await fetch(GAME_CONTENT_SEED_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Unable to load seed levels file.");
  }

  const seedLevels = await response.json();
  await replaceGameContentInDb(seedLevels);
}

function isValidQuestion(question) {
  return (
    question &&
    typeof question.q === "string" &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    question.options.every((option) => typeof option === "string") &&
    Number.isInteger(question.answer) &&
    question.answer >= 0 &&
    question.answer <= 3 &&
    typeof question.explanation === "string"
  );
}

function isValidLevel(level) {
  return (
    level &&
    Number.isInteger(level.id) &&
    typeof level.name === "string" &&
    typeof level.subtitle === "string" &&
    typeof level.color === "string" &&
    typeof level.light === "string" &&
    typeof level.icon === "string" &&
    typeof level.description === "string" &&
    Array.isArray(level.questions) &&
    level.questions.length > 0 &&
    level.questions.every(isValidQuestion)
  );
}

function normalizeImportedLevels(levels) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new Error("Content must be a non-empty levels array.");
  }

  if (!levels.every(isValidLevel)) {
    throw new Error("Invalid level/question structure in imported JSON.");
  }

  const uniqueIds = new Set(levels.map((level) => level.id));
  if (uniqueIds.size !== levels.length) {
    throw new Error("Each level must have a unique numeric id.");
  }

  return [...levels].sort((a, b) => a.id - b.id);
}

async function replaceGameContentInDb(rawLevels) {
  const gameLevels = normalizeImportedLevels(rawLevels);
  const db = await getSqliteDb();

  db.run("BEGIN");
  try {
    db.run("DELETE FROM questions");
    db.run("DELETE FROM levels");

    const levelStmt = db.prepare(
      "INSERT INTO levels (id, name, subtitle, color, light, icon, description) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const questionStmt = db.prepare(
      "INSERT INTO questions (level_id, position, q, options, answer, explanation) VALUES (?, ?, ?, ?, ?, ?)"
    );

    gameLevels.forEach((level) => {
      levelStmt.run([
        level.id,
        level.name,
        level.subtitle,
        level.color,
        level.light,
        level.icon,
        level.description,
      ]);

      level.questions.forEach((question, index) => {
        questionStmt.run([
          level.id,
          index,
          question.q,
          JSON.stringify(question.options),
          question.answer,
          question.explanation,
        ]);
      });
    });

    levelStmt.free();
    questionStmt.free();
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  const bytes = db.export();
  await writeDbBytes(bytes);
}

function BrandBadge() {
  return (
    <div style={{ position: "fixed", top: 12, left: 12, zIndex: 40, background: "rgba(255,255,255,.92)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "7px 10px", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 4px 14px rgba(0,0,0,.08)", backdropFilter: "blur(4px)" }}>
      <img
        src={COMPANY_LOGO_SRC}
        alt={COMPANY_NAME}
        style={{ width: 34, height: 20, objectFit: "contain", borderRadius: 4, background: "#fff" }}
      />
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.9, color: C.text }}>{COMPANY_NAME}</div>
    </div>
  );
}

async function loadGameContentFromDb() {
  const db = await getSqliteDb();

  const levelsResult = db.exec(
    "SELECT id, name, subtitle, color, light, icon, description FROM levels ORDER BY id"
  );

  if (levelsResult.length === 0) {
    return [];
  }

  const rows = levelsResult[0].values;
  const questionStmt = db.prepare(
    "SELECT q, options, answer, explanation FROM questions WHERE level_id = ? ORDER BY position"
  );

  const levels = rows.map((row) => {
    const [id, name, subtitle, color, light, icon, description] = row;
    questionStmt.bind([id]);

    const questions = [];
    while (questionStmt.step()) {
      const qRow = questionStmt.getAsObject();
      questions.push({
        q: qRow.q,
        options: JSON.parse(qRow.options),
        answer: Number(qRow.answer),
        explanation: qRow.explanation,
      });
    }

    questionStmt.reset();

    return {
      id: Number(id),
      name,
      subtitle,
      color,
      light,
      icon,
      description,
      questions,
    };
  });

  questionStmt.free();
  return levels;
}

function useStorage(key, initial) {
  const [val, setVal] = useState(initial);
  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const storedValue = await sqliteGetJson(key);
        if (isMounted && storedValue !== null) {
          setVal(storedValue);
        }
      } catch (_) {}
    })();

    return () => {
      isMounted = false;
    };
  }, [key]);

  const save = useCallback((v) => {
    setVal(v);

    (async () => {
      try {
        await sqliteSetJson(key, v);
      } catch (_) {}
    })();
  }, [key]);

  return [val, save];
}

function Confetti({ active }) {
  if (!active) return null;
  const colors = ["#e63950","#e07b00","#1a9e5c","#0070e0","#7b3fe4","#f5c800","#ff6b9d","#00bcd4"];
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:9999 }}>
      {Array.from({ length: 50 }, (_, i) => (
        <div key={i} style={{
          position:"absolute",
          left:`${Math.random()*100}%`,
          top:"-16px",
          width: 8 + Math.random()*6,
          height: 8 + Math.random()*6,
          borderRadius: Math.random()>.5 ? "50%" : 2,
          background: colors[i % colors.length],
          animation: `confFall ${1.2+Math.random()*1.4}s ease-in forwards`,
          animationDelay:`${Math.random()*.9}s`,
          transform:`rotate(${Math.random()*360}deg)`,
        }} />
      ))}
    </div>
  );
}

const C = { bg:"#f2f5fb", card:"#ffffff", border:"#e2e8f0", text:"#1a1d2e", muted:"#64748b", faint:"#94a3b8" };

export default function App() {
  const [screen, setScreen] = useState("intro");
  const [prevScreen, setPrevScreen] = useState("intro");
  const [playerName, setPlayerName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [levels, setLevels] = useState([]);
  const [leaderboard, saveLeaderboard] = useStorage("aq_lb_v2", []);
  const [levelIdx, setLevelIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [lives, setLives] = useState(TOTAL_LIVES);
  const [score, setScore] = useState(0);
  const [lvlScore, setLvlScore] = useState(0);
  const [picked, setPicked] = useState(null);
  const [showFB, setShowFB] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [shake, setShake] = useState(false);
  const [confetti, setConfetti] = useState(false);
  const [adminNotice, setAdminNotice] = useState("");
  const importFileRef = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        await ensureGameContentSeeded();
        const dbLevels = await loadGameContentFromDb();
        if (isMounted && dbLevels.length > 0) {
          setLevels(dbLevels);
        }
      } catch (_) {}
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const level = levels[levelIdx];
  const question = level?.questions[qIdx];

  const boom = () => { setConfetti(true); setTimeout(() => setConfetti(false), 2600); };

  const addScore = useCallback((name, s) => {
    const updated = [...leaderboard, { name, score: s, date: new Date().toLocaleDateString() }]
      .sort((a,b) => b.score - a.score).slice(0, 20);
    saveLeaderboard(updated);
  }, [leaderboard, saveLeaderboard]);

  const handleAnswer = useCallback((idx) => {
    if (showFB) return;
    clearTimeout(timer.current);
    setPicked(idx);
    const correct = idx === question.answer;
    setIsCorrect(correct);
    setShowFB(true);
    if (correct) { setScore(s => s+100); setLvlScore(s => s+100); }
    else { setLives(l => l-1); setShake(true); setTimeout(()=>setShake(false),500); }
    timer.current = setTimeout(() => {
      setShowFB(false); setPicked(null);
      if (correct) {
        if (qIdx+1 >= level.questions.length) { boom(); setScreen("levelDone"); }
        else setQIdx(q => q+1);
      } else {
        if (lives-1 <= 0) { addScore(playerName, score); setScreen("gameOver"); }
      }
    }, 2100);
  }, [showFB, question, qIdx, level, lives, score, playerName, addScore]);

  const nextLevel = () => {
    if (levelIdx+1 >= levels.length) { addScore(playerName, score); boom(); setScreen("victory"); }
    else { setLevelIdx(l=>l+1); setQIdx(0); setLvlScore(0); setScreen("game"); }
  };

  const startGame = (name) => {
    setPlayerName(name); setLevelIdx(0); setQIdx(0); setLives(TOTAL_LIVES);
    setScore(0); setLvlScore(0); setPicked(null); setShowFB(false); setScreen("game");
  };

  const goLeaderboard = (from) => { setPrevScreen(from); setScreen("leaderboard"); };

  const zoneCount = levels.length;
  const totalQuestionCount = levels.reduce((total, zone) => total + zone.questions.length, 0);
  const progress = level ? (qIdx / level.questions.length) * 100 : 0;

  const handleExportLevels = useCallback(async () => {
    try {
      const dbLevels = await loadGameContentFromDb();
      const payload = JSON.stringify(dbLevels, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "angular-quest-levels.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setAdminNotice("Levels exported successfully.");
    } catch (_) {
      setAdminNotice("Failed to export levels.");
    }
  }, []);

  const handleImportLevels = useCallback(async (event) => {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const json = JSON.parse(rawText);
      await replaceGameContentInDb(json);
      const dbLevels = await loadGameContentFromDb();
      if (dbLevels.length > 0) {
        setLevels(dbLevels);
        setLevelIdx(0);
        setQIdx(0);
        setScreen("intro");
        setAdminNotice("Levels imported successfully.");
      }
    } catch (_) {
      setAdminNotice("Import failed. Check JSON format.");
    } finally {
      input.value = "";
    }
  }, []);

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", color:C.text, position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
        @keyframes fadeUp   { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes popIn    { 0%{transform:scale(.85);opacity:0} 60%{transform:scale(1.04)} 100%{transform:scale(1);opacity:1} }
        @keyframes shake    { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-10px)} 40%{transform:translateX(10px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
        @keyframes confFall { to{transform:translateY(110vh) rotate(720deg);opacity:0} }
        @keyframes shimmer  { 0%{background-position:200%} 100%{background-position:-200%} }
        .opt { transition:transform .12s,box-shadow .12s; cursor:pointer; border:none; text-align:left; font-family:inherit; }
        .opt:hover:not(:disabled) { transform:translateX(6px); box-shadow:0 4px 16px rgba(0,0,0,.1); }
        .opt:disabled { cursor:default; }
        .card-hover { transition:transform .2s,box-shadow .2s; }
        .card-hover:hover { transform:translateY(-3px); box-shadow:0 12px 36px rgba(0,0,0,.12); }
      `}</style>
      <BrandBadge />
      <Confetti active={confetti} />

      {/* ─── INTRO ─────────────────────────────────────────────────────────── */}
      {screen === "intro" && (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,animation:"fadeUp .5s ease" }}>
          <div style={{ background:C.card,borderRadius:28,boxShadow:"0 12px 50px rgba(0,0,0,.10)",padding:"52px 44px",maxWidth:580,width:"100%",textAlign:"center",border:`1px solid ${C.border}` }}>
            {/* Zone badges */}
            <div style={{ display:"flex",justifyContent:"center",gap:8,flexWrap:"wrap",marginBottom:32 }}>
              {levels.map(l => (
                <div key={l.id} className="card-hover" style={{ width:48,height:48,borderRadius:14,background:l.light,border:`2px solid ${l.color}40`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,color:l.color,cursor:"default",boxShadow:`0 3px 10px ${l.color}22` }}>
                  {l.icon}
                </div>
              ))}
            </div>
            <h1 style={{ fontSize:52,fontWeight:900,margin:"0 0 6px",background:"linear-gradient(135deg,#e63950 0%,#7b3fe4 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1.5 }}>
              Angular Quest
            </h1>
            <p style={{ color:C.muted,margin:"0 0 36px",fontSize:16,lineHeight:1.6 }}>
              Learn Angular through 6 knowledge zones.<br/>Components · Directives · Services · Pipes · Routing · Forms
            </p>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:36 }}>
              {[["🗺️", `${zoneCount} Zones`, "All core topics"], ["❓", `${totalQuestionCount} Questions`, "From the content database"], ["♥", `${TOTAL_LIVES} Lives`, "Choose wisely"]].map(([em,t,s])=>(
                <div key={t} style={{ background:C.bg,borderRadius:14,padding:"14px 10px",border:`1px solid ${C.border}` }}>
                  <div style={{ fontSize:22,marginBottom:4 }}>{em}</div>
                  <div style={{ fontWeight:700,fontSize:14 }}>{t}</div>
                  <div style={{ color:C.faint,fontSize:12 }}>{s}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
              <button disabled={zoneCount===0} onClick={() => setScreen("namePicker")} style={{ background:zoneCount===0?C.border:"linear-gradient(135deg,#e63950,#7b3fe4)",color:zoneCount===0?C.faint:"#fff",border:"none",padding:"15px 40px",borderRadius:14,fontSize:16,fontWeight:700,cursor:zoneCount===0?"default":"pointer",fontFamily:"inherit",boxShadow:zoneCount===0?"none":"0 6px 24px rgba(123,63,228,.35)",transition:"transform .15s,box-shadow .15s" }}
                onMouseEnter={e=>{e.target.style.transform="translateY(-2px)";e.target.style.boxShadow="0 10px 30px rgba(123,63,228,.45)"}}
                onMouseLeave={e=>{e.target.style.transform="translateY(0)";e.target.style.boxShadow="0 6px 24px rgba(123,63,228,.35)"}}>
                Play Now →
              </button>
              <button onClick={() => goLeaderboard("intro")} style={{ background:C.bg,color:C.text,border:`1.5px solid ${C.border}`,padding:"15px 24px",borderRadius:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>
                🏆 Leaderboard
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <button onClick={handleExportLevels} style={{ background: C.bg, color: C.text, border: `1.5px solid ${C.border}`, padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Export Levels JSON
              </button>
              <button onClick={() => importFileRef.current?.click()} style={{ background: C.bg, color: C.text, border: `1.5px solid ${C.border}`, padding: "10px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Import Levels JSON
              </button>
              <input ref={importFileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={handleImportLevels} />
            </div>
            {adminNotice && <div style={{ marginTop: 8, fontSize: 12, color: C.faint }}>{adminNotice}</div>}
            {zoneCount===0 && <div style={{ marginTop: 8, fontSize: 12, color: C.faint }}>Loading content from database…</div>}
          </div>
        </div>
      )}

      {/* ─── NAME PICKER ───────────────────────────────────────────────────── */}
      {screen === "namePicker" && (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,animation:"fadeUp .4s ease" }}>
          <div style={{ background:C.card,borderRadius:24,boxShadow:"0 8px 36px rgba(0,0,0,.10)",padding:"44px 38px",maxWidth:420,width:"100%",border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:52,textAlign:"center",marginBottom:14 }}>👤</div>
            <h2 style={{ textAlign:"center",fontSize:28,fontWeight:800,margin:"0 0 6px" }}>Who's Playing?</h2>
            <p style={{ textAlign:"center",color:C.muted,margin:"0 0 30px",fontSize:14 }}>Enter your name to save your score to the leaderboard</p>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key==="Enter" && nameInput.trim() && startGame(nameInput.trim())}
              placeholder="Your name…"
              maxLength={20}
              style={{ width:"100%",padding:"13px 16px",border:`2px solid ${C.border}`,borderRadius:12,fontSize:16,fontFamily:"inherit",outline:"none",marginBottom:14,background:C.bg,color:C.text,transition:"border-color .15s" }}
              onFocus={e=>e.target.style.borderColor="#7b3fe4"}
              onBlur={e=>e.target.style.borderColor=C.border}
            />
            <button disabled={!nameInput.trim()} onClick={() => nameInput.trim() && startGame(nameInput.trim())} style={{ width:"100%",background:nameInput.trim()?"linear-gradient(135deg,#e63950,#7b3fe4)":C.border,color:nameInput.trim()?"#fff":C.faint,border:"none",padding:"14px",borderRadius:12,fontSize:15,fontWeight:700,cursor:nameInput.trim()?"pointer":"default",fontFamily:"inherit",transition:"all .2s",boxShadow:nameInput.trim()?"0 4px 18px rgba(123,63,228,.3)":"none" }}>
              Start Quest →
            </button>
            <button onClick={()=>setScreen("intro")} style={{ display:"block",width:"100%",marginTop:10,background:"none",border:"none",color:C.faint,cursor:"pointer",fontFamily:"inherit",fontSize:13,padding:"6px 0" }}>← Back</button>
          </div>
        </div>
      )}

      {/* ─── GAME ──────────────────────────────────────────────────────────── */}
      {screen === "game" && level && question && (
        <div style={{ minHeight:"100vh",display:"flex",flexDirection:"column",animation:shake?"shake .4s ease":"none" }}>

          {/* HUD */}
          <div style={{ background:C.card,borderBottom:`1px solid ${C.border}`,padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10,boxShadow:"0 2px 12px rgba(0,0,0,.06)" }}>
            <div style={{ display:"flex",alignItems:"center",gap:10 }}>
              <div style={{ width:38,height:38,borderRadius:11,background:level.light,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,color:level.color,border:`1.5px solid ${level.color}33` }}>{level.icon}</div>
              <div>
                <div style={{ fontWeight:700,fontSize:13,color:level.color,lineHeight:1.2 }}>{level.name}</div>
                <div style={{ fontSize:11,color:C.faint }}>{level.subtitle}</div>
              </div>
            </div>
            <div style={{ display:"flex",gap:18,alignItems:"center" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:10,color:C.faint,fontWeight:600,letterSpacing:.5 }}>PLAYER</div>
                <div style={{ fontWeight:700,fontSize:13 }}>{playerName}</div>
              </div>
              <div style={{ width:1,height:28,background:C.border }} />
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:10,color:C.faint,fontWeight:600,letterSpacing:.5 }}>SCORE</div>
                <div style={{ fontWeight:800,fontSize:18,color:"#e07b00" }}>{score}</div>
              </div>
              <div style={{ width:1,height:28,background:C.border }} />
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:10,color:C.faint,fontWeight:600,letterSpacing:.5 }}>LIVES</div>
                <div style={{ fontSize:18,letterSpacing:2 }}>
                  {Array.from({length:TOTAL_LIVES},(_,i)=>(
                    <span key={i} style={{ color:i<lives?"#e63950":"#d1d5db",transition:"color .3s" }}>♥</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height:5,background:C.border }}>
            <div style={{ height:"100%",width:`${progress}%`,background:`linear-gradient(90deg,${level.color},${level.color}88)`,transition:"width .4s ease",borderRadius:"0 3px 3px 0",boxShadow:`0 0 8px ${level.color}44` }} />
          </div>

          {/* Content */}
          <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 20px",maxWidth:700,margin:"0 auto",width:"100%" }}>

            {/* Step dots */}
            <div style={{ display:"flex",gap:7,marginBottom:26 }}>
              {level.questions.map((_,i) => (
                <div key={i} style={{ width:38,height:6,borderRadius:3,background:i<qIdx?level.color:i===qIdx?`${level.color}55`:C.border,transition:"background .3s",boxShadow:i===qIdx?`0 0 6px ${level.color}66`:"none" }} />
              ))}
            </div>

            {/* Zone tip */}
            <div style={{ background:level.light,border:`1px solid ${level.color}30`,borderLeft:`3px solid ${level.color}`,borderRadius:10,padding:"10px 16px",marginBottom:22,fontSize:13,color:C.muted,width:"100%",lineHeight:1.65 }}>
              <b style={{ color:level.color }}>Zone: </b>{level.description}
            </div>

            {/* Question card */}
            <div style={{ background:C.card,borderRadius:20,boxShadow:"0 4px 24px rgba(0,0,0,.07)",padding:"30px",border:`1px solid ${C.border}`,width:"100%",animation:"fadeUp .25s ease" }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:14 }}>
                <div style={{ background:level.light,color:level.color,borderRadius:8,padding:"3px 10px",fontSize:12,fontWeight:700,border:`1px solid ${level.color}30` }}>Q{qIdx+1} / {level.questions.length}</div>
                <div style={{ height:4,flex:1,background:C.border,borderRadius:2 }}>
                  <div style={{ height:"100%",width:`${((qIdx)/level.questions.length)*100}%`,background:level.color,borderRadius:2,transition:"width .4s" }} />
                </div>
              </div>
              <div style={{ fontSize:"clamp(15px,2.2vw,19px)",fontWeight:700,marginBottom:24,lineHeight:1.55,color:C.text }}>
                {question.q}
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
                {question.options.map((opt,i) => {
                  const labels = ["A","B","C","D"];
                  let bg=C.bg, border=`1.5px solid ${C.border}`, clr=C.text, shadow="none", badgeBg=C.border, badgeClr=C.muted;
                  if (showFB) {
                    if (i===question.answer) { bg="#ecfdf5"; border="1.5px solid #10b981"; clr="#065f46"; shadow="0 0 0 3px #10b98120"; badgeBg="#10b981"; badgeClr="#fff"; }
                    else if (i===picked && !isCorrect) { bg="#fef2f2"; border="1.5px solid #ef4444"; clr="#7f1d1d"; shadow="0 0 0 3px #ef444420"; badgeBg="#ef4444"; badgeClr="#fff"; }
                  } else if (picked===i) { bg=level.light; border=`1.5px solid ${level.color}`; clr=level.color; badgeBg=level.color; badgeClr="#fff"; }
                  return (
                    <button key={i} className="opt" disabled={showFB} onClick={()=>handleAnswer(i)} style={{ background:bg,border,borderRadius:12,padding:"13px 14px",color:clr,fontFamily:"inherit",fontSize:14,lineHeight:1.5,boxShadow:shadow,display:"flex",gap:10,alignItems:"flex-start" }}>
                      <span style={{ minWidth:24,height:24,background:badgeBg,color:badgeClr,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0,transition:"all .2s" }}>{labels[i]}</span>
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>

              {showFB && (
                <div style={{ marginTop:18,padding:"14px 18px",borderRadius:12,background:isCorrect?"#ecfdf5":"#fef2f2",border:`1.5px solid ${isCorrect?"#10b981":"#ef4444"}`,animation:"popIn .3s ease" }}>
                  <div style={{ fontWeight:700,color:isCorrect?"#065f46":"#7f1d1d",marginBottom:4,fontSize:14 }}>
                    {isCorrect ? "✓ Correct! +100 pts 🎉" : "✗ Incorrect — life lost"}
                  </div>
                  <div style={{ fontSize:13,color:isCorrect?"#047857":"#b91c1c",lineHeight:1.65 }}>{question.explanation}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── LEVEL DONE ────────────────────────────────────────────────────── */}
      {screen === "levelDone" && level && (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,animation:"fadeUp .4s ease" }}>
          <div style={{ background:C.card,borderRadius:28,boxShadow:"0 12px 48px rgba(0,0,0,.11)",padding:"52px 44px",maxWidth:480,width:"100%",textAlign:"center",border:`1px solid ${C.border}` }}>
            <div style={{ width:80,height:80,borderRadius:22,background:level.light,border:`2px solid ${level.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:38,color:level.color,margin:"0 auto 18px",boxShadow:`0 6px 24px ${level.color}22` }}>{level.icon}</div>
            <div style={{ fontSize:12,color:level.color,fontWeight:700,letterSpacing:2,marginBottom:6 }}>ZONE CLEARED ✓</div>
            <h2 style={{ fontSize:32,fontWeight:800,margin:"0 0 4px" }}>{level.name}</h2>
            <p style={{ color:C.muted,margin:"0 0 32px",fontSize:15 }}>{level.subtitle}</p>
            <div style={{ display:"flex",justifyContent:"center",gap:32,marginBottom:36 }}>
              {[["Zone",lvlScore,"#e07b00"],["Total",score,level.color],["Lives","♥".repeat(lives)+"♡".repeat(TOTAL_LIVES-lives),"#e63950"]].map(([l,v,c])=>(
                <div key={l}>
                  <div style={{ fontSize:32,fontWeight:800,color:c }}>{v}</div>
                  <div style={{ fontSize:11,color:C.faint,letterSpacing:.5 }}>{l.toUpperCase()}</div>
                </div>
              ))}
            </div>
            {levelIdx+1 < levels.length && (
              <div style={{ background:levels[levelIdx+1].light,border:`1px solid ${levels[levelIdx+1].color}33`,borderRadius:14,padding:"12px 18px",marginBottom:22,display:"flex",alignItems:"center",gap:12,justifyContent:"center" }}>
                <span style={{ color:levels[levelIdx+1].color,fontSize:22 }}>{levels[levelIdx+1].icon}</span>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize:11,color:C.faint }}>Next Zone</div>
                  <div style={{ fontWeight:700,color:levels[levelIdx+1].color,fontSize:14 }}>{levels[levelIdx+1].name}</div>
                </div>
              </div>
            )}
            <button onClick={nextLevel} style={{ background:`linear-gradient(135deg,${level.color},${level.color}bb)`,color:"#fff",border:"none",padding:"14px 44px",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 6px 20px ${level.color}44` }}>
              {levelIdx+1>=levels.length ? "See Final Results 🎉" : "Next Zone →"}
            </button>
          </div>
        </div>
      )}

      {/* ─── GAME OVER ─────────────────────────────────────────────────────── */}
      {screen === "gameOver" && (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,animation:"fadeUp .4s ease" }}>
          <div style={{ background:C.card,borderRadius:28,boxShadow:"0 12px 48px rgba(0,0,0,.10)",padding:"52px 44px",maxWidth:440,width:"100%",textAlign:"center",border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:64,marginBottom:12 }}>💔</div>
            <h2 style={{ fontSize:32,fontWeight:800,margin:"0 0 6px" }}>Game Over</h2>
            <p style={{ color:C.muted,margin:"0 0 6px",fontSize:15 }}>You ran out of lives in <b style={{ color:level?.color }}>{level?.name}</b></p>
            <p style={{ color:C.faint,fontSize:13,margin:"0 0 32px" }}>Score saved to leaderboard!</p>
            <div style={{ marginBottom:32 }}>
              <div style={{ fontSize:52,fontWeight:900,color:"#e07b00" }}>{score}</div>
              <div style={{ fontSize:12,color:C.faint,letterSpacing:1 }}>FINAL SCORE</div>
            </div>
            <div style={{ display:"flex",gap:10,justifyContent:"center" }}>
              <button onClick={()=>goLeaderboard("gameOver")} style={{ background:C.bg,border:`1.5px solid ${C.border}`,color:C.text,padding:"12px 20px",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>🏆 Leaderboard</button>
              <button onClick={()=>setScreen("namePicker")} style={{ background:"linear-gradient(135deg,#e63950,#7b3fe4)",color:"#fff",border:"none",padding:"12px 26px",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(123,63,228,.3)" }}>Try Again →</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VICTORY ───────────────────────────────────────────────────────── */}
      {screen === "victory" && (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,animation:"fadeUp .5s ease" }}>
          <div style={{ background:C.card,borderRadius:28,boxShadow:"0 16px 60px rgba(0,0,0,.12)",padding:"56px 48px",maxWidth:540,width:"100%",textAlign:"center",border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:72,marginBottom:10 }}>🏆</div>
            <h1 style={{ fontSize:44,fontWeight:900,margin:"0 0 4px",background:"linear-gradient(135deg,#e63950,#7b3fe4)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1.5 }}>
              Angular Mastered!
            </h1>
            <p style={{ color:C.muted,margin:"0 0 32px",fontSize:16 }}>Well done, <b>{playerName}</b>! All 6 zones conquered.</p>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:32 }}>
              {levels.map(l=>(
                <div key={l.id} style={{ background:l.light,border:`1px solid ${l.color}40`,borderRadius:12,padding:"10px 6px",textAlign:"center" }}>
                  <div style={{ fontSize:20,color:l.color }}>{l.icon}</div>
                  <div style={{ fontSize:10,color:l.color,fontWeight:700,marginTop:3 }}>✓ {l.name}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex",justifyContent:"center",gap:36,marginBottom:36 }}>
              <div><div style={{ fontSize:48,fontWeight:900,color:"#e07b00" }}>{score}</div><div style={{ fontSize:11,color:C.faint }}>FINAL SCORE</div></div>
              <div><div style={{ fontSize:48,fontWeight:900,color:"#e63950" }}>{"♥".repeat(lives)}</div><div style={{ fontSize:11,color:C.faint }}>LIVES LEFT</div></div>
            </div>
            <div style={{ display:"flex",gap:10,justifyContent:"center" }}>
              <button onClick={()=>goLeaderboard("victory")} style={{ background:C.bg,border:`1.5px solid ${C.border}`,color:C.text,padding:"13px 22px",borderRadius:14,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>🏆 Leaderboard</button>
              <button onClick={()=>setScreen("namePicker")} style={{ background:"linear-gradient(135deg,#e63950,#7b3fe4)",color:"#fff",border:"none",padding:"13px 30px",borderRadius:14,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 6px 20px rgba(123,63,228,.35)" }}>Play Again →</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── LEADERBOARD ───────────────────────────────────────────────────── */}
      {screen === "leaderboard" && (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100vh",padding:24,animation:"fadeUp .4s ease" }}>
          <div style={{ background:C.card,borderRadius:28,boxShadow:"0 12px 48px rgba(0,0,0,.10)",padding:"44px 36px",maxWidth:520,width:"100%",border:`1px solid ${C.border}` }}>
            <div style={{ textAlign:"center",marginBottom:30 }}>
              <div style={{ fontSize:48,marginBottom:8 }}>🏆</div>
              <h2 style={{ fontSize:30,fontWeight:800,margin:"0 0 4px" }}>Leaderboard</h2>
              <p style={{ color:C.muted,margin:0,fontSize:14 }}>Top Angular Quest players</p>
            </div>

            {leaderboard.length === 0 ? (
              <div style={{ textAlign:"center",padding:"44px 0",color:C.faint }}>
                <div style={{ fontSize:48,marginBottom:10 }}>📭</div>
                <div style={{ fontSize:15 }}>No scores yet — be the first!</div>
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:9 }}>
                {/* Header */}
                <div style={{ display:"flex",gap:12,padding:"0 16px",fontSize:11,color:C.faint,fontWeight:600,letterSpacing:.5 }}>
                  <div style={{ minWidth:28 }}>#</div>
                  <div style={{ flex:1 }}>PLAYER</div>
                  <div>DATE</div>
                  <div style={{ minWidth:56,textAlign:"right" }}>SCORE</div>
                </div>
                {leaderboard.slice(0,10).map((entry,i)=>{
                  const rowBg = i===0?"linear-gradient(135deg,#fffbeb,#fef9e0)":i===1?"linear-gradient(135deg,#f8fafc,#f1f5f9)":i===2?"linear-gradient(135deg,#fdf6ec,#fbeee0)":C.bg;
                  const rowBorder = i===0?`1.5px solid #f5c800`:i===1?`1.5px solid #c0c4cc`:i===2?`1.5px solid #cd7f32`:C.border;
                  return (
                    <div key={i} style={{ display:"flex",alignItems:"center",gap:12,background:rowBg,border:rowBorder,borderRadius:14,padding:"13px 16px",animation:`fadeUp ${.1+i*.06}s ease both`,boxShadow:i<3?"0 3px 12px rgba(0,0,0,.06)":"none" }}>
                      <div style={{ fontSize:22,minWidth:28 }}>{MEDALS[i]||<span style={{ fontSize:14,color:C.faint,fontWeight:700 }}>{i+1}</span>}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700,fontSize:15 }}>{entry.name}</div>
                      </div>
                      <div style={{ fontSize:12,color:C.faint }}>{entry.date}</div>
                      <div style={{ fontWeight:800,fontSize:20,color:i===0?"#b45309":i===1?"#6b7280":i===2?"#92400e":C.muted,minWidth:56,textAlign:"right" }}>{entry.score}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display:"flex",gap:10,marginTop:26,justifyContent:"center" }}>
              <button onClick={()=>setScreen(prevScreen)} style={{ background:C.bg,border:`1.5px solid ${C.border}`,color:C.text,padding:"12px 20px",borderRadius:12,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit" }}>← Back</button>
              <button onClick={()=>setScreen("namePicker")} style={{ background:"linear-gradient(135deg,#e63950,#7b3fe4)",color:"#fff",border:"none",padding:"12px 28px",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(123,63,228,.3)" }}>Play Now →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
