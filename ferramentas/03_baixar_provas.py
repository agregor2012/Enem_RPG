# -*- coding: utf-8 -*-
"""Baixa do site oficial do INEP as provas e gabaritos dos dois dias do Enem:
Linguagens, Ciências Humanas, Redação, Ciências da Natureza e Matemática.

Regra por período:
- 2005-2008: prova única (vem dos microdados oficiais, script 02);
- 2009-2016: Humanas e Natureza no 1º dia, Linguagens, Matemática e Redação no 2º;
- 2017-2025: Linguagens, Humanas e Redação no 1º dia, Natureza e Matemática no 2º.

Versões de acessibilidade (ampliada, superampliada, ledor, leitor de tela) têm as
mesmas questões das versões comuns; use --sem-acessibilidade para deixá-las de fora.

Uso: 03_baixar_provas.py [--medir] [--sem-acessibilidade]
Saída: provas/<ano>/<aplicacao>/ e dados/provas_baixadas.json
"""
import json
import re
import shutil
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from zip_remoto import curl, tamanho_remoto

RAIZ = Path(__file__).resolve().parent.parent
PROVAS = RAIZ / "provas"
VERSOES_ACESSIBILIDADE = re.compile(
    r"ampliada|ledor|nvda|dosvox|leitor|braile|braille", re.I)


def dia_do_link(secao, nome):
    """Retorna 1, 2 ou None. Na aplicação de Belém (2025) D3/D4 equivalem a D1/D2,
    e na reaplicação de 2025, D5/D6."""
    m = re.search(r"_D([1-6])_", nome)
    if m:
        return 1 if int(m.group(1)) % 2 else 2
    m = re.search(r"dia[_ ]?([12])", nome, re.I)
    if m:
        return int(m.group(1))
    m = re.search(r"([12])º\s*dia|dia\s*([12])", secao, re.I)
    if m:
        return int(m.group(1) or m.group(2))
    m = re.search(r"cad(?:erno)?[_ ]?(\d+)", nome, re.I)
    if m:
        return 1 if int(m.group(1)) in (1, 2, 3, 4, 9, 10, 13, 14, 15, 16) else 2
    return None


def aplicacao_do_link(ano, secao, nome):
    s = secao.lower()
    n = nome.lower()
    if "belém" in s or "belem" in s or re.search(r"_D[34]_", nome):
        return "belem"
    if "digital" in n or "digital" in s:
        return "digital"
    if "2ª aplica" in s or "segunda aplica" in s:
        return "segunda_aplicacao"
    if "ppl" in s or "ppl" in n or "reaplica" in s or "reaplica" in n or re.search(r"_D[56]_", nome):
        return "reaplicacao_ppl"
    return "regular"


def selecionar(acessibilidade=False):
    manifesto = json.loads((RAIZ / "dados" / "manifesto_inep.json").read_text(encoding="utf-8"))
    vistos, itens, ignorados = set(), [], []
    for ano_txt, dados in manifesto.items():
        ano = int(ano_txt)
        if ano < 2009:
            continue  # vêm dos microdados
        for link in dados["links"]:
            # alguns links antigos da página usam http://, que o servidor não atende
            url = link["url"].replace("http://", "https://", 1)
            nome = url.rsplit("/", 1)[-1]
            if url in vistos:
                continue
            vistos.add(url)
            texto = f"{link['secao']} {link['texto']} {nome}"
            if not acessibilidade and VERSOES_ACESSIBILIDADE.search(texto):
                ignorados.append({"ano": ano, "nome": nome, "motivo": "versão de acessibilidade"})
                continue
            # "tema_redacao_*.pdf": tema da redação publicado à parte (Redação é do 1º dia)
            dia = 1 if "tema_redacao" in nome else dia_do_link(link["secao"], nome)
            if dia is None:
                ignorados.append({"ano": ano, "nome": nome, "motivo": "dia não identificado"})
                continue
            tipo = "gabarito" if link["texto"].lower().startswith("gabarito") else "prova"
            itens.append({
                "ano": ano, "dia": dia, "tipo": tipo, "url": url, "nome": nome,
                "aplicacao": aplicacao_do_link(ano, link["secao"], nome),
                "secao": link["secao"],
            })
    return itens, ignorados


def medir(item):
    try:
        item["bytes"] = tamanho_remoto(item["url"]) or 0
    except Exception as exc:
        item["bytes"] = 0
        item["erro"] = str(exc)[:120]
    return item


def baixar(item):
    alvo = PROVAS / str(item["ano"]) / item["aplicacao"] / item["nome"]
    item["arquivo"] = str(alvo.relative_to(RAIZ)).replace("\\", "/")
    if alvo.exists() and alvo.stat().st_size == item.get("bytes", -1):
        return item
    alvo.parent.mkdir(parents=True, exist_ok=True)
    try:
        dados = curl([item["url"]])
        if item.get("bytes") and len(dados) != item["bytes"]:
            raise IOError(f"tamanho divergente: {len(dados)} != {item['bytes']}")
        if not dados.startswith(b"%PDF") and item["nome"].lower().endswith(".pdf"):
            raise IOError("o arquivo recebido não é um PDF")
        alvo.write_bytes(dados)
    except Exception as exc:
        item["erro"] = str(exc)[:160]
    return item


def copiar_microdados():
    """Provas de 2005-2008 extraídas dos microdados oficiais."""
    itens = []
    for ano in range(2005, 2009):
        for pdf in sorted((RAIZ / "dados" / "microdados" / str(ano)).glob("*.pdf")):
            alvo = PROVAS / str(ano) / "regular" / pdf.name
            alvo.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(pdf, alvo)
            tipo = "gabarito" if "GAB" in pdf.name else "prova"
            itens.append({
                "ano": ano, "dia": 1, "tipo": tipo, "nome": pdf.name, "aplicacao": "regular",
                "secao": "Microdados oficiais do INEP", "bytes": pdf.stat().st_size,
                "url": f"https://download.inep.gov.br/microdados/microdados_enem_{ano}.zip",
                "arquivo": str(alvo.relative_to(RAIZ)).replace("\\", "/"),
            })
    return itens


def main():
    acess = "--sem-acessibilidade" not in sys.argv
    itens, ignorados = selecionar(acess)
    with ThreadPoolExecutor(8) as ex:
        itens = list(ex.map(medir, itens))
    total = sum(i["bytes"] for i in itens)
    print(f"{len(itens)} arquivos, {total / 1e6:.0f} MB; {len(ignorados)} links ignorados")
    resumo = {}
    for i in itens:
        r = resumo.setdefault(i["ano"], [0, 0])
        r[0] += 1
        r[1] += i["bytes"]
    for ano in sorted(resumo):
        print(f"  {ano}: {resumo[ano][0]:3d} arquivos, {resumo[ano][1] / 1e6:7.1f} MB")
    falhas = [i for i in itens if i.get("erro")]
    for f in falhas[:10]:
        print("  sem resposta:", f["nome"], f["erro"])
    if "--medir" in sys.argv:
        return
    with ThreadPoolExecutor(6) as ex:
        itens = list(ex.map(baixar, itens))
    itens += copiar_microdados()
    falhas = [i for i in itens if i.get("erro")]
    (RAIZ / "dados" / "provas_baixadas.json").write_text(json.dumps(
        {"itens": itens, "ignorados": ignorados}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"baixados: {len(itens) - len(falhas)}; falhas: {len(falhas)}")
    for f in falhas:
        print("  FALHA", f["ano"], f["nome"], f["erro"])


if __name__ == "__main__":
    main()
