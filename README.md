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
5. `06_gerar_banco_final.py` e `07_gerar_redacao.py`: geram as imagens e os arquivos do jogo;
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

## Pastas

- `jogo/`: o jogo (Electron): `index.html`, `app.js`, `conteudo.js`, `estilo.css`, `main.js` e `preload.js`;
- `ferramentas/`: scripts que baixam, recortam e conferem as questões;
- `dados/`: mapeamentos e relatórios pequenos usados pelas ferramentas.

## Fontes dos dados

- Provas e gabaritos: https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos
- Microdados: https://www.gov.br/inep/pt-br/acesso-a-informacao/dados-abertos/microdados/enem
- Redação: Cartilhas do Participante, manuais de correção e Matrizes de Referência do INEP.

As fontes tipográficas Cinzel e Crimson Pro seguem a SIL Open Font License (licenças em `jogo/fontes`).
