'use strict';
/* Servidor local para testar a interface no navegador, sem empacotar. */
const fs = require('fs');
const http = require('http');
const path = require('path');

const JOGO = path.join(__dirname, '..', 'jogo');
const BANCO = path.join(process.env.LOCALAPPDATA, 'ENEM-RPG-build', 'banco');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
                '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const alvo = url.startsWith('/banco/') ? path.join(BANCO, url.slice(7)) : path.join(JOGO, url === '/' ? 'index.html' : url);
  fs.readFile(alvo, (erro, dados) => {
    if (erro) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
    res.end(dados);
  });
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173'));
