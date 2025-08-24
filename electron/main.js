// electron/main.js
const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow;

/* ------------------------------- helpers -------------------------------- */

function logToFile(msg) {
  try {
    const p = path.join(app.getPath('userData'), 'pokemmo-tool.log');
    fs.appendFileSync(p, `[${new Date().toISOString()}] ${msg}\n`);
  } catch {
    // ignore logging failures
  }
}

function fileExists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

/* ------------------------------ window/menu ----------------------------- */

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const hasPreload = fileExists(preloadPath);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: hasPreload ? preloadPath : undefined,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    const htmlPath = path.join(__dirname, '../dist/index.html');
    if (!fileExists(htmlPath)) {
      dialog.showErrorBox('Missing UI bundle', `Not found: ${htmlPath}`);
    }
    mainWindow.loadFile(htmlPath);
  }
}

function buildMenu() {
  const template = [
    {
      label: 'App',
      submenu: [
        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdates() },
        { label: 'Start LiveRouteOCR', click: () => ensureOCRAndLaunch().catch(showOCRError) },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------ auto-update ----------------------------- */

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

/* ---------------------------- LiveRouteOCR bits -------------------------- */

function resourcesZip() {
  // packaged app: app.asar sits next to a /resources dir; process.resourcesPath points to it
  return path.join(process.resourcesPath, 'LiveRouteOCR.zip');
}
function resourcesFolder() {
  return path.join(process.resourcesPath, 'LiveRouteOCR');
}
function userOCRDir() {
  return path.join(app.getPath('userData'), 'LiveRouteOCR');
}
function userOCRExe() {
  const exe = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  return path.join(userOCRDir(), exe);
}
function devOCRExe() {
  // when running from source during development
  const exe = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  const p1 = path.join(__dirname, '..', 'LiveRouteOCR', 'publish', exe);
  const p2 = path.join(__dirname, '..', 'LiveRouteOCR', exe);
  if (fileExists(p1)) return p1;
  if (fileExists(p2)) return p2;
  return null;
}

function showOCRError(err) {
  const msg = (err && err.stack) ? err.stack : String(err);
  logToFile(`LiveRouteOCR error: ${msg}`);
  dialog.showErrorBox('LiveRouteOCR Error', msg);
}

function expandZipTo(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(destDir, { recursive: true });
      const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`
      ], { windowsHide: true });

      let stderr = '';
      ps.stderr.on('data', d => { stderr += d.toString(); });
      ps.on('exit', code => code === 0 ? resolve() : reject(new Error(`Expand-Archive failed (${code}): ${stderr}`)));
      ps.on('error', reject);
    } catch (e) { reject(e); }
  });
}

async function ensureOCRInstalled() {
  if (!app.isPackaged) {
    const devExe = devOCRExe();
    if (devExe) {
      const cwd = path.dirname(devExe);
      logToFile(`Dev OCR detected: ${devExe}`);
      return { exePath: devExe, cwd };
    }
    throw new Error('Dev OCR exe not found. Run: dotnet publish LiveRouteOCR -c Release -r win-x64 -o LiveRouteOCR/publish');
  }

  const exePath = userOCRExe();
  if (fileExists(exePath)) {
    return { exePath, cwd: userOCRDir() };
  }

  // Prefer ZIP if present (avoids AV tampering during install)
  const zip = resourcesZip();
  if (fileExists(zip)) {
    logToFile(`Extracting OCR zip: ${zip} -> ${userOCRDir()}`);
    await expandZipTo(zip, userOCRDir());
    if (fileExists(exePath)) return { exePath, cwd: userOCRDir() };
    throw new Error(`After extraction, OCR exe missing at:\n${exePath}\nCheck Windows Security → Protection history in case it was quarantined.`);
  }

  // Fallback: packaged folder (copy it out)
  const folder = resourcesFolder();
  const packagedExe = path.join(folder, process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR');
  if (fileExists(packagedExe)) {
    logToFile(`Copying OCR folder: ${folder} -> ${userOCRDir()}`);
    fs.mkdirSync(userOCRDir(), { recursive: true });
    fs.cpSync(folder, userOCRDir(), { recursive: true });
    if (fileExists(exePath)) return { exePath, cwd: userOCRDir() };
    throw new Error(`Copied OCR folder but exe missing at:\n${exePath}`);
  }

  throw new Error(
    `Could not find LiveRouteOCR payload in resources.\n` +
    `Checked:\n- ${zip}\n- ${folder}`
  );
}

async function ensureOCRAndLaunch() {
  const { exePath, cwd } = await ensureOCRInstalled();
  logToFile(`Launching OCR: ${exePath} (cwd=${cwd})`);
  const child = spawn(exePath, [], { cwd, windowsHide: true, stdio: 'ignore' });
  child.on('error', showOCRError);
}

/* --------------------------------- boot --------------------------------- */

app.whenReady().then(() => {
  createWindow();
  buildMenu();
  setupAutoUpdates();

  // Auto-start OCR on boot? Uncomment:
  // ensureOCRAndLaunch().catch(showOCRError);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
