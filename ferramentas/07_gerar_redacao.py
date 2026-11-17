# -*- coding: utf-8 -*-
"""Gera o material da Torre da Redação: o tema e a proposta de redação de cada edição.

As propostas são páginas das próprias provas (pasta provas/). O jogo já trouxe também redações de
exemplo, tiradas das Cartilhas do Participante; elas saíram, e as imagens que tinham ficado na
pasta de saída são apagadas aqui.

Saída: <build>/banco/redacao/ e <build>/banco/redacao.json
"""
import json
import os
import re
import sys
from pathlib import Path

import pymupdf
from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
BUILD = Path(os.environ["LOCALAPPDATA"]) / "ENEM-RPG-build" / "banco"
DESTINO = BUILD / "redacao"
DPI = 110

NOMES = {"regular": "Aplicação regular", "reaplicacao_ppl": "Reaplicação / PPL", "digital": "Aplicação digital",
         "belem": "Belém, Ananindeua e Marituba", "segunda_aplicacao": "2ª aplicação",
         "terceira_aplicacao": "3ª aplicação"}
# (ano, aplicação, arquivo, páginas com índice a partir de 0, tema)
PROPOSTAS = [
    (2005, "regular", "regular/ENEM_2005_PROVA1_AMARELA.pdf", [1], "O trabalho infantil na realidade brasileira"),
    (2006, "regular", "regular/ENEM_2006_PROVA1_AMARELA.pdf", [1], "O poder de transformação da leitura"),
    (2007, "regular", "regular/ENEM_2007_PROVA1_AMARELA.pdf", [1], "O desafio de se conviver com a diferença"),
    (2008, "regular", "regular/ENEM_2008_PROVA1_AMARELA.pdf", [1],
     "Como preservar a floresta Amazônica: suspender imediatamente o desmatamento; dar incentivos "
     "financeiros a proprietários que deixarem de desmatar; ou aumentar a fiscalização e aplicar "
     "multas a quem desmatar"),
    (2009, "regular", "regular/dia2_caderno7_azul.pdf", [1], "O indivíduo frente à ética nacional"),
    (2010, "regular", "regular/dia2_caderno7_azul.pdf", [1], "O trabalho na construção da dignidade humana"),
    (2010, "reaplicacao_ppl", "reaplicacao_ppl/2010_PV_reaplicacao_PPL_D2_CD7.pdf", [1], "Ajuda humanitária"),
    (2011, "regular", "regular/dia2_caderno7_azul.pdf", [1],
     "Viver em rede no século XXI: os limites entre o público e o privado"),
    (2011, "reaplicacao_ppl", "reaplicacao_ppl/PPL_ENEM_2011_06_CINZA.pdf", [1], "Cultura e mudança social"),
    (2012, "regular", "regular/dia2_caderno7_azul.pdf", [1], "O movimento imigratório para o Brasil no século XXI"),
    (2012, "reaplicacao_ppl", "reaplicacao_ppl/2012_PV_reaplicacao_PPL_D2_CD6.pdf", [1], "O grupo fortalece o indivíduo?"),
    (2013, "regular", "regular/dia2_caderno7_azul.pdf", [1], "Efeitos da implantação da Lei Seca no Brasil"),
    (2013, "reaplicacao_ppl", "reaplicacao_ppl/2013_PV_reaplicacao_PPL_D1_CD6.pdf", [1], None),
    (2014, "regular", "regular/2014_PV_impresso_D2_CD7.pdf", [1], "Publicidade infantil em questão no Brasil"),
    (2014, "terceira_aplicacao", "regular/2014_PV_terceira_aplicacao_D2_CD6.pdf", [1], None),
    (2014, "reaplicacao_ppl", "reaplicacao_ppl/2014_PPL_PV_D2_CD6.pdf", [1],
     "O que o fenômeno social dos “rolezinhos” representa?"),
    (2015, "regular", "regular/2015_PV_impresso_D2_CD7.pdf", [1],
     "A persistência da violência contra a mulher na sociedade brasileira"),
    (2015, "reaplicacao_ppl", "reaplicacao_ppl/2015_PV_reaplicacao_PPL_D2_CD13.pdf", [1],
     "O histórico desafio de se valorizar o professor"),
    (2016, "regular", "regular/2016_PV_impresso_D2_CD7.pdf", [1], "Caminhos para combater a intolerância religiosa no Brasil"),
    (2016, "segunda_aplicacao", "segunda_aplicacao/P2_07_AZUL_LC_MT_2016_REG.pdf", None, None),
    (2016, "reaplicacao_ppl", "reaplicacao_ppl/2016_PV_reaplicacao_PPL_D2_CD13.pdf", None, None),
    (2017, "regular", "regular/2017_PV_impresso_D1_CD1.pdf", None, "Desafios para a formação educacional de surdos no Brasil"),
    (2017, "reaplicacao_ppl", "reaplicacao_ppl/P2_01_azul.pdf", None,
     "Consequências da busca por padrões de beleza idealizados"),
    (2018, "regular", "regular/2018_PV_impresso_D1_CD1.pdf", None,
     "Manipulação do comportamento do usuário pelo controle de dados na internet"),
    (2018, "reaplicacao_ppl", "reaplicacao_ppl/2018_PV_reaplicacao_PPL_D1_CD13.pdf", None, None),
    (2019, "regular", "regular/2019_PV_impresso_D1_CD1.pdf", None, "Democratização do acesso ao cinema no Brasil"),
    (2019, "reaplicacao_ppl", "reaplicacao_ppl/2019_PV_reaplicacao_PPL_D1_CD1.pdf", None, None),
    (2020, "regular", "regular/2020_PV_impresso_D1_CD1.pdf", None,
     "O estigma associado às doenças mentais na sociedade brasileira"),
    (2020, "digital", "digital/2020_PV_digital_D1_CD1_ingles.pdf", None,
     "O desafio de reduzir as desigualdades entre as regiões do Brasil"),
    (2020, "reaplicacao_ppl", "reaplicacao_ppl/2020_PV_reaplicacao_PPL_D1_CD1.pdf", None, None),
    (2021, "regular", "regular/2021_PV_impresso_D1_CD1.pdf", None,
     "Invisibilidade e registro civil: garantia de acesso à cidadania no Brasil"),
    (2021, "reaplicacao_ppl", "reaplicacao_ppl/2021_PV_reaplicacao_PPL_D1_CD1.pdf", None,
     "Reconhecimento da contribuição das mulheres nas ciências da saúde no Brasil"),
    (2022, "regular", "regular/2022_PV_impresso_D1_CD1.pdf", None,
     "Desafios para a valorização de comunidades e povos tradicionais no Brasil"),
    (2022, "reaplicacao_ppl", "reaplicacao_ppl/2022_PV_reaplicacao_PPL_D1_CD1.pdf", None, None),
    (2023, "regular", "regular/tema_redacao_2023.pdf", [1],
     "Desafios para o enfrentamento da invisibilidade do trabalho de cuidado realizado pela mulher no Brasil"),
    (2023, "reaplicacao_ppl", "reaplicacao_ppl/tema_redacao_2_aplicacao_2023.pdf", [0],
     "Desafios para a (re)inserção socioeconômica da população em situação de rua no Brasil"),
    (2024, "regular", "regular/2024_PV_impresso_D1_CD1.pdf", None, "Desafios para a valorização da herança africana no Brasil"),
    (2024, "reaplicacao_ppl", "reaplicacao_ppl/tema_redacao_2_aplicacao_2024.pdf", [0],
     "Desafios para a valorização da arte de periferia no cenário cultural brasileiro"),
    (2025, "regular", "regular/2025_PV_impresso_D1_CD1.pdf", None, "Perspectivas acerca do envelhecimento na sociedade brasileira"),
    (2025, "belem", "belem/2025_PV_impresso_D3_CD1.pdf", None, None),
    (2025, "reaplicacao_ppl", "reaplicacao_ppl/2025_PV_impresso_D5_CD1.pdf", None, None),
]


