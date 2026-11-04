# -*- coding: utf-8 -*-
"""Lê arquivos de dentro de um .zip remoto usando HTTP Range, sem baixar o zip inteiro.

Os microdados do INEP têm centenas de MB, mas só precisamos do CSV de itens
(ITENS_PROVA_*.csv), que tem poucos KB.

O transporte é o curl.exe do Windows: ele valida o certificado pelo repositório
do sistema. O Python puro falha em download.inep.gov.br porque o servidor não
envia a cadeia completa, e desligar a verificação não é uma opção aqui.
"""
import io
import re
import subprocess
import time

CURL = r"C:\Windows\System32\curl.exe"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ENEM-RPG/1.0"


def curl(args, tentativas=5):
    """Roda o curl e devolve stdout em bytes; repete em falhas transitórias."""
    cmd = [CURL, "-sS", "-L", "--fail", "-A", UA, "--connect-timeout", "30",
           "--max-time", "600"] + args
    for t in range(tentativas):
        p = subprocess.run(cmd, capture_output=True)
        if p.returncode == 0:
            return p.stdout
        if t == tentativas - 1:
            raise IOError(f"curl falhou ({p.returncode}): {p.stderr.decode('utf-8', 'replace')[:200]}")
        time.sleep(2 + t * 3)


def tamanho_remoto(url):
    cab = curl(["-I", url]).decode("latin-1")
    m = re.findall(r"content-length:\s*(\d+)", cab, re.I)
    return int(m[-1]) if m else None


class ArquivoHTTP(io.RawIOBase):
    """Objeto tipo arquivo somente leitura sobre uma URL com suporte a Range."""

    BLOCO = 1 << 20

    def __init__(self, url):
        self.url = url
        self.pos = 0
        self.cache = {}
        self.tamanho = tamanho_remoto(url)

    def seekable(self):
        return True

    def readable(self):
        return True

    def tell(self):
        return self.pos

    def seek(self, pos, whence=io.SEEK_SET):
        if whence == io.SEEK_SET:
            self.pos = pos
        elif whence == io.SEEK_CUR:
            self.pos += pos
        else:
            self.pos = self.tamanho + pos
        return self.pos

    def _bloco(self, i):
        if i not in self.cache:
            ini = i * self.BLOCO
            fim = min(ini + self.BLOCO, self.tamanho) - 1
            self.cache[i] = curl(["-r", f"{ini}-{fim}", self.url])
            if len(self.cache) > 64:  # evita guardar tudo em memória em membros grandes
                self.cache.pop(next(iter(self.cache)))
        return self.cache[i]

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.tamanho - self.pos
        n = min(n, self.tamanho - self.pos)
        if n <= 0:
            return b""
        saida = bytearray()
        while n > 0:
            i = self.pos // self.BLOCO
            desl = self.pos % self.BLOCO
            parte = self._bloco(i)[desl:desl + n]
            if not parte:
                break
            saida += parte
            self.pos += len(parte)
            n -= len(parte)
        return bytes(saida)

    def readinto(self, b):
        dados = self.read(len(b))
        b[:len(dados)] = dados
        return len(dados)
