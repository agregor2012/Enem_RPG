# -*- coding: utf-8 -*-
"""Monta o banco de questões do jogo a partir dos PDFs e dos microdados oficiais.

Para cada aplicação do Enem usa um caderno de referência: as cores têm as mesmas
questões em outra ordem, então um caderno basta. Cada questão só entra se:
- o recorte foi localizado;
- o INEP não a anulou (ITENS_PROVA ou gabarito em PDF);
- gabarito em PDF e microdados, quando os dois existem, dão a mesma letra.

Uso: 05_montar_banco.py [--sem-imagens] [--so ANO]
Saída: <build>/banco/ (imagens + questoes.json) e dados/relatorio_banco.json
"""
import glob
import json
import os
import re
import sys
from concurrent.futures import ProcessPoolExecutor
from io import BytesIO
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gabaritos import (concordancia, gabarito_antigo_pdf, ler_gabarito_pdf, ler_itens,
                       provas_por_codigo)
from recorte import Prova

RAIZ = Path(__file__).resolve().parent.parent
BUILD = Path(os.environ["LOCALAPPDATA"]) / "ENEM-RPG-build" / "banco"
DPI = 180


def B(area, pdf, gab=None, idx=0, cor=None, lingua=None, co=None, faixa=None):
    """Um PDF de referência. area: "LC", "CH" ou "LC+CH"; idx: coluna da cor no gabarito."""
    return dict(area=area, pdf=pdf, gab=gab, idx=idx, cor=cor, lingua=lingua, co=co, faixa=faixa)


def impresso(ano, grupo="impresso", d="D1", cad="CD1"):
    return B("LC+CH", f"{ano}_PV_{grupo}_{d}_{cad}.pdf", f"{ano}_GB_{grupo}_{d}_{cad}.pdf", cor="AZUL")


