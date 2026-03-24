import { useState, useCallback, useRef, useEffect } from "react";
import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import RaceThreeScene from "./RaceThreeScene";

const GAME_CONTENT_SEED_URL = "/seed-levels.json";
const TOTAL_LIVES = 3;
const QUESTION_TIME_LIMIT = 12;
const RACE_DISTANCE = 1200;
const RACE_QUESTION_TIME_LIMIT = 9;
const RACE_BASE_PLAYER_SPEED = 46;
const RACE_BASE_CPU_SPEED = 44;
const RACE_MIN_SPEED = 28;
const RACE_MAX_SPEED = 74;
const BONUS_LIFE_STREAK = 5;
const PENALTY_PER_WRONG = 30;
const MEDALS = ["🥇", "🥈", "🥉"];
const SQLITE_IDB_NAME = "angular_quest_db";
const SQLITE_IDB_STORE = "sqlite";
const SQLITE_IDB_KEY = "main";
const LEADERBOARD_CACHE_KEY = "aq_lb_v2";
const USER_PROGRESS_KEY = "aq_user_progress_v1";
const SHARED_LEADERBOARD_API = "/api/leaderboard";
const ADMIN_PIN = import.meta.env.VITE_ADMIN_PIN || "123456";
const UX_SETTINGS_KEY = "aq_ux_settings_v1";
const PLAYER_STATS_KEY = "aq_player_stats_v1";
const PLAYER_NAME_KEY = "aq_player_name_v1";
const PUZZLE_PROFILE_KEY = "aq_puzzle_profile_v1";
const DAILY_CHALLENGE_CLAIM_KEY = "aq_daily_claim_v1";

