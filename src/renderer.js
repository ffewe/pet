const state = {
  sourcePath: "",
  generatedPath: "",
  providerMode: "local",
  isGenerating: false,
  hasConfig: false
};

const elements = {
  providerModeInput: document.getElementById("providerModeInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelInput: document.getElementById("modelInput"),
  endpointModeInput: document.getElementById("endpointModeInput"),
  saveConfigButton: document.getElementById("saveConfigButton"),
  configStatus: document.getElementById("configStatus"),
  selectImageButton: document.getElementById("selectImageButton"),
  sourcePathText: document.getElementById("sourcePathText"),
  sourcePreview: document.getElementById("sourcePreview"),
  sourcePlaceholder: document.getElementById("sourcePlaceholder"),
  generatedPreview: document.getElementById("generatedPreview"),
  generatedPlaceholder: document.getElementById("generatedPlaceholder"),
  requestState: document.getElementById("requestState"),
  generateButton: document.getElementById("generateButton"),
  regenerateButton: document.getElementById("regenerateButton"),
  exportButton: document.getElementById("exportButton"),
  errorText: document.getElementById("errorText"),
  successText: document.getElementById("successText")
};

function setStatusPill(node, label, variant) {
  node.textContent = label;
  node.className = `status-pill ${variant}`;
}

function setImagePreview(imgNode, placeholderNode, filePath) {
  if (!filePath) {
    imgNode.hidden = true;
    imgNode.removeAttribute("src");
    placeholderNode.hidden = false;
    return;
  }

  imgNode.src = `file://${filePath.replace(/\\/g, "/")}`;
  imgNode.hidden = false;
  placeholderNode.hidden = true;
}

function showError(message) {
  elements.errorText.hidden = false;
  elements.errorText.textContent = message;
}

function clearError() {
  elements.errorText.hidden = true;
  elements.errorText.textContent = "";
}

function showSuccess(message) {
  elements.successText.hidden = false;
  elements.successText.textContent = message;
}

function clearSuccess() {
  elements.successText.hidden = true;
  elements.successText.textContent = "";
}

function refreshButtons() {
  const canGenerate = Boolean(state.sourcePath) && !state.isGenerating && state.hasConfig;
  const canRegenerate = Boolean(state.sourcePath) && !state.isGenerating && state.hasConfig;
  const canExport = Boolean(state.generatedPath) && !state.isGenerating;

  elements.generateButton.disabled = !canGenerate;
  elements.regenerateButton.disabled = !canRegenerate;
  elements.exportButton.disabled = !canExport;
}

function computeHasConfig(config) {
  if (config.providerMode === "local") {
    return true;
  }

  return Boolean(config.openAIApiKey) && Boolean(config.baseUrl) && Boolean(config.model);
}

function syncProviderUi() {
  const remoteOnly = state.providerMode !== "local";
  const imagesOnly = state.providerMode === "remote-openai-images";
  elements.apiKeyInput.disabled = !remoteOnly;
  elements.baseUrlInput.disabled = !remoteOnly;
  elements.modelInput.disabled = !remoteOnly;
  elements.endpointModeInput.disabled = !imagesOnly;
}

async function loadConfig() {
  const config = await window.pixelApp.readConfig();
  elements.providerModeInput.value = config.providerMode || "local";
  elements.apiKeyInput.value = config.openAIApiKey || "";
  elements.baseUrlInput.value = config.baseUrl || "";
  elements.modelInput.value = config.model || "";
  elements.endpointModeInput.value = config.endpointMode || "edits";
  state.providerMode = config.providerMode || "local";
  state.hasConfig = computeHasConfig(config);
  syncProviderUi();

  if (state.hasConfig) {
    setStatusPill(elements.configStatus, "Config Ready", "success");
  } else {
    setStatusPill(elements.configStatus, "Config Missing", "error");
  }

  refreshButtons();
}

async function handleSaveConfig() {
  clearError();
  clearSuccess();

  const nextKey = elements.apiKeyInput.value.trim();
  const nextBaseUrl = elements.baseUrlInput.value.trim();
  const nextModel = elements.modelInput.value.trim();
  const nextEndpointMode = elements.endpointModeInput.value;
  const nextProviderMode = elements.providerModeInput.value;
  await window.pixelApp.saveConfig({
    providerMode: nextProviderMode,
    openAIApiKey: nextKey,
    baseUrl: nextBaseUrl,
    model: nextModel,
    endpointMode: nextEndpointMode
  });
  state.providerMode = nextProviderMode;
  state.hasConfig = computeHasConfig({
    providerMode: nextProviderMode,
    openAIApiKey: nextKey,
    baseUrl: nextBaseUrl,
    model: nextModel,
    endpointMode: nextEndpointMode
  });
  syncProviderUi();
  setStatusPill(
    elements.configStatus,
    state.hasConfig ? "Config Ready" : "Config Missing",
    state.hasConfig ? "success" : "error"
  );
  refreshButtons();
  showSuccess(
    state.hasConfig
      ? "Image provider settings saved locally."
      : "Configuration incomplete. Add key, base URL, and model for remote modes."
  );
}

function filePathToUrl(filePath) {
  return `file://${filePath.replace(/\\/g, "/")}`;
}

function loadImage(filePath) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load the selected image."));
    image.src = filePathToUrl(filePath);
  });
}