REFS = {
    (2009, "regular"): [
        B("CH", "dia1_caderno1_azul.pdf", "gabarito_dia1.pdf", 0, "AZUL"),
        B("LC", "dia2_caderno7_azul.pdf", "gabarito_dia2.pdf", 2, "AZUL")],
    (2010, "regular"): [
        B("CH", "dia1_caderno1_azul.pdf", cor="AZUL", co=85),
        B("LC", "dia2_caderno7_azul.pdf", cor="AZUL", co=95)],
    (2010, "reaplicacao_ppl"): [
        B("CH", "2010_PV_reaplicacao_PPL_D1_CD1.pdf", cor="AZUL", co=101),
        B("LC", "2010_PV_reaplicacao_PPL_D2_CD7.pdf", cor="AZUL", co=111)],
    (2011, "regular"): [
        B("CH", "dia1_caderno1_azul.pdf", "01_AZUL_GABARITO.pdf", cor="AZUL"),
        B("LC", "dia2_caderno7_azul.pdf", "07_AZUL_GABARITO.pdf", cor="AZUL")],
    (2011, "reaplicacao_ppl"): [
        B("CH", "PPL_ENEM_2011_03_BRANCO.pdf", cor="BRANCO", co=134),
        B("LC", "PPL_ENEM_2011_06_CINZA.pdf", cor="CINZA", co=135)],
    (2012, "regular"): [
        B("CH", "dia1_caderno1_azul.pdf", "dia1_azul.pdf", cor="AZUL"),
        B("LC", "dia2_caderno7_azul.pdf", "dia2_azul.pdf", cor="AZUL")],
    (2012, "reaplicacao_ppl"): [
        B("CH", "2012_PV_reaplicacao_PPL_D1_CD3.pdf", "p2_dia1_branco_2012.pdf", cor="BRANCA"),
        B("LC", "2012_PV_reaplicacao_PPL_D2_CD6.pdf", "p2_dia2_cinza_2012.pdf", cor="CINZA")],
    (2013, "regular"): [
        B("CH", "dia1_caderno1_azul.pdf", "dia1_azul.pdf", cor="AZUL"),
        B("LC", "dia2_caderno7_azul.pdf", "dia2_azul.pdf", cor="AZUL")],
    (2013, "reaplicacao_ppl"): [
        B("CH", "2013_PV_reaplicacao_PPL_D1_CD3.pdf", "gabarito_enem_ppl_2013_dia1_branca.pdf", cor="BRANCO"),
        B("LC", "2013_PV_reaplicacao_PPL_D1_CD6.pdf", "gabarito_enem_ppl_2013_dia2_cinza.pdf", cor="CINZA")],
    (2014, "regular"): [
        B("CH", "2014_PV_impresso_D1_CD1.pdf", "CADERNO_1_AZUL_SABADO.pdf", cor="AZUL"),
        B("LC", "2014_PV_impresso_D2_CD7.pdf", "CADERNO_7_AZUL_DOMINGO.pdf", cor="AZUL")],
    (2014, "terceira_aplicacao"): [
        B("CH", "2014_PV_terceira_aplicacao_D1_CD3.pdf", "2014_GB_terceira_aplicacao_D1_CD3.pdf", cor="BRANCO"),
        B("LC", "2014_PV_terceira_aplicacao_D2_CD6.pdf", "2014_GB_terceira_aplicacao_D2_CD6.pdf", cor="CINZA")],
    (2014, "reaplicacao_ppl"): [
        B("CH", "2014_PPL_PV_D1_CD3.pdf", "2014_PPL_GB_D1_CD3.pdf", cor="BRANCO"),
        B("LC", "2014_PPL_PV_D2_CD6.pdf", "2014_PPL_GB_D2_CD6.pdf", cor="CINZA")],
    (2015, "regular"): [
        B("CH", "2015_PV_impresso_D1_CD1.pdf", "CADERNO_1_AZUL_SABADO.pdf", cor="AZUL"),
        B("LC", "2015_PV_impresso_D2_CD7.pdf", "CADERNO_7_AZUL_DOMINGO.pdf", cor="AZUL")],
    (2015, "reaplicacao_ppl"): [
        B("CH", "2015_PV_reaplicacao_PPL_D1_CD9.pdf", "GAB_ENEM2015_2aAPLICACAO_DIA1_CADERNO_9.pdf"),
        B("LC", "2015_PV_reaplicacao_PPL_D2_CD13.pdf", "GAB_ENEM2015_2aAPLICACAO_DIA2_CADERNO_13.pdf")],
    (2016, "regular"): [
        B("CH", "2016_PV_impresso_D1_CD1.pdf", "GAB_ENEM_2016_DIA_1_01_AZUL.pdf", cor="AZUL"),
        B("LC", "2016_PV_impresso_D2_CD7.pdf", "GAB_ENEM_2016_DIA_2_07_AZUL.pdf", cor="AZUL")],
    (2016, "segunda_aplicacao"): [
        B("CH", "P2_02_AMARELO_CH_CN_2016_REG.pdf", "GAB_ENEM_2016_DIA_1_02_AMARELO_2.pdf", cor="AMARELA"),
        B("LC", "P2_07_AZUL_LC_MT_2016_REG.pdf", "GAB_ENEM_2016_DIA_2_07_AZUL_2.pdf", cor="AZUL")],
    (2016, "reaplicacao_ppl"): [
        B("CH", "2016_PV_reaplicacao_PPL_D1_CD9.pdf", "gabarito_caderno_branco_9_2016.pdf", faixa=(1, 45)),
        B("LC", "2016_PV_reaplicacao_PPL_D2_CD13.pdf", "gabarito_caderno_cinza_13_2016.pdf", faixa=(91, 135))],
    (2017, "regular"): [B("LC+CH", "2017_PV_impresso_D1_CD1.pdf", "cad_1_gabarito_azul_5112017.pdf", cor="AZUL")],
    (2017, "reaplicacao_ppl"): [B("LC+CH", "P2_01_azul.pdf", "gab_enem2017_2_dia1_Azul.pdf", cor="AZUL")],
    (2018, "regular"): [B("LC+CH", "2018_PV_impresso_D1_CD1.pdf", "GAB_ENEM_2018_DIA_1_AZUL.pdf", cor="AZUL")],
    (2018, "reaplicacao_ppl"): [
        B("LC+CH", "2018_PV_reaplicacao_PPL_D1_CD13.pdf", "GAB_ENEM_2018_DIA_1_P2_Azul.pdf", cor="AZUL")],
    (2019, "regular"): [
        B("LC+CH", "2019_PV_impresso_D1_CD1.pdf", "gabarito_1_dia_caderno_1_azul_aplicacao_regular.pdf", cor="AZUL")],
    (2019, "reaplicacao_ppl"): [
        B("LC+CH", "2019_PV_reaplicacao_PPL_D1_CD1.pdf", "gabarito_1_dia_caderno_1_azul_2_aplicacao.pdf", cor="AZUL")],
    (2020, "regular"): [impresso(2020)],
    (2020, "digital"): [
        B("LC+CH", "2020_PV_digital_D1_CD1_ingles.pdf", "2020_GB_digital_D1_CD1_ingles.pdf", cor="AZUL", lingua=0),
        B("LC+CH", "2020_PV_digital_D1_CD1_espanhol.pdf", "2020_GB_digital_D1_CD1_espanhol.pdf", cor="AZUL", lingua=1)],
    (2020, "reaplicacao_ppl"): [impresso(2020, "reaplicacao_PPL")],
    (2021, "regular"): [impresso(2021)],
    (2021, "reaplicacao_ppl"): [impresso(2021, "reaplicacao_PPL")],
    (2022, "regular"): [impresso(2022)],
    (2022, "reaplicacao_ppl"): [impresso(2022, "reaplicacao_PPL")],
    (2023, "regular"): [impresso(2023)],
    (2023, "reaplicacao_ppl"): [impresso(2023, "reaplicacao_PPL")],
    (2024, "regular"): [impresso(2024)],
    (2024, "reaplicacao_ppl"): [impresso(2024, "reaplicacao_PPL")],
    (2025, "regular"): [impresso(2025)],
    (2025, "belem"): [
        B("LC+CH", "2025_PV_impresso_D3_CD1.pdf", "2025_GB_impresso_D3_CD1.pdf", cor="AZUL")],
    (2025, "reaplicacao_ppl"): [
        B("LC+CH", "2025_PV_impresso_D5_CD1.pdf", "2025_GB_impresso_D5_CD1.pdf", cor="AZUL")],
}
# As aplicações digitais de 2021 e 2022 usaram os mesmos itens da impressa (conferido por
# CO_ITEM), por isso não têm referência própria.
# Pastas onde o script 03 guardou cada aplicação (a 3ª aplicação de 2014 fica em "regular")
PASTA = {"terceira_aplicacao": "regular"}
ANTIGAS = (2005, 2006, 2007, 2008)
# Questões de Linguagens e de Humanas nas provas interdisciplinares (classificadas por leitura)
AREAS_ANTIGAS = {
    2005: {"LC": [1, 2, 6, 8, 9, 10, 20, 33, 56, 58, 59, 63],
           "CH": [3, 4, 5, 7, 16, 19, 23, 24, 25, 51, 53]},
    2006: {"LC": [1, 2, 3, 4, 5, 6, 7, 8, 18, 39],
           "CH": [11, 12, 13, 14, 15, 16, 17, 21, 22, 37, 40, 41, 42, 48]},
    2007: {"LC": [2, 3, 4, 14, 26, 27, 28],
           "CH": [1, 10, 16, 17, 18, 19, 20, 21, 22, 35, 36, 39, 48, 49, 53, 63]},
    2008: {"LC": [2, 12, 13, 14, 37, 40, 46, 58],
           "CH": [1, 3, 17, 19, 38, 39, 41, 42, 45, 47, 50, 59, 60, 61, 62]},
}
# Textos de apoio sem aviso do tipo "texto para as questões X e Y" na prova de 2005:
# {questão: (marcador de onde começa, marcador onde termina)}; None = início da página
APOIOS_SEM_AVISO = {
    2005: {1: (None, 1), 2: (None, 1), 58: (57, 58), 59: (57, 58)},
    2008: {1: (None, 1), 2: (None, 1)},
}
# Avisos de texto compartilhado que não dá para ler no PDF (a fonte não traz a tabela de
# caracteres): {(ano, aplicação, pdf): {questão: (questão anterior, questão seguinte)}}
APOIOS_ILEGIVEIS = {
    # "A partir do gráfico a seguir, responda às questões 11 e 12."
    (2010, "reaplicacao_ppl", "2010_PV_reaplicacao_PPL_D1_CD1.pdf"): {11: (10, 11), 12: (10, 11)},
}


