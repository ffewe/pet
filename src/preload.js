const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pixelApp", {
  readConfig: () => ipcRenderer.invoke("config:read"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  selectSourceImage: () => ipcRenderer.invoke("image:select-source"),
  generatePixelPreview: (sourcePath) =>
    ipcRenderer.invoke("image:generate-preview", { sourcePath }),
  saveGeneratedDataUrl: (dataUrl) =>
    ipcRenderer.invoke("image:save-generated-data-url", { dataUrl }),
  exportGeneratedPreview: (generatedPath) =>
    ipcRenderer.invoke("image:export-preview", { generatedPath })
});
