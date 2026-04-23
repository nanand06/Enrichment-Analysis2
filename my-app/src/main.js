import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import started from 'electron-squirrel-startup';

if (started) { app.quit(); }

let backendProcess = null;
let backendPort = 8000;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

async function waitForBackend(port, maxMs = 30000) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Backend did not respond within 30s');
}

async function startBackend() {
  backendPort = await findFreePort();
  const env = { ...process.env, PORT: String(backendPort) };

  if (app.isPackaged) {
    // Production: run the compiled PyInstaller binary from app resources
    const bin = path.join(process.resourcesPath, 'backend');
    backendProcess = spawn(bin, [], { env, stdio: 'pipe' });
  } else {
    // Development: run the Python script directly
    const backendDir = path.join(app.getAppPath(), 'backend');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';
    backendProcess = spawn(pythonBin, ['main.py'], { cwd: backendDir, env, stdio: 'pipe' });
  }

  backendProcess.stdout?.on('data', d => process.stdout.write(`[backend] ${d}`));
  backendProcess.stderr?.on('data', d => process.stderr.write(`[backend] ${d}`));
  backendProcess.on('error', err => console.error('Backend process error:', err));

  await waitForBackend(backendPort);
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('backend:getPort', () => backendPort);

ipcMain.handle('dialog:openFile', async (_event, options) => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: options.title || 'Select File',
    defaultPath: options.defaultPath,
    buttonLabel: options.buttonLabel || 'Select',
    filters: options.filters || [
      { name: 'All Files', extensions: ['*'] },
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'TSV Files', extensions: ['tsv'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'Excel Files', extensions: ['xlsx', 'xls'] }
    ],
    properties: ['openFile']
  });

  if (!canceled && filePaths.length > 0) {
    return {
      canceled: false,
      filePath: filePaths[0],
      fileName: path.basename(filePaths[0])
    };
  }
  return { canceled: true };
});
