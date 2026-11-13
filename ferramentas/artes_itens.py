"""Recorta as artes pintadas dos itens e gera os ícones do jogo.

As artes são geradas no Nano Banana com fundo de cor chapada (verde #00FF00 ou magenta #FF00FF),
porque ele não gera transparência. Este script tira o fundo, centraliza o desenho e grava:

- jogo/img/itens/<nome>.webp: o ícone usado no jogo, 256 x 256 com fundo transparente;
- jogo/artes.js: a lista das artes que existem (item sem arte continua com o símbolo it-* de index.html);
- opcionalmente, <pasta dos originais>/<nome>.png: a arte sem fundo em 512 x 512, de reserva.

Uso: python -I ferramentas/artes_itens.py <pasta das artes> [<pasta dos originais>] [--tudo]

Cada arte tem o nome do item: <id>.png, ou <id>_1.png, <id>_2.png e <id>_3.png nas formas dos
mascotes. Sem --tudo, só refaz as artes mais novas que o ícone já gerado.

As artes dos lugares do mapa ficam na subpasta mapa/ da pasta das artes (reino_*.png e lugar_*.png,
os nomes de LUGARES abaixo). Elas viram jogo/img/mapa/<nome>.webp, 768 x 768, com o pé do desenho
embaixo; a lista delas vai para jogo/artes.js (ARTES_MAPA). Na versão do jogo, o chão pintado na arte
sai para a construção pisar no terreno do mapa: o lugar que tem linha de chão em chao_lugares.json
perde o chão abaixo dela e ganha uma sombra no pé; os outros só têm a borda da base esmaecida. O
original sem fundo fica intacto.

O mapa.png da mesma subpasta é o terreno pintado (4:3, gerado com o guia de posições): vira
jogo/img/mapa/mapa.webp, com as bordas esmaecendo até a cor do mar, e jogo/artes.js ganha
MAPA_PINTADO (tamanho da imagem e cor do mar em volta), para o jogo desenhá-lo sob os lugares.

O fundo sai pela cor: a cor dominante da borda é a chave, e cada ponto fica mais transparente quanto
mais perto dela estiver. Só perdem opacidade os pontos ligados ao fundo (pela borda ou por um vão
dentro do desenho), para que um detalhe da mesma cor no meio do item não seja apagado. Nos pontos
de borda e de brilho, a cor do fundo é descontada da mistura e o reflexo verde ou magenta é retirado.
"""
import hashlib
import json
import os
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / 'jogo' / 'img' / 'itens'
SAIDA_MAPA = RAIZ / 'jogo' / 'img' / 'mapa'
LISTA = RAIZ / 'jogo' / 'artes.js'
LADO_ICONE, LADO_ORIGINAL = 256, 512
OCUPA = 0.86      # maior lado do desenho em relação ao quadro
OCUPA_MAX = 0.98  # brilhos e partículas em volta não podem passar disto
# lugares do mapa (LUGARES_MAPA em jogo/app.js): o pé do desenho fica a PE da altura do quadro
LUGARES = {'reino_sabio', 'reino_numeros', 'reino_natureza', 'reino_letras', 'reino_humanidades',
           'lugar_torre', 'lugar_masmorra', 'lugar_arena'}
LADO_LUGAR, LADO_LUGAR_ORIGINAL = 768, 1024
OCUPA_LUGAR, PE = 0.92, 0.96
CHAO = Path(__file__).with_name('chao_lugares.json')   # linha de chão de cada arte de lugar
TERRENO = 'mapa'
LARGURA_MAX_TERRENO = 4096  # o mapa aproxima até 3x; um 4K fica nítido até o fim, maior que isso só pesa
BORDA_TERRENO = 0.035       # faixa de cada lado em que o terreno esmaece até a cor do mar
C0, C1 = 0.2, 0.75  # abaixo de C0 de "não fundo" é fundo; acima de C1 é desenho opaco
# Artes com vidro ou partes translúcidas (o corpo de luz da Lumina, os redemoinhos da Fênix) pintadas
# deixando ver o fundo através delas (fica rosa ou verde, cercado pelo contorno). Nelas, a parte cercada
# tingida pelo fundo vira semitransparente, sem a cor do fundo. Não vale para todas: num pingente roxo
# sobre magenta, por exemplo, a cor parecida é do próprio item.
VIDRO = {'pocao_concentracao', 'pocao_fortuna', 'pocao_memoria', 'elixir_segunda_chance', 'ampulheta_tempo',
         'lente_analista', 'lumina_1', 'lumina_2', 'lumina_3', 'fenix_celestial_3'}
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


