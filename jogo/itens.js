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
     fortuna (moedas, bau)  até o fim da sessão: +moedas % e +bau pontos de chance de baú
     descoberta         a próxima recompensa da sessão traz um item a mais
     protege_sessao     até o fim da sessão, o primeiro erro não zera a sequência
   Segunda chance, proteções e descoberta ficam prontas e só gastam o item quando agem.
   Bônus de equipamento, mascote e relíquia (campo "bonus"):
     xp, xpArea [área, %], xpRevisao, xpErro (pontos), moedas (%), bau (pontos de %), sorte,
     golpe (golpe duplo no Sábio a partir de N acertos seguidos), escudo (erros protegidos por sessão),
     moedasExpedicao (% só nas expedições), errante (pontos de % de monstro errante no Sábio),
     moedasGuardiao (moedas por guardião ou chefe vencido), xpExpedicao (% do XP de conclusão de
     expedição), chanceGuardiao (pontos de % de item do guardião nas expedições), materialExtra e
     materialBasico (% de material depois de batalhas), missaoReino (moedas a mais em cada missão
     de reino), evento (pontos de % de evento especial), segredos (multiplica a chance de a
     passagem secreta ser o evento sorteado), revisaoCompleta (moedas ao completar a Masmorra),
     bauRaro (multiplica a chance de baús de Prata e Ouro), tesouro (Mímicos segurados por sessão;
     também guarda as moedas do guardião não vencido), raridade { epico: %, lendario: % } (itens
     mais raros nas recompensas), cincoReinos (item dado ao concluir os cinco reinos no mesmo dia),
     xpSimulado (% de XP no Simulado), chama (até N% de XP, +1% por dia seguido de estudo),
     eco (% de XP ao acertar fora da Masmorra uma questão já errada), lente (mostra o acerto na
     habilidade depois da resposta), materialReino (% de achar o material do reino do mascote
     nos acertos da área dele; o mascote tem "area")
   Os bônus em números de armas, armaduras, acessórios e artefatos crescem com o aprimoramento
   (APRIMORAMENTO, no fim do arquivo).
   Poderes (campo "poder", em artefatos e mascotes): um efeito de uso com cargas por sessão.
   Outros campos:
     tabelas   o item só cai nessas tabelas de TABELAS_DROP (vale mesmo fora das categorias delas)
     ativo     uso pelo inventário, uma vez por mês (Relógio dos Destinos)
     evolucao  formas do mascote: por questões respondidas com ele equipado ou por conquistas;
               só a aparência muda (cores e as camadas --f2 e --f3 do ícone em index.html) */

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
  { id: 'pocao_fortuna', nome: 'Poção da Fortuna', cat: 'consumivel', rar: 'incomum', icone: 'pocao', cor: '#ffcf3f', drop: true,
    desc: 'Tem gosto de moeda nova.',
    efeito: 'Até o fim da sessão: +15% de moedas e +5 de chance de achar baús, dentro dos limites. Vale nas expedições e no Sábio.',
    uso: [{ efeito: 'fortuna', moedas: 15, bau: 5 }] },
  { id: 'pocao_descoberta', nome: 'Poção da Descoberta', cat: 'consumivel', rar: 'raro', icone: 'pocao', cor: '#3fd0c0', drop: true,
    desc: 'Faz o mundo mostrar um pouco mais do que costuma.',
    efeito: 'A próxima recompensa desta sessão (inimigo, chefe, Mímico ou guardião) traz um item a mais. Só é gasta quando a recompensa vem.',
    uso: [{ efeito: 'descoberta' }] },
  { id: 'elixir_determinacao', nome: 'Elixir da Determinação', cat: 'consumivel', rar: 'epico', icone: 'elixir', cor: '#ff8a3c', drop: true,
    desc: 'Para quem não deixa uma queda apagar o caminho feito.',
    efeito: 'Até o fim da sessão, o primeiro erro não zera sua sequência de acertos nem o bônus de pontos que ela dá. Só é gasto se você errar.',
    uso: [{ efeito: 'protege_sessao' }] },

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
  { id: 'bussola_explorador', nome: 'Bússola do Explorador', cat: 'artefato', rar: 'incomum', icone: 'bussola', cor: '#3fae6a', drop: true,
    desc: 'Sempre aponta para a próxima trilha.',
    efeito: '+10% de moedas nas expedições dos reinos e na Patrulha do dia.',
    bonus: { moedasExpedicao: 10 } },
  { id: 'lanterna_segredos', nome: 'Lanterna dos Segredos', cat: 'artefato', rar: 'raro', icone: 'lanterna', cor: '#ffd36b', drop: true,
    desc: 'A luz dela mostra o que estava escondido.',
    efeito: '+5 de chance de achar baús e +5 de chance de eventos especiais entre as questões, e as passagens secretas ficam duas vezes mais prováveis.',
    bonus: { bau: 5, evento: 5, segredos: 2 } },
  { id: 'relogio_destinos', nome: 'Relógio dos Destinos', cat: 'artefato', rar: 'mitico', icone: 'relogio', cor: '#d9b45a', cor2: '#1d2a4a',
    desc: 'Os ponteiros giram para onde você quiser, uma vez a cada lua.',
    efeito: 'Uma vez por mês, você escolhe um item lendário do jogo (menos mascotes). Não precisa estar equipado.',
    ativo: { escolher: 'lendario', exceto: ['mascote'] } },
  { id: 'lente_analista', nome: 'Lente do Analista', cat: 'artefato', rar: 'raro', icone: 'lente', cor: '#8fd0ff', drop: true,
    desc: 'Não mostra a resposta. Mostra você.',
    efeito: 'Depois de cada resposta, mostra quanto você já acertou nas questões daquela habilidade.',
    bonus: { lente: 1 } },

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
  { id: 'martelo_guardiao', nome: 'Martelo do Guardião', cat: 'arma', rar: 'incomum', icone: 'martelo', cor: '#9aa3ad', drop: true,
    desc: 'Pesado o bastante para impressionar qualquer guardião.',
    efeito: '+8 moedas a cada guardião ou chefe do Sábio vencido.',
    bonus: { moedasGuardiao: 8 } },
  // armas dos reinos: fabricadas com o material de cada reino
  { id: 'pena_escriba', nome: 'Pena do Escriba', cat: 'arma', rar: 'incomum', icone: 'pena', cor: '#eef3ff', cor2: '#4a6fbd', area: 'LC',
    desc: 'Escreve mais rápido do que se pensa.',
    efeito: '+10% de XP nas questões de Linguagens.',
    bonus: { xpArea: ['LC', 10] } },
  { id: 'cetro_cronista', nome: 'Cetro do Cronista', cat: 'arma', rar: 'incomum', icone: 'cajado', cor: '#c0603f', cor2: '#e8b341', area: 'CH',
    desc: 'Cada marca no cabo é uma era que ele viu passar.',
    efeito: '+10% de XP nas questões de Ciências Humanas.',
    bonus: { xpArea: ['CH', 10] } },
  { id: 'bastao_alquimista', nome: 'Bastão do Alquimista', cat: 'arma', rar: 'incomum', icone: 'cajado', cor: '#5fa44a', cor2: '#9fe0c0', area: 'CN',
    desc: 'Na ponta, um frasco que nunca para de borbulhar.',
    efeito: '+10% de XP nas questões de Ciências da Natureza.',
    bonus: { xpArea: ['CN', 10] } },
  { id: 'compasso_batalha', nome: 'Compasso de Batalha', cat: 'arma', rar: 'incomum', icone: 'compasso', cor: '#2f9aa6', area: 'MT',
    desc: 'Mede o ângulo exato de cada golpe.',
    efeito: '+10% de XP nas questões de Matemática.',
    bonus: { xpArea: ['MT', 10] } },

  // ---- armaduras ----
  { id: 'tunica_estudante', nome: 'Túnica do Estudante', cat: 'armadura', rar: 'comum', icone: 'tunica', cor: '#7c8fb3', drop: true,
    desc: 'Confortável para longas horas de estudo.',
    efeito: '+2 XP em cada erro: errar também ensina.',
    bonus: { xpErro: 2 } },
  { id: 'armadura_persistencia', nome: 'Armadura da Persistência', cat: 'armadura', rar: 'raro', icone: 'armadura', cor: '#9fb0c4', drop: true,
    desc: 'Forjada com cada recomeço.',
    efeito: 'Uma vez por sessão, o primeiro erro não zera a sua sequência de acertos.',
    bonus: { escudo: 1 } },
  { id: 'manto_explorador', nome: 'Manto do Explorador', cat: 'armadura', rar: 'raro', icone: 'manto', cor: '#3f8a5a', drop: true,
    desc: 'Já viu chuva, sol e muitas provas.',
    efeito: 'Ao concluir uma expedição: +20% de XP no bônus de conclusão e +10 de chance de item no espólio do guardião.',
    bonus: { xpExpedicao: 20, chanceGuardiao: 10 } },
  { id: 'manto_cacador', nome: 'Manto do Caçador', cat: 'armadura', rar: 'raro', icone: 'manto', cor: '#7a3b2e', drop: true,
    desc: 'Cheira a trilha e a monstro. Eles vêm até você.',
    efeito: '+10 de chance de monstro errante em cada onda do Reino do Sábio.',
    bonus: { errante: 10 } },

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
  { id: 'anel_colecionador', nome: 'Anel do Colecionador', cat: 'acessorio', rar: 'raro', icone: 'anel', cor: '#ffb347', drop: true,
    desc: 'Nunca deixa um caco para trás.',
    efeito: 'Ao derrotar um monstro (inimigos, chefes, errantes, Mímico e guardiões), 25% de chance de 1 material a mais.',
    bonus: { materialExtra: 25 } },
  { id: 'diadema_reinos', nome: 'Diadema dos Reinos', cat: 'acessorio', rar: 'epico', icone: 'diadema', cor: '#d9b45a', drop: true,
    desc: 'Uma pedra de cada reino, todas brilhando juntas.',
    efeito: '+15 moedas a cada missão de reino cumprida (Letras, Humanidades, Natureza, Números e Sábio).',
    bonus: { missaoReino: 15 } },
  { id: 'anel_chama', nome: 'Anel da Chama Constante', cat: 'acessorio', rar: 'epico', icone: 'anel', cor: '#ff7a3c', drop: true,
    desc: 'A chama cresce a cada dia em que você volta.',
    efeito: '+1% de XP por dia seguido de estudo, até +10%.',
    bonus: { chama: 10 } },
  { id: 'amuleto_eco', nome: 'Amuleto do Eco', cat: 'acessorio', rar: 'raro', icone: 'colar', cor: '#5fd0d8', drop: true,
    desc: 'Repete baixinho o que você errou, até virar acerto.',
    efeito: '+20% de XP ao acertar, fora da Masmorra, uma questão que você já tinha errado.',
    bonus: { eco: 20 } },

  // ---- mascotes: um ativo por vez; os que têm "evolucao" mudam de aparência ----
  { id: 'athena', nome: 'Athena, a Coruja Sábia', cat: 'mascote', rar: 'raro', icone: 'coruja', cor: '#b08a55',
    desc: 'Pousa no seu ombro e cochicha o que importa.',
    efeito: '+5% de XP e, uma vez por sessão, mostra de graça a habilidade cobrada.',
    bonus: { xp: 5 }, poder: { efeito: 'pista', cargas: 1 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['de olhos atentos', 'de óculos', 'de óculos e capelo de formatura'] } },
  { id: 'fenix_celestial', nome: 'Fênix Celestial', cat: 'mascote', rar: 'mitico', icone: 'fenix', cor: '#ff7a3c',
    desc: 'Renasce de cada erro, mais forte.',
    efeito: '+10% de XP, um erro por sessão sem perder a sequência e uma segunda chance por sessão.',
    bonus: { xp: 10, escudo: 1 }, poder: { efeito: 'segunda_chance', cargas: 1 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['chama nascente', 'com crista de fogo', 'com coroa de chamas'] } },
  { id: 'pingo', nome: 'Pingo, o Slime Companheiro', cat: 'mascote', rar: 'comum', icone: 'slime', cor: '#7fe08a', cor2: '#ffd36b',
    desc: 'Brincalhão, curioso e atrapalhado. Some no meio da batalha e volta com alguma coisa grudada.',
    efeito: 'Depois de cada batalha vencida (inimigo, chefe, errante ou guardião), 15% de chance de achar 1 material básico.',
    bonus: { materialBasico: 15 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], cores: [['#7fe08a', '#ffd36b'], ['#6fc3ff', '#ffd36b'], ['#d48cff', '#ffd36b']],
      formas: ['verde', 'azul, com antena', 'violeta, de coroa'] } },
  { id: 'ossito', nome: 'Ossito, o Esqueleto Esquecido', cat: 'mascote', rar: 'incomum', icone: 'ossito', cor: '#ece6d3', cor2: '#c0392b',
    tabelas: ['guardiao'], drop: true,
    desc: 'Engraçado, desajeitado e um pouco distraído. Esquece tudo, menos as questões que você errou.',
    efeito: '+15 moedas ao concluir a Masmorra dos Erros respondendo todas as questões dela.',
    bonus: { revisaoCompleta: 15 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['só ossos', 'de elmo', 'de elmo, ombreira e capa'] } },
  { id: 'faisca', nome: 'Faísca, a Raposa Arcana', cat: 'mascote', rar: 'raro', icone: 'raposa', cor: '#ff9a3c', cor2: '#6fd3ff',
    tabelas: ['mimico', 'bau_prata'], drop: true,
    desc: 'Inteligente, veloz e brincalhona. Fareja tesouro de longe.',
    efeito: '+5 de chance de eventos especiais entre as questões, e os baús achados têm o dobro de chance de ser de Prata ou de Ouro.',
    bonus: { evento: 5, bauRaro: 2 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['cauda lisa', 'cauda com uma runa', 'cauda coberta de runas'] } },
  { id: 'pedregulho', nome: 'Pedregulho, o Guardião de Pedra', cat: 'mascote', rar: 'epico', icone: 'golem', cor: '#9aa3ad', cor2: '#7fe0ff',
    tabelas: ['chefe'], drop: true,
    desc: 'Forte, tranquilo e protetor. Não deixa ninguém levar o que é seu.',
    efeito: 'Uma vez por sessão, quando você erra, segura o Mímico ou a porta da passagem secreta, e o tesouro fica com você. Se o guardião não for vencido numa sessão de 5 questões ou mais, você ainda leva as moedas dele.',
    bonus: { tesouro: 1 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['pedra bruta', 'com cristais', 'com cristais e runas acesas'] } },
  { id: 'nox', nome: 'Nox, o Dragão das Sombras', cat: 'mascote', rar: 'lendario', icone: 'dragao', cor: '#5b4a8a', cor2: '#2e2350',
    tabelas: ['chefe'], drop: true,
    desc: 'Misterioso, inteligente e leal. Gosta de coisas raras, e as coisas raras gostam dele.',
    efeito: 'Nas recompensas, itens épicos ficam 30% mais prováveis, e lendários, 15%.',
    bonus: { raridade: { epico: 30, lendario: 15 } },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['asas pequenas', 'asas grandes', 'asas grandes e marcas luminosas'] } },
  { id: 'lumina', nome: 'Lumina, a Guardiã Celestial', cat: 'mascote', rar: 'mitico', icone: 'lumina', cor: '#fff3c4', cor2: '#ff9fd1',
    desc: 'Majestosa, gentil e raríssima. Desceu do observatório do Sábio para acompanhar quem não desiste.',
    efeito: 'Quando você conclui sessões nos cinco reinos no mesmo dia (Letras, Humanidades, Natureza, Números e Sábio), Lumina traz um Baú de Ouro, uma vez por dia.',
    bonus: { cincoReinos: 'bau_ouro' },
    evolucao: { por: 'conquistas', limites: [0, 35, 50], formas: ['luz serena', 'com auréola', 'com asas de luz'] } },
  // mascotes dos reinos: caem do guardião do próprio reino
  { id: 'rima', nome: 'Rima, o Grilo Poeta', cat: 'mascote', rar: 'incomum', icone: 'grilo', cor: '#7fc46a', cor2: '#4a6fbd', area: 'LC',
    desc: 'Canta em versos e corrige a sua concordância.',
    efeito: 'Nos acertos de Linguagens, 10% de chance de achar 1 Tinta de Sépia.',
    bonus: { materialReino: 10 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['grilo cantor', 'de boina de poeta', 'de boina, entre notas musicais'] } },
  { id: 'cronos', nome: 'Cronos, a Tartaruga Anciã', cat: 'mascote', rar: 'incomum', icone: 'tartaruga', cor: '#8fae5a', cor2: '#e8b341', area: 'CH',
    desc: 'Viu impérios nascerem e caírem. Sem pressa nenhuma.',
    efeito: 'Nos acertos de Ciências Humanas, 10% de chance de achar 1 Moeda Antiga.',
    bonus: { materialReino: 10 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['casco liso', 'com pergaminho no casco', 'com casco de runas douradas'] } },
  { id: 'musgo', nome: 'Musgo, o Cogumelo Andante', cat: 'mascote', rar: 'incomum', icone: 'cogumelo', cor: '#d8484a', cor2: '#fff3e6', area: 'CN',
    desc: 'Brota onde há vida e conversa com as raízes.',
    efeito: 'Nos acertos de Ciências da Natureza, 10% de chance de achar 1 Semente Viva.',
    bonus: { materialReino: 10 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['cogumelo jovem', 'com folhinha no chapéu', 'com vaga-lumes em volta'] } },
  { id: 'pi', nome: 'Pi, o Autômato de Engrenagens', cat: 'mascote', rar: 'incomum', icone: 'automato', cor: '#c9a24a', cor2: '#2f9aa6', area: 'MT',
    desc: 'Calcula tudo, inclusive quantos passos faltam para a resposta.',
    efeito: 'Nos acertos de Matemática, 10% de chance de achar 1 Engrenagem de Bronze.',
    bonus: { materialReino: 10 },
    evolucao: { por: 'questoes', limites: [0, 150, 500], formas: ['engrenagens à mostra', 'de antena acesa', 'com auréola de engrenagens'] } },

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
  { id: 'tocha_chama_eterna', nome: 'Tocha da Chama Eterna', cat: 'reliquia', rar: 'epico', icone: 'tocha', cor: '#ff9a3c',
    desc: 'Acesa no primeiro dia e nunca mais apagada.',
    efeito: '+5% de XP, para sempre.',
    bonus: { xp: 5 } },
  { id: 'chave_masmorra', nome: 'Chave da Masmorra Vazia', cat: 'reliquia', rar: 'epico', icone: 'chave', cor: '#c9a24a',
    desc: 'Abre todas as celas: nenhum erro ficou para trás.',
    efeito: '+10% de XP na Masmorra dos Erros, para sempre.',
    bonus: { xpRevisao: 10 } },
  { id: 'louros_arena', nome: 'Louros da Arena', cat: 'reliquia', rar: 'epico', icone: 'louros', cor: '#7fc46a',
    desc: 'A coroa de quem venceu a prova antes da prova.',
    efeito: '+10% de XP no Simulado, para sempre.',
    bonus: { xpSimulado: 10 } },
  { id: 'trofeu_cacador', nome: 'Troféu do Caçador', cat: 'reliquia', rar: 'epico', icone: 'trofeu', cor: '#e8b341',
    desc: 'Dez chefes, uma parede inteira de lembranças.',
    efeito: '+5 moedas a cada guardião ou chefe vencido, para sempre.',
    bonus: { moedasGuardiao: 5 } },

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
  { id: 'escama_dragao', nome: 'Escama do Dragão', cat: 'material', rar: 'raro', icone: 'escama', cor: '#3f9e8f', drop: true,
    tabelas: ['inimigo_forte', 'chefe', 'mimico', 'bau_prata', 'bau_ouro'],
    desc: 'Dura como prova difícil. Só cai de criaturas fortes.', efeito: 'Material de fabricação e de aprimoramento de equipamentos especiais.' },
  { id: 'pena_fenix', nome: 'Pena da Fênix', cat: 'material', rar: 'epico', icone: 'pena', cor: '#ff7a3c', cor2: '#ffd36b', drop: true,
    tabelas: ['chefe', 'bau_ouro'],
    desc: 'Morna ao toque, mesmo depois de dias.', efeito: 'Material de fabricação de itens de proteção e de aprimoramento de artefatos e lendários.' },
  // materiais dos reinos: vêm das missões e dos guardiões de cada reino (ITENS_DO_REINO)
  { id: 'tinta_sepia', nome: 'Tinta de Sépia', cat: 'material', rar: 'incomum', icone: 'tinteiro', cor: '#5a4a8a', area: 'LC',
    desc: 'Escura como as entrelinhas.', efeito: 'Material do Reino das Letras, usado na Pena do Escriba.' },
  { id: 'moeda_antiga', nome: 'Moeda Antiga', cat: 'material', rar: 'incomum', icone: 'moeda_antiga', cor: '#c9a24a', area: 'CH',
    desc: 'Cunhada num império que já não existe.', efeito: 'Material do Reino das Humanidades, usado no Cetro do Cronista.' },
  { id: 'semente_viva', nome: 'Semente Viva', cat: 'material', rar: 'incomum', icone: 'semente', cor: '#5fa44a', area: 'CN',
    desc: 'Pulsa de leve, como se respirasse.', efeito: 'Material do Reino da Natureza, usado no Bastão do Alquimista.' },
  { id: 'engrenagem_bronze', nome: 'Engrenagem de Bronze', cat: 'material', rar: 'incomum', icone: 'engrenagem', cor: '#c98a4a', area: 'MT',
    desc: 'Cada dente no lugar exato.', efeito: 'Material do Reino dos Números, usado no Compasso de Batalha.' },

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
   O sorteio só usa itens com "drop: true". Mítico nunca cai: vem de grandes conquistas. Um item
   com "tabelas" só cai nas tabelas listadas, mesmo que a categoria dele não esteja em "cats". */
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
const ESPOLIO_GUARDIAO = { minimo: 5, chance: 0.5, longa: 10, chanceLonga: 0.85, materialReino: 0.5, mascoteReino: 0.08 };
/* Pacote de cada reino. O guardião vencido numa expedição do reino tem chance de deixar o
   material (materialReino) e o mascote (mascoteReino). O material também vem da missão do
   reino e do mascote do reino, e é usado na arma do reino (RECEITAS). */
