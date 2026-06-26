const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const APP_DIR = app.getPath("userData");
const CONFIG_PATH = path.join(APP_DIR, "app-config.json");
const USER_DATA_PATH = path.join(APP_DIR, "user-data.json");
const GENERATED_DIR = path.join(APP_DIR, "generated");
const MODEL_NAME = "gpt-image-2";
const BASE_URL = "https://api.openai.com/v1";
const ENDPOINT_MODE = "edits";
const PROVIDER_MODE = "local";
const SIDEBAR_WIDTH = 392;
const SIDEBAR_HEIGHT = 760;
const PET_WINDOW_SIZE = 240;

let petWindow;
let sidebarWindow;
let mainWindow;

function formatDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getDefaultPetPreferences() {
  return {
    styleMode: "chibi",
    interactionLevel: "strong",
    idleBubbleFrequency: "normal",
    autoBlink: true,
    autoNap: true
  };
}

function getDefaultTasks() {
  const timestamp = new Date().toISOString();
  return [
    { id: makeId("task"), title: "Plan today", createdAt: timestamp, completed: false, completedAt: null },
    { id: makeId("task"), title: "Drink water", createdAt: timestamp, completed: false, completedAt: null },
    { id: makeId("task"), title: "Finish one small win", createdAt: timestamp, completed: false, completedAt: null }
  ];
}

function getDefaultUserData() {
  const today = formatDateKey();
  return {
    petProfile: {
      name: "Mochi",
      mood: "Curious",
      bubbleText: "We have time. Let's make today cute and useful.",
      sourceImagePath: "",
      basePetRenderPath: "",
      currentPetImagePath: "",
      currentCompositeImagePath: "",
      currentStatus: "idle",
      interactionState: "idle",
      motionState: "idle",
      expressionOverlayState: "smile",
      reactionTick: 0,
      lastInteractionEvent: "boot",
      equippedItemIds: []
    },
    rewardLibrary: [],
    outfitSets: [],
    dailyTasksByDate: { [today]: getDefaultTasks() },
    dailyRewardSelectionsByDate: {
      [today]: { date: today, targetType: null, targetId: null, settled: false, eligible: false }
    },
    currencyAccount: { balance: 24, totalEarned: 24, lastSettlement: null }
  };
}

function normalizeProviderMode(providerMode) {
  if (["remote-openai-images", "remote-chat-compat", "local"].includes(providerMode)) {
    return providerMode;
  }
  return PROVIDER_MODE;
}

function normalizeEndpointMode(endpointMode) {
  return endpointMode === "generations" ? "generations" : ENDPOINT_MODE;
}

function buildEndpointUrl(baseUrl, endpointPath) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const normalizedEndpointPath = endpointPath.replace(/^\/+/, "");
  if (normalizedBaseUrl.endsWith(`/${normalizedEndpointPath}`)) {
    return normalizedBaseUrl;
  }
  return `${normalizedBaseUrl}/${normalizedEndpointPath}`;
}

function buildPrompt(renderStyle = "pet-chibi") {
  if (renderStyle === "reward-item") {
    return [
      "Transform the uploaded item into a cute desktop pet reward asset.",
      "Use a clean cartoon style with simple readable shapes and a neat silhouette.",
      "Keep one subject only and avoid photorealism."
    ].join(" ");
  }

  return [
    "Redraw the uploaded character as a cute chibi desktop pet character.",
    "Use a big head, small body, clean silhouette, expressive face, soft cartoon shading, and toy-like charm.",
    "Keep the subject recognizable, but make it clearly non-photorealistic and not a photo edit.",
    "Use a transparent or very clean background and keep only one character."
  ].join(" ");
}