def enquadrar_lugar(rgba, lado):
    """Desenho de um lugar do mapa num quadro de lado x lado: centrado na horizontal, com o pé (a base
    de chão) a PE da altura, e o maior lado ocupando OCUPA_LUGAR do quadro."""
    alfa = rgba[..., 3] / 255
    x0, y0, x1, y1 = caixa(alfa, 0.5)
    X0, Y0, X1, Y1 = caixa(alfa, 0.06)
    escala = min(OCUPA_LUGAR * lado / max(x1 - x0, y1 - y0), 0.99 * lado / max(X1 - X0, Y1 - Y0))
    img = Image.fromarray(np.round(rgba).astype(np.uint8), 'RGBA').crop((X0, Y0, X1, Y1))
    larg, alt = max(1, round((X1 - X0) * escala)), max(1, round((Y1 - Y0) * escala))
    img = img.convert('RGBa').resize((larg, alt), Image.LANCZOS).convert('RGBA')
    cx, pe = ((x0 + x1) / 2 - X0) * escala, (y1 - Y0) * escala
    px = min(max(round(lado / 2 - cx), 0), max(lado - larg, 0))
    py = min(max(round(PE * lado - pe), 0), max(lado - alt, 0))
    quadro = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    quadro.paste(img, (px, py))
    return quadro


def converter_terreno(arq, destino):
    """O mapa pintado em WebP, com as bordas esmaecendo (alfa) para emendar no mar do jogo."""
    with Image.open(arq) as im:
        img = im.convert('RGB')
    if img.width > LARGURA_MAX_TERRENO:
        img = img.resize((LARGURA_MAX_TERRENO, round(img.height * LARGURA_MAX_TERRENO / img.width)), Image.LANCZOS)
    w, h = img.size
    m = BORDA_TERRENO * w
    xs = np.minimum(np.arange(w), np.arange(w)[::-1]) / m
    ys = np.minimum(np.arange(h), np.arange(h)[::-1]) / m
    t = np.clip(np.minimum.outer(ys, xs), 0, 1)
    alfa = (t * t * (3 - 2 * t) * 255).astype(np.uint8)   # suave nas duas pontas
    rgba = np.dstack([np.asarray(img), alfa])
    Image.fromarray(rgba, 'RGBA').save(destino, 'WEBP', quality=88, method=6, alpha_quality=90)
    print(f'{TERRENO:28s} terreno {w} x {h}')


def info_terreno():
    """Tamanho do mapa pintado já convertido e a cor do mar logo dentro da borda esmaecida."""
    arq = SAIDA_MAPA / f'{TERRENO}.webp'
    if not arq.exists():
        return None
    with Image.open(arq) as im:
        a = np.asarray(im.convert('RGBA')).astype(float)
    h, w = a.shape[:2]
    k = max(2, round((BORDA_TERRENO + 0.01) * w))
    anel = np.concatenate([a[k, k:w - k], a[h - 1 - k, k:w - k], a[k:h - k, k], a[k:h - k, w - 1 - k]])
    cor = '#' + ''.join(f'{round(v):02x}' for v in np.median(anel[:, :3], axis=0))
    return w, h, cor


def gravar_lista():
    nomes = sorted(p.stem for p in SAIDA.glob('*.webp'))
    lugares = sorted(p.stem for p in SAIDA_MAPA.glob('*.webp') if p.stem in LUGARES)
    terreno = info_terreno()
    linhas = ["'use strict';",
              '/* Gerado por ferramentas/artes_itens.py: os itens que já têm arte pintada (img/itens/<nome>.webp).',
              '   Mascotes têm uma arte por forma (<id>_1, _2 e _3). Item sem arte usa o símbolo it-* de index.html. */',
              'const ARTES_ITENS = new Set([']
    linhas += [f"  '{n}'," for n in nomes]
    linhas += [']);',
               '/* Lugares do mapa que já têm arte pintada (img/mapa/<nome>.webp); os outros usam o desenho de app.js. */',
               'const ARTES_MAPA = new Set([']
    linhas += [f"  '{n}'," for n in lugares]
    linhas += [']);',
               '/* Terreno pintado do mapa (img/mapa/mapa.webp): tamanho da imagem e cor do mar em volta dela.',
               '   null: o mapa usa o terreno desenhado em app.js. */']
    if terreno:
        w, h, cor = terreno
        linhas.append(f"const MAPA_PINTADO = {{ largura: {w}, altura: {h}, mar: '{cor}' }};")
    else:
        linhas.append('const MAPA_PINTADO = null;')
    linhas.append('')
    LISTA.write_text('\n'.join(linhas), encoding='utf-8', newline='\n')
    return len(nomes), len(lugares)


