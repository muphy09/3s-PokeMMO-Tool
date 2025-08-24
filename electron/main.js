// electron/main.js
const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const { autoUpdater } = require('electron-updater');

/* ------------------------------------------------------------------ */
/*                    Single instance & global flags                   */
/* ------------------------------------------------------------------ */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();
let mainWindow;
let ocrProc = null;
let quitting = false;
let ocrManuallyStopped = false;
const OCR_AUTO_START = true; // set false to disable auto-start

/* ------------------------------------------------------------------ */
/*                               Utils                                 */
/* ------------------------------------------------------------------ */
function logToFile(msg) {
  try {
    const p = path.join(app.getPath('userData'), 'pokemmo-tool.log');
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
const exists = p => { try { return fs.existsSync(p); } catch { return false; } };

function showOCRError(err) {
  const msg = (err && err.stack) ? err.stack : String(err);
  logToFile(`LiveRouteOCR error: ${msg}`);
  dialog.showErrorBox('LiveRouteOCR Error', msg);
}

/* ------------------------------------------------------------------ */
/*                          Window + Menu                              */
/* ------------------------------------------------------------------ */
function createWindow() {
  const preload = path.join(__dirname, 'preload.js');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: exists(preload) ? preload : undefined,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const html = path.join(__dirname, '../dist/index.html');
    if (!exists(html)) dialog.showErrorBox('Missing UI bundle', `Not found: ${html}`);
    mainWindow.loadFile(html);
  }
}

function setMenuState() {
  const menu = Menu.getApplicationMenu();
  if (!menu) return;
  const startItem = menu.getMenuItemById('start-ocr');
  const stopItem = menu.getMenuItemById('stop-ocr');
  const running = !!ocrProc && !ocrProc.killed;
  if (startItem) startItem.enabled = !running;
  if (stopItem) stopItem.enabled = running;
}

function buildMenu() {
  const template = [
    {
      label: 'App',
      submenu: [
        { id: 'check-updates', label: 'Check for Updates', click: () => autoUpdater.checkForUpdates() },
        { type: 'separator' },
        { id: 'start-ocr', label: 'Start LiveRouteOCR', click: () => ensureOCRAndLaunch().catch(showOCRError) },
        { id: 'stop-ocr',  label: 'Stop LiveRouteOCR',  enabled: false, click: () => stopOCR() },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  setMenuState();
}

/* ------------------------------------------------------------------ */
/*                        Auto-update wiring                           */
/* ------------------------------------------------------------------ */
function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', info => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      message: `Update ${info.version} downloaded`,
      detail: 'Restart to apply the update.'
    }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
}

/* ------------------------------------------------------------------ */
/*                     LiveRouteOCR: paths & install                   */
/* ------------------------------------------------------------------ */
function resourcesZip()        { return path.join(process.resourcesPath, 'LiveRouteOCR.zip'); }
function resourcesFolder()     { return path.join(process.resourcesPath, 'LiveRouteOCR'); }
function userOCRDir()          { return path.join(app.getPath('userData'), 'LiveRouteOCR'); }
function userOCRExe()          { return path.join(userOCRDir(), process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR'); }
function devOCRExe() {
  const exe = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  const p1 = path.join(__dirname, '..', 'LiveRouteOCR', 'publish', exe);
  const p2 = path.join(__dirname, '..', 'LiveRouteOCR', exe);
  return exists(p1) ? p1 : (exists(p2) ? p2 : null);
}

function expandZipTo(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const ps = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
      ], { windowsHide: true });
      let stderr = '';
      ps.stderr.on('data', d => { stderr += d.toString(); });
      ps.on('exit', c => c === 0 ? resolve() : reject(new Error(`Expand-Archive failed (${c}): ${stderr}`)));
      ps.on('error', reject);
    } catch (e) { reject(e); }
  });
}

async function ensureOCRInstalled() {
  if (!app.isPackaged) {
    const dev = devOCRExe();
    if (dev) return { exePath: dev, cwd: path.dirname(dev) };
    throw new Error('Dev OCR exe not found. Run: dotnet publish LiveRouteOCR -c Release -r win-x64 -o LiveRouteOCR/publish');
  }

  const exe = userOCRExe();
  if (exists(exe)) return { exePath: exe, cwd: userOCRDir() };

  const zip = resourcesZip();
  if (exists(zip)) {
    logToFile(`Extracting OCR zip: ${zip} -> ${userOCRDir()}`);
    await expandZipTo(zip, userOCRDir());
    if (exists(exe)) return { exePath: exe, cwd: userOCRDir() };
    throw new Error(`After extraction, OCR exe missing:\n${exe}\nCheck Windows Security → Protection history.`);
  }

  const folder = resourcesFolder();
  const packagedExe = path.join(folder, process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR');
  if (exists(packagedExe)) {
    logToFile(`Copying OCR folder: ${folder} -> ${userOCRDir()}`);
    fs.mkdirSync(userOCRDir(), { recursive: true });
    fs.cpSync(folder, userOCRDir(), { recursive: true });
    if (exists(exe)) return { exePath: exe, cwd: userOCRDir() };
    throw new Error(`Copied OCR folder but exe missing at:\n${exe}`);
  }

  throw new Error(`No OCR payload in resources:\n- ${zip}\n- ${folder}`);
}

/* ------------------------------------------------------------------ */
/*                      Launch / Stop / Monitor OCR                    */
/* ------------------------------------------------------------------ */
function killProcessTree(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f']);
    } else {
      proc.kill('SIGTERM');
    }
  } catch {}
}

async function ensureOCRAndLaunch() {
  if (ocrProc && !ocrProc.killed) { setMenuState(); return; }
  const { exePath, cwd } = await ensureOCRInstalled();
  logToFile(`Launching OCR: ${exePath} (cwd=${cwd})`);
  ocrManuallyStopped = false;
  ocrProc = spawn(exePath, [], { cwd, windowsHide: true, stdio: 'ignore' });
  setMenuState();

  ocrProc.on('error', err => {
    logToFile(`OCR spawn error: ${err}`);
    showOCRError(err);
  });

  ocrProc.on('exit', (code, signal) => {
    logToFile(`OCR exited (code=${code}, signal=${signal})`);
    ocrProc = null;
    setMenuState();
    if (!quitting && !ocrManuallyStopped && OCR_AUTO_START) {
      // restart after a short delay
      setTimeout(() => ensureOCRAndLaunch().catch(showOCRError), 1500);
    }
  });
}

function stopOCR() {
  ocrManuallyStopped = true;
  if (ocrProc && !ocrProc.killed) {
    logToFile('Stopping OCR');
    killProcessTree(ocrProc);
  }
  ocrProc = null;
  setMenuState();
}

/* ------------------------------------------------------------------ */
/*                               Boot                                  */
/* ------------------------------------------------------------------ */
app.whenReady().then(() => {
  createWindow();
  buildMenu();
  setupAutoUpdates();
  if (OCR_AUTO_START) {
    ensureOCRAndLaunch().catch(showOCRError);
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('before-quit', () => { quitting = true; stopOCR(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