def caminho(ano, aplicacao, nome):
    return RAIZ / "provas" / str(ano) / PASTA.get(aplicacao, aplicacao) / nome


def achar_prova(ano, area, bloco, gabarito, provas):
    """Escolhe o CO_PROVA que combina com o gabarito; a cor desempata entre iguais."""
    if bloco["co"]:
        return bloco["co"], None
    candidatos = []
    for (a, co), p in provas.items():
        if a != area:
            continue
        nota, total, desl = (concordancia(gabarito, p, lingua_fixa=bloco["lingua"])
                              if gabarito else (0, 0, 0))
        if gabarito and (nota < 0.95 or total < 40):
            continue
        cor_ok = bool(bloco["cor"]) and p["cor"][:4] == bloco["cor"][:4]
        adaptados = sum(r["adaptado"] for r in p["porpos"].values())
        candidatos.append((nota, cor_ok, -adaptados, -co, co, desl))
    if not candidatos:
        return None, None
    melhor = max(candidatos)
    return melhor[4], melhor[5]


def uma_cor(gabarito, idx, tem_cores):
    if not tem_cores:
        return gabarito
    return {n: [v[idx]] for n, v in gabarito.items() if len(v) > idx}


def processar_bloco(ano, aplicacao, bloco):
    """Devolve os registros de todas as questões de LC/CH de um PDF."""
    pdf = caminho(ano, aplicacao, bloco["pdf"])
    if not pdf.exists():
        return {"erro": f"PDF ausente: {pdf.name}", "ano": ano, "aplicacao": aplicacao}, []
    gab_pdf = {}
    if bloco["gab"]:
        gab_pdf = uma_cor(ler_gabarito_pdf(caminho(ano, aplicacao, bloco["gab"])), bloco["idx"],
                          ano == 2009)
    provas = provas_por_codigo(ler_itens(ano))
    areas = bloco["area"].split("+")
    mapa, info = {}, {"ano": ano, "aplicacao": aplicacao, "pdf": bloco["pdf"], "areas": {}}
    for area in areas:
        co, desl = achar_prova(ano, area, bloco, gab_pdf, provas)
        if co is not None and desl is None:
            desl = deslocamento_padrao(provas[(area, co)], area)
        if co is not None:
            mapa[area] = (provas[(area, co)], desl)
            nota = (concordancia(gab_pdf, provas[(area, co)], lingua_fixa=bloco["lingua"])[0]
                    if gab_pdf else None)
            info["areas"][area] = {"co_prova": co, "desl": desl, "concordancia": nota}
        else:
            info["areas"][area] = {"co_prova": None}
    prova = Prova(pdf)
    questoes = prova.questoes()
    manuais = APOIOS_ILEGIVEIS.get((ano, aplicacao, bloco["pdf"]), {})
    if manuais:
        por_num = {q.num: q for q in questoes}
        for n, (de, ate) in manuais.items():
            por_num[n].fragmentos = prova.apoio_entre(por_num.get(de), por_num[ate]) + por_num[n].fragmentos
            por_num[n].avisos.append("texto_compartilhado")
    circuladas = respostas_circuladas_2010(ano, aplicacao, pdf, prova, questoes)
    vistos, registros = {}, []
    for q in questoes:
        vistos[q.num] = vistos.get(q.num, 0) + 1
        run = vistos[q.num] - 1
        registro = classificar(ano, aplicacao, bloco, q, run, mapa, gab_pdf, areas, circuladas)
        if registro:
            registro["_frag"] = [(f.pag, f.x0, f.y0, f.x1, f.y1, f.papel) for f in q.fragmentos]
            registro["_alt"] = {k: list(v) for k, v in q.alternativas.items()}
            registro["_altfim"] = list(q.alt_fim)
            registro["_avisos"] = q.avisos + prova.auditar(q)
            registro["_texto"] = q.texto[:1500]
            registro["_pdf"] = str(pdf.relative_to(RAIZ)).replace("\\", "/")
            registros.append(registro)
    return info, registros