const ITENS_DO_REINO = {
  LC: { material: 'tinta_sepia', mascote: 'rima' },
  CH: { material: 'moeda_antiga', mascote: 'cronos' },
  CN: { material: 'semente_viva', mascote: 'musgo' },
  MT: { material: 'engrenagem_bronze', mascote: 'pi' },
};
const PREMIO_SIMULADO = { minimo: 20, bau: 'bau_madeira', diaInteiro: 80, bauDiaInteiro: 'bau_prata' };

/* Monstros errantes: aparecem de vez em quando no Reino do Sábio, no lugar de um inimigo comum,
   trazem questões de qualquer área e deixam os itens da própria lista (pesos). Cada um pode
   deixar o mascote da sua espécie. */
const CHANCE_ERRANTE = 0.15;
const MONSTROS_ERRANTES = [
  { id: 'slime', nome: 'Slime da Confusão', frase: 'Gruda nas ideias e deixa tudo meloso.', hp: 2, peso: 30, moedas: [3, 5],
    drops: [['essencia_slime', 70], ['fragmento_cristal', 20], ['pocao_concentracao', 10], ['pingo', 12]] },
  { id: 'esqueleto', nome: 'Esqueleto Esquecido', frase: 'Lembra de tudo, menos do que você estudou.', hp: 3, peso: 25, moedas: [4, 7],
    drops: [['fragmento_cristal', 55], ['po_conhecimento', 30], ['perg_humanidades', 15], ['ossito', 10]] },
  { id: 'mago', nome: 'Mago das Ilusões', frase: 'Faz a alternativa errada parecer a certa.', hp: 3, peso: 22, moedas: [5, 8],
    drops: [['pocao_clareza', 45], ['po_conhecimento', 45], ['orbe_deducao', 10], ['faisca', 8]] },
  { id: 'golem', nome: 'Golem da Ignorância', frase: 'Pesado, teimoso e sem vontade de aprender.', hp: 4, peso: 18, moedas: [6, 10],
    drops: [['fragmento_cristal', 50], ['runa_sabedoria', 35], ['po_conhecimento', 15], ['pedregulho', 8]] },
  { id: 'dragao', nome: 'Dragão do Tempo', frase: 'Cada segundo dele vale uma era.', hp: 5, peso: 5, ondaMinima: 6, moedas: [20, 30],
    drops: [['runa_sabedoria', 45], ['coracao_dragao', 40], ['escama_dragao', 30], ['ampulheta_tempo', 15], ['nox', 10]] },
];
/* Os cinco reinos da Lumina e do Diadema: as quatro áreas e o Reino do Sábio. Uma sessão conta
   para o reino quando chega ao mínimo do guardião (ou ao mínimo do fim de jornada, no Sábio). */
