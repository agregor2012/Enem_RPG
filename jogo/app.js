'use strict';
/* ENEM RPG: lógica do jogo.
   Cada tela é uma função que devolve HTML; os cliques passam por data-acao. */

const BASE_BANCO = window.enem ? 'enem://banco/' : '/banco/';
const CHAVE_DEV = 'enem-rpg-save';
const ROTULO_APL = { r: 'Aplicação regular', p: 'Reaplicação/PPL', s: '2ª aplicação', t: '3ª aplicação',
                     b: 'Belém, Ananindeua e Marituba', d: 'Aplicação digital' };
const NIVEL = { 0: 'Sem dado', 1: 'Fácil', 2: 'Média', 3: 'Difícil' };
const LETRAS = ['A', 'B', 'C', 'D', 'E'];
const TAMANHOS = [5, 10, 20, 45];

const E = {
  banco: [], porId: new Map(), redacao: [], matriz: null, save: null,
  tela: 'carregando', area: 'LC', filtro: { comp: 'todas', tamanho: 10, nivel: 'todos', ano: 'todos' },
  selecao: null, riscadas: new Set(), resultado: null, respostaAtual: null,
  torreAba: 'estrutura', torreAno: null, leitor: null, modal: null, relogio: null,
  simFiltro: 'todos', criacao: { nome: '', classe: 'escriba' }, checklist: new Set(), relatorio: null,
  camera: { z: 1, cx: 700, cy: 520 }, cameraAlvo: null, fimArrasto: 0,
  inv: { aba: 'itens', cat: 'todos', rar: 'todas', bloqueados: true }, dev: null, premiosConquista: {},
};

/* ---- utilidades ------------------------------------------------------- */
const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $avisos = document.getElementById('avisos');

