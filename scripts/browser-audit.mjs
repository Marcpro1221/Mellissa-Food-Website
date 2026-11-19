import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const siteUrl = process.env.AUDIT_URL || "http://127.0.0.1:5173/";
const debuggingPort = Number(process.env.CHROME_DEBUG_PORT || 9333);
const browserCandidates = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser"
].filter(Boolean);
const browserPath = browserCandidates.find(existsSync);

if (!browserPath) throw new Error("Chrome or Chromium was not found. Set CHROME_PATH and retry.");

const viewports = [
  { name: "laptop", width: 1440, height: 1000, expectedColumns: 3 },
  { name: "tablet", width: 768, height: 1024, expectedColumns: 2 },
  { name: "phone", width: 390, height: 844, expectedColumns: 1 }
];

const profileDirectory = await mkdtemp(path.join(tmpdir(), "filipinodish-chrome-"));
const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  "--disable-background-mode",
  `--remote-debugging-port=${debuggingPort}`,
  `--user-data-dir=${profileDirectory}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function pollJson(url, attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(150);
  }
  throw new Error(`Browser debugging endpoint did not become ready: ${url}`);
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.sequence = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  send(method, params = {}) {
    const id = ++this.sequence;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => {
      const listener = (params) => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== listener));
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
    });
  }

  on(method, listener) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }
}

let client;
const browserErrors = [];

async function evaluate(expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Browser evaluation failed");
  return result.result.value;
}

try {
  await pollJson(`http://127.0.0.1:${debuggingPort}/json/version`);
  const targets = await pollJson(`http://127.0.0.1:${debuggingPort}/json/list`);
  const pageTarget = targets.find((target) => target.type === "page");
  if (!pageTarget) throw new Error("Chrome did not expose a page target.");

  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
    client.send("Network.enable")
  ]);

  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    browserErrors.push(`JavaScript: ${exceptionDetails.text}`);
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry.level === "error") browserErrors.push(`Console: ${entry.text}`);
  });
  client.on("Network.loadingFailed", ({ errorText, canceled }) => {
    if (!canceled) browserErrors.push(`Network: ${errorText}`);
  });

  const results = [];
  for (const viewport of viewports) {
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width <= 560
    });
    const loaded = client.once("Page.loadEventFired");
    await client.send("Page.navigate", { url: siteUrl });
    await loaded;
    await evaluate(`(async () => {
      localStorage.removeItem("sabores-language");
      document.querySelector('[data-language="es"]')?.click();
      await document.fonts.ready;
      await new Promise((resolve) => setTimeout(resolve, 350));
      const cards = [...document.querySelectorAll(".recipe-card")];
      for (const card of cards) {
        card.scrollIntoView({ block: "center" });
        const image = card.querySelector("img");
        if (image && !image.complete) await new Promise((resolve) => {
          image.addEventListener("load", resolve, { once: true });
          image.addEventListener("error", resolve, { once: true });
        });
      }
      document.querySelector("#recipes").scrollIntoView({ block: "start" });
      await new Promise((resolve) => setTimeout(resolve, 250));
    })()`);

    const measurements = await evaluate(`(() => {
      const cards = [...document.querySelectorAll(".recipe-card")];
      const rows = [...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().x)))];
      const images = cards.map((card) => card.querySelector("img"));
      const ginataang = document.querySelector('[data-recipe-id="ginataang-mais"] img');
      const buko = document.querySelector('[data-recipe-id="buko-salad"] img');
      return {
        width: innerWidth,
        language: document.documentElement.lang,
        cards: cards.length,
        columns: rows.length,
        loadedImages: images.filter((image) => image.complete && image.naturalWidth > 0).length,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        distinctRequestedPhotos: Boolean(ginataang && buko && ginataang.src !== buko.src),
        title: document.querySelector("#recipes-heading")?.textContent.trim()
      };
    })()`);

    await evaluate(`document.querySelector(".recipe-card").click()`);
    await delay(150);
    const dialog = await evaluate(`(() => {
      const element = document.querySelector("#recipe-dialog");
      const englishButton = document.querySelector('[data-language="en"]');
      englishButton.click();
      const result = {
        open: element.open,
        fitsViewport: element.scrollWidth <= innerWidth + 1,
        englishToggle: document.documentElement.lang === "en" && document.querySelector("#dialog-title")?.textContent === "Chicken Adobo"
      };
      document.querySelector('[data-language="es"]').click();
      document.querySelector("[data-close-recipe]").click();
      return result;
    })()`);

    await delay(700);

    const screenshot = await client.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const screenshotPath = path.join(tmpdir(), `filipinodish-${viewport.name}.png`);
    await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));

    const checks = {
      exactViewport: measurements.width === viewport.width,
      spanishDefault: measurements.language === "es",
      allCards: measurements.cards === 24,
      correctColumns: measurements.columns === viewport.expectedColumns,
      allPhotosLoaded: measurements.loadedImages === 24,
      noOverflow: !measurements.horizontalOverflow,
      distinctRequestedPhotos: measurements.distinctRequestedPhotos,
      dialogOpen: dialog.open,
      dialogFits: dialog.fitsViewport,
      englishToggle: dialog.englishToggle
    };
    results.push({ viewport: viewport.name, size: `${viewport.width}x${viewport.height}`, checks, screenshotPath });
  }

  if (browserErrors.length) throw new Error(browserErrors.join("\n"));
  const failed = results.flatMap((result) => Object.entries(result.checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => `${result.viewport}: ${name}`));
  console.log(JSON.stringify(results, null, 2));
  if (failed.length) throw new Error(`Responsive browser audit failed:\n${failed.join("\n")}`);
} finally {
  try {
    if (client) {
      client.send("Browser.close").catch(() => {});
      await delay(250);
    }
  } catch {
    browser.kill();
  }
  if (browser.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => browser.once("exit", resolve)),
      delay(3000)
    ]);
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await rm(profileDirectory, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 });
      break;
    } catch (error) {
      if (attempt === 3) console.warn(`Could not remove temporary browser profile: ${error.message}`);
      else await delay(350);
    }
  }
}

