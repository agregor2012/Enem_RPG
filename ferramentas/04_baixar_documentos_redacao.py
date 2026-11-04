# -*- coding: utf-8 -*-
"""Baixa somente documentos oficiais do INEP sobre a redação do Enem.

Fontes: download.inep.gov.br (links diretos) e os zips de microdados do próprio INEP,
que guardam edições antigas das cartilhas que saíram do site.

Saída: documentos_redacao/ e dados/documentos_redacao.json
"""
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zip_remoto import ArquivoHTTP, curl

RAIZ = Path(__file__).resolve().parent.parent
DEST = RAIZ / "documentos_redacao"
D = "https://download.inep.gov.br"
PUB = f"{D}/publicacoes/institucionais/avaliacoes_e_exames_da_educacao_basica"
GUIA = f"{D}/educacao_basica/enem/guia_participante"
MANUAL = f"{D}/educacao_basica/enem/downloads/2020"

DIRETOS = {
    "cartilha_2012.pdf": f"{GUIA}/2012/guia_participante_redacao_enem_2012.pdf",
    "cartilha_2013.pdf": f"{GUIA}/2013/guia_participante_redacao_enem_2013.pdf",
    "cartilha_2014.pdf": f"{GUIA}/2014/guia_participante_redacao_enem_2014.pdf",
    "cartilha_2016.pdf": f"{GUIA}/2016/manual_de_redacao_do_enem_2016.pdf",
    "cartilha_2017.pdf": f"{GUIA}/2017/manual_de_redacao_do_enem_2017.pdf",
    "cartilha_2018.pdf": f"{GUIA}/2018/manual_de_redacao_do_enem_2018.pdf",
    "cartilha_2019.pdf": f"{PUB}/a_redacao_no_enem_2019_cartilha_do_participante.pdf",
    "cartilha_2022.pdf": f"{D}/download/enem/cartilha_do_participante_enem_2022.pdf",
    "cartilha_2023.pdf": f"{PUB}/a_redacao_no_enem_2023_cartilha_do_participante.pdf",
    "cartilha_2024.pdf": f"{PUB}/a_redacao_no_enem_2024_cartilha_do_participante.pdf",
    "cartilha_2025.pdf": f"{PUB}/a_redacao_no_enem_2025_cartilha_do_participante.pdf",
    "cartilha_2026.pdf": f"{PUB}/cartilha_enem_2026.pdf",
    "manual_correcao_competencia_1.pdf": f"{MANUAL}/Competencia_1.pdf",
    "manual_correcao_competencia_2.pdf": f"{MANUAL}/Competencia_2.pdf",
    "manual_correcao_competencia_3.pdf": f"{MANUAL}/Competencia_3.pdf",
    "manual_correcao_competencia_4.pdf": f"{MANUAL}/Competencia_4.pdf",
    "manual_correcao_competencia_5.pdf": f"{MANUAL}/Competencia_5.pdf",
    "manual_correcao_nota_zero.pdf": f"{MANUAL}/Situacoes_nota_zero.pdf",
    "matriz_de_referencia_enem.pdf": f"{D}/enem/outros_documentos/enem_matriz_de_referencia_v1.pdf",
    "nota_direitos_humanos_redacao.pdf":
        f"{D}/educacao_basica/enem/legislacao/2015/direitos_humanos_redacao_VISTA_PEDAGOGICA.pdf",
}

# (ano do zip de microdados, trecho do nome do membro, nome local)
EM_MICRODADOS = [
    (2020, "manual_de_redacao_do_enem_2020.pdf", "cartilha_2020.pdf"),
    (2005, "Relatorio_pedagogico_enem_2005.pdf", "relatorio_pedagogico_2005.pdf"),
    (2006, "Relatorio_pedagogico_enem_2006.pdf", "relatorio_pedagogico_2006.pdf"),
    (2007, "Relatorio_pedagogico_enem_2007.pdf", "relatorio_pedagogico_2007.pdf"),
    (2008, "Relatorio_pedagogico_enem_2008.pdf", "relatorio_pedagogico_2008.pdf"),
    (2009, "Relatorio_pedagogico_enem_2009.pdf", "relatorio_pedagogico_2009.pdf"),
    (2010, "Relatorio_pedagogico_enem_2010.pdf", "relatorio_pedagogico_2010.pdf"),
]


def main():
    DEST.mkdir(exist_ok=True)
    origem = {}
    for nome, url in DIRETOS.items():
        alvo = DEST / nome
        if not alvo.exists():
            dados = curl([url])
            if not dados.startswith(b"%PDF"):
                raise IOError(f"{nome}: resposta não é PDF")
            alvo.write_bytes(dados)
            print(f"{nome}: {len(dados) / 1e6:.1f} MB")
        origem[nome] = url
    for ano, trecho, nome in EM_MICRODADOS:
        url = f"{D}/microdados/microdados_enem_{ano}.zip"
        alvo = DEST / nome
        if not alvo.exists():
            z = zipfile.ZipFile(ArquivoHTTP(url))
            membro = next(i for i in z.infolist() if i.filename.endswith(trecho))
            alvo.write_bytes(z.read(membro))
            print(f"{nome}: {membro.file_size / 1e6:.1f} MB (microdados {ano})")
        origem[nome] = f"{url} › {trecho}"
    (RAIZ / "dados" / "documentos_redacao.json").write_text(
        json.dumps(origem, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
