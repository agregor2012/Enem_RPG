# -*- coding: utf-8 -*-
"""Leitura dos gabaritos em PDF e dos arquivos oficiais ITENS_PROVA."""
import csv
import glob
import re
from pathlib import Path

import pymupdf

RAIZ = Path(__file__).resolve().parent.parent
RE_ANULADA = re.compile(r"^(ANULAD[AO]S?|ANULA|X|\*+)$", re.I)


def ler_itens(ano):
    """Linhas do ITENS_PROVA do ano (Linguagens e Humanas), com tipos já convertidos."""
    arquivos = [f for f in glob.glob(str(RAIZ / "dados" / "microdados" / str(ano) / "*"))
                if f.lower().endswith(".csv")]
    bruto = Path(arquivos[0]).read_bytes()
    try:
        texto = bruto.decode("utf-8-sig")
    except UnicodeDecodeError:
        texto = bruto.decode("latin-1")
    linhas = []
    for r in csv.DictReader(texto.splitlines(), delimiter=";"):
        if r["SG_AREA"] not in ("LC", "CH"):
            continue
        linhas.append({
            "area": r["SG_AREA"],
            "pos": int(r["CO_POSICAO"]),
            "item": int(r["CO_ITEM"]) if r["CO_ITEM"].strip() else None,  # vazio: anulada em 2009
            "gab": r["TX_GABARITO"].strip().upper(),
            "hab": int(float(r["CO_HABILIDADE"])) if r.get("CO_HABILIDADE", "").strip() else None,
            "anulado": r["IN_ITEM_ABAN"].strip() not in ("", "0", "0.0"),
            "motivo": (r.get("TX_MOTIVO_ABAN") or "").strip(),
            "a": _num(r.get("NU_PARAM_A")),
            "b": _num(r.get("NU_PARAM_B")),
            "c": _num(r.get("NU_PARAM_C")),
            "cor": r["TX_COR"].strip().upper(),
            # a prova digital de 2020 tem uma ordem para cada língua, no mesmo CO_PROVA
            "prova": int(r["CO_PROVA"]) * 10 + int(r["TP_VERSAO_DIGITAL"])
                     if (r.get("TP_VERSAO_DIGITAL") or "").strip() else int(r["CO_PROVA"]),
            "lingua": _lingua(r.get("TP_LINGUA")),
            "adaptado": (r.get("IN_ITEM_ADAPTADO") or "0").strip() == "1",
        })
    return linhas


def _num(v):
    try:
        return float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return None


def _lingua(v):
    v = (v or "").strip()
    if v == "":
        return None
    return int(float(v))


def provas_por_codigo(linhas):
    """{(area, co_prova): {"cor":…, "porpos": {(pos, lingua): linha}}}"""
    saida = {}
    for r in linhas:
        p = saida.setdefault((r["area"], r["prova"]), {"cor": r["cor"], "linhas": []})
        p["linhas"].append(r)
    for p in saida.values():
        # Em 2017 o CSV numera 1-5 inglês, 6-10 espanhol e 11-50 o resto da prova,
        # enquanto o caderno imprime 1-5 duas vezes e segue do 6 ao 45.
        sequencial = any(r["pos"] == 6 and r["lingua"] == 1 for r in p["linhas"])
        p["porpos"] = {}
        for r in p["linhas"]:
            pos = r["pos"] - 5 if sequencial and r["pos"] > 5 else r["pos"]
            p["porpos"][(pos, r["lingua"])] = r
    return saida


def ler_gabarito_pdf(caminho):
    """Lê um gabarito em tabela.

    Devolve {numero: [letras em ordem de leitura]}. Em linhas com duas respostas para o
    mesmo número (inglês e espanhol) a lista tem dois elementos. Quando o PDF traz várias
    cores lado a lado (2009) a lista traz uma letra por cor. Anulada vira "X".
    Asterisco marca gabarito retificado pelo INEP: vale a letra que ele acompanha.
    """
    doc = pymupdf.open(caminho)
    por_fluxo, por_linha = {}, {}
    for page in doc:
        palavras = page.get_text("words")
        for num, letras in _pares_no_fluxo(palavras):
            por_fluxo.setdefault(num, []).extend(letras)
        for num, letras in _pares_por_linha(palavras):
            por_linha.setdefault(num, []).extend(letras)
    return por_fluxo if len(por_fluxo) >= len(por_linha) else por_linha