const REINOS_DA_JORNADA = ['LC', 'CH', 'CN', 'MT', 'sabio'];
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
  q2500: 'relogio_destinos',
  onda25: 'lumina',
  dias30: 'tocha_chama_eterna',
  rev150: 'chave_masmorra',
  sim80: 'louros_arena',
  chefe10: 'trofeu_cacador',
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
  { id: 'r_pena_escriba', item: 'pena_escriba', mats: { tinta_sepia: 5, fragmento_cristal: 2 }, req: { nivel: 3 } },
  { id: 'r_cetro_cronista', item: 'cetro_cronista', mats: { moeda_antiga: 5, fragmento_cristal: 2 }, req: { nivel: 3 } },
  { id: 'r_bastao_alquimista', item: 'bastao_alquimista', mats: { semente_viva: 5, fragmento_cristal: 2 }, req: { nivel: 3 } },
  { id: 'r_compasso_batalha', item: 'compasso_batalha', mats: { engrenagem_bronze: 5, fragmento_cristal: 2 }, req: { nivel: 3 } },
  { id: 'r_fortuna', item: 'pocao_fortuna', mats: { essencia_slime: 2, fragmento_cristal: 2 }, req: { nivel: 5 } },
  { id: 'r_segunda', item: 'elixir_segunda_chance', mats: { po_conhecimento: 2, runa_sabedoria: 1 }, req: { nivel: 6 } },
  { id: 'r_descoberta', item: 'pocao_descoberta', mats: { po_conhecimento: 2, fragmento_cristal: 2, runa_sabedoria: 1 }, req: { nivel: 7 } },
  { id: 'r_lanterna', item: 'lanterna_segredos', mats: { fragmento_cristal: 4, runa_sabedoria: 1, escama_dragao: 1 }, req: { nivel: 7 } },
  { id: 'r_orbe', item: 'orbe_deducao', mats: { fragmento_cristal: 4, runa_sabedoria: 2 }, moedas: 40, req: { nivel: 8 } },
  { id: 'r_manto', item: 'manto_explorador', mats: { essencia_slime: 4, runa_sabedoria: 1, escama_dragao: 1 }, req: { nivel: 9 } },
  { id: 'r_determinacao', item: 'elixir_determinacao', mats: { po_conhecimento: 2, pena_fenix: 1 }, req: { nivel: 10 } },
  { id: 'r_ampulheta', item: 'ampulheta_tempo', mats: { po_conhecimento: 3, runa_sabedoria: 2, coracao_dragao: 1 }, req: { conquista: 'chefe1' } },
  { id: 'r_sabedoria', item: 'pocao_sabedoria', mats: { runa_sabedoria: 2, coracao_dragao: 1 }, req: { nivel: 12 } },
  { id: 'r_diadema', item: 'diadema_reinos', mats: { runa_sabedoria: 2, escama_dragao: 2, pena_fenix: 1 }, req: { nivel: 14 } },
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
  { item: 'pingo', preco: 80, limite: 1 },
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
  revisao: { nome: 'Masmorra dos Erros', consumiveis: ['pista', 'protege_sequencia', 'protege_sessao'], poderes: ['pista'], baus: true, bonus: true,
    aviso: 'Na Masmorra você enfrenta os próprios erros: só pistas e proteção de sequência.' },
  simulado: { nome: 'Simulado Enem', consumiveis: 'nenhum', poderes: false, baus: false, bonus: true,
    aviso: 'No simulado a prova é igual para todos: nenhum item muda as condições.' },
  ranking: { nome: 'Ranking competitivo', consumiveis: 'nenhum', poderes: false, baus: false, bonus: false }, // preparado para o futuro
};

