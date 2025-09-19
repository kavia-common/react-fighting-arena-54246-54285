import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import "./App.css";

/**
 * Simple 2D fighting game built with React + Tailwind.
 * Ocean Professional theme: blue & amber accents, gradients, subtle transitions, responsive.
 *
 * Key bindings:
 *  - Player 1: A/D move, W jump, S block, J light, K heavy, U special
 *  - Player 2: ArrowLeft/Right move, ArrowUp jump, ArrowDown block, Numpad1 light, Numpad2 heavy, Numpad3 special
 *
 * Modes:
 *  - PvP: Both players controlled
 *  - PvAI: Player 1 vs Computer with difficulty (Easy/Normal/Hard)
 */

// Game constants
const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 420;
const FLOOR_Y = 320;
const GRAVITY = 0.7;
const FRICTION = 0.85;
const MAX_SPEED = 5;
const JUMP_VELOCITY = -12;
const ATTACK_COOLDOWN = 350; // ms
const HEAVY_COOLDOWN = 700; // ms
const SPECIAL_COOLDOWN = 2200; // ms
const BLOCK_REDUCTION = 0.65; // percent damage reduced when blocking
const ROUND_TIME = 60; // seconds
const WIN_ROUNDS = 2;

// Public controls mapping: documented for UI hints
const CONTROLS = {
  p1: {
    left: "a",
    right: "d",
    up: "w",
    down: "s",
    light: "j",
    heavy: "k",
    special: "u",
  },
  p2: {
    left: "ArrowLeft",
    right: "ArrowRight",
    up: "ArrowUp",
    down: "ArrowDown",
    light: "Numpad1",
    heavy: "Numpad2",
    special: "Numpad3",
  },
};

const DIFFICULTY = {
  Easy: { reactionMs: [500, 900], blockChance: 0.25, specialChance: 0.1, aggression: 0.3 },
  Normal: { reactionMs: [350, 650], blockChance: 0.45, specialChance: 0.2, aggression: 0.55 },
  Hard: { reactionMs: [220, 420], blockChance: 0.65, specialChance: 0.35, aggression: 0.75 },
};

