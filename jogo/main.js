'use strict';
/* Processo principal do ENEM RPG (Electron).
   Serve o jogo pelo protocolo enem:// e grava o progresso na pasta "progresso". */
const { app, BrowserWindow, Menu, ipcMain, protocol, shell } = require('electron');
const fs = require('fs');
const path = require('path');

protocol.registerSchemesAsPrivileged([
  { scheme: 'enem', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Fora do pacote, roda a partir de Enem/jogo; empacotado, o .exe fica em Enem/app.
const RAIZ = app.isPackaged ? path.resolve(path.dirname(process.execPath), '..') : path.resolve(__dirname, '..');
const BANCO = path.join(RAIZ, 'banco', 'banco.asar');
const DOCUMENTOS = path.join(RAIZ, 'documentos_redacao');
const PEDIDO_AUTOTESTE = process.argv.find(a => a.startsWith('--autoteste='));
// o autoteste joga com um herói próprio numa pasta temporária: nunca toca no progresso do jogador
const PROGRESSO = PEDIDO_AUTOTESTE
  ? path.join(app.getPath('temp'), 'enem-rpg-autoteste')
  : path.join(RAIZ, 'progresso');
if (PEDIDO_AUTOTESTE) fs.rmSync(PROGRESSO, { recursive: true, force: true });
const SAVE = path.join(PROGRESSO, 'save.json');
const COPIA = path.join(PROGRESSO, 'save.copia.json');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2',
};
const LINKS_PERMITIDOS = [/^https:\/\/jornaldaparaiba\.com\.br\//, /^https:\/\/www\.gov\.br\//];

async function atender(req) {
  const url = new URL(req.url);
  const relativo = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const base = url.host === 'banco' ? BANCO : __dirname;
  const alvo = path.normalize(path.join(base, relativo));
  if (!alvo.startsWith(path.normalize(base))) return new Response('proibido', { status: 403 });
  try {
    const dados = await fs.promises.readFile(alvo);
    const tipo = TIPOS[path.extname(alvo).toLowerCase()] || 'application/octet-stream';
    return new Response(dados, { headers: { 'content-type': tipo } });
  } catch {
    return new Response('não encontrado', { status: 404 });
  }
}

function lerSave() {
  for (const arquivo of [SAVE, COPIA]) {
    try {
      const texto = fs.readFileSync(arquivo, 'utf8');
      JSON.parse(texto);
      return texto;
    } catch { /* tenta a cópia; sem nenhum arquivo, começa do zero */ }
  }
  return null;
}

/* Grava em arquivo temporário e troca: uma queda de energia não corrompe o progresso.
   Na pasta do OneDrive a troca pode falhar por instantes, enquanto ele sincroniza. */
let filaGravacao = Promise.resolve(true);
function gravarSave(texto) {
  // uma gravação por vez: duas usando o mesmo temporário deixariam sobras na pasta
  filaGravacao = filaGravacao.then(() => gravarAgora(texto)).catch(() => false);
  return filaGravacao;
}
async function gravarAgora(texto) {
  await fs.promises.mkdir(PROGRESSO, { recursive: true });
  const temporario = `${SAVE}.tmp`;
  await fs.promises.writeFile(temporario, texto, 'utf8');
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    try {
      if (fs.existsSync(SAVE)) await fs.promises.copyFile(SAVE, COPIA);
      await fs.promises.rename(temporario, SAVE);
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 200 * (tentativa + 1)));
    }
  }
  return false;
}