def respostas_circuladas_2010(ano, aplicacao, pdf, prova, questoes):
    """Em 2010 o gabarito publicado é a própria prova com a resposta circulada de verde.

    Na aplicação regular há um arquivo "_com_gab" separado; na reaplicação o único PDF
    disponível já vem circulado (os anéis são apagados na hora de gerar as imagens).
    """
    if ano != 2010:
        return {}
    if aplicacao == "regular":
        com_gab = Prova(pdf.with_name(pdf.stem + "_com_gab.pdf"))
        return com_gab.respostas_circuladas(com_gab.questoes())
    return prova.respostas_circuladas(questoes)


def deslocamento_padrao(prova, area):
    """Sem gabarito em PDF: o número impresso segue o padrão do ano."""
    posicoes = [k[0] for k in prova["porpos"]]
    return (91 - min(posicoes)) if area == "LC" else 0


def classificar(ano, aplicacao, bloco, q, run, mapa, gab_pdf, areas, circuladas):
    """Liga a questão impressa ao item oficial e aplica os filtros."""
    for area, (prova, desl) in mapa.items():
        pos = q.num - desl
        lingua = bloco["lingua"]
        if (pos, 0) in prova["porpos"] or (pos, 1) in prova["porpos"]:
            lingua = lingua if lingua is not None else min(run, 1)
            r = prova["porpos"].get((pos, lingua))
        else:
            lingua = None
            r = prova["porpos"].get((pos, None)) or prova["porpos"].get((pos, 0))
        if r is None:
            continue
        reg = base_registro(ano, aplicacao, area, q, lingua)
        reg.update(item=r["item"], gab=r["gab"], hab=r["hab"], b=r["b"], a=r["a"], c=r["c"])
        letras = gab_pdf.get(q.num)
        letra_pdf = None
        if letras:
            letra_pdf = letras[lingua] if lingua in (0, 1) and len(letras) > 1 else letras[0]
        letra_pdf = circuladas.get(q.ordem, letra_pdf)
        if r["anulado"]:
            reg["excluida"] = f"anulada pelo INEP ({r['motivo'] or 'sem motivo informado'})"
        elif letra_pdf == "X":
            reg["excluida"] = "anulada no gabarito oficial"
        elif letra_pdf and letra_pdf != r["gab"]:
            reg["excluida"] = f"gabaritos oficiais divergentes (PDF {letra_pdf}, microdados {r['gab']})"
        reg["fontes_gabarito"] = 2 if letra_pdf else 1
        return reg
    if bloco["faixa"] and bloco["faixa"][0] <= q.num <= bloco["faixa"][1]:
        # PPL 2016: fora do ITENS_PROVA, só o gabarito em PDF
        area = areas[0]
        faixa_lingua = area == "LC" and q.num - bloco["faixa"][0] < 5
        lingua = (bloco["lingua"] if bloco["lingua"] is not None else min(run, 1)) if faixa_lingua else None
        reg = base_registro(ano, aplicacao, area, q, lingua)
        letras = gab_pdf.get(q.num) or []
        letra = (letras[lingua] if lingua in (0, 1) and len(letras) > 1 else letras[0]) if letras else None
        reg.update(item=None, gab=letra, hab=None, b=None, a=None, c=None, fontes_gabarito=1)
        if letra in (None, "X"):
            reg["excluida"] = "anulada no gabarito oficial"
        return reg
    return None


