'use strict';
/* Conteúdo fixo do jogo: mundo, progressão e guia de redação.
   O guia resume, com outras palavras, a Cartilha do Participante 2026 do INEP. */

// 1º dia do Enem 2026 pelo cronograma do INEP; o jogador pode trocar a data no painel
const DATA_PROVA_PADRAO = '2026-11-08';

const CLASSES = {
  escriba: { nome: 'Escriba', simbolo: 'pena', bonus: '+10% de XP em Linguagens',
             texto: 'Domina as palavras e lê o que está nas entrelinhas.' },
  cronista: { nome: 'Cronista', simbolo: 'ampulheta', bonus: '+10% de XP em Humanas',
              texto: 'Conhece o passado e entende como o mundo chegou até aqui.' },
  alquimista: { nome: 'Alquimista', simbolo: 'frasco', bonus: '+10% de XP na Revisão',
                texto: 'Transforma cada erro em aprendizado que fica.' },
};

const TITULOS = [
  [1, 'Aprendiz'], [3, 'Viajante'], [5, 'Sentinela'], [8, 'Estudioso(a)'],
  [11, 'Estrategista'], [15, 'Erudito(a)'], [20, 'Mestre(a)'], [26, 'Lenda do Enem'],
];

const REINOS = {
  LC: {
    nome: 'Reino das Letras', area: 'Linguagens, Códigos e suas Tecnologias',
    texto: 'Português, literatura, língua estrangeira, artes e comunicação.',
    regioes: {
      1: ['Torre dos Mensageiros', 'Tecnologias da comunicação'],
      2: ['Porto das Línguas', 'Inglês e Espanhol'],
      3: ['Arena do Corpo', 'Linguagem corporal'],
      4: ['Galeria das Artes', 'Arte e estética'],
      5: ['Bosque dos Poetas', 'Literatura e recursos expressivos'],
      6: ['Ateliê dos Símbolos', 'Sistemas de linguagem'],
      7: ['Praça do Debate', 'Argumentação e pontos de vista'],
      8: ['Fonte da Língua', 'Língua portuguesa'],
      9: ['Forja Digital', 'Impacto das tecnologias'],
    },
  },
  CH: {
    nome: 'Reino das Humanidades', area: 'Ciências Humanas e suas Tecnologias',
    texto: 'História, geografia, filosofia e sociologia.',
    regioes: {
      1: ['Aldeia das Identidades', 'Cultura e identidade'],
      2: ['Mirante dos Cartógrafos', 'Espaço geográfico e poder'],
      3: ['Salão dos Conselhos', 'Instituições e movimentos sociais'],
      4: ['Oficina do Progresso', 'Técnica, trabalho e produção'],
      5: ['Fórum da Cidadania', 'Cidadania e democracia'],
      6: ['Margens do Grande Rio', 'Sociedade e natureza'],
    },
  },
};
const TERRAS_SEM_CLASSE = ['Terras Inexploradas', 'Questões sem classificação oficial de competência'];

const GUARDIOES = {
  LC: [['Esfinge das Entrelinhas', 'Só deixa passar quem lê além do que está escrito.'],
       ['Golem da Gramática', 'Feito de regras, desmorona diante de quem as entende.'],
       ['Sereia das Metáforas', 'Canta sentidos figurados para confundir os distraídos.'],
       ['Bruxa da Ambiguidade', 'Cada frase dela pode dizer duas coisas.']],
  CH: [['Hidra das Revoluções', 'Corte uma causa e surgem duas consequências.'],
       ['Minotauro do Labirinto', 'Vigia os corredores de séculos entrelaçados.'],
       ['Titã da Geopolítica', 'Move fronteiras com a ponta dos dedos.'],
       ['Quimera das Ideologias', 'Três cabeças, três visões do mesmo fato.']],
  misto: [['Dragão do Enem', 'Guarda o portão do primeiro dia de prova.']],
  revisao: [['Sombra do Erro Antigo', 'Volta sempre, até você vencê-la de verdade.']],
};

/* Reino do Sábio: jornada sem fim contra inimigos de todos os reinos. Cada inimigo traz
   questões do próprio reino; a cada 5 ondas surge um chefe do Sábio, com questões difíceis. */