function extToMime(extension) {
  switch (extension.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function toDataUrl(filePath) {
  const buffer = await fs.readFile(filePath);
  return `data:${extToMime(path.extname(filePath))};base64,${buffer.toString("base64")}`;
}

async function ensureAppDirs() {
  await fs.mkdir(APP_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findMatchingBoundary(text, startIndex, openChar, closeChar) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function extractJsonFragment(raw, key, fragmentType) {
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex === -1) {
    return null;
  }

  const colonIndex = raw.indexOf(":", keyIndex);
  if (colonIndex === -1) {
    return null;
  }

  const openChar = fragmentType === "array" ? "[" : "{";
  const closeChar = fragmentType === "array" ? "]" : "}";
  const startIndex = raw.indexOf(openChar, colonIndex);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = findMatchingBoundary(raw, startIndex, openChar, closeChar);
  if (endIndex === -1) {
    return null;
  }

  return raw.slice(startIndex, endIndex + 1);
}

function tryRecoverFromTruncatedJson(raw) {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");

  for (
    let index = trimmed.lastIndexOf("}");
    index > 0;
    index = trimmed.lastIndexOf("}", index - 1)
  ) {
    const candidate = trimmed.slice(0, index + 1);
    const parsed = tryParseJson(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function recoverUserDataFromCorruptRaw(raw) {
  const recovered = {};
  const petProfile = tryParseJson(extractJsonFragment(raw, "petProfile", "object"));
  const rewardLibrary = tryParseJson(extractJsonFragment(raw, "rewardLibrary", "array"));
  const outfitSets = tryParseJson(extractJsonFragment(raw, "outfitSets", "array"));
  const dailyTasksByDate = tryParseJson(extractJsonFragment(raw, "dailyTasksByDate", "object"));
  const dailyRewardSelectionsByDate = tryParseJson(
    extractJsonFragment(raw, "dailyRewardSelectionsByDate", "object")
  );
  const currencyAccount = tryParseJson(extractJsonFragment(raw, "currencyAccount", "object"));

  if (petProfile && typeof petProfile === "object" && !Array.isArray(petProfile)) {
    recovered.petProfile = petProfile;
  }

  if (Array.isArray(rewardLibrary)) {
    recovered.rewardLibrary = rewardLibrary;
  }

  if (Array.isArray(outfitSets)) {
    recovered.outfitSets = outfitSets;
  }

  if (dailyTasksByDate && typeof dailyTasksByDate === "object" && !Array.isArray(dailyTasksByDate)) {
    recovered.dailyTasksByDate = dailyTasksByDate;
  }

  if (
    dailyRewardSelectionsByDate &&
    typeof dailyRewardSelectionsByDate === "object" &&
    !Array.isArray(dailyRewardSelectionsByDate)
  ) {
    recovered.dailyRewardSelectionsByDate = dailyRewardSelectionsByDate;
  }

  if (currencyAccount && typeof currencyAccount === "object" && !Array.isArray(currencyAccount)) {
    recovered.currencyAccount = currencyAccount;
  }

  return Object.keys(recovered).length > 0 ? recovered : null;
}

function recoverConfigFromCorruptRaw(raw) {
  const recovered = {};
  const stringKeys = ["openAIApiKey", "model", "baseUrl", "endpointMode", "providerMode"];

  for (const key of stringKeys) {
    const match = new RegExp(`"${key}"\\s*:\\s*"([^"\\\\]*(?:\\\\.[^"\\\\]*)*)"`).exec(raw);
    if (match) {
      recovered[key] = JSON.parse(`"${match[1]}"`);
    }
  }

  const windows = tryParseJson(extractJsonFragment(raw, "windows", "object"));
  const petPreferences = tryParseJson(extractJsonFragment(raw, "petPreferences", "object"));

  if (windows && typeof windows === "object" && !Array.isArray(windows)) {
    recovered.windows = windows;
  }

  if (petPreferences && typeof petPreferences === "object" && !Array.isArray(petPreferences)) {
    recovered.petPreferences = petPreferences;
  }

  return Object.keys(recovered).length > 0 ? recovered : null;
}

async function writeJsonAtomically(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

async function rewriteRecoveredJson(filePath, raw, recovered) {
  const backupPath = `${filePath}.corrupt-${Date.now()}.bak`;
  await fs.writeFile(backupPath, raw, "utf8");
  await writeJsonAtomically(filePath, recovered);
}

async function readJsonFile(filePath, fallbackValue) {
  try {
    let lastRaw = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await fs.readFile(filePath, "utf8");
      lastRaw = raw;
      const parsed = tryParseJson(raw);
      if (parsed) {
        return parsed;
      }

      if (attempt === 0) {
        await sleep(25);
      }
    }

    const recoveredTruncatedJson = tryRecoverFromTruncatedJson(lastRaw);
    if (recoveredTruncatedJson) {
      await rewriteRecoveredJson(filePath, lastRaw, recoveredTruncatedJson);
      return recoveredTruncatedJson;
    }

    if (filePath === USER_DATA_PATH) {
      const recoveredUserData = recoverUserDataFromCorruptRaw(lastRaw);
      if (recoveredUserData) {
        const normalizedRecovery = normalizeUserData(recoveredUserData);
        await rewriteRecoveredJson(filePath, lastRaw, normalizedRecovery);
        return normalizedRecovery;
      }
    }

    if (filePath === CONFIG_PATH) {
      const recoveredConfig = recoverConfigFromCorruptRaw(lastRaw);
      if (recoveredConfig) {
        await rewriteRecoveredJson(filePath, lastRaw, recoveredConfig);
        return recoveredConfig;
      }
    }

    throw new SyntaxError(`Failed to parse JSON from ${filePath}`);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallbackValue;
    }
    throw error;
  }
}

async function readConfig() {
  const parsed = await readJsonFile(CONFIG_PATH, null);
  const fallback = {
    openAIApiKey: "",
    model: MODEL_NAME,
    baseUrl: BASE_URL,
    endpointMode: ENDPOINT_MODE,
    providerMode: PROVIDER_MODE,
    windows: {},
    petPreferences: getDefaultPetPreferences()
  };

  if (!parsed) {
    return fallback;
  }

  return {
    openAIApiKey: parsed.openAIApiKey || "",
    model: parsed.model || MODEL_NAME,
    baseUrl: parsed.baseUrl || BASE_URL,
    endpointMode: parsed.endpointMode || ENDPOINT_MODE,
    providerMode: normalizeProviderMode(parsed.providerMode),
    windows: parsed.windows || {},
    petPreferences: { ...getDefaultPetPreferences(), ...(parsed.petPreferences || {}) }
  };
}

async function saveConfig(nextConfig) {
  const currentConfig = await readConfig();
  const config = {
    ...currentConfig,
    ...nextConfig,
    openAIApiKey: nextConfig.openAIApiKey ?? currentConfig.openAIApiKey,
    model: nextConfig.model || currentConfig.model || MODEL_NAME,
    baseUrl: nextConfig.baseUrl || currentConfig.baseUrl || BASE_URL,
    endpointMode: normalizeEndpointMode(nextConfig.endpointMode || currentConfig.endpointMode),
    providerMode: normalizeProviderMode(nextConfig.providerMode || currentConfig.providerMode),
    windows: {
      ...(currentConfig.windows || {}),
      ...(nextConfig.windows || {})
    },
    petPreferences: {
      ...getDefaultPetPreferences(),
      ...(currentConfig.petPreferences || {}),
      ...(nextConfig.petPreferences || {})
    }
  };

  await writeJsonAtomically(CONFIG_PATH, config);
  return config;
}

function normalizeUserData(userData) {
  const base = getDefaultUserData();
  const today = formatDateKey();
  const normalized = {
    ...base,
    ...userData,
    petProfile: { ...base.petProfile, ...(userData.petProfile || {}) },
    rewardLibrary: Array.isArray(userData.rewardLibrary) ? userData.rewardLibrary : [],
    outfitSets: Array.isArray(userData.outfitSets) ? userData.outfitSets : [],
    dailyTasksByDate: { ...base.dailyTasksByDate, ...(userData.dailyTasksByDate || {}) },
    dailyRewardSelectionsByDate: {
      ...base.dailyRewardSelectionsByDate,
      ...(userData.dailyRewardSelectionsByDate || {})
    },
    currencyAccount: { ...base.currencyAccount, ...(userData.currencyAccount || {}) }
  };

  if (!Array.isArray(normalized.dailyTasksByDate[today])) {
    normalized.dailyTasksByDate[today] = getDefaultTasks();
  }

  if (!normalized.dailyRewardSelectionsByDate[today]) {
    normalized.dailyRewardSelectionsByDate[today] = {
      date: today,
      targetType: null,
      targetId: null,
      settled: false,
      eligible: false
    };
  }

  if (!normalized.petProfile.basePetRenderPath) {
    normalized.petProfile.basePetRenderPath =
      normalized.petProfile.currentCompositeImagePath || normalized.petProfile.currentPetImagePath;
  }

  return normalized;
}

async function readUserData() {
  return normalizeUserData((await readJsonFile(USER_DATA_PATH, null)) || {});
}

async function saveUserData(nextData) {
  const normalized = normalizeUserData(nextData);
  await writeJsonAtomically(USER_DATA_PATH, normalized);
  return normalized;
}

function getEquippedItems(state) {
  return state.rewardLibrary.filter((item) => state.petProfile.equippedItemIds.includes(item.id));
}

function resolveRewardSelection(state, dateKey) {
  const selection = state.dailyRewardSelectionsByDate[dateKey] || null;
  if (!selection || !selection.targetId) {
    return { selection, target: null };
  }

  const target =
    selection.targetType === "set"
      ? state.outfitSets.find((set) => set.id === selection.targetId) || null
      : state.rewardLibrary.find((item) => item.id === selection.targetId) || null;
  return { selection, target };
}

function getPreferredIdleInteraction(state) {
  const today = formatDateKey();
  const tasks = state.dailyTasksByDate[today] || [];
  const selection = state.dailyRewardSelectionsByDate[today] || null;
  const allDone = tasks.length > 0 && tasks.every((task) => task.completed);
  if (selection && !selection.settled && allDone) {
    return "ready-to-settle";
  }
  return "idle";
}

function updatePetProfile(state, patch) {
  state.petProfile = { ...state.petProfile, ...patch };
}

function setPetReaction(state, reaction) {
  updatePetProfile(state, { ...reaction, reactionTick: Date.now() });
}

function applyAmbientPetState(state) {
  const preferred = getPreferredIdleInteraction(state);
  if (preferred === "ready-to-settle" && ["idle", "updated", "ready-to-settle"].includes(state.petProfile.currentStatus)) {
    updatePetProfile(state, {
      currentStatus: "ready-to-settle",
      interactionState: "ready-to-settle",
      motionState: "bob",
      expressionOverlayState: "proud"
    });
  }
}

function buildStateSummary(state) {
  applyAmbientPetState(state);
  const today = formatDateKey();
  const tasks = state.dailyTasksByDate[today] || [];
  const unfinishedTasks = tasks.filter((task) => !task.completed);
  const finishedTasks = tasks.filter((task) => task.completed);
  const allDone = tasks.length > 0 && unfinishedTasks.length === 0;
  const rewardResolution = resolveRewardSelection(state, today);
  const selection = rewardResolution.selection || {
    date: today,
    targetType: null,
    targetId: null,
    settled: false,
    eligible: false
  };

  let settlementSummary = `${unfinishedTasks.length} task(s) left today.`;
  if (selection.settled) {
    settlementSummary = "Today is already settled.";
  } else if (allDone) {
    settlementSummary = "All tasks are done. Open the main page to settle.";
  }

  return {
    today,
    tasks,
    unfinishedTasks,
    finishedTasks,
    progressLabel: `${finishedTasks.length}/${tasks.length}`,
    allTasksCompleted: allDone,
    settlementSummary,
    dailyRewardSelection: selection,
    resolvedRewardTarget: rewardResolution.target,
    equippedItems: getEquippedItems(state),
    recommendedPetInteractionState: getPreferredIdleInteraction(state)
  };
}

async function readAppState() {
  const [config, userData] = await Promise.all([readConfig(), readUserData()]);
  return { config, userData, summary: buildStateSummary(userData) };
}

function getWindowBounds(windowRef) {
  return windowRef && !windowRef.isDestroyed() ? windowRef.getBounds() : null;
}

async function persistWindowBounds(key, bounds) {
  const config = await readConfig();
  await saveConfig({ windows: { ...(config.windows || {}), [key]: bounds } });
}

function getPetWindowBoundsFromConfig(config) {
  const display = screen.getPrimaryDisplay().workArea;
  const fallback = {
    width: PET_WINDOW_SIZE,
    height: PET_WINDOW_SIZE,
    x: display.x + display.width - PET_WINDOW_SIZE - 48,
    y: display.y + display.height - PET_WINDOW_SIZE - 96
  };
  return { ...fallback, ...((config.windows && config.windows.pet) || {}) };
}

function clampPetPosition(bounds) {
  const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y }).workArea;
  return {
    x: Math.min(Math.max(display.x, bounds.x), display.x + display.width - bounds.width),
    y: Math.min(Math.max(display.y, bounds.y), display.y + display.height - bounds.height),
    width: bounds.width,
    height: bounds.height
  };
}

function positionSidebar() {
  if (!petWindow || petWindow.isDestroyed() || !sidebarWindow || sidebarWindow.isDestroyed()) {
    return;
  }

  const petBounds = petWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y }).workArea;
  let x = petBounds.x + petBounds.width + 12;
  const y = Math.min(
    Math.max(display.y + 24, petBounds.y - 24),
    display.y + display.height - SIDEBAR_HEIGHT - 24
  );

  if (x + SIDEBAR_WIDTH > display.x + display.width - 16) {
    x = petBounds.x - SIDEBAR_WIDTH - 12;
  }

  sidebarWindow.setBounds({
    x: Math.max(display.x + 16, x),
    y,
    width: SIDEBAR_WIDTH,
    height: SIDEBAR_HEIGHT
  });
}

function createPetWindow(config) {
  petWindow = new BrowserWindow({
    ...getPetWindowBoundsFromConfig(config),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    hasShadow: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  petWindow.loadFile(path.join(__dirname, "pet.html"));
  petWindow.on("move", () => {
    positionSidebar();
    persistWindowBounds("pet", petWindow.getBounds()).catch(() => {});
  });
}

function createSidebarWindow() {
  sidebarWindow = new BrowserWindow({
    width: SIDEBAR_WIDTH,
    height: SIDEBAR_HEIGHT,
    frame: false,
    show: false,
    resizable: false,
    backgroundColor: "#f6f0e2",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  sidebarWindow.loadFile(path.join(__dirname, "sidebar.html"));
  sidebarWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      sidebarWindow.hide();
    }
  });
}

async function createMainWindow() {
  const config = await readConfig();
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 1040,
    minHeight: 760,
    backgroundColor: "#faf4e8",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    ...((config.windows && config.windows.main) || {})
  });

  await mainWindow.loadFile(path.join(__dirname, "main.html"));
  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("move", () => {
    persistWindowBounds("main", getWindowBounds(mainWindow)).catch(() => {});
  });
  mainWindow.on("resize", () => {
    persistWindowBounds("main", getWindowBounds(mainWindow)).catch(() => {});
  });
}

