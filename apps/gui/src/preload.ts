import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('aichain', {
  writeConfig: (data: any) => ipcRenderer.invoke('writeConfig', data),
  readConfig: () => ipcRenderer.invoke('readConfig'),
});
