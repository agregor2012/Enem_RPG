'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('enem', {
  carregar: () => ipcRenderer.invoke('carregar'),
  salvar: texto => ipcRenderer.invoke('salvar', texto),
  salvarAoFechar: texto => ipcRenderer.sendSync('salvar-ao-fechar', texto),
});
