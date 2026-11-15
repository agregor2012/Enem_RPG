# -*- coding: utf-8 -*-
"""Gera o banco final do jogo a partir de dados/registros_questoes.json.

Passos: aplica as exclusões, remove repetidas, calcula competência e dificuldade,
gera as imagens em WebP, acha na imagem a letra impressa de cada alternativa (onde o jogo
marca a escolha e a correção), com o mesmo tamanho em toda a prova, e grava questoes.json.

Uso: 06_gerar_banco_final.py [--sem-imagens | --so-alternativas]
(--so-alternativas atualiza só as caixas das alternativas no questoes.json já gerado.)
Saída: <build>/banco/ e dados/relatorio_banco.json
"""
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from recorte import Fragmento, Prova

RAIZ = Path(__file__).resolve().parent.parent
BUILD = Path(os.environ["LOCALAPPDATA"]) / "ENEM-RPG-build" / "banco"
DPI_COLUNA = 180
DPI_LARGO = 150  # recorte de margem a margem: já sai grande o bastante
APLICACOES = {"regular": "r", "segunda_aplicacao": "s", "terceira_aplicacao": "t",
              "belem": "b", "digital": "d", "reaplicacao_ppl": "p"}
PRIORIDADE = {"regular": 0, "segunda_aplicacao": 1, "terceira_aplicacao": 2, "belem": 3,
              "digital": 4, "reaplicacao_ppl": 5}
# recorte com sinal de problema na auditoria automática
SINAIS_GRAVES = ("linha_cortada_na_lateral", "mais_de_uma_questao", "sem_recorte", "sem_alternativas")
# conferidas uma a uma nas folhas de contato: o alerta era falso (ano, aplicação, área, número)
CONFERIDAS = set(json.loads((RAIZ / "ferramentas" / "conferidas.json").read_text(encoding="utf-8")))
# recortes que passaram na auditoria, mas estão errados quando vistos
REPROVADAS = set(json.loads((RAIZ / "ferramentas" / "reprovadas.json").read_text(encoding="utf-8")))
# habilidades de cada competência, como nas Matrizes de Referência do Enem (INEP)
FAIXAS_HAB = {"LC": [(1, 4), (5, 8), (9, 11), (12, 14), (15, 17), (18, 20), (21, 24), (25, 27), (28, 30)],
              "CH": [(1, 5), (6, 10), (11, 15), (16, 20), (21, 25), (26, 30)],
              "CN": [(1, 4), (5, 7), (8, 12), (13, 16), (17, 19), (20, 23), (24, 27), (28, 30)],
              "MT": [(1, 5), (6, 9), (10, 14), (15, 18), (19, 23), (24, 26), (27, 30)]}


def chave(r):
    return f"{r['ano']}-{r['aplicacao']}-{r['area']}-{r['n']}-{r['lingua']}"


def competencia(area, hab):
    if hab is None:
        return None
    for i, (a, b) in enumerate(FAIXAS_HAB[area], 1):
        if a <= hab <= b:
            return i
    return None


