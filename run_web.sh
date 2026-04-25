#!/usr/bin/env bash
set -euo pipefail

make -C angband-2.7.9v6/src \
  CFLAGS='-Wall -O2 -pipe -D"USE_CAP" -D"USE_HARDCODE"' \
  LIBS='-ltermcap'

exec python3 web_play.py
