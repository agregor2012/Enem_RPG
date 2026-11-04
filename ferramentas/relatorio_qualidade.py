# -*- coding: utf-8 -*-
"""Resumo de qualidade dos registros gerados pelo script 05."""
import collections
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
GRAVES = ("linha_cortada_na_lateral", "imagem_cortada_na_lateral", "mais_de_uma_questao",
          "sem_recorte", "linha_cortada_na_altura", "sem_alternativas")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    R = json.loads((RAIZ / "dados" / "registros_questoes.json").read_text(encoding="utf-8"))["registros"]
    print("alternativas ok", sum(r["alt_ok"] for r in R), "de", len(R))
    print(collections.Counter(a for r in R for a in r["_avisos"]))
    ruins = [r for r in R if not r["alt_ok"] or any(a in GRAVES for a in r["_avisos"])]
    print("com algum problema", len(ruins))
    print(sorted(collections.Counter((r["ano"], r["aplicacao"][:4]) for r in ruins).items()))
    print("exclusões", collections.Counter(r["excluida"][:48] for r in R if r.get("excluida")))
    print("2010 fontes", collections.Counter((r["aplicacao"][:4], r["fontes_gabarito"]) for r in R if r["ano"] == 2010))
    print("2010 excluídas", [(r["aplicacao"][:4], r["area"], r["n"], r["excluida"][:44]) for r in R
                             if r["ano"] == 2010 and r.get("excluida")])
    print("fragmentos", sorted(collections.Counter(len(r["_frag"]) for r in R).items()))


if __name__ == "__main__":
    main()
