# -*- coding: utf-8 -*-
"""Localiza as questões dentro de um PDF oficial do Enem.

As questões viram recortes de imagem da própria prova (e não texto extraído) porque
assim charges, mapas, tabelas e poemas chegam ao jogador exatamente como o INEP
publicou. Alguns PDFs, como os de 2021, nem têm texto interno legível.

Layout: cada página é uma pilha de zonas. Uma zona é larga (a questão vai de margem a
margem) ou dividida (duas colunas), e as duas formas podem conviver na mesma página.

Vocabulário usado aqui:
- célula: uma área lida de cima para baixo (zona larga ou uma coluna de zona dividida);
- marcador: o rótulo "QUESTÃO 12" que abre uma questão;
- fragmento: retângulo de uma célula que pertence a uma questão.
"""
import re
from collections import Counter
from dataclasses import dataclass, field

import pymupdf

RE_ROTULO = re.compile(r"^(QUEST[ÃãAa]O|Quest[ãa]o)$")  # 2025 traz "QUESTãO" em versalete
RE_NUMERO = re.compile(r"^\d{1,3}$")
RE_RODAPE = re.compile(
    r"(\bLC\b|\bCH\b|\bCN\b|\bMT\b|CADERNO|Caderno|PÁGINA|Página|PROVA \d|E ?N ?E ?M ?\d|\b[12]º DIA)")
# "rascunho" dentro de endereço não conta: o texto das questões 6 a 10 de 2025 vem de rascunho.com.br
RE_SEM_QUESTOES = re.compile(
    r"PROPOSTA DE REDA|INSTRUÇÕES PARA A REDA|Instruções para a Reda|(?<![/.@\w])RASCUNHO|TEXTOS? MOTIVADOR",
    re.I)
RE_TITULO_SECAO = re.compile(
    r"(^Quest[õo]es de \d+ a \d+|^QUEST[ÕO]ES DE \d+ A \d+|E SUAS TECNOLOGIAS|^PROVA DE |"
    r"^Quest[õo]es? \d+ a \d+|\(opção|opção (inglês|espanhol)|^LÍNGUA (INGLESA|ESPANHOLA)|"
    r"^Língua (Inglesa|Espanhola))")
RE_TEXTO_COMPARTILHADO = re.compile(
    r"quest[õo]es\s+(?:de\s+)?(\d+)\s*(?:,|e|a|até)\s*(\d+)(?:\s*(?:,|e|a)\s*(\d+))?", re.I)
RE_AUTOR = re.compile(r"^\((?=[^()]*[A-Za-zÀ-ú])[^()]{2,60}\)\.?$")  # "(Paulo Leminski)"
LETRAS = "ABCDE"
FOLGA_CALHA = 12  # quanto um elemento precisa invadir cada lado para contar como largo
MIN_LARGAS = 0.25  # fração das linhas da zona que precisa atravessar a calha
FOLGA_ALT = 2.5  # respiro da caixa clicável em volta do texto da alternativa, em pontos


@dataclass
class Linha:
    pag: int
    x0: float
    y0: float
    x1: float
    y1: float
    texto: str
    letra: str | None = None
    cel: int = 0
    fonte: str = ""
    base: float = 0.0  # linha de base do texto; 0 nas letras desenhadas de 2010
    tam: float = 0.0   # corpo da fonte, em pontos


@dataclass
class Celula:
    pag: int
    idx: int
    x0: float
    y0: float
    x1: float
    y1: float
    larga: bool


@dataclass
class Marcador:
    pag: int
    x0: float
    y0: float
    y1: float
    num: int
    cel: int = 0


@dataclass
class Fragmento:
    pag: int
    x0: float
    y0: float
    x1: float
    y1: float
    papel: str = "questao"  # "questao" ou "apoio" (texto compartilhado)


@dataclass
class QuestaoPDF:
    num: int
    ordem: int  # posição na leitura: distingue as duas versões das questões 1 a 5
    fragmentos: list = field(default_factory=list)
    alternativas: dict = field(default_factory=dict)  # letra -> (pag, cel, y0)
    alternativas_ok: bool = False
    alt_fim: tuple = ()
    texto: str = ""
    avisos: list = field(default_factory=list)


def letra_da_linha(spans):
    """Devolve a letra se a linha começa com o rótulo de uma alternativa."""
    uteis = [s for s in spans if s["text"].strip()]
    if not uteis:
        return None
    primeiro = uteis[0]["text"].strip()
    m = re.fullmatch(r"\(([A-E])\)", primeiro)
    if m:
        return m.group(1)
    m = re.match(r"\(([A-E])\)\s", "".join(s["text"] for s in uteis))
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-E]", primeiro):
        fonte = uteis[0]["font"]
        if re.search(r"Bundesbahn|Circled|Pi|Ding|Zapf|Symbol", fonte, re.I):
            return primeiro
        if len(uteis) > 1 and uteis[1]["font"] != fonte:
            return primeiro
        if len(uteis) == 1:
            return primeiro
    return None


