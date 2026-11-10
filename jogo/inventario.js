'use strict';
/* Sistema de itens do ENEM RPG: inventário, equipamentos, efeitos, recompensas, fabricação,
   loja, missões do dia, modo desenvolvedor e a tela do Inventário. Os dados ficam em itens.js.
   Este arquivo carrega antes de app.js e só usa as funções dele quando é chamado. */

const ITEM_POR_ID = new Map(ITENS.map(i => [i.id, i]));
const UNICAS = new Set(['arma', 'armadura', 'acessorio', 'artefato', 'mascote', 'reliquia']);
const ARMADOS = new Set(['segunda_chance', 'protege_sequencia']); // ficam prontos e só gastam se agirem
const NOME_TABELA = {
  inimigo: 'inimigos do Sábio', inimigo_forte: 'inimigos fortes do Sábio', chefe: 'chefes do Sábio',
  guardiao: `guardiões vencidos (a partir de ${ESPOLIO_GUARDIAO.minimo} questões)`, bau_madeira: 'Baú de Madeira', bau_prata: 'Baú de Prata', bau_ouro: 'Baú de Ouro',
  mimico: 'Mímico Enganador',
};

function itemDef(id) { return ITEM_POR_ID.get(id); }
function ehUnico(def) { return UNICAS.has(def.cat); }
function inteiroEntre(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function sortearPeso(pares) {
  const total = pares.reduce((t, [, p]) => t + p, 0);
  let r = Math.random() * total;
  for (const [valor, peso] of pares) { r -= peso; if (r < 0) return valor; }
  return pares[pares.length - 1][0];
}

/* ---- inventário -------------------------------------------------------- */
function itensNovos() {
  return {
    moedas: 0, inv: {}, vistos: {}, premiadas: {},
    equip: Object.fromEntries(ESPACOS.map(e => [e.id, null])),
    missoes: { dia: null, feitas: {} }, loja: { dia: null, compras: {} },
    mascotes: {}, // reservado: evolução dos mascotes
  };
}
function mesclarItens(salvo) {
  const novo = itensNovos();
  if (!salvo) return novo;
  return { ...novo, ...salvo, equip: { ...novo.equip, ...salvo.equip }, missoes: { ...novo.missoes, ...salvo.missoes },
           loja: { ...novo.loja, ...salvo.loja } };
}
/* Inventário em uso: o de verdade ou, no modo desenvolvedor, uma cópia de teste que não é gravada. */
function inventario() {
  if (E.save.cfg.dev) return E.dev || criarDev();
  return E.save.itens;
}
function qtdItem(id, inv = inventario()) { return inv.inv[id] || 0; }
function espacoDoItem(id, inv = inventario()) { return ESPACOS.find(e => inv.equip[e.id] === id)?.id || null; }
function ganharMoedas(n, inv = inventario()) { inv.moedas = (inv.moedas || 0) + n; }
function gastarMoedas(n, inv = inventario()) {
  if (inv.dev) return true;
  if ((inv.moedas || 0) < n) return false;
  inv.moedas -= n;
  return true;
}
/* Equipamentos, mascotes e relíquias são únicos: um repetido vira moedas. */
function ganharItem(id, n = 1, inv = inventario()) {
  const def = itemDef(id);
  if (!def || n <= 0) return null;
  inv.vistos[id] = true;
  if (ehUnico(def) && qtdItem(id, inv) > 0) {
    const moedas = (VALOR_VENDA[def.rar] || 60) * 2;
    ganharMoedas(moedas, inv);
    return { id, n: 1, duplicado: true, moedasExtra: moedas };
  }
  const qtd = ehUnico(def) ? 1 : n;
  inv.inv[id] = qtdItem(id, inv) + qtd;
  return { id, n: qtd };
}
function gastarItem(id, n = 1, inv = inventario()) {
  if (qtdItem(id, inv) < n) return false;
  inv.inv[id] -= n;
  if (!inv.inv[id]) delete inv.inv[id];
  return true;
}
function equiparItem(id, inv = inventario()) {
  const def = itemDef(id);
  if (!def || qtdItem(id, inv) < 1 || espacoDoItem(id, inv)) return false;
  const espacos = ESPACOS.filter(e => e.categoria === def.cat);
  if (!espacos.length) return false;
  const livre = espacos.find(e => !inv.equip[e.id]) || espacos[0];
  inv.equip[livre.id] = id;
  return true;
}
function podeVender(def, inv = inventario()) {
  return Boolean(VALOR_VENDA[def.rar]) && !['reliquia', 'mascote'].includes(def.cat) && !espacoDoItem(def.id, inv);
}

/* ---- bônus e regras por modo -------------------------------------------- */
function equipados(inv = inventario()) {
  const lista = ESPACOS.map(e => inv.equip[e.id]).filter(id => id && qtdItem(id, inv) > 0).map(itemDef);
  for (const id of Object.keys(inv.inv)) {
    const def = itemDef(id);
    if (def?.cat === 'reliquia') lista.push(def);
  }
  return lista;
}
function bonusItens(inv = inventario()) {
  const b = { xp: 0, xpArea: {}, xpRevisao: 0, xpErro: 0, moedas: 0, bau: 0, sorte: 0, golpe: 0, escudo: 0 };
  for (const def of equipados(inv)) {
    const x = def.bonus || {};
    for (const k of ['xp', 'xpRevisao', 'xpErro', 'moedas', 'bau', 'sorte', 'escudo']) b[k] += x[k] || 0;
    if (x.xpArea) b.xpArea[x.xpArea[0]] = (b.xpArea[x.xpArea[0]] || 0) + x.xpArea[1];
    if (x.golpe) b.golpe = b.golpe ? Math.min(b.golpe, x.golpe) : x.golpe;
  }
  b.moedas = Math.min(b.moedas, LIMITES.moedas);
  b.bau = Math.min(b.bau, LIMITES.bau);
  return b;
}
function regrasDoModo(s) { return REGRAS_MODO[s?.tipo] || REGRAS_MODO.expedicao; }
function permitido(regra, efeito) { return regra === 'todos' || regra === true || (Array.isArray(regra) && regra.includes(efeito)); }
/* Bônus de XP dos itens para esta questão, já com o teto de LIMITES.xp. */
function bonusXpItens(q, s) {
  if (!regrasDoModo(s).bonus) return 0;
  const b = bonusItens();
  return Math.min(LIMITES.xp, b.xp + (b.xpArea[q.area] || 0) + (s.tipo === 'revisao' ? b.xpRevisao : 0));
}
function xpErroItens(s) { return regrasDoModo(s).bonus ? bonusItens().xpErro : 0; }
function danoDoGolpe(s) {
  const b = bonusItens();
  return b.golpe && s.seq >= b.golpe ? 2 : 1;
}

/* ---- efeitos durante a questão ----------------------------------------- */
function efeitosDaQuestao(s, qid) {
  s.efeitos ||= {};
  return (s.efeitos[qid] ||= { eliminadas: [], pista: false, segunda: null, protege: null, errouAntes: false, ajuda: false });
}
function eliminadasDa(s, qid) { return s?.efeitos?.[qid]?.eliminadas || []; }
function ajudaNaQuestao(s, qid) { return Boolean(s?.efeitos?.[qid]?.ajuda); }
function pistaAtiva(s, qid) { return Boolean(s?.efeitos?.[qid]?.pista); }

function itensDaBolsa(s, q) {
  const regra = regrasDoModo(s);
  if (regra.consumiveis === 'nenhum') return [];
  const inv = inventario();
  return ITENS.filter(d => (d.cat === 'consumivel' || d.cat === 'pergaminho') && qtdItem(d.id, inv) > 0
    && (!d.area || d.area === q.area) && d.uso.every(u => permitido(regra.consumiveis, u.efeito)));
}
function poderesDaBolsa(s) {
  const regra = regrasDoModo(s);
  if (!regra.poderes) return [];
  return equipados().filter(d => d.poder && permitido(regra.poderes, d.poder.efeito))
    .map(d => ({ def: d, restantes: Math.max(0, d.poder.cargas - ((s.cargas || {})[d.id] || 0)) }));
}
function efeitoUtil(u, q, ef) {
  if (u.efeito === 'eliminar') return ef.eliminadas.length < LIMITES.eliminadas;
  if (u.efeito === 'pista') return !ef.pista && Boolean(q.hab || q.comp);
  if (u.efeito === 'segunda_chance') return !ef.segunda && !ef.errouAntes;
  if (u.efeito === 'protege_sequencia') return !ef.protege;
  return false;
}
function eliminarAlternativas(q, ef, n) {
  const vagas = LIMITES.eliminadas - ef.eliminadas.length;
  // a alternativa marcada sai por último: o item não deve denunciar o palpite do jogador
  const erradas = embaralhar(LETRAS.filter(l => l !== q.gab && !ef.eliminadas.includes(l)))
    .sort((a, b) => (a === E.selecao) - (b === E.selecao));
  const fora = erradas.slice(0, Math.max(0, Math.min(n, vagas)));
  ef.eliminadas.push(...fora);
  return fora.length;
}
function aplicarUsos(usos, s, q, origem) {
  const ef = efeitosDaQuestao(s, q.id);
  const feitos = [];
  for (const u of usos) {
    if (!efeitoUtil(u, q, ef)) continue;
    if (u.efeito === 'eliminar') {
      const n = eliminarAlternativas(q, ef, u.n || 1);
      if (n) { ef.ajuda = true; feitos.push(n === 1 ? 'uma alternativa errada saiu' : `${n} alternativas erradas saíram`); }
    } else if (u.efeito === 'pista') {
      ef.pista = true; feitos.push('a habilidade cobrada apareceu');
    } else if (u.efeito === 'segunda_chance') {
      ef.segunda = origem; feitos.push('a segunda chance está pronta');
    } else if (u.efeito === 'protege_sequencia') {
      ef.protege = origem; feitos.push('sua sequência está protegida nesta questão');
    }
  }
  return feitos;
}
function questaoAberta() {
  const s = E.save?.atual;
  if (!s || E.tela !== 'questao' || s.tipo === 'simulado') return null;
  const q = E.porId.get(s.ids[s.i]);
  return s.respostas[q.id] ? null : { s, q };
}
function depoisDeUsar(def, s, q, feitos) {
  const ef = efeitosDaQuestao(s, q.id);
  if (E.selecao && ef.eliminadas.includes(E.selecao)) E.selecao = null;
  for (const l of ef.eliminadas) E.riscadas.delete(l);
  avisarItem(def, feitos.length ? `: ${feitos.join(' e ')}.` : ': nada mudou.');
  salvar();
  renderMantendoRolagem();
}
function usarItemNaQuestao(id) {
  const aberta = questaoAberta();
  if (!aberta) return;
  const { s, q } = aberta;
  const def = itemDef(id);
  if (!def || !itensDaBolsa(s, q).some(d => d.id === id)) { avisar('Este item não pode ser usado aqui.'); return; }
  const ef = efeitosDaQuestao(s, q.id);
  if (!def.uso.some(u => efeitoUtil(u, q, ef))) { avisar('Esse item não teria efeito nesta questão.'); return; }
  const feitos = aplicarUsos(def.uso, s, q, `item:${id}`);
  if (!def.uso.every(u => ARMADOS.has(u.efeito))) gastarItem(id);
  depoisDeUsar(def, s, q, feitos);
}
function usarPoderNaQuestao(id) {
  const aberta = questaoAberta();
  if (!aberta) return;
  const { s, q } = aberta;
  const p = poderesDaBolsa(s).find(x => x.def.id === id);
  if (!p || !p.restantes) { avisar('Esse poder já foi usado nesta sessão.'); return; }
  const ef = efeitosDaQuestao(s, q.id);
  if (!efeitoUtil(p.def.poder, q, ef)) { avisar('Esse poder não teria efeito nesta questão.'); return; }
  const feitos = aplicarUsos([p.def.poder], s, q, `poder:${id}`);
  if (!ARMADOS.has(p.def.poder.efeito)) { s.cargas ||= {}; s.cargas[id] = (s.cargas[id] || 0) + 1; }
  depoisDeUsar(p.def, s, q, feitos);
}
/* Efeito que estava pronto (segunda chance, proteção) agiu: agora sim gasta o item ou a carga. */
function consumirArmado(origem, s) {
  const [tipo, id] = origem.split(':');
  if (tipo === 'item') return gastarItem(id);
  const def = itemDef(id);
  s.cargas ||= {};
  if (!def?.poder || (s.cargas[id] || 0) >= def.poder.cargas) return false;
  s.cargas[id] = (s.cargas[id] || 0) + 1;
  return true;
}
function nomeDaOrigem(origem) { return itemDef(origem.split(':')[1])?.nome || 'Um item'; }
/* Chamada ao confirmar uma resposta errada: com a segunda chance pronta, a resposta não conta. */
function tentarSegundaChance(s, q, letra) {
  const ef = s.efeitos?.[q.id];
  if (!ef?.segunda || ef.errouAntes || letra === q.gab) return false;
  const origem = ef.segunda;
  ef.segunda = null;
  if (!consumirArmado(origem, s)) return false;
  ef.errouAntes = true;
  ef.ajuda = true;
  if (!ef.eliminadas.includes(letra)) ef.eliminadas.push(letra);
  avisar(`${nomeDaOrigem(origem)}: a alternativa ${letra} não é a certa. Tente de novo.`);
  return true;
}
/* Chamada ao registrar um erro: devolve o nome do que protegeu a sequência, ou null. */
function protegerSequencia(s, q) {
  if (s.tipo === 'simulado' || s.seq < 1) return null;
  const ef = s.efeitos?.[q.id];
  if (ef?.protege) {
    const origem = ef.protege;
    ef.protege = null;
    if (consumirArmado(origem, s)) return nomeDaOrigem(origem);
  }
  if (!regrasDoModo(s).bonus) return null;
  if (bonusItens().escudo > (s.escudos || 0)) {
    s.escudos = (s.escudos || 0) + 1;
    return equipados().find(d => d.bonus?.escudo)?.nome || 'Seu equipamento';
  }
  return null;
}

/* ---- recompensas -------------------------------------------------------- */
/* Sorte empurra parte do peso de cada raridade para a raridade seguinte da própria tabela. */
function aplicarSorte(pesos, sorte) {
  const p = { ...pesos };
  const chaves = ORDEM_RARIDADES.filter(r => p[r] !== undefined);
  for (let k = 0; k < sorte; k++) {
    for (let i = chaves.length - 2; i >= 0; i--) {
      const passa = p[chaves[i]] * 0.25;
      p[chaves[i]] -= passa;
      p[chaves[i + 1]] += passa;
    }
  }
  return p;
}
function sortearItemDrop(rar, cats) {
  for (let i = ORDEM_RARIDADES.indexOf(rar); i >= 0; i--) {
    const pool = ITENS.filter(d => d.drop && d.rar === ORDEM_RARIDADES[i] && cats.includes(d.cat));
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)].id;
  }
  return null;
}
function rolarTabela(id, chance) {
  const t = TABELAS_DROP[id];
  const saida = [{ moedas: inteiroEntre(t.moedas[0], t.moedas[1]) }];
  if (Math.random() < (chance ?? t.chance)) {
    const pesos = Object.entries(aplicarSorte(t.raridades, bonusItens().sorte));
    const n = inteiroEntre(...(t.qtd || [1, 1]));
    for (let k = 0; k < n; k++) {
      const item = sortearItemDrop(sortearPeso(pesos), t.cats);
      if (item) {
        const def = itemDef(item);
        saida.push({ id: item, n: def.cat === 'material' && def.rar === 'comum' ? inteiroEntre(1, 2) : 1 });
      }
    }
  }
  return saida;
}
function dropDoInimigo(d) {
  const m = d.errante && MONSTROS_ERRANTES.find(x => x.id === d.errante);
  if (m) return [{ moedas: inteiroEntre(m.moedas[0], m.moedas[1]) }, { id: sortearPeso(m.drops), n: 1 }];
  return rolarTabela(d.chefe ? 'chefe' : (d.forte ? 'inimigo_forte' : 'inimigo'));
}
/* Entrega o que foi sorteado: moedas com o bônus dos itens e itens no inventário em uso. */
function receberDrop(entradas, s) {
  const inv = inventario();
  const b = bonusItens(inv);
  const finais = [];
  for (const e of entradas) {
    if (e.id) {
      const g = ganharItem(e.id, e.n, inv);
      if (g) finais.push(g);
    } else if (e.moedas) {
      const m = Math.round(e.moedas * (1 + b.moedas / 100));
      ganharMoedas(m, inv);
      finais.push({ moedas: m });
    }
  }
  if (s) (s.espolio ||= []).push(...finais);
  return finais;
}
function sortearBauEntreQuestoes(s, q) {
  if (!regrasDoModo(s).baus) return null;
  const cfg = E.save.cfg;
  const chance = cfg.dev && cfg.devBau ? 100
    : BAUS.chanceBase + (BAUS.porNivel[q.nivel] || 0) + bonusItens().bau;
  if (Math.random() * 100 >= chance) return null;
  const ultima = s.tipo !== 'sabio' && s.i >= s.ids.length - 1; // o Mímico precisa da próxima questão
  const mimico = !ultima && (cfg.dev && cfg.devMimico ? true : Math.random() * 100 < BAUS.chanceMimico);
  return mimico ? { mimico: true } : { bau: sortearPeso(BAUS.tipos) };
}
function sortearErrante(onda) {
  const sempre = E.save.cfg.dev && E.save.cfg.devErrante;
  if (!sempre && Math.random() >= CHANCE_ERRANTE) return null;
  const lista = MONSTROS_ERRANTES.filter(m => sempre || !m.ondaMinima || onda >= m.ondaMinima);
  const id = sortearPeso(lista.map(m => [m.id, m.peso]));
  return lista.find(m => m.id === id);
}
/* Depois de cada resposta (fora do simulado): espólio do inimigo, Mímico, baús e missões. */
function aoResponderItens(s, q, r) {
  const ev = {};
  if (r.derrotou) ev.drop = receberDrop(dropDoInimigo(r.derrotou), s);
  if (s.mimico) {
    s.mimico = false;
    if (r.acertou) { ev.mimico = 'derrotado'; ev.tesouro = receberDrop(rolarTabela('mimico'), s); } else ev.mimico = 'fugiu';
  } else {
    const achado = sortearBauEntreQuestoes(s, q);
    if (achado?.mimico) { s.mimico = true; ev.mimico = 'surgiu'; }
    if (achado?.bau) { ev.bau = achado.bau; receberDrop([{ id: achado.bau, n: 1 }], s); }
  }
  const missoes = verificarMissoes();
  if (missoes.length) ev.missoes = missoes;
  r.itens = ev;
}
/* No fim da sessão: guardião vencido ou baú do simulado, e o espólio inteiro para a tela final. */
/* Baú do simulado, um por dia. O do dia inteiro ainda sai se antes, no mesmo dia, veio só o comum. */
function bauDoSimulado(registro) {
  const p = PREMIO_SIMULADO;
  const diaInteiro = x => x.total >= p.diaInteiro && String(x.parte || '').startsWith('dia');
  const antes = E.save.sessoes.filter(x => x !== registro && x.dia === registro.dia && x.tipo === 'simulado');
  if (diaInteiro(registro)) return antes.some(diaInteiro) ? null : p.bauDiaInteiro;
  if (registro.total >= p.minimo) return antes.some(x => x.total >= p.minimo) ? null : p.bau;
  return null;
}
function aoConcluirItens(s, registro) {
  if (registro.total) {
    if (registro.tipo === 'simulado') {
      const bau = bauDoSimulado(registro);
      if (bau) receberDrop([{ id: bau, n: 1 }], s);
    } else if (registro.tipo !== 'sabio' && registro.venceu && registro.total >= Math.min(registro.previstas, ESPOLIO_GUARDIAO.minimo)) {
      const g = ESPOLIO_GUARDIAO;
      receberDrop(rolarTabela('guardiao', registro.total >= g.longa ? g.chanceLonga : g.chance), s);
    }
  }
  const mimicoFugiu = Boolean(s.mimico);
  s.mimico = false;
  return { espolio: s.espolio || [], mimicoFugiu, missoes: verificarMissoes() };
}
function abrirBau(id) {
  const def = itemDef(id);
  if (def?.cat !== 'bau' || !gastarItem(id)) return null;
  return { bau: id, entradas: receberDrop(rolarTabela(def.abre)) };
}

