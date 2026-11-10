'use strict';
/* Itens do ENEM RPG: catálogo, raridades, tabelas de recompensa, monstros errantes, receitas,
   loja, missões do dia e regras por modo de jogo.

   Tudo aqui é dado. Para criar um item novo basta acrescentá-lo em ITENS; se tiver "drop: true"
   ele já entra nos sorteios da sua raridade, e pode também ganhar uma receita (RECEITAS), um lugar
   na loja (LOJA) ou virar prêmio de conquista (PREMIO_CONQUISTA). A lógica fica em inventario.js.

   Efeitos de uso (consumíveis e pergaminhos, campo "uso"):
     eliminar (n)       tira n alternativas erradas da questão (no máximo LIMITES.eliminadas)
     pista              mostra a competência e a habilidade que a questão cobra (Matriz do INEP)
     segunda_chance     se errar, a alternativa é riscada e você responde de novo
     protege_sequencia  se errar, a sequência de acertos não zera
   Bônus de equipamento e relíquia (campo "bonus"):
     xp, xpArea [área, %], xpRevisao, xpErro (pontos), moedas (%), bau (pontos de %), sorte,
     golpe (golpe duplo no Sábio a partir de N acertos seguidos), escudo (erros protegidos por sessão)
   Poderes (campo "poder", em artefatos e mascotes): um efeito de uso com cargas por sessão. */

const RARIDADES = {
  comum: { nome: 'Comum', ordem: 1 },
  incomum: { nome: 'Incomum', ordem: 2 },
  raro: { nome: 'Raro', ordem: 3 },
  epico: { nome: 'Épico', ordem: 4 },
  lendario: { nome: 'Lendário', ordem: 5 },
  mitico: { nome: 'Mítico', ordem: 6 },
};
const ORDEM_RARIDADES = Object.keys(RARIDADES);

const CATEGORIAS = {
  consumivel: { nome: 'Consumíveis', um: 'Consumível' },
  pergaminho: { nome: 'Pergaminhos', um: 'Pergaminho' },
  artefato: { nome: 'Artefatos', um: 'Artefato' },
  arma: { nome: 'Armas', um: 'Arma' },
  armadura: { nome: 'Armaduras', um: 'Armadura' },
  acessorio: { nome: 'Acessórios', um: 'Acessório' },
  mascote: { nome: 'Mascotes', um: 'Mascote' },
  reliquia: { nome: 'Relíquias', um: 'Relíquia' },
  material: { nome: 'Materiais', um: 'Material' },
  bau: { nome: 'Baús', um: 'Baú' },
};

/* Espaços de equipamento do herói. Relíquias não ocupam espaço: valem sempre. */
const ESPACOS = [
  { id: 'arma', nome: 'Arma', categoria: 'arma' },
  { id: 'armadura', nome: 'Armadura', categoria: 'armadura' },
  { id: 'acessorio1', nome: 'Acessório', categoria: 'acessorio' },
  { id: 'acessorio2', nome: 'Acessório', categoria: 'acessorio' },
  { id: 'artefato', nome: 'Artefato', categoria: 'artefato' },
  { id: 'mascote', nome: 'Mascote', categoria: 'mascote' },
];