TIPOS = ('.png', '.jpg', '.jpeg', '.webp')


def em_dia(arq, *gerados):
    """Todos os arquivos gerados a partir da arte existem e são mais novos que ela."""
    return all(g.exists() and g.stat().st_mtime >= arq.stat().st_mtime for g in gerados)


def recortar(arq, nome):
    """A arte sem fundo (rgba em float), ou None se a borda não tiver fundo verde nem magenta."""
    with Image.open(arq) as im:
        rgb = np.asarray(im.convert('RGB'), dtype=np.float32)
    try:
        rgba, tipo, vaos = tirar_fundo(rgb, vidro=nome in VIDRO)
    except ValueError as erro:
        print(f'{arq.name}: {erro}; ficou de fora')
        return None
    print(f'{nome:28s} fundo {tipo:7s}' + (f' vãos removidos: {vaos} pontos' if vaos else ''))
    return rgba


def gravar(grande, original, destino, lado, ajuste=None):
    """Guarda o original sem fundo (se pedido) e a versão do jogo em WebP, lado x lado; o ajuste, se
    houver, vale só para a versão do jogo."""
    if original:
        grande.save(original, optimize=True)
    if ajuste:
        grande = ajuste(grande)
    pequeno = grande.convert('RGBa').resize((lado, lado), Image.LANCZOS).convert('RGBA')
    pequeno.save(destino, 'WEBP', quality=90, method=6, alpha_quality=100)


BASE_FAIXA = 0.34   # parte de baixo do desenho do lugar tratada como a base de chão
BASE_BORDA = 0.06   # largura do esmaecimento da borda da base, em fração da largura do desenho


def assentar_base(img):
    """Esmaece a borda da base de chão do desenho de um lugar, para ele assentar no terreno pintado
    sem cara de adesivo (e sem o resto de cor do fundo na borda). Só a parte de baixo é tocada: as
    paredes e os telhados do prédio continuam com o contorno inteiro."""
    rgba = np.asarray(img).copy()
    a = rgba[..., 3].astype(np.float32) / 255
    ys, xs = np.nonzero(a > 0.5)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    n = max(4, round(BASE_BORDA * (x1 - x0)))
    dentro = a > 0.5
    dist = np.zeros(a.shape, np.float32)  # distância até a borda do desenho, contada até n
    for _ in range(n):
        dentro = ~dilatar(~dentro)
        dist += dentro
    t = np.clip(dist / n, 0, 1)
    suave = t * t * (3 - 2 * t)
    altura = y1 - y0
    topo_faixa = y1 - BASE_FAIXA * altura
    w = np.clip((np.arange(a.shape[0], dtype=np.float32) - topo_faixa) / (0.45 * BASE_FAIXA * altura), 0, 1)
    w = (w * w * (3 - 2 * w))[:, None]
    rgba[..., 3] = np.round(a * (1 - w * (1 - suave)) * 255).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


# ---- chão das artes dos lugares (chao_lugares.json) ----
SOMBRA_COR = np.array([28, 20, 12], np.float32)


def linhas_de_chao():
    """Os lugares com linha de chão; as chaves que começam com _ são as explicações do arquivo."""
    if not CHAO.exists():
        return {}
    dados = json.loads(CHAO.read_text(encoding='utf-8'))
    return {k: v for k, v in dados.items() if not k.startswith('_')}


def impressao(arq):
    """Começo do SHA-1 do arquivo: diz se a arte é a mesma em que a linha de chão foi traçada."""
    return hashlib.sha1(arq.read_bytes()).hexdigest()[:12]


def _media_movel(v, r):
    k = np.ones(2 * r + 1) / (2 * r + 1)
    return np.convolve(np.pad(v, r, mode='edge'), k, mode='valid')