/* Conquistas e missões são progresso de verdade: o prêmio vai sempre para o inventário real. */
function darPremio(premio, inv) {
  const saida = [];
  if (premio.moedas) { ganharMoedas(premio.moedas, inv); saida.push({ moedas: premio.moedas }); }
  if (premio.item) {
    const g = ganharItem(premio.item, premio.qtd || 1, inv);
    if (g) saida.push(g);
  }
  return saida;
}
function premiarConquista(c) {
  const real = E.save.itens;
  if (real.premiadas[c.id]) return [];
  real.premiadas[c.id] = hoje();
  const lista = darPremio(PREMIO_GRAU[c.grau] || {}, real);
  if (PREMIO_CONQUISTA[c.id]) lista.push(...darPremio({ item: PREMIO_CONQUISTA[c.id] }, real));
  E.premiosConquista ||= {};
  E.premiosConquista[c.id] = lista;
  return lista;
}
function contextoMissoes() {
  const dia = hoje();
  const d = E.save.dias[dia] || { q: 0, a: 0 };
  return { meta: E.save.cfg.meta, hojeQ: d.q, hojeA: d.a, hojeSessoes: E.save.sessoes.filter(x => x.dia === dia).length };
}
function missoesDoDia() {
  const real = E.save.itens;
  if (real.missoes.dia !== hoje()) real.missoes = { dia: hoje(), feitas: {} };
  return real.missoes;
}
function verificarMissoes() {
  const estado = missoesDoDia();
  const c = contextoMissoes();
  const novas = [];
  for (const m of MISSOES) {
    if (estado.feitas[m.id] || m.valor(c) < m.alvo(c)) continue;
    estado.feitas[m.id] = true;
    const premios = darPremio(m.premio, E.save.itens);
    novas.push({ id: m.id, nome: m.nome, premios });
    avisarEspolio(`Missão cumprida: ${m.nome}`, premios);
  }
  return novas;
}
/* Ao abrir o jogo: completa o save e dá, uma vez, o prêmio das conquistas que já existiam. */
function prepararItens() {
  E.save.itens = mesclarItens(E.save.itens);
  E.dev = null;
  E.premiosConquista = {};
  const antigas = CONQUISTAS.filter(c => E.save.conquistas[c.id] && !E.save.itens.premiadas[c.id]);
  const entradas = antigas.flatMap(c => premiarConquista(c));
  E.premiosConquista = {};
  return antigas.length ? { conquistas: antigas.length, entradas } : null;
}