const ITENS = [
  // ---- consumíveis: usados durante uma questão ----
  { id: 'pocao_clareza', nome: 'Poção da Clareza', cat: 'consumivel', rar: 'comum', icone: 'pocao', cor: '#7fd3ff', drop: true,
    desc: 'Um gole e as ideias se assentam.',
    efeito: 'Elimina uma alternativa errada da questão. Acertar com ajuda vale metade.',
    uso: [{ efeito: 'eliminar', n: 1 }] },
  { id: 'pocao_memoria', nome: 'Poção da Memória', cat: 'consumivel', rar: 'comum', icone: 'pocao', cor: '#c49bff', drop: true,
    desc: 'Desperta lembranças do que você já estudou.',
    efeito: 'Mostra a competência e a habilidade que a questão cobra, segundo a Matriz do INEP.',
    uso: [{ efeito: 'pista' }] },
  { id: 'pocao_concentracao', nome: 'Poção da Concentração', cat: 'consumivel', rar: 'incomum', icone: 'pocao', cor: '#ffb35c', drop: true,
    desc: 'Afasta as distrações por um instante.',
    efeito: 'Se você errar a questão, sua sequência de acertos não zera. Só é gasta se você errar.',
    uso: [{ efeito: 'protege_sequencia' }] },
  { id: 'elixir_segunda_chance', nome: 'Elixir da Segunda Chance', cat: 'consumivel', rar: 'raro', icone: 'elixir', cor: '#ff6b8a', drop: true,
    desc: 'Ninguém acerta tudo de primeira.',
    efeito: 'Se você errar, a alternativa é riscada e você responde de novo. O acerto vale metade e a questão vai para a revisão. Só é gasto se você errar.',
    uso: [{ efeito: 'segunda_chance' }] },
  { id: 'pocao_sabedoria', nome: 'Poção da Sabedoria', cat: 'consumivel', rar: 'epico', icone: 'pocao', cor: '#ffd86b', drop: true,
    desc: 'Destilada nas torres do Reino do Sábio.',
    efeito: 'Elimina duas alternativas erradas. Acertar com ajuda vale metade.',
    uso: [{ efeito: 'eliminar', n: 2 }] },

  // ---- pergaminhos: valem só nas questões do seu reino ----
  { id: 'perg_letras', nome: 'Pergaminho das Letras', cat: 'pergaminho', rar: 'incomum', icone: 'pergaminho', cor: '#4a6fbd', area: 'LC', drop: true,
    desc: 'Anotações de um escriba do Reino das Letras.',
    efeito: 'Numa questão de Linguagens: elimina uma alternativa errada e mostra a habilidade cobrada.',
    uso: [{ efeito: 'eliminar', n: 1 }, { efeito: 'pista' }] },
  { id: 'perg_humanidades', nome: 'Pergaminho das Humanidades', cat: 'pergaminho', rar: 'incomum', icone: 'pergaminho', cor: '#c0603f', area: 'CH', drop: true,
    desc: 'Copiado dos arquivos do Salão dos Conselhos.',
    efeito: 'Numa questão de Humanas: elimina uma alternativa errada e mostra a habilidade cobrada.',
    uso: [{ efeito: 'eliminar', n: 1 }, { efeito: 'pista' }] },
  { id: 'perg_natureza', nome: 'Pergaminho da Natureza', cat: 'pergaminho', rar: 'incomum', icone: 'pergaminho', cor: '#5fa44a', area: 'CN', drop: true,
    desc: 'Cheira a ervas do Jardim da Vida.',
    efeito: 'Numa questão de Natureza: elimina uma alternativa errada e mostra a habilidade cobrada.',
    uso: [{ efeito: 'eliminar', n: 1 }, { efeito: 'pista' }] },
  { id: 'perg_numeros', nome: 'Pergaminho dos Números', cat: 'pergaminho', rar: 'incomum', icone: 'pergaminho', cor: '#2f9aa6', area: 'MT', drop: true,
    desc: 'Cheio de contas feitas nas margens.',
    efeito: 'Numa questão de Matemática: elimina uma alternativa errada e mostra a habilidade cobrada.',
    uso: [{ efeito: 'eliminar', n: 1 }, { efeito: 'pista' }] },
  { id: 'perg_universal', nome: 'Pergaminho da Sabedoria Universal', cat: 'pergaminho', rar: 'lendario', icone: 'pergaminho', cor: '#e8b341', drop: true,
    desc: 'Escrito pelo próprio Sábio, vale para qualquer reino.',
    efeito: 'Em qualquer questão: elimina duas alternativas erradas e mostra a habilidade cobrada.',
    uso: [{ efeito: 'eliminar', n: 2 }, { efeito: 'pista' }] },

  // ---- artefatos: um equipado por vez ----
  { id: 'bussola_conhecimento', nome: 'Bússola do Conhecimento', cat: 'artefato', rar: 'incomum', icone: 'bussola', cor: '#d8484a', drop: true,
    desc: 'Aponta para onde os tesouros se escondem.',
    efeito: '+6% de chance de encontrar baús entre as questões.',
    bonus: { bau: 6 } },
  { id: 'orbe_deducao', nome: 'Orbe da Dedução', cat: 'artefato', rar: 'raro', icone: 'orbe', cor: '#8fa8ff', drop: true,
    desc: 'Brilha mais forte perto das respostas erradas.',
    efeito: 'Uma vez por sessão: elimina uma alternativa errada.',
    poder: { efeito: 'eliminar', n: 1, cargas: 1 } },
  { id: 'ampulheta_tempo', nome: 'Ampulheta do Tempo', cat: 'artefato', rar: 'epico', icone: 'ampulheta', cor: '#e8c766', drop: true,
    desc: 'Volta a areia, e o momento, só um pouquinho.',
    efeito: 'Uma vez por sessão: se errar, você responde de novo. O acerto vale metade e a questão vai para a revisão.',
    poder: { efeito: 'segunda_chance', cargas: 1 } },

  // ---- armas ----
  { id: 'espada_aprendiz', nome: 'Espada do Aprendiz', cat: 'arma', rar: 'comum', icone: 'espada', cor: '#c9d2dc', cor2: '#9a7444', drop: true,
    desc: 'A primeira lâmina de todo herói.',
    efeito: '+5% nas moedas que você ganha.',
    bonus: { moedas: 5 } },
  { id: 'lamina_conhecimento', nome: 'Lâmina do Conhecimento', cat: 'arma', rar: 'raro', icone: 'espada', cor: '#7fb4ff', cor2: '#3f5f9c', drop: true,
    desc: 'Corta mais fundo quando você está embalado.',
    efeito: 'No Reino do Sábio, com 3 ou mais acertos seguidos, cada golpe tira 2 de vida.',
    bonus: { golpe: 3 } },
  { id: 'excalibur_sabedoria', nome: 'Excalibur da Sabedoria', cat: 'arma', rar: 'lendario', icone: 'espada', cor: '#ffe28a', cor2: '#c9932e', drop: true,
    desc: 'Só sai da pedra para quem estuda todo dia.',
    efeito: '+10% de XP em todas as áreas e golpe duplo no Sábio a partir de 2 acertos seguidos.',
    bonus: { xp: 10, golpe: 2 } },

  // ---- armaduras ----
  { id: 'tunica_estudante', nome: 'Túnica do Estudante', cat: 'armadura', rar: 'comum', icone: 'tunica', cor: '#7c8fb3', drop: true,
    desc: 'Confortável para longas horas de estudo.',
    efeito: '+2 XP em cada erro: errar também ensina.',
    bonus: { xpErro: 2 } },
  { id: 'armadura_persistencia', nome: 'Armadura da Persistência', cat: 'armadura', rar: 'raro', icone: 'armadura', cor: '#9fb0c4', drop: true,
    desc: 'Forjada com cada recomeço.',
    efeito: 'Uma vez por sessão, o primeiro erro não zera a sua sequência de acertos.',
    bonus: { escudo: 1 } },

  // ---- acessórios: até dois equipados ----
  { id: 'anel_curiosidade', nome: 'Anel da Curiosidade', cat: 'acessorio', rar: 'comum', icone: 'anel', cor: '#6fd3ff', drop: true,
    desc: 'Gira sozinho quando há algo a descobrir.',
    efeito: '+4% de chance de encontrar baús entre as questões.',
    bonus: { bau: 4 } },
  { id: 'colar_memoria', nome: 'Colar da Memória', cat: 'acessorio', rar: 'incomum', icone: 'colar', cor: '#b08cff', drop: true,
    desc: 'Guarda o que você aprendeu com os próprios erros.',
    efeito: '+15% de XP na Masmorra dos Erros.',
    bonus: { xpRevisao: 15 } },
  { id: 'coroa_conhecimento', nome: 'Coroa do Conhecimento', cat: 'acessorio', rar: 'lendario', icone: 'coroa', cor: '#ff5f8f', drop: true,
    desc: 'Pesada como a responsabilidade de saber.',
    efeito: 'Os itens que você encontra tendem a ser mais raros, e as moedas rendem 10% a mais.',
    bonus: { sorte: 1, moedas: 10 } },

  // ---- mascotes: um ativo por vez (preparados para evoluir no futuro) ----
  { id: 'athena', nome: 'Athena, a Coruja Sábia', cat: 'mascote', rar: 'raro', icone: 'coruja', cor: '#b08a55',
    desc: 'Pousa no seu ombro e cochicha o que importa.',
    efeito: '+5% de XP e, uma vez por sessão, mostra de graça a habilidade cobrada.',
    bonus: { xp: 5 }, poder: { efeito: 'pista', cargas: 1 } },
  { id: 'fenix_celestial', nome: 'Fênix Celestial', cat: 'mascote', rar: 'mitico', icone: 'fenix', cor: '#ff7a3c',
    desc: 'Renasce de cada erro, mais forte.',
    efeito: '+10% de XP, um erro por sessão sem perder a sequência e uma segunda chance por sessão.',
    bonus: { xp: 10, escudo: 1 }, poder: { efeito: 'segunda_chance', cargas: 1 } },

  // ---- relíquias: ganhas por conquistas, valem sempre ----
  { id: 'medalha_primeiro_passo', nome: 'Medalha do Primeiro Passo', cat: 'reliquia', rar: 'incomum', icone: 'medalha', cor: '#fff3c4', cor2: '#4a6fbd',
    desc: 'Todo grande caminho começa com uma questão.',
    efeito: '+5% nas moedas, para sempre.',
    bonus: { moedas: 5 } },
  { id: 'insignia_persistencia', nome: 'Insígnia da Persistência', cat: 'reliquia', rar: 'raro', icone: 'insignia', cor: '#4a8fe0',
    desc: 'Para quem volta todos os dias.',
    efeito: '+3% de chance de encontrar baús, para sempre.',
    bonus: { bau: 3 } },
  { id: 'coracao_conhecimento', nome: 'Coração do Conhecimento', cat: 'reliquia', rar: 'mitico', icone: 'coracao', cor: '#ff5fa8',
    desc: 'O que resta quando todas as perguntas foram respondidas.',
    efeito: '+10% de XP e de moedas, para sempre.',
    bonus: { xp: 10, moedas: 10 } },

  // ---- materiais: para a fabricação ----
  { id: 'essencia_slime', nome: 'Essência de Slime', cat: 'material', rar: 'comum', icone: 'gota', cor: '#7fe08a', drop: true,
    desc: 'Pegajosa, mas ótima base para poções.', efeito: 'Material de fabricação.' },
  { id: 'fragmento_cristal', nome: 'Fragmento de Cristal', cat: 'material', rar: 'comum', icone: 'cristal', cor: '#9fd8ff', drop: true,
    desc: 'Lasca de um cristal que guarda luz.', efeito: 'Material de fabricação.' },
  { id: 'po_conhecimento', nome: 'Pó de Conhecimento', cat: 'material', rar: 'incomum', icone: 'po', cor: '#ffe27a', drop: true,
    desc: 'Brilha quando alguém aprende alguma coisa por perto.', efeito: 'Material de fabricação.' },
  { id: 'runa_sabedoria', nome: 'Runa da Sabedoria', cat: 'material', rar: 'raro', icone: 'runa', cor: '#8fd0ff', drop: true,
    desc: 'Pedra gravada com um símbolo antigo.', efeito: 'Material de fabricação.' },
  { id: 'coracao_dragao', nome: 'Coração do Dragão', cat: 'material', rar: 'epico', icone: 'coracao', cor: '#e0453a', drop: true,
    desc: 'Ainda quente. Muito quente.', efeito: 'Material de fabricação.' },

  // ---- baús: abertos no inventário ----
  { id: 'bau_madeira', nome: 'Baú de Madeira', cat: 'bau', rar: 'comum', icone: 'bau', cor: '#9a6a3a', cor2: '#c9a24a', drop: true, abre: 'bau_madeira',
    desc: 'Pode ter um pouco de tudo.', efeito: 'Abra para ganhar moedas e 1 ou 2 itens, quase sempre comuns.' },
  { id: 'bau_prata', nome: 'Baú de Prata', cat: 'bau', rar: 'raro', icone: 'bau', cor: '#7d8796', cor2: '#e6edf5', drop: true, abre: 'bau_prata',
    desc: 'Pesado. Promissor.', efeito: 'Abra para ganhar moedas e 2 ou 3 itens, a partir de incomuns.' },
  { id: 'bau_ouro', nome: 'Baú de Ouro', cat: 'bau', rar: 'lendario', icone: 'bau', cor: '#c9932e', cor2: '#ffe28a', drop: true, abre: 'bau_ouro',
    desc: 'Dizem que só aparece para quem não desiste.', efeito: 'Abra para ganhar muitas moedas e 2 ou 3 itens, a partir de raros.' },
];

