# -*- coding: utf-8 -*-
"""Desenha o ícone do jogo: escudo dourado com um livro aberto."""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
LADO = 512
NOITE = (19, 26, 44, 255)
OURO = (220, 181, 101, 255)
CLARO = (245, 237, 218, 255)


def desenhar():
    im = Image.new("RGBA", (LADO, LADO), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((8, 8, LADO - 8, LADO - 8), radius=96, fill=NOITE)
    escudo = [(256, 56), (424, 112), (424, 256), (404, 340), (344, 412), (256, 464),
              (168, 412), (108, 340), (88, 256), (88, 112)]
    d.polygon(escudo, fill=OURO)
    # livro aberto
    d.polygon([(256, 204), (168, 172), (152, 180), (152, 332), (256, 364)], fill=CLARO)
    d.polygon([(256, 204), (344, 172), (360, 180), (360, 332), (256, 364)], fill=(232, 222, 197, 255))
    d.line([(256, 204), (256, 364)], fill=NOITE, width=9)
    for y in (222, 256, 290):
        d.line([(182, y - 14), (232, y + 2)], fill=(120, 100, 70, 255), width=7)
        d.line([(330, y - 14), (280, y + 2)], fill=(120, 100, 70, 255), width=7)
    return im


if __name__ == "__main__":
    icone = desenhar()
    icone.save(RAIZ / "jogo" / "icone.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print("icone.ico gerado")