const REINOS_INIMIGOS = {
  LC: { nome: 'Reino das Letras', cor: 'letras' },
  CH: { nome: 'Reino das Humanidades', cor: 'humanas' },
  torre: { nome: 'Torre da Redação', cor: 'torre' },
  revisao: { nome: 'Masmorra dos Erros', cor: 'masmorra' },
  arena: { nome: 'Arena do Simulado', cor: 'arena' },
  sabio: { nome: 'Reino do Sábio', cor: 'sabio' },
};
const INIMIGOS = {
  LC: [...GUARDIOES.LC,
       ['Camaleão dos Gêneros', 'Vira crônica, charge ou anúncio quando você menos espera.'],
       ['Espectro da Interpretação', 'Some quando você volta ao texto com calma.']],
  CH: [...GUARDIOES.CH,
       ['Faraó dos Séculos', 'Guarda a memória de impérios que caíram.'],
       ['Leviatã do Estado', 'Exige um contrato social a cada passo.']],
  torre: [['Escriba Sombrio', 'Escreve sem tese e quer que você faça o mesmo.'],
          ['Golem do Rascunho', 'Feito de folhas amassadas e ideias soltas.'],
          ['Corvo da Coesão', 'Rouba os conectivos das frases.']],
  revisao: [...GUARDIOES.revisao,
            ['Eco das Respostas Erradas', 'Repete seus erros até você corrigi-los.'],
            ['Carcereiro da Masmorra', 'Só abre a cela para quem aprendeu a lição.']],
  arena: [...GUARDIOES.misto,
          ['Gladiador do Cronômetro', 'Luta contra o tempo e quer que você perca o fôlego.'],
          ['Centauro do Gabarito', 'Galopa entre as alternativas e confunde as letras.']],
  sabio: [['Oráculo das Mil Perguntas', 'Só responde a quem já respondeu muito.'],
          ['Arquimago do Conhecimento', 'Domina todas as áreas e testa todas.'],
          ['Esfinge Suprema', 'Faz a pergunta que decide a jornada.']],
};
const CICLO_SABIO = ['LC', 'CH', 'torre', 'arena', 'revisao'];
const ONDAS_POR_CHEFE = 5;
const XP_INIMIGO = 4;
const XP_CHEFE = 15;
const MIN_FIM_SABIO = 5;          // bônus de fim de jornada só a partir de 5 respostas

/* Pontuação. Fica deliberadamente modesta: o foco é responder com calma. */
const PONTOS_NIVEL = { 0: 12, 1: 10, 2: 15, 3: 20 };
const XP_ERRO = 2;              // errar também ensina, mas não compensa chutar
const XP_FIM_SESSAO = 10;
const XP_GUARDIAO = 20;         // sessão com 60% ou mais
const XP_REVISAO = 12;
const XP_LEITURA = 15;          // primeira leitura de um exemplo de redação
const XP_CONQUISTA = { 1: 15, 2: 25, 3: 40, 4: 60, 5: 90 }; // conforme o grau da conquista
const BONUS_SEQUENCIA_MAX = 5;
const META_GUARDIAO = 0.6;
const INTERVALOS_REVISAO = [1, 2, 4, 8, 16]; // dias até rever, conforme a questão vai sendo acertada

/* Conquistas em cinco graus, do primeiro passo ao lendário. Cada uma libera um título,
   que o jogador pode exibir no painel do herói. Os ids antigos continuam valendo. */
