import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { loadConfig, saveConfig } from '@agent/config';
import { runAgent } from '@agent/agent';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    return mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  }
  return mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

ipcMain.handle('writeConfig', (_evt, data) => {
  saveConfig(data);
});

ipcMain.handle('readConfig', () => {
  return loadConfig();
});

app.whenReady().then(async () => {
  await createWindow();
  runAgent().catch((err) => console.error('agent error', err));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