def linha_de_corte(rgba, dados):
    """Para cada coluna, a altura (px) abaixo da qual é chão. Parte da linha traçada e, fora das faixas
    'fixo', desce até o traço escuro mais baixo perto dela, que é o contorno de baixo da construção."""
    h, w = rgba.shape[:2]
    xs = (np.arange(w) + 0.5) / w
    p = np.array(dados['linha'], dtype=np.float64)
    corte = np.interp(xs, p[:, 0], p[:, 1]) * h
    fixo = np.zeros(w, bool)
    for a, b in dados.get('fixo', []):
        fixo |= (xs >= a) & (xs <= b)
    raio = round(dados.get('raio', 0.016) * h)
    cor = rgba[..., :3]
    tinta = (cor @ np.array([0.299, 0.587, 0.114], np.float32) < dados.get('limiar', 80)) & (rgba[..., 3] > 160)
    if not dados.get('tinta_verde'):
        tinta &= cor[..., 0] >= cor[..., 1] - 6      # traço marrom ou escuro, não folha de grama
    preso = corte.copy()
    for x in np.nonzero(~fixo)[0]:
        y0, y1 = int(max(0, corte[x] - raio)), int(min(h, corte[x] + raio))
        ys = np.nonzero(tinta[y0:y1, x])[0]
        if len(ys):
            preso[x] = y0 + ys.max() + 1.5
    mediana = np.median(np.lib.stride_tricks.sliding_window_view(np.pad(preso, 4, mode='edge'), 9), axis=1)
    return np.where(fixo, corte, mediana), fixo


def sem_soltos(rgba):
    """Tira as partes soltas no ar: só fica o que se liga à faixa de baixo do desenho (a base)."""
    h = rgba.shape[0]
    corpo = rgba[..., 3] > 128
    base = np.zeros_like(corpo)
    base[round(0.8 * h):] = True
    rgba = rgba.copy()
    rgba[..., 3] *= dilatar(inundar(base, corpo), 3)
    return rgba


def _rgb_hsv(c):
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    i = m & (mx == r)
    h[i] = ((g - b)[i] / d[i]) % 6
    i = m & (mx == g) & (mx != r)
    h[i] = (b - r)[i] / d[i] + 2
    i = m & (mx == b) & (mx != r) & (mx != g)
    h[i] = (r - g)[i] / d[i] + 4
    return h * 60, np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0), mx