const GRAUS = { 1: 'Bronze', 2: 'Prata', 3: 'Ouro', 4: 'Platina', 5: 'Lendária' };
const CONQUISTAS = [
  // Bronze: os primeiros passos
  { id: 'primeira', grau: 1, nome: 'Primeiros passos', titulo: 'Recruta', texto: 'Concluiu a primeira expedição.', teste: c => c.sessoes >= 1 },
  { id: 'q10', grau: 1, nome: 'Aquecimento', titulo: 'Aspirante', texto: 'Respondeu 10 questões.', teste: c => c.respondidas >= 10 },
  { id: 'a25', grau: 1, nome: 'Primeiros acertos', titulo: 'Olhar Atento', texto: 'Acertou 25 questões.', teste: c => c.acertos >= 25 },
  { id: 'q50', grau: 1, nome: 'Pé na estrada', titulo: 'Andarilho(a)', texto: 'Respondeu 50 questões.', teste: c => c.respondidas >= 50 },
  { id: 'seq5', grau: 1, nome: 'Mão firme', titulo: 'Mira Certeira', texto: 'Acertou 5 questões seguidas.', teste: c => c.melhorSeq >= 5 },
  { id: 'dias3', grau: 1, nome: 'Três auroras', titulo: 'Vigia da Aurora', texto: 'Estudou 3 dias seguidos.', teste: c => c.melhorDias >= 3 },
  { id: 'leitor', grau: 1, nome: 'Leitor(a) da Torre', titulo: 'Leitor(a) de Pergaminhos', texto: 'Leu 3 redações de exemplo.', teste: c => c.lidas >= 3 },
  { id: 'sabio1', grau: 1, nome: 'Diante do Sábio', titulo: 'Discípulo(a) do Sábio', texto: 'Concluiu a primeira jornada no Reino do Sábio.', teste: c => c.sabio.jornadas >= 1 },
  { id: 'ini10', grau: 1, nome: 'Primeira caçada', titulo: 'Caçador(a) de Sombras', texto: 'Derrotou 10 inimigos no Reino do Sábio.', teste: c => c.sabio.inimigos >= 10 },
  { id: 'nivel5', grau: 1, nome: 'Escudo erguido', titulo: 'Portador(a) do Escudo', texto: 'Chegou ao nível 5.', teste: c => c.nivel >= 5 },
  // Prata: o hábito
  { id: 'q200', grau: 2, nome: 'Viagem longa', titulo: 'Desbravador(a)', texto: 'Respondeu 200 questões.', teste: c => c.respondidas >= 200 },
  { id: 'a100', grau: 2, nome: 'Cem acertos', titulo: 'Coração Valente', texto: 'Acertou 100 questões.', teste: c => c.acertos >= 100 },
  { id: 'seq10', grau: 2, nome: 'Foco de aço', titulo: 'Vontade de Ferro', texto: 'Acertou 10 questões seguidas.', teste: c => c.melhorSeq >= 10 },
  { id: 'alto80', grau: 2, nome: 'Golpe certeiro', titulo: 'Flecha Precisa', texto: 'Fez 80% ou mais em uma sessão de 10 questões ou mais.', teste: c => c.sessao80 },
  { id: 'dias7', grau: 2, nome: 'Semana inteira', titulo: 'Chama Constante', texto: 'Estudou 7 dias seguidos.', teste: c => c.melhorDias >= 7 },
  { id: 'rev10', grau: 2, nome: 'Erro vencido', titulo: 'Domador(a) de Erros', texto: 'Recuperou 10 questões na revisão.', teste: c => c.recuperadas >= 10 },
  { id: 'fila0', grau: 2, nome: 'Masmorra limpa', titulo: 'Chave da Masmorra', texto: 'Zerou a fila de revisão do dia.', teste: c => c.filaZerada },
  { id: 'simulado', grau: 2, nome: 'Prova de fogo', titulo: 'Alma Forjada', texto: 'Concluiu um simulado.', teste: c => c.simulados >= 1 },
  { id: 's10', grau: 2, nome: 'Rotina de herói', titulo: 'Passo Incansável', texto: 'Concluiu 10 sessões.', teste: c => c.sessoes >= 10 },
  { id: 'chefe1', grau: 2, nome: 'Queda de um chefe', titulo: 'Algoz de Chefes', texto: 'Derrotou um chefe no Reino do Sábio.', teste: c => c.sabio.chefes >= 1 },
  { id: 'torre', grau: 2, nome: 'Biblioteca aberta', titulo: 'Zelador(a) dos Livros', texto: 'Leu redações de 5 edições diferentes.', teste: c => c.edicoesLidas >= 5 },
  { id: 'nivel10', grau: 2, nome: 'Meio caminho', titulo: 'Cavaleiro(a) do Saber', texto: 'Chegou ao nível 10.', teste: c => c.nivel >= 10 },
  // Ouro: a disciplina
  { id: 'q500', grau: 3, nome: 'Atlas vivo', titulo: 'Atlas Vivo', texto: 'Respondeu 500 questões.', teste: c => c.respondidas >= 500 },
  { id: 'a300', grau: 3, nome: 'Trezentos de Esparta', titulo: 'Escudo de Esparta', texto: 'Acertou 300 questões.', teste: c => c.acertos >= 300 },
  { id: 'seq15', grau: 3, nome: 'Sem tremer', titulo: 'Nervos de Aço', texto: 'Acertou 15 questões seguidas.', teste: c => c.melhorSeq >= 15 },
  { id: 'alto90', grau: 3, nome: 'Precisão rara', titulo: 'Olho de Águia', texto: 'Fez 90% ou mais em uma sessão de 20 questões ou mais.', teste: c => c.sessao90 },
  { id: 'perfeito', grau: 3, nome: 'Sessão impecável', titulo: 'Lâmina Impecável', texto: 'Acertou todas as questões de uma sessão de 10 ou mais.', teste: c => c.perfeita },
  { id: 'dias14', grau: 3, nome: 'Duas semanas de chama', titulo: 'Fogo que Não Se Apaga', texto: 'Estudou 14 dias seguidos.', teste: c => c.melhorDias >= 14 },
  { id: 'rev50', grau: 3, nome: 'Masmorra domada', titulo: 'Senhor(a) da Masmorra', texto: 'Recuperou 50 questões na revisão.', teste: c => c.recuperadas >= 50 },
  { id: 'regioes', grau: 3, nome: 'Cartógrafo(a)', titulo: 'Explorador(a) de Domínios', texto: 'Acertou ao menos uma questão em cada uma das 15 competências.', teste: c => c.regioes >= 15 },
  { id: 'sim3', grau: 3, nome: 'Arena conhecida', titulo: 'Gladiador(a) da Arena', texto: 'Concluiu 3 simulados.', teste: c => c.simulados >= 3 },
  { id: 'ini50', grau: 3, nome: 'Flagelo dos monstros', titulo: 'Terror dos Monstros', texto: 'Derrotou 50 inimigos no Reino do Sábio.', teste: c => c.sabio.inimigos >= 50 },
  { id: 'onda10', grau: 3, nome: 'Dez ondas', titulo: 'Inabalável', texto: 'Chegou à 10ª onda em uma jornada do Sábio.', teste: c => c.sabio.melhorOnda >= 10 },
  { id: 'dom100', grau: 3, nome: 'Duas terras', titulo: 'Senhor(a) de Duas Terras', texto: 'Dominou 100 questões de Linguagens e 100 de Humanas.', teste: c => c.domLC >= 100 && c.domCH >= 100 },
  { id: 'leitor10', grau: 3, nome: 'Leitura dedicada', titulo: 'Pena de Ouro', texto: 'Leu 10 redações de exemplo.', teste: c => c.lidas >= 10 },
  { id: 'nivel15', grau: 3, nome: 'Erudição', titulo: 'Mente Brilhante', texto: 'Chegou ao nível 15.', teste: c => c.nivel >= 15 },
  // Platina: a maestria
  { id: 'q1000', grau: 4, nome: 'Mil batalhas', titulo: 'Veterano(a) de Mil Batalhas', texto: 'Respondeu 1.000 questões.', teste: c => c.respondidas >= 1000 },
  { id: 'a750', grau: 4, nome: 'Exército de acertos', titulo: 'Comandante do Saber', texto: 'Acertou 750 questões.', teste: c => c.acertos >= 750 },
  { id: 'seq20', grau: 4, nome: 'Imbatível', titulo: 'Tempestade Imparável', texto: 'Acertou 20 questões seguidas.', teste: c => c.melhorSeq >= 20 },
  { id: 'dias30', grau: 4, nome: 'Um mês de chama', titulo: 'Chama Eterna', texto: 'Estudou 30 dias seguidos.', teste: c => c.melhorDias >= 30 },
  { id: 'rev150', grau: 4, nome: 'Masmorra vazia', titulo: 'Quebra-Correntes', texto: 'Recuperou 150 questões na revisão.', teste: c => c.recuperadas >= 150 },
  { id: 'sim80', grau: 4, nome: 'Nota de elite', titulo: 'Campeão(ã) da Arena', texto: 'Fez 80% ou mais em um simulado de 40 questões ou mais.', teste: c => c.simulado80 },
  { id: 'simcompleto', grau: 4, nome: 'Prova completa', titulo: 'Vencedor(a) do 1º Dia', texto: 'Fez 60% ou mais em um simulado completo, de Linguagens e Humanas.', teste: c => c.simuladoCompleto },
  { id: 'chefe10', grau: 4, nome: 'Caçada aos chefes', titulo: 'Matador(a) de Dragões', texto: 'Derrotou 10 chefes no Reino do Sábio.', teste: c => c.sabio.chefes >= 10 },
  { id: 'anos', grau: 4, nome: 'Viagem no tempo', titulo: 'Viajante do Tempo', texto: 'Acertou questões de todas as edições do Enem, de 2005 a 2025.', teste: c => c.anos >= c.anosTotal },
  { id: 'dom400', grau: 4, nome: 'Reinos dominados', titulo: 'Soberano(a) dos Reinos', texto: 'Dominou 400 questões de Linguagens e 400 de Humanas.', teste: c => c.domLC >= 400 && c.domCH >= 400 },
  { id: 'nivel20', grau: 4, nome: 'Maestria', titulo: 'Arquimago(a)', texto: 'Chegou ao nível 20.', teste: c => c.nivel >= 20 },
  // Lendária: para poucos
  { id: 'q2500', grau: 5, nome: 'Peregrinação', titulo: 'Peregrino(a) Eterno(a)', texto: 'Respondeu 2.500 questões.', teste: c => c.respondidas >= 2500 },
  { id: 'a1500', grau: 5, nome: 'Mil e quinhentos acertos', titulo: 'Oráculo Vivo', texto: 'Acertou 1.500 questões.', teste: c => c.acertos >= 1500 },
  { id: 'seq30', grau: 5, nome: 'Perfeição em série', titulo: 'Invencível', texto: 'Acertou 30 questões seguidas.', teste: c => c.melhorSeq >= 30 },
  { id: 'onda25', grau: 5, nome: 'Além da 25ª onda', titulo: 'Escolhido(a) do Sábio', texto: 'Chegou à 25ª onda em uma jornada do Sábio.', teste: c => c.sabio.melhorOnda >= 25 },
  { id: 'ini200', grau: 5, nome: 'Lenda da caçada', titulo: 'Flagelo dos Reinos', texto: 'Derrotou 200 inimigos no Reino do Sábio.', teste: c => c.sabio.inimigos >= 200 },
  { id: 'regioes70', grau: 5, nome: 'Domínio total', titulo: 'Sábio(a) dos Quinze Domínios', texto: 'Fez 70% ou mais em todas as 15 competências, com ao menos 10 tentativas em cada.', teste: c => c.regioes70 },
  { id: 'todas', grau: 5, nome: 'Grimório completo', titulo: 'Lenda Viva', texto: 'Respondeu todas as questões disponíveis na sua língua estrangeira.', teste: c => c.disponiveis > 0 && c.vistas >= c.disponiveis },
];