function quantizeChannel(value, step) {
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

function clampChannel(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyContrast(value, contrast) {
  return clampChannel((value - 128) * contrast + 128);
}

function boostSaturation(red, green, blue, saturationBoost) {
  const average = (red + green + blue) / 3;
  return [
    clampChannel(average + (red - average) * saturationBoost),
    clampChannel(average + (green - average) * saturationBoost),
    clampChannel(average + (blue - average) * saturationBoost)
  ];
}

function buildLumaMap(pixels, width, height) {
  const luma = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      luma[y * width + x] =
        pixels[offset] * 0.299 +
        pixels[offset + 1] * 0.587 +
        pixels[offset + 2] * 0.114;
    }
  }

  return luma;
}

function applyEdgeBoost(pixels, width, height, strength) {
  const lumaMap = buildLumaMap(pixels, width, height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centerIndex = y * width + x;
      const center = lumaMap[centerIndex];
      const neighbors =
        lumaMap[centerIndex - 1] +
        lumaMap[centerIndex + 1] +
        lumaMap[centerIndex - width] +
        lumaMap[centerIndex + width];
      const edgeScore = Math.abs(center * 4 - neighbors) / 4;

      if (edgeScore < 22) {
        continue;
      }

      const offset = centerIndex * 4;
      const shading = edgeScore > 58 ? -strength : strength * 0.45;
      pixels[offset] = clampChannel(pixels[offset] + shading);
      pixels[offset + 1] = clampChannel(pixels[offset + 1] + shading);
      pixels[offset + 2] = clampChannel(pixels[offset + 2] + shading);
    }
  }
}

async function generateLocalPixelPreview(sourcePath) {
  const image = await loadImage(sourcePath);
  const maxDimension = Math.max(image.width, image.height);
  const sampleMax = 96;
  const sampleScale = Math.max(1, Math.ceil(maxDimension / sampleMax));
  const sampleWidth = Math.max(24, Math.round(image.width / sampleScale));
  const sampleHeight = Math.max(24, Math.round(image.height / sampleScale));

  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = sampleWidth;
  sampleCanvas.height = sampleHeight;
  const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleContext.imageSmoothingEnabled = true;
  sampleContext.drawImage(image, 0, 0, sampleWidth, sampleHeight);

  const imageData = sampleContext.getImageData(0, 0, sampleWidth, sampleHeight);
  const pixels = imageData.data;
  const colorStep = 24;
  const contrast = 1.08;
  const saturationBoost = 1.18;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha < 16) {
      pixels[index + 3] = 0;
      continue;
    }

    let red = applyContrast(pixels[index], contrast);
    let green = applyContrast(pixels[index + 1], contrast);
    let blue = applyContrast(pixels[index + 2], contrast);

    [red, green, blue] = boostSaturation(red, green, blue, saturationBoost);

    pixels[index] = quantizeChannel(red, colorStep);
    pixels[index + 1] = quantizeChannel(green, colorStep);
    pixels[index + 2] = quantizeChannel(blue, colorStep);
  }

  applyEdgeBoost(pixels, sampleWidth, sampleHeight, 12);
  sampleContext.putImageData(imageData, 0, 0);

  const outputCanvas = document.createElement("canvas");
  const outputScale = Math.max(5, Math.floor(640 / Math.max(sampleWidth, sampleHeight)));
  outputCanvas.width = sampleWidth * outputScale;
  outputCanvas.height = sampleHeight * outputScale;

  const outputContext = outputCanvas.getContext("2d");
  outputContext.imageSmoothingEnabled = false;
  outputContext.drawImage(
    sampleCanvas,
    0,
    0,
    sampleWidth,
    sampleHeight,
    0,
    0,
    outputCanvas.width,
    outputCanvas.height
  );

  return outputCanvas.toDataURL("image/png");
}