/* ---- fabricação e loja -------------------------------------------------- */
function receitaLiberada(r) {
  if (inventario().dev || !r.req) return true;
  if (r.req.nivel && nivelDe(E.save.xp).n < r.req.nivel) return false;
  if (r.req.conquista && !E.save.conquistas[r.req.conquista]) return false;
  return true;
}
function textoRequisito(r) {
  if (!r.req) return '';
  if (r.req.nivel) return `nível ${r.req.nivel}`;
  const c = CONQUISTAS.find(x => x.id === r.req.conquista);
  return c ? `conquista "${c.nome}"` : '';
}
function faltasDaReceita(r, inv = inventario()) {
  return {
    mats: Object.entries(r.mats).filter(([id, n]) => qtdItem(id, inv) < n),
    moedas: !inv.dev && (r.moedas || 0) > (inv.moedas || 0),
  };
}
function fabricarItem(idReceita) {
  const r = RECEITAS.find(x => x.id === idReceita);
  if (!r || !receitaLiberada(r)) return null;
  const inv = inventario();
  const def = itemDef(r.item);
  if (ehUnico(def) && qtdItem(def.id, inv)) { avisar('Você já tem este item.'); return null; }
  const f = faltasDaReceita(r, inv);
  if (f.mats.length || f.moedas) { avisar('Faltam materiais ou moedas para esta receita.'); return null; }
  for (const [id, n] of Object.entries(r.mats)) gastarItem(id, n, inv);
  if (r.moedas) gastarMoedas(r.moedas, inv);
  return ganharItem(r.item, 1, inv);
}
function lojaDoDia(inv = inventario()) {
  if (inv.loja.dia !== hoje()) inv.loja = { dia: hoje(), compras: {} };
  return inv.loja;
}
function comprarItem(i) {
  const oferta = LOJA[i];
  if (!oferta) return null;
  const inv = inventario();
  const def = itemDef(oferta.item);
  const loja = lojaDoDia(inv);
  const feitas = loja.compras[oferta.item] || 0;
  if (!inv.dev && feitas >= oferta.limite) { avisar('Esse item esgotou na loja hoje. Volte amanhã.'); return null; }
  if (ehUnico(def) && qtdItem(def.id, inv)) { avisar('Você já tem este item.'); return null; }
  if (!gastarMoedas(oferta.preco, inv)) { avisar('Moedas insuficientes.'); return null; }
  loja.compras[oferta.item] = feitas + 1;
  return ganharItem(oferta.item, 1, inv);
}