// Utility hooks
function useAnimationFrame(callback, active = true) {
  const requestRef = useRef();
  const lastRef = useRef(performance.now());

  const loop = useCallback(
    (time) => {
      const delta = time - lastRef.current;
      lastRef.current = time;
      callback(delta);
      requestRef.current = requestAnimationFrame(loop);
    },
    [callback]
  );

  useEffect(() => {
    if (!active) return;
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [loop, active]);
}

// Entity helpers
function createFighter(x, facing = 1, palette = "blue") {
  return {
    x,
    y: FLOOR_Y,
    vx: 0,
    vy: 0,
    width: 48,
    height: 78,
    facing, // 1 -> right, -1 -> left
    palette,
    onGround: true,
    attacking: false,
    attackType: null,
    attackTimer: 0,
    block: false,
    canAct: true,
    hp: 100,
    rounds: 0,
    cooldowns: {
      light: 0,
      heavy: 0,
      special: 0,
    },
    hitflash: 0,
    blockflash: 0,
  };
}

function rectsOverlap(a, b) {
  return !(
    a.x + a.width < b.x ||
    a.x > b.x + b.width ||
    a.y < b.y - b.height ||
    a.y - a.height > b.y
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function getAttackHitbox(f, type) {
  const reach = type === "heavy" ? 56 : type === "light" ? 42 : 68; // special longest
  const height = 24;
  return {
    x: f.facing === 1 ? f.x + f.width : f.x - reach,
    y: f.y - f.height / 2,
    width: reach,
    height,
  };
}

function resolveFacing(p1, p2) {
  const leftIsP1 = p1.x < p2.x;
  return [
    { ...p1, facing: leftIsP1 ? 1 : -1 },
    { ...p2, facing: leftIsP1 ? -1 : 1 },
  ];
}

function FighterSprite({ fighter, isLeft, tint, isKO }) {
  // simple "animated" rectangles with accent details; no images
  const base = fighter.palette === "blue" ? "bg-blue-500" : "bg-amber-500";
  const detail = fighter.palette === "blue" ? "bg-blue-300" : "bg-amber-300";
  const outline = fighter.palette === "blue" ? "ring-blue-300/60" : "ring-amber-300/60";
  const hitClass = fighter.hitflash > 0 ? "hitflash" : fighter.blockflash > 0 ? "blockflash" : "";

  return (
    <div
      className={`absolute bottom-0 fighter-shadow transition-transform duration-100 ${hitClass}`}
      style={{
        left: fighter.x,
        transform: `translate(-50%, 0) scaleX(${fighter.facing}) ${isKO ? "translateY(6px)" : ""}`,
        height: fighter.height,
        width: fighter.width,
      }}
    >
      <div className={`h-full w-full ${base} rounded-md ring-2 ${outline} relative`}>
        <div className={`absolute top-1 ${isLeft ? "left-1" : "right-1"} ${detail} h-3 w-8 rounded-sm`} />
        <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 ${detail}/70 h-2 w-10 rounded-sm`} />
        {/* Arms to indicate attacks */}
        {fighter.attacking && (
          <div
            className={`${detail} absolute h-2 rounded-sm`}
            style={{
              width:
                fighter.attackType === "heavy"
                  ? 34
                  : fighter.attackType === "light"
                  ? 24
                  : 40,
              top: fighter.height / 2 - 4,
              left: fighter.facing === 1 ? "100%" : "auto",
              right: fighter.facing === -1 ? "100%" : "auto",
              transform: `translate(${fighter.facing === 1 ? 2 : -2}px, 0)`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function HealthBar({ name, hp, rounds, side = "left", color = "blue" }) {
  const pct = clamp(hp, 0, 100);
  const base = color === "blue" ? "from-blue-500 to-blue-400" : "from-amber-500 to-amber-400";
  const shell = "bg-white/70 backdrop-blur border border-blue-200 shadow-sm";
  const dir = side === "left" ? "origin-left" : "origin-right";

  return (
    <div className="flex items-center gap-2">
      {side === "left" && (
        <div className="o-chip">{name}</div>
      )}
      <div className={`h-4 w-64 rounded-md ${shell} overflow-hidden`}>
        <div
          className={`h-full bg-gradient-to-r ${base} transition-all duration-300 ${dir}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex gap-1">
        {Array.from({ length: WIN_ROUNDS }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-3 rounded-sm border ${i < rounds ? "bg-amber-400 border-amber-300" : "bg-gray-100 border-gray-200"}`}
            title={`Round ${i + 1} ${i < rounds ? "won" : ""}`}
          />
        ))}
      </div>
      {side === "right" && (
        <div className="o-chip">{name}</div>
      )}
    </div>
  );
}

function TopHUD({ p1, p2, timer, mode, difficulty }) {
  return (
    <div className="w-full flex items-center justify-between px-4 md:px-6 py-3">
      <HealthBar name="Player 1" hp={p1.hp} rounds={p1.rounds} side="left" color="blue" />
      <div className="flex flex-col items-center">
        <div className="o-card px-3 py-1 text-sm font-semibold text-blue-700">
          {mode === "PvP" ? "PvP" : `PvAI • ${difficulty}`}
        </div>
        <div className="mt-1 text-2xl font-extrabold text-blue-700 tracking-wider">
          {timer.toString().padStart(2, "0")}
        </div>
      </div>
      <HealthBar name="Player 2" hp={p2.hp} rounds={p2.rounds} side="right" color="amber" />
    </div>
  );
}

function ControlsHelp({ visible }) {
  if (!visible) return null;
  return (
    <div className="o-card p-3 md:p-4 text-xs md:text-sm space-y-2">
      <div className="font-semibold text-blue-700 mb-1">Controls</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="font-semibold">Player 1</div>
          <div className="text-gray-600">Move: A/D • Jump: W • Block: S</div>
          <div className="text-gray-600">Light: J • Heavy: K • Special: U</div>
        </div>
        <div>
          <div className="font-semibold">Player 2</div>
          <div className="text-gray-600">Move: ←/→ • Jump: ↑ • Block: ↓</div>
          <div className="text-gray-600">Light: N1 • Heavy: N2 • Special: N3</div>
        </div>
      </div>
    </div>
  );
}

function GameOverOverlay({ winner, onNextRound, onReset, matchPoint }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="o-card p-6 md:p-8 text-center">
        <div className="text-3xl md:text-4xl font-extrabold text-blue-700">Round Over</div>
        <div className="mt-2 text-gray-700">
          {winner ? `${winner} wins the round!` : "Time Up!"}
        </div>
        {matchPoint ? (
          <div className="mt-2 text-amber-600 font-semibold">Match Point!</div>
        ) : null}
        <div className="mt-4 flex gap-3 justify-center">
          <button className="o-btn-primary" onClick={onNextRound}>Next Round</button>
          <button className="o-btn-ghost" onClick={onReset}>Reset Match</button>
        </div>
      </div>
    </div>
  );
}

function MatchVictory({ champion, onReset }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="o-card p-8 md:p-10 text-center">
        <div className="text-4xl md:text-5xl font-extrabold text-blue-700">Victory</div>
        <div className="mt-2 text-gray-700">{champion} wins the match!</div>
        <button className="o-btn-primary mt-5" onClick={onReset}>Play Again</button>
      </div>
    </div>
  );
}

// PUBLIC_INTERFACE
function App() {
  // App level settings
  const [mode, setMode] = useState("PvAI"); // PvP or PvAI
  const [difficulty, setDifficulty] = useState("Normal"); // Easy, Normal, Hard
  const [showControls, setShowControls] = useState(true);

  // Fighters state
  const [p1, setP1] = useState(() => createFighter(ARENA_WIDTH * 0.25, 1, "blue"));
  const [p2, setP2] = useState(() => createFighter(ARENA_WIDTH * 0.75, -1, "amber"));

  const [timer, setTimer] = useState(ROUND_TIME);
  const [paused, setPaused] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  const [winnerRound, setWinnerRound] = useState(null);
  const [matchWinner, setMatchWinner] = useState(null);

  const keysRef = useRef({});
  const lastInputRef = useRef({ p1: 0, p2: 0 });

  // Input handling
  useEffect(() => {
    const onKeyDown = (e) => {
      keysRef.current[e.key] = true;
    };
    const onKeyUp = (e) => {
      keysRef.current[e.key] = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Core game loop
  useAnimationFrame(
    (delta) => {
      if (paused || roundOver || matchWinner) return;
      // countdown
      if (delta > 0) {
        setTimer((t) => {
          const next = t - delta / 1000;
          if (next <= 0) {
            // time up -> decide by HP
            const w = p1.hp === p2.hp ? null : p1.hp > p2.hp ? "Player 1" : "Player 2";
            setWinnerRound(w);
            setRoundOver(true);
            return 0;
          }
          return next;
        });
      }

      // read keys snapshot
      const k = keysRef.current;

      // Player control helper
      const controlPlayer = (f, control, now) => {
        let nx = { ...f };
        // Movement
        const left = !!k[control.left];
        const right = !!k[control.right];
        const up = !!k[control.up];
        const down = !!k[control.down];

        // Blocking
        nx.block = down;

        // Horizontal
        const accel = 0.8;
        if (left && !right) {
          nx.vx = clamp(nx.vx - accel, -MAX_SPEED, MAX_SPEED);
        } else if (right && !left) {
          nx.vx = clamp(nx.vx + accel, -MAX_SPEED, MAX_SPEED);
        } else {
          nx.vx *= FRICTION;
          if (Math.abs(nx.vx) < 0.08) nx.vx = 0;
        }

        // Jump
        if (up && nx.onGround) {
          nx.vy = JUMP_VELOCITY;
          nx.onGround = false;
        }

        // Attacks
        const wantLight = !!k[control.light];
        const wantHeavy = !!k[control.heavy];
        const wantSpecial = !!k[control.special];

        const canLight = now >= nx.cooldowns.light;
        const canHeavy = now >= nx.cooldowns.heavy;
        const canSpecial = now >= nx.cooldowns.special;

        if (!nx.attacking && !nx.block && nx.canAct) {
          if (wantSpecial && canSpecial) {
            nx.attacking = true;
            nx.attackType = "special";
            nx.attackTimer = 240;
            nx.cooldowns.special = now + SPECIAL_COOLDOWN;
          } else if (wantHeavy && canHeavy) {
            nx.attacking = true;
            nx.attackType = "heavy";
            nx.attackTimer = 180;
            nx.cooldowns.heavy = now + HEAVY_COOLDOWN;
          } else if (wantLight && canLight) {
            nx.attacking = true;
            nx.attackType = "light";
            nx.attackTimer = 120;
            nx.cooldowns.light = now + ATTACK_COOLDOWN;
          }
        }

        // Integrate physics
        nx.vy += GRAVITY;
        nx.x = clamp(nx.x + nx.vx, 24, ARENA_WIDTH - 24);
        nx.y += nx.vy;

        if (nx.y >= FLOOR_Y) {
          nx.y = FLOOR_Y;
          nx.vy = 0;
          nx.onGround = true;
        }

        // Update animation timers
        if (nx.hitflash > 0) nx.hitflash -= delta;
        if (nx.blockflash > 0) nx.blockflash -= delta;
        if (nx.attacking) {
          nx.attackTimer -= delta;
          if (nx.attackTimer <= 0) {
            nx.attacking = false;
            nx.attackType = null;
          }
        }
        return nx;
      };

      // AI control
      const controlAI = (f, enemy, now) => {
        // Convert f as if player 2 with arrow key mapping
        // Deterministic decisions based on difficulty settings
        const cfg = DIFFICULTY[difficulty] || DIFFICULTY.Normal;
        const dist = Math.abs(enemy.x - f.x);
        const towardEnemy = enemy.x > f.x;

        const shouldAdvance = Math.random() < cfg.aggression;
        const shouldBlock = Math.random() < cfg.blockChance && enemy.attacking;
        const canAct = now >= f.cooldowns.light && now >= f.cooldowns.heavy && now >= f.cooldowns.special && !f.attacking;

        // create a synthetic key map for AI
        const synth = { ...keysRef.current };

        // Reset movement intents
        synth[CONTROLS.p2.left] = false;
        synth[CONTROLS.p2.right] = false;
        synth[CONTROLS.p2.up] = false;
        synth[CONTROLS.p2.down] = false;
        synth[CONTROLS.p2.light] = false;
        synth[CONTROLS.p2.heavy] = false;
        synth[CONTROLS.p2.special] = false;

        // Movement logic: keep mid distance ~ 70-120
        const targetMin = 72;
        const targetMax = 120;
        if (dist > targetMax && shouldAdvance) {
          if (towardEnemy) synth[CONTROLS.p2.right] = true;
          else synth[CONTROLS.p2.left] = true;
        } else if (dist < targetMin) {
          if (towardEnemy) synth[CONTROLS.p2.left] = true;
          else synth[CONTROLS.p2.right] = true;
        }

        // Occasional jump to dodge
        if (!f.onGround && Math.random() < 0.02) {
          synth[CONTROLS.p2.up] = true;
        }

        // Block if enemy attacking and close
        if (shouldBlock && dist < 100) {
          synth[CONTROLS.p2.down] = true;
        }

        // Attacks
        if (canAct) {
          const [minR, maxR] = cfg.reactionMs;
          const reactIn = Math.floor(minR + Math.random() * (maxR - minR));
          // Queue action after delay using timeouts is unsafe across frames; instead simulate by probability gates
          if (dist < 60 && Math.random() < 0.6) {
            synth[CONTROLS.p2.light] = true;
          } else if (dist < 80 && Math.random() < 0.4) {
            synth[CONTROLS.p2.heavy] = true;
          } else if (dist < 110 && Math.random() < cfg.specialChance) {
            synth[CONTROLS.p2.special] = true;
          }
        }

        // merge into keysRef for this frame only
        keysRef.current = { ...keysRef.current, ...synth };
        // proceed with control using generic function
        return controlPlayer(f, CONTROLS.p2, now);
      };

      const now = performance.now();
      let np1 = mode === "PvP" ? controlPlayer(p1, CONTROLS.p1, now) : controlPlayer(p1, CONTROLS.p1, now);
      let np2 = mode === "PvP" ? controlPlayer(p2, CONTROLS.p2, now) : controlAI(p2, p1, now);

      // Face each other
      [np1, np2] = resolveFacing(np1, np2);

      // Collision/attacks
      const handleHit = (attacker, defender) => {
        if (!attacker.attacking || !attacker.attackType) return defender;
        // Use attack active window roughly first half of timer
        const attackActive = attacker.attackTimer > 40;
        if (!attackActive) return defender;

        const hitbox = getAttackHitbox(attacker, attacker.attackType);
        const hurtbox = {
          x: defender.x - defender.width / 2,
          y: defender.y,
          width: defender.width,
          height: defender.height,
        };

        if (rectsOverlap(
          { x: hitbox.x, y: hitbox.y, width: hitbox.width, height: hitbox.height },
          { x: hurtbox.x, y: hurtbox.y - hurtbox.height, width: hurtbox.width, height: hurtbox.height }
        )) {
          // Apply damage
          const baseDmg = attacker.attackType === "light" ? 6 : attacker.attackType === "heavy" ? 12 : 18;
          const dmg = defender.block ? Math.ceil(baseDmg * (1 - BLOCK_REDUCTION)) : baseDmg;
          const nd = { ...defender, hp: clamp(defender.hp - dmg, 0, 100) };
          if (defender.block) nd.blockflash = 160;
          else nd.hitflash = 160;

          // Small knockback
          const kb = attacker.attackType === "heavy" ? 3.2 : attacker.attackType === "special" ? 4 : 2.2;
          nd.vx += kb * (attacker.facing === 1 ? 1 : -1);
          return nd;
        }
        return defender;
      };

      // Apply hits both ways
      np2 = handleHit(np1, np2);
      np1 = handleHit(np2, np1);

      // Prevent overlap by pushing apart
      const overlapX =
        Math.abs(np1.x - np2.x) < (np1.width + np2.width) / 2 ? (np1.width + np2.width) / 2 - Math.abs(np1.x - np2.x) : 0;
      if (overlapX > 0) {
        const push = overlapX / 2 + 0.1;
        if (np1.x < np2.x) {
          np1.x = clamp(np1.x - push, 24, ARENA_WIDTH - 24);
          np2.x = clamp(np2.x + push, 24, ARENA_WIDTH - 24);
        } else {
          np1.x = clamp(np1.x + push, 24, ARENA_WIDTH - 24);
          np2.x = clamp(np2.x - push, 24, ARENA_WIDTH - 24);
        }
      }

      setP1(np1);
      setP2(np2);

      // Check KO
      if (np1.hp <= 0 || np2.hp <= 0) {
        setWinnerRound(np1.hp <= 0 ? "Player 2" : "Player 1");
        setRoundOver(true);
      }
    },
    !paused && !roundOver && !matchWinner
  );

  // Round transitions
  const nextRound = () => {
    const wr = winnerRound;
    if (wr === "Player 1") setP1((s) => ({ ...s, rounds: s.rounds + 1 }));
    else if (wr === "Player 2") setP2((s) => ({ ...s, rounds: s.rounds + 1 }));

    const checkChampion = (r1, r2) => {
      if (r1 >= WIN_ROUNDS) return "Player 1";
      if (r2 >= WIN_ROUNDS) return "Player 2";
      return null;
    };

    setTimeout(() => {
      setP1((_) => createFighter(ARENA_WIDTH * 0.25, 1, "blue"));
      setP2((prev) => {
        const rounds = wr === "Player 2" ? prev.rounds + 1 : prev.rounds;
        const f = createFighter(ARENA_WIDTH * 0.75, -1, "amber");
        f.rounds = rounds;
        return f;
      });
      setP1((prev) => {
        const rounds = wr === "Player 1" ? (prev.rounds) : prev.rounds;
        return { ...prev, rounds };
      });
      setTimer(ROUND_TIME);
      setRoundOver(false);
      setWinnerRound(null);
      // After rounds updated above, check champion
      setMatchWinner((_) => {
        const r1 = wr === "Player 1" ? p1.rounds + 1 : p1.rounds;
        const r2 = wr === "Player 2" ? p2.rounds + 1 : p2.rounds;
        return checkChampion(r1, r2);
      });
    }, 200);
  };

  const resetMatch = () => {
    setP1(createFighter(ARENA_WIDTH * 0.25, 1, "blue"));
    setP2(createFighter(ARENA_WIDTH * 0.75, -1, "amber"));
    setTimer(ROUND_TIME);
    setRoundOver(false);
    setWinnerRound(null);
    setMatchWinner(null);
  };

  // Layout calculations responsive
  const scale = useMemo(() => {
    // Fit arena within viewport with margin
    const padding = 32;
    const w = Math.min(window.innerWidth - padding, 1100);
    const h = Math.min(window.innerHeight - 200, 620);
    const sx = w / ARENA_WIDTH;
    const sy = h / ARENA_HEIGHT;
    return clamp(Math.min(sx, sy), 0.6, 1.2);
  }, []);

  useEffect(() => {
    const onResize = () => {
      // trigger re-render by toggling a state we don't use
      setPaused((p) => p); // no-op; we keep it simple in this template environment
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const matchPoint = (p1.rounds === WIN_ROUNDS - 1 || p2.rounds === WIN_ROUNDS - 1) && !matchWinner;

  return (
    <div className="min-h-screen flex flex-col items-center pt-6 md:pt-10 px-3 md:px-6">
      {/* Header */}
      <div className="w-full max-w-6xl flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 shadow-sm grid place-content-center text-white font-bold">FA</div>
          <div>
            <div className="text-xl font-extrabold tracking-tight text-blue-700">Fighting Arena</div>
            <div className="text-xs text-gray-500">Ocean Professional</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="o-card px-3 py-2 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option>PvAI</option>
            <option>PvP</option>
          </select>
          {mode === "PvAI" && (
            <select
              className="o-card px-3 py-2 text-sm"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option>Easy</option>
              <option>Normal</option>
              <option>Hard</option>
            </select>
          )}
          <button className="o-btn-ghost" onClick={() => setShowControls((v) => !v)}>
            {showControls ? "Hide" : "Show"} Controls
          </button>
          <button className="o-btn-primary" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      {/* Arena */}
      <div className="w-full max-w-6xl o-card p-3 md:p-4">
        <TopHUD p1={p1} p2={p2} timer={Math.ceil(timer)} mode={mode} difficulty={difficulty} />
        <div className="relative overflow-hidden rounded-xl arena-gradient border border-blue-200">
          <div
            className="relative mx-auto"
            style={{
              width: ARENA_WIDTH * scale,
              height: ARENA_HEIGHT * scale,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {/* Backdrop elements */}
            <div className="absolute inset-x-0 bottom-0 h-24 floor-stripes" />
            <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-blue-50/60 to-transparent" />
            <div className="absolute left-4 top-6 w-28 h-6 bg-white/40 rounded-full blur" />
            <div className="absolute right-6 top-10 w-24 h-6 bg-white/40 rounded-full blur" />

            {/* Fighters */}
            <FighterSprite fighter={p1} isLeft tint="blue" isKO={p1.hp <= 0} />
            <FighterSprite fighter={p2} tint="amber" isKO={p2.hp <= 0} />

            {/* Overlays */}
            {roundOver && !matchWinner && (
              <GameOverOverlay
                winner={winnerRound}
                onNextRound={nextRound}
                onReset={resetMatch}
                matchPoint={matchPoint}
              />
            )}
            {matchWinner && <MatchVictory champion={matchWinner} onReset={resetMatch} />}
          </div>
        </div>

        {/* Controls help */}
        <div className="mt-4">
          <ControlsHelp visible={showControls} />
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-6xl mt-4 text-xs text-gray-500 flex items-center justify-between">
        <div>Tip: Specials pierce guard slightly. Blocking reduces damage by 65%.</div>
        <div className="text-blue-700">Theme: Ocean Professional</div>
      </div>
    </div>
  );
}

export default App;
