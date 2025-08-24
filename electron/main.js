// electron/main.js
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let mainWindow = null;
let helper = null;

function resolveResource(...p) {
  // In prod (portable), everything that is NOT in app.asar is under process.resourcesPath
  return app.isPackaged
    ? path.join(process.resourcesPath, ...p)
    : path.resolve(__dirname, '..', ...p);
}

function startHelper() {
  try {
    const exeName = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
    const helperPath = resolveResource('resources', 'live-helper', exeName); // dev path
    const packagedPath = resolveResource('live-helper', exeName);            // prod path

    // Prefer packaged path when running from build
    const candidate = app.isPackaged ? packagedPath : helperPath;

    if (!fs.existsSync(candidate)) {
      // Don’t crash—just tell the user we couldn’t start the OCR helper
      console.warn('[LiveRouteOCR] not found at:', candidate);
      return;
    }

    helper = spawn(candidate, [], {
      cwd: path.dirname(candidate),
      windowsHide: true,
      detached: false,
      stdio: 'ignore'
    });

    helper.on('error', (err) => {
      console.warn('[LiveRouteOCR] spawn error:', err);
      dialog.showMessageBox({
        type: 'warning',
        message: 'Could not start LiveRouteOCR helper.',
        detail: String(err),
      });
    });

    helper.on('exit', (code, signal) => {
      console.log('[LiveRouteOCR] exited', { code, signal });
      helper = null;
    });
  } catch (err) {
    console.warn('[LiveRouteOCR] failed to launch:', err);
  }
}

function helperPath() {
  const base = process.env.NODE_ENV === 'development'
    ? path.join(__dirname, 'dist', 'live-helper')         // dev/build
    : path.join(process.resourcesPath, 'live-helper');     // packed

  // exe name from your publish output
  return path.join(base, 'LiveRouteOCR.exe');
}

let ocrProc;

function startOcr() {
  const exe = helperPath();
  const args = []; // e.g., ["--port=8765"] if you want a specific port

  ocrProc = spawn(exe, args, { windowsHide: true });

  ocrProc.stdout.on('data', d => console.log('[OCR]', d.toString().trim()));
  ocrProc.stderr.on('data', d => console.error('[OCR-ERR]', d.toString().trim()));
  ocrProc.on('close', code => console.log('[OCR] exited', code));
}

// Start it with the app
app.whenReady().then(() => {
  startOcr();
  // … your window init …
});


function createWindow() {
  const iconPath = resolveResource('resources', 'icon.ico'); // dev
  const packagedIconPath = resolveResource('icon.ico');      // prod
  const windowIcon = app.isPackaged ? packagedIconPath : iconPath;

  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0b1220',
    icon: fs.existsSync(windowIcon) ? windowIcon : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Required on Windows for correct taskbar icon/pinning
  app.setAppUserModelId('com.pokemmo.tool');

  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173/');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  // Try to start the OCR helper. If it’s missing we won’t crash.
  startHelper();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    if (helper && !helper.killed) helper.kill();
  } catch (_) {}
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