def texto_normal(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", t)


def texto_confiavel(t):
    """Texto do PDF legível o bastante para comparar (2021 tem fontes embaralhadas)."""
    if len(t) < 120:
        return False
    return sum(c.isalpha() and c.isascii() or c == " " for c in t) / len(t) > 0.8


def selecionar(regs):
    """Separa o que entra do que sai, sempre registrando o motivo."""
    fora, dentro = [], []
    for r in regs:
        if r.get("excluida"):
            fora.append((r, r["excluida"]))
        elif chave(r) in REPROVADAS:
            fora.append((r, "recorte reprovado na conferência visual"))
        elif any(a in SINAIS_GRAVES for a in r["_avisos"]) and chave(r) not in CONFERIDAS:
            fora.append((r, "recorte não confiável na auditoria automática"))
        elif not r.get("gab") or r["gab"] not in "ABCDE":
            fora.append((r, "sem gabarito válido"))
        else:
            dentro.append(r)
    dentro.sort(key=lambda r: (PRIORIDADE[r["aplicacao"]], -r["ano"]))
    vistos_item, vistos_texto, finais, repetidas = {}, {}, [], []
    for r in dentro:
        marca = texto_normal(r["_texto"])[:260] if texto_confiavel(r["_texto"]) else None
        igual = None
        if r["item"] and r["item"] in vistos_item:
            igual = vistos_item[r["item"]]
        elif marca and marca in vistos_texto:
            igual = vistos_texto[marca]
        if igual is not None:
            igual.setdefault("tambem", []).append(f"{r['ano']} {r['aplicacao']}")
            repetidas.append(r)
            continue
        if r["item"]:
            vistos_item[r["item"]] = r
        if marca:
            vistos_texto[marca] = r
        finais.append(r)
    return finais, fora, repetidas


def niveis_dificuldade(regs):
    """Terços do parâmetro b da TRI dentro de cada área: 1 fácil, 2 média, 3 difícil."""
    por_area = defaultdict(list)
    for r in regs:
        if r.get("b") is not None:
            por_area[r["area"]].append(r["b"])
    cortes = {}
    for area, valores in por_area.items():
        valores.sort()
        cortes[area] = (valores[len(valores) // 3], valores[2 * len(valores) // 3])
    for r in regs:
        if r.get("b") is None:
            r["nivel"] = 0
        else:
            baixo, alto = cortes[r["area"]]
            r["nivel"] = 1 if r["b"] < baixo else (2 if r["b"] < alto else 3)
    return cortes


def identificador(r):
    if r["item"]:
        return f"i{r['item']}"
    sufixo = "" if r["lingua"] is None else "ie"[r["lingua"]]
    return f"q{r['ano']}{APLICACOES[r['aplicacao']]}{r['n']:03d}{sufixo}"


def caixas_alternativas(r):
    """Retângulo de cada alternativa no seu recorte: [recorte, topo, base, esquerda, direita],
    em frações da altura e da largura do recorte, seguido da caixa da letra impressa
    (esquerda, topo, direita, base), onde o jogo marca a escolha e a correção."""
    saida = {}
    letras = r.get("_letra", {})
    for letra, (pag, _cel, topo, base, esq, dir_) in r["_alt"].items():
        meio_y, meio_x = (topo + base) / 2, (esq + dir_) / 2
        idx = next((j for j, f in enumerate(r["_frag"])
                    if f[5] == "questao" and f[0] == pag and f[2] - 2 <= meio_y <= f[4] + 2
                    and f[1] - 2 <= meio_x <= f[3] + 2), None)
        if idx is None:
            return {}
        _, x0, y0, x1, y1, _ = r["_frag"][idx]
        em_y = lambda v: round(min(max((v - y0) / (y1 - y0), 0), 1), 4)
        em_x = lambda v: round(min(max((v - x0) / (x1 - x0), 0), 1), 4)
        saida[letra] = [idx, em_y(topo), em_y(base), em_x(esq), em_x(dir_)]
        if letra in letras and letras[letra][0] == pag:
            _, lx0, ly0, lx1, ly1 = letras[letra]
            saida[letra] += [em_x(lx0), em_y(ly0), em_x(lx1), em_y(ly1)]
    return saida


LIMIAR_TINTA = 175          # abaixo disto (de 0 a 255) é tinta: pega também a borda suavizada do círculo
TOLERANCIA_LETRA = 0.15     # letra achada com tamanho até 15% longe do padrão da prova vale como achada


def _pedacos_de_tinta(m):
    """Caixas [x0, y0, x1, y1] dos pedaços de tinta ligados (vizinhos de lado) de uma máscara pequena,
    juntando os trechos de cada linha que encostam nos da linha de cima."""
    pai, trechos, acima = [], [], []

    def raiz(a):
        while pai[a] != a:
            pai[a] = pai[pai[a]]
            a = pai[a]
        return a

    for y in range(m.shape[0]):
        borda = np.diff(np.concatenate(([0], m[y].astype(np.int8), [0])))
        linha = []
        for a, b in zip(np.nonzero(borda == 1)[0], np.nonzero(borda == -1)[0]):
            i = len(pai)
            pai.append(i)
            for pa, pb, j in acima:
                if pa < b and a < pb:
                    ri, rj = raiz(i), raiz(j)
                    if ri != rj:
                        pai[ri] = rj
            linha.append((a, b, i))
            trechos.append((y, a, b, i))
        acima = linha
    caixas = {}
    for y, a, b, i in trechos:
        c = caixas.setdefault(raiz(i), [a, y, b, y + 1])
        c[0], c[1], c[2], c[3] = min(c[0], a), min(c[1], y), max(c[2], b), max(c[3], y + 1)
    return list(caixas.values())


def letra_impressa(cinza, X0, Y0, X1, Y1, parenteses=False):
    """Caixa (x0, y0, x1, y1), em px, da letra impressa da alternativa cuja caixa o PDF dá em X0..Y1:
    o círculo inteiro (cheio ou só contornado) ou, nas provas com "(A)", o rótulo com os parênteses.

    O ponto de partida é o meio da parte esquerda da caixa do PDF: a fonte das letras em círculo
    declara a letra mais larga do que o círculo, e a prova digital de 2020 dá só a letra de dentro
    dele. Vale o maior pedaço de tinta que cobre esse ponto (o círculo, e não a letra dentro dele).
    Em parte de 2010 o círculo fica logo à esquerda da caixa, sem cobri-la: aí vale o pedaço de tinta
    que termina ali. Devolve None quando não acha nada plausível."""
    H, W = cinza.shape
    lh = Y1 - Y0
    if lh <= 0 or X1 <= X0:
        return None
    x0, x1 = max(0, int(X0 - 1.6 * lh)), min(W, int(X1 + 1.2 * lh) + 1)
    y0, y1 = max(0, int(Y0 - 1.0 * lh)), min(H, int(Y1 + 1.0 * lh) + 1)
    pedacos = [c for c in _pedacos_de_tinta(cinza[y0:y1, x0:x1] < LIMIAR_TINTA)
               if c[2] - c[0] <= 2.6 * lh and c[3] - c[1] <= 2.6 * lh]
    if parenteses:
        # "(A)": a caixa do PDF é o rótulo e o espaço depois dele; valem os pedaços dentro dela
        fim = X1 - 0.12 * (X1 - X0) - x0
        rotulo = [c for c in pedacos if c[0] < fim and c[2] > X0 - x0 and c[1] < Y1 - y0 and c[3] > Y0 - y0]
        if not rotulo:
            return None
        return (x0 + min(c[0] for c in rotulo), y0 + min(c[1] for c in rotulo),
                x0 + max(c[2] for c in rotulo), y0 + max(c[3] for c in rotulo))
    px, py = X0 + 0.5 * min(X1 - X0, lh) - x0, (Y0 + Y1) / 2 - y0
    cobrem = [c for c in pedacos if c[0] <= px < c[2] and c[1] <= py < c[3]]
    if cobrem:
        nucleo = max(cobrem, key=lambda c: (c[2] - c[0]) * (c[3] - c[1]))
    else:
        antes = [c for c in pedacos if X0 - 0.9 * lh - x0 <= c[2] <= X0 + 0.3 * lh - x0
                 and c[1] < py < c[3] and 0.6 * lh <= c[3] - c[1] <= 1.8 * lh]
        if not antes:
            return None
        nucleo = max(antes, key=lambda c: c[2])
    return (x0 + nucleo[0], y0 + nucleo[1], x0 + nucleo[2], y0 + nucleo[3])


def letras_da_questao(q, parenteses):
    """Letra impressa de cada alternativa da questão no recorte já gerado (roda em processo separado).
    Devolve (id, {letra: caixa em px, ou None})."""
    achadas = {}
    por_imagem = defaultdict(list)
    for letra, z in q["alt"].items():
        if len(z) == 9:
            por_imagem[z[0]].append(letra)
    for idx, letras in por_imagem.items():
        with Image.open(BUILD / "img" / q["img"][idx][0]) as im:
            cinza = np.asarray(im.convert("L"))
        H, W = cinza.shape
        for letra in letras:
            z = q["alt"][letra]
            achadas[letra] = letra_impressa(cinza, z[5] * W, z[6] * H, z[7] * W, z[8] * H, parenteses)
    return q["id"], achadas


def prova_da_questao(q):
    return q["ano"], q["apl"], q["area"]


def ajustar_letras(banco):
    """Põe em cada alternativa a caixa da letra impressa, com o mesmo tamanho em toda a prova.

    1. Acha a letra de cada alternativa no recorte (letra_impressa), em paralelo.
    2. Em cada prova, o tamanho padrão é a mediana das letras achadas, e o deslocamento padrão é a
       mediana da distância entre o centro achado e a caixa do PDF. Questão cujas letras concordam
       entre si num tamanho diferente (letras maiores numa questão de figuras, por exemplo) fica com
       o tamanho dela.
    3. Cada letra fica com o tamanho padrão, centrada no que foi achado. Letras da mesma coluna ficam
       todas no x do meio delas. A que não foi achada, ou saiu com tamanho fora do padrão (pegou um
       pedaço do texto ao lado, por exemplo), fica na coluna das outras ou, sem coluna, na caixa do
       PDF mais o deslocamento padrão, e vai para a lista de conferência (letras_conferir.json)."""
    por_prova = defaultdict(list)
    for q in banco:
        por_prova[prova_da_questao(q)].append(q)
    # "(A)" no lugar da letra em círculo (2005): a caixa do PDF é mais de duas vezes mais larga que alta
    parenteses = {}
    for k, qs in por_prova.items():
        formato = [(z[7] - z[5]) * q["img"][z[0]][1] / max((z[8] - z[6]) * q["img"][z[0]][2], 1e-6)
                   for q in qs for z in q["alt"].values() if len(z) == 9]
        parenteses[k] = bool(formato) and float(np.median(formato)) > 2.0
    with ProcessPoolExecutor(max_workers=6) as ex:
        achadas = dict(ex.map(letras_da_questao, banco, [parenteses[prova_da_questao(q)] for q in banco], chunksize=40))
    contagem = Counter()
    conferir = []         # letras que não foram achadas na imagem, para a conferência visual
    for k, qs in por_prova.items():
        medidas = []      # (letra achada, questão, letra), tamanho e centro em pontos
        for q in qs:
            for l, c in achadas[q["id"]].items():
                if c:
                    z = q["alt"][l]
                    _, W, H, _, dpi = q["img"][z[0]]
                    e = 72 / dpi
                    medidas.append(((c[2] - c[0]) * e, (c[3] - c[1]) * e,
                                    ((c[0] + c[2]) / 2 - z[5] * W) * e, ((c[1] + c[3]) / 2 - (z[6] + z[8]) / 2 * H) * e))
        if not medidas:
            contagem["prova sem letra achada"] += 1
            continue
        lw = float(np.median([m[0] for m in medidas]))
        lh = float(np.median([m[1] for m in medidas]))
        boas = [m for m in medidas if abs(m[0] - lw) <= TOLERANCIA_LETRA * lw and abs(m[1] - lh) <= TOLERANCIA_LETRA * lh]
        dx = float(np.median([m[2] for m in boas]))
        dy = float(np.median([m[3] for m in boas]))
        for q in qs:
            por_imagem = defaultdict(list)
            for l, z in q["alt"].items():
                if len(z) == 9:
                    por_imagem[z[0]].append(l)
            for idx, letras in por_imagem.items():
                _, W, H, _, dpi = q["img"][idx]
                p = dpi / 72                     # px por ponto
                tamanho = {}                     # tamanho achado (pt) das letras plausíveis desta imagem
                for l in letras:
                    c = achadas[q["id"]].get(l)
                    if c and 0.6 * lw <= (c[2] - c[0]) / p <= 1.6 * lw and 0.6 * lh <= (c[3] - c[1]) / p <= 1.6 * lh:
                        tamanho[l] = ((c[2] - c[0]) / p, (c[3] - c[1]) / p)
                qw, qh = lw, lh
                if len(tamanho) >= 2:
                    mw = float(np.median([t[0] for t in tamanho.values()]))
                    mh = float(np.median([t[1] for t in tamanho.values()]))
                    juntas = [t for t in tamanho.values() if abs(t[0] - mw) <= 0.1 * mw and abs(t[1] - mh) <= 0.1 * mh]
                    # só letras de outro tamanho de verdade; diferença pequena é a borda suavizada da imagem
                    outro = abs(mw - lw) > 0.1 * lw or abs(mh - lh) > 0.1 * lh
                    if outro and len(juntas) >= max(2, 0.6 * len(letras)):
                        qw, qh = mw, mh
                centros = {l: [(achadas[q["id"]][l][0] + achadas[q["id"]][l][2]) / 2, (achadas[q["id"]][l][1] + achadas[q["id"]][l][3]) / 2]
                           for l, t in tamanho.items()
                           if abs(t[0] - qw) <= TOLERANCIA_LETRA * qw and abs(t[1] - qh) <= TOLERANCIA_LETRA * qh}
                # coluna: letras achadas com o x quase igual (alternativas uma embaixo da outra)
                xs = sorted(v[0] for v in centros.values())
                coluna = xs[len(xs) // 2] if len(xs) >= 2 and xs[-1] - xs[0] <= 0.3 * qw * p else None
                for l in letras:
                    z = q["alt"][l]
                    pdf_x, pdf_y = z[5] * W + dx * p, (z[6] + z[8]) / 2 * H + dy * p
                    if l in centros:
                        cx, cy = centros[l]
                        contagem["achada"] += 1
                    elif coluna is not None and abs(pdf_x - coluna) <= 0.6 * qw * p:
                        cx, cy = coluna, pdf_y
                        contagem["na coluna das outras"] += 1
                        conferir.append([q["id"], l, "na coluna das outras"])
                    else:
                        cx, cy = pdf_x, pdf_y
                        contagem["pela caixa do PDF"] += 1
                        conferir.append([q["id"], l, "pela caixa do PDF"])
                    if coluna is not None and abs(cx - coluna) <= 0.3 * qw * p:
                        cx = coluna
                    a, b = qw * p / 2, qh * p / 2
                    z[5:9] = [round((cx - a) / W, 4), round((cy - b) / H, 4), round((cx + a) / W, 4), round((cy + b) / H, 4)]
    print("letras das alternativas:", dict(contagem))
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "letras_conferir.json").write_text(json.dumps(conferir, ensure_ascii=False), encoding="utf-8")


def apagar_aneis(imagem, caixas):
    """Tira os círculos verdes que marcam a resposta certa em alguns PDFs."""
    if not caixas:
        return
    pixels = imagem.load()
    largura, altura = imagem.size
    for x0, y0, x1, y1 in caixas:
        for y in range(max(y0, 0), min(y1, altura)):
            for x in range(max(x0, 0), min(x1, largura)):
                r, g, b = pixels[x, y]
                if g - r > 18 and g >= b - 8:
                    pixels[x, y] = (255, 255, 255)


def renderizar_pdf(args):
    """Gera as imagens de todas as questões de um PDF (roda em processo separado)."""
    pdf, questoes = args
    prova = Prova(RAIZ / pdf, numeracao_continua="ENEM_200" in pdf)
    saida = []
    for q in questoes:
        imagens = []
        for i, (pag, x0, y0, x1, y1, papel) in enumerate(q["_frag"]):
            frag = Fragmento(pag, x0, y0, x1, y1, papel)
            dpi = DPI_LARGO if x1 - x0 > 400 else DPI_COLUNA
            px = prova.renderizar(frag, dpi)
            imagem = Image.frombytes("RGB", (px.width, px.height), px.samples)
            apagar_aneis(imagem, prova.aneis_no_recorte(frag, dpi))
            nome = f"{q['id']}_{i}.webp"
            imagem.save(BUILD / "img" / nome, format="WEBP", lossless=True, quality=70, method=4)
            imagens.append([nome, px.width, px.height, 1 if papel == "apoio" else 0, dpi])
        saida.append({"id": q["id"], "img": imagens})
    return saida


def main():
    dados = json.loads((RAIZ / "dados" / "registros_questoes.json").read_text(encoding="utf-8"))
    regs = dados["registros"]
    finais, fora, repetidas = selecionar(regs)
    cortes = niveis_dificuldade(finais)
    for r in finais:
        r["id"] = identificador(r)
    ids = Counter(r["id"] for r in finais)
    assert max(ids.values()) == 1, ids.most_common(3)

    banco = []
    for r in finais:
        banco.append({
            "id": r["id"], "ano": r["ano"], "apl": APLICACOES[r["aplicacao"]], "area": r["area"],
            "n": r["n"], "ling": r["lingua"], "gab": r["gab"], "hab": r.get("hab"),
            "comp": competencia(r["area"], r.get("hab")), "nivel": r["nivel"],
            "fontes": r["fontes_gabarito"], "alt": caixas_alternativas(r),
            "tambem": r.get("tambem", []),
        })
    relatorio = {
        "total_registros": len(regs), "no_banco": len(banco), "repetidas": len(repetidas),
        "fora": [{"ano": r["ano"], "aplicacao": r["aplicacao"], "area": r["area"], "numero": r["n"],
                  "lingua": r["lingua"], "motivo": m} for r, m in fora],
        "cortes_dificuldade": cortes,
        "por_ano": sorted(Counter(r["ano"] for r in finais).items()),
        "por_area": Counter(r["area"] for r in finais),
    }
    (RAIZ / "dados" / "relatorio_banco.json").write_text(
        json.dumps(relatorio, ensure_ascii=False, indent=1), encoding="utf-8")
    contagem = Counter("anuladas" if "anulada" in m else ("divergentes" if "divergent" in m else "recorte")
                       for _, m in fora)
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "fora.json").write_text(json.dumps({**contagem, "fora": relatorio["fora"]}, ensure_ascii=False),
                                     encoding="utf-8")
    print("no banco:", len(banco), "| fora:", len(fora), "| repetidas:", len(repetidas))
    print(Counter(re.sub(r" \(.*", "", m) for _, m in fora))
    print(relatorio["por_ano"], relatorio["por_area"])
    if "--so-alternativas" in sys.argv:
        # só as caixas das alternativas mudaram: atualiza o questoes.json já gerado, sem refazer as imagens
        atual = json.loads((BUILD / "questoes.json").read_text(encoding="utf-8"))
        novas = {q["id"]: q["alt"] for q in banco}
        if {q["id"] for q in atual} != set(novas):
            sys.exit("as questões do banco mudaram: rode o 06 completo")
        for q in atual:
            q["alt"] = novas[q["id"]]
        ajustar_letras(atual)
        (BUILD / "questoes.json").write_text(json.dumps(atual, ensure_ascii=False, separators=(",", ":")),
                                             encoding="utf-8")
        print("caixas das alternativas atualizadas:", len(atual))
        return
    if "--sem-imagens" in sys.argv:
        return

    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "img").mkdir(exist_ok=True)
    por_pdf = defaultdict(list)
    for r in finais:
        por_pdf[r["_pdf"]].append({"id": r["id"], "_frag": r["_frag"]})
    resultado = {}
    with ProcessPoolExecutor(max_workers=6) as ex:
        for feitos in ex.map(renderizar_pdf, por_pdf.items()):
            for q in feitos:
                resultado[q["id"]] = q["img"]
            print(".", end="", flush=True)
    for q in banco:
        q["img"] = resultado[q["id"]]
    ajustar_letras(banco)
    (BUILD / "questoes.json").write_text(json.dumps(banco, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8")
    tamanho = sum(p.stat().st_size for p in (BUILD / "img").iterdir())
    print(f"\nimagens: {len(list((BUILD / 'img').iterdir()))}, {tamanho / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
