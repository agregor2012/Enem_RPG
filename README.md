# ENEM RPG

Jogo de estudo para os dois dias do Enem (Linguagens, Ciências Humanas e Redação no 1º dia;
Ciências da Natureza e Matemática no 2º), feito com as provas oficiais do INEP de 2005 a 2025.
As questões aparecem recortadas das próprias provas, com o gabarito conferido entre os PDFs e
os microdados do INEP.

## O que há no jogo

- **Reinos das Letras, das Humanidades, da Natureza e dos Números:** um para cada área, com
  expedições por competência da Matriz de Referência do Enem e filtro de dificuldade (parâmetro
  da TRI publicado pelo INEP) e de ano.
- **Reino do Sábio:** todas as questões numa jornada sem fim, contra inimigos de todos os reinos.
  Cada acerto tira um ponto de vida do inimigo, a cada 5 ondas surge um chefe e a dificuldade
  sobe aos poucos. Dá para encerrar quando quiser.
- **Masmorra dos Erros:** revisão espaçada do que foi errado (1, 2, 4, 8 e 16 dias).
- **Arena do Simulado:** provas reais na ordem original, com cronômetro: o 1º dia, o 2º dia ou
  uma área só.
- **Torre da Redação:** estrutura, competências, proposta de intervenção e o que zera a nota,
  segundo a Cartilha do Participante do INEP, mais temas e redações publicadas pelo INEP.
- **Progressão:** XP, níveis, pontos, porcentagem de acerto por sessão e 59 conquistas em cinco
  graus (Bronze, Prata, Ouro, Platina e Lendária). Cada conquista libera um título para o herói.
- **Mapa:** atlas com os oito lugares do jogo, zoom pela roda do mouse e arraste para mover.
- **Itens e raridades:**
  - **O que há:** 72 itens em seis raridades (Comum, Incomum, Raro, Épico, Lendário e Mítico) e
    dez categorias.
  - **Mascotes:** doze, e todos evoluem de aparência em três formas.
    - Onze evoluem com as questões respondidas enquanto estão equipados.
    - A Lumina evolui com as conquistas.
  - **Pacote de cada reino:** um material, uma arma fabricada com ele (+10% de XP na área) e um
    mascote. O material vem da missão e do guardião do reino.
  - **Relíquias de conquista:** conquistas difíceis dão bônus permanentes, e quem já tinha a
    conquista recebe a relíquia ao abrir o jogo.
  - **Itens de estudo:** Amuleto do Eco (XP a mais ao acertar o que já errou), Anel da Chama
    Constante (XP pelos dias seguidos) e Lente do Analista (mostra o seu acerto em cada
    habilidade depois da resposta).
  - **Relógio dos Destinos:** uma vez por mês, deixa escolher um item lendário.
  - **Eventos especiais entre as questões:**
    - passagem secreta, com um baú escondido que só abre se você acertar a próxima questão;
    - mercador errante;
    - Fonte do Saber;
    - chuva de moedas.
  - **Missões dos reinos:** uma por reino, todo dia, além das missões do dia.
  - **Aprimoramento:** armas, armaduras, acessórios e artefatos podem ser aprimorados uma vez (+1)
    com Escamas do Dragão e Penas da Fênix.
  - **Inventário:** filtros, seis espaços de equipamento (arma, armadura, dois acessórios,
    artefato e mascote), fabricação com receitas que se liberam, loja com limite diário e
    missões do dia.
  - **De onde vêm:**
    - inimigos e guardiões;
    - monstros errantes do Reino do Sábio;
    - baús que aparecem entre as questões (às vezes um Mímico);
    - conquistas, missões e a loja.
  - **Regras:**
    - os itens ajudam sem dar a resposta: tiram no máximo duas alternativas erradas, mostram a
      habilidade cobrada, dão uma segunda chance ou protegem a sequência, e o acerto com ajuda
      vale metade;
    - no Simulado nenhum item muda a prova.

Ficam fora do banco as questões anuladas pelo INEP, as que têm gabaritos oficiais divergentes e
aquelas cujo recorte automático não ficou confiável. A lista, com o motivo de cada uma, aparece
no jogo em Ajustes.

## Como montar

O repositório traz o código do jogo e as ferramentas que montam o banco de questões. As provas,
os microdados e o jogo já montado não estão aqui: as ferramentas baixam tudo do INEP.

Requisitos (Windows):

- Python 3 com os pacotes de `ferramentas/requirements.txt`, num ambiente em
  `%LOCALAPPDATA%\ENEM-RPG-build\venv`;
- Node.js, com as dependências de `ferramentas/package-build.json` instaladas em
  `%LOCALAPPDATA%\ENEM-RPG-build\app` (copie o arquivo para lá como `package.json` e rode `npm install`);
- `curl.exe` do Windows, usado para baixar do INEP.

Rode os scripts de `ferramentas/` na ordem dos números:

1. `01_mapear_inep.py`: lista as provas e gabaritos da página do INEP;
2. `02_baixar_microdados.py`: lê dos microdados o gabarito, a habilidade, os parâmetros da TRI e a
   marcação de itens anulados, e traz as provas de 2005 a 2008;
3. `03_baixar_provas.py` e `04_baixar_documentos_redacao.py`: baixam as provas dos dois dias e
   os documentos oficiais da redação e das Matrizes de Referência;