/* Tabelas de recompensa. chance: probabilidade de cair item; qtd: quantos itens; raridades:
   pesos do sorteio de raridade; cats: categorias que podem cair; moedas: [mínimo, máximo].
   O sorteio só usa itens com "drop: true". Mítico nunca cai: vem de grandes conquistas. */
const TODAS_CATS_DROP = ['material', 'consumivel', 'pergaminho', 'arma', 'armadura', 'acessorio', 'artefato'];
const TABELAS_DROP = {
  inimigo: { moedas: [2, 5], chance: 0.4, qtd: [1, 1], raridades: { comum: 78, incomum: 20, raro: 2 }, cats: ['material', 'consumivel'] },
  inimigo_forte: { moedas: [4, 8], chance: 0.55, qtd: [1, 1], raridades: { comum: 62, incomum: 30, raro: 7, epico: 1 }, cats: ['material', 'consumivel', 'pergaminho'] },
  chefe: { moedas: [15, 25], chance: 1, qtd: [1, 2], raridades: { incomum: 50, raro: 35, epico: 12, lendario: 3 }, cats: [...TODAS_CATS_DROP, 'bau'] },
  guardiao: { moedas: [6, 12], chance: 0.8, qtd: [1, 1], raridades: { comum: 50, incomum: 36, raro: 12, epico: 2 }, cats: ['material', 'consumivel', 'pergaminho', 'arma', 'armadura', 'acessorio'] },
  bau_madeira: { moedas: [5, 15], chance: 1, qtd: [1, 2], raridades: { comum: 68, incomum: 27, raro: 5 }, cats: ['material', 'consumivel', 'pergaminho', 'arma', 'armadura', 'acessorio'] },
  bau_prata: { moedas: [15, 35], chance: 1, qtd: [2, 3], raridades: { incomum: 52, raro: 36, epico: 10, lendario: 2 }, cats: TODAS_CATS_DROP },
  bau_ouro: { moedas: [40, 80], chance: 1, qtd: [2, 3], raridades: { raro: 50, epico: 38, lendario: 12 }, cats: TODAS_CATS_DROP },
  mimico: { moedas: [20, 40], chance: 1, qtd: [1, 2], raridades: { incomum: 40, raro: 45, epico: 15 }, cats: TODAS_CATS_DROP },
};

