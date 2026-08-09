import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished Fish Eat Fish entry screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Fish Eat Fish — 海底寻宝大冒险<\/title>/i);
  assert.match(html, /FISH<\/em> EAT FISH/);
  assert.match(html, /选择你的鱼/);
  assert.match(html, /吃饼干 · 长大 · 找秘宝/);
  assert.match(html, /class="world-scroll"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("ships selectable fish, distinct skills, and moving reef gameplay", async () => {
  const [page, css, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type PlayerFishId = "tiger" \| "puffer" \| "dart"/);
  assert.match(page, /skill: "威慑"/);
  assert.match(page, /skill: "泡泡盾"/);
  assert.match(page, /skill: "疾游"/);
  assert.match(page, /frightenedUntil/);
  assert.match(page, /className="select-screen"/);
  assert.match(page, /className="world-scroll"/);
  assert.match(css, /@keyframes reef-scroll/);
  assert.match(css, /\.fish-art\.player-tiger/);
  assert.match(css, /\.fish-art\.player-puffer/);
  assert.match(css, /\.fish-art\.player-dart/);
  assert.match(css, /\.intimidation-wave/);
  assert.match(layout, /Fish Eat Fish — 海底寻宝大冒险/);
});

test("keeps mobile movement responsive from the first touch", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const neutralOceanInput = page.match(
    /if \(length < OCEAN_POINTER_DEAD_ZONE\) \{([\s\S]*?)\n    \}/,
  )?.[1];

  assert.match(page, /const JOYSTICK_MAX_TRAVEL_RATIO = 0\.22/);
  assert.match(page, /const TOUCH_RESPONSE_EXPONENT = 0\.62/);
  assert.match(page, /Math\.pow\(rawStrength, TOUCH_RESPONSE_EXPONENT\)/);
  assert.ok(neutralOceanInput, "the ocean pointer should have a neutral input zone");
  assert.match(neutralOceanInput, /inputRef\.current = \{ x: 0, y: 0 \}/);
  assert.doesNotMatch(
    neutralOceanInput,
    /releaseStick/,
    "a neutral first touch must stay active so a later drag can trigger movement",
  );
});
