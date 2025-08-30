// electron/main.js
const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

let mainWindow;

function resolveLiveRouteOCRPath() {
  const isDev = !app.isPackaged;

  // Where the folder lives:
  //  - dev: <repo>/LiveRouteOCR/LiveRouteOCR.exe
  //  - prod: <installDir>/resources/LiveRouteOCR/LiveRouteOCR.exe  (extraResources)
  const baseDir = isDev
    ? path.join(__dirname, '..', 'LiveRouteOCR')
    : path.join(process.resourcesPath, 'LiveRouteOCR');

  const exeName = process.platform === 'win32' ? 'LiveRouteOCR.exe' : 'LiveRouteOCR';
  const exePath = path.join(baseDir, exeName);

  return { baseDir, exePath };
}

function launchLiveRouteOCR() {
  const { baseDir, exePath } = resolveLiveRouteOCRPath();

  if (!fs.existsSync(exePath)) {
    const msg = `LiveRouteOCR not found at:\n${exePath}\n\n`
              + `Dev? Ensure LiveRouteOCR/** exists in the repo.\n`
              + `Packaged? Ensure package.json "build.extraResources" includes the LiveRouteOCR folder.`;
    console.error(msg);
    dialog.showErrorBox('LiveRouteOCR Missing', msg);
    return;
  }

  try {
    const child = spawn(exePath, [], {
      cwd: baseDir,
      windowsHide: true,
      stdio: 'ignore'
    });

    child.on('error', (err) => {
      console.error('Failed to spawn LiveRouteOCR:', err);
      dialog.showErrorBox('LiveRouteOCR Error', String(err));
    });
  } catch (err) {
    console.error('Exception while launching LiveRouteOCR:', err);
    dialog.showErrorBox('LiveRouteOCR Error', String(err));
  }
}

function createMenu() {
  const template = [
    {
      label: 'App',
      submenu: [
        {
          label: 'Check for Updates',
          click: () => autoUpdater.checkForUpdates()
        },
        {
          label: 'Start LiveRouteOCR',
          click: () => launchLiveRouteOCR()
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

function setupAutoUpdates() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
  });

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      message: `Update ${info.version} downloaded`,
      detail: 'Restart to apply the update.'
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('autoUpdater error', err);
  });

  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
}

app.whenReady().then(() => {
  createWindow();
  createMenu();
  setupAutoUpdates();

  // If you want OCR to start automatically, uncomment:
  // launchLiveRouteOCR();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
