#!/usr/bin/env bash
# Build Angband as WebAssembly for Vercel/browser deployment.
set -euo pipefail
cd "$(dirname "$0")"

SRC=angband-2.7.9v6/src
LIB=angband-2.7.9v6/lib
OUT=web

SRCS=(
  z-util.c z-virt.c z-form.c z-rand.c z-term.c
  variable.c tables.c util.c cave.c
  object1.c object2.c monster1.c monster2.c
  xtra1.c xtra2.c spells1.c spells2.c
  melee1.c melee2.c save.c files.c
  cmd1.c cmd2.c cmd3.c cmd4.c cmd5.c cmd6.c
  store.c birth.c load1.c load2.c
  wizard1.c wizard2.c
  generate.c dungeon.c init1.c init2.c
  main-web.c main.c
)

FULL_SRCS=()
for f in "${SRCS[@]}"; do
  FULL_SRCS+=("$SRC/$f")
done

emcc "${FULL_SRCS[@]}" \
  -DUSE_WEB \
  -O2 \
  -Wno-int-conversion \
  -Wno-implicit-int \
  -Wno-implicit-function-declaration \
  -Wno-return-type \
  -sASYNCIFY=1 \
  -sASYNCIFY_IMPORTS='["js_getchar"]' \
  -sALLOW_MEMORY_GROWTH=1 \
  -sFORCE_FILESYSTEM=1 \
  -sINVOKE_RUN=0 \
  -sEXPORTED_FUNCTIONS='["_main"]' \
  -sEXPORTED_RUNTIME_METHODS='["callMain","ENV","FS"]' \
  -sENVIRONMENT=web \
  --preload-file "$LIB@/lib" \
  --js-library "$SRC/js_lib.js" \
  -o "$OUT/angband.js"

echo "WASM build complete: $OUT/angband.js + angband.wasm + angband.data"
