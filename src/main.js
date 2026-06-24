const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const APP_DIR = app.getPath("userData");
const CONFIG_PATH = path.join(APP_DIR, "app-config.json");
const GENERATED_DIR = path.join(APP_DIR, "generated");
const MODEL_NAME = "gpt-image-2";
const BASE_URL = "https://api.openai.com/v1";
const ENDPOINT_MODE = "edits";
const PROVIDER_MODE = "local";

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260,
    height: 860,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#f5efe3",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

async function ensureAppDirs() {
  await fs.mkdir(APP_DIR, { recursive: true });
  await fs.mkdir(GENERATED_DIR, { recursive: true });
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      openAIApiKey: parsed.openAIApiKey || "",
      model: parsed.model || MODEL_NAME,
      baseUrl: parsed.baseUrl || BASE_URL,
      endpointMode: parsed.endpointMode || ENDPOINT_MODE,
      providerMode: parsed.providerMode || PROVIDER_MODE
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        openAIApiKey: "",
        model: MODEL_NAME,
        baseUrl: BASE_URL,
        endpointMode: ENDPOINT_MODE,
        providerMode: PROVIDER_MODE
      };
    }
    throw error;
  }
}

async function saveConfig(nextConfig) {
  const config = {
    openAIApiKey: nextConfig.openAIApiKey || "",
    model: nextConfig.model || MODEL_NAME,
    baseUrl: nextConfig.baseUrl || BASE_URL,
    endpointMode: nextConfig.endpointMode || ENDPOINT_MODE,
    providerMode: nextConfig.providerMode || PROVIDER_MODE
  };

  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  return config;
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
  const extension = path.extname(filePath);
  const mimeType = extToMime(extension);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

async function writeGeneratedImage(base64Data) {
  const filename = `pixel-preview-${Date.now()}-${crypto.randomUUID()}.png`;
  const outputPath = path.join(GENERATED_DIR, filename);
  const buffer = Buffer.from(base64Data, "base64");
  await fs.writeFile(outputPath, buffer);
  return outputPath;
}

async function writeGeneratedDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl);

  if (!match) {
    throw new Error("Invalid generated image data.");
  }

  return writeGeneratedImage(match[2]);
}

async function openImagePicker() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Select an image",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp"]
      }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
}

async function saveGeneratedPreview(sourcePath) {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Export pixel preview",
    defaultPath: "pixel-preview.png",
    filters: [{ name: "PNG Image", extensions: ["png"] }]
  });

  if (result.canceled || !result.filePath) {
    return null;
  }

  await fs.copyFile(sourcePath, result.filePath);
  return result.filePath;
}

function buildPrompt() {
  return [
    "Transform the uploaded character image into cute cartoon pixel art.",
    "Keep the main subject recognizable and preserve distinctive colors and silhouette.",
    "Use a clean, charming, game-ready pixel art look suitable for a desktop pet.",
    "Keep the composition focused on a single subject and avoid adding extra characters or complex backgrounds."
  ].join(" ");
}

function normalizeEndpointMode(endpointMode) {
  return endpointMode === "generations" ? "generations" : ENDPOINT_MODE;
}

async function callImageProvider(sourceImagePath, config) {
  if (!config.openAIApiKey) {
    throw new Error("Missing OpenAI API key. Add it in the settings area before generating.");
  }

  if (!config.baseUrl) {
    throw new Error("Missing API base URL. Add it in the settings area before generating.");
  }

  const normalizedBaseUrl = config.baseUrl.replace(/\/+$/, "");
  const endpointMode = normalizeEndpointMode(config.endpointMode);
  const requestPath =
    endpointMode === "generations" ? "/images/generations" : "/images/edits";
  let response;

  if (endpointMode === "generations") {
    const imageDataUrl = await toDataUrl(sourceImagePath);
    const requestBody = {
      model: config.model || MODEL_NAME,
      prompt: `${buildPrompt()} This request is in compatibility-test mode, so generate a cute pixel-art interpretation of the uploaded subject without adding extra characters.`,
      size: "1024x1024",
      moderation: "low",
      input_fidelity: "high",
      image: imageDataUrl
    };

    response = await fetch(`${normalizedBaseUrl}${requestPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAIApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
  } else {
    const fileBuffer = await fs.readFile(sourceImagePath);
    const fileName = path.basename(sourceImagePath);
    const mimeType = extToMime(path.extname(sourceImagePath));
    const formData = new FormData();
    const blob = new Blob([fileBuffer], { type: mimeType });

    formData.append("model", config.model || MODEL_NAME);
    formData.append("prompt", buildPrompt());
    formData.append("size", "1024x1024");
    formData.append("image[]", blob, fileName);

    response = await fetch(`${normalizedBaseUrl}${requestPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openAIApiKey}`
      },
      body: formData
    });
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Image request failed (${response.status}): ${errorBody}`);
  }

  const payload = await response.json();
  const image = payload.data && payload.data[0];
  const base64Data = image && (image.b64_json || image.base64);

  if (!base64Data) {
    throw new Error("The image provider returned no image data.");
  }

  return writeGeneratedImage(base64Data);
}

ipcMain.handle("config:read", async () => {
  return readConfig();
});

ipcMain.handle("config:save", async (_event, nextConfig) => {
  return saveConfig(nextConfig);
});

ipcMain.handle("image:select-source", async () => {
  const filePath = await openImagePicker();
  return filePath ? { filePath } : null;
});

ipcMain.handle("image:generate-preview", async (_event, payload) => {
  const sourcePath = payload && payload.sourcePath;

  if (!sourcePath) {
    throw new Error("No source image selected.");
  }

  const config = await readConfig();
  const generatedPath = await callImageProvider(sourcePath, config);
  return { filePath: generatedPath };
});

ipcMain.handle("image:export-preview", async (_event, payload) => {
  const generatedPath = payload && payload.generatedPath;

  if (!generatedPath) {
    throw new Error("No generated preview available to export.");
  }

  const savedPath = await saveGeneratedPreview(generatedPath);
  return savedPath ? { filePath: savedPath } : null;
});

ipcMain.handle("image:save-generated-data-url", async (_event, payload) => {
  const dataUrl = payload && payload.dataUrl;

  if (!dataUrl) {
    throw new Error("No generated image data available to save.");
  }

  const generatedPath = await writeGeneratedDataUrl(dataUrl);
  return { filePath: generatedPath };
});

app.whenReady().then(async () => {
  await ensureAppDirs();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