function criarJanela() {
  const janela = new BrowserWindow({
    width: 1320, height: 840, minWidth: 1000, minHeight: 640, show: false, backgroundColor: '#131a2c',
    title: 'ENEM RPG', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icone.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  Menu.setApplicationMenu(null);
  janela.once('ready-to-show', () => janela.show());
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', ev => ev.preventDefault());
  janela.loadURL('enem://app/index.html');
  return janela;
}

function autoteste(janela, destino) {
  janela.webContents.once('did-finish-load', async () => {
    await new Promise(r => setTimeout(r, 2500));
    const resultado = await janela.webContents.executeJavaScript(`(async () => {
      const r = await fetch('enem://banco/questoes.json');
      const banco = await r.json();
      const amostra = banco[Math.floor(banco.length / 2)];
      const img = new Image();
      const ok = await new Promise((fim) => {
        img.onload = () => fim(img.naturalWidth > 0); img.onerror = () => fim(false);
        img.src = 'enem://banco/img/' + amostra.img[0][0];
      });
      // a primeira arte de item da lista precisa abrir de dentro do pacote
      const arte = [...ARTES_ITENS][0];
      const larguraArte = arte ? await new Promise((fim) => {
        const a = new Image();
        a.onload = () => fim(a.naturalWidth); a.onerror = () => fim(0);
        a.src = 'img/itens/' + arte + '.webp';
      }) : null;
      const tela = document.querySelector('#app').innerText.slice(0, 40);
      const espera = ms => new Promise(fim => setTimeout(fim, ms));
      document.getElementById('nome-heroi').value = 'Autoteste';
      document.querySelector('[data-acao="criar"]').click();
      await espera(200);
      partirTreinoRapido();
      await espera(600);
      const q = E.porId.get(E.save.atual.ids[0]);
      const imagens = [...document.querySelectorAll('.recorte img')];
      document.querySelector('.letra[data-letra="' + q.gab + '"]').click();
      document.querySelector('[data-acao="confirmar"]').click();
      await espera(200);
      const retorno = document.querySelector('.veredito')?.innerText;
      // a correção aparece no anel da letra impressa, e o banco traz a caixa de cada letra
      const certaNaLetra = q.alt?.A ? !!document.querySelector('.marca-letra.certa') : null;
      const comLetras = banco.filter(x => Object.values(x.alt || {}).every(z => z.length === 9)).length;
      concluirSessao();
      await salvar(true);
      return { questoes: banco.length, imagem: ok, artes: ARTES_ITENS.size, larguraArte, comLetras, certaNaLetra, tela, recortes: imagens.map(i => i.naturalWidth), retorno,
               telaFinal: E.tela, xp: E.save.xp, sessoes: E.save.sessoes.length, redacao: E.redacao.length };
    })()`);
    fs.writeFileSync(destino, JSON.stringify(resultado));
    app.quit();
  });
}

app.whenReady().then(() => {
  protocol.handle('enem', atender);
  ipcMain.handle('carregar', () => lerSave());
  ipcMain.handle('salvar', (_ev, texto) => gravarSave(String(texto)).catch(() => false));
  // ao fechar a janela não dá tempo de esperar a fila: a última gravação é síncrona
  ipcMain.on('salvar-ao-fechar', (ev, texto) => {
    try {
      fs.mkdirSync(PROGRESSO, { recursive: true });
      fs.writeFileSync(`${SAVE}.fim`, String(texto), 'utf8');
      fs.renameSync(`${SAVE}.fim`, SAVE);
      ev.returnValue = true;
    } catch {
      ev.returnValue = false;
    }
  });
  ipcMain.handle('abrir-pdf', async (_ev, nome) => {
    if (!/^[\w.-]+\.pdf$/.test(String(nome))) return false;
    const alvo = path.join(DOCUMENTOS, nome);
    if (!fs.existsSync(alvo)) return false;
    return (await shell.openPath(alvo)) === '';
  });
  ipcMain.handle('abrir-link', async (_ev, url) => {
    if (!LINKS_PERMITIDOS.some(r => r.test(String(url)))) return false;
    await shell.openExternal(url);
    return true;
  });
  const janela = criarJanela();
  if (PEDIDO_AUTOTESTE) autoteste(janela, PEDIDO_AUTOTESTE.split('=')[1]);
});
app.on('window-all-closed', () => app.quit());
