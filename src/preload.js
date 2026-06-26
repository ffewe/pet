const { contextBridge, ipcRenderer } = require("electron");
const { runPythonPetReaction } = require("./python-reaction-bridge");

const api = {
  readState: () => ipcRenderer.invoke("state:read"),
  readConfig: () => ipcRenderer.invoke("config:read"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  toggleSidebar: () => ipcRenderer.invoke("window:toggle-sidebar"),
  openMainWindow: (tab) => ipcRenderer.invoke("window:open-main", { tab }),
  focusMainWindow: (tab) => ipcRenderer.invoke("window:focus-main", { tab }),
  selectSourceImage: (title) => ipcRenderer.invoke("image:select-source", { title }),
  generatePixelPreview: (sourcePath, renderStyle) =>
    ipcRenderer.invoke("image:generate-preview", { sourcePath, renderStyle }),
  saveGeneratedDataUrl: (dataUrl) =>
    ipcRenderer.invoke("image:save-generated-data-url", { dataUrl }),
  exportGeneratedPreview: (generatedPath) =>
    ipcRenderer.invoke("image:export-preview", { generatedPath }),
  confirmPetPreview: (sourcePath, previewPath, meta) =>
    ipcRenderer.invoke("pet:confirm-preview", { sourcePath, previewPath, ...(meta || {}) }),
  setPetInteractionState: (state, meta) =>
    ipcRenderer.invoke("pet:set-interaction-state", { state, ...(meta || {}) }),
  triggerPetReaction: (eventType, meta) =>
    ipcRenderer.invoke("pet:trigger-reaction", { eventType, meta }),
  runPythonPetReaction: (eventType, meta) => runPythonPetReaction(eventType, meta),
  updatePetPosition: (deltaX, deltaY) =>
    ipcRenderer.invoke("pet:update-position", { deltaX, deltaY }),
  confirmRewardPreview: (payload) => ipcRenderer.invoke("reward:confirm-preview", payload),
  createDailyTask: (title) => ipcRenderer.invoke("task:create", { title }),
  toggleDailyTask: (taskId, completed) =>
    ipcRenderer.invoke("task:toggle", { taskId, completed }),
  setTodayReward: (targetType, targetId) =>
    ipcRenderer.invoke("reward:set-today", { targetType, targetId }),
  equipItem: (itemId) => ipcRenderer.invoke("reward:equip-item", { itemId }),
  unequipItem: (itemId) => ipcRenderer.invoke("reward:unequip-item", { itemId }),
  useReward: (itemId) => ipcRenderer.invoke("reward:use-item", { itemId }),
  createOutfitSet: (name, itemIds) => ipcRenderer.invoke("outfit:create", { name, itemIds }),
  updateOutfitSet: (setId, name, itemIds) =>
    ipcRenderer.invoke("outfit:update", { setId, name, itemIds }),
  equipSet: (setId) => ipcRenderer.invoke("outfit:equip", { setId }),
  settleToday: () => ipcRenderer.invoke("settlement:settle-today"),
  onStateChanged: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("state:changed", wrapped);
    return () => ipcRenderer.removeListener("state:changed", wrapped);
  },
  onMainNavigate: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("main:navigate", wrapped);
    return () => ipcRenderer.removeListener("main:navigate", wrapped);
  }
};

contextBridge.exposeInMainWorld("desktopPet", api);
contextBridge.exposeInMainWorld("pixelApp", api);
