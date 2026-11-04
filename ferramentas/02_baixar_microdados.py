# -*- coding: utf-8 -*-
"""Extrai dos microdados oficiais do INEP, sem baixar os zips inteiros:

- ITENS_PROVA_<ano>.csv (2009-2025): gabarito, habilidade, parâmetros TRI e a
  marcação oficial de itens abandonados/anulados;
- provas e gabaritos de 2005 a 2008, que a página de provas não lista por completo;
- dicionário de dados e relatórios pedagógicos usados como referência.

Saída: dados/microdados/<ano>/
"""
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zip_remoto import ArquivoHTTP

RAIZ = Path(__file__).resolve().parent.parent
DEST = RAIZ / "dados" / "microdados"


def deve_extrair(ano, nome):
    n = nome.upper()
    if n.endswith("/") or "~$" in n:
        return False
    if re.search(r"ITENS_PROVA_\d{4}\.CSV$", n):
        return True
    if "DICION" in n and n.endswith(".XLSX"):
        return True
    if ano <= 2008 and "PROVAS E GABARITOS" in n and n.endswith(".PDF"):
        return True
    return False


def main():
    for ano in range(2005, 2026):
        pasta = DEST / str(ano)
        pasta.mkdir(parents=True, exist_ok=True)
        url = f"https://download.inep.gov.br/microdados/microdados_enem_{ano}.zip"
        z = zipfile.ZipFile(ArquivoHTTP(url))
        for info in z.infolist():
            if not deve_extrair(ano, info.filename):
                continue
            alvo = pasta / Path(info.filename).name
            if alvo.exists() and alvo.stat().st_size == info.file_size:
                continue
            alvo.write_bytes(z.read(info))
            print(f"{ano}: {alvo.name} ({info.file_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