def _hsv_rgb(h, s, v):
    h = (h % 360) / 60
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.zeros(h.shape + (3,), np.float32)
    for k, trio in enumerate([(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]):
        sel = i == k
        out[sel] = np.stack([c[sel] for c in trio], -1)
    return out


def ajustar_tom(rgba, tom):
    """Puxa as cores pouco saturadas de uma faixa de matiz para outro matiz (ex.: a pedra lilás da
    masmorra para o cinza-azulado das pedras do mapa), com transição suave nas pontas da faixa."""
    h, s, v = _rgb_hsv(rgba[..., :3] / 255)
    a0, a1 = tom['de']
    w = np.clip(np.minimum(h - a0, a1 - h) / 12, 0, 1) * (s < tom.get('sat_max', 0.5))
    h = h + (tom['para'] - h) * w
    s = np.clip(s * (1 + (tom.get('sat', 1) - 1) * w), 0, 1)
    v = np.clip(v * (1 + (tom.get('val', 1) - 1) * w), 0, 1)
    rgba = rgba.copy()
    rgba[..., :3] = _hsv_rgb(h, s, v) * 255
    return rgba


def apagar(rgba, ap):
    """Apaga o que está na região e fora dos polígonos 'manter' (ex.: a árvore atrás da estufa, que
    caía em cima das árvores pintadas no mapa)."""
    h, w = rgba.shape[:2]
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    x0, y0, x1, y1 = ap['regiao']
    d.rectangle([x0 * w, y0 * h, x1 * w, y1 * h], fill=255)
    for pol in ap.get('manter', []):
        d.polygon([(x * w, y * h) for x, y in pol], fill=0)
    rgba = rgba.copy()
    rgba[..., 3] *= np.asarray(m) == 0
    return rgba


def tirar_chao(img, dados):
    """Tira o chão pintado na arte do lugar (abaixo da linha de chão) e põe no pé da construção uma
    sombra que some em ~3% da altura, para ela pisar no terreno do mapa."""
    rgba = np.asarray(img.convert('RGBA')).astype(np.float32)
    if dados.get('soltos'):
        rgba = sem_soltos(rgba)
    if dados.get('tom'):
        rgba = ajustar_tom(rgba, dados['tom'])
    if dados.get('apagar'):
        rgba = apagar(rgba, dados['apagar'])
    h, w = rgba.shape[:2]
    corte, fixo = linha_de_corte(rgba, dados)
    Y = np.arange(h, dtype=np.float32)[:, None]
    t = np.clip((corte[None, :] + 2 - Y) / 4, 0, 1)            # passagem de 4 px na linha
    a = rgba[..., 3] / 255 * (t * t * (3 - 2 * t))
    d = (Y - corte[None, :]) / (0.03 * h)
    sombra = np.where(d > -0.3, np.exp(-np.clip(d, 0, None) * 2.0), 0)
    sombra *= dados.get('sombra', 0.42) * _media_movel((~fixo).astype(np.float64), round(0.025 * w))[None, :]
    sombra = np.stack([_media_movel(c, 3) for c in sombra.T]).T
    sombra = np.clip(np.stack([_media_movel(l, 4) for l in sombra]), 0, 1).astype(np.float32)
    total = a + sombra * (1 - a)
    cor = (rgba[..., :3] * a[..., None] + SOMBRA_COR * (sombra * (1 - a))[..., None]) / np.maximum(total, 1e-6)[..., None]
    out = np.dstack([np.clip(cor, 0, 255), np.clip(total * 255, 0, 255)])
    return Image.fromarray(np.round(out).astype(np.uint8), 'RGBA')


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
        if not arq.is_file() or arq.suffix.lower() not in TIPOS:
            continue
        nome = arq.stem
        if nome not in validos:
            ignoradas.append(arq.name)
            continue
        icone = SAIDA / f'{nome}.webp'
        original = originais / f'{nome}.png' if originais else None
        if not tudo and em_dia(arq, icone, *([original] if original else [])):
            puladas += 1
            continue
        rgba = recortar(arq, nome)
        if rgba is not None:
            gravar(enquadrar(rgba, LADO_ORIGINAL), original, icone, LADO_ICONE)
            feitas += 1

    # lugares do mapa, na subpasta mapa/
    pasta_mapa = entrada / 'mapa'
    if pasta_mapa.is_dir():
        SAIDA_MAPA.mkdir(parents=True, exist_ok=True)
        originais_mapa = originais / 'mapa' if originais else None
        if originais_mapa:
            originais_mapa.mkdir(parents=True, exist_ok=True)
        linhas = linhas_de_chao()
        for arq in sorted(pasta_mapa.iterdir()):
            if not arq.is_file() or arq.suffix.lower() not in TIPOS:
                continue
            nome = arq.stem
            if nome == TERRENO:
                destino = SAIDA_MAPA / f'{nome}.webp'
                if not tudo and em_dia(arq, destino):
                    puladas += 1
                else:
                    converter_terreno(arq, destino)
                    feitas += 1
                continue
            if nome not in LUGARES:
                ignoradas.append(f'mapa/{arq.name}')
                continue
            destino = SAIDA_MAPA / f'{nome}.webp'
            original = originais_mapa / f'{nome}.png' if originais_mapa else None
            chao = linhas.get(nome)
            if chao and chao.get('arte') != impressao(arq):
                print(f'{nome}: a arte mudou depois que a linha de chão foi traçada em {CHAO.name}; '
                      'vai com a base só esmaecida até a linha ser traçada de novo')
                chao = None
            linha_nova = chao and destino.exists() and CHAO.stat().st_mtime > destino.stat().st_mtime
            if not tudo and not linha_nova and em_dia(arq, destino, *([original] if original else [])):
                puladas += 1
                continue
            rgba = recortar(arq, nome)
            if rgba is not None:
                ajuste = (lambda im, d=chao: tirar_chao(im, d)) if chao else assentar_base
                gravar(enquadrar_lugar(rgba, LADO_LUGAR_ORIGINAL), original, destino, LADO_LUGAR, ajuste)
                feitas += 1

    n_itens, n_lugares = gravar_lista()
    print(f'\nfeitas: {feitas} · em dia: {puladas} · artes no jogo: {n_itens} de itens e {n_lugares} de lugares do mapa')
    if ignoradas:
        print('ignoradas (o nome não é de nenhum item nem lugar do mapa):', ', '.join(ignoradas))


if __name__ == '__main__':
    main()
