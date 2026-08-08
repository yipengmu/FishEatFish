"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

type Stage = "menu" | "select" | "playing" | "paused" | "over" | "won";
type EntityKind = "cookie" | "fish" | "treasure";
type PlayerFishId = "tiger" | "puffer" | "dart";

type Entity = {
  id: number;
  kind: EntityKind;
  species?: "coral" | "lemon" | "puffer" | "shark";
  level: number;
  x: number;
  y: number;
  vx: number;
  size: number;
  phase: number;
  familiarAt: number;
  frightenedUntil?: number;
  immobilizedUntil?: number;
};

type Snapshot = {
  player: { x: number; y: number };
  entities: Entity[];
  score: number;
  level: number;
  seenSpecies: string[];
};

type CollectSound = "cookie" | "fish";

const LEVEL_STEPS = [0, 160, 380, 680, 900];
const PLAYER_SPEED = 16;
const WORLD_SPEED_SCALE = 0.72;

const FISH_CHOICES: Array<{
  id: PlayerFishId;
  name: string;
  title: string;
  badge: string;
  description: string;
  skill: string;
  skillIcon: string;
  skillDescription: string;
  cooldown: number;
  stats: { life: number; attack: number; speed: number };
}> = [
  {
    id: "tiger",
    name: "虎纹蝶鱼",
    title: "礁石小霸王",
    badge: "推荐",
    description: "勇敢又均衡，最适合第一次下海的探险家。",
    skill: "威慑",
    skillIcon: "⚡",
    skillDescription: "定住身边的鱼，让它们原地不动。",
    cooldown: 8,
    stats: { life: 520, attack: 105, speed: 3 },
  },
  {
    id: "puffer",
    name: "星斑河豚",
    title: "泡泡守护者",
    badge: "耐打",
    description: "圆滚滚但很可靠，危急时刻能保护自己。",
    skill: "泡泡盾",
    skillIcon: "◉",
    skillDescription: "撑起保护泡泡，短时间内不会被大鱼吃掉。",
    cooldown: 10,
    stats: { life: 680, attack: 78, speed: 2 },
  },
  {
    id: "dart",
    name: "蓝电刺尾鱼",
    title: "深海追风者",
    badge: "灵活",
    description: "速度最快，适合喜欢穿梭鱼群的熟练玩家。",
    skill: "疾游",
    skillIcon: "➤",
    skillDescription: "爆发出蓝色电光，短时间大幅提升游速。",
    cooldown: 6,
    stats: { life: 440, attack: 92, speed: 5 },
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function makeEntity(id: number, index: number, now: number): Entity {
  if (index < 5) {
    return {
      id,
      kind: "cookie",
      level: 0,
      x: 30 + Math.random() * 72,
      y: 16 + Math.random() * 70,
      vx: (-2.5 - Math.random() * 2) * WORLD_SPEED_SCALE,
      size: 32,
      phase: Math.random() * 6,
      familiarAt: now,
    };
  }

  const fishIndex = index - 5;
  const species: Entity["species"][] = [
    "coral",
    "coral",
    "lemon",
    "lemon",
    "puffer",
    "shark",
  ];
  const fishLevels = [1, 1, 2, 2, 3, 4];
  const level = fishLevels[fishIndex % fishLevels.length];

  return {
    id,
    kind: "fish",
    species: species[fishIndex % species.length],
    level,
    x: 44 + Math.random() * 68,
    y: 13 + Math.random() * 73,
    vx: (-3 - level * 0.65 - Math.random() * 1.8) * WORLD_SPEED_SCALE,
    size: 42 + level * 12,
    phase: Math.random() * 6,
    familiarAt: level === 1 ? now : now + 2200 + Math.random() * 1200,
  };
}

function Fish({
  species = "coral",
  player = false,
}: {
  species?: Entity["species"];
  player?: PlayerFishId | false;
}) {
  return (
    <span className={`fish-art ${player ? `player-${player}` : species}`} aria-hidden="true">
      <span className="fish-fin" />
      <span className="fish-stripe stripe-one" />
      <span className="fish-stripe stripe-two" />
      <span className="fish-mark mark-one" />
      <span className="fish-mark mark-two" />
      <span className="fish-eye" />
      <span className="fish-smile" />
    </span>
  );
}

function Treasure({ small = false }: { small?: boolean }) {
  return (
    <span className={`treasure-art ${small ? "small" : ""}`} aria-hidden="true">
      <span className="treasure-glow" />
      <span className="chest-lid" />
      <span className="chest-lock">★</span>
    </span>
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("menu");
  const [snapshot, setSnapshot] = useState<Snapshot>({
    player: { x: 24, y: 52 },
    entities: [],
    score: 0,
    level: 1,
    seenSpecies: ["coral"],
  });
  const [bestScore, setBestScore] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [guideVisible, setGuideVisible] = useState(false);
  const [levelFlash, setLevelFlash] = useState(0);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [shareUrl, setShareUrl] = useState("");
  const [selectedFish, setSelectedFish] = useState<PlayerFishId>("tiger");
  const [skillClock, setSkillClock] = useState(0);
  const [skillCooldownEnd, setSkillCooldownEnd] = useState(0);
  const [skillActiveUntil, setSkillActiveUntil] = useState(0);
  const [skillPulse, setSkillPulse] = useState(0);
  const [skillMessage, setSkillMessage] = useState("");

  const stageRef = useRef<Stage>(stage);
  const playerRef = useRef({ x: 24, y: 52 });
  const entitiesRef = useRef<Entity[]>([]);
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const inputRef = useRef({ x: 0, y: 0 });
  const seenRef = useRef(new Set<string>(["coral"]));
  const lastFrameRef = useRef(0);
  const nextIdRef = useRef(20);
  const treasureRef = useRef(false);
  const guideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const oceanRef = useRef<HTMLElement | null>(null);
  const activeOceanPointerRef = useRef<number | null>(null);
  const activeJoystickPointerRef = useRef<number | null>(null);
  const selectedFishRef = useRef<PlayerFishId>("tiger");
  const skillCooldownEndRef = useRef(0);
  const skillActiveUntilRef = useRef(0);
  const skillMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = Number(localStorage.getItem("fish-eat-fish-best") || 0);
      setBestScore(stored);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setShareUrl(window.location.href);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (stage !== "menu" || !shareUrl || !qrCanvasRef.current) return;

    QRCode.toCanvas(qrCanvasRef.current, shareUrl, {
      width: 152,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#07577d",
        light: "#ffffff",
      },
    });
  }, [shareUrl, stage]);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(() => {
    if (stage !== "playing") return;
    const timer = window.setInterval(() => setSkillClock(performance.now()), 100);
    return () => window.clearInterval(timer);
  }, [stage]);

  const playTone = useCallback(
    (frequency: number, duration = 0.08) => {
      if (!soundOn) return;
      try {
        const AudioCtx = window.AudioContext;
        const context = new AudioCtx();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.05, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + duration);
        oscillator.addEventListener("ended", () => void context.close());
      } catch {
        // Sound is optional; the game stays fully playable without it.
      }
    },
    [soundOn],
  );

  const playCollectSound = useCallback(
    (kind: CollectSound, level = 1) => {
      if (!soundOn) return;

      try {
        const AudioCtx = window.AudioContext;
        const context = new AudioCtx();
        const now = context.currentTime;
        const master = context.createGain();
        master.gain.value = 0.65;
        master.connect(context.destination);

        if (kind === "cookie") {
          const crunch = context.createBufferSource();
          const buffer = context.createBuffer(1, context.sampleRate * 0.055, context.sampleRate);
          const noise = buffer.getChannelData(0);
          for (let index = 0; index < noise.length; index += 1) {
            noise[index] = (Math.random() * 2 - 1) * (1 - index / noise.length);
          }
          crunch.buffer = buffer;

          const crunchFilter = context.createBiquadFilter();
          crunchFilter.type = "highpass";
          crunchFilter.frequency.value = 1700;
          const crunchGain = context.createGain();
          crunchGain.gain.setValueAtTime(0.18, now);
          crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
          crunch.connect(crunchFilter);
          crunchFilter.connect(crunchGain);
          crunchGain.connect(master);
          crunch.start(now);
          crunch.stop(now + 0.055);

          const chime = context.createOscillator();
          const chimeGain = context.createGain();
          chime.type = "triangle";
          chime.frequency.setValueAtTime(620, now);
          chime.frequency.exponentialRampToValueAtTime(420, now + 0.12);
          chimeGain.gain.setValueAtTime(0.13, now);
          chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          chime.connect(chimeGain);
          chimeGain.connect(master);
          chime.start(now);
          chime.stop(now + 0.12);
        } else {
          const pop = context.createOscillator();
          const popGain = context.createGain();
          pop.type = "sine";
          pop.frequency.setValueAtTime(360 + level * 25, now);
          pop.frequency.exponentialRampToValueAtTime(760 + level * 45, now + 0.16);
          popGain.gain.setValueAtTime(0.001, now);
          popGain.gain.exponentialRampToValueAtTime(0.2, now + 0.018);
          popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
          pop.connect(popGain);
          popGain.connect(master);
          pop.start(now);
          pop.stop(now + 0.16);

          const bubble = context.createOscillator();
          const bubbleGain = context.createGain();
          bubble.type = "triangle";
          bubble.frequency.setValueAtTime(820 + level * 35, now + 0.045);
          bubble.frequency.exponentialRampToValueAtTime(1120 + level * 45, now + 0.19);
          bubbleGain.gain.setValueAtTime(0.001, now);
          bubbleGain.gain.setValueAtTime(0.11, now + 0.045);
          bubbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
          bubble.connect(bubbleGain);
          bubbleGain.connect(master);
          bubble.start(now + 0.045);
          bubble.stop(now + 0.19);
        }

        window.setTimeout(() => void context.close(), kind === "cookie" ? 220 : 280);
      } catch {
        // Sound is optional; the game stays fully playable without it.
      }
    },
    [soundOn],
  );

  const playBackgroundMusic = useCallback(
    (restart = false) => {
      if (!soundOn) return;
      const music = musicRef.current;
      if (!music) return;

      music.volume = 0.32;
      music.loop = true;
      if (restart) music.currentTime = 0;
      void music.play().catch(() => {
        // Browsers may block autoplay if the start event was interrupted.
      });
    },
    [soundOn],
  );

  const pauseBackgroundMusic = useCallback((reset = false) => {
    const music = musicRef.current;
    if (!music) return;

    music.pause();
    if (reset) music.currentTime = 0;
  }, []);

  const requestFullscreen = useCallback(() => {
    const element = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    const request = element.requestFullscreen?.bind(element) ??
      element.webkitRequestFullscreen?.bind(element);

    if (!request || document.fullscreenElement) return;

    try {
      const result = request();
      if (result && "catch" in result) void result.catch(() => {});
    } catch {
      // Fullscreen is best-effort; mobile browsers differ in support.
    }
  }, []);

  const syncSnapshot = useCallback(() => {
    setSnapshot({
      player: { ...playerRef.current },
      entities: [...entitiesRef.current],
      score: scoreRef.current,
      level: levelRef.current,
      seenSpecies: Array.from(seenRef.current),
    });
  }, []);

  const finishGame = useCallback(
    (result: "over" | "won") => {
      const finalScore = result === "won" ? scoreRef.current + 500 : scoreRef.current;
      scoreRef.current = finalScore;
      const nextBest = Math.max(bestScore, finalScore);
      setBestScore(nextBest);
      localStorage.setItem("fish-eat-fish-best", String(nextBest));
      stageRef.current = result;
      setStage(result);
      playTone(result === "won" ? 880 : 140, result === "won" ? 0.45 : 0.25);
      syncSnapshot();
    },
    [bestScore, playTone, syncSnapshot],
  );

  const resetGame = useCallback(() => {
    requestFullscreen();
    const now = performance.now();
    playerRef.current = { x: 24, y: 52 };
    scoreRef.current = 0;
    levelRef.current = 1;
    seenRef.current = new Set(["coral"]);
    treasureRef.current = false;
    selectedFishRef.current = selectedFish;
    skillCooldownEndRef.current = 0;
    skillActiveUntilRef.current = 0;
    nextIdRef.current = 20;
    entitiesRef.current = Array.from({ length: 11 }, (_, index) =>
      makeEntity(index + 1, index, now),
    );
    inputRef.current = { x: 0, y: 0 };
    setStick({ x: 0, y: 0 });
    setLevelFlash(0);
    setSkillClock(performance.now());
    setSkillCooldownEnd(0);
    setSkillActiveUntil(0);
    setSkillPulse(0);
    setSkillMessage("");
    setGuideVisible(true);
    if (guideTimerRef.current) clearTimeout(guideTimerRef.current);
    guideTimerRef.current = setTimeout(() => setGuideVisible(false), 5200);
    lastFrameRef.current = performance.now();
    stageRef.current = "playing";
    setStage("playing");
    syncSnapshot();
    playBackgroundMusic(true);
    playTone(520, 0.12);
  }, [playBackgroundMusic, playTone, requestFullscreen, selectedFish, syncSnapshot]);

  const activateSkill = useCallback(() => {
    if (stageRef.current !== "playing") return;
    const now = performance.now();
    if (now < skillCooldownEndRef.current) return;

    const fish = FISH_CHOICES.find((item) => item.id === selectedFishRef.current) ?? FISH_CHOICES[0];
    skillCooldownEndRef.current = now + fish.cooldown * 1000;
    setSkillCooldownEnd(skillCooldownEndRef.current);
    setSkillClock(now);
    setSkillPulse((value) => value + 1);
    setSkillMessage(`${fish.skill}！`);
    if (skillMessageTimerRef.current) clearTimeout(skillMessageTimerRef.current);
    skillMessageTimerRef.current = setTimeout(() => setSkillMessage(""), 1300);

    if (fish.id === "tiger") {
      entitiesRef.current = entitiesRef.current.map((entity) => {
        if (entity.kind !== "fish") return entity;
        const distance = Math.hypot(
          playerRef.current.x - entity.x,
          playerRef.current.y - entity.y,
        );
        return distance <= 34
          ? { ...entity, immobilizedUntil: now + 2500, frightenedUntil: undefined, vx: 0 }
          : entity;
      });
      playTone(170, 0.28);
    } else if (fish.id === "puffer") {
      skillActiveUntilRef.current = now + 3500;
      setSkillActiveUntil(skillActiveUntilRef.current);
      playTone(720, 0.22);
    } else {
      skillActiveUntilRef.current = now + 2600;
      setSkillActiveUntil(skillActiveUntilRef.current);
      playTone(1050, 0.18);
    }
    syncSnapshot();
  }, [playTone, syncSnapshot]);

  useEffect(() => {
    if (stage === "playing" && soundOn) {
      playBackgroundMusic();
      return;
    }

    pauseBackgroundMusic(stage !== "paused");
  }, [pauseBackgroundMusic, playBackgroundMusic, soundOn, stage]);

  useEffect(() => {
    let animationId = 0;

    const frame = (now: number) => {
      animationId = requestAnimationFrame(frame);
      if (stageRef.current !== "playing") {
        lastFrameRef.current = now;
        return;
      }

      const dt = Math.min(0.035, (now - lastFrameRef.current) / 1000 || 0);
      lastFrameRef.current = now;
      const input = inputRef.current;
      const speedBoost =
        selectedFishRef.current === "dart" && now < skillActiveUntilRef.current ? 1.85 : 1;
      playerRef.current.x = clamp(playerRef.current.x + input.x * PLAYER_SPEED * speedBoost * dt, 6, 94);
      playerRef.current.y = clamp(playerRef.current.y + input.y * PLAYER_SPEED * speedBoost * dt, 11, 89);

      let collectedScore = 0;
      let eaten = false;
      let won = false;
      const player = playerRef.current;

      const nextEntities: Entity[] = [];
      for (const entity of entitiesRef.current) {
        const immobilized = now < (entity.immobilizedUntil ?? 0);
        let next = {
          ...entity,
          x: immobilized ? entity.x : entity.x + entity.vx * dt,
          y: immobilized ? entity.y : entity.y + Math.sin(now / 680 + entity.phase) * dt * 1.8,
        };

        if (!immobilized && next.kind === "fish" && next.species) {
          if (now >= next.familiarAt) seenRef.current.add(next.species);
          const unknown = !seenRef.current.has(next.species);
          const dangerous = next.level > levelRef.current || unknown;
          const frightened = now < (next.frightenedUntil ?? 0);
          const dx = player.x - next.x;
          const dy = player.y - next.y;
          const distance = Math.hypot(dx, dy);
          if (frightened && distance > 0.1) {
            const retreat = 12 * WORLD_SPEED_SCALE;
            next.x -= (dx / distance) * retreat * dt;
            next.y -= (dy / distance) * retreat * dt;
          } else if (dangerous && distance < 38 && distance > 0.1) {
            const chase = (unknown ? 3.5 : 5 + next.level) * WORLD_SPEED_SCALE;
            next.x += (dx / distance) * chase * dt;
            next.y += (dy / distance) * chase * dt;
          }
        }

        if (next.x < -10) {
          next = {
            ...next,
            x: 104 + Math.random() * 16,
            y: 14 + Math.random() * 72,
            familiarAt:
              next.kind === "fish" && next.species !== "coral"
                ? now + 1800 + Math.random() * 1600
                : now,
          };
        }

        const dx = player.x - next.x;
        const dy = player.y - next.y;
        const distance = Math.hypot(dx, dy);
        const hitRadius = next.kind === "cookie" ? 4.2 : next.kind === "treasure" ? 7 : 4.5 + next.level;

        if (distance < hitRadius) {
          if (next.kind === "cookie") {
            collectedScore += 30;
            playCollectSound("cookie");
            continue;
          }
          if (next.kind === "treasure") {
            won = true;
            continue;
          }
          if (next.kind === "fish" && next.species) {
            const dangerous =
              next.level > levelRef.current || !seenRef.current.has(next.species);
            const frightened = now < (next.frightenedUntil ?? 0);
            const immobilized = now < (next.immobilizedUntil ?? 0);
            const shielded =
              selectedFishRef.current === "puffer" && now < skillActiveUntilRef.current;
            if (dangerous && !frightened && !shielded) {
              if (immobilized) {
                nextEntities.push(next);
                continue;
              }
              eaten = true;
              break;
            }
            if (dangerous && !immobilized) {
              nextEntities.push({ ...next, x: next.x + 9, vx: Math.abs(next.vx) + 3 });
              playTone(540, 0.08);
              continue;
            }
            collectedScore += 45 + next.level * 35;
            playCollectSound("fish", next.level);
            continue;
          }
        }

        nextEntities.push(next);
      }

      if (eaten) {
        entitiesRef.current = nextEntities;
        finishGame("over");
        return;
      }

      if (won) {
        entitiesRef.current = nextEntities;
        finishGame("won");
        return;
      }

      if (collectedScore > 0) {
        scoreRef.current += collectedScore;
        while (
          levelRef.current < 4 &&
          scoreRef.current >= LEVEL_STEPS[levelRef.current]
        ) {
          levelRef.current += 1;
          setLevelFlash(levelRef.current);
          if (levelTimerRef.current) clearTimeout(levelTimerRef.current);
          levelTimerRef.current = setTimeout(() => setLevelFlash(0), 1700);
          playTone(980, 0.25);
        }
      }

      const missingCookies = 5 - nextEntities.filter((item) => item.kind === "cookie").length;
      for (let i = 0; i < missingCookies; i += 1) {
        nextEntities.push(makeEntity(nextIdRef.current++, i, now));
      }
      const missingFish = 6 - nextEntities.filter((item) => item.kind === "fish").length;
      for (let i = 0; i < missingFish; i += 1) {
        nextEntities.push(makeEntity(nextIdRef.current++, 5 + (nextIdRef.current % 6), now));
      }

      if (scoreRef.current >= 900 && !treasureRef.current) {
        treasureRef.current = true;
        nextEntities.push({
          id: nextIdRef.current++,
          kind: "treasure",
          level: 0,
          x: 92,
          y: 49,
          vx: -1.2 * WORLD_SPEED_SCALE,
          size: 82,
          phase: 0,
          familiarAt: now,
        });
      }

      entitiesRef.current = nextEntities;
      syncSnapshot();
    };

    animationId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(animationId);
  }, [finishGame, playCollectSound, playTone, syncSnapshot]);

  useEffect(() => {
    const keyState = new Set<string>();
    const updateKeys = () => {
      const x = Number(keyState.has("ArrowRight") || keyState.has("d")) -
        Number(keyState.has("ArrowLeft") || keyState.has("a"));
      const y = Number(keyState.has("ArrowDown") || keyState.has("s")) -
        Number(keyState.has("ArrowUp") || keyState.has("w"));
      const length = Math.hypot(x, y) || 1;
      inputRef.current = { x: x / length, y: y / length };
      setStick({ x: x / length, y: y / length });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(event.key)) {
        event.preventDefault();
        keyState.add(event.key);
        updateKeys();
      }
      if (event.key === " " && stageRef.current === "playing") {
        setStage("paused");
        stageRef.current = "paused";
      }
      if (["e", "E", "Enter"].includes(event.key) && stageRef.current === "playing") {
        event.preventDefault();
        activateSkill();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keyState.delete(event.key);
      updateKeys();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [activateSkill]);

  useEffect(
    () => () => {
      if (guideTimerRef.current) clearTimeout(guideTimerRef.current);
      if (levelTimerRef.current) clearTimeout(levelTimerRef.current);
      if (skillMessageTimerRef.current) clearTimeout(skillMessageTimerRef.current);
    },
    [],
  );

  const progress = useMemo(() => {
    const level = snapshot.level;
    if (level >= 4) return clamp((snapshot.score - 680) / (900 - 680), 0, 1);
    return clamp(
      (snapshot.score - LEVEL_STEPS[level - 1]) /
        (LEVEL_STEPS[level] - LEVEL_STEPS[level - 1]),
      0,
      1,
    );
  }, [snapshot.level, snapshot.score]);

  const seenSpecies = useMemo(
    () => new Set(snapshot.seenSpecies),
    [snapshot.seenSpecies],
  );

  const selectedFishInfo = useMemo(
    () => FISH_CHOICES.find((fish) => fish.id === selectedFish) ?? FISH_CHOICES[0],
    [selectedFish],
  );
  const cooldownLeft = Math.max(0, (skillCooldownEnd - skillClock) / 1000);
  const skillActive = skillClock < skillActiveUntil;

  const updateStick = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.29;
    const length = Math.hypot(x, y);
    const scale = length > max ? max / length : 1;
    const next = { x: (x * scale) / max, y: (y * scale) / max };
    inputRef.current = next;
    setStick(next);
  };

  const releaseStick = () => {
    activeOceanPointerRef.current = null;
    activeJoystickPointerRef.current = null;
    inputRef.current = { x: 0, y: 0 };
    setStick({ x: 0, y: 0 });
  };

  const beginJoystickPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (stageRef.current !== "playing") return;
    event.preventDefault();
    event.stopPropagation();
    activeJoystickPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateStick(event);
  };

  const moveJoystickPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeJoystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    // Keep accepting movement for the active touch even if a mobile browser
    // reports pointer capture as lost while the finger crosses the knob edge.
    updateStick(event);
  };

  const endJoystickPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (activeJoystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    releaseStick();
  };

  const updateOceanPointer = (event: React.PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-game-control]")) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - rect.left) / rect.width) * 100;
    const pointerY = ((event.clientY - rect.top) / rect.height) * 100;
    const dx = pointerX - playerRef.current.x;
    const dy = pointerY - playerRef.current.y;
    const length = Math.hypot(dx, dy);

    if (length < 2) {
      releaseStick();
      return;
    }

    const next = { x: dx / length, y: dy / length };
    inputRef.current = next;
    setStick(next);
  };

  const togglePause = () => {
    if (stageRef.current === "playing") {
      stageRef.current = "paused";
      setStage("paused");
      releaseStick();
    } else if (stageRef.current === "paused") {
      lastFrameRef.current = performance.now();
      stageRef.current = "playing";
      setStage("playing");
      requestFullscreen();
    }
  };

  return (
    <main className="game-shell">
      <audio ref={musicRef} src="/audio/junior-conquerer.mp3" preload="auto" loop />
      <section
        ref={oceanRef}
        className={`ocean stage-${stage}`}
        aria-label="Fish Eat Fish 游戏区"
        onPointerDown={(event) => {
          if (stageRef.current !== "playing") return;
          const target = event.target as HTMLElement;
          if (target.closest("[data-game-control]")) return;
          activeOceanPointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateOceanPointer(event);
        }}
        onPointerMove={(event) => {
          if (
            stageRef.current === "playing" &&
            activeOceanPointerRef.current === event.pointerId
          ) {
            updateOceanPointer(event);
          }
        }}
        onPointerUp={(event) => {
          if (activeOceanPointerRef.current !== event.pointerId) return;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          releaseStick();
        }}
        onPointerCancel={releaseStick}
      >
        <div className="world-scroll" aria-hidden="true">
          <div className="parallax-layer parallax-far" />
          <div className="parallax-layer parallax-mid" />
          <div className="parallax-layer parallax-near" />
        </div>
        <div className="sun-rays" />
        <div className="distant-island island-one" />
        <div className="distant-island island-two" />
        <div className="sea-floor">
          <span className="coral coral-one" />
          <span className="coral coral-two" />
          <span className="seaweed seaweed-one" />
          <span className="seaweed seaweed-two" />
          <span className="rock rock-one" />
          <span className="rock rock-two" />
        </div>
        <div className="bubble-field" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <i key={index} style={{ "--bubble-index": index } as React.CSSProperties} />
          ))}
        </div>

        {stage !== "menu" && (
          <>
            <header className="hud" data-game-control>
              <div className="hud-cluster left-hud">
                <button type="button" className="round-button pause-button" onClick={togglePause} aria-label="暂停游戏">
                  <span aria-hidden="true">Ⅱ</span>
                </button>
                <button
                  type="button"
                  className="round-button sound-button"
                  onClick={() => setSoundOn((value) => !value)}
                  aria-label={soundOn ? "关闭声音" : "打开声音"}
                >
                  <span aria-hidden="true">{soundOn ? "♪" : "×"}</span>
                </button>
              </div>

              <div className="score-card">
                <div className="score-line">
                  <span>得分</span>
                  <strong>{snapshot.score}</strong>
                </div>
                <div className="progress-track" aria-label={`秘宝进度 ${Math.round((snapshot.score / 900) * 100)}%`}>
                  <span style={{ width: `${Math.min(100, (snapshot.score / 900) * 100)}%` }} />
                  <Treasure small />
                </div>
              </div>

              <div className="level-pill">
                <span>LV.</span>
                <strong>{snapshot.level}</strong>
              </div>
            </header>

            <div
              className="player-wrap"
              style={{ left: `${snapshot.player.x}%`, top: `${snapshot.player.y}%` }}
            >
              <span className="player-shadow" />
              {skillPulse > 0 && selectedFish === "tiger" && (
                <span key={skillPulse} className="intimidation-wave" />
              )}
              {skillActive && selectedFish === "puffer" && <span className="bubble-shield" />}
              {skillActive && selectedFish === "dart" && <span className="speed-trail" />}
              <Fish player={selectedFish} />
              <div className="player-level">
                <span>LV.{snapshot.level}</span>
                <i><b style={{ width: `${progress * 100}%` }} /></i>
              </div>
            </div>

            {snapshot.entities.map((entity) => {
              const unknown =
                entity.kind === "fish" &&
                entity.species &&
                !seenSpecies.has(entity.species);
              const dangerous =
                entity.kind === "fish" && (entity.level > snapshot.level || unknown);
              const frightened =
                entity.kind === "fish" && skillClock < (entity.frightenedUntil ?? 0);
              const immobilized =
                entity.kind === "fish" && skillClock < (entity.immobilizedUntil ?? 0);
              return (
                <div
                  key={entity.id}
                  className={`entity ${entity.kind} ${dangerous ? "dangerous" : "safe"} ${frightened ? "frightened" : ""} ${immobilized ? "immobilized" : ""}`}
                  style={{
                    left: `${entity.x}%`,
                    top: `${entity.y}%`,
                    width: entity.kind === "cookie" ? 34 : entity.kind === "treasure" ? 90 : entity.size,
                    height: entity.kind === "cookie" ? 34 : entity.kind === "treasure" ? 78 : entity.size * 0.64,
                  }}
                >
                  {entity.kind === "cookie" && <span className="cookie-art">●</span>}
                  {entity.kind === "treasure" && <Treasure />}
                  {entity.kind === "fish" && (
                    <>
                      <div className="entity-badge">
                        {immobilized ? "定住！" : frightened ? "怕怕！" : unknown ? "? 陌生" : dangerous ? `! LV.${entity.level}` : `LV.${entity.level}`}
                      </div>
                      <Fish species={entity.species} />
                    </>
                  )}
                </div>
              );
            })}

            {guideVisible && stage === "playing" && (
              <div className="guide-card">
                <span className="guide-spark">✦</span>
                <div>
                  <strong>先吃饼干和小鱼</strong>
                  <small>看到红色标记，快快躲开！</small>
                </div>
              </div>
            )}

            {levelFlash > 0 && (
              <div className="level-up" role="status">
                <span>LEVEL UP!</span>
                <strong>变成 LV.{levelFlash} 啦！</strong>
              </div>
            )}

            {skillMessage && <div className="skill-message" role="status">{skillMessage}</div>}

            {stage === "playing" && (
              <div className="controls" data-game-control>
                <div className="control-caption">拖动游泳</div>
                <div
                  className="joystick"
                  onPointerDown={beginJoystickPointer}
                  onPointerMove={moveJoystickPointer}
                  onPointerUp={endJoystickPointer}
                  onPointerCancel={endJoystickPointer}
                  onLostPointerCapture={(event) => {
                    if (activeJoystickPointerRef.current === event.pointerId) releaseStick();
                  }}
                  aria-label="方向控制摇杆"
                  role="application"
                  data-game-control
                >
                  <div
                    className="joystick-knob"
                    style={{ transform: `translate(${stick.x * 28}px, ${stick.y * 28}px)` }}
                  >
                    <span>➤</span>
                  </div>
                </div>
                <div className="danger-key">
                  <span className="danger-sample">!</span>
                  <small>危险</small>
                </div>
              </div>
            )}

            {stage === "playing" && (
              <button
                type="button"
                className={`skill-button skill-${selectedFish} ${cooldownLeft > 0 ? "cooling" : "ready"}`}
                onClick={activateSkill}
                disabled={cooldownLeft > 0}
                data-game-control
                aria-label={`${selectedFishInfo.skill}${cooldownLeft > 0 ? `，冷却 ${cooldownLeft.toFixed(1)} 秒` : "，可以使用"}`}
              >
                <span className="skill-button-icon">{selectedFishInfo.skillIcon}</span>
                <strong>{cooldownLeft > 0 ? cooldownLeft.toFixed(1) : selectedFishInfo.skill}</strong>
                <small>{cooldownLeft > 0 ? "冷却中" : "点击释放"}</small>
              </button>
            )}
          </>
        )}

        {stage === "menu" && (
          <div className="menu-screen">
            <div className="menu-fish school-one"><Fish species="lemon" /></div>
            <div className="menu-fish school-two"><Fish species="coral" /></div>
            <div className="hero-fish"><Fish player="tiger" /></div>
            <div className="brand-lockup">
              <span className="eyebrow">OCEAN ADVENTURE</span>
              <h1><em>FISH</em> EAT FISH</h1>
              <p>小鱼吃大餐 · 一起找秘宝</p>
            </div>
            <div className="creator-credit" aria-label="作者穆宁">
              <span className="creator-avatar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/avatars/muning.png" alt="穆宁的头像" />
              </span>
              <span className="creator-copy">
                <small>小小创作者</small>
                <strong>穆宁</strong>
              </span>
              <span className="creator-spark" aria-hidden="true">✦</span>
            </div>
            <div className="pc-qr-card" aria-label="手机扫码进入游戏">
              <div className="pc-qr-main">
                <div className="pc-qr-copy">
                  <span>手机一起玩</span>
                  <strong>扫码进入</strong>
                  <small>用手机打开海底冒险</small>
                </div>
                <div className="pc-qr-frame">
                  <canvas
                    ref={qrCanvasRef}
                    role="img"
                    aria-label={shareUrl ? `扫码打开 ${shareUrl}` : "手机扫码进入游戏"}
                  />
                </div>
              </div>
              <span className="pc-qr-url">{shareUrl || "正在生成访问地址…"}</span>
            </div>
            <div className="mission-card">
              <span className="mission-icon">★</span>
              <div>
                <small>今日冒险</small>
                <strong>吃饼干 · 长大 · 找秘宝</strong>
              </div>
            </div>
            <button type="button" className="start-button" onClick={() => setStage("select")}>
              <span>选择你的鱼</span>
              <b>➤</b>
            </button>
            <div className="menu-footer">
              <span>最高分 {bestScore}</span>
              <span>拖动摇杆控制方向</span>
            </div>
          </div>
        )}

        {stage === "select" && (
          <div className="select-screen">
            <header className="select-header">
              <button type="button" className="select-back" onClick={() => setStage("menu")} aria-label="返回首页">‹</button>
              <div>
                <span>CHOOSE YOUR FISH</span>
                <h1>选择你的海底伙伴</h1>
                <p>每条鱼都有独一无二的能力</p>
              </div>
              <span className="select-count">已解锁 <strong>3</strong>/3</span>
            </header>

            <div className="fish-select-layout">
              <section className="fish-showcase" aria-live="polite">
                <span className="showcase-badge">{selectedFishInfo.badge}</span>
                <span className="fish-number">NO. 00{FISH_CHOICES.findIndex((fish) => fish.id === selectedFish) + 1}</span>
                <div className={`showcase-glow glow-${selectedFish}`} />
                <div className="showcase-fish"><Fish player={selectedFish} /></div>
                <div className="showcase-name">
                  <small>{selectedFishInfo.title}</small>
                  <strong>{selectedFishInfo.name}</strong>
                </div>
              </section>

              <aside className="fish-profile">
                <div className="profile-title">
                  <div>
                    <span>FISH PROFILE</span>
                    <h2>{selectedFishInfo.name}</h2>
                  </div>
                  <b>LV.1</b>
                </div>
                <div className="stat-list">
                  <div><span>♥</span><small>生命</small><i><b style={{ width: `${Math.min(100, selectedFishInfo.stats.life / 7)}%` }} /></i><strong>{selectedFishInfo.stats.life}</strong></div>
                  <div><span>✦</span><small>攻击</small><i><b style={{ width: `${selectedFishInfo.stats.attack / 1.2}%` }} /></i><strong>{selectedFishInfo.stats.attack}</strong></div>
                  <div><span>➤</span><small>速度</small><i><b style={{ width: `${selectedFishInfo.stats.speed * 20}%` }} /></i><strong>{selectedFishInfo.stats.speed}/5</strong></div>
                </div>
                <div className="skill-card">
                  <span className={`skill-emblem emblem-${selectedFish}`}>{selectedFishInfo.skillIcon}</span>
                  <div><small>专属技能</small><strong>{selectedFishInfo.skill}</strong><p>{selectedFishInfo.skillDescription}</p></div>
                  <span className="cooldown-label">{selectedFishInfo.cooldown}s</span>
                </div>
                <p className="fish-description">{selectedFishInfo.description}</p>
              </aside>
            </div>

            <nav className="fish-roster" aria-label="可选择的鱼">
              {FISH_CHOICES.map((fish) => (
                <button
                  type="button"
                  key={fish.id}
                  className={selectedFish === fish.id ? "selected" : ""}
                  onClick={() => setSelectedFish(fish.id)}
                  aria-pressed={selectedFish === fish.id}
                >
                  <span className="roster-fish"><Fish player={fish.id} /></span>
                  <span>{fish.name}</span>
                  <small>{fish.skill}</small>
                </button>
              ))}
            </nav>

            <button type="button" className="launch-button" onClick={resetGame}>
              <span>带上 {selectedFishInfo.name}</span>
              <strong>开始冒险</strong>
              <b>➤</b>
            </button>
          </div>
        )}

        {stage === "paused" && (
          <div className="modal-backdrop">
            <div className="game-modal pause-modal">
              <span className="modal-kicker">休息一下</span>
              <h2>游戏暂停</h2>
              <p>小丑鱼正在泡泡里等你。</p>
              <button type="button" className="primary-modal-button" onClick={togglePause}>继续冒险</button>
              <button type="button" className="text-button" onClick={() => setStage("menu")}>回到首页</button>
            </div>
          </div>
        )}

        {stage === "over" && (
          <div className="modal-backdrop">
            <div className="game-modal over-modal">
              <span className="modal-fish-icon"><Fish player={selectedFish} /></span>
              <span className="modal-kicker coral-text">别灰心！</span>
              <h2>这条鱼太大啦</h2>
              <p>看到红色等级和问号时，要先绕开它。</p>
              <div className="result-score"><small>本次得分</small><strong>{snapshot.score}</strong></div>
              <button type="button" className="primary-modal-button" onClick={resetGame}>再试一次</button>
              <button type="button" className="text-button" onClick={() => setStage("menu")}>回到首页</button>
            </div>
          </div>
        )}

        {stage === "won" && (
          <div className="modal-backdrop treasure-backdrop">
            <div className="game-modal win-modal">
              <Treasure />
              <span className="modal-kicker">SUPER TREASURE</span>
              <h2>发现大秘宝！</h2>
              <p>勇敢的小丑鱼完成了今天的海底冒险。</p>
              <div className="result-score"><small>宝藏总分</small><strong>{snapshot.score}</strong></div>
              <button type="button" className="primary-modal-button" onClick={resetGame}>继续寻宝</button>
              <button type="button" className="text-button" onClick={() => setStage("menu")}>回到首页</button>
            </div>
          </div>
        )}

        <div className="rotate-notice">
          <span>↻</span>
          <strong>转动手机，横屏冒险</strong>
          <small>大海横着看更精彩</small>
        </div>
      </section>
    </main>
  );
}
