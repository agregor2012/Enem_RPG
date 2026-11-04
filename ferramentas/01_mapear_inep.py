# -*- coding: utf-8 -*-
"""Lê as abas de cada ano da página oficial do INEP e gera um manifesto com
todos os links de provas e gabaritos de 2005 a 2025.

Saída: dados/manifesto_inep.json
"""
import json
import re
import sys
import time
import urllib.request
from html import unescape
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
BASE = ("https://www.gov.br/inep/pt-br/areas-de-atuacao/"
        "avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")


def baixar_texto(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8", "replace")


def limpar(s):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def extrair_links(html):
    """Retorna [{titulo, texto, url}] preservando o subtítulo (seção) de cada link."""
    links = []
    secao = ""
    padrao = re.compile(
        r"<(h[1-6]|strong)\b[^>]*>(.*?)</\1>|<a\b[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>",
        re.S | re.I,
    )
    for m in padrao.finditer(html):
        if m.group(1):
            t = limpar(m.group(2))
            if t:
                secao = t
            continue
        url = unescape(m.group(3)).strip()
        if "download.inep.gov.br" in url or url.lower().endswith((".pdf", ".zip")):
            links.append({"secao": secao, "texto": limpar(m.group(4)), "url": url})
    return links


def main():
    manifesto = {}
    for ano in range(2025, 2004, -1):
        try:
            html = baixar_texto(f"{BASE}{ano}")
        except Exception as exc:  # registra e segue: o relatório final mostra o que faltou
            print(f"{ano}: ERRO {exc}", file=sys.stderr)
            manifesto[str(ano)] = {"erro": str(exc), "links": []}
            continue
        links = extrair_links(html)
        manifesto[str(ano)] = {"links": links}
        print(f"{ano}: {len(links)} links")
        time.sleep(0.5)
    destino = RAIZ / "dados" / "manifesto_inep.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(manifesto, ensure_ascii=False, indent=1), encoding="utf-8")
    print("manifesto:", destino)


if __name__ == "__main__":
    main()