def _letra(token):
    """Normaliza um token de resposta; "" indica asterisco solto."""
    v = token.upper().replace("*", "").strip()
    if v == "" and "*" in token:
        return ""
    if re.fullmatch(r"[A-E]", v):
        return v
    if RE_ANULADA.match(token.strip()):
        return "X"
    return None


def _colher(tokens):
    """Percorre tokens e devolve pares número + respostas que vêm logo depois."""
    i = 0
    while i < len(tokens):
        tok = tokens[i].strip()
        if re.fullmatch(r"\d{1,3}", tok) and 1 <= int(tok) <= 180:
            letras, j = [], i + 1
            while j < len(tokens):
                v = _letra(tokens[j])
                if v is None:
                    break
                if v:
                    letras.append(v)
                j += 1
            if letras:
                yield int(tok), letras
            i = max(j, i + 1)
        else:
            i += 1


def _pares_no_fluxo(palavras):
    """Ordem interna do PDF: é a mais fiel quando as linhas da tabela têm alturas diferentes."""
    yield from _colher([w[4] for w in palavras])


def _pares_por_linha(palavras):
    linhas = []
    for w in sorted(palavras, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        meio = (w[1] + w[3]) / 2
        if linhas and abs(linhas[-1][0] - meio) < 4:
            linhas[-1][1].append(w)
        else:
            linhas.append([meio, [w]])
    for _, ws in linhas:
        yield from _colher([w[4] for w in sorted(ws, key=lambda w: w[0])])


def gabarito_antigo_pdf(ano):
    """Gabarito publicado de 2005 a 2007, cada ano em um formato (2008 é uma imagem)."""
    caminho = RAIZ / "dados" / "microdados" / str(ano) / f"ENEM_{ano}_GAB1_AMARELA.pdf"
    texto = "\n".join(p.get_text() for p in pymupdf.open(caminho))
    if ano == 2005:
        return {n: v[0] for n, v in ler_gabarito_pdf(caminho).items()}
    if ano == 2006:
        saida = {}
        blocos = re.findall(r"Questão\s+((?:\d+\s+)+)Gabarito\s+((?:[A-E]\s+)+)", texto)
        for numeros, letras in blocos:
            saida.update(zip(map(int, numeros.split()), letras.split()))
        for n, l in re.findall(r"(\d+)\s*\n\s*([A-E])\s*\n", texto):
            saida.setdefault(int(n), l)
        return saida
    if ano == 2007:
        return {int(n): l for n, l in re.findall(r"Q(\d+)\s+([A-E])", texto)}
    return {}


def concordancia(gabarito, prova, deslocamentos=(0, 45, -45, 90, -90), lingua_fixa=None):
    """Compara um gabarito em PDF com uma prova dos microdados.

    Os números impressos e o CO_POSICAO nem sempre coincidem (ex.: Humanas de 2017
    aparece como 1-45 no CSV e 46-90 na prova), por isso testa deslocamentos.
    Devolve (fração de acertos, comparados, deslocamento).
    """
    melhor = (0.0, 0, 0)
    for d in deslocamentos:
        iguais = total = 0
        for (pos, lingua), r in prova["porpos"].items():
            letras = gabarito.get(pos + d)
            if not letras or (lingua_fixa is not None and lingua not in (None, lingua_fixa)):
                continue
            if lingua in (0, 1) and len(letras) >= 2:
                letra = letras[lingua]
            else:
                letra = letras[0]
            total += 1
            iguais += letra == r["gab"] or "X" in (letra, r["gab"])
        if total >= 30 and iguais / total > melhor[0]:
            melhor = (iguais / total, total, d)
    return melhor