async function openMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    await createMainWindow();
  }
  mainWindow.show();
  mainWindow.focus();
}

function navigateMainWindow(tab) {
  if (tab && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("main:navigate", { tab });
  }
}

async function toggleSidebar() {
  if (!sidebarWindow || sidebarWindow.isDestroyed()) {
    createSidebarWindow();
  }

  if (sidebarWindow.isVisible()) {
    sidebarWindow.hide();
    return { visible: false };
  }

  positionSidebar();
  sidebarWindow.show();
  sidebarWindow.focus();
  return { visible: true };
}

function extractBase64FromString(value) {
  const dataUrlMatch = /data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\r\n]+)/.exec(value);
  if (dataUrlMatch) {
    return dataUrlMatch[1].replace(/\s/g, "");
  }
  const jsonBase64Match =
    /"(?:b64_json|base64|image_base64)"\s*:\s*"([A-Za-z0-9+/=\\r\\n]+)"/.exec(value);
  return jsonBase64Match ? jsonBase64Match[1].replace(/\\r|\\n|\s/g, "") : null;
}

function extractImageUrlFromString(value) {
  const markdownMatch = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/.exec(value);
  if (markdownMatch) {
    return markdownMatch[1];
  }
  const urlMatch = /(https?:\/\/[^\s"'<>)]*\.(?:png|jpe?g|webp)(?:\?[^\s"'<>)]*)?)/i.exec(value);
  return urlMatch ? urlMatch[1] : null;
}

function tryExtractBase64Image(payload) {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? extractBase64FromString(payload) : null;
  }
  if (typeof payload.b64_json === "string") {
    return payload.b64_json;
  }
  if (typeof payload.base64 === "string") {
    return payload.base64;
  }
  if (typeof payload.url === "string") {
    return extractBase64FromString(payload.url);
  }
  if (typeof payload.content === "string") {
    return extractBase64FromString(payload.content);
  }
  for (const key of ["data", "output", "choices", "content"]) {
    if (!Array.isArray(payload[key])) {
      continue;
    }
    for (const entry of payload[key]) {
      const nested = tryExtractBase64Image(entry);
      if (nested) {
        return nested;
      }
    }
  }
  if (payload.message) {
    return tryExtractBase64Image(payload.message);
  }
  return null;
}

function tryExtractImageUrl(payload) {
  if (!payload || typeof payload !== "object") {
    return typeof payload === "string" ? extractImageUrlFromString(payload) : null;
  }
  if (typeof payload.url === "string" && /^https?:\/\//.test(payload.url)) {
    return payload.url;
  }
  if (typeof payload.image_url === "string" && /^https?:\/\//.test(payload.image_url)) {
    return payload.image_url;
  }
  if (payload.image_url && typeof payload.image_url.url === "string") {
    return tryExtractImageUrl(payload.image_url.url);
  }
  if (typeof payload.content === "string") {
    return extractImageUrlFromString(payload.content);
  }
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        const nested = tryExtractImageUrl(entry);
        if (nested) {
          return nested;
        }
      }
    } else if (value && typeof value === "object") {
      const nested = tryExtractImageUrl(value);
      if (nested) {
        return nested;
      }
    } else if (typeof value === "string") {
      const nested = extractImageUrlFromString(value);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

async function writeGeneratedImage(base64Data) {
  const filename = `pet-render-${Date.now()}-${crypto.randomUUID()}.png`;
  const outputPath = path.join(GENERATED_DIR, filename);
  await fs.writeFile(outputPath, Buffer.from(base64Data, "base64"));
  return outputPath;
}

async function writeGeneratedDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Invalid generated image data.");
  }
  return writeGeneratedImage(match[2]);
}

