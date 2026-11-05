# -*- coding: utf-8 -*-
"""Gera o banco final do jogo a partir de dados/registros_questoes.json.

Passos: aplica as exclusões, remove repetidas, calcula competência e dificuldade,
gera as imagens em WebP e grava questoes.json.

Uso: 06_gerar_banco_final.py [--sem-imagens]
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
    em frações da altura e da largura do recorte."""
    saida = {}
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
    return saida


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
    (BUILD / "questoes.json").write_text(json.dumps(banco, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8")
    tamanho = sum(p.stat().st_size for p in (BUILD / "img").iterdir())
    print(f"\nimagens: {len(list((BUILD / 'img').iterdir()))}, {tamanho / 1e6:.0f} MB")


if __name__ == "__main__":
    main()