4. `05_montar_banco.py`: recorta as questões dos PDFs e confere os gabaritos (`gerar_matriz.py`
   lê as competências e habilidades das Matrizes de Referência para `dados/matriz.json`);
5. `06_gerar_banco_final.py` e `07_gerar_redacao.py`: geram as imagens e os arquivos do jogo. O 06
   também acha, na imagem, a letra impressa de cada alternativa, onde o jogo marca a escolha e a
   correção; com `--so-alternativas`, ele só refaz as caixas das alternativas e das letras, sem
   gerar as imagens de novo;
6. `08_empacotar.sh`: monta o aplicativo em `app/` e o atalho `Jogar ENEM RPG.exe`.

Para testar a interface no navegador, sem empacotar: `node ferramentas/servidor_dev.js` e abra
`http://localhost:4173`.

## Novos reinos no mapa

O mapa é montado a partir de listas no começo da seção "mapa" de `jogo/app.js`. As duas vagas
do norte (`VAGAS_MAPA`) já abrigam os reinos da Natureza e dos Números. Para acrescentar outro
reino, desenhe o lugar numa função como `castelo()` (em volta do ponto 0, 0, com a faixa do nome
no fim), crie uma vaga nova onde houver espaço e acrescente o lugar em `LUGARES_MAPA` com o `x` e
o `y` dela e o id dela em `vaga`. Enquanto nenhum lugar ocupa uma vaga, ela aparece sob névoa
como "Terras não mapeadas". A estrada até os outros lugares (`ESTRADAS_MAPA`) é opcional.

## Itens novos

Os itens são só dados, em `jogo/itens.js`. Para criar um, acrescente uma entrada em `ITENS` com:

- id, nome, raridade e categoria;
- um ícone (os símbolos `it-*` de `jogo/index.html`) e a cor;
- a descrição e o texto do efeito;
- o que ele faz:
  - `uso`, para consumíveis e pergaminhos;
  - `bonus`, para equipamentos e relíquias;
  - `poder`, para artefatos e mascotes.

Os efeitos e bônus disponíveis estão descritos no começo do arquivo. Lá também estão três campos
opcionais:

- `tabelas`: limita de onde o item cai;
- `ativo`: uso pelo inventário uma vez por mês, como o do Relógio dos Destinos;
- `evolucao`: as formas de um mascote. As camadas de cada forma ficam no ícone dele em
  `jogo/index.html`, com `display: var(--f2, none)` e `display: var(--f3, none)`.

Com `drop: true` o item já entra nos sorteios da raridade dele. Ele também pode ganhar:

- uma receita (`RECEITAS`);
- um lugar na loja (`LOJA`);
- um monstro que o deixe cair (`MONSTROS_ERRANTES`);
- um posto de prêmio de conquista (`PREMIO_CONQUISTA`).

Ficam no mesmo arquivo:

- os limites que seguram o equilíbrio (`LIMITES`), como o máximo de bônus de XP e de alternativas
  eliminadas;
- o que cada modo de jogo permite (`REGRAS_MODO`);
- as regras de fim de sessão (`ESPOLIO_GUARDIAO` e `PREMIO_SIMULADO`) e o pacote de cada reino
  (`ITENS_DO_REINO`);
- os eventos especiais (`EVENTOS`), as missões dos reinos (`MISSOES_REINO`) e o aprimoramento
  (`APRIMORAMENTO`).

A lógica e as telas do inventário ficam em `jogo/inventario.js`.

### Artes dos itens

Os itens podem ter uma arte pintada no lugar do símbolo vetorial. As artes são geradas no Nano
Banana em 1024 x 1024, com fundo de cor chapada (verde `#00FF00`, ou magenta `#FF00FF` nos itens
verdes e incomuns) e o id do item no nome do arquivo: `<id>.png`, ou `<id>_1.png` a `<id>_3.png`
nas três formas de um mascote. Depois, rode:

    python -I ferramentas/artes_itens.py <pasta das artes> [<pasta dos originais>]

O script tira o fundo, centraliza o desenho e grava o ícone em `jogo/img/itens/<nome>.webp`
(256 x 256). Ele também atualiza a lista `jogo/artes.js` e, se for dada a segunda pasta, guarda ali
a arte sem fundo em 512 x 512. Item sem arte, ou forma de mascote sem arte, continua com o
símbolo `it-*`.

Enquanto o sistema está em teste, Ajustes tem um **modo desenvolvedor** temporário que:

- libera todos os itens, receitas e a loja numa cópia de teste do inventário, que não é gravada no
  save;
- tem opções para forçar baús, Mímicos, monstros errantes e eventos especiais, e para mostrar os
  mascotes na última forma.

## Pastas

- `jogo/`: o jogo (Electron): `index.html`, `app.js`, `conteudo.js`, `itens.js` (catálogo de itens), `inventario.js` (inventário, recompensas e fabricação), `estilo.css`, `main.js` e `preload.js`; as artes dos itens ficam em `img/itens/`, listadas em `artes.js`;
- `ferramentas/`: scripts que baixam, recortam e conferem as questões, e o que prepara as artes dos itens (`artes_itens.py`);
- `dados/`: mapeamentos e relatórios pequenos usados pelas ferramentas.

## Fontes dos dados

- Provas e gabaritos: https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos
- Microdados: https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/enem
- Redação: Cartilhas do Participante, manuais de correção e Matrizes de Referência do INEP.

As fontes tipográficas Cinzel e Crimson Pro seguem a SIL Open Font License (licenças em `jogo/fontes`).
