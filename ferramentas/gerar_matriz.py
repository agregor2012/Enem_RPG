# -*- coding: utf-8 -*-
"""Gera dados/matriz.json a partir das Matrizes de Referência do Enem (INEP).

O PDF oficial é baixado pelo script 04 em documentos_redacao/. Ele traz as quatro áreas na
ordem Linguagens, Matemática, Ciências da Natureza e Ciências Humanas; cada área é uma
sequência de "Competência de área N" seguida das habilidades "Hn – ...".

Uso: gerar_matriz.py
Saída: dados/matriz.json ({área: {"competencias": {n: texto}, "habilidades": {n: texto}}})
"""
import json
import re
import sys
from pathlib import Path

import pymupdf

RAIZ = Path(__file__).resolve().parent.parent
PDF = RAIZ / "documentos_redacao" / "matriz_de_referencia_enem.pdf"
ORDEM = ("LC", "MT", "CN", "CH")
# linhas de cabeçalho e rodapé das páginas, que caem no meio do texto
RUIDO = re.compile(r"^(MATRIZES DE REFERÊNCIA|ENEM|VOLTAR PARA|O SUMÁRIO|\d{1,2}|[A-ZÁÂÃÉÊÍÓÔÕÚÇ ,]+|"
                   r"E SUAS TECNOLOGIAS|TECNOLOGIAS)$")


def juntar(linhas):
    texto = ""
    for l in linhas:
        if texto.endswith("­"):  # hífen de quebra de linha do PDF
            texto = texto[:-1] + l
        elif texto.endswith("-") and l[:1].islower():
            texto += l
        else:
            texto = f"{texto} {l}" if texto else l
    return re.sub(r"\s+", " ", texto).strip()


def ler():
    linhas = []
    for pagina in pymupdf.open(PDF):
        for l in pagina.get_text().splitlines():
            l = re.sub(r"\s+", " ", l).strip()  # o PDF põe tabulação depois do travessão
            if l and not RUIDO.match(l):
                linhas.append(l)
    areas, atual, comp, alvo = [], None, None, None
    for l in linhas:
        if l.startswith("SEÇÃO") and len(areas) >= len(ORDEM):
            break  # depois das quatro áreas vem a matriz da redação
        m = re.fullmatch(r"Competência de área (\d+)", l)
        if m:
            n = int(m.group(1))
            if n == 1:
                atual = {"competencias": {}, "habilidades": {}}
                areas.append(atual)
            comp = atual["competencias"].setdefault(str(n), [])
            alvo = comp
            continue
        if atual is None:
            continue
        m = re.match(r"H(\d+) ?[–-] ?(.*)", l)
        if m:
            alvo = atual["habilidades"].setdefault(m.group(1), [m.group(2)])
            continue
        if alvo is not None:
            alvo.append(l)
    # as quatro primeiras sequências completas são as áreas; o resto do PDF são os
    # objetos de conhecimento, que não usamos
    saida = {}
    for sigla, area in zip(ORDEM, areas):
        saida[sigla] = {"competencias": {k: juntar(v) for k, v in area["competencias"].items()},
                        "habilidades": {k: juntar(v) for k, v in area["habilidades"].items()}}
    return {s: saida[s] for s in ("LC", "CH", "CN", "MT")}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    matriz = ler()
    for area, dados in matriz.items():
        assert len(dados["habilidades"]) == 30, (area, len(dados["habilidades"]))
        print(area, len(dados["competencias"]), "competências,", len(dados["habilidades"]), "habilidades")
    (RAIZ / "dados" / "matriz.json").write_text(json.dumps(matriz, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
