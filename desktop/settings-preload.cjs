const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("seabirdSettings", {
  submit: (payload) => ipcRenderer.invoke("desktop-settings:submit", payload),
  cancel: () => ipcRenderer.invoke("desktop-settings:cancel"),
});