/* Baús entre as questões: chance base em %, extra pela dificuldade (nível TRI 0 a 3), o tipo do
   baú e a chance de ser um Mímico Enganador (que só entrega o tesouro se você acertar a próxima). */
const BAUS = {
  chanceBase: 5,
  porNivel: [0, 0, 1, 2],
  tipos: [['bau_madeira', 85], ['bau_prata', 13.5], ['bau_ouro', 1.5]],
  chanceMimico: 10,
};

/* Fim de sessão. O guardião só deixa espólio para quem enfrentou a sessão: pelo menos "minimo"
   questões (ou todas, se a sessão tiver menos), com chance maior a partir de "longa" questões.
   O simulado dá um baú por dia, para que responder no chute não vire fonte de itens. */
const ESPOLIO_GUARDIAO = { minimo: 5, chance: 0.5, longa: 10, chanceLonga: 0.85 };
const PREMIO_SIMULADO = { minimo: 20, bau: 'bau_madeira', diaInteiro: 80, bauDiaInteiro: 'bau_prata' };

/* Monstros errantes: aparecem de vez em quando no Reino do Sábio, no lugar de um inimigo comum,
   trazem questões de qualquer área e deixam os itens da própria lista (pesos). */
const CHANCE_ERRANTE = 0.15;
const MONSTROS_ERRANTES = [
  { id: 'slime', nome: 'Slime da Confusão', frase: 'Gruda nas ideias e deixa tudo meloso.', hp: 2, peso: 30, moedas: [3, 5],
    drops: [['essencia_slime', 70], ['fragmento_cristal', 20], ['pocao_concentracao', 10]] },
  { id: 'esqueleto', nome: 'Esqueleto Esquecido', frase: 'Lembra de tudo, menos do que você estudou.', hp: 3, peso: 25, moedas: [4, 7],
    drops: [['fragmento_cristal', 55], ['po_conhecimento', 30], ['perg_humanidades', 15]] },
  { id: 'mago', nome: 'Mago das Ilusões', frase: 'Faz a alternativa errada parecer a certa.', hp: 3, peso: 22, moedas: [5, 8],
    drops: [['pocao_clareza', 45], ['po_conhecimento', 45], ['orbe_deducao', 10]] },
  { id: 'golem', nome: 'Golem da Ignorância', frase: 'Pesado, teimoso e sem vontade de aprender.', hp: 4, peso: 18, moedas: [6, 10],
    drops: [['fragmento_cristal', 50], ['runa_sabedoria', 35], ['po_conhecimento', 15]] },
  { id: 'dragao', nome: 'Dragão do Tempo', frase: 'Cada segundo dele vale uma era.', hp: 5, peso: 5, ondaMinima: 6, moedas: [20, 30],
    drops: [['runa_sabedoria', 45], ['coracao_dragao', 40], ['ampulheta_tempo', 15]] },
];
// entram no bestiário do Sábio como mais um grupo de inimigos
REINOS_INIMIGOS.errante = { nome: 'Monstros errantes', cor: 'errante' };
INIMIGOS.errante = MONSTROS_ERRANTES.map(m => [m.nome, m.frase]);

