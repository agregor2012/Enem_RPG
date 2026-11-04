# -*- coding: utf-8 -*-
"""Monta folhas de contato para conferir recortes a olho.

Uso: ver_recortes.py <saida.png> <filtro python sobre r> [limite] [escala]
"""
import json
import random
import sys
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent


def main():
    saida, filtro = sys.argv[1], sys.argv[2]
    limite = int(sys.argv[3]) if len(sys.argv) > 3 else 12
    escala = float(sys.argv[4]) if len(sys.argv) > 4 else 0.62
    regs = json.loads((RAIZ / "dados" / "registros_questoes.json").read_text(encoding="utf-8"))["registros"]
    escolhidos = [r for r in regs if eval(filtro, {"random": random}, {"r": r})]
    random.seed(7)
    if len(escolhidos) > limite:
        escolhidos = random.sample(escolhidos, limite)
    print(len(escolhidos), [(r["ano"], r["aplicacao"][:4], r["area"], r["n"], r["lingua"]) for r in escolhidos])
    docs, tiras = {}, []
    for r in escolhidos:
        doc = docs.setdefault(r["_pdf"], pymupdf.open(RAIZ / r["_pdf"]))
        partes = []
        for pag, x0, y0, x1, y1, papel in r["_frag"]:
            px = doc[pag].get_pixmap(dpi=int(72 * 1.6 * escala), clip=pymupdf.Rect(x0, y0, x1, y1), alpha=False)
            partes.append((Image.frombytes("RGB", (px.width, px.height), px.samples), papel))
        w = max(p[0].width for p in partes) if partes else 200
        h = sum(p[0].height + 6 for p in partes) + 16
        tira = Image.new("RGB", (w + 8, h), "white")
        d = ImageDraw.Draw(tira)
        d.rectangle((0, 0, w + 7, 14), fill=(30, 60, 120))
        d.text((3, 2), f"{r['ano']} {r['aplicacao'][:5]} {r['area']} Q{r['n']} gab {r.get('gab')} {','.join(r['_avisos'])}", fill="white")
        y = 16
        for im, papel in partes:
            tira.paste(im, (4, y))
            if papel == "apoio":
                d.rectangle((1, y, 3, y + im.height), fill=(220, 120, 0))
            y += im.height + 6
        tiras.append(tira)
    largura = 1500
    x = y = 0
    linha_h = 0
    colunas = []
    # empacota em colunas de altura limitada para caber numa imagem só
    altura_max = 1500
    col_w = 0
    for t in tiras:
        if y + t.height > altura_max and y > 0:
            x += col_w + 6
            y, col_w = 0, 0
        colunas.append((t, x, y))
        y += t.height + 6
        col_w = max(col_w, t.width)
    W = x + col_w
    H = max(cy + t.height for t, _, cy in colunas)
    folha = Image.new("RGB", (W, H), (120, 120, 120))
    for t, cx, cy in colunas:
        folha.paste(t, (cx, cy))
    folha.save(saida)
    print(folha.size)


if __name__ == "__main__":
    main()
