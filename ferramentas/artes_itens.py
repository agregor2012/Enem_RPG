"""Recorta as artes pintadas dos itens e gera os ícones do jogo.

As artes são geradas no Nano Banana com fundo de cor chapada (verde #00FF00 ou magenta #FF00FF),
porque ele não gera transparência. Este script tira o fundo, centraliza o desenho e grava:

- jogo/img/itens/<nome>.webp: o ícone usado no jogo, 256 x 256 com fundo transparente;
- jogo/artes.js: a lista das artes que existem (item sem arte continua com o símbolo it-* de index.html);
- opcionalmente, <pasta dos originais>/<nome>.png: a arte sem fundo em 512 x 512, de reserva.

Uso: python -I ferramentas/artes_itens.py <pasta das artes> [<pasta dos originais>] [--tudo]

Cada arte tem o nome do item: <id>.png, ou <id>_1.png, <id>_2.png e <id>_3.png nas formas dos
mascotes. Sem --tudo, só refaz as artes mais novas que o ícone já gerado.

O fundo sai pela cor: a cor dominante da borda é a chave, e cada ponto fica mais transparente quanto
mais perto dela estiver. Só perdem opacidade os pontos ligados ao fundo (pela borda ou por um vão
dentro do desenho), para que um detalhe da mesma cor no meio do item não seja apagado. Nos pontos
de borda e de brilho, a cor do fundo é descontada da mistura e o reflexo verde ou magenta é retirado.
"""
import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'jogo' / 'img' / 'itens'
LISTA = RAIZ / 'jogo' / 'artes.js'
LADO_ICONE, LADO_ORIGINAL = 256, 512
OCUPA = 0.86      # maior lado do desenho em relação ao quadro
OCUPA_MAX = 0.98  # brilhos e partículas em volta não podem passar disto
C0, C1 = 0.2, 0.75  # abaixo de C0 de "não fundo" é fundo; acima de C1 é desenho opaco
# Artes cujo vidro foi pintado deixando ver o fundo através dele (fica rosa ou verde, cercado pelo
# contorno). Nelas, a parte cercada tingida pelo fundo vira vidro semitransparente, sem a cor do fundo.
# Não vale para todas: num pingente roxo sobre magenta, por exemplo, a cor parecida é do próprio item.
VIDRO = {'pocao_concentracao', 'pocao_fortuna', 'pocao_memoria', 'elixir_segunda_chance', 'ampulheta_tempo',
         'lente_analista'}
VIDRO_MIN = 0.25    # opacidade mínima do vidro, para ele não sumir


def itens_do_jogo():
    """Lê os ids e as categorias de jogo/itens.js."""
    texto = (RAIZ / 'jogo' / 'itens.js').read_text(encoding='utf-8')
    itens = dict(re.findall(r"\{\s*id:\s*'([a-z0-9_]+)',\s*nome:\s*'(?:[^'\\]|\\.)*',\s*cat:\s*'([a-z]+)'", texto))
    nomes = set()
    for id_, cat in itens.items():
        if cat == 'mascote':
            nomes.update(f'{id_}_{n}' for n in (1, 2, 3))
        else:
            nomes.add(id_)
    return itens, nomes


def dilatar(m, r=1):
    for _ in range(r):
        n = m.copy()
        n[1:] |= m[:-1]
        n[:-1] |= m[1:]
        n[:, 1:] |= m[:, :-1]
        n[:, :-1] |= m[:, 1:]
        m = n
    return m


def _espalhar_nas_linhas(r, m):
    """Cada trecho contínuo da máscara numa linha que tem um ponto alcançado fica todo alcançado."""
    inicio = m.copy()
    inicio[:, 1:] &= ~m[:, :-1]
    trecho = np.cumsum(inicio.ravel()).reshape(m.shape) * m
    alcancado = np.zeros(int(trecho.max()) + 1, bool)
    alcancado[trecho[r & m]] = True
    alcancado[0] = False
    return alcancado[trecho]


def inundar(semente, mascara):
    """Pontos da máscara ligados à semente (vizinhos de lado), espalhando por linhas e colunas inteiras."""
    r = semente & mascara
    total = int(r.sum())
    while True:
        r = _espalhar_nas_linhas(r, mascara)
        r = _espalhar_nas_linhas(r.T, mascara.T).T
        n = int(r.sum())
        if n == total:
            return r
        total = n