/* Cada conquista dá moedas e um item conforme o grau; algumas dão relíquias e mascotes. */
const PREMIO_GRAU = {
  1: { moedas: 10, item: 'pocao_clareza' },
  2: { moedas: 20, item: 'bau_madeira' },
  3: { moedas: 35, item: 'bau_prata' },
  4: { moedas: 60, item: 'bau_prata' },
  5: { moedas: 100, item: 'bau_ouro' },
};
const PREMIO_CONQUISTA = {
  primeira: 'medalha_primeiro_passo',
  chefe1: 'athena',
  dias7: 'insignia_persistencia',
  quatro: 'fenix_celestial',
  todas: 'coracao_conhecimento',
};

/* Fabricação: materiais (e às vezes moedas) viram itens. "req" libera a receita por nível ou
   conquista; sem "req", ela vale desde o começo. */
const RECEITAS = [
  { id: 'r_clareza', item: 'pocao_clareza', mats: { essencia_slime: 3, fragmento_cristal: 1 } },
  { id: 'r_memoria', item: 'pocao_memoria', mats: { essencia_slime: 2, fragmento_cristal: 1 } },
  { id: 'r_concentracao', item: 'pocao_concentracao', mats: { essencia_slime: 2, po_conhecimento: 1 }, req: { nivel: 3 } },
  { id: 'r_perg_letras', item: 'perg_letras', mats: { fragmento_cristal: 3, po_conhecimento: 1 }, req: { nivel: 4 } },
  { id: 'r_perg_humanidades', item: 'perg_humanidades', mats: { fragmento_cristal: 3, po_conhecimento: 1 }, req: { nivel: 4 } },
  { id: 'r_perg_natureza', item: 'perg_natureza', mats: { fragmento_cristal: 3, po_conhecimento: 1 }, req: { nivel: 4 } },
  { id: 'r_perg_numeros', item: 'perg_numeros', mats: { fragmento_cristal: 3, po_conhecimento: 1 }, req: { nivel: 4 } },
  { id: 'r_segunda', item: 'elixir_segunda_chance', mats: { po_conhecimento: 2, runa_sabedoria: 1 }, req: { nivel: 6 } },
  { id: 'r_orbe', item: 'orbe_deducao', mats: { fragmento_cristal: 4, runa_sabedoria: 2 }, moedas: 40, req: { nivel: 8 } },
  { id: 'r_ampulheta', item: 'ampulheta_tempo', mats: { po_conhecimento: 3, runa_sabedoria: 2, coracao_dragao: 1 }, req: { conquista: 'chefe1' } },
  { id: 'r_sabedoria', item: 'pocao_sabedoria', mats: { runa_sabedoria: 2, coracao_dragao: 1 }, req: { nivel: 12 } },
];

