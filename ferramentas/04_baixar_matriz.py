# -*- coding: utf-8 -*-
"""Baixa as Matrizes de Referência do Enem (INEP), de onde gerar_matriz.py tira as competências
e as habilidades de cada área.

Este script já baixou também as Cartilhas do Participante e os manuais de correção da redação,
que o jogo abria na Torre da Redação. Esses documentos e as redações de exemplo saíram do jogo.

Fonte: download.inep.gov.br (link direto).
Saída: provas/matriz_de_referencia_enem.pdf
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zip_remoto import curl

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "provas" / "matriz_de_referencia_enem.pdf"
URL = "https://download.inep.gov.br/enem/outros_documentos/enem_matriz_de_referencia_v1.pdf"


def main():
    if DESTINO.exists():
        print("já baixada:", DESTINO.name)
        return
    dados = curl([URL])
    if not dados.startswith(b"%PDF"):
        raise IOError("a resposta não é um PDF")
    DESTINO.parent.mkdir(exist_ok=True)
    DESTINO.write_bytes(dados)
    print(f"{DESTINO.name}: {len(dados) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