def tirar_fundo(rgb, vidro=False):
    """Devolve (rgba em float, tipo do fundo, vãos removidos em pontos)."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    borda = np.zeros(r.shape, bool)
    borda[:6], borda[-6:], borda[:, :6], borda[:, -6:] = True, True, True, True
    media = np.median(rgb[borda], axis=0)
    verde = media[1] > max(media[0], media[2])
    # "quanto de fundo" tem cada ponto: o verde que sobra além do vermelho e do azul, ou o magenta além do verde
    k = g - np.maximum(r, b) if verde else np.minimum(r, b) - g
    k_borda = np.median(k[borda])
    if k_borda < 60:
        raise ValueError('a borda não tem fundo verde nem magenta')
    fundo = k > 0.6 * k_borda
    K = float(np.median(k[fundo]))
    chave = np.median(rgb[fundo], axis=0)

    a_mistura = np.clip(1 - k / K, 0, 1)          # quanto do ponto é desenho, pela mistura com a chave
    a = np.clip((a_mistura - C0) / (C1 - C0), 0, 1)
    certo = a_mistura <= C0
    aberto = dilatar(~dilatar(~certo, 2), 2)       # fundo sem os pontinhos soltos
    ligado = inundar(borda | aberto, a < 1)
    vaos = int((aberto & ~inundar(borda, a < 1)).sum())
    alfa = np.where(ligado, a, 1.0)
    mistura = a_mistura
    vidro_m = np.zeros(r.shape, bool)
    if vidro:
        vidro_m = (a_mistura < 0.88) & ~ligado
        mistura = np.where(vidro_m, np.maximum(a_mistura, VIDRO_MIN), a_mistura)
        alfa = np.where(vidro_m, mistura, alfa)

    cor = rgb.copy()
    sel = (ligado & (a_mistura > 0.02)) | vidro_m
    cor[sel] = (rgb[sel] - (1 - mistura[sel, None]) * chave) / mistura[sel, None]
    cor = np.clip(cor, 0, 255)
    faixa = dilatar(ligado, 3) | dilatar(vidro_m, 1)
    if verde:
        limite = np.maximum(cor[..., 0], cor[..., 2])
        cor[..., 1] = np.where(faixa, np.minimum(cor[..., 1], limite), cor[..., 1])
    else:
        excesso = np.clip(np.minimum(cor[..., 0], cor[..., 2]) - cor[..., 1], 0, None) * faixa
        cor[..., 0] -= excesso
        cor[..., 2] -= excesso
    return np.dstack([cor, alfa * 255]), ('verde' if verde else 'magenta'), vaos


def caixa(alfa, limiar):
    ys, xs = np.nonzero(alfa > limiar)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def enquadrar(rgba, lado):
    """Centraliza o desenho num quadro de lado x lado, com o maior lado ocupando OCUPA do quadro."""
    alfa = rgba[..., 3] / 255
    x0, y0, x1, y1 = caixa(alfa, 0.5)        # o corpo do desenho
    X0, Y0, X1, Y1 = caixa(alfa, 0.06)       # com brilhos e partículas
    escala = min(OCUPA * lado / max(x1 - x0, y1 - y0), OCUPA_MAX * lado / max(X1 - X0, Y1 - Y0))
    img = Image.fromarray(np.round(rgba).astype(np.uint8), 'RGBA').crop((X0, Y0, X1, Y1))
    larg, alt = max(1, round((X1 - X0) * escala)), max(1, round((Y1 - Y0) * escala))
    img = img.convert('RGBa').resize((larg, alt), Image.LANCZOS).convert('RGBA')
    # o centro do corpo vai para o centro do quadro, sem deixar os brilhos saírem dele
    cx, cy = ((x0 + x1) / 2 - X0) * escala, ((y0 + y1) / 2 - Y0) * escala
    px = min(max(round(lado / 2 - cx), 0), lado - larg) if larg <= lado else (lado - larg) // 2
    py = min(max(round(lado / 2 - cy), 0), lado - alt) if alt <= lado else (lado - alt) // 2
    quadro = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    quadro.paste(img, (px, py))
    return quadro


def gravar_lista():
    nomes = sorted(p.stem for p in SAIDA.glob('*.webp'))
    linhas = ["'use strict';",
              '/* Gerado por ferramentas/artes_itens.py: os itens que já têm arte pintada (img/itens/<nome>.webp).',
              '   Mascotes têm uma arte por forma (<id>_1, _2 e _3). Item sem arte usa o símbolo it-* de index.html. */',
              'const ARTES_ITENS = new Set([']
    linhas += [f"  '{n}'," for n in nomes]
    linhas += [']);', '']
    LISTA.write_text('\n'.join(linhas), encoding='utf-8', newline='\n')
    return len(nomes)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    entrada = Path(args[0])
    originais = Path(args[1]) if len(args) > 1 else None
    tudo = '--tudo' in sys.argv
    _, validos = itens_do_jogo()
    SAIDA.mkdir(parents=True, exist_ok=True)
    if originais:
        originais.mkdir(parents=True, exist_ok=True)

    feitas, puladas, ignoradas = 0, 0, []
    for arq in sorted(entrada.iterdir()):
        if arq.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp'):
            continue
        nome = arq.stem
        if nome not in validos:
            ignoradas.append(arq.name)
            continue
        icone = SAIDA / f'{nome}.webp'
        original = originais / f'{nome}.png' if originais else None
        em_dia = icone.exists() and icone.stat().st_mtime >= arq.stat().st_mtime
        if original:
            em_dia = em_dia and original.exists() and original.stat().st_mtime >= arq.stat().st_mtime
        if em_dia and not tudo:
            puladas += 1
            continue
        with Image.open(arq) as im:
            rgb = np.asarray(im.convert('RGB'), dtype=np.float32)
        try:
            rgba, tipo, vaos = tirar_fundo(rgb, vidro=nome in VIDRO)
        except ValueError as erro:
            print(f'{arq.name}: {erro}; ficou de fora')
            continue
        grande = enquadrar(rgba, LADO_ORIGINAL)
        if original:
            grande.save(original, optimize=True)
        pequeno = grande.convert('RGBa').resize((LADO_ICONE, LADO_ICONE), Image.LANCZOS).convert('RGBA')
        pequeno.save(icone, 'WEBP', quality=90, method=6, alpha_quality=100)
        feitas += 1
        print(f'{nome:28s} fundo {tipo:7s}' + (f' vãos removidos: {vaos} pontos' if vaos else ''))

    total = gravar_lista()
    print(f'\nfeitas: {feitas} · em dia: {puladas} · artes no jogo: {total}')
    if ignoradas:
        print('ignoradas (o nome não é de nenhum item):', ', '.join(ignoradas))


if __name__ == '__main__':
    main()