/* ---- modo desenvolvedor (TEMPORÁRIO: remover quando os testes acabarem) ---- */
/* Liga uma cópia de teste do inventário, com tudo liberado. Ela não é gravada no save: ao
   desligar, volta o inventário de verdade, intacto. */
function criarDev() {
  const inv = Object.fromEntries(ITENS.map(d => [d.id, ehUnico(d) ? 1 : 99]));
  E.dev = { ...itensNovos(), dev: true, moedas: 999999, inv, equip: { ...E.save.itens.equip },
            vistos: Object.fromEntries(ITENS.map(d => [d.id, true])) };
  return E.dev;
}
function secaoDev() {
  const c = E.save.cfg;
  const opcao = (chave, rotulo) => `<div class="grupo"><span>${rotulo}</span>${[['nao', 'Desligado'], ['sim', 'Ligado']].map(([v, t]) =>
    `<button class="pilula ${(c[chave] ? 'sim' : 'nao') === v ? 'ativa' : ''}" data-acao="dev" data-chave="${chave}" data-v="${v}">${t}</button>`).join('')}</div>`;
  return `<section class="ajustes dev">
    <h2>Modo desenvolvedor <small>temporário</small></h2>
    <p>Libera todos os itens, receitas e a loja para testar o sistema de itens. Com ele ligado, o inventário é uma cópia de teste: nada do que você usar, ganhar ou comprar ali vai para o seu inventário de verdade. XP, conquistas e estatísticas continuam valendo, e os bônus dos itens de teste contam enquanto o modo estiver ligado.</p>
    ${opcao('dev', 'Liberar tudo')}
    ${c.dev ? `${opcao('devBau', 'Baú em toda questão')}${opcao('devMimico', 'Todo baú é um Mímico')}${opcao('devErrante', 'Monstro errante em toda onda do Sábio')}` : ''}
  </section>`;
}

/* ---- pedaços de tela ---------------------------------------------------- */
function iconeItem(def, cls = '') {
  const cores = `--c:${def.cor || '#9cf'};${def.cor2 ? `--c2:${def.cor2};` : ''}`;
  return `<svg class="icone-item ${cls}" viewBox="0 0 48 48" style="${cores}" aria-hidden="true"><use href="#it-${def.icone}"/></svg>`;
}
function agruparEntradas(entradas) {
  const itens = new Map();
  let moedas = 0;
  for (const e of entradas || []) {
    if (e.id) {
      const atual = itens.get(e.id) || { id: e.id, n: 0, moedasExtra: 0, duplicado: false };
      atual.n += e.n || 1;
      atual.moedasExtra += e.moedasExtra || 0;
      atual.duplicado ||= Boolean(e.duplicado);
      itens.set(e.id, atual);
    } else moedas += e.moedas || 0;
  }
  return { itens: [...itens.values()], moedas };
}
function listaEspolio(entradas) {
  const { itens, moedas } = agruparEntradas(entradas);
  if (!itens.length && !moedas) return '';
  return `<span class="lista-espolio">${itens.map((e) => {
    const def = itemDef(e.id);
    const extra = e.duplicado ? ` <em>repetido, virou ${e.moedasExtra} moedas</em>` : '';
    return `<span class="chip-item rar-${def.rar}" title="${esc(RARIDADES[def.rar].nome)}">${iconeItem(def)}${esc(def.nome)}${e.n > 1 ? ` ×${e.n}` : ''}${extra}</span>`;
  }).join('')}${moedas ? `<span class="chip-item moedas">${ico('moeda')}${milhar(moedas)} moedas</span>` : ''}</span>`;
}
function avisarEspolio(titulo, entradas) {
  const lista = listaEspolio(entradas);
  if (!lista) return;
  const el = document.createElement('div');
  el.className = 'aviso aviso-espolio';
  el.innerHTML = `<strong>${esc(titulo)}</strong>${lista}`;
  $avisos.appendChild(el);
  setTimeout(() => el.remove(), 5200);
}
/* Aviso curto com o ícone do item: "antes" vem antes do nome e "depois" logo após ele. O texto
   fica fora do nome para não depender do gênero do item (a Poção, o Elixir...). */
