// electron/preload.cjs
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("pokemmo", {
  version: "1.2.5"
});