/* Limites que seguram o equilíbrio: bônus somados de XP e moedas (%), chance extra de baú, de
   monstro errante e de evento especial (pontos de %) e quantas alternativas um jogador pode
   eliminar numa questão (sobram sempre três para pensar). */
const LIMITES = { xp: 25, moedas: 30, bau: 15, errante: 15, evento: 10, eliminadas: 2 };
const AJUDA_FATOR = 0.5; // acerto com alternativa eliminada ou segunda chance vale metade

/* Eventos especiais: depois de uma resposta em que não apareceu baú, nos modos que têm baús
   (expedições, Masmorra e Sábio). chanceBase em %, mais o bônus "evento" (Lanterna, Faísca).
   Nenhum evento mexe na questão: dão moedas e itens, ou um desafio que só paga com acerto.
     passagem  passagem secreta com um baú escondido: abre se a próxima resposta for certa
     mercador  oferece um item por um preço fixo, só até você avançar
     fonte     renova os poderes e as proteções dos itens nesta sessão e dá um material
     chuva     moedas */
const EVENTOS = {
  chanceBase: 3,
  tipos: [['passagem', 30], ['mercador', 25], ['fonte', 15], ['chuva', 30]],
  bauPassagem: [['bau_prata', 85], ['bau_ouro', 15]],
  mercador: { raridades: [['incomum', 60], ['raro', 32], ['epico', 8]], cats: ['consumivel', 'pergaminho', 'material'],
              precos: { incomum: 25, raro: 50, epico: 90 } },
  fonte: { item: 'po_conhecimento' },
  chuva: [10, 25],
};