function avisarItem(def, depois = '', antes = '') {
  const el = document.createElement('div');
  el.className = `aviso aviso-item rar-${def.rar}`;
  el.innerHTML = `${iconeItem(def)}<span>${antes ? `${esc(antes)} ` : ''}<strong>${esc(def.nome)}</strong>${esc(depois)}</span>`;
  $avisos.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
function renderMantendoRolagem() {
  const topo = document.querySelector('.area-questao')?.scrollTop || 0;
  render();
  const area = document.querySelector('.area-questao');
  if (area) area.scrollTop = topo;
}

/* Bolsa ao lado das alternativas: consumíveis e poderes que valem nesta questão e neste modo. */
function bolsaQuestao(s, q) {
  const regra = regrasDoModo(s);
  if (regra.consumiveis === 'nenhum' && !regra.poderes) return '';
  const ef = s.efeitos?.[q.id] || { eliminadas: [] };
  const itens = itensDaBolsa(s, q);
  const poderes = poderesDaBolsa(s);
  const aviso = regra.aviso ? `<p class="bolsa-regra">${esc(regra.aviso)}</p>` : '';
  if (!itens.length && !poderes.length) return `<div class="bolsa-q vazia"><h4>${ico('bau')} Bolsa</h4><p>Nenhum item para esta questão.</p>${aviso}</div>`;
  const botao = (def, n, acao, usos, poder) => {
    const util = n > 0 && usos.some(u => efeitoUtil(u, q, { eliminadas: [], ...ef }));
    return `<button class="item-bolsa rar-${def.rar} ${poder ? 'poder' : ''}" data-acao="${acao}" data-id="${def.id}" ${util ? '' : 'disabled'}
      title="${esc(def.nome)}: ${esc(def.efeito)}">${iconeItem(def)}<b>${inventario().dev && !poder ? '∞' : n}</b></button>`;
  };
  const ativos = [];
  if (ef.protege) ativos.push(`${esc(nomeDaOrigem(ef.protege))}: sequência protegida`);
  if (ef.segunda) ativos.push(`${esc(nomeDaOrigem(ef.segunda))}: segunda chance pronta`);
  return `<div class="bolsa-q"><h4>${ico('bau')} Bolsa <small>passe o mouse para ver o efeito</small></h4>
    <div class="bolsa-lista">${itens.map(d => botao(d, qtdItem(d.id), 'usar-item', d.uso, false)).join('')}${poderes.map(p => botao(p.def, p.restantes, 'usar-poder', [p.def.poder], true)).join('')}</div>
    ${ativos.length ? `<p class="bolsa-ativos">${ativos.map(a => `<span>${a}</span>`).join('')}</p>` : ''}${aviso}</div>`;
}
function avisosDaQuestao(s, q) {
  let html = '';
  if (s.mimico) html += `<p class="mimico-alerta">${iconeItem(itemDef('bau_madeira'))}<span><b>Mímico Enganador à espreita.</b> Acerte esta questão para derrotá-lo e ficar com o tesouro dele.</span></p>`;
  if (pistaAtiva(s, q.id)) html += `<div class="pista-q"><p class="pista-titulo">${ico('coruja')} Pista</p>${blocoHabilidade(q)}</div>`;
  return html;
}
/* Eventos de itens no painel depois da resposta. */
function eventosRetorno(r) {
  if (!r) return '';
  const ev = r.itens || {};
  let html = '';
  if (r.protegeu) html += `<p class="evento-item">${ico('escudo')} ${esc(r.protegeu)} manteve sua sequência de acertos.</p>`;
  if (r.golpeForte && r.acertou) html += `<p class="evento-item">${ico('espadas')} Golpe duplo!</p>`;
  if (ev.drop?.length) html += `<div class="evento-item espolio-linha"><span>Espólio:</span>${listaEspolio(ev.drop)}</div>`;
  if (ev.mimico === 'surgiu') html += `<p class="evento-item mimico">${ico('caveira')} Um baú apareceu... e mordeu! É um <b>Mímico Enganador</b>. Acerte a próxima questão para derrotá-lo.</p>`;
  if (ev.mimico === 'derrotado') html += `<div class="evento-item mimico ok"><span>${ico('espadas')} Você derrotou o Mímico Enganador!</span>${listaEspolio(ev.tesouro)}</div>`;
  if (ev.mimico === 'fugiu') html += `<p class="evento-item mimico">O Mímico fugiu com o tesouro. Ele volta outro dia.</p>`;
  if (ev.bau) {
    const def = itemDef(ev.bau);
    html += `<div class="evento-item bau-achado rar-${def.rar}">${iconeItem(def)}<div><strong>Você encontrou um ${esc(def.nome)}!</strong><span>Ele foi para o inventário.</span></div>
      <button class="botao pequeno" data-acao="abrir-bau" data-id="${def.id}" data-origem="retorno" ${ev.bauAberto ? 'disabled' : ''}>${ev.bauAberto ? 'Aberto' : 'Abrir agora'}</button></div>`;
  }
  for (const m of ev.missoes || []) html += `<div class="evento-item missao"><span>${ico('alvo')} Missão cumprida: ${esc(m.nome)}</span>${listaEspolio(m.premios)}</div>`;
  return html;
}
function espolioResultado(r) {
  const premiosConq = (r.novas || []).flatMap(c => E.premiosConquista?.[c.id] || []);
  const sessao = listaEspolio(r.espolio);
  const conq = listaEspolio(premiosConq);
  const missoes = (r.missoesItens || []).map(m => `<p class="evento-item missao"><span>${ico('alvo')} Missão cumprida: ${esc(m.nome)}</span>${listaEspolio(m.premios)}</p>`).join('');
  if (!sessao && !conq && !missoes && !r.mimicoFugiu) return '';
  return `<div class="espolio-resultado">
    ${sessao ? `<h3>${ico('bau')} Espólio da sessão</h3>${sessao}` : ''}
    ${r.mimicoFugiu ? '<p class="dica-fim">O Mímico que apareceu no fim fugiu com o tesouro.</p>' : ''}
    ${conq ? `<h3>${ico('medalha')} Recompensas das conquistas</h3>${conq}` : ''}
    ${missoes}
    <button class="botao pequeno" data-acao="ir" data-tela="inventario">Ver o inventário</button></div>`;
}
function dropsDoErrante(nome) {
  const m = MONSTROS_ERRANTES.find(x => x.nome === nome);
  if (!m) return '';
  return `<span class="drops-errante">Deixa cair: ${m.drops.map(([id]) => `<b class="texto-rar rar-${itemDef(id).rar}">${esc(itemDef(id).nome)}</b>`).join(', ')}</span>`;
}

/* ---- tela do Inventário -------------------------------------------------- */
function comoConseguir(def) {
  const fontes = [];
  if (def.drop) {
    const tabelas = Object.entries(TABELAS_DROP).filter(([, t]) => t.cats.includes(def.cat) && t.raridades[def.rar]).map(([id]) => NOME_TABELA[id]);
    if (tabelas.length) fontes.push(`Cai de: ${tabelas.join(', ')}`);
  }
  const monstros = MONSTROS_ERRANTES.filter(m => m.drops.some(([id]) => id === def.id)).map(m => m.nome);
  if (monstros.length) fontes.push(`Monstros errantes: ${monstros.join(', ')}`);
  if (BAUS.tipos.some(([id]) => id === def.id)) fontes.push('Achado entre as questões, nas expedições, na Masmorra e no Sábio');
  if (def.id === PREMIO_SIMULADO.bau) fontes.push(`Simulado com ${PREMIO_SIMULADO.minimo} questões ou mais (um por dia)`);
  if (def.id === PREMIO_SIMULADO.bauDiaInteiro) fontes.push(`Simulado de um dia inteiro, com ${PREMIO_SIMULADO.diaInteiro} questões ou mais (um por dia)`);
  const receita = RECEITAS.find(r => r.item === def.id);
  if (receita) fontes.push(`Fabricação${receita.req ? ` (a partir de ${textoRequisito(receita)})` : ''}`);
  const oferta = LOJA.find(o => o.item === def.id);
  if (oferta) fontes.push(`Loja, por ${oferta.preco} moedas`);
  const conquista = Object.entries(PREMIO_CONQUISTA).find(([, id]) => id === def.id);
  if (conquista) fontes.push(`Conquista "${CONQUISTAS.find(c => c.id === conquista[0])?.nome}"`);
  const graus = Object.entries(PREMIO_GRAU).filter(([, p]) => p.item === def.id).map(([g]) => GRAUS[g]);
  if (graus.length) fontes.push(`Prêmio das conquistas de grau ${graus.join(', ')}`);
  const missoes = MISSOES.filter(m => m.premio.item === def.id).map(m => m.nome);
  if (missoes.length) fontes.push(`Missão do dia: ${missoes.join(', ')}`);
  return fontes.length ? fontes : ['Ainda não há como conseguir este item.'];
}
function linhasBonus(inv) {
  const b = bonusItens(inv);
  const linhas = [];
  if (b.xp) linhas.push(`+${Math.min(b.xp, LIMITES.xp)}% de XP`);
  for (const [a, v] of Object.entries(b.xpArea)) linhas.push(`+${v}% de XP em ${REINOS[a].curto}`);
  if (b.xpRevisao) linhas.push(`+${b.xpRevisao}% de XP na Masmorra`);
  if (b.xpErro) linhas.push(`+${b.xpErro} XP por erro`);
  if (b.moedas) linhas.push(`+${b.moedas}% de moedas`);
  if (b.bau) linhas.push(`+${b.bau}% de chance de baú`);
  if (b.sorte) linhas.push('Itens mais raros nos sorteios');
  if (b.golpe) linhas.push(`Golpe duplo no Sábio com ${b.golpe}+ acertos seguidos`);
  if (b.escudo) linhas.push(`${b.escudo} ${b.escudo === 1 ? 'erro protegido' : 'erros protegidos'} por sessão`);
  for (const d of equipados(inv).filter(x => x.poder)) linhas.push(`Poder: ${d.nome}, ${d.poder.cargas}× por sessão`);
  return linhas.length ? linhas.map(l => `<li>${l}</li>`).join('') : '<li class="vazio">Nenhum bônus ativo. Equipe itens para ganhar bônus.</li>';
}
function telaInventario() {
  const inv = inventario();
  E.inv ||= { aba: 'itens', cat: 'todos', rar: 'todas', bloqueados: true };
  const abas = [['itens', 'Itens'], ['fabricacao', 'Fabricação'], ['loja', 'Loja'], ['missoes', 'Missões do dia']];
  const conteudo = { itens: invAbaItens, fabricacao: invAbaFabricacao, loja: invAbaLoja, missoes: invAbaMissoes }[E.inv.aba] || invAbaItens;
  return `${menu('inventario')}<main class="conteudo tela-inventario">
    <header class="cabecalho"><div><h1>Inventário</h1>
      <p>Itens ajudam, mas quem resolve a questão é você. Eles vêm de inimigos, guardiões, baús, missões, conquistas, da fabricação e da loja.</p></div>
      <div class="bolsa-moedas">${ico('moeda')}<strong>${inv.dev ? '∞' : milhar(inv.moedas || 0)}</strong><span>moedas</span></div></header>
    ${inv.dev ? '<p class="aviso-dev">Modo desenvolvedor ligado: tudo liberado numa cópia de teste. Desligue em Ajustes para voltar ao seu inventário.</p>' : ''}
    <nav class="abas-inv" role="tablist">${abas.map(([id, nome]) => `<button class="aba-inv ${E.inv.aba === id ? 'ativa' : ''}" role="tab" aria-selected="${E.inv.aba === id}" data-acao="inv-aba" data-v="${id}">${nome}</button>`).join('')}</nav>
    ${conteudo(inv)}
  </main>`;
}
function invAbaItens(inv) {
  const f = E.inv;
  const ordemCat = Object.keys(CATEGORIAS);
  const temCat = cat => ITENS.filter(d => d.cat === cat && qtdItem(d.id, inv) > 0).length;
  const lista = ITENS
    .filter(d => (f.cat === 'todos' || d.cat === f.cat) && (f.rar === 'todas' || d.rar === f.rar))
    .filter(d => f.bloqueados || qtdItem(d.id, inv) > 0)
    .sort((a, b) => ordemCat.indexOf(a.cat) - ordemCat.indexOf(b.cat) || RARIDADES[a.rar].ordem - RARIDADES[b.rar].ordem || a.nome.localeCompare(b.nome));
  const celula = (def) => {
    const n = qtdItem(def.id, inv);
    const visto = n > 0 || inv.vistos[def.id];
    const estado = n > 0 ? '' : (visto ? 'esgotado' : 'bloqueado');
    return `<button class="celula-item rar-${def.rar} ${estado}" data-acao="ver-item" data-id="${def.id}" aria-label="${esc(def.nome)}, ${RARIDADES[def.rar].nome}${n ? `, ${n}` : ', bloqueado'}">
      <span class="moldura-item">${iconeItem(def)}${!visto ? ico('cadeado', 'cadeado-item') : ''}</span>
      ${n > 1 ? `<b class="qtd">×${n}</b>` : ''}${espacoDoItem(def.id, inv) ? '<i class="selo-equipado" title="Equipado">E</i>' : ''}
      <small>${esc(def.nome)}</small></button>`;
  };
  return `<section class="inv-layout">
    <aside class="equipamento">
      <h2>Equipamento</h2>
      <div class="espacos">${ESPACOS.map((e) => {
        const def = inv.equip[e.id] && itemDef(inv.equip[e.id]);
        return def ? `<button class="espaco cheio rar-${def.rar}" data-acao="ver-item" data-id="${def.id}" title="${esc(def.nome)}">${iconeItem(def)}<small>${e.nome}</small></button>`
          : `<div class="espaco vazio"><small>${e.nome}</small></div>`;
      }).join('')}</div>
      <h3>Bônus ativos</h3>
      <ul class="bonus-ativos">${linhasBonus(inv)}</ul>
      <p class="nota-bonus">XP extra dos itens vai até +${LIMITES.xp}%, e moedas até +${LIMITES.moedas}%. Relíquias valem sempre, sem ocupar espaço.</p>
    </aside>
    <div class="inv-principal">
      <div class="filtros-inv">
        <div class="grupo">${[['todos', 'Todos']].concat(ordemCat.map(c => [c, CATEGORIAS[c].nome])).map(([c, nome]) =>
          `<button class="pilula ${f.cat === c ? 'ativa' : ''}" data-acao="inv-cat" data-v="${c}">${nome}${c !== 'todos' && temCat(c) ? ` <small>${temCat(c)}</small>` : ''}</button>`).join('')}</div>
        <div class="grupo raridades-inv"><span>Raridade</span>${ORDEM_RARIDADES.map(r => `<button class="pilula chip-rar rar-${r} ${f.rar === r ? 'ativa' : ''}" data-acao="inv-rar" data-v="${r}"><i></i>${RARIDADES[r].nome}</button>`).join('')}
          <button class="pilula ${f.bloqueados ? 'ativa' : ''}" data-acao="inv-bloq">Mostrar bloqueados</button></div>
      </div>
      ${lista.length ? `<div class="grade-itens">${lista.map(celula).join('')}</div>` : '<p class="vazio">Nenhum item com esses filtros.</p>'}
    </div>
  </section>`;
}
function invAbaFabricacao(inv) {
  const cartao = (r) => {
    const def = itemDef(r.item);
    const liberada = receitaLiberada(r);
    const f = faltasDaReceita(r, inv);
    const ja = ehUnico(def) && qtdItem(def.id, inv);
    const pode = liberada && !f.mats.length && !f.moedas && !ja;
    const mats = Object.entries(r.mats).map(([id, n]) => {
      const m = itemDef(id);
      const tem = qtdItem(id, inv);
      return `<li class="${tem >= n ? 'ok' : 'falta'}">${iconeItem(m)}<span>${esc(m.nome)}</span><b>${inv.dev ? '∞' : tem}/${n}</b></li>`;
    }).join('');
    return `<article class="receita rar-${def.rar} ${liberada ? '' : 'trancada'}">
      <button class="receita-topo" data-acao="ver-item" data-id="${def.id}">${iconeItem(def)}<span><strong class="texto-rar">${esc(def.nome)}</strong><small>${RARIDADES[def.rar].nome} · ${CATEGORIAS[def.cat].um}</small></span></button>
      <ul class="materiais">${mats}${r.moedas ? `<li class="${f.moedas ? 'falta' : 'ok'}">${ico('moeda')}<span>Moedas</span><b>${r.moedas}</b></li>` : ''}</ul>
      ${liberada ? `<button class="botao ${pode ? 'primario' : ''}" data-acao="fabricar" data-id="${r.id}" ${pode ? '' : 'disabled'}>${ja ? 'Você já tem' : 'Fabricar'}</button>`
        : `<p class="trava">${ico('cadeado')} Libera com ${textoRequisito(r)}</p>`}
    </article>`;
  };
  return `<p class="explica-aba">Junte materiais derrotando inimigos e abrindo baús. Novas receitas aparecem conforme você sobe de nível e ganha conquistas.</p>
    <div class="grade-receitas">${RECEITAS.map(cartao).join('')}</div>`;
}
function invAbaLoja(inv) {
  const loja = lojaDoDia(inv);
  const cartao = (o, i) => {
    const def = itemDef(o.item);
    const feitas = loja.compras[o.item] || 0;
    const esgotou = !inv.dev && feitas >= o.limite;
    const ja = ehUnico(def) && qtdItem(def.id, inv);
    const caro = !inv.dev && (inv.moedas || 0) < o.preco;
    return `<article class="oferta rar-${def.rar}">
      <button class="receita-topo" data-acao="ver-item" data-id="${def.id}">${iconeItem(def)}<span><strong class="texto-rar">${esc(def.nome)}</strong><small>${esc(def.efeito)}</small></span></button>
      <div class="oferta-pe"><span class="preco">${ico('moeda')}${o.preco}</span><small>${inv.dev ? 'sem limite no modo de teste' : `hoje: ${feitas} de ${o.limite}`}</small>
        <button class="botao ${esgotou || ja || caro ? '' : 'primario'}" data-acao="comprar" data-i="${i}" ${esgotou || ja || caro ? 'disabled' : ''}>${ja ? 'Você já tem' : (esgotou ? 'Esgotado hoje' : 'Comprar')}</button></div>
    </article>`;
  };
  return `<p class="explica-aba">A loja vende só itens simples, com limite por dia. Itens raros vêm de inimigos, baús, fabricação e conquistas.</p>
    <div class="grade-receitas">${LOJA.map(cartao).join('')}</div>`;
}
function invAbaMissoes() {
  const estado = missoesDoDia();
  const c = contextoMissoes();
  const cartao = (m) => {
    const alvo = m.alvo(c);
    const valor = Math.min(m.valor(c), alvo);
    const feita = estado.feitas[m.id];
    const premio = [m.premio.moedas ? { moedas: m.premio.moedas } : null, m.premio.item ? { id: m.premio.item, n: m.premio.qtd || 1 } : null].filter(Boolean);
    return `<article class="missao-card ${feita ? 'feita' : ''}">
      <div><strong>${esc(m.nome)}</strong><span>${esc(m.texto(c))}</span></div>
      ${barra(valor, alvo, 'fina')}<small>${valor} de ${alvo}${feita ? ' · recompensa entregue' : ''}</small>
      <div class="premio-missao">Prêmio: ${listaEspolio(premio)}</div></article>`;
  };
  const especiais = Object.entries(PREMIO_CONQUISTA).map(([id, item]) => {
    const conq = CONQUISTAS.find(x => x.id === id);
    const def = itemDef(item);
    const tem = E.save.conquistas[id];
    return `<li class="${tem ? 'ok' : ''}">${iconeItem(def)}<span><b class="texto-rar rar-${def.rar}">${esc(def.nome)}</b> por "${esc(conq?.nome || id)}"</span>${tem ? ico('check') : ico('cadeado')}</li>`;
  }).join('');
  return `<p class="explica-aba">As missões se renovam todo dia. A recompensa entra no inventário assim que a missão é cumprida.</p>
    <div class="grade-missoes">${MISSOES.map(cartao).join('')}</div>
    <section class="cartao premios-conquistas"><h2>Recompensas das conquistas</h2>
      <p class="sub">Toda conquista dá moedas e um item conforme o grau: ${Object.entries(PREMIO_GRAU).map(([g, p]) => `${GRAUS[g]}, ${p.moedas} moedas e ${itemDef(p.item).nome}`).join('; ')}. Algumas dão itens especiais:</p>
      <ul class="lista-especiais">${especiais}</ul></section>`;
}
function modalItem(id) {
  const def = itemDef(id);
  if (!def) return '';
  const inv = inventario();
  const n = qtdItem(id, inv);
  const espaco = espacoDoItem(id, inv);
  const botoes = [];
  if (n && ESPACOS.some(e => e.categoria === def.cat)) {
    botoes.push(espaco ? `<button class="botao" data-acao="desequipar" data-espaco="${espaco}">Desequipar</button>`
      : `<button class="botao primario" data-acao="equipar" data-id="${id}">Equipar</button>`);
  }
  if (n && def.cat === 'bau') botoes.push(`<button class="botao primario" data-acao="abrir-bau" data-id="${id}">Abrir</button>`);
  if (n && podeVender(def, inv)) botoes.push(`<button class="botao" data-acao="vender" data-id="${id}">Vender por ${VALOR_VENDA[def.rar]} moedas</button>`);
  const usadoEm = RECEITAS.filter(r => r.mats[id]).map(r => `${itemDef(r.item).nome} (${r.mats[id]})`);
  let comoUsar = '';
  if (def.uso) comoUsar = 'Use durante uma questão, na bolsa ao lado das alternativas.';
  else if (def.cat === 'reliquia') comoUsar = 'Vale sempre, sem precisar equipar.';
  else if (def.poder) comoUsar = 'Equipe e use o poder na bolsa durante as questões.';
  else if (ESPACOS.some(e => e.categoria === def.cat)) comoUsar = 'Equipe para o bônus valer.';
  const nomeEspaco = espaco && ESPACOS.find(e => e.id === espaco).nome;
  return `<div class="janela caixa janela-item rar-${def.rar}" role="dialog" aria-modal="true" aria-labelledby="titulo-item">
    <div class="item-topo"><span class="moldura-item grande">${iconeItem(def)}</span>
      <div><h2 id="titulo-item" class="texto-rar">${esc(def.nome)}</h2>
        <p class="item-tipo">${RARIDADES[def.rar].nome} · ${CATEGORIAS[def.cat].um}${def.area ? ` · ${REINOS[def.area].curto}` : ''}</p></div></div>
    <p class="item-desc">${esc(def.desc)}</p>
    <p class="item-efeito"><b>Efeito</b>${esc(def.efeito)}</p>
    <p class="item-posse">${n ? `Você tem ${inv.dev ? 'unidades sem fim no modo de teste' : n}.` : 'Você ainda não tem este item.'}${nomeEspaco ? ` Equipado: ${nomeEspaco.toLowerCase()}.` : ''} ${comoUsar}</p>
    <div class="item-origem"><b>Como conseguir</b><ul>${comoConseguir(def).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
    ${usadoEm.length ? `<div class="item-origem"><b>Usado na fabricação de</b><ul>${usadoEm.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    <div class="acoes">${botoes.join('')}<button class="botao" data-acao="fechar-modal">Fechar</button></div></div>`;
}
function modalBau(m) {
  const def = itemDef(m.bau);
  const restam = qtdItem(m.bau);
  const { itens, moedas } = agruparEntradas(m.entradas);
  const cartas = itens.map((e, i) => {
    const d = itemDef(e.id);
    return `<div class="carta-espolio rar-${d.rar}" style="--i:${i}">${iconeItem(d)}<strong class="texto-rar">${esc(d.nome)}${e.n > 1 ? ` ×${e.n}` : ''}</strong>
      <small>${RARIDADES[d.rar].nome}${e.duplicado ? `, repetido: virou ${e.moedasExtra} moedas` : ''}</small></div>`;
  }).join('');
  return `<div class="janela caixa janela-bau rar-${def.rar}" role="dialog" aria-modal="true" aria-labelledby="titulo-bau">
    <div class="bau-aberto">${iconeItem(def)}</div>
    <h2 id="titulo-bau">${esc(def.nome)}</h2>
    <div class="espolio-bau">${cartas}${moedas ? `<div class="carta-espolio moedas" style="--i:${itens.length}">${ico('moeda')}<strong>${milhar(moedas)}</strong><small>moedas</small></div>` : ''}</div>
    <div class="acoes">${restam ? `<button class="botao" data-acao="abrir-bau" data-id="${m.bau}">Abrir outro (${inventario().dev ? '∞' : restam})</button>` : ''}
      <button class="botao primario" data-acao="fechar-modal">Guardar</button></div></div>`;
}

/* ---- ações -------------------------------------------------------------- */
function atualizarTelaDeFundo() {
  if (E.tela === 'inventario' || E.tela === 'mapa') { E.manterRolagem = true; render(); }
}
const ACOES_ITENS = {
  'inv-aba': (d) => { E.inv.aba = d.v; render(); },
  'inv-cat': (d) => { E.inv.cat = d.v; E.manterRolagem = true; render(); },
  'inv-rar': (d) => { E.inv.rar = E.inv.rar === d.v ? 'todas' : d.v; E.manterRolagem = true; render(); },
  'inv-bloq': () => { E.inv.bloqueados = !E.inv.bloqueados; E.manterRolagem = true; render(); },
  'ver-item': (d) => { E.modal = { tipo: 'item', id: d.id }; renderModal(); },
  equipar: (d) => {
    if (!equiparItem(d.id)) return;
    salvar();
    avisarItem(itemDef(d.id), '', 'Agora em uso:');
    E.modal = { tipo: 'item', id: d.id }; renderModal();
    atualizarTelaDeFundo();
  },
  desequipar: (d) => {
    const inv = inventario();
    const id = inv.equip[d.espaco];
    inv.equip[d.espaco] = null;
    salvar();
    E.modal = id ? { tipo: 'item', id } : null; renderModal();
    atualizarTelaDeFundo();
  },
  vender: (d) => {
    const def = itemDef(d.id);
    const inv = inventario();
    if (!def || !podeVender(def, inv) || !gastarItem(d.id, 1, inv)) return;
    ganharMoedas(VALOR_VENDA[def.rar], inv);
    salvar();
    avisarItem(def, ` (+${VALOR_VENDA[def.rar]} moedas)`, 'Venda feita:');
    E.modal = qtdItem(d.id, inv) ? { tipo: 'item', id: d.id } : null; renderModal();
    atualizarTelaDeFundo();
  },
  'abrir-bau': (d) => {
    const resultado = abrirBau(d.id);
    if (!resultado) { avisar('Você não tem esse baú.'); return; }
    salvar();
    if (d.origem === 'retorno' && E.respostaAtual?.itens) {
      E.respostaAtual.itens.bauAberto = true;
      const b = document.querySelector('[data-acao="abrir-bau"][data-origem="retorno"]');
      if (b) { b.disabled = true; b.textContent = 'Aberto'; }
    }
    E.modal = { tipo: 'bau', ...resultado }; renderModal();
    if (E.tela === 'inventario') { E.manterRolagem = true; render(); }
  },
  fabricar: (d) => {
    const g = fabricarItem(d.id);
    if (!g) return;
    salvar();
    avisarItem(itemDef(g.id), '', 'Fabricação concluída:');
    E.manterRolagem = true; render();
  },
  comprar: (d) => {
    const g = comprarItem(Number(d.i));
    if (!g) return;
    salvar();
    avisarItem(itemDef(g.id), '', 'Compra feita:');
    E.manterRolagem = true; render();
  },
  'usar-item': d => usarItemNaQuestao(d.id),
  'usar-poder': d => usarPoderNaQuestao(d.id),
  dev: (d) => {
    const cfg = E.save.cfg;
    cfg[d.chave] = d.v === 'sim';
    if (d.chave === 'dev') {
      E.dev = null;
      if (!cfg.dev) { cfg.devBau = false; cfg.devMimico = false; cfg.devErrante = false; }
      avisar(cfg.dev ? 'Modo desenvolvedor ligado: tudo liberado numa cópia de teste.' : 'Modo desenvolvedor desligado: seu inventário de verdade voltou.');
    }
    salvar();
    E.manterRolagem = true;
    render();
  },
};