/* Loja: só itens simples, com limite por dia, para que acumular moedas não vire vantagem. */
const LOJA = [
  { item: 'pocao_memoria', preco: 20, limite: 3 },
  { item: 'pocao_clareza', preco: 30, limite: 3 },
  { item: 'pocao_concentracao', preco: 45, limite: 2 },
  { item: 'essencia_slime', preco: 8, limite: 5 },
  { item: 'fragmento_cristal', preco: 10, limite: 5 },
  { item: 'bau_madeira', preco: 40, limite: 1 },
  { item: 'espada_aprendiz', preco: 60, limite: 1 },
  { item: 'tunica_estudante', preco: 60, limite: 1 },
  { item: 'anel_curiosidade', preco: 80, limite: 1 },
];
/* Moedas recebidas ao vender um item (mítico não se vende). Equipamento repetido vira o dobro. */
const VALOR_VENDA = { comum: 3, incomum: 8, raro: 20, epico: 50, lendario: 120 };

/* Missões do dia: valem uma vez por dia e se renovam à meia-noite. */
const MISSOES = [
  { id: 'meta', nome: 'Meta do dia', texto: c => `Responder ${c.meta} questões hoje`, alvo: c => c.meta, valor: c => c.hojeQ,
    premio: { item: 'bau_prata' } },
  { id: 'acertos', nome: 'Mira afiada', texto: () => 'Acertar 10 questões hoje', alvo: () => 10, valor: c => c.hojeA,
    premio: { moedas: 20, item: 'fragmento_cristal' } },
  { id: 'sessoes', nome: 'Duas jornadas', texto: () => 'Concluir 2 sessões hoje', alvo: () => 2, valor: c => c.hojeSessoes,
    premio: { moedas: 15, item: 'essencia_slime', qtd: 2 } },
];