class Prova:
    def __init__(self, caminho, numeracao_continua=False):
        """numeracao_continua: prova única de 1 a 63, sem repetir números (2005-2008)."""
        self.caminho = str(caminho)
        self.numeracao_continua = numeracao_continua
        self.doc = pymupdf.open(self.caminho)
        # a capa pode ter tamanho diferente do miolo (ex.: 2009), por isso é por página
        self.larguras = {i: p.rect.width for i, p in enumerate(self.doc)}
        self.alturas = {i: p.rect.height for i, p in enumerate(self.doc)}
        self.uma_coluna = not any(RE_ROTULO.match(w[4]) for p in list(self.doc)[2:6]
                                  for w in p.get_text("words"))
        self.linhas, self.objetos, self.circulos, self.imagens, self.aneis = {}, {}, {}, {}, {}
        self.base, self.calhas, self.celulas_pag = {}, {}, {}
        self._figuras = {}
        self.ignorar = set()
        self.marcadores = []
        self._ler_paginas()
        self._filtrar_marcadores()
        self._filtrar_letras()
        self._ajustar_margens()
        self._montar_celulas()

    # ---- leitura ---------------------------------------------------------
    def _ler_paginas(self):
        for pno, page in enumerate(self.doc):
            bruto = page.get_text("dict", flags=pymupdf.TEXT_PRESERVE_LIGATURES)
            linhas = []
            for bloco in bruto["blocks"]:
                if bloco["type"] != 0:
                    continue
                for l in bloco["lines"]:
                    texto = "".join(s["text"] for s in l["spans"]).strip()
                    if texto:
                        uteis = [s for s in l["spans"] if s["text"].strip()]
                        linhas.append(Linha(pno, *l["bbox"], texto, letra_da_linha(l["spans"]),
                                            fonte=uteis[0]["font"], base=uteis[0]["origin"][1],
                                            tam=max(s["size"] for s in uteis)))
            self.linhas[pno] = linhas
            marc = (self._achar_numeros_soltos(linhas) if self.uma_coluna
                    else self._achar_marcadores(page, pno))
            self.marcadores += marc
            rodape = [l.y0 for l in linhas
                      if l.y0 > self.alturas[pno] * 0.86 and RE_RODAPE.search(l.texto)]
            self.base[pno] = min(rodape) - 1 if rodape else self.alturas[pno] - 30
            if pno == 0 or (not marc and any(RE_SEM_QUESTOES.search(l.texto) for l in linhas)):
                self.ignorar.add(pno)
            self.objetos[pno], self.circulos[pno] = self._ler_objetos(page, pno)

    def _filtrar_marcadores(self):
        """Em 2005 há números soltos que são legendas de figuras, não questões."""
        if not self.numeracao_continua:
            return
        coluna = lambda m: 0 if self.uma_coluna or m.x0 < self.larguras[m.pag] / 2 else 1
        validos, esperado = [], 1
        for m in sorted(self.marcadores, key=lambda m: (m.pag, coluna(m), m.y0)):
            if m.num == esperado:
                validos.append(m)
                esperado += 1
        self.marcadores = validos

    def _filtrar_letras(self):
        """Cada página usa uma fonte só nos rótulos A-E; o resto é a palavra "A" no início da frase.

        É por página porque em 2006 o nome da fonte embutida muda de uma página para outra.
        """
        for ls in self.linhas.values():
            for l in ls:
                if l.letra and l.tam and l.tam < 6:
                    l.letra = None  # rótulo miúdo de mapa ou gráfico ("OCEANO ATLÂNTICO" letra a letra)
            fontes = Counter(l.fonte for l in ls if l.letra and not l.texto.startswith("("))
            if not fontes:
                continue
            dominante = fontes.most_common(1)[0][0]
            for l in ls:
                if l.letra and not l.texto.startswith("(") and l.fonte != dominante:
                    l.letra = None

    def _achar_marcadores(self, page, pno):
        palavras = page.get_text("words")
        achados = []
        for p in palavras:
            if not RE_ROTULO.match(p[4]):
                continue
            meio_y = (p[1] + p[3]) / 2
            candidatos = [v for v in palavras
                          if RE_NUMERO.match(v[4]) and abs((v[1] + v[3]) / 2 - meio_y) < 7
                          and -2 <= v[0] - p[2] < 30]
            if not candidatos or pno == 0:
                continue
            n = min(candidatos, key=lambda v: v[0] - p[2])
            achados.append(Marcador(pno, p[0], p[1], max(p[3], n[3]), int(n[4])))
        return achados

    def _achar_numeros_soltos(self, linhas):
        """Prova de 2005: linha que é só um número, logo depois do fio."""
        return [Marcador(l.pag, l.x0, l.y0, l.y1, int(l.texto))
                for l in linhas if RE_NUMERO.match(l.texto) and 100 < l.x0 < 220 and l.pag > 0]

    def _ler_objetos(self, page, pno):
        """Imagens e desenhos vetoriais; fios finos de layout ficam de fora.

        Devolve também os círculos pequenos: em 2010 as letras A-E são desenhos, não texto.
        """
        objs, circulos, imagens = [], [], []
        for info in page.get_image_info():
            r = pymupdf.Rect(info["bbox"])
            if r.get_area() > 40:
                objs.append(r)
                imagens.append(r)
        self.imagens[pno] = imagens
        aneis = self.aneis[pno] = []
        try:
            desenhos = page.get_drawings()
        except Exception:
            desenhos = []
        altura = self.alturas[pno]
        for d in desenhos:
            r = d["rect"]
            if r.width < 2 and r.height < 2:
                continue
            cor = d.get("color") or ()
            preenchimento = d.get("fill") or ()
            if len(cor) == 3 and cor[1] > cor[0] + 0.2 and cor[1] >= cor[2] and 10 < r.width < 24:
                aneis.append(pymupdf.Rect(r))  # resposta circulada em verde ou turquesa
                continue
            if not cor and len(preenchimento) == 3 and min(preenchimento) > 0.97:
                continue  # fundo branco, invisível
            fio = (r.height < 2 and r.width > 60) or (r.width < 2 and r.height > 60)
            moldura = r.height > altura * 0.7
            if not fio and not moldura:
                objs.append(pymupdf.Rect(r))
            if 6 <= r.width <= 9 and 6 <= r.height <= 9:
                circulos.append(Linha(pno, r.x0, r.y0, r.x1, r.y1, ""))
        return objs, circulos

    # ---- geometria da página ---------------------------------------------
    def _ajustar_margens(self):
        self.topo = (min(m.y0 for m in self.marcadores) - 3) if self.marcadores else 30
        # em 2008 o aviso "Texto para as questões 50 e 51" fica uns pontos acima do rótulo da
        # primeira questão da página; sem ele, o texto não vira apoio das questões
        avisos = [l.y0 for pno, ls in self.linhas.items() if pno not in self.ignorar for l in ls
                  if self.topo - 20 <= l.y0 < self.topo and RE_TEXTO_COMPARTILHADO.search(l.texto)
                  and not RE_TITULO_SECAO.search(l.texto)]
        if avisos:
            self.topo = min(avisos) - 2
        corpo = [l for ls in self.linhas.values() for l in ls
                 if self.topo <= l.y0 and l.pag not in self.ignorar]
        self.esq = min((l.x0 for l in corpo), default=20) - 3
        self.dir = max((l.x1 for l in corpo), default=max(self.larguras.values()) - 20) + 3
        por_pag = {}
        for pno, linhas in self.linhas.items():
            achada = self._calha_por_projecao(pno, linhas)
            if achada:
                por_pag[pno] = achada
        pares = Counter(round(v) for p, v in por_pag.items() if p % 2 == 0)
        impares = Counter(round(v) for p, v in por_pag.items() if p % 2 == 1)
        geral = pares + impares
        padrao = geral.most_common(1)[0][0] if geral else max(self.larguras.values()) / 2
        comum_par = pares.most_common(1)[0][0] if pares else padrao
        comum_impar = impares.most_common(1)[0][0] if impares else padrao
        for pno in self.linhas:
            comum = comum_par if pno % 2 == 0 else comum_impar
            achada = por_pag.get(pno, comum)
            if abs(achada - comum) > 6:
                # versos recuados abrem um vão falso: fica a posição usual se ela estiver livre
                corpo = [l for l in self.linhas[pno] if self.topo <= l.y0 and l.y1 <= self.base[pno]]
                atravessam = sum(l.x0 < comum - 3 and l.x1 > comum + 3 for l in corpo)
                if atravessam <= len(corpo) * 0.1:
                    achada = comum
            self.calhas[pno] = achada

    def _calha_por_projecao(self, pno, linhas):
        """Acha o vão vertical entre as colunas: a faixa central com menos texto em cima."""
        largura = self.larguras[pno]
        ini, fim = int(largura * 0.38), int(largura * 0.62)
        corpo = [l for l in linhas if self.topo <= l.y0 and l.y1 <= self.base[pno]]
        if len(corpo) < 12:
            return None
        cobertura = [0] * (fim - ini)
        for l in corpo:
            for x in range(max(ini, int(l.x0)), min(fim, int(l.x1) + 1)):
                cobertura[x - ini] += 1
        minimo = min(cobertura)
        if minimo > len(corpo) * 0.5:
            return None  # página de coluna única
        melhor, atual = (0, 0), None
        for i, v in enumerate(cobertura + [10 ** 6]):
            if v <= minimo:
                atual = i if atual is None else atual
            elif atual is not None:
                if i - atual > melhor[1] - melhor[0]:
                    melhor = (atual, i)
                atual = None
        if melhor[1] - melhor[0] < 3:
            return None
        return ini + (melhor[0] + melhor[1]) / 2

    def _zonas(self, pno):
        """Divide a página nas áreas entre marcadores da coluna esquerda.

        O layout largo vale para a questão inteira, então a decisão é por zona: uma zona é
        larga quando boa parte do conteúdo atravessa a calha e nenhuma questão começa na
        coluna direita dentro dela. Devolve [(y_ini, y_fim, é_larga)].
        """
        calha = self.calhas[pno]
        base = self.base[pno]
        cruza = lambda x0, x1: x0 < calha - FOLGA_CALHA and x1 > calha + FOLGA_CALHA
        marcs = [m for m in self.marcadores if m.pag == pno]
        esquerdos = sorted(m.y0 for m in marcs if m.x0 < calha - FOLGA_CALHA)
        direitos = [m.y0 for m in marcs if m.x0 >= calha - FOLGA_CALHA]
        cortes = [self.topo] + [y - 1 for y in esquerdos if y - 1 > self.topo + 2] + [base]
        zonas = []
        for ya, yb in zip(cortes, cortes[1:]):
            linhas = [l for l in self.linhas[pno] if ya - 1 <= l.y0 < yb and l.y1 <= base + 2
                      and not RE_TITULO_SECAO.search(l.texto)]
            cruzam = sum(cruza(l.x0, l.x1) for l in linhas)
            tem_direito = any(ya <= y < yb for y in direitos)
            por_texto = cruzam >= 2 and cruzam >= len(linhas) * MIN_LARGAS
            # Coluna direita sem texto corrido e um objeto atravessando a calha: é figura
            # larga (mapa, gráfico), não uma segunda coluna. Rótulos curtos de gráfico e
            # versos recuados não contam como texto corrido.
            texto_direita = sum(calha < l.x0 < calha + 26 and l.x1 - l.x0 > 90 for l in linhas)
            atravessa = any(cruza(o.x0, o.x1) and o.y1 > ya and o.y0 < yb
                            for o in self.objetos[pno])
            por_figura = texto_direita < 2 and atravessa and bool(linhas)
            zonas.append((ya, yb, not tem_direito and (por_texto or por_figura)))
        return zonas

    def _montar_celulas(self):
        for pno in self.linhas:
            celulas = []
            calha = self.calhas[pno]

            def dividida(ya, yb):
                if yb - ya > 3:
                    celulas.append(Celula(pno, len(celulas), self.esq, ya, calha - 1, yb, False))
                    celulas.append(Celula(pno, len(celulas), calha + 1, ya, self.dir, yb, False))

            if self.uma_coluna:
                celulas.append(Celula(pno, 0, self.esq, self.topo, self.dir, self.base[pno], True))
            else:
                inicio = None  # início da faixa dividida em aberto
                fim = self.topo
                for ya, yb, larga in self._zonas(pno):
                    if larga:
                        if inicio is not None:
                            dividida(inicio, ya)
                            inicio = None
                        celulas.append(Celula(pno, len(celulas), self.esq, ya, self.dir, yb, True))
                    elif inicio is None:
                        inicio = ya
                    fim = yb
                if inicio is not None:
                    dividida(inicio, fim)
            self.celulas_pag[pno] = celulas
            for item in self.linhas[pno] + self.circulos[pno]:
                item.cel = self._celula_de(pno, item.x0, item.x1, (item.y0 + item.y1) / 2)
            self.linhas[pno].sort(key=lambda l: (l.cel, l.y0, l.x0))
        for m in self.marcadores:
            m.cel = self._celula_de(m.pag, m.x0, m.x0 + 60, (m.y0 + m.y1) / 2)

    def _celula_de(self, pag, x0, x1, y):
        centro = (x0 + x1) / 2
        calha = self.calhas[pag]
        candidatas = [c for c in self.celulas_pag[pag] if c.y0 - 1 <= y <= c.y1 + 1]
        for c in candidatas:
            if c.larga or (centro < calha) == (c.x0 < calha):
                return c.idx
        return candidatas[0].idx if candidatas else 0

    # ---- recorte ---------------------------------------------------------
    def linhas_celula(self, pag, cel, y_de, y_ate):
        return [l for l in self.linhas[pag]
                if l.cel == cel and l.y0 >= y_de - 1 and l.y0 < y_ate and l.y1 <= self.base[pag] + 2]

    def caixa_conteudo(self, pag, cel, y_de, y_ate):
        """Encolhe a faixa até o conteúdo real; devolve None se a faixa está vazia."""
        c = self.celulas_pag[pag][cel]
        topo, base, esq, dir_ = None, None, None, None
        linhas = [l for l in self.linhas_celula(pag, cel, y_de, y_ate)
                  if not RE_TITULO_SECAO.search(l.texto)]
        for l in linhas:
            topo = l.y0 if topo is None else min(topo, l.y0)
            base = l.y1 if base is None else max(base, l.y1)
            esq = l.x0 if esq is None else min(esq, l.x0)
            dir_ = l.x1 if dir_ is None else max(dir_, l.x1)
        limite = min(y_ate, self.base[pag])
        fim_texto = base
        for o in self.objetos[pag]:
            cx = (o.x0 + o.x1) / 2
            if not c.x0 - 4 <= cx <= c.x1 + 4 or o.y1 < y_de or o.y0 > limite:
                continue
            if o.height < 3 and not linhas:
                continue
            if o.y0 < y_de - 1 and o.height < 60:
                continue  # enfeite do rótulo da questão ou da seção
            if fim_texto is not None and o.y0 > fim_texto - 1 and o.y1 > limite + 1:
                continue  # começa depois do texto e só cabe em parte: é o rótulo seguinte
            ytop, ybot = max(o.y0, y_de), min(o.y1, limite)
            if ybot - ytop < 1:
                continue
            topo = ytop if topo is None else min(topo, ytop)
            base = ybot if base is None else max(base, ybot)
            if o.width >= 2:  # fios verticais entre colunas não contam na largura
                esq = o.x0 if esq is None else min(esq, o.x0)
                dir_ = o.x1 if dir_ is None else max(dir_, o.x1)
        if topo is None or base - topo < 4:
            return None
        return (max(c.x0, esq - 3), max(topo - 0.5, y_de), min(c.x1, dir_ + 3), min(base + 3, limite))

    def ordem_marcadores(self):
        return sorted(self.marcadores, key=lambda m: (m.pag, m.cel, m.y0))

    def celulas(self, a, b):
        """Células de a até b (inclusive), na ordem de leitura."""
        for pag in range(a[0], b[0] + 1):
            if pag in self.ignorar:
                continue
            for c in self.celulas_pag[pag]:
                if a <= (pag, c.idx) <= b:
                    yield pag, c.idx

    # ---- montagem das questões -------------------------------------------
    def questoes(self):
        marcs = self.ordem_marcadores()
        saida = []
        apoios = {}  # número da questão -> [(posição na leitura, fragmentos do texto compartilhado)]
        for i, m in enumerate(marcs):
            prox = marcs[i + 1] if i + 1 < len(marcs) else None
            q = QuestaoPDF(m.num, i)
            faixas = self._faixas_ate(m, prox)
            linhas = [l for pag, cel, ya, yb in faixas for l in self.linhas_celula(pag, cel, ya, yb)]
            linhas = self._incluir_letras_desenhadas(linhas, faixas)
            fim = self._fim_da_questao(q, linhas, faixas)
            if fim is None:
                q.avisos.append("sem_alternativas")
                corte = faixas
            else:
                corte, resto = fim
                self._registrar_apoio(resto, apoios, i)
            for pag, cel, ya, yb in corte:
                caixa = self.caixa_conteudo(pag, cel, ya, yb)
                if caixa:
                    q.fragmentos.append(Fragmento(pag, *caixa))
            q.texto = " ".join(l.texto for l in linhas)
            saida.append(q)
        for q in saida:
            # o texto vem antes das questões a que se refere; nas questões de língua
            # estrangeira o mesmo número aparece duas vezes, e cada versão tem o seu texto
            antes = [(pos, frags) for pos, frags in apoios.get(q.num, []) if pos < q.ordem]
            extra = max(antes, key=lambda pf: pf[0])[1] if antes else None
            if extra:
                q.fragmentos = [Fragmento(f.pag, f.x0, f.y0, f.x1, f.y1, "apoio") for f in extra] + q.fragmentos
                q.avisos.append("texto_compartilhado")
        return saida

    def _incluir_letras_desenhadas(self, linhas, faixas):
        """Sem letras no texto, os cinco últimos círculos da questão são A-E."""
        if {l.letra for l in linhas} >= set(LETRAS):
            return linhas
        ordem = {(pag, cel): i for i, (pag, cel, _, _) in enumerate(faixas)}
        achados = sorted(
            (c for pag, cel, ya, yb in faixas for c in self.circulos[pag]
             if c.cel == cel and ya <= c.y0 < yb),
            key=lambda c: (ordem[(c.pag, c.cel)], c.y0))
        if len(achados) < 5:
            return linhas
        marcados = [Linha(c.pag, c.x0, c.y0, c.x1, c.y1, "", letra, c.cel)
                    for letra, c in zip(LETRAS, achados[-5:])]
        juntas = sorted(linhas + marcados, key=lambda l: (ordem[(l.pag, l.cel)], l.y0, l.x0))
        # A caixa da linha de texto começa acima do círculo da letra na mesma altura; sem
        # este ajuste o texto de cada alternativa ficaria com a letra anterior.
        for k in range(1, len(juntas)):
            j = k
            while j > 0 and juntas[j].letra and not juntas[j].texto:
                antes = juntas[j - 1]
                mesma_linha = (antes.pag, antes.cel) == (juntas[j].pag, juntas[j].cel) and \
                    antes.y0 < juntas[j].y1 and juntas[j].y0 < antes.y1 and antes.x0 > juntas[j].x1
                if not mesma_linha:
                    break
                juntas[j - 1], juntas[j] = juntas[j], antes
                j -= 1
        return juntas

    def _faixas_ate(self, m, prox):
        """Faixas verticais entre um marcador e o seguinte, célula por célula."""
        inicio = (m.pag, m.cel)
        if prox is None:
            ultimo = max(p for p in self.linhas if p not in self.ignorar)
            pag_fim = min(ultimo, m.pag + 1)
            fim = (pag_fim, max(len(self.celulas_pag[pag_fim]) - 1, 0))
        else:
            fim = (prox.pag, prox.cel)
        faixas = []
        for pag, cel in self.celulas(inicio, fim):
            c = self.celulas_pag[pag][cel]
            if (pag, cel) == inicio:
                # o corpo pode começar colado no rótulo; só então o corte sobe até o meio dele
                meio = (m.y0 + m.y1) / 2 + 1
                colada = any(l.cel == cel and meio <= l.y0 < m.y1 for l in self.linhas[pag])
                ya = meio if colada else m.y1 + 0.5
            else:
                ya = c.y0
            yb = prox.y0 - 1 if prox and (pag, cel) == (prox.pag, prox.cel) else c.y1
            if yb - ya > 3:
                faixas.append((pag, cel, ya, yb))
        return faixas

    def _fim_da_questao(self, q, linhas, faixas):
        """Acha A-E e separa o que vem depois da alternativa E."""
        ocorrencias = {c: [i for i, l in enumerate(linhas) if l.letra == c] for c in LETRAS}
        if not all(ocorrencias.values()):
            return None
        idx_e = ocorrencias["E"][-1]
        escolhidas = {"E": idx_e}
        limite = idx_e
        cadeia_ok = True
        for c in "DCBA":
            antes = [i for i in ocorrencias[c] if i < limite]
            if not antes:
                cadeia_ok = False
                break
            escolhidas[c] = antes[-1]
            limite = antes[-1]
        if not cadeia_ok:
            # alternativas lado a lado (A D / B E / C): ordem de leitura não vale
            escolhidas = {c: ocorrencias[c][-1] for c in LETRAS}
            idx_e = max(escolhidas.values())
            q.avisos.append("alternativas_lado_a_lado")
        e = linhas[idx_e]
        # vão normal entre duas linhas seguidas das alternativas: em 2009 passa de 7 pt
        vaos = sorted(b.y0 - a.y1 for a, b in zip(linhas[escolhidas["A"]:idx_e], linhas[escolhidas["A"] + 1:idx_e + 1])
                      if (a.pag, a.cel) == (b.pag, b.cel) and 0 < b.y0 - a.y1 < 20)
        vao_max = max(6.0, vaos[len(vaos) // 2] + 3) if vaos else 6.0
        ultimo = idx_e
        for j in range(idx_e + 1, len(linhas)):
            l = linhas[j]
            ant = linhas[ultimo]
            if l.pag != ant.pag or l.cel != ant.cel:
                # a alternativa pode terminar no alto da coluna seguinte, ainda com recuo, desde
                # que a frase não tenha acabado (o recuo também é o de um parágrafo novo)
                recuo = l.x0 - self.celulas_pag[l.pag][l.cel].x0
                recuo_e = e.x0 - self.celulas_pag[e.pag][e.cel].x0
                acabou = ant.texto.rstrip().endswith((".", "!", "?", ".”", ".\"", ".)"))
                if (l.letra is None and recuo > recuo_e + 5 and not acabou
                        and not RE_TEXTO_COMPARTILHADO.search(l.texto)):
                    ultimo = j
                    continue
                break
            continua = (l.y0 - ant.y1 < vao_max and e.x0 + 3 < l.x0 < e.x0 + 30 and l.letra is None
                        and not RE_TITULO_SECAO.search(l.texto) and not RE_TEXTO_COMPARTILHADO.search(l.texto))
            mesma_linha = abs(l.y0 - ant.y0) < 3
            # autor do texto da alternativa E, alinhado à direita: "(Henriqueta Lisboa)"
            credito = l.y0 - ant.y1 < vao_max and l.letra is None and RE_AUTOR.match(l.texto.strip())
            if continua or mesma_linha or credito:
                ultimo = j
            else:
                break
        fim = linhas[ultimo]
        y_fim = fim.y1
        c = self.celulas_pag[fim.pag][fim.cel]
        for o in self.objetos[fim.pag]:
            if (c.x0 - 4 <= (o.x0 + o.x1) / 2 <= c.x1 + 4 and o.y0 < e.y1 - 2 and o.y1 > e.y0
                    and self._cabe_na_pagina(fim.pag, o)):
                y_fim = max(y_fim, min(o.y1, self.base[fim.pag]))
        # legenda logo abaixo da imagem da alternativa E
        if y_fim > fim.y1 + 2:
            for l in linhas[ultimo + 1:]:
                # a caixa da fonte pode subir um pouco sobre a figura
                if (l.pag, l.cel) == (fim.pag, fim.cel) and l.letra is None and -4 <= l.y0 - y_fim < 6:
                    y_fim = l.y1
        if not cadeia_ok:
            # sem ordem de leitura confiável, a questão fica com a coluna inteira onde estão as
            # alternativas; as colunas seguintes podem trazer o texto das próximas questões (2007)
            q.alt_fim = (fim.pag, fim.cel, y_fim)
            posicao = {(pag, cel): k for k, (pag, cel, _, _) in enumerate(faixas)}
            ultima = max(posicao.get((linhas[i].pag, linhas[i].cel), 0) for i in escolhidas.values())
            return faixas[:ultima + 1], faixas[ultima + 1:]
        corte, resto = [], []
        passou = False
        for pag, cel, ya, yb in faixas:
            if passou:
                resto.append((pag, cel, ya, yb))
            elif (pag, cel) == (fim.pag, fim.cel):
                corte.append((pag, cel, ya, min(yb, y_fim + 2)))
                if yb - y_fim > 6:
                    resto.append((pag, cel, y_fim + 2, yb))
                passou = True
            else:
                corte.append((pag, cel, ya, yb))
        self._caixas_alternativas(q, linhas, escolhidas, ultimo, y_fim)
        q.alternativas_ok = True
        q.alt_fim = (fim.pag, fim.cel, y_fim)
        return corte, resto

    @staticmethod
    def _faixa_visivel(l):
        """Topo e base do que aparece impresso na linha.

        A caixa que o PDF declara vem das medidas da fonte e pode sobrar bastante em cima:
        nas provas de 2025 ela é 2,7 pt mais alta que o espaço entre as linhas. A linha de
        base não depende da fonte.
        """
        if l.base and l.tam:
            return l.base - 0.78 * l.tam, l.base + 0.26 * l.tam
        return l.y0, l.y1

    def _vao_livre(self, pag, ret, y0, y1):
        """Maior faixa em branco entre y0 e y1 na coluna; figuras contam como ocupadas."""
        if y1 <= y0:
            return 0.0
        cobertos = sorted((max(o.y0, y0), min(o.y1, y1)) for o in self._figuras_da_pagina(pag)
                          if o.y1 > y0 and o.y0 < y1 and o.width >= 2 and o.height >= 2
                          and ret.x0 - 4 <= (o.x0 + o.x1) / 2 <= ret.x1 + 4)
        livre, cursor = 0.0, y0
        for c0, c1 in cobertos:
            livre = max(livre, c0 - cursor)
            cursor = max(cursor, c1)
        return max(livre, y1 - cursor)

    def _cabe_na_pagina(self, pag, o):
        """Fora disso é fundo ou marca d'água (há imagens de página inteira, até fora da folha)."""
        return o.x0 >= -2 and o.x1 <= self.larguras[pag] + 2 and o.height <= 0.6 * self.alturas[pag]

    def _figuras_da_pagina(self, pag):
        """Objetos que se tocam formam uma figura só: um desenho vetorial vem em muitos pedaços."""
        if pag in self._figuras:
            return self._figuras[pag]
        objs = [o for o in self.objetos[pag] if max(o.width, o.height) >= 2 and self._cabe_na_pagina(pag, o)]
        # duas imagens prontas encostadas continuam sendo duas figuras
        ids_imagens = {id(im) for im in self.imagens.get(pag, [])}
        imagem = [id(o) in ids_imagens for o in objs]
        pai = list(range(len(objs)))

        def raiz(i):
            while pai[i] != i:
                pai[i] = pai[pai[i]]
                i = pai[i]
            return i

        ordem = sorted(range(len(objs)), key=lambda i: objs[i].y0)
        for pos, i in enumerate(ordem):
            oi = objs[i]
            for j in ordem[pos + 1:]:
                oj = objs[j]
                if oj.y0 > oi.y1 + 1:
                    break
                if imagem[i] and imagem[j]:
                    continue
                if oj.x0 <= oi.x1 + 1 and oi.x0 <= oj.x1 + 1:
                    pai[raiz(i)] = raiz(j)
        grupos = {}
        for i, o in enumerate(objs):
            r = raiz(i)
            grupos[r] = pymupdf.Rect(o) if r not in grupos else grupos[r] | o
        self._figuras[pag] = list(grupos.values())
        return self._figuras[pag]

    @staticmethod
    def _letra_a_esquerda(candidatas, x):
        """Entre alternativas na mesma altura, fica a da letra mais próxima à esquerda de x.

        Numa lista comum as letras estão todas na mesma margem e nada muda; com as
        alternativas lado a lado ("(A) 1  (B) 2  (C) 3") cada texto vai para a sua letra.
        """
        if len(candidatas) < 2 or max(a["letra_linha"].x0 for a in candidatas) - min(
                a["letra_linha"].x0 for a in candidatas) < 3:
            return candidatas
        antes = [a for a in candidatas if a["letra_linha"].x0 <= x + 1]
        return [max(antes, key=lambda a: a["letra_linha"].x0)] if antes else []

    def _caixas_alternativas(self, q, linhas, escolhidas, ultimo, y_fim):
        """Retângulo de cada alternativa, justo ao que está impresso e sem invadir as vizinhas.

        Guarda (pag, cel, topo, base, esquerda, direita) em q.alternativas. Quando as
        alternativas são figuras, a figura que tem a letra à sua altura é daquela alternativa,
        e o texto ao lado dela (crédito, legenda) vai junto, mesmo que comece acima da letra.
        """
        def cel(l):
            return (l.pag, l.cel)

        def meio(l):
            t, b = self._faixa_visivel(l)
            return (t + b) / 2

        ordem = sorted(escolhidas.items(), key=lambda kv: kv[1])
        alts = []
        for k, (letra, i) in enumerate(ordem):
            fim = ordem[k + 1][1] if k + 1 < len(ordem) else ultimo + 1
            l0 = linhas[i]
            alts.append(dict(letra=letra, i=i, letra_linha=l0, celula=cel(l0), centro=meio(l0),
                             retangulo=self.celulas_pag[l0.pag][l0.cel], figuras=[], soltas=[],
                             linhas=[l for l in linhas[i:fim] if cel(l) == cel(l0)]))
        primeira, ultima = alts[0], alts[-1]

        # figuras: a que tem à sua altura a letra de uma única alternativa é dela; a que tem
        # várias letras ao lado é do enunciado; as que não têm nenhuma são vistas mais abaixo
        soltas = []
        for pag in {a["celula"][0] for a in alts}:
            for o in self._figuras_da_pagina(pag):
                if o.width < 2 or o.height < 2:
                    continue
                meio_x = (o.x0 + o.x1) / 2
                da_celula = [a for a in alts if a["celula"][0] == pag
                             and a["retangulo"].x0 - 4 <= meio_x <= a["retangulo"].x1 + 4]
                com_letra = self._letra_a_esquerda(
                    [a for a in da_celula if o.y0 - 1 <= a["centro"] <= o.y1 + 1], o.x0)
                if len(com_letra) == 1:
                    r = com_letra[0]["retangulo"]
                    if r.x0 - 6 <= o.x0 and o.x1 <= r.x1 + 6 and o.height <= 0.6 * (r.y1 - r.y0):
                        com_letra[0]["figuras"].append(o)
                elif not com_letra and da_celula:
                    soltas.append((o, da_celula))

        # o texto que fica na altura da letra ou da figura de uma alternativa é dela, mesmo
        # que venha antes da letra na ordem de leitura (letra dentro de um círculo desenhado)
        faixas = [(a, *self._faixa_visivel(a["letra_linha"])) for a in alts]
        faixas += [(a, min(o.y0 for o in a["figuras"]), max(o.y1 for o in a["figuras"]))
                   for a in alts if a["figuras"]]

        def dona(l, padrao):
            m = meio(l)
            candidatas = []
            for a, f0, f1 in faixas:
                if a["celula"] == cel(l) and f0 <= m <= f1 and all(a is not c for c in candidatas):
                    candidatas.append(a)
            if not candidatas:
                return padrao
            return (self._letra_a_esquerda(candidatas, l.x0) or candidatas)[0]

        # texto da alternativa A que começa acima da letra: na altura da letra ou da figura, ou,
        # quando a letra vem sozinha na linha, com o recuo do texto das alternativas e sem
        # linha em branco no meio (o enunciado começa na margem)
        de_antes = []
        l0 = primeira["letra_linha"]
        so_letra = l0.x1 - l0.x0 < 20
        topo_texto = min(self._faixa_visivel(l)[0] for l in primeira["linhas"])
        for l in reversed(linhas[:primeira["i"]]):
            if cel(l) != primeira["celula"]:
                break
            # na mesma altura da letra (em 2022 e 2023 a letra vem duas vezes: na linha e solta)
            na_faixa = dona(l, None) is primeira
            if l.letra is not None and not na_faixa:
                break
            t, b_ = self._faixa_visivel(l)
            recuada = so_letra and l.letra is None and l.x0 >= l0.x1 + 2 and topo_texto - b_ < 6
            if not na_faixa and not recuada:
                break
            de_antes.append(l)
            topo_texto = min(topo_texto, t)
        legenda = []  # legenda logo abaixo da figura da última alternativa
        if ultima["figuras"]:
            fundo = max(o.y1 for o in ultima["figuras"])
            for l in sorted((l for l in linhas[ultimo + 1:] if cel(l) == ultima["celula"]),
                            key=lambda l: l.y0):
                if l.letra is None and l.y0 - fundo < -4:
                    continue  # ao lado da figura, não embaixo
                if l.letra is not None or l.y0 - fundo >= 6 or l.y1 > y_fim + 1:
                    break
                legenda.append(l)
                fundo = l.y1
        todas = [(l, a) for a in alts for l in a["linhas"]]
        todas += [(l, primeira) for l in de_antes] + [(l, ultima) for l in legenda]
        for a in alts:
            a["linhas"] = []
        for l, a in todas:
            (a if l is a["letra_linha"] else dona(l, a))["linhas"].append(l)

        # quando a letra fica no meio do texto (poemas, falas), o texto da alternativa começa
        # acima dela: o que vem depois de uma linha em branco é da alternativa seguinte
        for a, b in zip(alts, alts[1:]):
            if a["celula"] != b["celula"]:
                continue
            topo_a, fundo = self._faixa_visivel(a["letra_linha"])
            seq = sorted((l for l in a["linhas"] if self._faixa_visivel(l)[0] > topo_a + 1),
                         key=lambda l: self._faixa_visivel(l)[0])
            if not seq:
                continue
            pag, ret = a["celula"][0], a["retangulo"]
            vaos = []
            for j, l in enumerate(seq):
                t, b_ = self._faixa_visivel(l)
                vaos.append((self._vao_livre(pag, ret, fundo, t), j))
                fundo = max(fundo, b_)
            ultimo_vao = self._vao_livre(pag, ret, fundo, self._faixa_visivel(b["letra_linha"])[0])
            maior, j = max(vaos)
            if maior >= 6 and maior >= ultimo_vao + 4:
                movidas = {id(l) for l in seq[j:]}
                b["linhas"] += [l for l in a["linhas"] if id(l) in movidas]
                a["linhas"] = [l for l in a["linhas"] if id(l) not in movidas]

        antes = [l for l in linhas[:primeira["i"]]
                 if cel(l) == primeira["celula"] and all(l is not x for x in de_antes)]
        fim_anterior = self._faixa_visivel(antes[-1])[1] if antes else None
        for a in alts:
            faixas_texto = [self._faixa_visivel(l) for l in a["linhas"]]
            a["topo"] = min(f[0] for f in faixas_texto)
            a["base"] = max(f[1] for f in faixas_texto)
        for k, a in enumerate(alts):
            if k + 1 < len(alts) and alts[k + 1]["celula"] == a["celula"]:
                a["limite"] = alts[k + 1]["topo"]
            else:
                a["limite"] = y_fim if a is ultima else a["retangulo"].y1

        # figura sem letra ao lado: fica com a alternativa logo acima dela
        for o, da_celula in soltas:
            meio_y = (o.y0 + o.y1) / 2
            a = next((a for a in da_celula if a["topo"] - 2 <= meio_y < a["limite"]
                      and o.y0 >= a["topo"] - 6 and o.y1 <= a["limite"] + 4), None)
            if a is not None:
                a["soltas"].append(o)

        brutas = []
        for a in alts:
            topo, base = a["topo"], a["base"]
            esq, dir_ = min(l.x0 for l in a["linhas"]), max(l.x1 for l in a["linhas"])
            for o in a["figuras"]:
                topo, base = min(topo, o.y0), max(base, min(o.y1, y_fim) if a is ultima else o.y1)
                esq, dir_ = min(esq, o.x0), max(dir_, o.x1)
            for o in a["soltas"]:
                topo, base = min(topo, o.y0), max(base, min(o.y1, a["limite"]))
                esq, dir_ = min(esq, o.x0), max(dir_, o.x1)
            brutas.append((a["letra"], a["celula"], topo, base, esq, dir_))
        # alternativas na mesma altura formam uma fileira ("(A) 1  (B) 2  (C) 3"): entre elas o
        # limite é na horizontal; entre fileiras (numa lista comum, cada uma tem uma só), na vertical
        def lado_a_lado(p, s):
            sobra = min(p[3], s[3]) - max(p[2], s[2])
            return p[1] == s[1] and sobra > 0.5 * min(p[3] - p[2], s[3] - s[2])

        lado = [k + 1 < len(brutas) and lado_a_lado(brutas[k], brutas[k + 1]) for k in range(len(brutas))]
        filas = []
        for k in range(len(brutas)):
            if k > 0 and lado[k - 1]:
                filas[-1].append(k)
            else:
                filas.append([k])
        # mesma largura para a lista de uma coluna: fica alinhada dos dois lados
        direita = {}
        for f in filas:
            if len(f) == 1:
                _, celula, _, _, _, dir_ = brutas[f[0]]
                direita[celula] = max(direita.get(celula, dir_), dir_)
        for i, f in enumerate(filas):
            celula = brutas[f[0]][1]
            anterior_ok = i > 0 and brutas[filas[i - 1][0]][1] == celula
            seguinte_ok = i + 1 < len(filas) and brutas[filas[i + 1][0]][1] == celula
            cima = fim_anterior if i == 0 else (max(brutas[k][3] for k in filas[i - 1]) if anterior_ok else None)
            baixo = min(brutas[k][2] for k in filas[i + 1]) if seguinte_ok else None
            for k in f:
                letra, _, topo, base, esq, dir_ = brutas[k]
                if len(f) == 1:
                    dir_ = direita[celula]
                t = topo - FOLGA_ALT if cima is None else max(topo - FOLGA_ALT, (cima + topo) / 2 + 0.4)
                b = base + FOLGA_ALT if baixo is None else min(base + FOLGA_ALT, (base + baixo) / 2 - 0.4)
                e, d = esq - FOLGA_ALT, dir_ + FOLGA_ALT
                if k > 0 and lado[k - 1]:
                    e = max(e, (brutas[k - 1][5] + esq) / 2 + 0.4)
                if lado[k]:
                    d = min(d, (dir_ + brutas[k + 1][4]) / 2 - 0.4)
                q.alternativas[letra] = (*celula, t, b, e, d)

    def _registrar_apoio(self, resto, apoios, posicao):
        """Texto entre o fim de uma questão e a próxima: pode valer para as seguintes."""
        linhas = [l for pag, cel, ya, yb in resto for l in self.linhas_celula(pag, cel, ya, yb)
                  if not RE_TITULO_SECAO.search(l.texto)]
        if not linhas:
            return
        texto = " ".join(l.texto for l in linhas)
        m = RE_TEXTO_COMPARTILHADO.search(texto[:200])
        if not m:
            return
        grupos = [int(g) for g in m.groups() if g]
        ini, fim = grupos[0], grupos[-1]
        alvos = range(ini, fim + 1) if fim - ini < 8 else grupos
        fragmentos = []
        for pag, cel, ya, yb in resto:
            caixa = self.caixa_conteudo(pag, cel, ya, yb)
            if caixa:
                fragmentos.append(Fragmento(pag, *caixa, "apoio"))
        for n in alvos:
            apoios.setdefault(n, []).append((posicao, fragmentos))

    def auditar(self, q):
        """Procura sinais objetivos de recorte ruim; devolve a lista de problemas."""
        problemas = set()
        for f in q.fragmentos:
            for l in self.linhas[f.pag]:
                altura = max(l.y1 - l.y0, 1)
                dentro = (min(l.y1, f.y1) - max(l.y0, f.y0)) / altura
                if dentro <= 0.15:
                    continue
                if dentro < 0.7 and f.x0 <= (l.x0 + l.x1) / 2 <= f.x1:
                    problemas.add("linha_cortada_na_altura")
                if (l.x0 < f.x0 - 2 and l.x1 > f.x0 + 2) or (l.x0 < f.x1 - 2 and l.x1 > f.x1 + 2):
                    problemas.add("linha_cortada_na_lateral")
            for o in self.imagens[f.pag]:
                if o.y1 <= f.y0 + 1 or o.y0 >= f.y1 - 1 or o.height < 20:
                    continue
                if (o.x0 < f.x0 - 3 and o.x1 > f.x0 + 3) or (o.x0 < f.x1 - 3 and o.x1 > f.x1 + 3):
                    problemas.add("imagem_cortada_na_lateral")
        alturas = {}
        for f in q.fragmentos:
            if f.papel != "questao":
                continue
            for l in self.linhas[f.pag]:
                if l.letra and f.x0 <= l.x0 and l.x1 <= f.x1 + 2 and f.y0 - 1 <= l.y0 and l.y1 <= f.y1 + 1:
                    alturas.setdefault(l.letra, set()).add((f.pag, round(l.y0 / 4)))
        if len(alturas) == 5 and min(len(v) for v in alturas.values()) > 1:
            problemas.add("mais_de_uma_questao")
        if not q.fragmentos:
            problemas.add("sem_recorte")
        return sorted(problemas)

    def apoio_entre(self, anterior, seguinte):
        """Fragmentos do texto solto entre o fim de uma questão e o rótulo da seguinte."""
        marc = next(m for m in self.ordem_marcadores() if m.num == seguinte.num)
        if anterior is None or not anterior.alt_fim:
            pag, cel, y0 = marc.pag, marc.cel, self.topo
            # o começo da página pode trazer instruções gerais antes do texto de apoio
            for l in self.linhas[pag]:
                if l.cel == cel and l.y0 < marc.y0 and RE_TEXTO_COMPARTILHADO.search(l.texto):
                    y0 = l.y0 - 1
                    break
        else:
            pag, cel, y0 = anterior.alt_fim
            y0 += 3
        fragmentos = []
        for p, c in self.celulas((pag, cel), (marc.pag, marc.cel)):
            celula = self.celulas_pag[p][c]
            caixa = self.caixa_conteudo(p, c, y0 if (p, c) == (pag, cel) else celula.y0,
                                        marc.y0 - 1 if (p, c) == (marc.pag, marc.cel) else celula.y1)
            if caixa:
                fragmentos.append(Fragmento(p, *caixa, "apoio"))
        return fragmentos

    def respostas_circuladas(self, questoes):
        """{ordem da questão: letra} a partir dos anéis verdes, quando o PDF os tem."""
        respostas = {}
        for q in questoes:
            achadas = set()
            for letra, (pag, cel, topo, base, *_) in q.alternativas.items():
                for r in self.aneis[pag]:
                    meio = (r.y0 + r.y1) / 2
                    if self._celula_de(pag, r.x0, r.x1, meio) == cel and topo <= meio <= base:
                        achadas.add(letra)
            if len(achadas) == 1:  # ambíguo ou sem anel: fica sem a segunda fonte
                respostas[q.ordem] = achadas.pop()
        return respostas

    def renderizar(self, frag, dpi):
        page = self.doc[frag.pag]
        clip = pymupdf.Rect(frag.x0, frag.y0, frag.x1, frag.y1)
        return page.get_pixmap(dpi=dpi, clip=clip, alpha=False)

    def aneis_no_recorte(self, frag, dpi):
        """Retângulos (em pixels do recorte) dos anéis verdes que precisam sumir da imagem."""
        z = dpi / 72
        saida = []
        # Provas com gabarito marcado têm um anel por questão; poucos anéis são ilustração.
        if sum(len(v) for v in self.aneis.values()) < 20:
            return saida
        for r in self.aneis.get(frag.pag, []):
            if r.x1 < frag.x0 or r.x0 > frag.x1 or r.y1 < frag.y0 or r.y0 > frag.y1:
                continue
            saida.append((int((r.x0 - frag.x0 - 2) * z), int((r.y0 - frag.y0 - 2) * z),
                          int((r.x1 - frag.x0 + 2) * z) + 1, int((r.y1 - frag.y0 + 2) * z) + 1))
        return saida