async function writeGeneratedImageBuffer(arrayBuffer) {
  const filename = `pet-render-${Date.now()}-${crypto.randomUUID()}.png`;
  const outputPath = path.join(GENERATED_DIR, filename);
  await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
  return outputPath;
}

async function writeGeneratedImageUrl(imageUrl, apiKey) {
  const response = await fetch(imageUrl, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
  });
  if (!response.ok) {
    throw new Error(`Generated image download failed (${response.status}): ${await response.text()}`);
  }
  return writeGeneratedImageBuffer(await response.arrayBuffer());
}

async function callImageProvider(sourceImagePath, config, renderStyle = "pet-chibi") {
  if (!config.openAIApiKey) {
    throw new Error("Missing OpenAI API key. Add it in settings before generating.");
  }
  if (!config.baseUrl) {
    throw new Error("Missing API base URL. Add it in settings before generating.");
  }

  const prompt = buildPrompt(renderStyle);
  const providerMode = normalizeProviderMode(config.providerMode);
  const endpointMode = normalizeEndpointMode(config.endpointMode);
  let response;

  if (providerMode === "remote-chat-compat") {
    const imageDataUrl = await toDataUrl(sourceImagePath);
    response = await fetch(buildEndpointUrl(config.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAIApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "codex_cli_rs/0.77.0"
      },
      body: JSON.stringify({
        model: config.model || MODEL_NAME,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${prompt} Return the final result as image data if the endpoint supports it.`
              },
              {
                type: "image_url",
                image_url: { url: imageDataUrl }
              }
            ]
          }
        ]
      })
    });
  } else if (endpointMode === "generations") {
    const imageDataUrl = await toDataUrl(sourceImagePath);
    response = await fetch(buildEndpointUrl(config.baseUrl, "/images/generations"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAIApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model || MODEL_NAME,
        prompt: `${prompt} Use the attached image as the reference subject.`,
        size: "1024x1024",
        image: imageDataUrl
      })
    });
  } else {
    const fileBuffer = await fs.readFile(sourceImagePath);
    const blob = new Blob([fileBuffer], { type: extToMime(path.extname(sourceImagePath)) });
    const formData = new FormData();
    formData.append("model", config.model || MODEL_NAME);
    formData.append("prompt", prompt);
    formData.append("size", "1024x1024");
    formData.append("image", blob, path.basename(sourceImagePath));
    response = await fetch(buildEndpointUrl(config.baseUrl, "/images/edits"), {
      method: "POST",
      headers: { Authorization: `Bearer ${config.openAIApiKey}` },
      body: formData
    });
  }

  if (!response.ok) {
    throw new Error(`Image request failed (${response.status}): ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.toLowerCase().startsWith("image/")) {
    return writeGeneratedImageBuffer(await response.arrayBuffer());
  }

  const payload = await response.json();
  const base64Data = tryExtractBase64Image(payload);
  if (base64Data) {
    return writeGeneratedImage(base64Data);
  }

  const imageUrl = tryExtractImageUrl(payload);
  if (imageUrl) {
    return writeGeneratedImageUrl(imageUrl, config.openAIApiKey);
  }

  throw new Error(
    `The image provider returned no image data. Response preview: ${JSON.stringify(payload).slice(0, 500)}`
  );
}

function getSenderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) || petWindow;
}

async function openImagePicker(windowRef, title = "Select an image") {
  const result = await dialog.showOpenDialog(windowRef, {
    title,
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0];
}

async function saveGeneratedPreview(windowRef, sourcePath) {
  const result = await dialog.showSaveDialog(windowRef, {
    title: "Export generated preview",
    defaultPath: "desktop-pet-preview.png",
    filters: [{ name: "PNG Image", extensions: ["png"] }]
  });
  if (result.canceled || !result.filePath) {
    return null;
  }
  await fs.copyFile(sourcePath, result.filePath);
  return result.filePath;
}

async function mutateState(mutator) {
  const current = await readUserData();
  const nextState = await mutator(structuredClone(current));
  const saved = await saveUserData(nextState);
  await broadcastState();
  return { userData: saved, summary: buildStateSummary(saved) };
}

async function broadcastState() {
  const payload = await readAppState();
  for (const windowRef of [petWindow, sidebarWindow, mainWindow]) {
    if (windowRef && !windowRef.isDestroyed()) {
      windowRef.webContents.send("state:changed", payload);
    }
  }
}

function getTodaySelection(state) {
  const today = formatDateKey();
  if (!state.dailyRewardSelectionsByDate[today]) {
    state.dailyRewardSelectionsByDate[today] = {
      date: today,
      targetType: null,
      targetId: null,
      settled: false,
      eligible: false
    };
  }
  return state.dailyRewardSelectionsByDate[today];
}

function applyEquipRules(currentIds, item, library) {
  const nextIds = new Set(currentIds);
  const conflictSlots = new Set([item.slot]);

  if (item.slot === "onepiece") {
    conflictSlots.add("top");
    conflictSlots.add("bottom");
  }
  if (item.slot === "top" || item.slot === "bottom") {
    conflictSlots.add("onepiece");
  }

  for (const equippedId of [...nextIds]) {
    const equippedItem = library.find((entry) => entry.id === equippedId);
    if (!equippedItem) {
      nextIds.delete(equippedId);
      continue;
    }
    if (conflictSlots.has(equippedItem.slot)) {
      nextIds.delete(equippedId);
    }
  }

  nextIds.add(item.id);
  return [...nextIds];
}

function applyPetEvent(state, eventType, meta = {}) {
  switch (eventType) {
    case "tap":
      setPetReaction(state, {
        currentStatus: "reacting",
        interactionState: "happy",
        motionState: "bounce",
        expressionOverlayState: "smile",
        bubbleText: "Hey. I noticed that tap.",
        mood: "Playful",
        lastInteractionEvent: "tap"
      });
      return;
    case "pester":
      setPetReaction(state, {
        currentStatus: "reacting",
        interactionState: "startled",
        motionState: "wiggle",
        expressionOverlayState: "annoyed",
        bubbleText: "That was a lot of poking.",
        mood: "Dizzy",
        lastInteractionEvent: "pester"
      });
      return;
    case "hover":
      setPetReaction(state, {
        currentStatus: "reacting",
        interactionState: "hovered",
        motionState: "hover",
        expressionOverlayState: "smile",
        bubbleText: "You hovered. I am paying attention too.",
        mood: "Curious",
        lastInteractionEvent: "hover"
      });
      return;
    case "drag-start":
      setPetReaction(state, {
        currentStatus: "dragging",
        interactionState: "dragged",
        motionState: "drag",
        expressionOverlayState: "surprised",
        bubbleText: "Whoop. Air time.",
        mood: "Alert",
        lastInteractionEvent: "drag-start"
      });
      return;
    case "drag-end":
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: "idle",
        motionState: "settle",
        expressionOverlayState: "smile",
        bubbleText: "All right, I landed fine.",
        mood: "Calm",
        lastInteractionEvent: "drag-end"
      });
      return;
    case "task-complete":
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: meta.allDone ? "ready-to-settle" : "happy",
        motionState: meta.allDone ? "bob" : "bounce",
        expressionOverlayState: meta.allDone ? "proud" : "smile",
        bubbleText: meta.allDone ? "That was the last task. We can settle now." : "Nice. One more task is done.",
        mood: "Proud",
        lastInteractionEvent: "task-complete"
      });
      return;
    case "task-reopen":
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: "idle",
        motionState: "settle",
        expressionOverlayState: "sleepy",
        bubbleText: "No panic. We just put it back on the list.",
        mood: "Calm",
        lastInteractionEvent: "task-reopen"
      });
      return;
    case "reward-targeted":
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: "happy",
        motionState: "bob",
        expressionOverlayState: "smile",
        bubbleText: "A reward target is set.",
        mood: "Curious",
        lastInteractionEvent: "reward-targeted"
      });
      return;
    case "dressed":
      setPetReaction(state, {
        currentStatus: "dressed",
        interactionState: "dressed",
        motionState: "spin",
        expressionOverlayState: "proud",
        bubbleText: meta.name ? `New look: ${meta.name}.` : "New outfit, same charm.",
        mood: "Proud",
        lastInteractionEvent: "dressed"
      });
      return;
    case "fed":
      setPetReaction(state, {
        currentStatus: "fed",
        interactionState: "fed",
        motionState: "bounce",
        expressionOverlayState: "happy",
        bubbleText: meta.name ? `${meta.name} was a good choice.` : "That snack hit the spot.",
        mood: "Happy",
        lastInteractionEvent: "fed"
      });
      return;
    case "settled":
      setPetReaction(state, {
        currentStatus: "celebrating",
        interactionState: "celebrating",
        motionState: "celebrate",
        expressionOverlayState: "proud",
        bubbleText: meta.rewardGranted ? "Settlement complete. Reward secured." : "Settlement complete. Coins secured.",
        mood: "Proud",
        lastInteractionEvent: "settled"
      });
      return;
    default:
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: "idle",
        motionState: "idle",
        expressionOverlayState: "smile",
        bubbleText: "I am here.",
        mood: "Curious",
        lastInteractionEvent: eventType
      });
  }
}