async function handleSelectImage() {
  clearError();
  clearSuccess();

  const result = await window.pixelApp.selectSourceImage();
  if (!result) {
    return;
  }

  state.sourcePath = result.filePath;
  state.generatedPath = "";
  elements.sourcePathText.textContent = result.filePath;
  setImagePreview(elements.sourcePreview, elements.sourcePlaceholder, state.sourcePath);
  setImagePreview(elements.generatedPreview, elements.generatedPlaceholder, "");
  setStatusPill(elements.requestState, "Idle", "idle");
  refreshButtons();
}

async function runGeneration() {
  if (!state.sourcePath || state.isGenerating || !state.hasConfig) {
    return;
  }

  clearError();
  clearSuccess();
  state.isGenerating = true;
  refreshButtons();
  setStatusPill(elements.requestState, "Generating...", "loading");

  try {
    if (state.providerMode === "local") {
      const generatedDataUrl = await generateLocalPixelPreview(state.sourcePath);
      const savedPreview = await window.pixelApp.saveGeneratedDataUrl(generatedDataUrl);
      state.generatedPath = savedPreview.filePath;
    } else {
      const result = await window.pixelApp.generatePixelPreview(state.sourcePath);
      state.generatedPath = result.filePath;
    }
    setImagePreview(
      elements.generatedPreview,
      elements.generatedPlaceholder,
      state.generatedPath
    );
    setStatusPill(elements.requestState, "Preview Ready", "success");
    showSuccess(
      state.providerMode === "local"
        ? "Local pixel preview generated successfully."
        : "Remote pixel preview generated successfully."
    );
  } catch (error) {
    setStatusPill(elements.requestState, "Failed", "error");
    showError(error.message || "Failed to generate a pixel preview.");
  } finally {
    state.isGenerating = false;
    refreshButtons();
  }
}

async function handleExport() {
  if (!state.generatedPath || state.isGenerating) {
    return;
  }

  clearError();
  clearSuccess();

  try {
    const result = await window.pixelApp.exportGeneratedPreview(state.generatedPath);
    if (result && result.filePath) {
      showSuccess(`PNG exported to ${result.filePath}`);
    }
  } catch (error) {
    showError(error.message || "Failed to export PNG.");
  }
}

elements.saveConfigButton.addEventListener("click", handleSaveConfig);
elements.providerModeInput.addEventListener("change", () => {
  state.providerMode = elements.providerModeInput.value;
  state.hasConfig = computeHasConfig({
    providerMode: state.providerMode,
    openAIApiKey: elements.apiKeyInput.value.trim(),
    baseUrl: elements.baseUrlInput.value.trim(),
    model: elements.modelInput.value.trim(),
    endpointMode: elements.endpointModeInput.value
  });
  syncProviderUi();
  refreshButtons();
});
elements.selectImageButton.addEventListener("click", handleSelectImage);
elements.generateButton.addEventListener("click", runGeneration);
elements.regenerateButton.addEventListener("click", runGeneration);
elements.exportButton.addEventListener("click", handleExport);

loadConfig().catch((error) => {
  showError(error.message || "Failed to load local configuration.");
});