/* O que cada modo permite. consumiveis: 'todos', 'nenhum' ou a lista de efeitos liberados;
   poderes: true, false ou a lista de efeitos; bonus: bônus passivos de XP e moedas. */
const REGRAS_MODO = {
  expedicao: { nome: 'Exploração e treino', consumiveis: 'todos', poderes: true, baus: true, bonus: true },
  sabio: { nome: 'Reino do Sábio', consumiveis: 'todos', poderes: true, baus: true, bonus: true },
  revisao: { nome: 'Masmorra dos Erros', consumiveis: ['pista', 'protege_sequencia'], poderes: ['pista'], baus: true, bonus: true,
    aviso: 'Na Masmorra você enfrenta os próprios erros: só pistas e proteção de sequência.' },
  simulado: { nome: 'Simulado Enem', consumiveis: 'nenhum', poderes: false, baus: false, bonus: true,
    aviso: 'No simulado a prova é igual para todos: nenhum item muda as condições.' },
  ranking: { nome: 'Ranking competitivo', consumiveis: 'nenhum', poderes: false, baus: false, bonus: false }, // preparado para o futuro
};

/* Limites que seguram o equilíbrio: bônus somados de XP e moedas (%), chance extra de baú e quantas
   alternativas um jogador pode eliminar numa questão (sobram sempre três para pensar). */
const LIMITES = { xp: 25, moedas: 30, bau: 15, eliminadas: 2 };
const AJUDA_FATOR = 0.5; // acerto com alternativa eliminada ou segunda chance vale metade