const PUZZLES = [
  {
    id: 1,
    title: "The Component Hand",
    subtitle: "Build a basic Angular component",
    icon: "🃏",
    difficulty: "Easy",
    chips: 140,
    hint: "Decorator first, then class with selector & template",
    lines: [
      { id: "a", code: "@Component({", color: "#8a6400" },
      { id: "b", code: "  selector: 'app-root',", color: "#0d5f80" },
      { id: "c", code: "  template: `<h1>Hello</h1>`", color: "#1f7a5c" },
      { id: "d", code: "})", color: "#8a6400" },
      { id: "e", code: "export class AppComponent {}", color: "#6f3db4" },
    ],
  },
  {
    id: 2,
    title: "The Service Flush",
    subtitle: "Injectable service declaration",
    icon: "♠",
    difficulty: "Easy",
    chips: 210,
    hint: "Import Injectable, decorate, then export the class",
    lines: [
      { id: "a", code: "import { Injectable } from '@angular/core';", color: "#0d5f80" },
      { id: "b", code: "@Injectable({", color: "#8a6400" },
      { id: "c", code: "  providedIn: 'root'", color: "#1f7a5c" },
      { id: "d", code: "})", color: "#8a6400" },
      { id: "e", code: "export class DataService {}", color: "#6f3db4" },
    ],
  },
  {
    id: 3,
    title: "The NgModule Royal",
    subtitle: "Declare and bootstrap a module",
    icon: "♦",
    difficulty: "Medium",
    chips: 350,
    hint: "Import NgModule, decorate with declarations & bootstrap",
    lines: [
      { id: "a", code: "import { NgModule } from '@angular/core';", color: "#0d5f80" },
      { id: "b", code: "import { BrowserModule } from '@angular/platform-browser';", color: "#0d5f80" },
      { id: "c", code: "@NgModule({", color: "#8a6400" },
      { id: "d", code: "  imports: [BrowserModule],", color: "#a35000" },
      { id: "e", code: "  declarations: [AppComponent],", color: "#1f7a5c" },
      { id: "f", code: "  bootstrap: [AppComponent]", color: "#b02f4b" },
      { id: "g", code: "})", color: "#8a6400" },
      { id: "h", code: "export class AppModule {}", color: "#6f3db4" },
    ],
  },
  {
    id: 4,
    title: "The Router Straight",
    subtitle: "Set up Angular routing",
    icon: "♥",
    difficulty: "Medium",
    chips: 420,
    hint: "Define routes array, then pass to RouterModule.forRoot",
    lines: [
      { id: "a", code: "import { RouterModule, Routes } from '@angular/router';", color: "#0d5f80" },
      { id: "b", code: "const routes: Routes = [", color: "#8a6400" },
      { id: "c", code: "  { path: '', component: HomeComponent },", color: "#1f7a5c" },
      { id: "d", code: "  { path: 'about', component: AboutComponent }", color: "#1f7a5c" },
      { id: "e", code: "];", color: "#8a6400" },
      { id: "f", code: "RouterModule.forRoot(routes)", color: "#6f3db4" },
    ],
  },
  {
    id: 5,
    title: "The Observable Jackpot",
    subtitle: "RxJS Observable chain",
    icon: "★",
    difficulty: "Hard",
    chips: 700,
    hint: "Import operators, create observable, then pipe and subscribe",
    lines: [
      { id: "a", code: "import { of } from 'rxjs';", color: "#0d5f80" },
      { id: "b", code: "import { map, filter } from 'rxjs/operators';", color: "#0d5f80" },
      { id: "c", code: "const source$ = of(1, 2, 3, 4, 5);", color: "#8a6400" },
      { id: "d", code: "source$.pipe(", color: "#a35000" },
      { id: "e", code: "  filter(n => n % 2 === 0),", color: "#b02f4b" },
      { id: "f", code: "  map(n => n * 10)", color: "#1f7a5c" },
      { id: "g", code: ").subscribe(console.log);", color: "#6f3db4" },
    ],
  },
  {
    id: 6,
    title: "The Reactive Form Bluff",
    subtitle: "Build a reactive form",
    icon: "🎰",
    difficulty: "Hard",
    chips: 840,
    hint: "Import FormBuilder, inject in constructor, then build the group",
    lines: [
      { id: "a", code: "import { FormBuilder, Validators } from '@angular/forms';", color: "#0d5f80" },
      { id: "b", code: "constructor(private fb: FormBuilder) {}", color: "#8a6400" },
      { id: "c", code: "this.form = this.fb.group({", color: "#a35000" },
      { id: "d", code: "  name: ['', Validators.required],", color: "#1f7a5c" },
      { id: "e", code: "  email: ['', Validators.email]", color: "#1f7a5c" },
      { id: "f", code: "});", color: "#8a6400" },
    ],
  },
  {
    id: 7,
    title: "The Pipe Trick",
    subtitle: "Create a custom transform pipe",
    icon: "🪄",
    difficulty: "Medium",
    chips: 455,
    hint: "Decorate with Pipe and return transformed value in transform()",
    lines: [
      { id: "a", code: "import { Pipe, PipeTransform } from '@angular/core';", color: "#0d5f80" },
      { id: "b", code: "@Pipe({ name: 'shortName' })", color: "#8a6400" },
      { id: "c", code: "export class ShortNamePipe implements PipeTransform {", color: "#6f3db4" },
      { id: "d", code: "  transform(value: string): string {", color: "#a35000" },
      { id: "e", code: "    return value.slice(0, 3).toUpperCase();", color: "#1f7a5c" },
      { id: "f", code: "  }", color: "#8a6400" },
      { id: "g", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 8,
    title: "The Guard Gate",
    subtitle: "Protect a route with CanActivate",
    icon: "🛡️",
    difficulty: "Hard",
    chips: 630,
    hint: "Inject router/auth and return true or UrlTree",
    lines: [
      { id: "a", code: "import { Injectable } from '@angular/core';", color: "#0d5f80" },
      { id: "b", code: "import { CanActivate, Router } from '@angular/router';", color: "#0d5f80" },
      { id: "c", code: "@Injectable({ providedIn: 'root' })", color: "#8a6400" },
      { id: "d", code: "export class AuthGuard implements CanActivate {", color: "#6f3db4" },
      { id: "e", code: "  canActivate() {", color: "#a35000" },
      { id: "f", code: "    return this.auth.isLoggedIn() ? true : this.router.createUrlTree(['/login']);", color: "#1f7a5c" },
      { id: "g", code: "  }", color: "#8a6400" },
      { id: "h", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 9,
    title: "The Lazy Load Bet",
    subtitle: "Lazy-load a feature module",
    icon: "🚪",
    difficulty: "Hard",
    chips: 686,
    hint: "Use loadChildren with dynamic import",
    lines: [
      { id: "a", code: "const routes: Routes = [", color: "#8a6400" },
      { id: "b", code: "  {", color: "#8a6400" },
      { id: "c", code: "    path: 'admin',", color: "#1f7a5c" },
      { id: "d", code: "    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule)", color: "#6f3db4" },
      { id: "e", code: "  }", color: "#8a6400" },
      { id: "f", code: "];", color: "#8a6400" },
    ],
  },
  {
    id: 10,
    title: "The HTTP Double",
    subtitle: "Call API and map response",
    icon: "🌐",
    difficulty: "Medium",
    chips: 504,
    hint: "Inject HttpClient, return observable, then map",
    lines: [
      { id: "a", code: "import { HttpClient } from '@angular/common/http';", color: "#0d5f80" },
      { id: "b", code: "import { map } from 'rxjs/operators';", color: "#0d5f80" },
      { id: "c", code: "constructor(private http: HttpClient) {}", color: "#8a6400" },
      { id: "d", code: "getUsers() {", color: "#a35000" },
      { id: "e", code: "  return this.http.get('/api/users').pipe(map((r: any) => r.items));", color: "#1f7a5c" },
      { id: "f", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 11,
    title: "The Signal Raise",
    subtitle: "Use Angular signals for state",
    icon: "📡",
    difficulty: "Hard",
    chips: 756,
    hint: "Create signal and computed derived value",
    lines: [
      { id: "a", code: "import { signal, computed } from '@angular/core';", color: "#0d5f80" },
      { id: "b", code: "count = signal(0);", color: "#8a6400" },
      { id: "c", code: "doubleCount = computed(() => this.count() * 2);", color: "#1f7a5c" },
      { id: "d", code: "increment() {", color: "#a35000" },
      { id: "e", code: "  this.count.update(v => v + 1);", color: "#6f3db4" },
      { id: "f", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 12,
    title: "The Resolver Reveal",
    subtitle: "Preload route data with resolver",
    icon: "🧠",
    difficulty: "Hard",
    chips: 714,
    hint: "Implement Resolve and use route.data",
    lines: [
      { id: "a", code: "import { Resolve } from '@angular/router';", color: "#0d5f80" },
      { id: "b", code: "@Injectable({ providedIn: 'root' })", color: "#8a6400" },
      { id: "c", code: "export class UserResolver implements Resolve<User> {", color: "#6f3db4" },
      { id: "d", code: "  resolve(route: ActivatedRouteSnapshot) {", color: "#a35000" },
      { id: "e", code: "    return this.api.getUser(route.params['id']);", color: "#1f7a5c" },
      { id: "f", code: "  }", color: "#8a6400" },
      { id: "g", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 13,
    title: "The State Store",
    subtitle: "Reducer-style immutable update",
    icon: "🗂️",
    difficulty: "Medium",
    chips: 532,
    hint: "Spread existing state and patch target field",
    lines: [
      { id: "a", code: "interface AppState { user: string; loading: boolean; }", color: "#0d5f80" },
      { id: "b", code: "const initialState: AppState = { user: '', loading: false };", color: "#8a6400" },
      { id: "c", code: "function reducer(state: AppState, action: any): AppState {", color: "#6f3db4" },
      { id: "d", code: "  if (action.type === 'SET_USER') return { ...state, user: action.payload };", color: "#1f7a5c" },
      { id: "e", code: "  return state;", color: "#a35000" },
      { id: "f", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 14,
    title: "The Standalone Ace",
    subtitle: "Build a standalone component",
    icon: "🧩",
    difficulty: "Medium",
    chips: 574,
    hint: "Set standalone true and include imports",
    lines: [
      { id: "a", code: "import { Component } from '@angular/core';", color: "#0d5f80" },
      { id: "b", code: "import { CommonModule } from '@angular/common';", color: "#0d5f80" },
      { id: "c", code: "@Component({", color: "#8a6400" },
      { id: "d", code: "  standalone: true,", color: "#1f7a5c" },
      { id: "e", code: "  imports: [CommonModule],", color: "#1f7a5c" },
      { id: "f", code: "  template: '<p>Ready</p>'", color: "#a35000" },
      { id: "g", code: "})", color: "#8a6400" },
      { id: "h", code: "export class ReadyComponent {}", color: "#6f3db4" },
    ],
  },
  {
    id: 15,
    title: "The Interceptor Stack",
    subtitle: "Attach auth headers globally",
    icon: "🔐",
    difficulty: "Hard",
    chips: 812,
    hint: "Clone request and pass to next.handle",
    lines: [
      { id: "a", code: "import { HttpInterceptor } from '@angular/common/http';", color: "#0d5f80" },
      { id: "b", code: "export class AuthInterceptor implements HttpInterceptor {", color: "#6f3db4" },
      { id: "c", code: "  intercept(req, next) {", color: "#a35000" },
      { id: "d", code: "    const authReq = req.clone({ setHeaders: { Authorization: 'Bearer token' } });", color: "#1f7a5c" },
      { id: "e", code: "    return next.handle(authReq);", color: "#8a6400" },
      { id: "f", code: "  }", color: "#8a6400" },
      { id: "g", code: "}", color: "#8a6400" },
    ],
  },
  {
    id: 16,
    title: "The Effect Combo",
    subtitle: "Merge streams with switchMap",
    icon: "⚡",
    difficulty: "Hard",
    chips: 868,
    hint: "Filter action type then switchMap to API call",
    lines: [
      { id: "a", code: "this.actions$.pipe(", color: "#8a6400" },
      { id: "b", code: "  ofType(loadUsers),", color: "#1f7a5c" },
      { id: "c", code: "  switchMap(() => this.api.getUsers().pipe(", color: "#a35000" },
      { id: "d", code: "    map(users => loadUsersSuccess({ users }))", color: "#6f3db4" },
      { id: "e", code: "  ))", color: "#1f7a5c" },
      { id: "f", code: ");", color: "#8a6400" },
    ],
  },
];

const PUZZLE_DIFFICULTY_COLORS = { Easy: "#1f7a5c", Medium: "#8a6400", Hard: "#b02f4b" };
const PUZZLE_STAKE_CONFIG = {
  normal: { label: "Normal", rewardMultiplier: 1, penaltyMultiplier: 1, timerMultiplier: 1 },
  high: { label: "High", rewardMultiplier: 1.5, penaltyMultiplier: 1.25, timerMultiplier: 0.85 },
  allin: { label: "All-In", rewardMultiplier: 2.1, penaltyMultiplier: 1.6, timerMultiplier: 0.72 },
};
const PUZZLE_RULES = [
  { id: "cleanTable", title: "Clean Table", description: "Hints disabled.", bonus: 120 },
  { id: "shuffleBan", title: "No Shuffle", description: "Shuffle disabled.", bonus: 90 },
  { id: "limitedMoves", title: "Limited Moves", description: "You have a strict move cap.", bonus: 150 },
  { id: "lockedLine", title: "Anchored Line", description: "One line is locked in place.", bonus: 130 },
];

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
    let message = `Unable to fetch leaderboard (${response.status})`;
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
    let message = `Unable to update leaderboard (${response.status})`;
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

function buildRaceQuestions(levels) {
  const pool = levels.flatMap(level =>
    level.questions.map(question => ({
      ...question,
      zoneName: level.name,
      zoneIcon: level.icon,
    }))
  );
  return shuffleArray(pool);
}

function shufflePuzzleLines(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isPuzzleOrderCorrect(current, original) {
  return current.every((item, i) => item.id === original[i].id);
}

function pickPuzzleRule() {
  return PUZZLE_RULES[Math.floor(Math.random() * PUZZLE_RULES.length)];
}

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekStartKey() {
  const now = new Date();
  const d = new Date(now);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function safeLocalGet(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function safeLocalSet(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (_) {}
}

function playTone(frequency = 440, duration = 0.08, type = "sine", gainValue = 0.03) {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch (_) {}
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
      <span style={{ color: "#8a6400", fontSize: 16 }}>♦</span>
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
          animationName: "confFall",
          animationDuration: `${1 + Math.random() * 1.6}s`,
          animationTimingFunction: "ease-in",
          animationFillMode: "forwards",
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
          animationName: i < lives ? "heartPulse" : "none",
          animationDuration: "1.5s",
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
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
      <div style={{ fontSize: 42, fontWeight: 900, color: "#8a6400", textShadow: "0 1px 0 rgba(255,255,255,0.45)", fontFamily: "'Playfair Display', serif" }}>
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
  const [screen, setScreen] = useState(() => safeLocalGet(PLAYER_NAME_KEY, "") ? "intro" : "namePicker");
  const [prevScreen, setPrevScreen] = useState("intro");
  const [playerName, setPlayerName] = useState(() => safeLocalGet(PLAYER_NAME_KEY, ""));
  const [nameInput, setNameInput] = useState(() => safeLocalGet(PLAYER_NAME_KEY, ""));
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
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [fontScale, setFontScale] = useState(100);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [unlockedThemes, setUnlockedThemes] = useState(["classic"]);
  const [selectedTheme, setSelectedTheme] = useState("classic");
  const [playerBestScore, setPlayerBestScore] = useState(0);
  const [playerLastScore, setPlayerLastScore] = useState(0);
  const [leaderboardTab, setLeaderboardTab] = useState("all");
  const [quizAdaptiveLevel, setQuizAdaptiveLevel] = useState(0);
  const [quizTimeLimit, setQuizTimeLimit] = useState(QUESTION_TIME_LIMIT);
  const [sharedLeaderboardEnabled, setSharedLeaderboardEnabled] = useState(true);
  const [puzzleSelected, setPuzzleSelected] = useState(null);
  const [puzzleLines, setPuzzleLines] = useState([]);
  const [puzzleDragFrom, setPuzzleDragFrom] = useState(null);
  const [puzzleDragOver, setPuzzleDragOver] = useState(null);
  const [puzzleSolved, setPuzzleSolved] = useState(false);
  const [puzzleShowResult, setPuzzleShowResult] = useState(false);
  const [puzzleAttempts, setPuzzleAttempts] = useState(0);
  const [puzzleChips, setPuzzleChips] = useState(50);
  const [puzzleCompletedIds, setPuzzleCompletedIds] = useState(new Set());
  const [puzzleTimeLeft, setPuzzleTimeLeft] = useState(0);
  const [puzzleTimerMax, setPuzzleTimerMax] = useState(0);
  const [puzzleHintUsed, setPuzzleHintUsed] = useState(false);
  const [puzzleShowHint, setPuzzleShowHint] = useState(false);
  const [puzzleStreak, setPuzzleStreak] = useState(0);
  const [puzzleLastWin, setPuzzleLastWin] = useState(null);
  const [puzzleSelectedLine, setPuzzleSelectedLine] = useState(0);
  const [puzzleStake, setPuzzleStake] = useState("normal");
  const [puzzleEndlessMode, setPuzzleEndlessMode] = useState(false);
  const [puzzleRound, setPuzzleRound] = useState(1);
  const [puzzleRule, setPuzzleRule] = useState(null);
  const [puzzleMovesLeft, setPuzzleMovesLeft] = useState(0);
  const [puzzleLockedLineId, setPuzzleLockedLineId] = useState("");
  const [puzzleStars, setPuzzleStars] = useState({});
  const [raceQuestions, setRaceQuestions] = useState([]);
  const [raceQuestionIdx, setRaceQuestionIdx] = useState(0);
  const [raceQuestionTimeLeft, setRaceQuestionTimeLeft] = useState(RACE_QUESTION_TIME_LIMIT);
  const [raceQuestionStartedAt, setRaceQuestionStartedAt] = useState(Date.now());
  const [racePicked, setRacePicked] = useState(null);
  const [raceShowFeedback, setRaceShowFeedback] = useState(false);
  const [raceIsCorrect, setRaceIsCorrect] = useState(false);
  const [raceFeedbackLabel, setRaceFeedbackLabel] = useState("");
  const [racePlayerDistance, setRacePlayerDistance] = useState(0);
  const [raceCpuDistance, setRaceCpuDistance] = useState(0);
  const [racePlayerSpeed, setRacePlayerSpeed] = useState(RACE_BASE_PLAYER_SPEED);
  const [raceCpuSpeed, setRaceCpuSpeed] = useState(RACE_BASE_CPU_SPEED);
  const [raceBoostPulse, setRaceBoostPulse] = useState(0);
  const [raceSlowPulse, setRaceSlowPulse] = useState(0);
  const [raceResult, setRaceResult] = useState(null);
  const [raceCorrectCount, setRaceCorrectCount] = useState(0);
  const [raceWrongCount, setRaceWrongCount] = useState(0);
  const [raceStartTs, setRaceStartTs] = useState(0);
  const [raceFinalScore, setRaceFinalScore] = useState(0);
  const [raceLeaderboardSaved, setRaceLeaderboardSaved] = useState(false);
  const [dailyClaimDate, setDailyClaimDate] = useState("");
  const importFileRef = useRef(null);
  const timer = useRef(null);
  const puzzleTimer = useRef(null);
  const raceFeedbackTimer = useRef(null);
  const racePlayerSpeedRef = useRef(RACE_BASE_PLAYER_SPEED);
  const raceCpuSpeedRef = useRef(RACE_BASE_CPU_SPEED);
  const abortCtrlRef = useRef(null);

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

  useEffect(() => {
    const settings = safeLocalGet(UX_SETTINGS_KEY, null);
    if (settings) {
      setSoundEnabled(settings.soundEnabled ?? true);
      setFontScale(settings.fontScale ?? 100);
      setReducedMotion(settings.reducedMotion ?? false);
      setHighContrast(settings.highContrast ?? false);
      setSelectedTheme(settings.selectedTheme ?? "classic");
      setUnlockedThemes(Array.isArray(settings.unlockedThemes) ? settings.unlockedThemes : ["classic"]);
      setShowOnboarding(!settings.onboardingDone);
    } else {
      setShowOnboarding(true);
    }

    const playerStats = safeLocalGet(PLAYER_STATS_KEY, null);
    if (playerStats) {
      setPlayerBestScore(Number(playerStats.bestScore || 0));
      setPlayerLastScore(Number(playerStats.lastScore || 0));
    }

    const puzzleProfile = safeLocalGet(PUZZLE_PROFILE_KEY, null);
    if (puzzleProfile) {
      setPuzzleChips(Number(puzzleProfile.chips || 50));
      setPuzzleStreak(Number(puzzleProfile.streak || 0));
      setPuzzleCompletedIds(new Set(Array.isArray(puzzleProfile.completedIds) ? puzzleProfile.completedIds : []));
      setPuzzleStake(puzzleProfile.stake || "normal");
      setPuzzleEndlessMode(Boolean(puzzleProfile.endlessMode));
      setPuzzleStars(puzzleProfile.stars && typeof puzzleProfile.stars === "object" ? puzzleProfile.stars : {});
    }

    const claim = safeLocalGet(DAILY_CHALLENGE_CLAIM_KEY, null);
    if (claim?.date) setDailyClaimDate(claim.date);
  }, []);

  useEffect(() => {
    safeLocalSet(UX_SETTINGS_KEY, {
      soundEnabled,
      fontScale,
      reducedMotion,
      highContrast,
      selectedTheme,
      unlockedThemes,
      onboardingDone: !showOnboarding,
    });
  }, [soundEnabled, fontScale, reducedMotion, highContrast, selectedTheme, unlockedThemes, showOnboarding]);

  useEffect(() => {
    if (!playerName.trim()) return;
    safeLocalSet(PLAYER_NAME_KEY, playerName.trim());
  }, [playerName]);

  useEffect(() => {
    safeLocalSet(PUZZLE_PROFILE_KEY, {
      chips: puzzleChips,
      streak: puzzleStreak,
      completedIds: [...puzzleCompletedIds],
      stake: puzzleStake,
      endlessMode: puzzleEndlessMode,
      stars: puzzleStars,
    });
  }, [puzzleChips, puzzleStreak, puzzleCompletedIds, puzzleStake, puzzleEndlessMode, puzzleStars]);

  const refreshLeaderboard = useCallback(async ({ clearOnError = false } = {}) => {
    if (!sharedLeaderboardEnabled) return;
    if (abortCtrlRef.current) abortCtrlRef.current.abort();
    abortCtrlRef.current = new AbortController();
    const signal = abortCtrlRef.current.signal;
    try {
      const remote = await fetchSharedLeaderboard();
      if (!signal.aborted) {
        setLeaderboard(remote);
        setLeaderboardError("");
        await sqliteSetJson(LEADERBOARD_CACHE_KEY, remote);
      }
    } catch (error) {
      if (signal.aborted) return;
      const msg = error instanceof Error ? error.message : "Unable to load shared leaderboard.";
      setLeaderboardError(msg);
      if (clearOnError) setLeaderboard([]);
      if (msg.includes("404")) {
        setSharedLeaderboardEnabled(false);
        try {
          const cached = await sqliteGetJson(LEADERBOARD_CACHE_KEY);
          if (Array.isArray(cached)) setLeaderboard(cached);
        } catch (_) {}
      }
    }
  }, [sharedLeaderboardEnabled]);

  useEffect(() => {
    if (!sharedLeaderboardEnabled) return;
    refreshLeaderboard({ clearOnError: true });
  }, [refreshLeaderboard, sharedLeaderboardEnabled]);

  useEffect(() => {
    if (screen !== "leaderboard" || !sharedLeaderboardEnabled) return undefined;
    refreshLeaderboard();
    const id = setInterval(() => refreshLeaderboard(), 4000);
    return () => clearInterval(id);
  }, [screen, refreshLeaderboard, sharedLeaderboardEnabled]);

  const level = levels && levelIdx >= 0 && levelIdx < levels.length ? levels[levelIdx] : null;
  const question = level && qIdx >= 0 && qIdx < level.questions.length ? level.questions[qIdx] : null;
  const raceQuestion = raceQuestions.length > 0 ? raceQuestions[raceQuestionIdx % raceQuestions.length] : null;
  const racePlayerProgress = Math.min(100, (racePlayerDistance / RACE_DISTANCE) * 100);
  const raceCpuProgress = Math.min(100, (raceCpuDistance / RACE_DISTANCE) * 100);

  useEffect(() => {
    // Improved adaptive difficulty: more forgiving when struggling
    const baseLevelAdjustment = quizAdaptiveLevel * 2;
    const lowLifeBonus = lives === 1 ? 4 : lives === 2 ? 2 : 0;
    const adjusted = Math.max(10, Math.min(24, QUESTION_TIME_LIMIT - baseLevelAdjustment + lowLifeBonus));
    setQuizTimeLimit(adjusted);
  }, [quizAdaptiveLevel, lives]);

  const boom = () => { setConfetti(true); setTimeout(() => setConfetti(false), 2600); };

  const addScore = useCallback((name, s) => {
    const entry = { name, score: s, date: new Date().toLocaleDateString(), ts: Date.now() };
    const ctrl = new AbortController();
    (async () => {
      try {
        const updated = await pushSharedLeaderboardEntry(entry);
        if (!ctrl.signal.aborted) {
          setLeaderboard(updated);
          setLeaderboardError("");
          await sqliteSetJson(LEADERBOARD_CACHE_KEY, updated);
        }
      } catch (error) {
        if (ctrl.signal.aborted) return;
        const msg = error instanceof Error ? error.message : "Unable to update shared leaderboard.";
        setLeaderboardError(msg);
        if (msg.includes("404")) setSharedLeaderboardEnabled(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (screen !== "gameOver" && screen !== "victory") return;
    setPlayerLastScore(score);
    setPlayerBestScore(prev => {
      const next = Math.max(prev, score);
      safeLocalSet(PLAYER_STATS_KEY, { bestScore: next, lastScore: score });
      return next;
    });
  }, [screen, score]);

  const handleAnswer = useCallback((idx) => {
    if (showFB) return;
    if (timer.current) clearTimeout(timer.current);
    setPicked(idx);
    const correct = idx === question.answer;
    setIsCorrect(correct);
    setShowFB(true);
    if (correct) {
      const elapsed = Math.min(quizTimeLimit, Math.floor((Date.now() - questionStartedAt) / 1000));
      const speedBonus = Math.max(0, Math.floor((quizTimeLimit - elapsed) * 3.5));
      const nextStreak = streak + 1;
      // Unlimited streak multiplier: increases dynamically without cap
      const multiplier = Number((1 + (nextStreak * 0.15)).toFixed(2));
      const pts = Math.round((75 * multiplier) + speedBonus);
      setLastAwardedPoints(pts);
      setLastSpeedBonus(speedBonus);
      setLastMultiplier(multiplier);
      setScore(s => s + pts);
      setLvlScore(s => s + pts);
      setStreak(nextStreak);
      setBestStreak(prev => Math.max(prev, nextStreak));

      // Smart difficulty: reduce time pressure when succeeding quickly, increase when struggling
      const shouldIncreaseDifficulty = elapsed <= Math.max(3, Math.floor(quizTimeLimit * 0.4));
      setQuizAdaptiveLevel(curr => shouldIncreaseDifficulty ? Math.min(5, curr + 1) : Math.max(-2, curr - 1));
      if (elapsed <= 5) setFastAnswersCount(c => c + 1);

      // Bonus life on 5-streak for comeback mechanic
      if (nextStreak > 0 && nextStreak % BONUS_LIFE_STREAK === 0 && lives < TOTAL_LIVES) {
        setLives(l => Math.min(TOTAL_LIVES, l + 1));
      }

      setShowScorePop(true);
      if (soundEnabled) playTone(860, 0.09, "triangle", 0.03);
      setTimeout(() => setShowScorePop(false), 2000);
    } else {
      setStreak(0);
      setLastAwardedPoints(0);
      setLastSpeedBonus(0);
      setLastMultiplier(1);
      // Fair penalty: 30 base + 2% of current score (max 50 penalty)
      const penalty = Math.min(50, PENALTY_PER_WRONG + Math.round(score * 0.02));
      setScore(s => Math.max(0, s - penalty));
      setLives(l => l - 1);

      // Adaptive difficulty helps when struggling: slower timer when losing lives
      setQuizAdaptiveLevel(curr => Math.max(-2, curr - 1));
      setShake(true);
      if (soundEnabled) playTone(240, 0.12, "sawtooth", 0.03);
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
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [showFB, question, qIdx, level, lives, score, playerName, addScore, streak, questionStartedAt, quizTimeLimit, soundEnabled]);

  useEffect(() => {
    if (screen !== "game" || !question) return undefined;
    if (showFB) return undefined;
    const startedAt = Date.now();
    setQuestionStartedAt(startedAt);
    setQuestionTimeLeft(quizTimeLimit);
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, quizTimeLimit - elapsed);
      setQuestionTimeLeft(left);
      if (left <= 0) { clearInterval(id); handleAnswer(-1); }
    }, 250);
    return () => { clearInterval(id); };
  }, [screen, question, showFB, quizTimeLimit, handleAnswer]);

  const nextLevel = () => {
    if (timer.current) clearTimeout(timer.current);
    if (levelIdx + 1 >= levels.length) { addScore(playerName, score); boom(); setScreen("victory"); }
    else { setLevelIdx(l => l + 1); setQIdx(0); setLvlScore(0); setPicked(null); setShowFB(false); setScreen("game"); }
  };

  const startGame = (name = playerName) => {
    const alias = (name || "").trim();
    if (!alias) {
      setScreen("namePicker");
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    if (puzzleTimer.current) clearTimeout(puzzleTimer.current);
    if (raceFeedbackTimer.current) clearTimeout(raceFeedbackTimer.current);
    if (abortCtrlRef.current) abortCtrlRef.current.abort();
    setLevels(curr => shuffleQuestionsInLevels(curr));
    setPlayerName(alias); setNameInput(alias); setLevelIdx(0); setQIdx(0); setLives(TOTAL_LIVES);
    setScore(0); setLvlScore(0); setStreak(0); setBestStreak(0); setFastAnswersCount(0);
    setQuizAdaptiveLevel(0);
    setQuestionTimeLeft(QUESTION_TIME_LIMIT); setLastAwardedPoints(0); setLastSpeedBonus(0); setLastMultiplier(1);
    setPicked(null); setShowFB(false); setScreen("game");
  };

  const startRace = useCallback((name = playerName) => {
    const alias = (name || "").trim();
    if (!alias) {
      setScreen("namePicker");
      return;
    }
    const pool = buildRaceQuestions(levels);
    if (pool.length === 0) return;
    if (raceFeedbackTimer.current) clearTimeout(raceFeedbackTimer.current);
    setPlayerName(alias);
    setNameInput(alias);
    setRaceQuestions(pool.slice(0, Math.min(24, pool.length)));
    setRaceQuestionIdx(0);
    setRaceQuestionTimeLeft(RACE_QUESTION_TIME_LIMIT);
    setRaceQuestionStartedAt(Date.now());
    setRacePicked(null);
    setRaceShowFeedback(false);
    setRaceIsCorrect(false);
    setRaceFeedbackLabel("");
    setRacePlayerDistance(0);
    setRaceCpuDistance(0);
    setRacePlayerSpeed(RACE_BASE_PLAYER_SPEED);
    setRaceCpuSpeed(RACE_BASE_CPU_SPEED);
    racePlayerSpeedRef.current = RACE_BASE_PLAYER_SPEED;
    raceCpuSpeedRef.current = RACE_BASE_CPU_SPEED;
    setRaceBoostPulse(0);
    setRaceSlowPulse(0);
    setRaceResult(null);
    setRaceCorrectCount(0);
    setRaceWrongCount(0);
    setRaceFinalScore(0);
    setRaceLeaderboardSaved(false);
    setRaceStartTs(Date.now());
    setScreen("raceGame");
  }, [levels, playerName]);

  const handleRaceAnswer = useCallback((idx, timedOut = false) => {
    if (raceShowFeedback || !raceQuestion || screen !== "raceGame") return;
    if (raceFeedbackTimer.current) clearTimeout(raceFeedbackTimer.current);
    const correct = idx === raceQuestion.answer;
    setRacePicked(idx);
    setRaceIsCorrect(correct);
    setRaceShowFeedback(true);

    if (correct) {
      setRaceCorrectCount(c => c + 1);
      setRaceFeedbackLabel("Boost engaged!");
      setRacePlayerSpeed(speed => Math.min(RACE_MAX_SPEED, speed + 14));
      setRaceCpuSpeed(speed => Math.max(RACE_MIN_SPEED, speed - 4));
      setRaceBoostPulse(v => v + 1);
      if (soundEnabled) playTone(930, 0.08, "triangle", 0.03);
    } else {
      setRaceWrongCount(c => c + 1);
      setRaceFeedbackLabel(timedOut ? "Time up - traction lost!" : "Wrong answer - speed down!");
      setRacePlayerSpeed(speed => Math.max(RACE_MIN_SPEED, speed - 11));
      setRaceCpuSpeed(speed => Math.min(RACE_MAX_SPEED, speed + 6));
      setRaceSlowPulse(v => v + 1);
      if (soundEnabled) playTone(260, 0.1, "sawtooth", 0.025);
    }

    raceFeedbackTimer.current = setTimeout(() => {
      setRaceShowFeedback(false);
      setRacePicked(null);
      setRaceQuestionIdx(i => i + 1);
    }, 900);
  }, [raceShowFeedback, raceQuestion, screen, soundEnabled]);

  useEffect(() => {
    racePlayerSpeedRef.current = racePlayerSpeed;
  }, [racePlayerSpeed]);

  useEffect(() => {
    raceCpuSpeedRef.current = raceCpuSpeed;
  }, [raceCpuSpeed]);

  useEffect(() => {
    if (screen !== "raceGame" || !raceQuestion || raceResult) return undefined;
    if (raceShowFeedback) return undefined;
    const startedAt = Date.now();
    setRaceQuestionStartedAt(startedAt);
    setRaceQuestionTimeLeft(RACE_QUESTION_TIME_LIMIT);
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const left = Math.max(0, RACE_QUESTION_TIME_LIMIT - elapsed);
      setRaceQuestionTimeLeft(left);
      if (left <= 0) {
        clearInterval(id);
        handleRaceAnswer(-1, true);
      }
    }, 200);
    return () => clearInterval(id);
  }, [screen, raceQuestion, raceShowFeedback, raceResult, handleRaceAnswer]);

  useEffect(() => {
    if (screen !== "raceGame" || raceResult) return undefined;
    const id = setInterval(() => {
      setRacePlayerSpeed(curr => {
        const next = Math.max(RACE_MIN_SPEED, Math.min(RACE_MAX_SPEED, curr + (RACE_BASE_PLAYER_SPEED - curr) * 0.1));
        racePlayerSpeedRef.current = next;
        return next;
      });

      setRaceCpuSpeed(curr => {
        const target = RACE_BASE_CPU_SPEED + (Math.random() * 3 - 1.5);
        const next = Math.max(RACE_MIN_SPEED, Math.min(RACE_MAX_SPEED, curr + (target - curr) * 0.14));
        raceCpuSpeedRef.current = next;
        return next;
      });

      setRacePlayerDistance(distance => Math.min(RACE_DISTANCE, distance + racePlayerSpeedRef.current * 0.08));
      setRaceCpuDistance(distance => Math.min(RACE_DISTANCE, distance + raceCpuSpeedRef.current * 0.08));
    }, 80);
    return () => clearInterval(id);
  }, [screen, raceResult]);

  useEffect(() => {
    if (screen !== "raceGame" || raceResult) return;
    const playerFinished = racePlayerDistance >= RACE_DISTANCE;
    const cpuFinished = raceCpuDistance >= RACE_DISTANCE;
    if (!playerFinished && !cpuFinished) return;

    const playerWon = playerFinished && (!cpuFinished || racePlayerDistance >= raceCpuDistance);
    const elapsedSeconds = Math.max(1, Math.floor((Date.now() - raceStartTs) / 1000));
    const placementBonus = playerWon ? 350 : 90;
    const paceBonus = Math.max(0, 220 - elapsedSeconds * 3);
    const answerScore = raceCorrectCount * 120 - raceWrongCount * 45;
    const distanceScore = Math.round((racePlayerDistance / RACE_DISTANCE) * 450);
    const finalScore = Math.max(50, placementBonus + paceBonus + answerScore + distanceScore);

    setRaceResult(playerWon ? "win" : "lose");
    setRaceFinalScore(finalScore);

    if (!raceLeaderboardSaved) {
      addScore(playerName || "Guest", finalScore);
      setRaceLeaderboardSaved(true);
    }

    setScreen("raceResult");
  }, [screen, raceResult, racePlayerDistance, raceCpuDistance, raceStartTs, raceCorrectCount, raceWrongCount, raceLeaderboardSaved, addScore, playerName]);

  useEffect(() => {
    if (screen === "raceGame") return undefined;
    if (raceFeedbackTimer.current) clearTimeout(raceFeedbackTimer.current);
    return undefined;
  }, [screen]);

  const savePlayerAlias = () => {
    const alias = nameInput.trim();
    if (!alias) return;
    setPlayerName(alias);
    setNameInput(alias);
    safeLocalSet(PLAYER_NAME_KEY, alias);
    setScreen("intro");
  };

  const resumeQuizFromCheckpoint = () => {
    if (!userProgress) return;
    const savedLevelIdx = Number(userProgress.levelIdx ?? 0);
    const savedQIdx = Number(userProgress.qIdx ?? 0);
    setPlayerName(userProgress.playerName || "Guest");
    setScore(Number(userProgress.score || 0));
    setLives(Number(userProgress.lives || TOTAL_LIVES));
    setLevelIdx(Number.isFinite(savedLevelIdx) ? Math.max(0, Math.min(savedLevelIdx, Math.max(levels.length - 1, 0))) : 0);
    setQIdx(Number.isFinite(savedQIdx) ? Math.max(0, savedQIdx) : 0);
    setScreen("game");
  };

  const goLeaderboard = (from) => { setPrevScreen(from); setScreen("leaderboard"); };
  const goAdminLogin = (from) => { setPrevScreen(from); setAdminNotice(""); setAdminPinInput(""); setScreen("adminLogin"); };

  const startPuzzle = (puzzle, options = {}) => {
    clearTimeout(puzzleTimer.current);
    const rule = pickPuzzleRule();
    const stake = PUZZLE_STAKE_CONFIG[puzzleStake] || PUZZLE_STAKE_CONFIG.normal;
    setPuzzleSelected(puzzle);
    setPuzzleLines(shufflePuzzleLines(puzzle.lines));
    setPuzzleRule(rule);
    setPuzzleSolved(false);
    setPuzzleShowResult(false);
    setPuzzleAttempts(0);
    setPuzzleHintUsed(false);
    setPuzzleShowHint(false);
    setPuzzleSelectedLine(0);
    setPuzzleLastWin(null);
    const maxTime = puzzle.difficulty === "Easy" ? 70 : puzzle.difficulty === "Medium" ? 100 : 150;
    const roundPenalty = puzzleEndlessMode ? Math.min(45, (options.round ?? puzzleRound) * 4) : 0;
    const adjustedMax = Math.max(45, Math.round(maxTime * stake.timerMultiplier) - roundPenalty);
    setPuzzleTimeLeft(adjustedMax);
    setPuzzleTimerMax(adjustedMax);
    setPuzzleMovesLeft(rule.id === "limitedMoves" ? Math.max(3, puzzle.lines.length + (puzzleEndlessMode ? 1 : 2)) : 0);
    if (rule.id === "lockedLine") {
      const lockCandidate = puzzle.lines[Math.floor(Math.random() * puzzle.lines.length)];
      setPuzzleLockedLineId(lockCandidate?.id || "");
    } else {
      setPuzzleLockedLineId("");
    }
    if (!options.keepRound) setPuzzleRound(1);
    setScreen("puzzleGame");
  };

  const movePuzzleLine = (fromIndex, toIndex) => {
    if (fromIndex === null || fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return false;
    if (puzzleRule?.id === "limitedMoves" && puzzleMovesLeft <= 0) return false;
    const lockedIndex = puzzleLines.findIndex(line => line.id === puzzleLockedLineId);
    if (lockedIndex >= 0 && (fromIndex === lockedIndex || toIndex === lockedIndex)) return false;
    const newLines = [...puzzleLines];
    const [moved] = newLines.splice(fromIndex, 1);
    newLines.splice(toIndex, 0, moved);
    if (lockedIndex >= 0) {
      const newLockedIndex = newLines.findIndex(line => line.id === puzzleLockedLineId);
      if (newLockedIndex !== lockedIndex) return false;
    }
    setPuzzleLines(newLines);
    if (puzzleRule?.id === "limitedMoves") setPuzzleMovesLeft(m => Math.max(0, m - 1));
    return true;
  };

  const getNextEndlessPuzzle = () => {
    if (!puzzleSelected) return PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    const pool = PUZZLES.filter(p => p.id !== puzzleSelected.id);
    return pool[Math.floor(Math.random() * pool.length)] || PUZZLES[0];
  };

  const handlePuzzleDrop = (toIndex) => {
    if (puzzleDragFrom === null || puzzleDragFrom === toIndex) {
      setPuzzleDragFrom(null);
      setPuzzleDragOver(null);
      return;
    }
    movePuzzleLine(puzzleDragFrom, toIndex);
    setPuzzleDragFrom(null);
    setPuzzleDragOver(null);
  };

  const handlePuzzleCheck = (timedOut = false) => {
    if (!puzzleSelected) return;
    const chipsBefore = puzzleChips;
    clearTimeout(puzzleTimer.current);
    const correct = isPuzzleOrderCorrect(puzzleLines, puzzleSelected.lines);
    setPuzzleShowResult(true);
    setPuzzleAttempts(a => a + 1);

    if (correct && !timedOut) {
      setPuzzleSolved(true);
      boom();
      if (soundEnabled) playTone(920, 0.1, "triangle", 0.03);
      const stake = PUZZLE_STAKE_CONFIG[puzzleStake] || PUZZLE_STAKE_CONFIG.normal;
      // Improved time bonus: scales better with remaining time
      const timeBonus = Math.round((puzzleTimeLeft / Math.max(puzzleTimerMax, 1)) * puzzleSelected.chips * 0.5);
      const attemptsNow = puzzleAttempts + 1;
      const perfectBonus = attemptsNow === 1 ? 200 : 0;
      // Reduced hint penalty from 20% to 10%
      const hintPenalty = puzzleHintUsed ? Math.round(puzzleSelected.chips * 0.1) : 0;
      // Improved streak bonus: scales better with streak
      const streakBonus = Math.round(puzzleStreak * (10 + puzzleStreak * 5));
      const dailyBonus = (puzzleSelected.id === dailyPuzzle.id && dailyClaimDate !== getTodayKey() && !puzzleEndlessMode) ? 150 : 0;
      const ruleBonus = puzzleRule?.bonus || 0;
      const rawEarned = puzzleSelected.chips + timeBonus + perfectBonus + streakBonus + dailyBonus + ruleBonus - hintPenalty;
      const earned = Math.round(rawEarned * stake.rewardMultiplier);
      const earnedStars = Math.max(1, 3 - (attemptsNow > 1 ? 1 : 0) - (puzzleHintUsed ? 1 : 0) - (puzzleTimeLeft < Math.max(10, Math.floor(puzzleTimerMax * 0.3)) ? 1 : 0));

      setPuzzleChips(c => c + earned);
      setPuzzleCompletedIds(ids => new Set([...ids, puzzleSelected.id]));
      setPuzzleStars(prev => ({ ...prev, [puzzleSelected.id]: Math.max(prev[puzzleSelected.id] || 0, earnedStars) }));
      setPuzzleStreak(s => s + 1);
      if (dailyBonus > 0) {
        const today = getTodayKey();
        setDailyClaimDate(today);
        safeLocalSet(DAILY_CHALLENGE_CLAIM_KEY, { date: today });
      }
      setPuzzleLastWin({ earned, timeBonus, perfectBonus, streakBonus, hintPenalty, dailyBonus, ruleBonus, earnedStars, timedOut: false, endless: puzzleEndlessMode });
      setTimeout(() => setScreen("puzzleResult"), 1000);
      return;
    }

    if (timedOut) {
      setPuzzleSolved(true);
      // Partial penalty on timeout: lose 50% instead of 100%
      const partialLoss = Math.round(chipsBefore * 0.5);
      setPuzzleChips(c => Math.max(0, c - partialLoss));
      // Streak survives one timeout
      setPuzzleLastWin({ earned: -partialLoss, timedOut: true, endless: puzzleEndlessMode, bust: true });
      if (soundEnabled) playTone(220, 0.12, "sawtooth", 0.03);
      setTimeout(() => setScreen("puzzleResult"), 800);
      return;
    }

    setPuzzleSolved(true);
    // Partial penalty on wrong answer: lose 30% instead of 100%
    const attemptsNow = puzzleAttempts + 1;
    const wrongPenalty = Math.round(chipsBefore * (0.15 + attemptsNow * 0.05));
    setPuzzleChips(c => Math.max(0, c - wrongPenalty));
    // Streak doesn't reset on first attempt, only on multiple failures
    if (attemptsNow > 3) setPuzzleStreak(0);
    setPuzzleLastWin({ earned: -wrongPenalty, timedOut: false, endless: puzzleEndlessMode, bust: true });
    if (soundEnabled) playTone(280, 0.09, "square", 0.02);
    setTimeout(() => setScreen("puzzleResult"), 800);
  };

  const handlePuzzleHint = () => {
    if (puzzleHintUsed || puzzleSolved || puzzleRule?.id === "cleanTable" || puzzleChips < 50) return;
    setPuzzleHintUsed(true);
    setPuzzleShowHint(true);
    setPuzzleChips(c => c - 50);
    setTimeout(() => setPuzzleShowHint(false), 3500);
  };

  const handlePuzzleShuffle = () => {
    if (puzzleSolved || puzzleRule?.id === "shuffleBan" || puzzleChips < 10) return;
    setPuzzleLines(curr => shufflePuzzleLines(curr));
    setPuzzleShowResult(false);
    setPuzzleChips(c => c - 10);
    if (puzzleRule?.id === "limitedMoves") setPuzzleMovesLeft(m => Math.max(0, m - 1));
  };

  useEffect(() => {
    if (screen !== "puzzleGame" || puzzleSolved || !puzzleSelected) {
      if (puzzleTimer.current) clearTimeout(puzzleTimer.current);
      return undefined;
    }
    if (puzzleTimeLeft <= 0 && puzzleTimerMax > 0) {
      handlePuzzleCheck(true);
      return undefined;
    }
    puzzleTimer.current = setTimeout(() => setPuzzleTimeLeft(t => t - 1), 1000);
    return () => { if (puzzleTimer.current) clearTimeout(puzzleTimer.current); };
  }, [screen, puzzleSolved, puzzleSelected, puzzleTimeLeft, puzzleTimerMax, handlePuzzleCheck]);

  const zoneCount = levels.length;
  const totalQuestionCount = levels.reduce((t, z) => t + z.questions.length, 0);
  const puzzleAllCompleted = puzzleCompletedIds.size === PUZZLES.length;
  const puzzleMasteredCount = Object.values(puzzleStars).filter(stars => Number(stars) >= 3).length;
  const totalPuzzleStars = Object.values(puzzleStars).reduce((sum, stars) => sum + Number(stars || 0), 0);
  const dailyPuzzle = PUZZLES[new Date().getDate() % PUZZLES.length];
  const dailyClaimed = dailyClaimDate === getTodayKey();
  const leaderboardFiltered = leaderboard.filter((entry) => {
    if (leaderboardTab === "all") return true;
    if (!entry?.ts) return leaderboardTab === "all";

    const entryDate = new Date(entry.ts);
    const entryDateStr = entryDate.toDateString();
    const todayStr = new Date().toDateString();

    if (leaderboardTab === "today") {
      return entryDateStr === todayStr;
    }

    if (leaderboardTab === "week") {
      // Get the week start date in proper local time
      const now = new Date();
      const d = new Date(now);
      const day = d.getDay();
      const diff = (day + 6) % 7;
      d.setDate(d.getDate() - diff);
      d.setHours(0, 0, 0, 0);

      // Get the week end (next Sunday)
      const weekEnd = new Date(d);
      weekEnd.setDate(weekEnd.getDate() + 7);

      return entryDate >= d && entryDate < weekEnd;
    }

    return true;
  });
  const progressionTitle = playerBestScore >= 2200 ? "Grandmaster" : playerBestScore >= 1400 ? "High Roller" : playerBestScore >= 700 ? "Rising Pro" : "Starter";
  const puzzleObjectives = [
    { id: "obj-stars", label: "Master 5 puzzles", progress: puzzleMasteredCount, target: 5, done: puzzleMasteredCount >= 5 },
    { id: "obj-streak", label: "Reach poker streak 4", progress: puzzleStreak, target: 4, done: puzzleStreak >= 4 },
    { id: "obj-chips", label: "Hold 5000 poker chips", progress: puzzleChips, target: 5000, done: puzzleChips >= 5000 },
    { id: "obj-endless", label: "Reach endless round 6", progress: puzzleRound, target: 6, done: puzzleRound >= 6 },
  ];
  const progress = level ? (qIdx / level.questions.length) * 100 : 0;
  const overallProgress = zoneCount === 0 ? 0 : Math.min(100, Math.round((((levelIdx) + (level ? qIdx / Math.max(level.questions.length, 1) : 0)) / zoneCount) * 100));
  const currentZoneIndex = Math.min(levelIdx + 1, Math.max(zoneCount, 1));
  const isPhone = typeof window !== "undefined" ? window.innerWidth <= 640 : false;

  useEffect(() => {
    const unlocked = ["classic"];
    if (playerBestScore >= 1200 || puzzleChips >= 2400) unlocked.push("ocean");
    if (playerBestScore >= 2200 || puzzleAllCompleted) unlocked.push("contrast");
    setUnlockedThemes(unlocked);
    if (!unlocked.includes(selectedTheme)) setSelectedTheme("classic");
  }, [playerBestScore, puzzleChips, puzzleAllCompleted, selectedTheme]);

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
      mode: ["game", "levelDone", "gameOver", "victory", "namePicker"].includes(screen) ? "quiz" : ["puzzleLobby", "puzzleGame", "puzzleResult"].includes(screen) ? "puzzle" : ["raceGame", "raceResult"].includes(screen) ? "race" : "menu",
      levelIdx,
      qIdx,
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

  useEffect(() => {
    const onQuizKeyDown = (e) => {
      if (screen !== "game" || showFB) return;
      const key = e.key.toLowerCase();
      const mapping = { "1": 0, "2": 1, "3": 2, "4": 3, a: 0, b: 1, c: 2, d: 3 };
      if (Object.prototype.hasOwnProperty.call(mapping, key)) {
        e.preventDefault();
        handleAnswer(mapping[key]);
      }
    };
    window.addEventListener("keydown", onQuizKeyDown);
    return () => window.removeEventListener("keydown", onQuizKeyDown);
  }, [screen, showFB, handleAnswer]);

  useEffect(() => {
    const onPuzzleKeyDown = (e) => {
      if (screen !== "puzzleGame" || !puzzleSelected || puzzleSolved) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPuzzleSelectedLine(i => {
          const next = Math.max(0, i - 1);
          movePuzzleLine(i, next);
          return next;
        });
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setPuzzleSelectedLine(i => {
          const next = Math.min(puzzleLines.length - 1, i + 1);
          movePuzzleLine(i, next);
          return next;
        });
      }
      if (e.key.toLowerCase() === "h") { e.preventDefault(); handlePuzzleHint(); }
      if (e.key.toLowerCase() === "s") { e.preventDefault(); handlePuzzleShuffle(); }
      if (e.key === "Enter") { e.preventDefault(); handlePuzzleCheck(false); }
    };
    window.addEventListener("keydown", onPuzzleKeyDown);
    return () => window.removeEventListener("keydown", onPuzzleKeyDown);
  }, [screen, puzzleSelected, puzzleSolved, puzzleLines.length, puzzleRule, puzzleMovesLeft, puzzleLockedLineId, handlePuzzleHint, handlePuzzleShuffle, handlePuzzleCheck]);

  useEffect(() => {
    if (!soundEnabled) return;
    if (screen === "game" && questionTimeLeft === 5) playTone(420, 0.06, "square", 0.02);
  }, [questionTimeLeft, soundEnabled, screen]);

  useEffect(() => {
    if (!soundEnabled) return;
    if (screen === "puzzleGame" && puzzleTimeLeft === 10) playTone(420, 0.06, "square", 0.02);
  }, [puzzleTimeLeft, soundEnabled, screen]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (puzzleTimer.current) clearTimeout(puzzleTimer.current);
      if (raceFeedbackTimer.current) clearTimeout(raceFeedbackTimer.current);
      if (abortCtrlRef.current) abortCtrlRef.current.abort();
    };
  }, []);

  // Casino color palette
  const themeOverrides = selectedTheme === "ocean"
    ? { bg: "#eaf5fb", card: "#f4fbff", border: "#6aa9c766", muted: "#2f6177", faint: "#527688", gold: "#1b6d8c" }
    : selectedTheme === "contrast"
      ? { bg: "#ffffff", card: "#ffffff", border: "#22222266", text: "#111111", muted: "#333333", faint: "#4a4a4a", gold: "#1a1a1a" }
      : {};

  const C = {
    bg: "#f7f3e9",
    felt: "#ffffff",
    card: "#fffaf2",
    border: "#d4b24c66",
    borderBright: "#a77a00",
    text: "#2f2211",
    muted: "#735f45",
    faint: "#927d61",
    gold: "#8a6400",
    red: "#ff3366",
    green: "#00ffaa",
    cyan: "#00d4ff",
    purple: "#bf00ff",
    orange: "#ff6b00",
    ...themeOverrides,
  };

  if (highContrast) {
    C.text = "#111111";
    C.muted = "#222222";
    C.faint = "#333333";
    C.border = "#1a1a1a88";
    C.gold = "#1a1a1a";
  }

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
      fontSize: `${fontScale}%`,
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
        @keyframes marqueeGlow{ 0%,100%{box-shadow:0 4px 16px rgba(67,44,7,0.12)} 50%{box-shadow:0 8px 22px rgba(67,44,7,0.16)} }
        @keyframes borderDance{ 0%{border-color:#ffd700} 25%{border-color:#ff3366} 50%{border-color:#00ffaa} 75%{border-color:#00d4ff} 100%{border-color:#ffd700} }
        @keyframes spinIn    { from{transform:rotateY(90deg);opacity:0} to{transform:rotateY(0deg);opacity:1} }
        @keyframes tickerScroll{ 0%{transform:translateX(100%)} 100%{transform:translateX(-100%)} }
        @keyframes laneScroll { from{background-position-y:0} to{background-position-y:48px} }
        @keyframes boostGlow { 0%,100%{box-shadow:0 0 12px rgba(0,255,170,0.45)} 50%{box-shadow:0 0 24px rgba(0,255,170,0.9)} }
        @keyframes trailFade { 0%{opacity:0.95;transform:scale(1)} 100%{opacity:0;transform:scale(0.2)} }

        ${reducedMotion ? `
        * {
          animation: none !important;
          transition: none !important;
        }
        ` : ""}

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

      <div style={{ position: "sticky", top: 0, zIndex: 90, padding: "10px 12px 0" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", border: `1px solid ${C.border}`, borderRadius: 14, background: "rgba(255,255,255,0.9)", boxShadow: "0 8px 22px rgba(67,44,7,0.08)", padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16, color: C.text }}>Angular Quest Arena</span>
            <span style={{ fontSize: 11, color: C.faint, letterSpacing: 0.4 }}>Quiz + Racer + Poker Puzzle</span>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="casino-btn" onClick={() => setScreen("intro")} style={{ background: screen === "intro" ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: screen === "intro" ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Home</button>
            <button className="casino-btn" onClick={() => startGame(playerName)} style={{ background: ["namePicker", "game", "levelDone", "gameOver", "victory", "result", "question", "mode"].includes(screen) ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: ["namePicker", "game", "levelDone", "gameOver", "victory", "result", "question", "mode"].includes(screen) ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Quiz</button>
            <button className="casino-btn" onClick={() => startRace(playerName)} style={{ background: ["raceGame", "raceResult"].includes(screen) ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: ["raceGame", "raceResult"].includes(screen) ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Race</button>
            <button className="casino-btn" onClick={() => (playerName.trim() ? setScreen("puzzleLobby") : setScreen("namePicker"))} style={{ background: ["puzzleLobby", "puzzleGame", "puzzleResult"].includes(screen) ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: ["puzzleLobby", "puzzleGame", "puzzleResult"].includes(screen) ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Poker</button>
            <button className="casino-btn" onClick={() => goLeaderboard(screen)} style={{ background: screen === "leaderboard" ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: screen === "leaderboard" ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Leaderboard</button>
            <button className="casino-btn" onClick={() => setScreen("settings")} style={{ background: screen === "settings" ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: screen === "settings" ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Settings</button>
            <button className="casino-btn" onClick={() => setScreen("namePicker")} style={{ background: screen === "namePicker" ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.86)", color: screen === "namePicker" ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 999, padding: "7px 12px", fontSize: 13 }}>Change Name</button>
          </div>
        </div>
      </div>

      {showOnboarding && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div className="felt-table" style={{ maxWidth: 520, width: "100%", borderRadius: 16, padding: "22px 20px" }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 34, color: C.gold, letterSpacing: 2, marginBottom: 8 }}>Quick Guide</div>
            {onboardingStep === 0 && <p style={{ color: C.muted, lineHeight: 1.6 }}>Answer quickly to build streak multipliers and earn speed bonuses.</p>}
            {onboardingStep === 1 && <p style={{ color: C.muted, lineHeight: 1.6 }}>In Code Poker, hints and shuffles cost chips. Clean first-try solves pay extra.</p>}
            {onboardingStep === 2 && <p style={{ color: C.muted, lineHeight: 1.6 }}>Use keyboard: quiz keys 1-4 or A-D; puzzle keys ↑/↓, Enter, H, S.</p>}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <button className="casino-btn" onClick={() => setShowOnboarding(false)} style={{ background: "rgba(255,255,255,0.8)", color: C.text, border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 14px" }}>Skip</button>
              <button className="casino-btn" onClick={() => onboardingStep >= 2 ? setShowOnboarding(false) : setOnboardingStep(s => s + 1)} style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", color: "#3a2400", borderRadius: 9, padding: "9px 16px" }}>{onboardingStep >= 2 ? "Finish" : "Next"}</button>
            </div>
          </div>
        </div>
      )}


      {/* ─── INTRO ─────────────────────────────────────────────────────────── */}
      {screen === "intro" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px 24px 40px", paddingTop: 40, animation: "fadeUp 0.5s ease" }}>
          {/* Casino lights ring at top */}
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            {["♠","♥","♦","♣","★","♠","♥","♦","♣","★"].map((s, i) => (
              <div key={i} style={{
                fontSize: 20, color: i % 2 === 0 ? C.gold : C.red,
                textShadow: `0 0 10px ${i % 2 === 0 ? C.gold : C.red}`,
                animationName: "neonPulse",
                animationDuration: `${0.8 + i * 0.15}s`,
                animationTimingFunction: "ease-in-out",
                animationIterationCount: "infinite",
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
              color: "#4a3310",
              textShadow: "0 1px 0 rgba(255,255,255,0.45)",
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
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: C.gold }}>{t}</div>
                  <div style={{ color: C.faint, fontSize: 12, letterSpacing: 0.5, textTransform: "uppercase" }}>{s}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "-12px 0 22px" }}>
              <div style={{ borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.6)" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1 }}>Best Score</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: C.gold, letterSpacing: 1 }}>{playerBestScore}</div>
              </div>
              <div style={{ borderRadius: 10, padding: "10px 12px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.6)" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1 }}>Beat Last Run</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, color: C.gold, letterSpacing: 1 }}>
                  {Math.max(1, playerLastScore + 1)}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 18, borderRadius: 12, padding: "10px 12px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.64)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: C.muted }}>Player: <b style={{ color: C.text }}>{playerName || "Guest"}</b></div>
              <button className="casino-btn" onClick={() => setScreen("settings")} style={{ background: "rgba(255,255,255,0.8)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text }}>
                ⚙ Open Settings
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                className="casino-btn"
                disabled={zoneCount === 0}
                onClick={() => startGame(playerName)}
                style={{
                  backgroundColor: zoneCount === 0 ? "#e8dcc4" : "#ffd700",
                  backgroundImage: zoneCount === 0 ? "none" : "linear-gradient(135deg, #ffd700, #ff8c00, #ffd700)",
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
              <button
                className="casino-btn"
                disabled={zoneCount === 0}
                onClick={() => startRace(playerName)}
                style={{
                  background: "rgba(255,255,255,0.75)", color: C.text,
                  border: `1.5px solid ${C.border}`, padding: "15px 24px",
                  borderRadius: 14, fontSize: 16, letterSpacing: 1,
                  opacity: zoneCount === 0 ? 0.6 : 1
                }}>
                🏁 Angular Racer
              </button>
              <button
                className="casino-btn"
                onClick={() => (playerName.trim() ? setScreen("puzzleLobby") : setScreen("namePicker"))}
                style={{
                  background: "rgba(255,255,255,0.75)", color: C.text,
                  border: `1.5px solid ${C.border}`, padding: "15px 24px",
                  borderRadius: 14, fontSize: 16, letterSpacing: 1
                }}>
                🧩 Code Poker
              </button>
              {userProgress?.mode === "quiz" && ["game", "levelDone"].includes(userProgress.screen) && (
                <button
                  className="casino-btn"
                  onClick={resumeQuizFromCheckpoint}
                  style={{
                    background: "rgba(255,255,255,0.75)", color: C.text,
                    border: `1.5px solid ${C.border}`, padding: "15px 24px",
                    borderRadius: 14, fontSize: 16, letterSpacing: 1
                  }}>
                  ⏯ Resume Quiz
                </button>
              )}
            </div>

            <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: isPhone ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 10 }}>
              <div style={{ borderRadius: 12, padding: "12px 14px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", textAlign: "left" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>New Content Tracks</div>
                <div style={{ display: "grid", gap: 5, fontSize: 12, color: C.muted }}>
                  <div>• Angular foundations, advanced architecture, and performance packs</div>
                  <div>• Daily challenge rotations with bonus chips and streak multipliers</div>
                  <div>• Endless Code Poker with escalating pressure per round</div>
                </div>
              </div>
              <div style={{ borderRadius: 12, padding: "12px 14px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", textAlign: "left" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 6 }}>Progress Overview</div>
                <div style={{ display: "grid", gap: 5, fontSize: 12, color: C.muted }}>
                  <div>• Quiz best: <b style={{ color: C.text }}>{playerBestScore}</b></div>
                  <div>• Poker chips: <b style={{ color: C.text }}>{puzzleChips.toLocaleString()}</b></div>
                  <div>• Puzzle completion: <b style={{ color: C.text }}>{puzzleCompletedIds.size}/{PUZZLES.length}</b></div>
                  <div>• Total stars: <b style={{ color: C.text }}>{totalPuzzleStars}</b></div>
                </div>
              </div>
            </div>

            {leaderboardError && <div style={{ marginTop: 10, fontSize: 12, color: C.red, textAlign: "center", opacity: 0.8 }}>{leaderboardError}</div>}
            {zoneCount === 0 && <div style={{ marginTop: 10, fontSize: 12, color: C.faint, animation: "neonPulse 1.2s infinite" }}>Loading the deck…</div>}
            <div style={{ marginTop: 8, fontSize: 12, color: C.faint }}>Rank: <b style={{ color: C.text }}>{progressionTitle}</b></div>
          </div>
        </div>
      )}

      {/* ─── SETTINGS ─────────────────────────────────────────────────────── */}
      {screen === "settings" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "34px 18px", animation: "fadeUp 0.35s ease" }}>
          <div className="felt-table" style={{ borderRadius: 22, padding: "28px 24px", width: "100%", maxWidth: 760 }}>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(34px,6vw,48px)", letterSpacing: 3, color: C.gold }}>Settings</div>
              <div style={{ color: C.muted, fontSize: 13, letterSpacing: 1 }}>Manage profile, accessibility, and theme</div>
            </div>

            <GoldDivider />

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", padding: "12px 14px" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: C.text, marginBottom: 8 }}>Player Name</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && nameInput.trim() && savePlayerAlias()}
                    placeholder="Enter your alias"
                    maxLength={20}
                    style={{
                      flex: 1,
                      minWidth: 220,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1px solid ${C.border}`,
                      background: "rgba(255,255,255,0.9)",
                      fontFamily: "'Playfair Display', serif",
                      fontSize: 15,
                      color: C.text,
                    }}
                  />
                  <button className="casino-btn" onClick={savePlayerAlias} disabled={!nameInput.trim()} style={{ background: nameInput.trim() ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "#e8dcc4", color: nameInput.trim() ? "#3a2400" : C.faint, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                    Save Name
                  </button>
                </div>
              </div>

              <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", padding: "12px 14px" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: C.text, marginBottom: 8 }}>Gameplay & Accessibility</div>
                <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 8 }}>
                  <button className="casino-btn" onClick={() => setSoundEnabled(v => !v)} style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 13, color: C.text }}>{soundEnabled ? "🔊 Sound On" : "🔈 Sound Off"}</button>
                  <button className="casino-btn" onClick={() => setReducedMotion(v => !v)} style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 13, color: C.text }}>{reducedMotion ? "🧘 Motion Reduced" : "🎞 Motion Normal"}</button>
                  <button className="casino-btn" onClick={() => setHighContrast(v => !v)} style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 13, color: C.text }}>{highContrast ? "◐ Contrast High" : "◑ Contrast Normal"}</button>
                  <button className="casino-btn" onClick={() => setFontScale(v => v >= 115 ? 100 : v + 5)} style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontSize: 13, color: C.text }}>🔎 Text {fontScale}%</button>
                </div>
              </div>

              <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", padding: "12px 14px" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: C.text, marginBottom: 8 }}>Theme</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { id: "classic", label: "Classic" },
                    { id: "ocean", label: "Ocean" },
                    { id: "contrast", label: "Contrast" },
                  ].map((theme) => (
                    <button key={theme.id} className="casino-btn" disabled={!unlockedThemes.includes(theme.id)} onClick={() => setSelectedTheme(theme.id)} style={{ background: selectedTheme === theme.id ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.9)", color: selectedTheme === theme.id ? "#3a2400" : C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, opacity: unlockedThemes.includes(theme.id) ? 1 : 0.5 }}>
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
              <button className="casino-btn" onClick={() => setScreen("intro")} style={{ background: "rgba(255,255,255,0.9)", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 18px", fontSize: 14 }}>
                ← Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PUZZLE LOBBY ─────────────────────────────────────────────────── */}
      {screen === "puzzleLobby" && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 20px 40px", animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 24, padding: "32px 28px", maxWidth: 980, width: "100%" }}>
            <div style={{ textAlign: "center", marginBottom: 26 }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "clamp(40px,7vw,62px)", letterSpacing: 4, color: "#4a3310", marginBottom: 4 }}>
                Code Poker
              </div>
              <div style={{ color: C.muted, fontSize: 14, letterSpacing: 1.2, textTransform: "uppercase" }}>Angular line-order puzzles in light mode</div>
              <div style={{ color: C.faint, fontSize: 12, marginTop: 6 }}>Player: <b style={{ color: C.text }}>{playerName || "Guest"}</b></div>
            </div>

            <GoldDivider />

            <div style={{ display: "flex", justifyContent: "center", gap: 36, margin: "18px 0 26px", flexWrap: "wrap" }}>
              {[["🪙", puzzleChips.toLocaleString(), "Chips"], ["🔥", puzzleStreak, "Streak"], ["✓", `${puzzleCompletedIds.size}/${PUZZLES.length}`, "Solved"]].map(([icon, val, label]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, marginBottom: 2 }}>{icon}</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: C.gold, letterSpacing: 1 }}>{val}</div>
                  <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center", marginBottom: 16, fontSize: 13, color: C.muted }}>
              Daily Challenge: <b style={{ color: C.text }}>{dailyPuzzle.title}</b> · Bonus {dailyClaimed ? "claimed" : "+150 chips available"}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 10, marginBottom: 14 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.7)" }}>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Stake</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.entries(PUZZLE_STAKE_CONFIG).map(([id, cfg]) => (
                    <button
                      key={id}
                      className="casino-btn"
                      onClick={() => setPuzzleStake(id)}
                      style={{
                        background: puzzleStake === id ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.8)",
                        color: puzzleStake === id ? "#3a2400" : C.text,
                        border: `1px solid ${C.border}`,
                        borderRadius: 7,
                        padding: "5px 9px",
                        fontSize: 12,
                      }}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", background: "rgba(255,255,255,0.7)" }}>
                <div style={{ fontSize: 11, color: C.faint, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Mode</div>
                <button
                  className="casino-btn"
                  onClick={() => { setPuzzleEndlessMode(v => !v); setPuzzleRound(1); }}
                  style={{
                    background: puzzleEndlessMode ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.8)",
                    color: puzzleEndlessMode ? "#3a2400" : C.text,
                    border: `1px solid ${C.border}`,
                    borderRadius: 7,
                    padding: "6px 10px",
                    fontSize: 12,
                  }}>
                  {puzzleEndlessMode ? `Endless Round ${puzzleRound}` : "Classic Mode"}
                </button>
              </div>
            </div>

            <div className="lobby-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {PUZZLES.map(puzzle => (
                <button
                  key={puzzle.id}
                  className="casino-btn"
                  onClick={() => startPuzzle(puzzle)}
                  style={{
                    textAlign: "left",
                    background: "linear-gradient(135deg, #fffdfa, #f6efdf)",
                    border: puzzle.id === dailyPuzzle.id ? "1.5px solid #1f7a5c99" : `1.5px solid ${C.border}`,
                    borderRadius: 14,
                    padding: "16px 16px 14px",
                    boxShadow: puzzleCompletedIds.has(puzzle.id) ? "0 0 0 2px #1f7a5c33 inset" : "0 4px 14px rgba(67,44,7,0.08)"
                  }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 30 }}>{puzzle.icon}</div>
                    <div style={{ borderRadius: 8, padding: "3px 8px", fontSize: 11, letterSpacing: 1.2, fontFamily: "'Bebas Neue', sans-serif", color: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty], background: `${PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty]}1A`, border: `1px solid ${PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty]}55` }}>
                      {puzzle.difficulty}
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 3 }}>{puzzle.title}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>{puzzle.subtitle}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: C.faint }}>{puzzle.lines.length} lines</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, color: C.gold }}>🪙 {Math.round(puzzle.chips * (PUZZLE_STAKE_CONFIG[puzzleStake]?.rewardMultiplier || 1))}{puzzle.id === dailyPuzzle.id && !dailyClaimed ? " +150" : ""}</span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 12, color: C.faint }}>
                    {"★".repeat(Math.max(0, Math.min(3, puzzleStars[puzzle.id] || 0)))}{"☆".repeat(3 - Math.max(0, Math.min(3, puzzleStars[puzzle.id] || 0)))}
                  </div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: isPhone ? "1fr" : "repeat(2, minmax(0,1fr))", gap: 10 }}>
              <div style={{ borderRadius: 12, padding: "12px 14px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 8 }}>Challenge Tracks</div>
                <div style={{ display: "grid", gap: 5, fontSize: 12, color: C.muted }}>
                  <div>• Sprint Track: short timers + strict move limits</div>
                  <div>• Precision Track: no hints and no shuffle safety net</div>
                  <div>• Survival Track: endless mode with higher penalties</div>
                  <div>• Recovery Track: rebuild stack through normal stakes</div>
                </div>
              </div>

              <div style={{ borderRadius: 12, padding: "12px 14px", border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 8 }}>Active Objectives</div>
                <div style={{ display: "grid", gap: 9 }}>
                  {puzzleObjectives.map((objective) => (
                    <div key={objective.id} style={{ fontSize: 12, color: C.muted }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span>{objective.label}</span>
                        <b style={{ color: C.text }}>{Math.min(objective.progress, objective.target)}/{objective.target}</b>
                      </div>
                      <div style={{ height: 7, borderRadius: 999, background: "#e2dccf", overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, (objective.progress / objective.target) * 100)}%`, height: "100%", background: objective.done ? "#1f7a5c" : "#8a6400" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {puzzleAllCompleted && (
              <div style={{ marginTop: 18, borderRadius: 14, padding: "14px 16px", textAlign: "center", background: "rgba(31,122,92,0.08)", border: "1px solid rgba(31,122,92,0.3)", color: "#1f7a5c", fontWeight: 700 }}>
                🏆 All puzzle tables cleared.
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
              <button className="casino-btn" onClick={() => setScreen("intro")} style={{ background: "rgba(255,255,255,0.75)", color: C.text, border: `1.5px solid ${C.border}`, padding: "11px 22px", borderRadius: 10, fontSize: 15 }}>
                ← Back to Main Menu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PUZZLE GAME ──────────────────────────────────────────────────── */}
      {screen === "puzzleGame" && puzzleSelected && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "44px 16px 32px", animation: "fadeUp 0.3s ease" }}>
          <div style={{ width: "100%", maxWidth: 760, marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <button
                className="casino-btn"
                onClick={() => { clearTimeout(puzzleTimer.current); setScreen("puzzleLobby"); }}
                style={{ background: "rgba(255,255,255,0.8)", color: C.text, border: `1.5px solid ${C.border}`, padding: "8px 14px", borderRadius: 9, fontSize: 15 }}>
                ← Lobby
              </button>

              <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Stake</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.text }}>{PUZZLE_STAKE_CONFIG[puzzleStake]?.label || "Normal"}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Chips</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: C.gold }}>{puzzleChips.toLocaleString()}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Tries</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: C.text }}>{puzzleAttempts}</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Time</div>
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: puzzleTimeLeft <= 15 ? C.red : puzzleTimeLeft <= 30 ? C.gold : "#1f7a5c" }}>{puzzleTimeLeft}s</div>
                </div>
                {puzzleEndlessMode && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 10, color: C.faint, letterSpacing: 1, textTransform: "uppercase" }}>Round</div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: C.text }}>{puzzleRound}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ width: "100%", height: 6, background: "#eadfc8", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(puzzleTimeLeft / Math.max(puzzleTimerMax, 1)) * 100}%`, background: `linear-gradient(90deg, ${puzzleTimeLeft > 30 ? "#1f7a5c" : puzzleTimeLeft > 15 ? "#8a6400" : "#b02f4b"}, #d2a426)`, transition: "width 1s linear" }} />
            </div>
          </div>

          <div className="felt-table" style={{ borderRadius: 18, padding: "24px 20px", width: "100%", maxWidth: 760 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
              <div style={{ fontSize: 34 }}>{puzzleSelected.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 2 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 21, color: C.text }}>{puzzleSelected.title}</div>
                  <span style={{ borderRadius: 8, padding: "2px 8px", fontSize: 11, letterSpacing: 1.2, fontFamily: "'Bebas Neue', sans-serif", color: PUZZLE_DIFFICULTY_COLORS[puzzleSelected.difficulty], background: `${PUZZLE_DIFFICULTY_COLORS[puzzleSelected.difficulty]}1A`, border: `1px solid ${PUZZLE_DIFFICULTY_COLORS[puzzleSelected.difficulty]}55` }}>{puzzleSelected.difficulty}</span>
                </div>
                <div style={{ fontSize: 13, color: C.muted }}>{puzzleSelected.subtitle}</div>
              </div>
            </div>

            <GoldDivider />

            <div style={{ fontSize: 13, color: C.muted, textAlign: "center", marginBottom: 14 }}>
              Drag lines or use keyboard (↑/↓ move selected line, Enter check, H hint, S shuffle). One wrong check or timeout busts your chips.
            </div>

            <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.62)", padding: "9px 12px", marginBottom: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>Rule: {puzzleRule?.title || "Standard"}</span>
              <span style={{ fontSize: 12, color: C.muted }}>{puzzleRule?.description || "No modifier"}</span>
              {puzzleRule?.id === "limitedMoves" && <span style={{ fontSize: 12, color: C.red }}>Moves left: {puzzleMovesLeft}</span>}
            </div>

            {puzzleShowHint && (
              <div style={{ borderRadius: 10, padding: "10px 12px", marginBottom: 12, background: "rgba(13,95,128,0.08)", border: "1px solid rgba(13,95,128,0.25)", color: "#0d5f80", fontSize: 13 }}>
                💡 {puzzleSelected.hint}
              </div>
            )}

            <div>
              {puzzleLines.map((line, index) => {
                const isCorrectPos = puzzleShowResult && line.id === puzzleSelected.lines[index].id;
                let bg = "rgba(255,255,255,0.7)";
                let border = "1px solid rgba(138,100,0,0.25)";
                if (puzzleDragFrom === index) {
                  bg = "rgba(255,215,0,0.12)";
                  border = "1px solid rgba(138,100,0,0.55)";
                }
                if (puzzleDragOver === index && puzzleDragFrom !== index) {
                  bg = `${line.color}14`;
                  border = `1px solid ${line.color}66`;
                }
                if (puzzleShowResult && isCorrectPos) {
                  bg = "rgba(31,122,92,0.1)";
                  border = "1px solid rgba(31,122,92,0.55)";
                }
                if (puzzleShowResult && !isCorrectPos) {
                  bg = "rgba(176,47,75,0.08)";
                  border = "1px solid rgba(176,47,75,0.45)";
                }

                return (
                  <div
                    key={line.id}
                    draggable={!puzzleSolved}
                    onClick={() => setPuzzleSelectedLine(index)}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setPuzzleDragFrom(index); }}
                    onDragOver={(e) => { e.preventDefault(); setPuzzleDragOver(index); }}
                    onDrop={(e) => { e.preventDefault(); handlePuzzleDrop(index); }}
                    style={{
                      border: puzzleSelectedLine === index && !puzzleSolved ? `1.5px solid ${line.color}` : border,
                      background: bg,
                      borderRadius: 10,
                      padding: "10px 12px",
                      marginBottom: 7,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      cursor: puzzleSolved ? "default" : (puzzleDragFrom === index ? "grabbing" : "grab"),
                      transition: "all 0.15s"
                    }}>
                    <div style={{ minWidth: 26, height: 26, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Bebas Neue', sans-serif", fontSize: 13, color: line.color, background: `${line.color}22`, border: `1px solid ${line.color}33` }}>
                      {index + 1}
                    </div>
                    {line.id === puzzleLockedLineId && (
                      <div style={{ fontSize: 12, color: C.red, fontWeight: 700, minWidth: 18 }}>🔒</div>
                    )}
                    <code style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: "clamp(12px,1.8vw,14px)", color: line.color, whiteSpace: "pre", flex: 1 }}>{line.code}</code>
                    {puzzleShowResult && <div style={{ fontSize: 16 }}>{isCorrectPos ? "✓" : "✗"}</div>}
                  </div>
                );
              })}
            </div>

            <GoldDivider />

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="casino-btn" onClick={handlePuzzleShuffle} disabled={puzzleSolved || puzzleRule?.id === "shuffleBan" || (puzzleRule?.id === "limitedMoves" && puzzleMovesLeft <= 0) || puzzleChips < 10} style={{ background: "rgba(255,255,255,0.75)", color: C.text, border: `1px solid ${C.border}`, padding: "10px 16px", borderRadius: 10, fontSize: 15 }}>
                🔀 Shuffle (−10)
              </button>
              <button className="casino-btn" onClick={handlePuzzleHint} disabled={puzzleHintUsed || puzzleSolved || puzzleRule?.id === "cleanTable" || puzzleChips < 50} style={{ background: puzzleHintUsed || puzzleRule?.id === "cleanTable" || puzzleChips < 50 ? "rgba(255,255,255,0.65)" : "rgba(13,95,128,0.08)", color: puzzleHintUsed || puzzleRule?.id === "cleanTable" || puzzleChips < 50 ? C.faint : "#0d5f80", border: puzzleHintUsed || puzzleRule?.id === "cleanTable" || puzzleChips < 50 ? `1px solid ${C.border}` : "1px solid rgba(13,95,128,0.35)", padding: "10px 16px", borderRadius: 10, fontSize: 15 }}>
                {puzzleHintUsed ? "💡 Used" : "💡 Hint (−50)"}
              </button>
              <button className="casino-btn" onClick={() => handlePuzzleCheck(false)} disabled={puzzleSolved} style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", color: "#3a2400", padding: "10px 24px", borderRadius: 10, fontSize: 16, boxShadow: "0 4px 20px #ffd70044" }}>
                ✓ Check Hand
              </button>
            </div>

            {puzzleShowResult && !puzzleSolved && (
              <div style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: C.red }}>
                Not quite right — try again.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── PUZZLE RESULT ────────────────────────────────────────────────── */}
      {screen === "puzzleResult" && puzzleSelected && puzzleLastWin && (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 20px", animation: "fadeUp 0.35s ease" }}>
          <div className="felt-table" style={{ borderRadius: 22, padding: "34px 30px", maxWidth: 520, width: "100%", textAlign: "center" }}>
            {puzzleLastWin.timedOut ? (
              <>
                <div style={{ fontSize: 56, marginBottom: 8 }}>⏰</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, color: C.red, letterSpacing: 3 }}>Time's Up</div>
                <p style={{ color: C.muted, margin: "6px 0 16px" }}>The puzzle timer ended for {puzzleSelected.title}.</p>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, color: C.red, marginBottom: 16 }}>{puzzleLastWin.earned} chips</div>
              </>
            ) : puzzleLastWin.bust ? (
              <>
                <div style={{ fontSize: 56, marginBottom: 8 }}>💥</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, color: C.red, letterSpacing: 3 }}>Bust!</div>
                <p style={{ color: C.muted, margin: "6px 0 16px" }}>Wrong order for {puzzleSelected.title}.</p>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, color: C.red, marginBottom: 16 }}>{puzzleLastWin.earned} chips</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 58, marginBottom: 8 }}>🎉</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 44, color: C.gold, letterSpacing: 3 }}>Winner</div>
                <p style={{ color: C.muted, margin: "6px 0 16px" }}>You solved {puzzleSelected.title}.</p>
                <div style={{ margin: "8px 0 18px", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "8px 0" }}>
                  {[
                    ["Base", `+${puzzleSelected.chips}`, C.gold],
                    puzzleLastWin.timeBonus > 0 && ["Speed", `+${puzzleLastWin.timeBonus}`, "#1f7a5c"],
                    puzzleLastWin.perfectBonus > 0 && ["Perfect", `+${puzzleLastWin.perfectBonus}`, "#0d5f80"],
                    puzzleLastWin.streakBonus > 0 && ["Streak", `+${puzzleLastWin.streakBonus}`, "#a35000"],
                    puzzleLastWin.dailyBonus > 0 && ["Daily", `+${puzzleLastWin.dailyBonus}`, "#1f7a5c"],
                    puzzleLastWin.ruleBonus > 0 && ["Rule", `+${puzzleLastWin.ruleBonus}`, "#6f3db4"],
                    puzzleLastWin.hintPenalty > 0 && ["Hint", `-${puzzleLastWin.hintPenalty}`, C.red],
                  ].filter(Boolean).map(([label, amount, color]) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: C.muted, padding: "4px 0" }}>
                      <span>{label}</span><span style={{ color, fontWeight: 700 }}>{amount}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 14, color: C.muted, marginBottom: 10 }}>
                  Stars Earned: <b style={{ color: C.text }}>{"★".repeat(Math.max(0, puzzleLastWin.earnedStars || 0))}{"☆".repeat(3 - Math.max(0, puzzleLastWin.earnedStars || 0))}</b>
                </div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, color: C.gold, marginBottom: 16 }}>+{puzzleLastWin.earned} chips</div>
              </>
            )}

            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: C.muted, letterSpacing: 1, marginBottom: 14 }}>
              Balance: <span style={{ color: C.gold }}>{puzzleChips.toLocaleString()}</span>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="casino-btn" onClick={() => setScreen("puzzleLobby")} style={{ background: "rgba(255,255,255,0.8)", color: C.text, border: `1px solid ${C.border}`, padding: "10px 18px", borderRadius: 10, fontSize: 15 }}>
                ← Lobby
              </button>
              <button className="casino-btn" onClick={() => {
                if (puzzleEndlessMode && !puzzleLastWin.timedOut && !puzzleLastWin.bust) {
                  const next = getNextEndlessPuzzle();
                  setPuzzleRound(r => r + 1);
                  startPuzzle(next, { keepRound: true, round: puzzleRound + 1 });
                  return;
                }
                startPuzzle(puzzleSelected);
              }} style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", color: "#3a2400", padding: "10px 22px", borderRadius: 10, fontSize: 16, boxShadow: "0 4px 20px #ffd70044" }}>
                {puzzleEndlessMode && !puzzleLastWin.timedOut && !puzzleLastWin.bust ? "🚀 Next Round" : "🎲 Play Again"}
              </button>
            </div>
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
              color: C.gold,
              marginBottom: 6
            }}>Who's at the Table?</div>
            <p style={{ color: C.muted, margin: "0 0 30px", fontSize: 14, letterSpacing: 0.5 }}>
              Your alias for the leaderboard
            </p>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && nameInput.trim() && savePlayerAlias()}
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
              onClick={() => nameInput.trim() && savePlayerAlias()}
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
            {playerName.trim() && (
              <button
                onClick={() => setScreen("intro")}
                style={{ display: "block", width: "100%", marginTop: 12, background: "none", border: "none", color: C.faint, cursor: "pointer", fontFamily: "'Crimson Pro', serif", fontSize: 14, padding: "6px 0", letterSpacing: 1 }}>
                ← Back to Menu
              </button>
            )}
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
                  <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: C.gold, letterSpacing: 1 }}>{score}</div>
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

      {/* ─── RACE GAME ───────────────────────────────────────────────────── */}
      {screen === "raceGame" && raceQuestion && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 14px 28px", animation: "fadeUp 0.35s ease" }}>
          <div style={{ width: "100%", maxWidth: 980, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button className="casino-btn" onClick={() => setScreen("intro")} style={{ background: "rgba(255,255,255,0.8)", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 14 }}>
                ← Exit Race
              </button>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: C.faint }}>Question {raceQuestionIdx + 1}</div>
                <div style={{ fontSize: 12, color: C.faint }}>✅ {raceCorrectCount}</div>
                <div style={{ fontSize: 12, color: C.faint }}>❌ {raceWrongCount}</div>
                <TimerRing value={raceQuestionTimeLeft} max={RACE_QUESTION_TIME_LIMIT} />
              </div>
            </div>

            <RaceThreeScene
              playerProgress={racePlayerProgress}
              cpuProgress={raceCpuProgress}
              playerSpeed={racePlayerSpeed}
              cpuSpeed={raceCpuSpeed}
              boostPulse={raceBoostPulse}
              slowPulse={raceSlowPulse}
            />

            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: -2, marginBottom: 2, fontSize: 12, color: C.muted }}>
              <span>Player distance: <b style={{ color: C.text }}>{racePlayerProgress.toFixed(1)}%</b></span>
              <span>CPU distance: <b style={{ color: C.text }}>{raceCpuProgress.toFixed(1)}%</b></span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1 }}>Player Speed</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: racePlayerSpeed > raceCpuSpeed ? "#1f7a5c" : C.text }}>{Math.round(racePlayerSpeed)} mph</div>
              </div>
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.68)", padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1 }}>CPU Speed</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 26, color: raceCpuSpeed > racePlayerSpeed ? "#a35000" : C.text }}>{Math.round(raceCpuSpeed)} mph</div>
              </div>
            </div>

            <div className="felt-table" style={{ borderRadius: 16, padding: "16px 18px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 24 }}>{raceQuestion.zoneIcon || "🏁"}</div>
                <div>
                  <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: 1 }}>Question Zone</div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: C.text, fontSize: 15 }}>{raceQuestion.zoneName || "Angular"}</div>
                </div>
              </div>

              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: C.text, marginBottom: 12, lineHeight: 1.5 }}>{raceQuestion.q}</div>

              <div style={{ display: "grid", gridTemplateColumns: isPhone ? "1fr" : "1fr 1fr", gap: 8 }}>
                {raceQuestion.options.map((opt, i) => {
                  const selected = racePicked === i;
                  const correct = raceShowFeedback && i === raceQuestion.answer;
                  const wrong = raceShowFeedback && selected && !raceIsCorrect;
                  return (
                    <button
                      key={`${raceQuestionIdx}-${i}`}
                      className="opt-casino"
                      disabled={raceShowFeedback}
                      onClick={() => handleRaceAnswer(i)}
                      style={{
                        borderRadius: 10,
                        border: `1.5px solid ${correct ? "#1f7a5c" : wrong ? "#b02f4b" : selected ? C.gold : C.border}`,
                        padding: "10px 12px",
                        background: correct ? "rgba(31,122,92,0.1)" : wrong ? "rgba(176,47,75,0.1)" : "rgba(255,255,255,0.8)",
                        color: correct ? "#1f7a5c" : wrong ? "#b02f4b" : C.text,
                        fontSize: 14,
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>

              {raceShowFeedback && (
                <div style={{ marginTop: 10, borderRadius: 10, border: `1px solid ${raceIsCorrect ? "rgba(31,122,92,0.45)" : "rgba(176,47,75,0.45)"}`, background: raceIsCorrect ? "rgba(31,122,92,0.08)" : "rgba(176,47,75,0.08)", padding: "9px 12px", color: raceIsCorrect ? "#1f7a5c" : "#b02f4b", fontSize: 13, fontWeight: 700 }}>
                  {raceFeedbackLabel}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── RACE RESULT ─────────────────────────────────────────────────── */}
      {screen === "raceResult" && (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 20px", animation: "fadeUp 0.4s ease" }}>
          <div className="felt-table" style={{ borderRadius: 24, padding: "34px 30px", maxWidth: 520, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 64, marginBottom: 8 }}>{raceResult === "win" ? "🏁" : "💨"}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 46, letterSpacing: 3, color: raceResult === "win" ? C.gold : C.red }}>
              {raceResult === "win" ? "Finish Line!" : "Race Lost"}
            </div>
            <p style={{ color: C.muted, margin: "4px 0 16px", fontSize: 14 }}>
              {raceResult === "win" ? "You outran the CPU with smart Angular answers." : "CPU reached the finish first. Refuel and retry."}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8, marginBottom: 16 }}>
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 8px", background: "rgba(255,255,255,0.7)" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase" }}>Correct</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#1f7a5c" }}>{raceCorrectCount}</div>
              </div>
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 8px", background: "rgba(255,255,255,0.7)" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase" }}>Wrong</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#b02f4b" }}>{raceWrongCount}</div>
              </div>
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, padding: "10px 8px", background: "rgba(255,255,255,0.7)" }}>
                <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase" }}>Score</div>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: C.gold }}>{raceFinalScore}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="casino-btn" onClick={() => goLeaderboard("raceResult")} style={{ background: "rgba(255,255,255,0.8)", color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 14 }}>
                🏆 Leaderboard
              </button>
              <button className="casino-btn" onClick={() => startRace(playerName)} style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", color: "#3a2400", borderRadius: 10, padding: "10px 18px", fontSize: 15 }}>
                🏁 Race Again
              </button>
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
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 32, fontWeight: 900, margin: "0 0 4px", color: C.gold }}>{level.name}</h2>
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
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 64, color: C.gold, letterSpacing: 2 }}>{score}</div>
              <div style={{ fontSize: 12, color: C.faint, letterSpacing: 2, textTransform: "uppercase" }}>Final Chips</div>
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <button className="casino-btn" onClick={() => goLeaderboard("gameOver")} style={{
                background: "rgba(255,215,0,0.08)", color: C.gold,
                border: `1.5px solid ${C.border}`, padding: "12px 20px",
                borderRadius: 12, fontSize: 15, letterSpacing: 1
              }}>🏆 Hall of Fame</button>
              <button className="casino-btn" onClick={() => startGame(playerName)} style={{
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
              filter: "drop-shadow(0 1px 0 rgba(255,255,255,0.45))",
              margin: "0 0 8px"
            }}>Angular Mastered!</div>
            <p style={{ color: C.muted, margin: "0 0 28px", fontSize: 16 }}>
              Well played, <span style={{ color: C.gold, fontFamily: "'Playfair Display', serif", fontWeight: 700 }}>{playerName}</span>! All 6 zones conquered.
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
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, color: C.gold, letterSpacing: 2 }}>{score}</div>
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
              <button className="casino-btn" onClick={() => startGame(playerName)} style={{
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
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 42, letterSpacing: 4, color: C.gold }}>Hall of Fame</div>
              <p style={{ color: C.muted, margin: "4px 0 0", fontSize: 14, letterSpacing: 1, textTransform: "uppercase" }}>Top Angular Quest Players</p>
            </div>

            <GoldDivider />

            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12 }}>
              {[
                { id: "today", label: "Today" },
                { id: "week", label: "Week" },
                { id: "all", label: "All Time" },
              ].map(tab => (
                <button
                  key={tab.id}
                  className="casino-btn"
                  onClick={() => setLeaderboardTab(tab.id)}
                  style={{
                    background: leaderboardTab === tab.id ? "linear-gradient(135deg, #ffd700, #ff8c00)" : "rgba(255,255,255,0.75)",
                    color: leaderboardTab === tab.id ? "#3a2400" : C.text,
                    border: `1px solid ${C.border}`,
                    borderRadius: 8,
                    padding: "7px 11px",
                    fontSize: 12,
                  }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {leaderboardFiltered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.faint }}>
                <div style={{ fontSize: 48, marginBottom: 10 }}>📭</div>
                <div style={{ fontSize: 15, fontFamily: "'Playfair Display', serif" }}>
                  {leaderboardError ? "Leaderboard unavailable" : "No scores for this period yet."}
                </div>
                {leaderboardError && <div style={{ fontSize: 12, color: C.red, marginTop: 6 }}>{sharedLeaderboardEnabled ? leaderboardError : "Remote API unavailable — local cached mode active."}</div>}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
                <div style={{ display: "flex", gap: 12, padding: "0 16px", fontSize: 11, color: C.faint, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>
                  <div style={{ minWidth: 32 }}>#</div>
                  <div style={{ flex: 1 }}>Player</div>
                  <div>Date</div>
                  <div style={{ minWidth: 60, textAlign: "right" }}>Score</div>
                </div>
                {leaderboardFiltered.slice(0, 10).map((entry, i) => {
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
              <button className="casino-btn" onClick={() => startGame(playerName)} style={{
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
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 3, color: C.gold }}>VIP Access</div>
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
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 38, letterSpacing: 3, color: C.gold }}>The Backroom</div>
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
              <button className="casino-btn" onClick={() => startGame(playerName)} style={{ background: "linear-gradient(135deg, #ffd700, #ff8c00)", color: "#1a0800", padding: "12px 28px", borderRadius: 12, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", boxShadow: "0 4px 20px #ffd70055" }}>Play Now →</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