def salvar_pagina(page, nome):
    px = page.get_pixmap(dpi=DPI, alpha=False)
    imagem = Image.frombytes("RGB", (px.width, px.height), px.samples)
    imagem.save(DESTINO / nome, format="WEBP", quality=82, method=5)
    return [nome, px.width, px.height]


def achar_paginas(doc):
    """Páginas da proposta: as que pedem o texto dissertativo-argumentativo ou trazem o título."""
    achadas = []
    for i, page in enumerate(doc):
        if i == 0:
            continue
        texto = page.get_text()
        normal = re.sub(r"\s+", " ", texto)
        if re.search(r"PROPOSTA DE REDA|Proposta de Reda|TEXTOS? MOTIVADOR|texto dissertativo-argumentativo", normal):
            if not re.search(r"QUEST[ÃA]O\s*\d", normal):
                achadas.append(i)
    return achadas


def tema_do_texto(doc, paginas):
    texto = " ".join(doc[p].get_text() for p in paginas)
    texto = re.sub(r"\s+", " ", texto)
    m = re.search(r"sobre o tema\s*[“\"«]\s*(.{10,170}?)\s*[”\"»]", texto, re.I)
    return m.group(1).strip() if m else None


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    DESTINO.mkdir(parents=True, exist_ok=True)
    anos = {}
    for ano, apl, arquivo, paginas, tema in PROPOSTAS:
        caminho = RAIZ / "provas" / str(ano) / arquivo
        doc = pymupdf.open(caminho)
        if paginas == "todas":
            paginas = list(range(len(doc)))
        elif paginas is None:
            paginas = achar_paginas(doc)
        lido = tema_do_texto(doc, paginas) if paginas else None
        print(ano, apl[:6], paginas, "| lido:", lido, "| definido:", (tema or "")[:50])
        imagens = [salvar_pagina(doc[p], f"proposta_{ano}_{apl}_{p}.webp") for p in paginas]
        entrada = anos.setdefault(ano, {"ano": ano, "temas": []})
        entrada["temas"].append({"aplicacao": NOMES[apl], "tema": tema or lido or "", "paginas": imagens,
                                 "fonte": f"Prova oficial do Enem {ano} (INEP), {NOMES[apl].lower()}"})
    saida = [anos[a] for a in sorted(anos, reverse=True)]
    # o que sobrou de gerações anteriores (as redações de exemplo) sai da pasta
    usadas = {img[0] for a in saida for t in a["temas"] for img in t["paginas"]}
    sobras = [p for p in DESTINO.iterdir() if p.name not in usadas]
    for p in sobras:
        p.unlink()
    if sobras:
        print("imagens antigas apagadas:", len(sobras))
    (BUILD / "redacao.json").write_text(json.dumps(saida, ensure_ascii=False, indent=0), encoding="utf-8")
    tamanho = sum(p.stat().st_size for p in DESTINO.iterdir())
    print(f"{len(list(DESTINO.iterdir()))} imagens, {tamanho / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