def base_registro(ano, aplicacao, area, q, lingua):
    return {"ano": ano, "aplicacao": aplicacao, "area": area, "n": q.num, "ordem": q.ordem,
            "lingua": lingua, "alt_ok": q.alternativas_ok}


def processar_antiga(ano):
    """2005-2008: prova única e interdisciplinar, de 63 questões.

    O INEP não separa essas provas por área, então a classificação de AREAS_ANTIGAS foi
    feita lendo cada questão. Gabarito: PDF oficial conferido com o gabarito que os
    microdados trazem por caderno (o caderno amarelo é o CO_PROVA 1).
    """
    pdf = RAIZ / "provas" / str(ano) / "regular" / f"ENEM_{ano}_PROVA1_AMARELA.pdf"
    micro = json.loads((RAIZ / "dados" / "gabaritos_2005_2008_microdados.json").read_text())[str(ano)]["1"]
    gab_pdf = gabarito_antigo_pdf(ano)
    prova = Prova(pdf, numeracao_continua=True)
    registros = []
    areas = AREAS_ANTIGAS[ano]
    questoes = prova.questoes()
    por_num = {q.num: q for q in questoes}
    for q in questoes:
        area = next((a for a, nums in areas.items() if q.num in nums), None)
        if area is None:
            continue
        faixa = APOIOS_SEM_AVISO.get(ano, {}).get(q.num)
        if faixa:
            q.fragmentos = prova.apoio_entre(por_num.get(faixa[0]), por_num[faixa[1]]) + q.fragmentos
        reg = base_registro(ano, "regular", area, q, None)
        letra = micro[q.num - 1]
        reg.update(item=None, gab=letra, hab=None, b=None, a=None, c=None,
                   fontes_gabarito=2 if gab_pdf.get(q.num) == letra or ano == 2008 else 1)
        if gab_pdf and gab_pdf.get(q.num) not in (None, letra):
            reg["excluida"] = f"gabaritos oficiais divergentes (PDF {gab_pdf[q.num]}, microdados {letra})"
        reg["_frag"] = [(f.pag, f.x0, f.y0, f.x1, f.y1, f.papel) for f in q.fragmentos]
        reg["_alt"] = {k: list(v) for k, v in q.alternativas.items()}
        reg["_altfim"] = list(q.alt_fim)
        reg["_avisos"] = q.avisos + prova.auditar(q)
        reg["_texto"] = q.texto[:1500]
        reg["_pdf"] = str(pdf.relative_to(RAIZ)).replace("\\", "/")
        registros.append(reg)
    info = {"ano": ano, "aplicacao": "regular", "pdf": pdf.name,
            "gabarito_pdf": len(gab_pdf), "areas": {a: len(n) for a, n in areas.items()}}
    return info, registros


def tarefa_bloco(args):
    if len(args) == 1:
        return processar_antiga(args[0])
    return processar_bloco(*args)


def main():
    so = None
    if "--so" in sys.argv:
        so = int(sys.argv[sys.argv.index("--so") + 1])
    tarefas = [(ano, apl, b) for (ano, apl), bs in REFS.items() for b in bs
               if so in (None, ano)]
    tarefas += [(ano,) for ano in ANTIGAS if so in (None, ano)]
    infos, registros = [], []
    with ProcessPoolExecutor(max_workers=6) as ex:
        for info, regs in ex.map(tarefa_bloco, tarefas):
            infos.append(info)
            registros += regs
            print(info.get("ano"), info.get("aplicacao"), info.get("pdf", info.get("erro")),
                  info.get("areas"), len(regs), flush=True)
    destino = RAIZ / "dados" / ("registros_questoes.json" if so is None else f"registros_{so}.json")
    destino.write_text(json.dumps({"infos": infos, "registros": registros}, ensure_ascii=False),
                       encoding="utf-8")
    print("registros:", len(registros))


if __name__ == "__main__":
    main()