const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ico = (nome, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${nome}"/></svg>`;
const pct = (a, t) => (t ? Math.round((a / t) * 100) : 0);
const milhar = n => Number(n).toLocaleString('pt-BR');

function hoje(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dia}`;
}
function somarDias(iso, n) {
  const [a, m, d] = iso.split('-').map(Number);
  return hoje(new Date(a, m - 1, d + n));
}
function embaralhar(lista) {
  const v = lista.slice();
  for (let i = v.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [v[i], v[j]] = [v[j], v[i]];
  }
  return v;
}
function duracao(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = String(s % 60).padStart(2, '0');
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m}:${seg}`;
}
function avisar(texto, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = texto;
  $avisos.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---- gravação --------------------------------------------------------- */
function saveNovo() {
  return {
    versao: 1, heroi: null, xp: 0, pontos: 0,
    cfg: { lingua: 'ing', meta: 20, zoom: 100, papel: 'pergaminho', dataProva: null,
           dev: false, devBau: false, devMimico: false, devErrante: false, devEvento: false, devEvolucao: false }, // dev*: modo desenvolvedor temporário
    q: {}, sessoes: [], dias: {}, seqDias: { atual: 0, melhor: 0, ultimo: null },
    conquistas: {}, lidas: {}, melhorSeq: 0, recuperadas: 0, filaZerada: false, atual: null,
    titulo: null, // id da conquista cujo título aparece no painel; null usa o título do nível
    sabio: { jornadas: 0, inimigos: 0, chefes: 0, melhorOnda: 0 },
    itens: itensNovos(), // inventário, equipamento, moedas, missões e loja (inventario.js)
  };
}
async function carregarSave() {
  let texto = null;
  try {
    texto = window.enem ? await window.enem.carregar() : localStorage.getItem(CHAVE_DEV);
  } catch (e) { console.error(e); }
  if (!texto) return saveNovo();
  try {
    const s = JSON.parse(texto);
    const novo = saveNovo();
    return { ...novo, ...s, cfg: { ...novo.cfg, ...s.cfg }, sabio: { ...novo.sabio, ...s.sabio }, itens: mesclarItens(s.itens) };
  } catch (e) {
    console.error(e);
    return saveNovo();
  }
}
let temporizadorSave = null;
function salvar(imediato = false) {
  clearTimeout(temporizadorSave);
  const gravar = async () => {
    const texto = JSON.stringify(E.save);
    try {
      if (window.enem) {
        const ok = await window.enem.salvar(texto);
        if (!ok) avisar('Não consegui gravar o progresso. Verifique a pasta "progresso".', 'erro');
      } else {
        localStorage.setItem(CHAVE_DEV, texto);
      }
    } catch (e) {
      console.error(e);
      avisar('Não consegui gravar o progresso.', 'erro');
    }
  };
  if (imediato) return gravar();
  temporizadorSave = setTimeout(gravar, 400);
  return null;
}

/* ---- progressão ------------------------------------------------------- */
function custoNivel(n) { return 150 + 50 * (n - 1); }
function nivelDe(xp) {
  let n = 1;
  let resto = xp;
  while (resto >= custoNivel(n)) { resto -= custoNivel(n); n += 1; }
  return { n, resto, custo: custoNivel(n) };
}
function tituloDe(n) {
  let t = TITULOS[0][1];
  for (const [min, nome] of TITULOS) if (n >= min) t = nome;
  return t;
}
/* Título exibido: o escolhido entre as conquistas desbloqueadas, ou o do nível. */
function tituloAtual() {
  const id = E.save.titulo;
  const c = id && E.save.conquistas[id] ? CONQUISTAS.find(x => x.id === id) : null;
  return c ? c.titulo : tituloDe(nivelDe(E.save.xp).n);
}
function totalRespondidas() { return Object.values(E.save.dias).reduce((s, d) => s + d.q, 0); }
function estado(id) { return E.save.q[id] || null; }

function filaRevisao(soVencidas = true) {
  const dia = hoje();
  return E.banco.filter((q) => {
    const st = estado(q.id);
    if (!st || !st.prox || !linguaOk(q)) return false;
    return soVencidas ? st.prox <= dia : true;
  });
}
function linguaOk(q) {
  const l = E.save.cfg.lingua;
  if (q.ling === null || q.ling === undefined || l === 'ambas') return true;
  return (l === 'ing' && q.ling === 0) || (l === 'esp' && q.ling === 1);
}
function resumoArea(area, comp) {
  const lista = E.banco.filter(q => q.area === area && linguaOk(q) && (comp === undefined || (comp === 0 ? !q.comp : q.comp === comp)));
  let vistas = 0; let dominadas = 0; let acertos = 0; let tentativas = 0;
  for (const q of lista) {
    const st = estado(q.id);
    if (!st) continue;
    vistas += 1;
    if (st.ultima === 1) dominadas += 1;
    acertos += st.a; tentativas += st.a + st.e;
  }
  return { total: lista.length, vistas, dominadas, acertos, tentativas };
}

/* ---- montagem de sessões ---------------------------------------------- */
function questoesFiltradas() {
  const f = E.filtro;
  return E.banco.filter((q) => {
    if (q.area !== E.area || !linguaOk(q)) return false;
    if (f.comp !== 'todas' && (f.comp === 0 ? q.comp : q.comp !== f.comp)) return false;
    if (f.nivel !== 'todos' && q.nivel !== Number(f.nivel)) return false;
    if (f.ano !== 'todos' && q.ano !== Number(f.ano)) return false;
    return true;
  });
}
/* Prioridade: nunca vistas, depois as erradas, depois as acertadas há mais tempo. */
function escolher(lista, n) {
  const novas = []; const erradas = []; const vistas = [];
  for (const q of embaralhar(lista)) {
    const st = estado(q.id);
    if (!st) novas.push(q);
    else if (st.ultima === 0) erradas.push(q);
    else vistas.push(q);
  }
  vistas.sort((a, b) => (estado(a.id).dia < estado(b.id).dia ? -1 : 1));
  return [...novas, ...erradas, ...vistas].slice(0, n);
}
function guardiao(chave) {
  const lista = GUARDIOES[chave];
  const [nome, frase] = lista[Math.floor(Math.random() * lista.length)];
  return { nome, frase };
}
function iniciarSessao(tipo, titulo, ids, extra = {}) {
  if (E.save.atual && Object.keys(E.save.atual.respostas).length) {
    avisar('Você tem uma sessão em andamento. Continue ou encerre antes de começar outra.');
    ir('mapa');
    return;
  }
  E.save.atual = {
    tipo, titulo, ids, i: 0, respostas: {}, acertos: 0, pontos: 0, xp: 0, seq: 0, maxSeq: 0,
    inicio: Date.now(), gasto: 0, limite: null, guardiao: null, marcadas: [], ...extra,
  };
  E.selecao = null; E.riscadas = new Set(); E.respostaAtual = null;
  salvar(true);
  ir('questao');
}
function partirExpedicao() {
  const lista = questoesFiltradas();
  const n = Math.min(E.filtro.tamanho, lista.length);
  if (!n) { avisar('Nenhuma questão com esses filtros.'); return; }
  const ids = escolher(lista, n).map(q => q.id);
  const regiao = E.filtro.comp === 'todas' ? REINOS[E.area].nome
    : (E.filtro.comp === 0 ? TERRAS_SEM_CLASSE[0] : REINOS[E.area].regioes[E.filtro.comp][0]);
  iniciarSessao('expedicao', regiao, ids, { guardiao: guardiao(E.area), reino: E.area }); // reino: Diadema e Lumina
}
function partirRevisao(todas) {
  const lista = embaralhar(filaRevisao(!todas));
  if (!lista.length) { avisar('A fila de revisão está vazia.'); return; }
  iniciarSessao('revisao', 'Masmorra dos Erros', lista.slice(0, 20).map(q => q.id), { guardiao: guardiao('revisao') });
}
function provasDeSimulado() {
  const mapa = new Map();
  for (const q of E.banco) {
    if (q.ano < 2009) continue;
    const k = `${q.ano}-${q.apl}`;
    if (!mapa.has(k)) mapa.set(k, { ano: q.ano, apl: q.apl, LC: 0, CH: 0, CN: 0, MT: 0 });
    if (linguaOk(q)) mapa.get(k)[q.area] += 1;
  }
  return [...mapa.values()].sort((a, b) => b.ano - a.ano || ('rpsbtd'.indexOf(a.apl) - 'rpsbtd'.indexOf(b.apl)));
}
/* Os dias seguem o formato atual do Enem: 1º dia com Linguagens e Humanas (5h30, com a
   redação) e 2º dia com Natureza e Matemática (5h). Uma área sozinha tem 3 min por questão. */
const DIAS_SIMULADO = {
  dia1: { areas: ['LC', 'CH'], minutos: 330, nome: '1º dia' },
  dia2: { areas: ['CN', 'MT'], minutos: 300, nome: '2º dia' },
};
function partirSimulado(ano, apl, pedido) {
  const parte = pedido === 'ambas' ? 'dia1' : pedido; // "ambas" era o 1º dia antes do 2º dia existir
  const dia = DIAS_SIMULADO[parte];
  const areas = dia ? dia.areas : [parte];
  const ids = [];
  for (const area of areas) {
    ids.push(...E.banco
      .filter(q => q.ano === ano && q.apl === apl && q.area === area && linguaOk(q))
      .sort((a, b) => a.n - b.n || (a.ling ?? 0) - (b.ling ?? 0))
      .map(q => q.id));
  }
  if (!ids.length) { avisar('Sem questões nessa prova para a língua escolhida.'); return; }
  const limite = (dia ? dia.minutos : ids.length * 3) * 60000;
  const qual = dia ? dia.nome : REINOS[parte].curto;
  iniciarSessao('simulado', `Simulado Enem ${ano} (${ROTULO_APL[apl]}) · ${qual}`, ids,
    { limite, parte, guardiao: guardiao('misto') });
}
function partirTreinoRapido() {
  const pendentes = filaRevisao(true);
  const ids = embaralhar(pendentes).slice(0, 5).map(q => q.id);
  const novas = escolher(E.banco.filter(q => linguaOk(q) && !ids.includes(q.id)), 10 - ids.length).map(q => q.id);
  iniciarSessao('expedicao', 'Patrulha do dia', embaralhar([...ids, ...novas]), { guardiao: guardiao('misto') });
}

/* ---- Reino do Sábio: jornada sem fim ----------------------------------- */
/* A dificuldade sobe aos poucos: primeiro as fáceis (e as de 2005 a 2008, sem dado de TRI),
   depois as médias, e as difíceis a partir da 10ª onda. Chefes trazem as difíceis. */
function niveisDaOnda(onda, chefe) {
  if (chefe) return [3, 2];
  if (onda <= 2) return [1, 0];
  if (onda <= 5) return [1, 2, 0];
  if (onda <= 9) return [2, 0];
  if (onda <= 14) return [2, 3];
  return [3, 2];
}
function vidaDoInimigo(onda, chefe) {
  if (chefe) return 5;
  if (onda <= 3) return 2;
  return onda <= 9 ? 3 : 4;
}
function novoInimigo(s) {
  const onda = (s.onda || 0) + 1;
  const chefe = onda % ONDAS_POR_CHEFE === 0;
  // de vez em quando, um monstro errante (itens.js) aparece no lugar do inimigo comum
  const errante = chefe ? null : sortearErrante(onda);
  if (errante) {
    const hp = Math.max(errante.hp, vidaDoInimigo(onda, false));
    s.onda = onda;
    E.save.sabio.melhorOnda = Math.max(E.save.sabio.melhorOnda, onda);
    return { nome: errante.nome, frase: errante.frase, reino: 'errante', errante: errante.id, hp, hpMax: hp, onda, chefe: false };
  }
  let reino = 'sabio';
  if (!chefe) {
    // a Masmorra só manda inimigos quando há erros para rever
    const ciclo = filaRevisao(false).length ? CICLO_SABIO : CICLO_SABIO.filter(r => r !== 'revisao');
    const comuns = onda - Math.floor(onda / ONDAS_POR_CHEFE);
    reino = ciclo[(comuns - 1) % ciclo.length];
  }
  const opcoes = INIMIGOS[reino].filter(([n]) => n !== s.inimigo?.nome);
  const [nome, frase] = opcoes[Math.floor(Math.random() * opcoes.length)];
  const hp = vidaDoInimigo(onda, chefe);
  s.onda = onda;
  E.save.sabio.melhorOnda = Math.max(E.save.sabio.melhorOnda, onda);
  return { nome, frase, reino, hp, hpMax: hp, onda, chefe };
}
function questaoDoSabio(s) {
  const usadas = new Set(s.ids || []);
  const ini = s.inimigo;
  const livres = E.banco.filter(q => linguaOk(q) && !usadas.has(q.id));
  if (!livres.length) return null;
  let base;
  if (REINOS[ini.reino]) base = livres.filter(q => q.area === ini.reino);
  else if (ini.reino === 'torre') base = livres.filter(q => q.area === 'LC' && [6, 7, 8].includes(q.comp)); // texto e argumentação
  else if (ini.reino === 'revisao') {
    const fila = filaRevisao(false).filter(q => !usadas.has(q.id));
    base = fila.length ? fila : livres.filter(q => estado(q.id)?.ultima === 0);
  } else base = livres;
  if (!base.length) base = livres;
  const niveis = niveisDaOnda(ini.onda, ini.chefe);
  const doNivel = base.filter(q => niveis.includes(q.nivel));
  return escolher(doNivel.length ? doNivel : base, 1)[0];
}
function partirSabio() {
  const s = { onda: 0, inimigo: null, ids: [] };
  s.inimigo = novoInimigo(s);
  const q = questaoDoSabio(s);
  if (!q) { avisar('Não há questões disponíveis para a língua escolhida.'); return; }
  iniciarSessao('sabio', 'Jornada do Sábio', [q.id], { onda: s.onda, inimigo: s.inimigo, derrotados: 0, chefes: 0, reino: 'sabio' });
}
/* Acerto tira um ponto de vida do inimigo; erro não custa nada, a questão vai para a Masmorra. */
function golpear(s, r) {
  const ini = s.inimigo;
  if (!r.acertou || ini.hp <= 0) return;
  const dano = danoDoGolpe(s); // arma com golpe duplo a partir de certa sequência
  ini.hp = Math.max(0, ini.hp - dano);
  if (dano > 1) r.golpeForte = true;
  if (ini.hp > 0) return;
  const xp = ini.chefe ? XP_CHEFE : XP_INIMIGO;
  s.derrotados += 1;
  E.save.sabio.inimigos += 1;
  if (ini.chefe) { s.chefes += 1; E.save.sabio.chefes += 1; }
  s.xp += xp; E.save.xp += xp;
  r.derrotou = { nome: ini.nome, xp, chefe: ini.chefe, errante: ini.errante || null, forte: ini.hpMax >= 3 };
}
function avancarSabio(s) {
  if (s.inimigo.hp <= 0) s.inimigo = novoInimigo(s);
  const q = questaoDoSabio(s);
  if (!q) { avisar('Você chegou ao fim das questões disponíveis. Que jornada!'); concluirSessao(); return; }
  s.ids.push(q.id);
  irQuestao(s.i + 1);
}

/* ---- responder -------------------------------------------------------- */
function premio(q, acertou, st, sessao) {
  const classe = E.save.heroi.classe;
  const afinidade = (classe === 'escriba' && q.area === 'LC') || (classe === 'cronista' && q.area === 'CH')
    || (classe === 'alquimista' && sessao.tipo === 'revisao');
  // classe (+10%) e itens equipados (até LIMITES.xp, em inventario.js)
  const fator = 1 + (afinidade ? 0.1 : 0) + bonusXpItens(q, sessao) / 100;
  const comBonus = xp => Math.round(xp * fator);
  if (!acertou) return { pontos: 0, xp: comBonus(XP_ERRO + xpErroItens(sessao)) };
  let pontos = PONTOS_NIVEL[q.nivel] + Math.min(Math.max(sessao.seq - 1, 0), BONUS_SEQUENCIA_MAX);
  const repetida = st && st.a > 0; // refazer questão já acertada rende pouco, para não virar decoreba
  let xp = sessao.tipo === 'revisao' ? XP_REVISAO : (repetida ? Math.ceil(pontos / 4) : pontos);
  if (ajudaNaQuestao(sessao, q.id)) { // alternativa eliminada ou segunda chance: o acerto vale metade
    pontos = Math.ceil(pontos * AJUDA_FATOR);
    xp = Math.ceil(xp * AJUDA_FATOR);
  }
  return { pontos, xp: comBonus(xp) };
}
function registrar(q, letra, sessao, opcoes = {}) {
  const acertou = letra === q.gab;
  const dia = hoje();
  const st = E.save.q[q.id] || { a: 0, e: 0, cx: 0, prox: null, ultima: null, dia: null };
  let protegeu = null;
  if (acertou) {
    if (!opcoes.segunda) sessao.seq += 1; // acerto na segunda chance não aumenta a sequência
    sessao.acertos += 1;
  } else {
    protegeu = protegerSequencia(sessao, q); // poção ou armadura podem salvar a sequência
    if (!protegeu) sessao.seq = 0;
  }
  sessao.maxSeq = Math.max(sessao.maxSeq, sessao.seq);
  E.save.melhorSeq = Math.max(E.save.melhorSeq, sessao.seq);
  const ganho = premio(q, acertou, st, sessao);
  if (acertou && opcoes.segunda) {
    // acertou só na segunda tentativa: conta o acerto, mas a questão volta amanhã na revisão
    st.a += 1; st.e += 1; st.cx = 0;
    st.prox = somarDias(dia, INTERVALOS_REVISAO[0]);
  } else if (acertou) {
    if (st.prox) {
      if (st.prox <= dia || sessao.tipo === 'revisao') E.save.recuperadas += 1;
      st.cx += 1;
      st.prox = st.cx >= INTERVALOS_REVISAO.length ? null : somarDias(dia, INTERVALOS_REVISAO[st.cx]);
    }
    st.a += 1;
  } else {
    st.e += 1; st.cx = 0;
    st.prox = somarDias(dia, INTERVALOS_REVISAO[0]);
  }
  st.ultima = acertou && !opcoes.segunda ? 1 : 0;
  st.dia = dia;
  E.save.q[q.id] = st;
  sessao.pontos += ganho.pontos;
  sessao.xp += ganho.xp;
  E.save.xp += ganho.xp;
  E.save.pontos += ganho.pontos;
  const d = E.save.dias[dia] || { q: 0, a: 0 };
  d.q += 1; d.a += acertou ? 1 : 0;
  E.save.dias[dia] = d;
  marcarDia(dia);
  return { acertou, ...ganho, protegeu, segunda: Boolean(opcoes.segunda) };
}
function marcarDia(dia) {
  const s = E.save.seqDias;
  if (s.ultimo === dia) return;
  s.atual = s.ultimo === somarDias(dia, -1) ? s.atual + 1 : 1;
  s.melhor = Math.max(s.melhor, s.atual);
  s.ultimo = dia;
}
function confirmar() {
  const s = E.save.atual;
  if (!s || !E.selecao) return;
  const q = E.porId.get(s.ids[s.i]);
  if (s.tipo === 'simulado') {
    s.respostas[q.id] = E.selecao;
    salvar();
    if (s.i < s.ids.length - 1) irQuestao(s.i + 1);
    else render();
    return;
  }
  if (s.respostas[q.id]) return;
  if (eliminadasDa(s, q.id).includes(E.selecao)) { E.selecao = null; atualizarMarcas(); return; }
  // segunda chance pronta (elixir ou ampulheta): a resposta errada não conta e a questão continua
  if (E.selecao !== q.gab && tentarSegundaChance(s, q, E.selecao)) {
    E.selecao = null;
    salvar();
    renderMantendoRolagem();
    return;
  }
  const r = registrar(q, E.selecao, s, { segunda: Boolean(s.efeitos?.[q.id]?.errouAntes) });
  s.respostas[q.id] = E.selecao;
  if (s.tipo === 'sabio') golpear(s, r);
  aoResponderItens(s, q, r); // espólio, baús, Mímico e missões (inventario.js)
  E.respostaAtual = r;
  salvar();
  render();
}
function irQuestao(i) {
  const s = E.save.atual;
  s.i = i;
  E.selecao = s.tipo === 'simulado' ? (s.respostas[s.ids[i]] || null) : null;
  E.riscadas = new Set();
  E.respostaAtual = null;
  salvar();
  render();
  document.querySelector('.area-questao')?.scrollTo(0, 0);
}
function proxima() {
  const s = E.save.atual;
  if (s.tipo === 'sabio') { avancarSabio(s); return; }
  if (s.i >= s.ids.length - 1) { concluirSessao(); return; }
  irQuestao(s.i + 1);
}
function concluirSessao() {
  const s = E.save.atual;
  if (!s) return;
  const antes = nivelDe(E.save.xp - s.xp).n;
  if (s.tipo === 'simulado') {
    for (const id of s.ids) {
      const letra = s.respostas[id];
      if (letra) registrar(E.porId.get(id), letra, s);
    }
  }
  const respondidas = s.ids.filter(id => s.respostas[id]);
  const sabio = s.tipo === 'sabio';
  const venceu = sabio ? s.derrotados > 0 : respondidas.length > 0 && s.acertos / respondidas.length >= META_GUARDIAO;
  let bonus = 0;
  if (sabio) { if (respondidas.length >= MIN_FIM_SABIO) bonus += XP_FIM_SESSAO; } // os inimigos já deram XP
  else if (respondidas.length) {
    bonus += XP_FIM_SESSAO;
    if (venceu) bonus += XP_GUARDIAO;
    bonus += xpExtraConclusao(s, respondidas.length, bonus); // Manto do Explorador (inventario.js)
  }
  s.xp += bonus; E.save.xp += bonus;
  const gasto = s.gasto + (Date.now() - s.inicio);
  const registro = {
    dia: hoje(), tipo: s.tipo, titulo: s.titulo, total: respondidas.length, previstas: sabio ? respondidas.length : s.ids.length,
    acertos: s.acertos, pontos: s.pontos, xp: s.xp, tempo: gasto, venceu, maxSeq: s.maxSeq,
    ...(sabio ? { onda: s.onda, derrotados: s.derrotados, chefes: s.chefes } : {}),
    ...(s.parte ? { parte: s.parte } : {}),
    ...(s.reino ? { reino: s.reino } : {}),
  };
  if (respondidas.length) E.save.sessoes.push(registro);
  if (sabio && respondidas.length) E.save.sabio.jornadas += 1;
  if (s.tipo === 'revisao' && !filaRevisao(true).length) E.save.filaZerada = true;
  const erradas = respondidas.filter(id => s.respostas[id] !== E.porId.get(id).gab);
  const novas = verificarConquistas();
  const itens = aoConcluirItens(s, registro); // guardião, baú do simulado e missões (inventario.js)
  E.resultado = { ...registro, erradas, respostas: s.respostas, guardiao: s.guardiao, bonus, novas,
                  nivelAntes: antes, nivelDepois: nivelDe(E.save.xp).n, ids: s.ids,
                  espolio: itens.espolio, mimicoFugiu: itens.mimicoFugiu, passagemFechou: itens.passagemFechou,
                  missoesItens: itens.missoes, extrasItens: itens.extras };
  E.save.atual = null;
  clearInterval(E.relogio);
  salvar(true);
  ir('resultado');
}
function abandonarSessao() {
  const s = E.save.atual;
  if (!s) return;
  if (Object.keys(s.respostas).length) { concluirSessao(); return; }
  E.save.atual = null;
  clearInterval(E.relogio);
  salvar(true);
  ir('mapa');
}
function contexto() {
  const S = E.save;
  const lidas = Object.keys(S.lidas);
  const regioes = new Set();
  const porComp = {};
  const anos = new Set();
  let disponiveis = 0; let vistas = 0;
  for (const q of E.banco) {
    const st = estado(q.id);
    if (linguaOk(q)) { disponiveis += 1; if (st) vistas += 1; }
    if (!st) continue;
    if (st.a) anos.add(q.ano);
    if (!q.comp) continue;
    const k = `${q.area}${q.comp}`;
    if (st.a) regioes.add(k);
    const p = porComp[k] || (porComp[k] = { a: 0, t: 0 });
    p.a += st.a; p.t += st.a + st.e;
  }
  // as conquistas de competência contam por dia de prova: as de antes valem para o 1º dia
  const doDia = (dia, k) => REINOS[k.slice(0, 2)].dia === dia;
  const comps1 = ['LC', 'CH'].reduce((n, a) => n + Object.keys(REINOS[a].regioes).length, 0);
  const comp1 = Object.entries(porComp).filter(([k]) => doDia(1, k)).map(([, p]) => p);
  const sessoes = S.sessoes;
  const taxa = s => (s.total ? s.acertos / s.total : 0);
  const completo = (s, dia) => s.tipo === 'simulado' && (s.parte || 'dia1') === dia && s.total >= 80 && taxa(s) >= 0.6;
  return {
    sessoes: sessoes.length, respondidas: totalRespondidas(), melhorSeq: S.melhorSeq,
    acertos: Object.values(S.dias).reduce((t, d) => t + d.a, 0),
    sessao80: sessoes.some(s => s.total >= 10 && taxa(s) >= 0.8),
    sessao90: sessoes.some(s => s.total >= 20 && taxa(s) >= 0.9),
    perfeita: sessoes.some(s => s.total >= 10 && s.acertos === s.total),
    simulados: sessoes.filter(s => s.tipo === 'simulado').length,
    simulado80: sessoes.some(s => s.tipo === 'simulado' && s.total >= 40 && taxa(s) >= 0.8),
    simuladoCompleto: sessoes.some(s => completo(s, 'dia1')),
    simuladoCompleto2: sessoes.some(s => completo(s, 'dia2')),
    melhorDias: S.seqDias.melhor, recuperadas: S.recuperadas, filaZerada: S.filaZerada,
    regioes: [...regioes].filter(k => doDia(1, k)).length,
    regioesN: [...regioes].filter(k => doDia(2, k)).length,
    regioes70: comp1.length >= comps1 && comp1.every(p => p.t >= 10 && p.a / p.t >= 0.7),
    lidas: lidas.length, edicoesLidas: new Set(lidas.map(k => k.split('-')[0])).size,
    nivel: nivelDe(S.xp).n, sabio: S.sabio,
    domLC: resumoArea('LC').dominadas, domCH: resumoArea('CH').dominadas,
    domCN: resumoArea('CN').dominadas, domMT: resumoArea('MT').dominadas,
    anos: anos.size, anosTotal: new Set(E.banco.map(q => q.ano)).size, disponiveis, vistas,
  };
}
function verificarConquistas() {
  const novas = [];
  // uma conquista dá XP e pode levar a outra (de nível), então confere de novo até parar
  for (let rodada = 0; rodada < 3; rodada++) {
    const c = contexto();
    const desta = CONQUISTAS.filter(q => !E.save.conquistas[q.id] && q.teste(c));
    if (!desta.length) break;
    for (const q of desta) {
      E.save.conquistas[q.id] = hoje();
      E.save.xp += XP_CONQUISTA[q.grau];
      premiarConquista(q); // moedas e item da conquista (inventario.js)
      novas.push(q);
    }
  }
  return novas;
}

/* ---- pedaços de tela -------------------------------------------------- */
function dataProva() { return E.save.cfg.dataProva || DATA_PROVA_PADRAO; }
function formatarData(iso) { return iso.split('-').reverse().join('/'); }
/* Dias de calendário até a prova: no próprio dia dá 0, a qualquer hora. */
function diasParaProva() {
  const [a, m, d] = dataProva().split('-').map(Number);
  const agora = new Date();
  const inicioHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  return Math.round((new Date(a, m - 1, d) - inicioHoje) / 86400000);
}
function textoContagem(dias) {
  if (dias > 1) return `em ${dias} dias`;
  if (dias === 1) return 'amanhã';
  if (dias === 0) return 'é hoje';
  return 'data já passou';
}
function menu(ativo) {
  const fila = filaRevisao(true).length;
  const itens = [
    ['mapa', 'mapa', 'Mapa'], ['revisao', 'caveira', 'Revisão'], ['simulado', 'espadas', 'Simulado'],
    ['redacao', 'torre', 'Redação'], ['grimorio', 'livro', 'Grimório'], ['inventario', 'bau', 'Inventário'],
    ['ajustes', 'engrenagem', 'Ajustes'],
  ];
  return `<nav class="menu" aria-label="Navegação principal">
    <div class="marca">${ico('escudo')}<span>ENEM RPG</span></div>
    ${itens.map(([id, icone, nome]) => `<button class="item-menu ${ativo === id ? 'ativo' : ''}" data-acao="ir" data-tela="${id}">
      ${ico(icone)}<span>${nome}</span>${id === 'revisao' && fila ? `<b class="selo">${fila}</b>` : ''}</button>`).join('')}
  </nav>`;
}
function barra(valor, total, classe = '') {
  return `<div class="barra ${classe}"><span style="width:${Math.min(100, pct(valor, total))}%"></span></div>`;
}
function painelHeroi() {
  const h = E.save.heroi;
  const c = CLASSES[h.classe];
  const nv = nivelDe(E.save.xp);
  const dia = E.save.dias[hoje()] || { q: 0, a: 0 };
  const meta = E.save.cfg.meta;
  const faltam = diasParaProva();
  return `<aside class="heroi">
    <div class="emblema">${ico(c.simbolo)}</div>
    <h2>${esc(h.nome)}</h2>
    <p class="sub">${c.nome} · Nível ${nv.n}</p>
    <button class="titulo-heroi" data-acao="pedir-titulo" title="Escolher um título entre as conquistas desbloqueadas">
      ${ico('medalha')}<span>${esc(tituloAtual())}</span><small>trocar</small></button>
    <div class="linha-nivel"><strong>Nível ${nv.n}</strong><span>${nv.resto} / ${nv.custo} XP</span></div>
    ${barra(nv.resto, nv.custo, 'xp')}
    <h3>Meta de hoje</h3>
    <div class="linha-nivel"><strong>${dia.q} de ${meta} questões</strong><span>${dia.q ? pct(dia.a, dia.q) + '% de acerto' : ''}</span></div>
    ${barra(dia.q, meta, 'meta')}
    <dl class="fichas">
      <div><dt>${ico('chama')} Dias seguidos</dt><dd>${E.save.seqDias.atual}</dd></div>
      <div><dt>${ico('estrela')} Pontos</dt><dd>${milhar(E.save.pontos)}</dd></div>
      <div><dt>${ico('moeda')} Moedas</dt><dd>${inventario().dev ? '∞' : milhar(inventario().moedas || 0)}</dd></div>
      <div class="contagem"><dt>${ico('ampulheta')} 1º dia do Enem</dt><dd>${textoContagem(faltam)}</dd>
        <button class="mudar-data" data-acao="pedir-data" title="Definir a data da sua prova">${formatarData(dataProva())} · alterar</button></div>
    </dl>
  </aside>`;
}

/* ---- telas ------------------------------------------------------------ */
const TELAS = {
  carregando: () => `<div class="centro"><p>Abrindo o mapa do reino…</p></div>`,

  criar: () => {
    const c = E.criacao;
    return `<main class="criar">
      <div class="logo">${ico('escudo')}<h1>ENEM RPG</h1></div>
      <p class="lead">Todas as questões vêm das provas oficiais do Enem. Crie seu personagem e comece a jornada.</p>
      <label class="campo">Nome do personagem
        <input id="nome-heroi" maxlength="24" value="${esc(c.nome)}" placeholder="Como quer ser chamado(a)?" autocomplete="off"></label>
      <div class="classes" role="radiogroup" aria-label="Classe">
        ${Object.entries(CLASSES).map(([id, k]) => `<button class="carta-classe ${c.classe === id ? 'ativa' : ''}" role="radio" aria-checked="${c.classe === id}" data-acao="classe" data-id="${id}">
          ${ico(k.simbolo)}<h3>${k.nome}</h3><p>${k.texto}</p><small>${k.bonus}</small></button>`).join('')}
      </div>
      <button class="botao primario grande" data-acao="criar">Começar a jornada</button>
    </main>`;
  },

  mapa: () => {
    const fila = filaRevisao(true).length;
    const atual = E.save.atual;
    return `${menu('mapa')}<div class="tela-mapa">
      ${painelHeroi()}
      <main class="mapa-area">
        ${atual ? `<div class="faixa-continuar"><div><strong>Sessão em andamento:</strong> ${esc(atual.titulo)}, ${atual.tipo === 'sabio' ? `questão ${atual.i + 1}, onda ${atual.onda}` : `questão ${atual.i + 1} de ${atual.ids.length}`}</div>
          <button class="botao primario" data-acao="ir" data-tela="questao">Continuar</button></div>`
          : `<div class="faixa-continuar"><div><strong>Sem tempo para escolher?</strong> A Patrulha do dia mistura 10 questões, com suas revisões pendentes.</div>
          <button class="botao primario" data-acao="patrulha">Partir agora</button></div>`}
        <div class="mapa-palco"><div class="mapa-moldura">${mapaSVG(fila)}${controlesMapa()}</div></div>
      </main>
    </div>`;
  },

  reino: () => {
    const R = REINOS[E.area];
    const f = E.filtro;
    const disponiveis = questoesFiltradas().length;
    const geral = resumoArea(E.area);
    const anos = [...new Set(E.banco.filter(q => q.area === E.area).map(q => q.ano))].sort((a, b) => b - a);
    const cartao = (comp, nome, sub, r, desc) => `<button class="regiao ${f.comp === comp ? 'ativa' : ''}" data-acao="comp" data-comp="${comp}" title="${esc(desc || '')}">
      <h4>${nome}</h4><p>${sub}</p>${barra(r.dominadas, r.total, 'fina')}
      <small>${r.dominadas} de ${r.total} dominadas${r.tentativas ? ` · ${pct(r.acertos, r.tentativas)}% de acerto` : ''}</small></button>`;
    return `${menu('mapa')}<main class="conteudo">
      <header class="cabecalho">
        <button class="voltar" data-acao="ir" data-tela="mapa">${ico('seta')} Mapa</button>
        <div><h1>${R.nome}</h1><p>${R.area}. ${R.texto}</p></div>
        <div class="resumo-reino"><strong>${milhar(geral.dominadas)}</strong><span>de ${milhar(geral.total)} questões dominadas</span></div>
      </header>
      <section class="regioes">
        ${cartao('todas', 'Todo o reino', 'Questões de todas as competências', geral, '')}
        ${Object.entries(R.regioes).map(([n, [nome, sub]]) => cartao(Number(n), nome, sub, resumoArea(E.area, Number(n)), E.matriz?.[E.area]?.competencias?.[n])).join('')}
        ${cartao(0, TERRAS_SEM_CLASSE[0], TERRAS_SEM_CLASSE[1], resumoArea(E.area, 0), 'Questões para as quais o INEP não publicou a habilidade, como as das provas de 2005 a 2008.')}
      </section>
      <section class="partida">
        <div class="grupo"><span>Tamanho</span>${TAMANHOS.map(t => `<button class="pilula ${f.tamanho === t ? 'ativa' : ''}" data-acao="tamanho" data-v="${t}">${t}</button>`).join('')}</div>
        <div class="grupo"><span>Dificuldade</span>${[['todos', 'Todas'], ['1', 'Fácil'], ['2', 'Média'], ['3', 'Difícil']].map(([v, t]) => `<button class="pilula ${f.nivel === v ? 'ativa' : ''}" data-acao="nivel" data-v="${v}">${t}</button>`).join('')}</div>
        <label class="grupo"><span>Ano</span><select data-mudar="ano"><option value="todos">Todos</option>${anos.map(a => `<option value="${a}" ${String(f.ano) === String(a) ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        <div class="partir"><small>${milhar(disponiveis)} questões disponíveis</small>
          <button class="botao primario grande" data-acao="partir" ${disponiveis ? '' : 'disabled'}>Partir em expedição</button></div>
      </section>
    </main>`;
  },

  sabio: () => {
    const S = E.save.sabio;
    const disponiveis = E.banco.filter(linguaOk);
    const vistas = disponiveis.filter(q => estado(q.id)).length;
    const emCurso = E.save.atual?.tipo === 'sabio' ? E.save.atual : null;
    const bestiario = Object.entries(REINOS_INIMIGOS).map(([chave, r]) => `<article class="reino-bestiario reino-${r.cor}">
        <h3>${r.nome}${chave === 'sabio' ? ' <small>chefes</small>' : ''}</h3>
        <ul>${INIMIGOS[chave].map(([nome, frase]) => `<li><strong>${nome}</strong><span>${frase}</span>${chave === 'errante' ? dropsDoErrante(nome) : ''}</li>`).join('')}</ul></article>`).join('');
    return `${menu('mapa')}<main class="conteudo">
      <header class="cabecalho">
        <button class="voltar" data-acao="ir" data-tela="mapa">${ico('seta')} Mapa</button>
        <div><h1>${ico('coruja')} Reino do Sábio</h1><p>Todas as ${milhar(disponiveis.length)} questões do banco numa jornada sem fim. Responda quantas quiser e encerre quando quiser.</p></div>
        <div class="resumo-reino"><strong>${milhar(S.inimigos)}</strong><span>inimigos derrotados</span></div>
      </header>
      <section class="sabio-topo">
        <div class="cartao regras-sabio">
          <h2>Como é a jornada</h2>
          <ul>
            <li>Cada inimigo vem de um reino do mapa e traz questões de lá: Letras, Humanidades, Natureza, Números, Torre da Redação, Arena do Simulado e, quando há erros para rever, Masmorra dos Erros.</li>
            <li>Cada acerto tira um ponto de vida do inimigo. Errar não custa nada a você, e a questão vai para a Masmorra.</li>
            <li>A cada ${ONDAS_POR_CHEFE} ondas surge um chefe do Sábio, com mais vida e questões difíceis. Os inimigos ficam mais fortes conforme a jornada avança.</li>
            <li>Inimigo derrotado vale +${XP_INIMIGO} XP, e chefe vale +${XP_CHEFE} XP, além do XP de cada acerto. Todos deixam moedas e, às vezes, itens.</li>
            <li>De vez em quando surge um monstro errante, com questões de qualquer área e espólio próprio.</li>
          </ul>
          ${emCurso ? `<button class="botao primario grande" data-acao="ir" data-tela="questao">Continuar a jornada (onda ${emCurso.onda})</button>`
            : `<button class="botao primario grande" data-acao="sabio">Iniciar jornada</button>`}
        </div>
        <dl class="tiles tiles-sabio">
          <div><dt>Jornadas</dt><dd>${milhar(S.jornadas)}</dd></div>
          <div><dt>Chefes derrotados</dt><dd>${milhar(S.chefes)}</dd></div>
          <div><dt>Melhor onda</dt><dd>${S.melhorOnda || '—'}</dd></div>
          <div><dt>Questões já vistas</dt><dd>${pct(vistas, disponiveis.length)}%</dd></div>
        </dl>
      </section>
      <section class="cartao"><h2>Bestiário</h2><p class="sub">Os inimigos que podem aparecer, reino a reino</p>
        <div class="bestiario">${bestiario}</div></section>
    </main>`;
  },

  questao: () => telaQuestao(),

  resultado: () => {
    const r = E.resultado;
    const nota = pct(r.acertos, r.total);
    const subiu = r.nivelDepois > r.nivelAntes;
    const sabio = r.tipo === 'sabio';
    let guarda = r.venceu ? 'Guardião vencido' : 'O guardião resistiu, desta vez';
    let titulo = r.guardiao?.nome || r.titulo;
    if (sabio) {
      guarda = 'Jornada do Sábio';
      titulo = `${r.derrotados} ${r.derrotados === 1 ? 'inimigo derrotado' : 'inimigos derrotados'}`;
    }
    return `${menu('')}<main class="conteudo estreito">
      <section class="painel-resultado">
        <p class="guarda">${guarda}</p>
        <h1>${esc(titulo)}</h1>
        <div class="nota-grande"><strong>${nota}%</strong><span>de acerto ${sabio ? 'na jornada' : 'nesta sessão'}</span></div>
        <dl class="placar">
          <div><dt>Acertos</dt><dd>${r.acertos} de ${r.total}</dd></div>
          ${sabio ? `<div><dt>Onda alcançada</dt><dd>${r.onda}</dd></div><div><dt>Chefes</dt><dd>${r.chefes}</dd></div>` : ''}
          <div><dt>Pontos</dt><dd>${r.pontos}</dd></div>
          <div><dt>XP ganho</dt><dd>+${r.xp}</dd></div>
          <div><dt>Maior sequência</dt><dd>${r.maxSeq}</dd></div>
          <div><dt>Tempo</dt><dd>${duracao(r.tempo)}</dd></div>
        </dl>
        ${subiu ? `<p class="subiu">${ico('estrela')} Você chegou ao nível ${r.nivelDepois}: ${tituloDe(r.nivelDepois)}</p>` : ''}
        ${r.novas.map(c => `<p class="subiu conquista-nova grau-${c.grau}">${ico('medalha')} Conquista ${GRAUS[c.grau]}: ${c.nome}. Título liberado: <b>${c.titulo}</b> (+${XP_CONQUISTA[c.grau]} XP)</p>`).join('')}
        ${r.novas.length ? '<p class="dica-fim">Escolha o título que quer exibir no painel do herói, no mapa.</p>' : ''}
        ${espolioResultado(r)}
        ${r.erradas.length ? `<p class="dica-fim">${r.erradas.length === 1 ? 'A questão errada foi' : `As ${r.erradas.length} questões erradas foram`} para a Masmorra dos Erros e ${r.erradas.length === 1 ? 'volta' : 'voltam'} amanhã. Rever ajuda a fixar.</p>` : ''}
        <div class="acoes">
          ${r.erradas.length ? `<button class="botao" data-acao="rever-erradas">Rever as erradas agora</button>` : ''}
          <button class="botao primario" data-acao="ir" data-tela="mapa">Voltar ao mapa</button>
        </div>
      </section>
    </main>`;
  },

  conferencia: () => {
    const r = E.resultado;
    const lista = r.erradas;
    const id = lista[E.conferir || 0];
    const q = E.porId.get(id);
    return `${menu('')}<main class="tela-questao">
      <div class="area-questao">
        <div class="titulo-q">Questão errada ${(E.conferir || 0) + 1} de ${lista.length} · ${origem(q)}</div>
        ${folha(q, { sua: r.respostas[id], certa: q.gab })}
      </div>
      <aside class="painel-resposta">
        <p class="resposta-info">Sua resposta: <b class="tag erro">${r.respostas[id]}</b></p>
        <p class="resposta-info">Gabarito: <b class="tag ok">${q.gab}</b></p>
        ${blocoHabilidade(q)}
        <div class="acoes coluna">
          ${(E.conferir || 0) < lista.length - 1 ? `<button class="botao primario" data-acao="conferir-prox">Próxima errada</button>` : ''}
          <button class="botao" data-acao="ir" data-tela="resultado">Voltar ao resultado</button>
        </div>
      </aside>
    </main>`;
  },

  revisao: () => {
    const venc = filaRevisao(true).length;
    const todas = filaRevisao(false).length;
    return `${menu('revisao')}<main class="conteudo estreito">
      <section class="painel-tema masmorra">
        ${ico('caveira', 'ico-grande')}
        <h1>Masmorra dos Erros</h1>
        <p class="lead">Cada questão errada fica aqui e volta em intervalos cada vez maiores: 1, 2, 4, 8 e 16 dias. Quem acerta avança. Quem erra recomeça.</p>
        <dl class="placar">
          <div><dt>Para rever hoje</dt><dd>${venc}</dd></div>
          <div><dt>Na fila ao todo</dt><dd>${todas}</dd></div>
          <div><dt>Já recuperadas</dt><dd>${E.save.recuperadas}</dd></div>
        </dl>
        <div class="acoes">
          <button class="botao primario" data-acao="revisar" ${venc ? '' : 'disabled'}>Revisar as de hoje</button>
          <button class="botao" data-acao="revisar-todas" ${todas ? '' : 'disabled'}>Adiantar a fila inteira</button>
        </div>
        ${todas ? '' : '<p class="dica-fim">A masmorra está vazia. Erros cometidos nas expedições aparecem aqui.</p>'}
      </section>
    </main>`;
  },

  simulado: () => {
    const provas = provasDeSimulado().filter(p => E.simFiltro === 'todos' || (E.simFiltro === 'regular' ? p.apl === 'r' : p.apl !== 'r'));
    const ling = { ing: 'Inglês', esp: 'Espanhol', ambas: 'as duas línguas' }[E.save.cfg.lingua];
    const areas = ['LC', 'CH', 'CN', 'MT'];
    // o número de questões de cada área é o botão para fazer só aquela área
    const soArea = (p, a) => (p[a]
      ? `<button class="pilula num-sim" data-acao="simular" data-ano="${p.ano}" data-apl="${p.apl}" data-parte="${a}" title="Só ${REINOS[a].curto}: ${p[a]} questões, 3 minutos por questão">${p[a]}</button>`
      : '<span class="vazio">–</span>');
    const diaCompleto = (p, chave) => {
      const d = DIAS_SIMULADO[chave];
      const total = d.areas.reduce((t, a) => t + p[a], 0);
      return `<button class="pilula" data-acao="simular" data-ano="${p.ano}" data-apl="${p.apl}" data-parte="${chave}" ${total ? '' : 'disabled'}
        title="${d.areas.map(a => REINOS[a].curto).join(' e ')}, ${total} questões, com o tempo real: ${d.minutos === 330 ? '5h30' : '5h'}">${d.nome}</button>`;
    };
    return `${menu('simulado')}<main class="conteudo">
      <header class="cabecalho"><div><h1>Arena do Simulado</h1>
        <p>Prova real, na ordem original, com cronômetro e sem resposta na hora. O resultado sai ao final. Língua estrangeira: ${ling}.</p></div></header>
      <div class="grupo filtro-sim">${[['todos', 'Todas'], ['regular', 'Aplicação regular'], ['outras', 'Outras aplicações']].map(([v, t]) => `<button class="pilula ${E.simFiltro === v ? 'ativa' : ''}" data-acao="sim-filtro" data-v="${v}">${t}</button>`).join('')}</div>
      <div class="tabela-rolagem"><table class="tabela tabela-sim">
        <thead><tr><th>Prova</th>${areas.map(a => `<th class="num">${REINOS[a].curto}</th>`).join('')}<th>Prova completa</th></tr></thead>
        <tbody>${provas.map(p => `<tr>
          <th scope="row">Enem ${p.ano}<small>${ROTULO_APL[p.apl]}</small></th>
          ${areas.map(a => `<td class="num">${soArea(p, a)}</td>`).join('')}
          <td><div class="botoes-sim">${diaCompleto(p, 'dia1')}${diaCompleto(p, 'dia2')}</div></td></tr>`).join('')}</tbody></table></div>
      <p class="nota-rodape">Clique no número de questões de uma área para fazer só ela, com 3 minutos por questão. A prova completa segue o formato atual do Enem: 1º dia com Linguagens e Humanas (5h30, tempo que inclui a redação) e 2º dia com Natureza e Matemática (5h). As contagens mostram o que ficou no banco: anuladas não entram, e questões repetidas entre aplicações aparecem só uma vez. As provas de 2005 a 2008 eram únicas e misturavam áreas, por isso ficam só nas expedições.</p>
    </main>`;
  },

  redacao: () => telaRedacao(),
  grimorio: () => telaGrimorio(),
  inventario: () => telaInventario(),

  ajustes: () => {
    const c = E.save.cfg;
    return `${menu('ajustes')}<main class="conteudo estreito">
      <header class="cabecalho"><div><h1>Ajustes</h1></div></header>
      <section class="ajustes">
        <div class="grupo"><span>Língua estrangeira</span>${[['ing', 'Inglês'], ['esp', 'Espanhol'], ['ambas', 'As duas']].map(([v, t]) => `<button class="pilula ${c.lingua === v ? 'ativa' : ''}" data-acao="cfg" data-chave="lingua" data-v="${v}">${t}</button>`).join('')}</div>
        <div class="grupo"><span>Meta diária</span>${[10, 20, 30, 45].map(v => `<button class="pilula ${c.meta === v ? 'ativa' : ''}" data-acao="cfg" data-chave="meta" data-v="${v}">${v} questões</button>`).join('')}</div>
        <div class="grupo"><span>Papel da prova</span>${[['pergaminho', 'Pergaminho'], ['branco', 'Branco']].map(([v, t]) => `<button class="pilula ${c.papel === v ? 'ativa' : ''}" data-acao="cfg" data-chave="papel" data-v="${v}">${t}</button>`).join('')}</div>
        <div class="grupo"><span>Tamanho da questão</span>${[85, 100, 115, 130].map(v => `<button class="pilula ${c.zoom === v ? 'ativa' : ''}" data-acao="cfg" data-chave="zoom" data-v="${v}">${v}%</button>`).join('')}</div>
      </section>
      <section class="ajustes">
        <h2>Sobre as questões</h2>
        <p>${milhar(E.banco.length)} questões de Linguagens, Ciências Humanas, Ciências da Natureza e Matemática, de 2005 a 2025, recortadas das provas oficiais do INEP. ${E.relatorio ? `Ficaram fora ${E.relatorio.anuladas} anuladas pelo INEP, ${E.relatorio.divergentes} com gabaritos oficiais divergentes e ${E.relatorio.recorte} cujo recorte não ficou confiável.` : ''} Os gabaritos foram conferidos entre os PDFs oficiais e os microdados do INEP.</p>
        <p>Dificuldade: parâmetro da TRI publicado nos microdados, dividido em terços dentro de cada área. Provas de 2005 a 2008 não têm esse dado.</p>
        <button class="botao" data-acao="abrir-relatorio">Ver a lista do que ficou de fora</button>
      </section>
      ${secaoDev()}
      <section class="ajustes perigo">
        <h2>Recomeçar</h2>
        <p>Apaga personagem, XP e histórico. Não dá para desfazer.</p>
        <button class="botao perigoso" data-acao="pedir-reinicio">Apagar meu progresso</button>
      </section>
    </main>`;
  },
};

function origem(q) {
  const lingua = q.ling === 0 ? ' · Inglês' : (q.ling === 1 ? ' · Espanhol' : '');
  return `Enem ${q.ano} · ${ROTULO_APL[q.apl]} · Questão ${q.n}${lingua}`;
}
/* Mesma escala para todo recorte, para a letra da prova ter sempre o mesmo tamanho. */
function larguraRecorte(px, dpi) {
  return Math.round((px / dpi) * 72 * 1.75 * (E.save.cfg.zoom / 100));
}
function folha(q, marca = null) {
  const fora = marca ? [] : eliminadasDa(E.save?.atual, q.id); // alternativas tiradas por item
  const zonas = (idx) => LETRAS.map((l) => {
    const z = q.alt?.[l];
    if (!z || z[0] !== idx) return '';
    let cls = '';
    if (marca) {
      if (l === marca.certa) cls = 'certa';
      else if (l === marca.sua) cls = 'errada';
    } else if (fora.includes(l)) cls = 'eliminada';
    else if (E.selecao === l) cls = 'selecionada';
    const riscada = E.riscadas.has(l) ? 'riscada' : '';
    const dentro = marca || fora.includes(l) ? 'disabled' : `data-acao="marcar" data-letra="${l}"`;
    const [esq, dir] = z.length > 3 ? [z[3], z[4]] : [0, 1];
    const caixa = `top:${z[1] * 100}%;height:${(z[2] - z[1]) * 100}%;left:${esq * 100}%;width:${(dir - esq) * 100}%`;
    return `<button class="zona ${cls} ${riscada}" style="${caixa}" ${dentro} aria-label="Alternativa ${l}"></button>`;
  }).join('');
  return `<article class="folha papel-${E.save.cfg.papel}">
    ${q.img.map(([arquivo, w, h, apoio, dpi], i) => `<figure class="recorte ${apoio ? 'apoio' : ''}" style="width:min(100%, ${larguraRecorte(w, dpi)}px)">
      ${apoio ? '<figcaption>Texto de apoio</figcaption>' : ''}
      <div class="moldura"><img src="${BASE_BANCO}img/${arquivo}" width="${w}" height="${h}" alt="Enunciado da questão ${q.n}, recortado da prova oficial">${zonas(i)}</div>
    </figure>`).join('')}
  </article>`;
}
function blocoHabilidade(q) {
  const texto = q.hab ? E.matriz?.[q.area]?.habilidades?.[q.hab] : null;
  const regiao = q.comp ? REINOS[q.area].regioes[q.comp] : null;
  return `<div class="habilidade">
    ${regiao ? `<p><b>${regiao[0]}</b> · ${regiao[1]}</p>` : ''}
    ${texto ? `<p class="h-texto">H${q.hab}: ${esc(texto)}</p>` : ''}
    <p class="meta-q">Dificuldade: ${NIVEL[q.nivel]}${q.fontes === 2 ? ' · gabarito conferido em duas fontes oficiais' : ''}</p>
  </div>`;
}
function telaQuestao() {
  const s = E.save.atual;
  if (!s) return TELAS.mapa();
  const q = E.porId.get(s.ids[s.i]);
  const simulado = s.tipo === 'simulado';
  const sabio = s.tipo === 'sabio';
  const r = E.respostaAtual;
  const respondida = !simulado && s.respostas[q.id];
  const feitas = Object.keys(s.respostas).length;
  const vida = Math.max(0, s.ids.length - s.acertos);
  let direita = `<div class="guardiao-topo"><span>${esc(s.guardiao?.nome || '')}</span>${barra(vida, s.ids.length, 'vida')}</div>`;
  if (simulado) direita = `<div class="cronometro" id="cronometro">${ico('ampulheta')}<span></span></div>`;
  if (sabio) direita = cartaoInimigo(s.inimigo);
  return `<main class="tela-questao">
    <div class="area-questao">
      <header class="topo-q">
        <button class="voltar" data-acao="sair-sessao">${ico('seta')} Sair</button>
        <div class="titulo-q"><strong>${esc(s.titulo)}</strong><span>${origem(q)}</span></div>
        ${direita}
      </header>
      ${folha(q, respondida ? { sua: s.respostas[q.id], certa: q.gab } : null)}
    </div>
    <aside class="painel-resposta">
      <div class="progresso-q"><strong>${sabio ? `Questão ${s.i + 1} · Onda ${s.onda}` : `Questão ${s.i + 1} de ${s.ids.length}`}</strong>
        ${simulado ? `<span>${feitas} respondidas</span>` : `<span>${feitas ? `${pct(s.acertos, feitas)}% de acerto · ` : ''}${s.pontos} pts</span>`}</div>
      ${sabio ? `<p class="placar-sabio">${ico('espadas')} ${s.derrotados} ${s.derrotados === 1 ? 'inimigo derrotado' : 'inimigos derrotados'}${s.chefes ? ` · ${s.chefes} ${s.chefes === 1 ? 'chefe' : 'chefes'}` : ''}</p>`
        : barra(s.i + (respondida ? 1 : 0), s.ids.length, 'fina')}
      ${sabio && !respondida ? `<p class="frase-inimigo">“${esc(s.inimigo.frase)}”</p>` : ''}
      ${!simulado && s.seq >= 2 ? `<p class="sequencia">${ico('chama')} ${s.seq} seguidas</p>` : ''}
      ${!simulado && !respondida ? avisosDaQuestao(s, q) : ''}
      <div class="alternativas" role="radiogroup" aria-label="Alternativas">
        ${LETRAS.map((l) => {
          const fora = !respondida && eliminadasDa(s, q.id).includes(l);
          let cls = '';
          if (respondida) {
            if (l === q.gab) cls = 'certa';
            else if (l === s.respostas[q.id]) cls = 'errada';
          } else if (fora) cls = 'eliminada';
          else if (E.selecao === l) cls = 'selecionada';
          return `<button class="letra ${cls} ${E.riscadas.has(l) ? 'riscada' : ''}" role="radio" aria-checked="${E.selecao === l}" ${respondida || fora ? 'disabled' : `data-acao="marcar" data-letra="${l}"`} data-riscar="${l}" title="${fora ? 'Eliminada por um item' : 'Botão direito para riscar esta alternativa'}">${l}</button>`;
        }).join('')}
      </div>
      ${respondida ? painelRetorno(q, r, s) : `<button class="botao primario largo" data-acao="confirmar" ${E.selecao ? '' : 'disabled'}>${simulado ? 'Marcar e seguir' : 'Confirmar resposta'}</button>
        <p class="atalhos">Teclas A a E escolhem, Enter confirma. Botão direito risca uma alternativa.</p>
        ${simulado ? '' : bolsaQuestao(s, q)}`}
      ${simulado ? gradeSimulado(s) : ''}
      ${sabio ? `<button class="botao largo encerrar-jornada" data-acao="pedir-fim-sabio">${ico('coruja')} Encerrar a jornada</button>` : ''}
    </aside>
  </main>`;
}
function painelRetorno(q, r, s) {
  const certo = s.respostas[q.id] === q.gab;
  const sabio = s.tipo === 'sabio';
  const fim = !sabio && s.i >= s.ids.length - 1;
  let proximo = fim ? 'Ver resultado' : 'Próxima questão';
  if (sabio && s.inimigo.hp <= 0) proximo = 'Enfrentar o próximo inimigo';
  return `<div class="retorno ${certo ? 'ok' : 'erro'}">
      <p class="veredito">${ico(certo ? 'check' : 'xis')} ${certo ? 'Resposta certa' : `Resposta certa: ${q.gab}`}</p>
      ${r ? `<p class="ganho">${r.pontos ? `+${r.pontos} pontos · ` : ''}+${r.xp} XP</p>` : ''}
      ${certo ? '' : '<p class="ganho">Esta questão volta amanhã na revisão.</p>'}
      ${certo && ajudaNaQuestao(s, q.id) ? `<p class="ganho">${r?.segunda ? 'Acerto na segunda chance: vale metade, e a questão volta amanhã na revisão.' : 'Acerto com ajuda de item: vale metade.'}</p>` : ''}
      ${sabio && certo && s.inimigo.hp > 0 ? `<p class="ganho">Golpe certeiro! ${esc(s.inimigo.nome)} ainda tem ${s.inimigo.hp} de vida.</p>` : ''}
      ${sabio && !certo ? `<p class="ganho">${esc(s.inimigo.nome)} resistiu ao golpe.</p>` : ''}
    </div>
    ${r?.derrotou ? `<div class="vitoria-inimigo ${r.derrotou.chefe ? 'chefe' : ''}">${ico('espadas')}<div><strong>${r.derrotou.chefe ? 'Chefe derrotado' : 'Inimigo derrotado'}</strong>
      <span>${esc(r.derrotou.nome)} · +${r.derrotou.xp} XP</span></div></div>` : ''}
    ${eventosRetorno(r)}
    ${blocoHabilidade(q)}
    <button class="botao primario largo" data-acao="proxima">${proximo}</button>`;
}
function cartaoInimigo(ini) {
  const r = REINOS_INIMIGOS[ini.reino];
  const vidas = Array.from({ length: ini.hpMax }, (_, i) => `<i class="${i < ini.hp ? 'cheia' : ''}"></i>`).join('');
  return `<div class="inimigo-topo reino-${r.cor} ${ini.chefe ? 'chefe' : ''} ${ini.hp <= 0 ? 'derrotado' : ''}" title="${esc(ini.frase)}">
      <span class="onda">${ini.chefe ? 'Chefe · ' : ''}Onda ${ini.onda} · ${r.nome}</span>
      <strong>${esc(ini.nome)}</strong>
      <span class="vidas" role="img" aria-label="${ini.hp} de ${ini.hpMax} pontos de vida">${vidas}</span>
    </div>`;
}
function gradeSimulado(s) {
  return `<div class="grade-sim" aria-label="Mapa da prova">
      ${s.ids.map((id, i) => `<button class="${s.respostas[id] ? 'feita' : ''} ${i === s.i ? 'agora' : ''}" data-acao="pular" data-i="${i}">${i + 1}</button>`).join('')}
    </div>
    <button class="botao largo" data-acao="pedir-fim">Encerrar e ver resultado</button>`;
}
function atualizarCronometro() {
  const s = E.save.atual;
  const el = document.querySelector('#cronometro span');
  if (!s || !s.limite || !el) return;
  const restante = s.limite - (s.gasto + (Date.now() - s.inicio));
  el.textContent = duracao(restante);
  if (restante <= 0) { avisar('Tempo esgotado.'); concluirSessao(); }
}

/* ---- Torre da Redação ------------------------------------------------- */
function telaRedacao() {
  const abas = [['estrutura', 'Estrutura nota máxima'], ['competencias', 'As 5 competências'], ['proposta', 'Proposta de intervenção'],
                ['zero', 'O que zera'], ['exemplos', 'Temas e exemplos por ano'], ['documentos', 'Documentos oficiais']];
  const corpo = { estrutura: abaEstrutura, competencias: abaCompetencias, proposta: abaProposta, zero: abaZero, exemplos: abaExemplos, documentos: abaDocumentos }[E.torreAba]();
  return `${menu('redacao')}<main class="conteudo torre">
    <header class="cabecalho"><div><h1>Torre da Redação</h1>
      <p>Tudo aqui vem das publicações oficiais do INEP. Onde há fonte jornalística, ela é indicada.</p></div></header>
    <div class="abas" role="tablist">${abas.map(([id, nome]) => `<button role="tab" aria-selected="${E.torreAba === id}" class="aba ${E.torreAba === id ? 'ativa' : ''}" data-acao="aba" data-id="${id}">${nome}</button>`).join('')}</div>
    <section class="pergaminho">${corpo}</section>
  </main>`;
}
const FONTE_CARTILHA = '<p class="fonte">Fonte: INEP. A redação do Enem 2026: cartilha do participante. Resumo com outras palavras; páginas conforme a numeração impressa.</p>';
function abaEstrutura() {
  const g = GUIA_REDACAO;
  return `<h2>Como organizar o texto</h2>
    <div class="estrutura">${g.estrutura.map(p => `<article class="bloco bloco-${p.cor}">
      <h3>${p.nome}</h3><p class="funcao">${p.funcao}</p>
      <ul>${p.passos.map(t => `<li>${t}</li>`).join('')}</ul><small>${p.competencias}</small></article>`).join('')}</div>
    <p class="observacao">${g.avisoEstrutura}</p>
    <h2>Regras da prova</h2>
    <dl class="regras">${g.regras.map(([t, d, pag]) => `<div><dt>${t}</dt><dd>${d} <span class="pag">(${pag})</span></dd></div>`).join('')}</dl>
    <h2>Checklist antes de entregar</h2>
    <ul class="checklist">${g.checklist.map((t, i) => `<li><label><input type="checkbox" data-check="${i}" ${E.checklist.has(i) ? 'checked' : ''}> ${t}</label></li>`).join('')}</ul>
    ${FONTE_CARTILHA}`;
}
function abaCompetencias() {
  return `<h2>O que a banca avalia</h2><p>Cada competência vale até 200 pontos e tem seis níveis: 0, 40, 80, 120, 160 e 200.</p>
    <div class="competencias">${GUIA_REDACAO.competencias.map(c => `<article class="comp">
      <div class="comp-n">${c.n}</div><div>
      <h3>${c.titulo}</h3><p>${c.avalia}</p>
      <p class="nota-200"><b>Para 200 pontos:</b> ${c.nota200}</p>
      <ul>${c.cuidados.map(t => `<li>${t}</li>`).join('')}</ul><small>Cartilha 2026, ${c.pagina}</small></div></article>`).join('')}</div>${FONTE_CARTILHA}`;
}
function abaProposta() {
  const g = GUIA_REDACAO;
  return `<h2>Os cinco elementos da proposta completa</h2>
    <div class="elementos">${g.proposta.map(([n, p, d], i) => `<article><span>${i + 1}</span><h3>${n}</h3><p class="pergunta">${p}</p><p>${d}</p></article>`).join('')}</div>
    <h2>Propor não é constatar</h2>
    <p>A proposta indica uma ação para mudar a realidade. Constatar só descreve o problema. Dizer que "faltam investimentos" é constatação. Também evite propostas vagas e condicionais, como "se x for feito, o resultado poderá ser y" (p. 36).</p>
    <h2>Direitos humanos</h2><p>${g.direitosHumanos} Uma proposta assim recebe 0 na Competência V (p. 38).</p>${FONTE_CARTILHA}`;
}
function abaZero() {
  return `<h2>Situações que levam à nota 0</h2>
    <ul class="zero">${GUIA_REDACAO.notaZero.map(t => `<li>${ico('xis')} ${t}</li>`).join('')}</ul>
    <p class="observacao">Linhas copiadas da prova ou do caderno de questões não contam para o mínimo de linhas (p. 8). O texto deve ter até 30 linhas, conforme as instruções da própria prova.</p>${FONTE_CARTILHA}`;
}
function abaDocumentos() {
  return `<h2>Documentos oficiais do INEP nesta pasta</h2>
    <p>Abrem no seu leitor de PDF. Ficam na pasta <code>documentos_redacao</code>, junto de todas as Cartilhas usadas nos exemplos.</p>
    <div class="documentos">${GUIA_REDACAO.documentos.map(([arq, nome]) => `<button class="doc" data-acao="abrir-pdf" data-arquivo="${arq}">${ico('livro')}<span>${nome}</span></button>`).join('')}</div>`;
}
function abaExemplos() {
  const anos = E.redacao;
  const ano = E.torreAno || anos[0]?.ano;
  const item = anos.find(a => a.ano === ano);
  if (!item) return '<p>Material de redação indisponível.</p>';
  return `<div class="anos-torre">
    <nav class="lista-anos" aria-label="Anos">${anos.map(a => `<button class="${a.ano === ano ? 'ativa' : ''}" data-acao="ano-torre" data-ano="${a.ano}">${a.ano}${a.exemplos.length ? `<small>${a.exemplos.length} ${a.exemplos.length === 1 ? 'exemplo' : 'exemplos'}</small>` : ''}</button>`).join('')}</nav>
    <div class="detalhe-ano">
      <h2>Enem ${item.ano}</h2>
      <h3>Tema e proposta</h3>
      ${item.temas.map((t, i) => `<div class="tema"><p class="titulo-tema">${esc(t.tema)}</p><small>${t.aplicacao}</small>
        <button class="botao pequeno" data-acao="ver-proposta" data-ano="${item.ano}" data-i="${i}">Ver a proposta completa</button></div>`).join('')}
      <h3>Exemplos de redação</h3>
      ${item.exemplos.map((x, i) => {
        const lida = E.save.lidas[`${item.ano}-${i}`];
        return `<div class="exemplo"><div><strong>${x.titulo}</strong> <span class="selo-nota ${x.selo.startsWith('Nota') ? 'mil' : 'boa'}">${x.selo}</span>
          <small>${esc(x.fonte)}</small></div>
          <button class="botao pequeno" data-acao="ver-exemplo" data-ano="${item.ano}" data-i="${i}">${lida ? 'Ler de novo' : `Ler (+${XP_LEITURA} XP)`}</button></div>`;
      }).join('')}
      ${item.link ? `<div class="exemplo"><div><strong>${esc(item.link.titulo)}</strong><small>${esc(item.link.fonte)}</small><small>${esc(item.link.nota)}</small></div>
        <button class="botao pequeno" data-acao="abrir-link" data-ano="${item.ano}">Abrir no navegador</button></div>` : ''}
      ${item.aviso ? `<p class="observacao">${esc(item.aviso)}</p>` : ''}
    </div></div>`;
}
function abrirLeitor(titulo, subtitulo, paginas, fonte, arquivo) {
  E.modal = { tipo: 'leitor', titulo, subtitulo, paginas, fonte, arquivo };
  renderModal();
}

/* ---- Grimório --------------------------------------------------------- */
function telaGrimorio() {
  const S = E.save;
  const total = totalRespondidas();
  const acertos = Object.values(S.dias).reduce((s, d) => s + d.a, 0);
  const sess = S.sessoes.slice(-20);
  const linhas = [];
  for (const area of Object.keys(REINOS)) {
    for (const [n, [nome, sub]] of Object.entries(REINOS[area].regioes)) {
      linhas.push({ area, nome, sub, ...resumoArea(area, Number(n)) });
    }
  }
  const comDados = linhas.filter(l => l.tentativas >= 3).sort((a, b) => a.acertos / a.tentativas - b.acertos / b.tentativas);
  const foco = comDados[0];
  return `${menu('grimorio')}<main class="conteudo">
    <header class="cabecalho"><div><h1>Grimório</h1><p>O registro da sua jornada.</p></div></header>
    <dl class="tiles">
      <div><dt>Questões respondidas</dt><dd>${milhar(total)}</dd></div>
      <div><dt>Acerto geral</dt><dd>${total ? pct(acertos, total) + '%' : 'sem dados'}</dd></div>
      <div><dt>Melhor sequência</dt><dd>${S.melhorSeq}</dd></div>
      <div><dt>Recorde de dias seguidos</dt><dd>${S.seqDias.melhor}</dd></div>
    </dl>
    ${foco ? `<p class="foco">${ico('alvo')} Maior oportunidade agora: <b>${foco.sub}</b> (${foco.nome}), com ${pct(foco.acertos, foco.tentativas)}% de acerto.</p>` : ''}
    <section class="cartao"><h2>Acerto por sessão</h2><p class="sub">Últimas ${sess.length || 20} sessões</p>${graficoSessoes(sess)}</section>
    <section class="cartao"><h2>Competências</h2>
      <div class="tabela-rolagem"><table class="tabela comp-tabela"><thead><tr><th>Região</th><th>Acerto</th><th>Dominadas</th></tr></thead>
      <tbody>${linhas.map(l => `<tr><th scope="row">${l.nome}<small>${REINOS[l.area].curto} · ${l.sub}</small></th>
        <td><div class="medidor">${l.tentativas ? `${barra(l.acertos, l.tentativas, 'fina')}<span>${pct(l.acertos, l.tentativas)}%</span>` : '<span class="vazio">sem dados</span>'}</div></td>
        <td>${l.dominadas} de ${l.total}</td></tr>`).join('')}</tbody></table></div>
    </section>
    <section class="cartao"><h2>Conquistas</h2>
      <p class="sub">${CONQUISTAS.filter(c => S.conquistas[c.id]).length} de ${CONQUISTAS.length}. Cada uma libera um título para o seu herói; os graus vão do Bronze ao Lendário.</p>
      ${Object.entries(GRAUS).map(([g, nome]) => {
        const lista = CONQUISTAS.filter(c => c.grau === Number(g));
        const feitas = lista.filter(c => S.conquistas[c.id]).length;
        return `<h3 class="grau grau-${g}"><span></span>${nome} <small>${feitas} de ${lista.length} · +${XP_CONQUISTA[g]} XP cada</small></h3>
        <div class="conquistas">${lista.map(c => `<div class="conquista grau-${g} ${S.conquistas[c.id] ? 'feita' : ''}">${ico(S.conquistas[c.id] ? 'medalha' : 'cadeado')}
          <div><strong>${c.nome}</strong><p>${c.texto}</p><small>Título: ${c.titulo}</small></div></div>`).join('')}</div>`;
      }).join('')}
    </section>
    <section class="cartao"><h2>Histórico de sessões</h2>
      ${S.sessoes.length ? `<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Dia</th><th>Sessão</th><th>Acerto</th><th>Pontos</th><th>XP</th><th>Tempo</th></tr></thead>
      <tbody>${S.sessoes.slice(-30).reverse().map(s => `<tr><td>${s.dia.split('-').reverse().join('/')}</td><th scope="row">${esc(s.titulo)}</th><td>${pct(s.acertos, s.total)}% (${s.acertos}/${s.total})</td><td>${s.pontos}</td><td>${s.xp}</td><td>${duracao(s.tempo)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="vazio">Conclua uma expedição para ver seu histórico aqui.</p>'}
    </section>
  </main>`;
}
function graficoSessoes(lista) {
  if (!lista.length) return '<p class="vazio">Conclua uma expedição para ver seu gráfico aqui.</p>';
  return `<div class="grafico" role="img" aria-label="Porcentagem de acerto das últimas sessões">
    <div class="grade-g"><span style="bottom:100%">100%</span><span style="bottom:50%">50%</span></div>
    <div class="colunas">${lista.map((s, i) => {
      const v = pct(s.acertos, s.total);
      const ultima = i === lista.length - 1;
      return `<div class="coluna" tabindex="0" data-dica="${s.dia.split('-').reverse().join('/')} · ${esc(s.titulo)} · ${v}% (${s.acertos}/${s.total})">
        ${ultima ? `<em style="bottom:calc(${v}% + 4px)">${v}%</em>` : ''}<span style="height:${Math.max(v, 1)}%"></span></div>`;
    }).join('')}</div></div>`;
}

/* ---- mapa ------------------------------------------------------------- */
/* Atlas dos reinos. Cada lugar é desenhado em volta do próprio ponto de base (0, 0) e posto no
   mapa com translate; a faixa com o nome fica logo abaixo e ajustarFaixas() a mede pelo texto.
   A roda do mouse aproxima e afasta; com o mapa aproximado, arrastar move a vista.

   O mundo é uma grade de três faixas com a Torre da Redação no meio, e cada casa da grade
   comporta um lugar do tamanho do castelo (uns 300 de largura e 290 de altura com a faixa).
   As duas casas de cima nas pontas eram VAGAS_MAPA e hoje abrigam os reinos do 2º dia
   (Natureza e Números).

   Para pôr um reino novo no mapa:
   1. desenhe o lugar numa função como castelo() ou templo(), em volta de (0, 0), com a faixa
      do nome no fim (faixa(titulo, sub, dy, cor) e a cor em COR_REINO);
   2. crie uma vaga em VAGAS_MAPA onde houver espaço e acrescente o lugar em LUGARES_MAPA com
      o x e o y dela e o id dela em "vaga": enquanto nenhum lugar ocupa a vaga, ela aparece
      sob névoa como "Terras não mapeadas";
   3. se quiser, dê a ele uma estrada até as outras em ESTRADAS_MAPA. */
const MAPA = { w: 1400, h: 1040 };
const ZOOM_MAX = 3;
const ESCALA_LUGAR = 1.1;
const ILHA = 'M118 620C108 520 118 420 150 330C180 240 230 170 300 132C380 96 500 84 590 66C640 54 670 44 700 44C730 44 760 54 810 66C900 84 1020 96 1100 132C1170 170 1220 240 1250 330C1282 420 1300 520 1298 620C1296 700 1300 780 1272 860C1244 940 1180 990 1090 1004C1000 1016 930 1012 860 1000C810 990 760 970 700 970C640 970 590 990 540 1000C470 1012 380 1006 310 990C240 975 170 930 140 850C126 780 120 700 118 620Z';
const COR_REINO = {
  letras: ['#2f4f8f', '#1f3768'], humanas: ['#9c3f27', '#6c2918'], sabio: ['#5b3a8c', '#3d2664'],
  torre: ['#26375e', '#172443'], masmorra: ['#433d4c', '#29252f'], arena: ['#8d2f2f', '#5f1f1f'],
  natureza: ['#3f7a3e', '#2a5229'], numeros: ['#1f6f78', '#134a50'],
};
/* Lugares do mapa. "desenho" recebe o resumo de progresso e devolve o SVG do lugar;
   "acao" e "dados" viram data-acao e data-* do botão, como no resto do jogo. */
const LUGARES_MAPA = [
  { id: 'sabio', x: 700, y: 282, nome: 'Reino do Sábio, todas as questões', acao: 'ir', dados: { tela: 'sabio' },
    desenho: p => observatorio(p.sabio.melhorOnda ? `Jornada sem fim · melhor onda ${p.sabio.melhorOnda}` : 'Jornada sem fim · todas as questões') },
  { id: 'letras', x: 275, y: 640, nome: 'Reino das Letras, Linguagens', acao: 'reino', dados: { area: 'LC' },
    desenho: p => castelo(`Linguagens · ${pct(p.lc.dominadas, p.lc.total)}% dominado`) },
  { id: 'humanidades', x: 1115, y: 640, nome: 'Reino das Humanidades, Ciências Humanas', acao: 'reino', dados: { area: 'CH' },
    desenho: p => templo(`Ciências Humanas · ${pct(p.ch.dominadas, p.ch.total)}% dominado`) },
  { id: 'torre', x: 700, y: 660, nome: 'Torre da Redação', acao: 'ir', dados: { tela: 'redacao' }, desenho: () => torreRedacao() },
  { id: 'masmorra', x: 420, y: 895, nome: p => `Masmorra dos Erros, ${p.fila} para rever hoje`, acao: 'ir', dados: { tela: 'revisao' },
    desenho: p => masmorra(p.fila) },
  { id: 'arena', x: 1010, y: 885, nome: 'Arena do Simulado', acao: 'ir', dados: { tela: 'simulado' }, desenho: () => coliseu() },
  // reinos do 2º dia de prova, nas duas vagas do norte
  { id: 'numeros', vaga: 'noroeste', x: 330, y: 320, nome: 'Reino dos Números, Matemática', acao: 'reino', dados: { area: 'MT' },
    desenho: p => cidadela(`Matemática · ${pct(p.mt.dominadas, p.mt.total)}% dominado`) },
  { id: 'natureza', vaga: 'nordeste', x: 1070, y: 320, nome: 'Reino da Natureza, Ciências da Natureza', acao: 'reino', dados: { area: 'CN' },
    desenho: p => estufa(`Ciências da Natureza · ${pct(p.cn.dominadas, p.cn.total)}% dominado`) },
];
/* Terras reservadas para reinos: ficam sob névoa até um lugar ocupar a vaga. x e y são o ponto
   de base do lugar, como em LUGARES_MAPA. */
const VAGAS_MAPA = [
  { id: 'noroeste', x: 330, y: 320, montanhas: [[-40, -50, 1.2], [15, -75, 1], [60, -38, .8]] },
  { id: 'nordeste', x: 1070, y: 320, montanhas: [[-60, -38, .8], [-15, -75, 1], [40, -50, 1.2]] },
];
/* O rio desce do lago, passa entre a Torre e as Humanidades e deságua na baía do sul. */
const RIO = 'M925 490C945 570 940 660 920 730C900 790 800 880 740 972';
/* Estradas até a Torre, no centro. "ponte" marca onde a estrada cruza o rio. Os reinos do norte
   entram nas estradas do Sábio (Números) e das Humanidades (Natureza, por fora do lago). */
const ESTRADAS_MAPA = [
  { de: 'numeros', d: 'M452 352C512 364 576 394 621 432' },
  { de: 'natureza', d: 'M958 362C988 410 1002 470 994 530C988 576 976 610 960 633' },
  { de: 'letras', d: 'M405 630C480 640 570 652 642 654' },
  { de: 'sabio', d: 'M640 372C612 440 604 540 624 610C630 632 636 646 642 654' },
  { de: 'masmorra', d: 'M526 836C526 786 528 736 540 706C552 676 598 660 642 654' },
  { de: 'humanidades', d: 'M1000 630C940 636 840 650 760 656', ponte: [937, 637, -5] },
  { de: 'arena', d: 'M905 812C890 784 870 754 866 726C866 696 846 668 760 656', ponte: [889, 784, 60] },
];
const f1 = n => Number(n.toFixed(1));

function arvore(x, y, e = 1, redonda = false) {
  if (redonda) {
    return `<g transform="translate(${x} ${y}) scale(${e})"><rect x="-1.8" y="-5" width="3.6" height="10" fill="#6b4c30"/>
      <circle cy="-12" r="9" fill="#5d8a55"/><circle cx="-3" cy="-14" r="5.5" fill="#72a167"/><circle cx="3.5" cy="-9" r="5" fill="#4d7848"/></g>`;
  }
  return `<g transform="translate(${x} ${y}) scale(${e})"><rect x="-1.6" y="-1" width="3.2" height="7" fill="#6b4c30"/>
    <path d="M0 -24L10 0H-10Z" fill="#4f7d52"/><path d="M0 -24L10 0H0Z" fill="#3e6743"/>
    <path d="M0 -31L7.5 -10H-7.5Z" fill="#5f9161"/><path d="M0 -31L7.5 -10H0Z" fill="#4b794f"/></g>`;
}
function montanha(x, y, e = 1, neve = true) {
  return `<g transform="translate(${x} ${y}) scale(${e})">
    <path d="M-34 0L-4 -52L30 0Z" fill="#bcab88"/><path d="M-4 -52L30 0H6Z" fill="#9b8a69"/>
    <g stroke="#7a6a4e" stroke-width=".9" opacity=".5"><path d="M3 -36l9 13M7 -25l10 13M11 -14l9 12"/></g>
    ${neve ? '<path d="M-4 -52L-15 -33L-9 -36L-4 -31L1 -36L7 -34Z" fill="#f6f1e6"/>' : ''}</g>`;
}
function colina(x, y, w) {
  return `<path d="M${x - w} ${y}Q${x} ${y - w * 0.62} ${x + w} ${y}Z" fill="#d6c291" stroke="#a48a5c" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M${x + w * 0.2} ${y - w * 0.22}l${w * 0.25} ${w * 0.16}M${x + w * 0.35} ${y - w * 0.1}l${w * 0.25} ${w * 0.1}" stroke="#a48a5c" stroke-width=".9" opacity=".6"/>`;
}
function pedra(x, y, e = 1) {
  return `<g transform="translate(${x} ${y}) scale(${e})"><path d="M-12 0L-9 -9L-2 -13L7 -10L12 -3L11 0Z" fill="#8c8594" stroke="#5a5364" stroke-width="1"/>
    <path d="M-2 -13L7 -10L12 -3L3 -5Z" fill="#a39cab"/></g>`;
}
function tufo(x, y) {
  return `<path d="M${x - 4} ${y}q1-5 3-7q0 4 1 7q1-5 4-6q-1 3-1 6" stroke="#8b9a5c" fill="none" stroke-width="1.1" stroke-linecap="round"/>`;
}
function bandeira(x, y, h, cor, escuro, simbolo = '') {
  return `<g transform="translate(${x} ${y})"><path d="M0 0V${-h}" stroke="#5b4a33" stroke-width="2" stroke-linecap="round"/>
    <path d="M1 ${-h + 1}C8 ${-h - 2} 14 ${-h + 3} 24 ${-h}L19 ${-h + 7}L24 ${-h + 14}C14 ${-h + 17} 8 ${-h + 12} 1 ${-h + 15}Z" fill="${cor}" stroke="${escuro}" stroke-width="1"/>
    ${simbolo}<circle cy="${-h - 2}" r="2.2" fill="#d8b25a"/></g>`;
}
function estandarte(x, cor, escuro) {
  return `<g transform="translate(${x} 2)"><path d="M0 0V-100" stroke="#5b4a33" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M-11 -96H11" stroke="#5b4a33" stroke-width="2" stroke-linecap="round"/>
    <path d="M-9 -95H9V-56L0 -48L-9 -56Z" fill="${cor}" stroke="${escuro}" stroke-width="1.2"/>
    <circle cy="-74" r="5" fill="none" stroke="#e3c27a" stroke-width="1.5"/><path d="M-3 -74h6M0 -77v6" stroke="#e3c27a" stroke-width="1.2"/>
    <circle cy="-102" r="2.4" fill="#d8b25a"/></g>`;
}
/* Faixa de pano com o nome do lugar e uma etiqueta de pergaminho embaixo. */
function faixa(titulo, sub, dy, cor) {
  const [c1, c2] = COR_REINO[cor];
  return `<g class="faixa" transform="translate(0 ${dy})">
    <path class="cauda-e" fill="${c2}"/><path class="cauda-d" fill="${c2}"/>
    <path class="dobra-e" fill="#000" opacity=".35"/><path class="dobra-d" fill="#000" opacity=".35"/>
    <rect class="banda" y="-14" height="28" fill="${c1}" stroke="${c2}" stroke-width="1"/>
    <rect class="banda-luz" y="-12" height="2.5" fill="#fff" opacity=".14"/>
    <text class="f1" y="5.5" text-anchor="middle">${titulo}</text>
    <g class="etiqueta" transform="translate(0 26)"><rect class="etq" y="-10" height="20" rx="4"/>
      <text class="f2" y="4" text-anchor="middle">${sub}</text></g></g>`;
}
function ajustarFaixas() {
  document.querySelectorAll('.mapa .faixa').forEach((g) => {
    const t = g.querySelector('.f1').getBBox();
    const w = Math.max(130, t.width + 40);
    const x0 = -w / 2; const x1 = w / 2;
    for (const sel of ['.banda', '.banda-luz']) {
      const r = g.querySelector(sel);
      r.setAttribute('x', sel === '.banda' ? x0 : x0 + 4);
      r.setAttribute('width', sel === '.banda' ? w : w - 8);
    }
    g.querySelector('.cauda-e').setAttribute('d', `M${f1(x0 + 10)} -6H${f1(x0 - 22)}L${f1(x0 - 13)} 7L${f1(x0 - 22)} 20H${f1(x0 + 10)}Z`);
    g.querySelector('.cauda-d').setAttribute('d', `M${f1(x1 - 10)} -6H${f1(x1 + 22)}L${f1(x1 + 13)} 7L${f1(x1 + 22)} 20H${f1(x1 - 10)}Z`);
    g.querySelector('.dobra-e').setAttribute('d', `M${f1(x0)} 14L${f1(x0 + 10)} 20V14Z`);
    g.querySelector('.dobra-d').setAttribute('d', `M${f1(x1)} 14L${f1(x1 - 10)} 20V14Z`);
    const s = g.querySelector('.f2').getBBox();
    const tag = g.querySelector('.etq');
    tag.setAttribute('x', f1(-(s.width + 20) / 2));
    tag.setAttribute('width', f1(s.width + 20));
  });
}

/* ---- os lugares ---- */
function castelo(sub) {
  let ameias = '';
  for (let x = -76; x <= 68; x += 13) ameias += `<rect x="${x}" y="-53" width="8" height="7" fill="#e3d8bd" stroke="#6b5a3f" stroke-width="1.3"/>`;
  const janela = ([x, y]) => `<path d="M${x - 4} ${y + 9}V${y}a4 4 0 0 1 8 0V${y + 9}Z" fill="#f3c86b" stroke="#6b5a3f" stroke-width="1.2"/>`;
  const telhado = (x, y, w, h) => `<path d="M${x - w} ${y}L${x} ${y - h}L${x + w} ${y}Z" fill="#3a5a9c" stroke="#1f3768" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x} ${y - h}L${x + w} ${y}H${x}Z" fill="#26407a"/>`;
  return `<ellipse cy="4" rx="106" ry="15" fill="#2a2010" opacity=".16"/>
    <rect x="-96" y="-88" width="30" height="90" fill="#d9ccae" stroke="#6b5a3f" stroke-width="1.8"/>
    <rect x="66" y="-88" width="30" height="90" fill="#d9ccae" stroke="#6b5a3f" stroke-width="1.8"/>
    <path d="M-76 2V-46H76V2Z" fill="#e3d8bd" stroke="#6b5a3f" stroke-width="1.8"/>${ameias}
    <path d="M-70 -30H-34M34 -30H70M-70 -15H-40M40 -15H70" stroke="#c2b493" stroke-width="1"/>
    ${telhado(-81, -88, 20, 38)}${telhado(81, -88, 20, 38)}
    <rect x="-28" y="-106" width="56" height="108" fill="#ebe1c8" stroke="#6b5a3f" stroke-width="1.8"/>
    ${telhado(0, -106, 36, 54)}<path d="M-36 -106H36" stroke="#d8b25a" stroke-width="3"/>
    ${[[-81, -68], [81, -68], [-81, -42], [81, -42], [-13, -94], [13, -94]].map(janela).join('')}
    <path d="M-13 -72h26v12c0 9-7 14-13 17c-6-3-13-8-13-17Z" fill="#2f4f8f" stroke="#d8b25a" stroke-width="1.8"/>
    <path d="M-8 -66c3-1 6-.5 8 1c2-1.5 5-2 8-1v9c-3-1-6-.5-8 1c-2-1.5-5-2-8-1Z" fill="#f6efd9"/><path d="M0 -65v9" stroke="#2f4f8f" stroke-width="1"/>
    <path d="M-14 2V-22a14 14 0 0 1 28 0V2Z" fill="#4a3524" stroke="#6b5a3f" stroke-width="1.8"/>
    <path d="M-7 2V-28M0 2V-31M7 2V-28" stroke="#2c1f14" stroke-width="1.4"/>
    ${bandeira(0, -160, 26, '#2f4f8f', '#1f3768', '<path d="M7 -16c4-5 8-7 12-7c-3 5-7 8-12 9Z" fill="#e3c27a"/>')}
    ${bandeira(-81, -126, 18, '#2f4f8f', '#1f3768')}${bandeira(81, -126, 18, '#2f4f8f', '#1f3768')}
    ${faixa('Reino das Letras', sub, 38, 'letras')}`;
}
function templo(sub) {
  const colunas = [-60, -36, -12, 12, 36, 60].map(x => `<rect x="${x - 6}" y="-74" width="12" height="56" fill="#f1e7d2" stroke="#7a6748" stroke-width="1.3"/>
    <path d="M${x - 2.5} -72V-20M${x + 2.5} -72V-20" stroke="#d3c6a6" stroke-width="1"/>
    <rect x="${x - 8}" y="-78" width="16" height="5" fill="#e6dcc2" stroke="#7a6748" stroke-width="1.2"/>
    <rect x="${x - 8}" y="-20" width="16" height="4" fill="#e6dcc2" stroke="#7a6748" stroke-width="1.2"/>`).join('');
  return `<ellipse cy="4" rx="116" ry="15" fill="#2a2010" opacity=".16"/>
    ${estandarte(-104, '#9c3f27', '#6c2918')}${estandarte(104, '#9c3f27', '#6c2918')}
    <rect x="-92" y="-6" width="184" height="9" fill="#e2d6bb" stroke="#7a6748" stroke-width="1.5"/>
    <rect x="-84" y="-14" width="168" height="8" fill="#e9dfc6" stroke="#7a6748" stroke-width="1.5"/>
    <rect x="-76" y="-18" width="152" height="5" fill="#efe6d0" stroke="#7a6748" stroke-width="1.3"/>
    <rect x="-72" y="-74" width="144" height="56" fill="#cbbd9c"/>${colunas}
    <rect x="-82" y="-90" width="164" height="12" fill="#ece2cb" stroke="#7a6748" stroke-width="1.5"/>
    <path d="M-82 -84H82" stroke="#b4532f" stroke-width="2.5"/>
    <path d="M-90 -90L0 -128L90 -90Z" fill="#f1e7d2" stroke="#7a6748" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-76 -93L0 -122L76 -93Z" fill="none" stroke="#b4532f" stroke-width="1.6"/>
    <path d="M-5 -115h10l-10 13h10Z" fill="none" stroke="#9c3f27" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M-24 -98c4-7 10-10 16-10M24 -98c-4-7-10-10-16-10" fill="none" stroke="#7d8f4a" stroke-width="2.2" stroke-linecap="round"/>
    <circle cy="-131" r="3.2" fill="#b4532f"/><path d="M-90 -90l-6-6M90 -90l6-6" stroke="#b4532f" stroke-width="2.5" stroke-linecap="round"/>
    <g transform="translate(128 2)"><path d="M-7 0L-5 -62H5L7 0Z" fill="#e3d6b6" stroke="#7a6748" stroke-width="1.3"/>
      <path d="M-5 -62L0 -73L5 -62Z" fill="#d8b25a" stroke="#7a6748" stroke-width="1.2"/>
      <path d="M-1 -52v4M1 -42v5M-1 -31v4M1 -20v4" stroke="#9a8a6b" stroke-width="1.2"/></g>
    ${faixa('Reino das Humanidades', sub, 38, 'humanas')}`;
}
function corujaMini() {
  return `<circle cx="-2.6" cy="-8" r="2.3" fill="#f4dc8e"/><circle cx="2.6" cy="-8" r="2.3" fill="#f4dc8e"/>
    <circle cx="-2.6" cy="-8" r=".9" fill="#2f1f52"/><circle cx="2.6" cy="-8" r=".9" fill="#2f1f52"/>
    <path d="M-5 -12.5l2 2M5 -12.5l-2 2M-1 -4.5l1 1.6 1-1.6" stroke="#f4dc8e" stroke-width="1" fill="none"/>`;
}
function observatorio(sub) {
  const estrelas = [[-28, -102], [-14, -116], [4, -110], [20, -120], [31, -100], [-6, -98], [14, -96], [-36, -92], [36, -90]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="#f4dc8e"/>`).join('');
  const brilho = ([x, y, r]) => `<path d="M${x} ${y - r}L${f1(x + r * .27)} ${f1(y - r * .27)}L${x + r} ${y}L${f1(x + r * .27)} ${f1(y + r * .27)}L${x} ${y + r}L${f1(x - r * .27)} ${f1(y + r * .27)}L${x - r} ${y}L${f1(x - r * .27)} ${f1(y - r * .27)}Z" fill="#d7f2ff" opacity=".9"/>`;
  return `<ellipse cy="4" rx="104" ry="15" fill="#20152e" opacity=".2"/>
    <path d="M-98 4L-82 -18L-58 -30L-20 -35L24 -35L62 -28L86 -16L100 4Z" fill="#938aa8" stroke="#4e4466" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M24 -35L62 -28L86 -16L100 4H36Z" fill="#7a7191" opacity=".75"/>
    <path d="M-58 -30L-42 4M-20 -35L-14 4M62 -28L72 4" stroke="#6f6688" stroke-width="1.2"/>
    ${[-66, 66].map(x => `<rect x="${x - 8}" y="-112" width="16" height="80" fill="#dcd5e6" stroke="#4e4466" stroke-width="1.5"/>
      <path d="M${x - 10} -112a10 12 0 0 1 20 0Z" fill="#4b3478" stroke="#2f1f52" stroke-width="1.4"/>
      <path d="M${x} -124V-133" stroke="#c9b27a" stroke-width="1.8" stroke-linecap="round"/><circle cx="${x}" cy="-135" r="2.6" fill="#c9b27a"/>
      <path d="M${x - 3} -96V-88a3 3 0 0 1 6 0V-96Z" fill="#8fdcff"/>
      <g transform="translate(${x} -52)"><path d="M-7 -20H7V8L0 14L-7 8Z" fill="#5b3a8c" stroke="#3d2664" stroke-width="1"/>${corujaMini()}</g>`).join('')}
    <rect x="-48" y="-84" width="96" height="50" fill="#e4dded" stroke="#4e4466" stroke-width="1.6"/>
    ${[-34, -18, 18, 34].map(x => `<path d="M${x} -38V-76" stroke="#c4bbd3" stroke-width="2.2"/>`).join('')}
    <path d="M-12 -34V-54a12 12 0 0 1 24 0V-34Z" fill="#1d2a4e" stroke="#4e4466" stroke-width="1.5"/>
    <path d="M-12 -34V-54a12 12 0 0 1 24 0V-34Z" fill="url(#m-portal)"/>
    <rect x="-55" y="-90" width="110" height="7" rx="2" fill="#c9b27a" stroke="#7d6a3c" stroke-width="1.2"/>
    <path d="M-50 -90A50 50 0 0 1 50 -90Z" fill="url(#m-cupula)" stroke="#2f1f52" stroke-width="1.6"/>
    <path d="M-28 -90Q-24 -128 0 -140M28 -90Q24 -128 0 -140" fill="none" stroke="#9d84d6" stroke-width="1" opacity=".55"/>
    ${estrelas}
    <circle cy="-152" r="26" fill="url(#m-halo)"/>
    <path d="M0 -140V-145" stroke="#c9b27a" stroke-width="2.2"/>
    <circle cy="-153" r="8.5" fill="url(#m-orbe)" stroke="#e6f7ff" stroke-width="1"/>
    <path d="M16 -170a8 8 0 1 0 7 12a6.5 6.5 0 1 1-7-12Z" fill="#f4dc8e"/>
    ${[[-62, -150, 6], [72, -142, 5], [-40, -174, 4.5], [50, -178, 4], [-82, -122, 3.5], [86, -110, 3.5]].map(brilho).join('')}
    ${faixa('Reino do Sábio', sub, 34, 'sabio')}`;
}
function torreRedacao() {
  const janela = ([x, y]) => `<path d="M${x - 4} ${y + 10}V${y}a4 4 0 0 1 8 0V${y + 10}Z" fill="#f3c86b" stroke="#6b5a3f" stroke-width="1.2"/>`;
  return `<ellipse cy="4" rx="70" ry="12" fill="#2a2010" opacity=".16"/>
    <rect x="-30" y="-14" width="60" height="16" fill="#d4c7aa" stroke="#6b5a3f" stroke-width="1.6"/>
    <path d="M-23 -14L-16 -100H16L23 -14Z" fill="#e3d8bf" stroke="#6b5a3f" stroke-width="1.7" stroke-linejoin="round"/>
    <path d="M-21 -38H21M-19 -62H19M-17 -84H17" stroke="#c9bb9a" stroke-width="1"/>
    ${[[-6, -54], [6, -78]].map(janela).join('')}
    <rect x="-25" y="-106" width="50" height="7" fill="#d4c7aa" stroke="#6b5a3f" stroke-width="1.5"/>
    ${[-23, -12, -1, 10].map(x => `<rect x="${x}" y="-112" width="7" height="6" fill="#d4c7aa" stroke="#6b5a3f" stroke-width="1.2"/>`).join('')}
    <rect x="-16" y="-132" width="32" height="26" fill="#ebe1c8" stroke="#6b5a3f" stroke-width="1.6"/>
    ${janela([0, -124])}
    <path d="M-22 -132L0 -166L22 -132Z" fill="#33497a" stroke="#172443" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 -166L22 -132H0Z" fill="#26375e"/>
    <path d="M0 -166V-172" stroke="#8a6a2c" stroke-width="1.6"/><path d="M0 -172C4 -176 9 -178 13 -178C10 -175 6 -172 0 -172Z" fill="#e8c766" stroke="#8a6a2c" stroke-width=".8"/>
    <path d="M-8 2V-10a8 8 0 0 1 16 0V2Z" fill="#4a3524" stroke="#6b5a3f" stroke-width="1.4"/>
    <g transform="translate(46 0)"><ellipse cy="-1" rx="11" ry="4" fill="#1d2233"/>
      <path d="M-10 -1V-14a10 4 0 0 1 20 0V-1Z" fill="#2a3148" stroke="#151926" stroke-width="1.2"/>
      <ellipse cy="-14" rx="10" ry="3.5" fill="#3b4566" stroke="#151926" stroke-width="1"/><ellipse cy="-14" rx="4.5" ry="1.6" fill="#0e1220"/>
      <path d="M-1 -15C4 -30 12 -44 22 -54C17 -42 10 -28 3 -15Z" fill="#e8c766" stroke="#8a6a2c" stroke-width="1.1"/>
      <path d="M1 -16C7 -30 14 -42 21 -52" stroke="#8a6a2c" stroke-width=".8" fill="none"/>
      <path d="M5 -24l6 1M8 -30l6 1M11 -36l6 1M14 -42l5 1" stroke="#b18d3e" stroke-width=".8"/></g>
    <g transform="translate(-48 0)"><rect x="-12" y="-7" width="24" height="7" rx="3.5" fill="#f3e9cf" stroke="#8c7550" stroke-width="1.2"/>
      <path d="M-6 -4.5h12M-6 -2.5h9" stroke="#8c7550" stroke-width=".8"/></g>
    ${faixa('Torre da Redação', 'Estrutura, temas e exemplos', 34, 'torre')}`;
}
function masmorra(fila) {
  const tocha = x => `<g transform="translate(${x} -30)"><circle cy="-17" r="17" fill="url(#m-fogo)"/>
    <path d="M-2 0V-10H2V0Z" fill="#5b4632"/><path d="M-3.5 -10h7l-1-2h-5Z" fill="#3b2e22"/>
    <path d="M0 -27C4 -21 6 -16 3 -12C2 -10 -2 -10 -3 -12C-6 -16 -3 -21 0 -27Z" fill="#f5a742"/>
    <path d="M0 -21C2 -17 2.5 -14 1 -12.5C0 -12 -1 -12 -1.5 -12.5C-2.5 -14 -1.5 -17 0 -21Z" fill="#ffe08a"/></g>`;
  return `<ellipse cy="4" rx="106" ry="14" fill="#14101a" opacity=".22"/>
    <path d="M-100 4C-96 -30 -70 -66 -30 -80C6 -92 54 -78 82 -48C96 -32 102 -14 100 4Z" fill="#6f6879" stroke="#3c3644" stroke-width="1.8"/>
    <path d="M10 -86C46 -80 76 -60 90 -36C98 -20 101 -8 100 4H40C44 -20 36 -50 10 -86Z" fill="#5a5364"/>
    <path d="M-70 -50C-60 -60 -46 -66 -30 -70M-84 -20C-76 -34 -64 -42 -50 -46M30 -66C44 -60 56 -52 64 -40" stroke="#8a8394" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M-36 4V-26A36 38 0 0 1 36 -26V4Z" fill="#151219" stroke="#2b2730" stroke-width="2"/>
    <path d="M-36 4V-26A36 38 0 0 1 36 -26V4Z" fill="url(#m-caverna)"/>
    <g stroke="#2b2a31" stroke-width="2.6"><path d="M-22 4V-46M-8 4V-60M8 4V-60M22 4V-46"/><path d="M-34 -20H34M-30 -40H30" stroke-width="2"/></g>
    <g transform="translate(0 -72)"><path d="M-7 0a7 7 0 1 1 14 0v4h-3v3h-8v-3h-3Z" fill="#ece5d6" stroke="#3c3644" stroke-width="1"/>
      <circle cx="-2.6" r="1.6" fill="#3c3644"/><circle cx="2.6" r="1.6" fill="#3c3644"/></g>
    ${tocha(-54)}${tocha(54)}
    <ellipse cy="2" rx="46" ry="6" fill="#7fe0a0" opacity=".2"/>
    ${fila ? `<g transform="translate(76 -76)"><circle r="15" fill="#b5533c" stroke="#f3e9d2" stroke-width="2"/><text y="5" text-anchor="middle" class="contador">${fila > 99 ? '99+' : fila}</text></g>` : ''}
    ${faixa('Masmorra dos Erros', fila ? `${fila} para rever hoje` : 'Revisão espaçada', 34, 'masmorra')}`;
}
function coliseu() {
  const meia = x => Math.sqrt(Math.max(0, 1 - (x / 88) ** 2));
  let arcos = '';
  for (let i = -5; i <= 5; i++) {
    const x = i * 15.5; const k = meia(x);
    const w = 3 + 6 * k; const topo = -30 + 34 * k + 5; const base = -4 + 34 * k - 3;
    arcos += `<path d="M${f1(x - w / 2)} ${f1(base)}V${f1(topo + w / 2)}a${f1(w / 2)} ${f1(w / 2)} 0 0 1 ${f1(w)} 0V${f1(base)}Z" fill="#7a5f3a" opacity=".85"/>`;
  }
  const bandeiras = [-70, -26, 26, 70].map(x => bandeira(x, f1(-30 - 34 * meia(x)), 24, '#a83232', '#6f1f1f')).join('');
  return `<ellipse cy="36" rx="106" ry="12" fill="#2a2010" opacity=".16"/>
    ${bandeiras}
    <ellipse cy="-30" rx="88" ry="34" fill="#dcc394" stroke="#7a6342" stroke-width="1.8"/>
    <ellipse cy="-28" rx="62" ry="22" fill="#c4a873" stroke="#7a6342" stroke-width="1.2"/>
    <ellipse cy="-27" rx="50" ry="16" fill="#ecd9ab" stroke="#9c8156" stroke-width="1"/>
    <path d="M-88 -30V-4A88 34 0 0 0 88 -4V-30A88 34 0 0 1 -88 -30Z" fill="#d5b985" stroke="#7a6342" stroke-width="1.8"/>
    <path d="M-88 -17A88 34 0 0 0 88 -17" fill="none" stroke="#a88b5c" stroke-width="1.2"/>${arcos}
    <g transform="translate(0 16)"><path d="M-9 -9h18v8c0 6-5 9-9 11c-4-2-9-5-9-11Z" fill="#a83232" stroke="#e3c27a" stroke-width="1.4"/>
      <path d="M-5 -5l10 10M5 -5L-5 5" stroke="#f2e6c6" stroke-width="1.6" stroke-linecap="round"/></g>
    ${faixa('Arena do Simulado', 'Prova real, com cronômetro', 56, 'arena')}`;
}
/* Reino da Natureza: estufa de vidro com cúpula e átomo no alto, uma árvore antiga ao lado
   (biologia) e um frasco borbulhando (química). */
function estufa(sub) {
  const vidro = '#d3eadf'; const caixilho = '#5f7f6a';
  const folha = '<path d="M7 -9c2-5 6-7 10-7c-1 5-5 8-10 8Z" fill="#e3c27a"/>';
  const colunas = [-44, -22, 0, 22, 44].map(x => `<path d="M${x} -8V-58" stroke="${caixilho}" stroke-width="1.2"/>`).join('');
  return `<ellipse cy="4" rx="114" ry="15" fill="#1d2a14" opacity=".16"/>
    <g transform="translate(-94 2)">
      <path d="M-5 0C-4 -16 -7 -30 -3 -46H4C8 -30 6 -16 7 0Z" fill="#6b4c30" stroke="#4a3320" stroke-width="1.2"/>
      <path d="M-3 -34C-10 -40 -16 -40 -20 -46M4 -30C10 -36 16 -36 20 -42" stroke="#5a3f27" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle cy="-70" r="24" fill="#4f8a4a"/><circle cx="-17" cy="-58" r="16" fill="#5f9a55"/>
      <circle cx="17" cy="-60" r="17" fill="#447c42"/><circle cx="2" cy="-88" r="15" fill="#6aa65e"/>
      <circle cx="-9" cy="-75" r="3" fill="#d8484a"/><circle cx="11" cy="-66" r="3" fill="#d8484a"/><circle cx="-3" cy="-54" r="2.6" fill="#d8484a"/>
    </g>
    <rect x="-74" y="-8" width="148" height="10" fill="#d9ccae" stroke="#6b5a3f" stroke-width="1.6"/>
    <rect x="-66" y="-58" width="132" height="50" fill="${vidro}" stroke="${caixilho}" stroke-width="1.6"/>
    ${colunas}<path d="M-66 -33H66" stroke="${caixilho}" stroke-width="1.1"/>
    <path d="M-56 -10c2-14 8-22 14-26c-2 10-4 18-6 26ZM-34 -10c0-12 4-20 10-24c0 9-2 17-4 24Z" fill="#4f8a4a"/>
    <circle cx="14" cy="-22" r="12" fill="#5f9a55" opacity=".92"/><circle cx="38" cy="-17" r="9" fill="#4f8a4a" opacity=".92"/>
    <path d="M-52 -58A52 48 0 0 1 52 -58Z" fill="${vidro}" stroke="${caixilho}" stroke-width="1.6"/>
    <circle cx="-6" cy="-74" r="13" fill="#6aa65e" opacity=".75"/><circle cx="14" cy="-68" r="8" fill="#4f8a4a" opacity=".7"/>
    <path d="M-26 -58Q-23 -92 0 -106M26 -58Q23 -92 0 -106M0 -58V-106M-46 -78Q0 -88 46 -78" stroke="${caixilho}" stroke-width="1.1" fill="none"/>
    <path d="M-60 -52H-46M-24 -96l9 -5" stroke="#fff" stroke-width="2.2" opacity=".6" stroke-linecap="round"/>
    <path d="M-10 2V-22a10 10 0 0 1 20 0V2Z" fill="#3f6b4f" stroke="#2d4d39" stroke-width="1.4"/>
    <circle cx="5" cy="-10" r="1.4" fill="#e3c27a"/>
    <g transform="translate(0 -118)"><path d="M0 12V4" stroke="#8a6a2c" stroke-width="1.8"/>
      <ellipse rx="14" ry="5.2" fill="none" stroke="#d8b25a" stroke-width="1.5"/>
      <ellipse rx="14" ry="5.2" fill="none" stroke="#d8b25a" stroke-width="1.5" transform="rotate(60)"/>
      <ellipse rx="14" ry="5.2" fill="none" stroke="#d8b25a" stroke-width="1.5" transform="rotate(-60)"/>
      <circle r="2.8" fill="#e9604a"/></g>
    <g transform="translate(96 2)">
      <path d="M-6 -44V-30L-18 -5C-20 -1 -18 0 -14 0H14C18 0 20 -1 18 -5L6 -30V-44Z" fill="#eef7f2" stroke="${caixilho}" stroke-width="1.5"/>
      <path d="M-13 -12H13L18 -5C20 -1 18 0 14 0H-14C-18 0 -20 -1 -18 -5Z" fill="#7cc46a"/>
      <rect x="-8" y="-48" width="16" height="5" rx="1.5" fill="#8a6a2c"/>
      <circle cx="-3" cy="-56" r="3" fill="#bfe6b0"/><circle cx="4" cy="-64" r="2.2" fill="#bfe6b0" opacity=".85"/><circle cx="-1" cy="-71" r="1.6" fill="#bfe6b0" opacity=".7"/>
    </g>
    ${bandeira(-66, -58, 20, '#3f7a3e', '#2a5229', folha)}${bandeira(66, -58, 20, '#3f7a3e', '#2a5229', folha)}
    ${faixa('Reino da Natureza', sub, 38, 'natureza')}`;
}
/* Reino dos Números: zigurate de três degraus com frisos geométricos, compasso dourado no
   templo do alto, um obelisco marcado como régua e sólidos geométricos flutuando. */
function cidadela(sub) {
  const degrau = (y, w, h, cor) => `<rect x="${-w / 2}" y="${y - h}" width="${w}" height="${h}" fill="${cor}" stroke="#6b5a3f" stroke-width="1.5"/>`;
  const pi = '<path d="M7 -17H18M10 -17V-9M15 -17V-9" stroke="#e3c27a" stroke-width="1.7" stroke-linecap="round" fill="none"/>';
  const friso = (y, x0, x1) => {
    let s = `<path d="M${x0} ${y}H${x1}" stroke="#1f6f78" stroke-width="3"/>`;
    for (let x = x0 + 8; x <= x1 - 8; x += 14) s += `<path d="M${x - 4} ${y + 1}l4 -4l4 4" fill="none" stroke="#e3c27a" stroke-width="1.1"/>`;
    return s;
  };
  let marcas = '';
  for (let i = 0; i < 8; i++) marcas += `<path d="M-5 ${-10 - 7 * i}h${i % 2 ? 4 : 7}" stroke="#7a6748" stroke-width="1"/>`;
  return `<ellipse cy="4" rx="112" ry="15" fill="#10282a" opacity=".16"/>
    ${degrau(2, 184, 22, '#dccfae')}${degrau(-20, 142, 22, '#e3d8bd')}${degrau(-42, 100, 22, '#ebe1c8')}
    ${friso(-10, -90, 90)}${friso(-32, -69, 69)}${friso(-54, -48, 48)}
    <path d="M-13 2V-62H13V2Z" fill="#d4c6a6" stroke="#6b5a3f" stroke-width="1.2"/>
    ${[-6, -14, -22, -30, -38, -46, -54].map(y => `<path d="M-13 ${y}H13" stroke="#b5a582" stroke-width="1"/>`).join('')}
    <rect x="-30" y="-90" width="60" height="26" fill="#f1e7d2" stroke="#6b5a3f" stroke-width="1.5"/>
    <path d="M-10 -64V-76a10 10 0 0 1 20 0V-64Z" fill="#1d3f44" stroke="#134a50" stroke-width="1.3"/>
    <path d="M-36 -90L0 -114L36 -90Z" fill="#1f6f78" stroke="#134a50" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M0 -114L36 -90H0Z" fill="#185a61"/>
    <g transform="translate(0 -100)"><circle cy="-6" r="2.2" fill="#e3c27a"/>
      <path d="M0 -4L-6 8M0 -4L6 8" stroke="#e3c27a" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M-4 3.5A6 6 0 0 0 4 3.5" stroke="#e3c27a" stroke-width="1.2" fill="none"/></g>
    <g transform="translate(108 2)"><path d="M-7 0L-5 -72H5L7 0Z" fill="#e3d6b6" stroke="#7a6748" stroke-width="1.3"/>
      <path d="M-5 -72L0 -84L5 -72Z" fill="#d8b25a" stroke="#7a6748" stroke-width="1.2"/>${marcas}</g>
    <g transform="translate(-76 -98)"><path d="M0 -9L10 -4V7L0 12L-10 7V-4Z" fill="#7cc9d1" stroke="#134a50" stroke-width="1.1"/>
      <path d="M0 -9L10 -4L0 1L-10 -4Z" fill="#b6e6ea" stroke="#134a50" stroke-width="1.1"/>
      <path d="M0 1V12" stroke="#134a50" stroke-width="1.1"/></g>
    <g transform="translate(74 -112)"><path d="M0 -11L11 8H-11Z" fill="#e3c27a" stroke="#8a6a2c" stroke-width="1.1"/>
      <path d="M0 -11L11 8H3Z" fill="#c9a24a" stroke="#8a6a2c" stroke-width="1"/></g>
    <g transform="translate(-44 -126)"><circle r="6.5" fill="#f3e7c8" stroke="#8a6a2c" stroke-width="1.1"/>
      <ellipse rx="6.5" ry="2.4" fill="none" stroke="#8a6a2c" stroke-width=".9"/></g>
    ${bandeira(-80, -20, 22, '#1f6f78', '#134a50', pi)}${bandeira(80, -20, 22, '#1f6f78', '#134a50', pi)}
    ${faixa('Reino dos Números', sub, 38, 'numeros')}`;
}

/* ---- enfeites do atlas ---- */
function rosaDosVentos(x, y, r) {
  let pontas = '';
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 - Math.PI / 2;
    const longa = i % 2 === 0;
    const R = longa ? r : r * 0.58; const w = longa ? r * 0.17 : r * 0.12;
    const px = f1(Math.cos(a) * R); const py = f1(Math.sin(a) * R);
    const lx = f1(Math.cos(a + Math.PI / 2) * w); const ly = f1(Math.sin(a + Math.PI / 2) * w);
    pontas += `<path d="M${px} ${py}L${lx} ${ly}L0 0Z" fill="${longa ? '#ecdcb2' : '#c8b07a'}"/><path d="M${px} ${py}L${-lx} ${-ly}L0 0Z" fill="${longa ? '#8a6a2c' : '#9c8150'}"/>`;
  }
  return `<g transform="translate(${x} ${y})"><circle r="${f1(r * 1.1)}" fill="rgba(15,30,50,.35)" stroke="#c9a865" stroke-width="1.2"/>
    <circle r="${f1(r * 0.86)}" fill="none" stroke="#c9a865" stroke-width=".8" stroke-dasharray="2 3" opacity=".8"/>${pontas}
    <circle r="3" fill="#8a6a2c"/><text y="${f1(-r * 1.1 - 6)}" text-anchor="middle" class="rosa-n">N</text></g>`;
}
function navio(x, y) {
  return `<g transform="translate(${x} ${y})"><path d="M-26 0H26L18 10H-18Z" fill="#6b4a2f" stroke="#3f2b1a" stroke-width="1.2"/>
    <path d="M-2 -1V-40" stroke="#4a3524" stroke-width="2"/>
    <path d="M0 -38C14 -32 16 -16 14 -6H0Z" fill="#f2e8cf" stroke="#8c7550" stroke-width="1"/>
    <path d="M-4 -34C-16 -28 -18 -14 -16 -6H-4Z" fill="#e8dcbd" stroke="#8c7550" stroke-width="1"/>
    <path d="M-2 -40L10 -37L-2 -34Z" fill="#a83232"/>
    <path d="M-36 13q6-4 12 0t12 0M10 14q6-4 12 0t12 0" stroke="#7fa6c7" stroke-width="1.2" fill="none" opacity=".7"/></g>`;
}
function serpente(x, y) {
  return `<g transform="translate(${x} ${y})"><g fill="#3f7a6a" stroke="#22463d" stroke-width="1.2">
    <path d="M-40 0c4-14 16-14 20 0Z"/><path d="M-12 0c4-16 18-16 22 0Z"/>
    <path d="M18 0c2-14 10-22 18-20c6 2 6 8 2 10c-4 2-8 0-10 4c-2 3-2 5-1 6Z"/></g>
    <circle cx="33" cy="-16" r="1.4" fill="#f4e7b0"/>
    <path d="M-46 3q8 3 16 0t16 0t16 0t16 0t16 0" stroke="#7fa6c7" fill="none" opacity=".6"/></g>`;
}
function cartela() {
  return `<g transform="translate(36 28)"><path d="M12 0H238C246 0 252 6 252 14V46C252 54 246 60 238 60H12C5 60 0 54 0 46V14C0 6 5 0 12 0Z" fill="#f3e7c8" stroke="#8c7346" stroke-width="1.6"/>
    <path d="M7 7H245V53H7Z" fill="none" stroke="#c9a865" stroke-width=".9"/>
    <path d="M14 30h22M216 30h22" stroke="#c9a865" stroke-width="1"/><circle cx="12" cy="30" r="2" fill="#c9a865"/><circle cx="240" cy="30" r="2" fill="#c9a865"/>
    <text x="126" y="31" text-anchor="middle" class="cartela-t">Reinos do Enem</text>
    <text x="126" y="48" text-anchor="middle" class="cartela-s">Os dois dias de prova</text></g>`;
}
/* Névoa sobre uma vaga ainda sem reino: montanhas apagadas sob um banco de nuvens, no espaço
   que o futuro lugar vai ocupar; o rótulo fica onde estaria a faixa do nome. */
function nevoaVaga(v) {
  const bolhas = [[-104, -61, 38], [-62, -91, 50], [-8, -105, 56], [48, -93, 50], [96, -65, 42], [44, -49, 48], [-36, -45, 50], [-124, -35, 28], [124, -33, 28]];
  return `<g class="vaga" transform="translate(${v.x} ${v.y})" aria-hidden="true">
    ${v.montanhas.map(([x, y, e]) => montanha(x, y, e)).join('')}
    <ellipse cy="-75" rx="165" ry="100" fill="url(#m-nevoa-vaga)"/>
    ${bolhas.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#ece8df" opacity=".74"/>`).join('')}
    ${bolhas.map(([x, y, r]) => `<circle cx="${x - 7}" cy="${y - 9}" r="${f1(r * 0.62)}" fill="#fbf9f4" opacity=".55"/>`).join('')}
    <text y="34" text-anchor="middle" class="rotulo-vaga">Terras não mapeadas</text></g>`;
}

function mapaSVG(fila) {
  const progresso = { lc: resumoArea('LC'), ch: resumoArea('CH'), cn: resumoArea('CN'), mt: resumoArea('MT'),
                      fila, sabio: E.save.sabio };
  const no = (l) => {
    const nome = typeof l.nome === 'function' ? l.nome(progresso) : l.nome;
    const dados = Object.entries(l.dados || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    return `<g transform="translate(${l.x} ${l.y}) scale(${ESCALA_LUGAR})">
      <g class="no" role="button" tabindex="0" aria-label="${esc(nome)}" data-acao="${l.acao}" ${dados}>${l.desenho(progresso)}</g></g>`;
  };
  const estrada = d => `<path d="${d}" fill="none" stroke="#efe1b9" stroke-width="6.5" stroke-linecap="round" opacity=".75"/>
    <path d="${d}" fill="none" stroke="#8f7350" stroke-width="2.4" stroke-dasharray="6 8" stroke-linecap="round"/>`;
  const ponte = ([x, y, a]) => `<g transform="translate(${x} ${y}) rotate(${a})"><rect x="-15" y="-8" width="30" height="16" rx="2" fill="#a07a4e" stroke="#5f4529" stroke-width="1.2"/>
    <path d="M-9 -8v16M-3 -8v16M3 -8v16M9 -8v16" stroke="#7a5a37" stroke-width="1"/><path d="M-16 -9H16M-16 9H16" stroke="#5f4529" stroke-width="1.8"/></g>`;
  const ocupadas = new Set(LUGARES_MAPA.map(l => l.vaga).filter(Boolean));
  const arvores = [
    [430, 470], [466, 454, .95, 1], [505, 478], [446, 512, .9], [488, 526, .9, 1], [530, 506, .85], [560, 546, .85, 1],
    [180, 790], [214, 806, .9, 1], [240, 776, .85], [168, 836, .85],
    [510, 330, .9], [535, 352, .85, 1], [893, 352, .85, 1], [812, 548, .85, 1], [826, 590, .8],
    [1232, 456, .85], [1254, 482, .8, 1], [1196, 820], [1222, 846, .9, 1], [1250, 812, .85], [1238, 876, .8],
    [800, 950, .75], [835, 968, .7, 1]];
  return `<svg class="mapa" viewBox="0 0 ${MAPA.w} ${MAPA.h}" role="group" aria-label="Mapa dos reinos">
    <defs>
      <radialGradient id="m-mar" gradientUnits="userSpaceOnUse" cx="${MAPA.w / 2}" cy="${MAPA.h * 0.46}" r="${MAPA.w * 0.82}"><stop offset="0" stop-color="#23425f"/><stop offset=".55" stop-color="#19304a"/><stop offset="1" stop-color="#0c1829"/></radialGradient>
      <pattern id="m-ondas" width="64" height="36" patternUnits="userSpaceOnUse">
        <path d="M4 12q6-6 12 0t12 0" fill="none" stroke="#5a86ab" stroke-width="1.1" stroke-linecap="round" opacity=".32"/>
        <path d="M36 30q6-6 12 0t12 0" fill="none" stroke="#5a86ab" stroke-width="1.1" stroke-linecap="round" opacity=".26"/></pattern>
      <linearGradient id="m-terra" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0e3bf"/><stop offset="1" stop-color="#dbc590"/></linearGradient>
      <radialGradient id="m-luz" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#fff8e4" stop-opacity=".45"/><stop offset="1" stop-color="#fff8e4" stop-opacity="0"/></radialGradient>
      <linearGradient id="m-cupula" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3f99"/><stop offset="1" stop-color="#2b1b52"/></linearGradient>
      <radialGradient id="m-orbe" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#a8ecff"/><stop offset="1" stop-color="#3a9ccc"/></radialGradient>
      <radialGradient id="m-halo"><stop offset="0" stop-color="#a8ecff" stop-opacity=".6"/><stop offset="1" stop-color="#a8ecff" stop-opacity="0"/></radialGradient>
      <radialGradient id="m-portal" cx="50%" cy="80%" r="70%"><stop offset="0" stop-color="#8fdcff" stop-opacity=".85"/><stop offset="1" stop-color="#8fdcff" stop-opacity="0"/></radialGradient>
      <radialGradient id="m-caverna" cx="50%" cy="95%" r="80%"><stop offset="0" stop-color="#7fe0a0" stop-opacity=".55"/><stop offset="1" stop-color="#7fe0a0" stop-opacity="0"/></radialGradient>
      <radialGradient id="m-fogo"><stop offset="0" stop-color="#ffbe5c" stop-opacity=".6"/><stop offset="1" stop-color="#ffbe5c" stop-opacity="0"/></radialGradient>
      <radialGradient id="m-nevoa"><stop offset="0" stop-color="#f4f1ea" stop-opacity=".22"/><stop offset="1" stop-color="#f4f1ea" stop-opacity="0"/></radialGradient>
      <radialGradient id="m-nevoa-vaga"><stop offset="0" stop-color="#f3f0e8" stop-opacity=".9"/><stop offset=".7" stop-color="#f3f0e8" stop-opacity=".55"/><stop offset="1" stop-color="#f3f0e8" stop-opacity="0"/></radialGradient>
      <clipPath id="m-ilha"><path d="${ILHA}"/></clipPath>
    </defs>
    <rect x="-3000" y="-3000" width="${MAPA.w + 6000}" height="${MAPA.h + 6000}" fill="url(#m-mar)"/>
    <rect x="-3000" y="-3000" width="${MAPA.w + 6000}" height="${MAPA.h + 6000}" fill="url(#m-ondas)"/>
    ${navio(1320, 110)}${serpente(60, 470)}
    <g transform="translate(1290 116)"><path d="M46 584c8-12 26-14 34-4c6 9-2 20-16 20c-12 0-22-6-18-16Z" fill="#dcc690" stroke="#8b7048" stroke-width="1.4"/>${arvore(60, 588, .7)}</g>
    <text x="${MAPA.w / 2}" y="1024" text-anchor="middle" class="rotulo-mar">Mar das Questões</text>
    <path d="${ILHA}" fill="none" stroke="#7fb4d6" stroke-width="22" opacity=".17"/>
    <path d="${ILHA}" fill="none" stroke="#9cc7e2" stroke-width="8" opacity=".25"/>
    <path d="${ILHA}" fill="#bfa877" transform="translate(5 7)" opacity=".5"/>
    <path d="${ILHA}" fill="url(#m-terra)" stroke="#8b7048" stroke-width="2.2"/>
    <g clip-path="url(#m-ilha)">
      <ellipse cx="1010" cy="902" rx="168" ry="64" fill="#e9d6a3" opacity=".55"/>
      <rect width="${MAPA.w}" height="${MAPA.h}" fill="url(#m-luz)"/>
    </g>
    ${montanha(550, 260, .85)}${montanha(585, 225, 1.15)}${montanha(625, 195, 1.35)}${montanha(775, 195, 1.33)}${montanha(815, 225, 1.15)}${montanha(850, 260, .85)}
    <path d="M852 300C860 350 866 400 884 450" stroke="#7fb0cf" stroke-width="6.5" fill="none" stroke-linecap="round"/>
    <path d="${RIO}" stroke="#7fb0cf" stroke-width="7.5" fill="none" stroke-linecap="round"/>
    <path d="${RIO}" stroke="#c4e0f0" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="905" cy="470" rx="66" ry="22" fill="#8cbbd8" stroke="#5f8eaf" stroke-width="1.5"/>
    <ellipse cx="891" cy="462" rx="34" ry="6" fill="#c4e0f0" opacity=".5"/>
    <text x="905" y="478" text-anchor="middle" class="rotulo-lago">Lago da Inspiração</text>
    ${ESTRADAS_MAPA.map(e => estrada(e.d)).join('')}${ESTRADAS_MAPA.filter(e => e.ponte).map(e => ponte(e.ponte)).join('')}
    <g transform="translate(500 684)"><path d="M0 0V-20" stroke="#5f4529" stroke-width="2"/><path d="M0 -19h13l3 3-3 3H0Z" fill="#c9a97a" stroke="#5f4529" stroke-width="1"/><path d="M0 -11h-12l-3 3 3 3H0Z" fill="#c9a97a" stroke="#5f4529" stroke-width="1"/></g>
    ${arvores.map(([x, y, e = 1, r = 0]) => arvore(x, y, e, !!r)).join('')}
    ${[[292, 878], [304, 912, .85], [552, 878, .9], [566, 904, .8], [604, 848, .9], [748, 842, .8], [618, 940, .75], [700, 830, .7]].map(([x, y, e = 1]) => pedra(x, y, e)).join('')}
    ${[[470, 700], [380, 780], [610, 790], [760, 790], [990, 590], [1220, 760], [560, 420], [1180, 450], [700, 420], [850, 610], [175, 740]].map(([x, y]) => tufo(x, y)).join('')}
    <text x="482" y="604" text-anchor="middle" class="rotulo-regiao">Bosque dos Poetas</text>
    <text x="680" y="905" text-anchor="middle" class="rotulo-regiao">Ermos Sombrios</text>
    ${VAGAS_MAPA.filter(v => !ocupadas.has(v.id)).map(nevoaVaga).join('')}
    ${LUGARES_MAPA.map(no).join('')}
    <ellipse cx="1370" cy="460" rx="90" ry="24" fill="url(#m-nevoa)"/><ellipse cx="330" cy="1020" rx="140" ry="20" fill="url(#m-nevoa)"/>
    ${rosaDosVentos(88, 950, 40)}${cartela()}
  </svg>`;
}
function controlesMapa() {
  const dica = !E.dicaMapa; // a dica aparece na primeira vez que o mapa abre e some sozinha
  E.dicaMapa = true;
  return `<span class="canto c1"></span><span class="canto c2"></span><span class="canto c3"></span><span class="canto c4"></span>
    <div class="zoom-controles" role="group" aria-label="Zoom do mapa">
      <button class="botao-zoom" data-acao="zoom" data-v="mais" title="Aproximar (roda do mouse ou +)" aria-label="Aproximar">${ico('mais')}</button>
      <span class="zoom-nivel" aria-live="polite">${Math.round(E.camera.z * 100)}%</span>
      <button class="botao-zoom" data-acao="zoom" data-v="menos" title="Afastar (roda do mouse ou −)" aria-label="Afastar">${ico('menos')}</button>
      <button class="botao-zoom" data-acao="zoom" data-v="inteiro" title="Ver o mapa inteiro (0)" aria-label="Ver o mapa inteiro">${ico('enquadrar')}</button>
    </div>
    ${dica ? '<p class="dica-mapa">Roda do mouse aproxima e afasta · arraste para mover</p>' : ''}`;
}

/* ---- câmera do mapa: zoom e arraste ---- */
/* A câmera guarda o zoom (1 a ZOOM_MAX) e o ponto central do mundo. A vista inteira (zoom 1)
   acompanha a proporção da janela: mostra o mundo todo e completa o resto com mar. */
let animacaoCamera = null;
function vistaBase() {
  const r = document.querySelector('svg.mapa')?.getBoundingClientRect();
  const a = r && r.width > 1 && r.height > 1 ? r.width / r.height : MAPA.w / MAPA.h;
  if (a >= MAPA.w / MAPA.h) {
    const w = MAPA.h * a;
    return { x: (MAPA.w - w) / 2, y: 0, w, h: MAPA.h };
  }
  const h = MAPA.w / a;
  return { x: 0, y: (MAPA.h - h) / 2, w: MAPA.w, h };
}
function limitarCamera(c, base = vistaBase()) {
  const z = Math.min(ZOOM_MAX, Math.max(1, c.z));
  const w = base.w / z; const h = base.h / z;
  return {
    z,
    cx: Math.min(base.x + base.w - w / 2, Math.max(base.x + w / 2, c.cx)),
    cy: Math.min(base.y + base.h - h / 2, Math.max(base.y + h / 2, c.cy)),
  };
}
function vistaDaCamera(c, base) {
  const w = base.w / c.z; const h = base.h / c.z;
  return { x: c.cx - w / 2, y: c.cy - h / 2, w, h };
}
function aplicarVista() {
  const svg = document.querySelector('svg.mapa');
  if (!svg) return;
  const base = vistaBase();
  E.camera = limitarCamera(E.camera, base);
  const v = vistaDaCamera(E.camera, base);
  svg.setAttribute('viewBox', `${f1(v.x)} ${f1(v.y)} ${f1(v.w)} ${f1(v.h)}`);
  svg.classList.toggle('ampliado', E.camera.z > 1.001);
  const rotulo = document.querySelector('.zoom-nivel');
  if (rotulo) rotulo.textContent = `${Math.round(E.camera.z * 100)}%`;
}
function animarCamera(alvo) {
  cancelAnimationFrame(animacaoCamera);
  E.cameraAlvo = alvo;
  const ini = { ...E.camera };
  const t0 = performance.now();
  const passo = (t) => {
    const k = Math.min(1, (t - t0) / 170);
    const e = 1 - (1 - k) ** 3;
    E.camera = { z: ini.z + (alvo.z - ini.z) * e, cx: ini.cx + (alvo.cx - ini.cx) * e, cy: ini.cy + (alvo.cy - ini.cy) * e };
    aplicarVista();
    if (k < 1) animacaoCamera = requestAnimationFrame(passo);
    else E.cameraAlvo = null;
  };
  animacaoCamera = requestAnimationFrame(passo);
  // com a janela encoberta o navegador para os quadros de animação: a vista final vale mesmo assim
  setTimeout(() => {
    if (E.cameraAlvo !== alvo) return;
    cancelAnimationFrame(animacaoCamera);
    E.camera = alvo; E.cameraAlvo = null;
    aplicarVista();
  }, 260);
}
/* fator > 1 aproxima; (px, py) é o ponto do mundo que fica parado sob o cursor. No limite do
   zoom nada se mexe: antes, o deslocamento era calculado para um zoom que não acontecia. */
function zoomMapa(fator, px, py) {
  const atual = E.cameraAlvo || E.camera;
  const z = Math.min(ZOOM_MAX, Math.max(1, atual.z * fator));
  if (Math.abs(z - atual.z) < 1e-4) return;
  const base = vistaBase();
  const v = vistaDaCamera(atual, base);
  const qx = px ?? atual.cx; const qy = py ?? atual.cy;
  const k = atual.z / z;
  const x = qx - (qx - v.x) * k; const y = qy - (qy - v.y) * k;
  animarCamera(limitarCamera({ z, cx: x + base.w / z / 2, cy: y + base.h / z / 2 }, base));
}
function mapaInteiro() { animarCamera({ z: 1, cx: MAPA.w / 2, cy: MAPA.h / 2 }); }
function pontoDoMapa(svg, clientX, clientY) {
  const p = svg.createSVGPoint();
  p.x = clientX; p.y = clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
let arrasto = null;
document.addEventListener('wheel', (ev) => {
  const svg = ev.target.closest?.('svg.mapa');
  if (!svg) return;
  ev.preventDefault();
  const p = pontoDoMapa(svg, ev.clientX, ev.clientY);
  zoomMapa(ev.deltaY < 0 ? 1.2 : 1 / 1.2, p.x, p.y);
}, { passive: false });
document.addEventListener('pointerdown', (ev) => {
  const svg = ev.target.closest?.('svg.mapa');
  if (!svg || ev.button !== 0) return;
  arrasto = { svg, x: ev.clientX, y: ev.clientY, camera: { ...E.camera }, moveu: false, id: ev.pointerId };
});
document.addEventListener('pointermove', (ev) => {
  if (!arrasto || E.camera.z <= 1.001) return;
  const dx = ev.clientX - arrasto.x; const dy = ev.clientY - arrasto.y;
  if (!arrasto.moveu && Math.hypot(dx, dy) < 5) return;
  if (!arrasto.moveu) {
    arrasto.moveu = true;
    try { arrasto.svg.setPointerCapture(arrasto.id); } catch { /* ponteiro já solto: segue sem captura */ }
    arrasto.svg.classList.add('arrastando');
    cancelAnimationFrame(animacaoCamera);
    E.cameraAlvo = null;
    arrasto.camera = { ...E.camera };
    arrasto.x = ev.clientX; arrasto.y = ev.clientY;
    return;
  }
  const k = 1 / arrasto.svg.getScreenCTM().a; // unidades do mundo por pixel
  E.camera = limitarCamera({ ...arrasto.camera, cx: arrasto.camera.cx - dx * k, cy: arrasto.camera.cy - dy * k });
  aplicarVista();
});
function soltarArrasto() {
  if (arrasto?.moveu) {
    E.fimArrasto = performance.now();
    arrasto.svg.classList.remove('arrastando');
  }
  arrasto = null;
}
document.addEventListener('pointerup', soltarArrasto);
document.addEventListener('pointercancel', soltarArrasto);
/* A vista acompanha o tamanho do mapa: janela redimensionada, maximizada ou qualquer outra
   mudança de layout. */
const observadorMapa = typeof ResizeObserver === 'function'
  ? new ResizeObserver(() => { if (E.tela === 'mapa') aplicarVista(); }) : null;
if (!observadorMapa) window.addEventListener('resize', () => { if (E.tela === 'mapa') aplicarVista(); });

/* ---- render ----------------------------------------------------------- */
function render() {
  const rolagem = document.querySelector('.conteudo')?.scrollTop || 0;
  $app.innerHTML = TELAS[E.tela]();
  const c = document.querySelector('.conteudo');
  if (c && E.manterRolagem) c.scrollTop = rolagem;
  E.manterRolagem = false;
  clearInterval(E.relogio);
  observadorMapa?.disconnect();
  if (E.tela === 'mapa') {
    aplicarVista();
    observadorMapa?.observe(document.querySelector('svg.mapa'));
    ajustarFaixas();
    document.fonts?.ready.then(() => { if (E.tela === 'mapa') ajustarFaixas(); });
  }
  if (E.tela === 'questao' && E.save.atual) {
    if (E.save.atual.limite) {
      atualizarCronometro();
      E.relogio = setInterval(atualizarCronometro, 1000);
    }
    precarregar();
  }
}
function precarregar() {
  const s = E.save.atual;
  const q = E.porId.get(s.ids[s.i + 1]);
  if (q) q.img.forEach(([arq]) => { new Image().src = `${BASE_BANCO}img/${arq}`; });
}
function ir(tela) {
  if (tela === 'questao' && !E.save.atual) tela = 'mapa';
  const s = E.save?.atual;
  if (s) {
    if (E.tela === 'questao' && tela !== 'questao') { s.gasto += Date.now() - s.inicio; s.pausada = true; }
    if (tela === 'questao' && s.pausada) { s.inicio = Date.now(); s.pausada = false; }
  }
  E.tela = tela;
  render();
  document.querySelector('.conteudo')?.scrollTo(0, 0);
}
function renderModal() {
  const m = E.modal;
  if (!m) { $modal.innerHTML = ''; $modal.className = ''; return; }
  $modal.className = 'aberto';
  if (m.tipo === 'leitor') {
    $modal.innerHTML = `<div class="janela leitor" role="dialog" aria-modal="true" aria-label="${esc(m.titulo)}">
      <header><div><h2>${esc(m.titulo)}</h2><p>${esc(m.subtitulo || '')}</p></div>
        <button class="fechar" data-acao="fechar-modal" aria-label="Fechar">${ico('xis')}</button></header>
      <div class="paginas">${m.paginas.map(([arq, w, h]) => `<img src="${BASE_BANCO}redacao/${arq}" width="${w}" height="${h}" alt="Página do documento oficial">`).join('')}</div>
      <footer><small>${esc(m.fonte)}</small>${m.arquivo ? `<button class="botao pequeno" data-acao="abrir-pdf" data-arquivo="${m.arquivo}">Abrir o PDF oficial</button>` : ''}</footer>
    </div>`;
  } else if (m.tipo === 'confirmar') {
    $modal.innerHTML = `<div class="janela caixa" role="alertdialog" aria-modal="true"><h2>${esc(m.titulo)}</h2><p>${esc(m.texto)}</p>
      <div class="acoes"><button class="botao" data-acao="fechar-modal">Voltar</button>${m.extra ? `<button class="botao" data-acao="${m.extra[1]}">${esc(m.extra[0])}</button>` : ''}<button class="botao ${m.perigo ? 'perigoso' : 'primario'}" data-acao="${m.acao}">${esc(m.botao)}</button></div></div>`;
  } else if (m.tipo === 'data') {
    $modal.innerHTML = `<div class="janela caixa" role="dialog" aria-modal="true" aria-labelledby="titulo-data">
      <h2 id="titulo-data">Data do 1º dia do Enem</h2>
      <p>A contagem regressiva usa a data que você escolher. A data oficial do Enem 2026 é ${formatarData(DATA_PROVA_PADRAO)}.</p>
      <label class="campo">Dia da prova<input type="date" id="campo-data" value="${dataProva()}" min="2020-01-01" max="2099-12-31"></label>
      <div class="acoes"><button class="botao" data-acao="fechar-modal">Cancelar</button>
        <button class="botao" data-acao="data-padrao">Usar a data oficial</button>
        <button class="botao primario" data-acao="salvar-data">Salvar</button></div></div>`;
    document.getElementById('campo-data').focus();
  } else if (m.tipo === 'titulos') {
    const nv = nivelDe(E.save.xp).n;
    const feitas = CONQUISTAS.filter(c => E.save.conquistas[c.id]).length;
    const opcao = c => (E.save.conquistas[c.id]
      ? `<button class="opcao-titulo grau-${c.grau} ${E.save.titulo === c.id ? 'ativa' : ''}" role="radio" aria-checked="${E.save.titulo === c.id}" data-acao="escolher-titulo" data-id="${c.id}">
          <strong>${esc(c.titulo)}</strong><small>${esc(c.nome)}</small></button>`
      : `<div class="opcao-titulo bloqueada" aria-disabled="true"><strong>${ico('cadeado')} ${esc(c.titulo)}</strong><small>${esc(c.texto)}</small></div>`);
    $modal.innerHTML = `<div class="janela caixa janela-titulos" role="dialog" aria-modal="true" aria-labelledby="titulo-titulos">
      <h2 id="titulo-titulos">Escolha seu título</h2>
      <p>Cada conquista libera um título. Você já tem ${feitas} de ${CONQUISTAS.length}; os bloqueados mostram o que falta.</p>
      <div class="lista-titulos" role="radiogroup" aria-labelledby="titulo-titulos">
        <button class="opcao-titulo ${!E.save.titulo ? 'ativa' : ''}" role="radio" aria-checked="${!E.save.titulo}" data-acao="escolher-titulo" data-id="">
          <strong>${esc(tituloDe(nv))}</strong><small>Título do nível ${nv}, que muda sozinho quando você sobe de nível</small></button>
        ${Object.entries(GRAUS).map(([g, nome]) => `<h3 class="grau grau-${g}"><span></span>${nome}</h3>
          ${CONQUISTAS.filter(c => c.grau === Number(g)).map(opcao).join('')}`).join('')}
      </div>
      <div class="acoes"><button class="botao" data-acao="fechar-modal">Fechar</button></div></div>`;
    $modal.querySelector('.opcao-titulo.ativa')?.focus();
  } else if (m.tipo === 'item') {
    $modal.innerHTML = modalItem(m.id);
    $modal.querySelector('.acoes .botao')?.focus();
  } else if (m.tipo === 'bau') {
    $modal.innerHTML = modalBau(m);
    $modal.querySelector('.acoes .primario')?.focus();
  } else if (m.tipo === 'escolha') {
    $modal.innerHTML = modalEscolha(m);
    ($modal.querySelector('.carta-escolha') || $modal.querySelector('.acoes .botao'))?.focus();
  } else if (m.tipo === 'relatorio') {
    $modal.innerHTML = `<div class="janela leitor" role="dialog" aria-modal="true"><header><div><h2>Questões que ficaram de fora</h2><p>${m.linhas.length} questões, com o motivo de cada uma</p></div>
      <button class="fechar" data-acao="fechar-modal" aria-label="Fechar">${ico('xis')}</button></header>
      <div class="paginas lista-fora"><table class="tabela"><thead><tr><th>Prova</th><th>Área</th><th>Questão</th><th>Motivo</th></tr></thead>
      <tbody>${m.linhas.map(l => `<tr><td>${l.ano} ${esc(l.aplicacao.replace(/_/g, ' '))}</td><td>${l.area}</td><td>${l.numero}</td><td>${esc(l.motivo)}</td></tr>`).join('')}</tbody></table></div></div>`;
  }
}

/* ---- ações ------------------------------------------------------------ */
const ACOES = {
  ir: d => ir(d.tela),
  reino: (d) => { E.area = d.area; E.filtro.comp = 'todas'; E.filtro.ano = 'todos'; ir('reino'); },
  classe: (d) => { guardarNome(); E.criacao.classe = d.id; render(); },
  criar: () => {
    guardarNome();
    const nome = E.criacao.nome.trim();
    if (!nome) { avisar('Dê um nome ao seu personagem.'); document.getElementById('nome-heroi')?.focus(); return; }
    E.save.heroi = { nome, classe: E.criacao.classe, criado: hoje() };
    salvar(true);
    ir('mapa');
  },
  patrulha: partirTreinoRapido,
  comp: (d) => { E.filtro.comp = d.comp === 'todas' ? 'todas' : Number(d.comp); E.manterRolagem = true; render(); },
  tamanho: (d) => { E.filtro.tamanho = Number(d.v); E.manterRolagem = true; render(); },
  nivel: (d) => { E.filtro.nivel = d.v; E.manterRolagem = true; render(); },
  partir: partirExpedicao,
  marcar: (d) => {
    if (eliminadasDa(E.save.atual, E.save.atual?.ids[E.save.atual.i]).includes(d.letra)) return;
    if (E.riscadas.has(d.letra)) E.riscadas.delete(d.letra);
    E.selecao = E.selecao === d.letra && E.save.atual?.tipo !== 'simulado' ? null : d.letra;
    atualizarMarcas();
  },
  confirmar,
  proxima,
  pular: d => irQuestao(Number(d.i)),
  'sair-sessao': () => {
    const s = E.save.atual;
    const feitas = Object.keys(s.respostas).length;
    if (s.tipo === 'simulado' || !feitas) { salvar(true); ir('mapa'); return; }
    E.modal = { tipo: 'confirmar', titulo: 'Sair da expedição?', texto: 'Pausar guarda tudo e você continua depois pelo mapa. Encerrar mostra o resultado com o que já respondeu.', botao: 'Encerrar agora', acao: 'encerrar', extra: ['Pausar', 'pausar'] };
    renderModal();
  },
  pausar: () => { E.modal = null; renderModal(); salvar(true); ir('mapa'); },
  encerrar: () => { E.modal = null; renderModal(); abandonarSessao(); },
  'pedir-fim': () => {
    const s = E.save.atual;
    const faltam = s.ids.length - Object.keys(s.respostas).length;
    E.modal = { tipo: 'confirmar', titulo: 'Encerrar o simulado?', texto: faltam ? `Ainda ${faltam === 1 ? 'falta 1 questão' : `faltam ${faltam} questões`}. Questões em branco não contam na porcentagem.` : 'Todas as questões foram respondidas.', botao: 'Ver resultado', acao: 'encerrar-simulado' };
    renderModal();
  },
  'encerrar-simulado': () => { E.modal = null; renderModal(); concluirSessao(); },
  sabio: partirSabio,
  'pedir-fim-sabio': () => {
    const s = E.save.atual;
    const feitas = Object.keys(s.respostas).length;
    if (!feitas) { E.save.atual = null; salvar(true); ir('sabio'); return; }
    E.modal = { tipo: 'confirmar', titulo: 'Encerrar a jornada?', texto: `Você respondeu ${feitas} ${feitas === 1 ? 'questão' : 'questões'} e derrotou ${s.derrotados} ${s.derrotados === 1 ? 'inimigo' : 'inimigos'}. O resultado mostra tudo o que já fez.`, botao: 'Encerrar e ver resultado', acao: 'encerrar-simulado' };
    renderModal();
  },
  'pedir-titulo': () => { E.modal = { tipo: 'titulos' }; renderModal(); },
  'escolher-titulo': (d) => {
    E.save.titulo = d.id || null;
    salvar();
    E.modal = null; renderModal();
    render();
    avisar(`Título: ${tituloAtual()}`);
  },
  zoom: (d) => {
    if (d.v === 'mais') zoomMapa(1.25);
    else if (d.v === 'menos') zoomMapa(1 / 1.25);
    else mapaInteiro();
  },
  'rever-erradas': () => { E.conferir = 0; ir('conferencia'); },
  'conferir-prox': () => { E.conferir += 1; ir('conferencia'); },
  revisar: () => partirRevisao(false),
  'revisar-todas': () => partirRevisao(true),
  'sim-filtro': (d) => { E.simFiltro = d.v; render(); },
  simular: d => partirSimulado(Number(d.ano), d.apl, d.parte),
  aba: (d) => { E.torreAba = d.id; render(); document.querySelector('.conteudo')?.scrollTo(0, 0); },
  'ano-torre': (d) => { E.torreAno = Number(d.ano); E.manterRolagem = true; render(); },
  'ver-proposta': (d) => {
    const item = E.redacao.find(a => a.ano === Number(d.ano));
    const t = item.temas[Number(d.i)];
    abrirLeitor(t.tema, `Enem ${item.ano} · ${t.aplicacao}`, t.paginas, t.fonte, null);
  },
  'ver-exemplo': (d) => {
    const item = E.redacao.find(a => a.ano === Number(d.ano));
    const x = item.exemplos[Number(d.i)];
    const chave = `${item.ano}-${d.i}`;
    abrirLeitor(`${x.titulo}: Enem ${item.ano}`, x.selo, x.paginas, x.fonte, x.arquivo);
    if (!E.save.lidas[chave]) {
      E.save.lidas[chave] = hoje();
      E.save.xp += XP_LEITURA;
      avisar(`+${XP_LEITURA} XP pela leitura`);
      for (const c of verificarConquistas()) {
        avisar(`Conquista ${GRAUS[c.grau]}: ${c.nome}. Título liberado: ${c.titulo}`);
        avisarEspolio(`Prêmio da conquista ${c.nome}`, E.premiosConquista[c.id]);
      }
      salvar();
      E.manterRolagem = true;
      render();
    }
  },
  'abrir-link': (d) => {
    const item = E.redacao.find(a => a.ano === Number(d.ano));
    if (window.enem) window.enem.abrirLink(item.link.url); else window.open(item.link.url);
  },
  'abrir-pdf': async (d) => {
    if (!window.enem) return;
    const ok = await window.enem.abrirPdf(d.arquivo);
    if (!ok) avisar('Não encontrei esse PDF na pasta documentos_redacao.', 'erro');
  },
  'fechar-modal': () => { E.modal = null; renderModal(); },
  'pedir-data': () => { E.modal = { tipo: 'data' }; renderModal(); },
  'salvar-data': () => {
    const valor = document.getElementById('campo-data')?.value || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) { avisar('Escolha uma data válida.'); return; }
    E.save.cfg.dataProva = valor;
    salvar();
    E.modal = null; renderModal();
    render();
  },
  'data-padrao': () => {
    E.save.cfg.dataProva = null;
    salvar();
    E.modal = null; renderModal();
    render();
  },
  cfg: (d) => {
    const numericos = ['meta', 'zoom'];
    E.save.cfg[d.chave] = numericos.includes(d.chave) ? Number(d.v) : d.v;
    salvar();
    E.manterRolagem = true;
    render();
  },
  'abrir-relatorio': () => { E.modal = { tipo: 'relatorio', linhas: E.relatorio?.fora || [] }; renderModal(); },
  'pedir-reinicio': () => {
    E.modal = { tipo: 'confirmar', titulo: 'Apagar todo o progresso?', texto: 'Personagem, XP, histórico e fila de revisão serão apagados.', botao: 'Apagar tudo', acao: 'reiniciar', perigo: true };
    renderModal();
  },
  reiniciar: () => {
    E.save = saveNovo();
    E.dev = null;
    E.modal = null; renderModal();
    salvar(true);
    ir('criar');
  },
  ...ACOES_ITENS, // inventário, itens nas questões, fabricação, loja e modo desenvolvedor
};
function guardarNome() {
  const el = document.getElementById('nome-heroi');
  if (el) E.criacao.nome = el.value;
}
/* Atualiza a marcação sem refazer a tela: refazer recarregaria as imagens e perderia a rolagem. */
function atualizarMarcas() {
  document.querySelectorAll('.alternativas .letra').forEach((b) => {
    const l = b.dataset.riscar;
    b.classList.toggle('selecionada', E.selecao === l);
    b.classList.toggle('riscada', E.riscadas.has(l));
    b.setAttribute('aria-checked', E.selecao === l);
  });
  document.querySelectorAll('.zona[data-letra]').forEach((z) => {
    z.classList.toggle('selecionada', E.selecao === z.dataset.letra);
    z.classList.toggle('riscada', E.riscadas.has(z.dataset.letra));
  });
  const b = document.querySelector('[data-acao="confirmar"]');
  if (b) b.disabled = !E.selecao;
}

document.addEventListener('click', (ev) => {
  // o clique que encerra um arraste do mapa não abre o lugar onde o cursor parou
  if (performance.now() - E.fimArrasto < 60 && ev.target.closest('svg.mapa')) return;
  const alvo = ev.target.closest('[data-acao]');
  if (!alvo || alvo.disabled) {
    if (ev.target.id === 'modal') { E.modal = null; renderModal(); }
    return;
  }
  ACOES[alvo.dataset.acao]?.(alvo.dataset);
});
document.addEventListener('contextmenu', (ev) => {
  const alvo = ev.target.closest('[data-riscar], .zona[data-letra]');
  if (!alvo || alvo.disabled) return;
  ev.preventDefault();
  const l = alvo.dataset.riscar || alvo.dataset.letra;
  if (E.riscadas.has(l)) E.riscadas.delete(l); else E.riscadas.add(l);
  if (E.selecao === l) E.selecao = null;
  atualizarMarcas();
});
document.addEventListener('change', (ev) => {
  const c = ev.target.dataset?.check;
  if (c !== undefined) {
    const i = Number(c);
    if (ev.target.checked) E.checklist.add(i); else E.checklist.delete(i);
  }
  if (ev.target.dataset?.mudar === 'ano') { E.filtro.ano = ev.target.value; E.manterRolagem = true; render(); }
});
document.addEventListener('keydown', (ev) => {
  const campo = ['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName);
  if (ev.key === 'Escape' && E.modal) { E.modal = null; renderModal(); return; }
  if (ev.key === 'Enter' && E.modal?.tipo === 'data') { ev.preventDefault(); ACOES['salvar-data'](); return; }
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('.no')) { ev.preventDefault(); ev.target.click(); return; }
  if (E.tela === 'mapa' && !campo && !E.modal && !ev.ctrlKey && !ev.altKey) {
    if (ev.key === '+' || ev.key === '=') { zoomMapa(1.25); return; }
    if (ev.key === '-' || ev.key === '_') { zoomMapa(1 / 1.25); return; }
    if (ev.key === '0') { mapaInteiro(); return; }
  }
  if (campo || E.modal || E.tela !== 'questao' || !E.save?.atual) return;
  const s = E.save.atual;
  const q = E.porId.get(s.ids[s.i]);
  const respondida = s.tipo !== 'simulado' && s.respostas[q.id];
  const letra = ev.key.toUpperCase();
  if (LETRAS.includes(letra) && eliminadasDa(s, q.id).includes(letra)) return;
  if (LETRAS.includes(letra) && !respondida && !ev.ctrlKey && !ev.altKey) {
    E.selecao = letra;
    E.riscadas.delete(letra);
    atualizarMarcas();
  } else if (ev.key === 'Enter') {
    ev.preventDefault();
    if (respondida) proxima(); else confirmar();
  } else if (s.tipo === 'simulado' && ev.key === 'ArrowRight' && s.i < s.ids.length - 1) {
    irQuestao(s.i + 1);
  } else if (s.tipo === 'simulado' && ev.key === 'ArrowLeft' && s.i > 0) {
    irQuestao(s.i - 1);
  }
});
window.addEventListener('beforeunload', () => {
  const s = E.save?.atual;
  if (s && !s.pausada) { s.gasto += Date.now() - s.inicio; s.inicio = Date.now(); s.pausada = true; }
  if (!E.save) return;
  clearTimeout(temporizadorSave);
  if (window.enem) window.enem.salvarAoFechar(JSON.stringify(E.save));
  else salvar(true);
});

/* ---- início ----------------------------------------------------------- */
async function buscarJSON(nome) {
  const r = await fetch(BASE_BANCO + nome);
  if (!r.ok) throw new Error(`${nome}: ${r.status}`);
  return r.json();
}
async function iniciar() {
  render();
  try {
    const [banco, redacao, matriz, fora] = await Promise.all([
      buscarJSON('questoes.json'), buscarJSON('redacao.json'), buscarJSON('matriz.json'), buscarJSON('fora.json'),
    ]);
    E.banco = banco;
    E.porId = new Map(banco.map(q => [q.id, q]));
    E.redacao = redacao;
    E.matriz = matriz;
    E.relatorio = fora;
    E.save = await carregarSave();
    // itens: completa o save e dá, uma vez, o prêmio das conquistas que já existiam
    const retroativos = prepararItens();
    if (retroativos) {
      salvar();
      setTimeout(() => avisarEspolio(`Recompensas das ${retroativos.conquistas} conquistas que você já tinha`, retroativos.entradas), 900);
    }
    if (E.save.atual) {
      const s = E.save.atual;
      if (s.ids.some(id => !E.porId.has(id))) E.save.atual = null;
      else s.pausada = true;
    }
    E.tela = E.save.heroi ? 'mapa' : 'criar';
    render();
  } catch (e) {
    console.error(e);
    $app.innerHTML = `<div class="centro"><h1>Não consegui abrir o banco de questões</h1>
      <p>Confira se a pasta <code>banco</code> continua ao lado da pasta <code>app</code>.</p><p class="sub">${esc(e.message)}</p></div>`;
  }
}
iniciar();
