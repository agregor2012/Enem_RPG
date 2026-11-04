'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('enem', {
  carregar: () => ipcRenderer.invoke('carregar'),
  salvar: texto => ipcRenderer.invoke('salvar', texto),
  salvarAoFechar: texto => ipcRenderer.sendSync('salvar-ao-fechar', texto),
  abrirPdf: nome => ipcRenderer.invoke('abrir-pdf', nome),
  abrirLink: url => ipcRenderer.invoke('abrir-link', url),
});