/* Guia da Torre da Redação. Fonte de tudo o que está aqui: INEP, A redação do Enem 2026:
   cartilha do participante. As páginas citadas são as impressas na Cartilha. */
const GUIA_REDACAO = {
  regras: [
    ['Tipo de texto', 'Dissertativo-argumentativo em prosa: você defende um ponto de vista sobre o tema, com argumentos, e fecha com uma proposta de intervenção.', 'p. 5'],
    ['Linguagem', 'Modalidade escrita formal da língua portuguesa, sem marcas de oralidade.', 'p. 5 e 40'],
    ['Nota', 'De 0 a 1.000. São cinco competências, cada uma valendo até 200 pontos.', 'p. 6'],
    ['Quem corrige', 'Duas pessoas formadas em Letras ou Linguística, sem que uma veja a nota da outra. A nota final é a média das duas.', 'p. 5 e 6'],
    ['Quando há discrepância', 'Se as notas diferem em mais de 100 pontos no total, ou em mais de 80 em uma competência, entra uma terceira avaliação. Persistindo a diferença, uma banca de três avaliadores decide.', 'p. 6 e 7'],
    ['Título', 'É opcional e não vale ponto, mas conta como linha escrita e pode zerar a redação se trouxer desenho ou impropério.', 'p. 9'],
  ],
  estrutura: [
    { nome: 'Introdução', cor: 1, funcao: 'Apresentar o tema dentro do recorte pedido e deixar claro o seu ponto de vista.',
      passos: ['Contextualize o problema da frase temática, sem generalizar o assunto.',
               'Mostre logo qual é a sua posição: é ela que os parágrafos seguintes vão defender.',
               'Se usar um repertório aqui, ligue-o diretamente ao tema. Referência decorada que serviria para qualquer tema é o chamado repertório de bolso.'],
      competencias: 'Pesa nas competências II e III.' },
    { nome: 'Desenvolvimento 1', cor: 2, funcao: 'Comprovar o ponto de vista com o primeiro argumento.',
      passos: ['Abra o parágrafo com a ideia central dele.',
               'Explique o argumento com exemplo, dado, comparação ou repertório relacionado ao tema.',
               'Deixe explícito por que aquilo sustenta a sua posição, sem lacunas para o leitor preencher.'],
      competencias: 'Pesa nas competências II, III e IV.' },
    { nome: 'Desenvolvimento 2', cor: 3, funcao: 'Aprofundar a defesa com outro argumento, sem repetir o anterior.',
      passos: ['Comece ligando este parágrafo ao anterior com um conectivo que faça sentido.',
               'Traga um ângulo novo do problema, de preferência uma causa ou consequência diferente.',
               'Mantenha a progressão: cada parágrafo precisa acrescentar algo à discussão.'],
      competencias: 'Pesa nas competências II, III e IV.' },
    { nome: 'Conclusão', cor: 4, funcao: 'Fechar a discussão e apresentar a proposta de intervenção.',
      passos: ['Retome a ideia defendida, de modo coerente com a introdução.',
               'Apresente uma proposta concreta, ligada ao problema que você discutiu.',
               'Inclua os cinco elementos: ação, agente, meio, efeito e detalhamento.'],
      competencias: 'Pesa nas competências III, IV e V.' },
  ],
  avisoEstrutura: 'O INEP não fixa um número de parágrafos. A exigência é apresentar o ponto de vista, justificá-lo e concluir (p. 40), e texto em um parágrafo só é penalizado na Competência IV (p. 33). Quatro parágrafos são uma organização prática muito comum, e as Cartilhas também trazem redações nota 1.000 com cinco.',
  competencias: [
    { n: 'I', titulo: 'Escrita formal', avalia: 'Domínio da modalidade escrita formal: ortografia, acentuação, gramática, construção das frases e escolha de palavras.',
      nota200: 'Excelente domínio. Desvios só são aceitos como exceção, sem reincidência.',
      cuidados: ['Cuidado com concordância, regência, crase e pontuação.', 'Evite gírias e marcas de oralidade.', 'Siga o Novo Acordo Ortográfico.'], pagina: 'p. 12 a 14' },
    { n: 'II', titulo: 'Tema e repertório', avalia: 'Compreender a proposta, desenvolver o tema no tipo dissertativo-argumentativo e usar repertório sociocultural produtivo.',
      nota200: 'Argumentação consistente, repertório produtivo e excelente domínio do tipo de texto.',
      cuidados: ['Tangenciar o tema limita a competência a 40 pontos (p. 40).', 'Fugir totalmente do tema zera a redação.', 'Não copie os textos motivadores: linhas copiadas são desconsideradas.', 'O repertório deve ser pertinente e articulado ao argumento, e não enfeite.'], pagina: 'p. 14 a 27' },
    { n: 'III', titulo: 'Projeto de texto', avalia: 'Selecionar, relacionar, organizar e interpretar informações em defesa de um ponto de vista.',
      nota200: 'Informações consistentes e organizadas, configurando autoria em defesa de um ponto de vista.',
      cuidados: ['Planeje antes de escrever: defina a posição e a ordem dos argumentos.', 'Desenvolva cada argumento, sem deixar ideias soltas.', 'Limitar-se aos argumentos dos textos motivadores reduz a nota.', 'Confira se a conclusão conversa com a introdução.'], pagina: 'p. 28 a 31' },
    { n: 'IV', titulo: 'Coesão', avalia: 'Uso de recursos linguísticos que ligam frases e parágrafos: conectivos, pronomes, sinônimos e expressões de retomada.',
      nota200: 'Articula bem as partes do texto, com repertório diversificado de recursos coesivos.',
      cuidados: ['Ligue os parágrafos entre si e as ideias dentro deles.', 'Varie os recursos para não repetir palavras.', 'Conectivo em excesso ou sem relação lógica prejudica: ele precisa fazer sentido.'], pagina: 'p. 31 a 34' },
    { n: 'V', titulo: 'Proposta de intervenção', avalia: 'Elaborar uma iniciativa concreta para enfrentar o problema, respeitando os direitos humanos.',
      nota200: 'Proposta muito bem elaborada, detalhada, relacionada ao tema e articulada à discussão.',
      cuidados: ['Proponha, não apenas constate: "faltam investimentos" não é proposta.', 'Evite propostas vagas ou condicionais do tipo "se x for feito".', 'Desrespeitar os direitos humanos leva a 0 nesta competência.'], pagina: 'p. 35 a 38' },
  ],
  proposta: [
    ['Ação', 'O que deve ser feito?', 'É o elemento essencial da proposta.'],
    ['Agente', 'Quem deve fazer?', 'Indivíduo, família, comunidade, sociedade, política ou governo, conforme o âmbito da ação.'],
    ['Meio ou modo', 'Como viabilizar?', 'Por qual caminho a ação será executada.'],
    ['Efeito ou finalidade', 'Para quê? Que efeito pode alcançar?', 'O resultado que a ação busca.'],
    ['Detalhamento', 'O que mais pode ser acrescentado?', 'Uma informação a mais sobre qualquer um dos elementos anteriores.'],
  ],
  direitosHumanos: 'São sempre contrárias aos direitos humanos: defesa de tortura, mutilação, execução sumária e "justiça com as próprias mãos", incitação à violência por raça, etnia, gênero, credo, opinião política, condição física ou origem, e discurso de ódio contra grupos sociais (p. 37).',
  notaZero: [
    'Fuga total ao tema.',
    'Não obedecer ao tipo dissertativo-argumentativo.',
    'Folha de redação em branco.',
    'Até 7 linhas manuscritas (texto insuficiente), qualquer que seja o conteúdo.',
    'Impropérios, desenhos ou outras formas propositais de anulação.',
    'Parte deliberadamente desconectada do tema, como bilhetes à banca, recados ou trechos sem ligação com a argumentação.',
    'Nome, assinatura, rubrica ou outra identificação fora do local indicado.',
    'Texto predominante ou totalmente em língua estrangeira.',
    'Letra ilegível para dois avaliadores independentes.',
  ],
  checklist: [
    'Li a proposta inteira e os textos motivadores antes de começar.',
    'Sei exatamente qual é o recorte da frase temática.',
    'Defini meu ponto de vista e a ordem dos argumentos.',
    'Meu repertório vai além dos textos motivadores e está ligado ao tema.',
    'Cada parágrafo acrescenta algo e se liga ao anterior.',
    'A proposta tem ação, agente, meio, efeito e detalhamento.',
    'A proposta respeita os direitos humanos.',
    'Reli o texto procurando desvios de escrita formal.',
    'Não assinei nem desenhei nada fora do lugar indicado.',
  ],
  documentos: [
    ['cartilha_2026.pdf', 'Cartilha do Participante 2026 (a mais recente)'],
    ['manual_correcao_competencia_1.pdf', 'Manual de correção: Competência 1'],
    ['manual_correcao_competencia_2.pdf', 'Manual de correção: Competência 2'],
    ['manual_correcao_competencia_3.pdf', 'Manual de correção: Competência 3'],
    ['manual_correcao_competencia_4.pdf', 'Manual de correção: Competência 4'],
    ['manual_correcao_competencia_5.pdf', 'Manual de correção: Competência 5'],
    ['manual_correcao_nota_zero.pdf', 'Manual de correção: situações de nota zero'],
    ['nota_direitos_humanos_redacao.pdf', 'Nota do INEP sobre direitos humanos na redação'],
    ['matriz_de_referencia_enem.pdf', 'Matrizes de Referência do Enem'],
  ],
};