/* Missões dos reinos: uma por reino, todo dia, além das missões do dia. Contam os acertos de cada
   área (nas expedições, na Masmorra e no Sábio) e os inimigos derrotados no Sábio. O Diadema dos
   Reinos dá moedas a mais em cada uma. */
const MISSOES_REINO = [
  { id: 'reino_LC', reino: 'LC', nome: 'Missão das Letras', texto: 'Acertar 5 questões de Linguagens hoje', alvo: 5, premio: { moedas: 12, item: 'tinta_sepia' } },
  { id: 'reino_CH', reino: 'CH', nome: 'Missão das Humanidades', texto: 'Acertar 5 questões de Ciências Humanas hoje', alvo: 5, premio: { moedas: 12, item: 'moeda_antiga' } },
  { id: 'reino_CN', reino: 'CN', nome: 'Missão da Natureza', texto: 'Acertar 5 questões de Ciências da Natureza hoje', alvo: 5, premio: { moedas: 12, item: 'semente_viva' } },
  { id: 'reino_MT', reino: 'MT', nome: 'Missão dos Números', texto: 'Acertar 5 questões de Matemática hoje', alvo: 5, premio: { moedas: 12, item: 'engrenagem_bronze' } },
  { id: 'reino_sabio', reino: 'sabio', nome: 'Missão do Sábio', texto: 'Derrotar 3 inimigos no Reino do Sábio hoje', alvo: 3, premio: { moedas: 12, item: 'po_conhecimento' } },
];

/* Aprimoramento: armas, armaduras, acessórios e artefatos com bônus em números podem ser
   aprimorados uma vez (+1). Os números listados em "escalaveis" crescem 50% (arredondados para
   cima) e continuam dentro de LIMITES. Golpe, escudo, sorte, tesouro e poderes não mudam.
   Lendários e míticos pedem também "extraRaro". */
const APRIMORAMENTO = {
  fator: 1.5,
  custo: {
    arma: { mats: { escama_dragao: 2 }, moedas: 50 },
    armadura: { mats: { escama_dragao: 2 }, moedas: 50 },
    acessorio: { mats: { escama_dragao: 2 }, moedas: 50 },
    artefato: { mats: { escama_dragao: 1, pena_fenix: 1 }, moedas: 50 },
  },
  extraRaro: { pena_fenix: 1 },
  escalaveis: ['xp', 'xpRevisao', 'xpErro', 'moedas', 'bau', 'moedasExpedicao', 'errante', 'evento', 'moedasGuardiao',
    'xpExpedicao', 'chanceGuardiao', 'materialExtra', 'missaoReino', 'materialBasico', 'revisaoCompleta', 'chama', 'eco'],
  // o bônus por área (xpArea, das armas dos reinos) também cresce com o aprimoramento
};