ipcMain.handle("config:read", async () => readConfig());
ipcMain.handle("config:save", async (_event, nextConfig) => {
  const saved = await saveConfig(nextConfig);
  await broadcastState();
  return saved;
});
ipcMain.handle("state:read", async () => readAppState());
ipcMain.handle("window:toggle-sidebar", async () => toggleSidebar());
ipcMain.handle("window:open-main", async (_event, payload) => {
  await openMainWindow();
  navigateMainWindow(payload && payload.tab);
  return { ok: true };
});
ipcMain.handle("window:focus-main", async (_event, payload) => {
  await openMainWindow();
  navigateMainWindow(payload && payload.tab);
  return { ok: true };
});
ipcMain.handle("pet:update-position", async (_event, payload) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return { ok: false };
  }

  const bounds = petWindow.getBounds();
  const nextBounds = clampPetPosition({
    ...bounds,
    x: bounds.x + Number(payload?.deltaX || 0),
    y: bounds.y + Number(payload?.deltaY || 0)
  });
  petWindow.setBounds(nextBounds);
  positionSidebar();
  await persistWindowBounds("pet", nextBounds);
  return { ok: true };
});
ipcMain.handle("pet:set-interaction-state", async (_event, payload) => {
  return mutateState((state) => {
    setPetReaction(state, {
      currentStatus: payload?.state || "updated",
      interactionState: payload?.state || "idle",
      motionState: payload?.motionState || "idle",
      expressionOverlayState: payload?.expressionOverlayState || "smile",
      bubbleText: payload?.bubbleText || state.petProfile.bubbleText,
      mood: payload?.mood || state.petProfile.mood,
      lastInteractionEvent: "manual-state"
    });
    return state;
  });
});
ipcMain.handle("pet:trigger-reaction", async (_event, payload) => {
  return mutateState((state) => {
    applyPetEvent(state, payload?.eventType || "tap", payload?.meta || {});
    return state;
  });
});
ipcMain.handle("image:select-source", async (event, payload) => {
  const filePath = await openImagePicker(getSenderWindow(event), payload?.title || "Select an image");
  return filePath ? { filePath } : null;
});
ipcMain.handle("image:generate-preview", async (_event, payload) => {
  if (!payload?.sourcePath) {
    throw new Error("No source image selected.");
  }
  const config = await readConfig();
  const generatedPath = await callImageProvider(
    payload.sourcePath,
    config,
    payload.renderStyle || "pet-chibi"
  );
  return { filePath: generatedPath };
});
ipcMain.handle("image:save-generated-data-url", async (_event, payload) => {
  if (!payload?.dataUrl) {
    throw new Error("No generated image data available to save.");
  }
  return { filePath: await writeGeneratedDataUrl(payload.dataUrl) };
});
ipcMain.handle("image:export-preview", async (event, payload) => {
  if (!payload?.generatedPath) {
    throw new Error("No generated preview available to export.");
  }
  const savedPath = await saveGeneratedPreview(getSenderWindow(event), payload.generatedPath);
  return savedPath ? { filePath: savedPath } : null;
});
ipcMain.handle("pet:confirm-preview", async (_event, payload) => {
  if (!payload?.previewPath) {
    throw new Error("No preview selected.");
  }
  return mutateState((state) => {
    updatePetProfile(state, {
      sourceImagePath: payload.sourcePath || state.petProfile.sourceImagePath,
      basePetRenderPath: payload.previewPath,
      currentPetImagePath: payload.previewPath,
      currentCompositeImagePath: payload.previewPath
    });
    setPetReaction(state, {
      currentStatus: "updated",
      interactionState: "happy",
      motionState: "bounce",
      expressionOverlayState: "smile",
      bubbleText: "Fresh chibi form online.",
      mood: "Happy",
      lastInteractionEvent: "pet-preview-confirmed"
    });
    return state;
  });
});
ipcMain.handle("reward:confirm-preview", async (_event, payload) => {
  if (!payload?.previewPath || !payload?.itemType || !payload?.itemName) {
    throw new Error("Reward preview information is incomplete.");
  }
  return mutateState((state) => {
    state.rewardLibrary.unshift({
      id: makeId("reward"),
      name: payload.itemName,
      type: payload.itemType === "food" ? "food" : "wearable",
      slot: payload.itemType,
      sourceImagePath: payload.sourcePath || "",
      pixelImagePath: payload.previewPath,
      status: "candidate",
      equipped: false,
      outfitSetIds: []
    });
    setPetReaction(state, {
      currentStatus: "updated",
      interactionState: "happy",
      motionState: "bob",
      expressionOverlayState: "smile",
      bubbleText: `${payload.itemName} joined the reward library.`,
      mood: "Curious",
      lastInteractionEvent: "reward-added"
    });
    return state;
  });
});
ipcMain.handle("task:create", async (_event, payload) => {
  const title = payload?.title?.trim();
  if (!title) {
    throw new Error("Task title cannot be empty.");
  }
  return mutateState((state) => {
    const today = formatDateKey();
    state.dailyTasksByDate[today] = state.dailyTasksByDate[today] || [];
    state.dailyTasksByDate[today].unshift({
      id: makeId("task"),
      title,
      createdAt: new Date().toISOString(),
      completed: false,
      completedAt: null
    });
    setPetReaction(state, {
      currentStatus: "updated",
      interactionState: "idle",
      motionState: "idle",
      expressionOverlayState: "smile",
      bubbleText: `Task added: ${title}.`,
      mood: "Curious",
      lastInteractionEvent: "task-added"
    });
    return state;
  });
});
ipcMain.handle("task:toggle", async (_event, payload) => {
  if (!payload?.taskId) {
    throw new Error("Task id is required.");
  }
  return mutateState((state) => {
    const today = formatDateKey();
    const tasks = state.dailyTasksByDate[today] || [];
    const task = tasks.find((entry) => entry.id === payload.taskId);
    if (!task) {
      return state;
    }
    task.completed = Boolean(payload.completed);
    task.completedAt = task.completed ? new Date().toISOString() : null;
    const allDone = tasks.length > 0 && tasks.every((entry) => entry.completed);
    applyPetEvent(state, task.completed ? "task-complete" : "task-reopen", { allDone });
    return state;
  });
});
ipcMain.handle("reward:set-today", async (_event, payload) => {
  if (!payload?.targetType || !payload?.targetId) {
    throw new Error("Reward target is required.");
  }
  return mutateState((state) => {
    const todaySelection = getTodaySelection(state);
    todaySelection.targetType = payload.targetType;
    todaySelection.targetId = payload.targetId;
    todaySelection.settled = false;
    todaySelection.eligible = false;
    applyPetEvent(state, "reward-targeted");
    return state;
  });
});
ipcMain.handle("reward:equip-item", async (_event, payload) => {
  if (!payload?.itemId) {
    throw new Error("Item id is required.");
  }
  return mutateState((state) => {
    const item = state.rewardLibrary.find((entry) => entry.id === payload.itemId);
    if (!item) {
      throw new Error("Reward item not found.");
    }
    if (item.status !== "owned" || item.type !== "wearable") {
      throw new Error("Only owned wearable items can be equipped.");
    }
    state.petProfile.equippedItemIds = applyEquipRules(
      state.petProfile.equippedItemIds,
      item,
      state.rewardLibrary
    );
    applyPetEvent(state, "dressed", { name: item.name });
    return state;
  });
});
ipcMain.handle("reward:use-item", async (_event, payload) => {
  if (!payload?.itemId) {
    throw new Error("Item id is required.");
  }
  return mutateState((state) => {
    const item = state.rewardLibrary.find((entry) => entry.id === payload.itemId);
    if (!item) {
      throw new Error("Reward item not found.");
    }
    if (item.status !== "owned" || item.type !== "food") {
      throw new Error("Only owned food items can be used.");
    }
    applyPetEvent(state, "fed", { name: item.name });
    return state;
  });
});
ipcMain.handle("outfit:create", async (_event, payload) => {
  const name = payload?.name?.trim();
  const itemIds = Array.isArray(payload?.itemIds) ? payload.itemIds : [];
  if (!name) {
    throw new Error("Outfit name cannot be empty.");
  }
  return mutateState((state) => {
    const outfitId = makeId("set");
    state.outfitSets.unshift({
      id: outfitId,
      name,
      itemIds,
      coverImagePath: state.rewardLibrary.find((item) => item.id === itemIds[0])?.pixelImagePath || "",
      ownedProgress: 0
    });
    for (const item of state.rewardLibrary) {
      if (itemIds.includes(item.id) && !item.outfitSetIds.includes(outfitId)) {
        item.outfitSetIds.push(outfitId);
      }
    }
    setPetReaction(state, {
      currentStatus: "updated",
      interactionState: "happy",
      motionState: "bob",
      expressionOverlayState: "smile",
      bubbleText: `Outfit set saved: ${name}.`,
      mood: "Curious",
      lastInteractionEvent: "outfit-created"
    });
    return state;
  });
});
ipcMain.handle("outfit:update", async (_event, payload) => {
  if (!payload?.setId) {
    throw new Error("Outfit id is required.");
  }
  return mutateState((state) => {
    const outfit = state.outfitSets.find((entry) => entry.id === payload.setId);
    if (!outfit) {
      throw new Error("Outfit set not found.");
    }
    outfit.name = payload.name ? payload.name.trim() : outfit.name;
    outfit.itemIds = Array.isArray(payload.itemIds) ? payload.itemIds : outfit.itemIds;
    outfit.coverImagePath = state.rewardLibrary.find((item) => item.id === outfit.itemIds[0])?.pixelImagePath || "";
    for (const item of state.rewardLibrary) {
      item.outfitSetIds = item.outfitSetIds.filter((id) => id !== payload.setId);
      if (outfit.itemIds.includes(item.id)) {
        item.outfitSetIds.push(payload.setId);
      }
    }
    setPetReaction(state, {
      currentStatus: "updated",
      interactionState: "happy",
      motionState: "bob",
      expressionOverlayState: "smile",
      bubbleText: `Outfit updated: ${outfit.name}.`,
      mood: "Curious",
      lastInteractionEvent: "outfit-updated"
    });
    return state;
  });
});
ipcMain.handle("outfit:equip", async (_event, payload) => {
  if (!payload?.setId) {
    throw new Error("Outfit id is required.");
  }
  return mutateState((state) => {
    const outfit = state.outfitSets.find((entry) => entry.id === payload.setId);
    if (!outfit) {
      throw new Error("Outfit set not found.");
    }
    let equippedIds = [...state.petProfile.equippedItemIds];
    for (const itemId of outfit.itemIds) {
      const item = state.rewardLibrary.find((entry) => entry.id === itemId);
      if (!item || item.status !== "owned" || item.type !== "wearable") {
        continue;
      }
      equippedIds = applyEquipRules(equippedIds, item, state.rewardLibrary);
    }
    state.petProfile.equippedItemIds = equippedIds;
    applyPetEvent(state, "dressed", { name: outfit.name });
    return state;
  });
});
ipcMain.handle("settlement:settle-today", async () => {
  return mutateState((state) => {
    const today = formatDateKey();
    const tasks = state.dailyTasksByDate[today] || [];
    const allCompleted = tasks.length > 0 && tasks.every((task) => task.completed);
    const todaySelection = getTodaySelection(state);

    if (!allCompleted) {
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: "idle",
        motionState: "settle",
        expressionOverlayState: "sleepy",
        bubbleText: "We are not done yet. Keep going.",
        mood: "Calm",
        lastInteractionEvent: "settle-blocked"
      });
      return state;
    }
    if (todaySelection.settled) {
      setPetReaction(state, {
        currentStatus: "updated",
        interactionState: "idle",
        motionState: "idle",
        expressionOverlayState: "smile",
        bubbleText: "Today is already settled.",
        mood: "Calm",
        lastInteractionEvent: "settle-repeat"
      });
      return state;
    }

    let earned = 8;
    todaySelection.eligible = true;
    if (todaySelection.targetType === "item" && todaySelection.targetId) {
      const item = state.rewardLibrary.find((entry) => entry.id === todaySelection.targetId);
      if (item) {
        item.status = "owned";
      }
    }
    if (todaySelection.targetType === "set" && todaySelection.targetId) {
      const outfit = state.outfitSets.find((entry) => entry.id === todaySelection.targetId);
      if (outfit) {
        for (const itemId of outfit.itemIds) {
          const item = state.rewardLibrary.find((entry) => entry.id === itemId);
          if (item) {
            item.status = "owned";
          }
        }
      }
    }
    earned += todaySelection.targetType ? 12 : 0;
    todaySelection.settled = true;
    state.currencyAccount.balance += earned;
    state.currencyAccount.totalEarned += earned;
    state.currencyAccount.lastSettlement = {
      date: today,
      amount: earned,
      rewardGranted: Boolean(todaySelection.targetType)
    };
    applyPetEvent(state, "settled", { rewardGranted: Boolean(todaySelection.targetType) });
    return state;
  });
});

app.whenReady().then(async () => {
  await ensureAppDirs();
  createPetWindow(await readConfig());
  createSidebarWindow();

  app.on("activate", async () => {
    if (!petWindow || petWindow.isDestroyed()) {
      createPetWindow(await readConfig());
    }
    if (!sidebarWindow || sidebarWindow.isDestroyed()) {
      createSidebarWindow();
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
