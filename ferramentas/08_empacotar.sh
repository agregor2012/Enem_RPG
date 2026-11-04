#!/usr/bin/env bash
# Empacota o jogo para Windows: gera banco/banco.asar, a pasta app/ e o atalho da raiz.
# Pré-requisitos: scripts 05, 06 e 07 já executados e dependências em
# %LOCALAPPDATA%/ENEM-RPG-build/app (electron, @electron/packager, @electron/asar).
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="$LOCALAPPDATA/ENEM-RPG-build"
CSC="/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe"

cd "$BUILD/app"
VERSAO="$(node -p "require('electron/package.json').version")"

mkdir -p "$RAIZ/banco"
cp "$RAIZ/dados/matriz.json" "$BUILD/banco/matriz.json"
npx asar pack "$BUILD/banco" "$RAIZ/banco/banco.asar"

npx electron-packager "$RAIZ/jogo" "ENEM RPG" --platform=win32 --arch=x64 \
  --electron-version="$VERSAO" --out="$BUILD/saida" --overwrite --asar \
  --icon="$RAIZ/jogo/icone.ico" --app-version=1.0.0 \
  --win32metadata.ProductName="ENEM RPG" --win32metadata.FileDescription="ENEM RPG"

SAIDA="$BUILD/saida/ENEM RPG-win32-x64"
find "$SAIDA/locales" -type f ! -name 'pt-BR.pak' ! -name 'en-US.pak' -delete
rm -rf "$RAIZ/app"
cp -r "$SAIDA" "$RAIZ/app"

cd "$RAIZ"
# opções com hífen: o Git Bash trocaria as com barra por caminhos do Windows
"$CSC" -nologo -target:winexe -codepage:65001 -win32icon:jogo/icone.ico \
  -reference:System.Windows.Forms.dll "-out:Jogar ENEM RPG.exe" 'ferramentas\jogar.cs'
echo "pronto: $RAIZ/Jogar ENEM RPG.exe"
