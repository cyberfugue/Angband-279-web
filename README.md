# Angband-279-web

Web-playable wrapper for **Angband 2.7.9v6**.

## What was done

- Extracted the provided `angband-2.7.9v6.tar.gz` archive into `angband-2.7.9v6/`.
- Built a terminal (CAP) binary compatible with PTY hosting.
- Added a lightweight Python web server that runs Angband in a pseudo-terminal and streams terminal output to the browser.
- Added a browser client powered by xterm.js so you can play directly in a web page.

## Run locally

```bash
# 1) Build the game binary
make -C angband-2.7.9v6/src \
  CFLAGS='-Wall -O2 -pipe -D"USE_CAP" -D"USE_HARDCODE"' \
  LIBS='-ltermcap'

# 2) Start web server
python3 web_play.py
```

Then open:

- http://localhost:8080

## Notes

- This is server-hosted terminal gameplay (not WASM). The Angband process runs on the server, and browser keystrokes are forwarded to it.
- The game uses `ANGBAND_PATH=angband-2.7.9v6/lib` automatically in `web_play.py`.
