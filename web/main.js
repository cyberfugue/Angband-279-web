const statusEl = document.getElementById("status");

// gameOver prevents postRun's Module.setStatus("") from erasing error messages.
let gameOver = false;

function setStatus(message, tone = "info") {
  if (gameOver && tone !== "error") return;
  statusEl.textContent = message;
  statusEl.classList.remove("status--ok", "status--error");
  if (tone === "ok") statusEl.classList.add("status--ok");
  if (tone === "error") statusEl.classList.add("status--error");
}

setStatus("Loading terminal UI...");

if (!window.Terminal || !window.FitAddon?.FitAddon) {
  setStatus(
    "Terminal assets failed to load. Please disable content blockers or reload on a stable connection.",
    "error"
  );
  throw new Error("xterm.js is unavailable");
}

let term;
let fitAddon;

try {
  term = new Terminal({
    cursorBlink: true,
    fontSize: 15,
    fontFamily: "monospace",
    convertEol: false,
    scrollback: 0,
  });
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById("terminal"));
  fitAddon.fit();
  term.focus();
} catch (err) {
  setStatus(`Terminal failed to start: ${err.message}`, "error");
  throw err;
}

setStatus("Loading Angband...");

// The Module object must exist before angband.js is loaded so Emscripten
// picks up our overrides.
window.Module = {
  // Key queue shared between xterm.js (producer) and js_getchar (consumer).
  _keyQueue: [],
  _keyWaiter: null,

  // Direct write path: C calls js_write_buf() → Module.termWrite() → term.write().
  // This bypasses Emscripten's TTY entirely so no buffering surprises.
  termWrite: function (str) {
    term.write(str);
  },

  preRun: [
    function () {
      Module.ENV.ANGBAND_PATH = "/lib/";
      Module.ENV.TERM = "vt100";
    },
  ],

  // Module.print is Emscripten's stdout line callback (backup path).
  print: function (text) {
    term.write(text + "\r\n");
  },

  printErr: function (text) {
    // plog() in z-util.c writes the quit() error to stderr.
    // Route it to the terminal so we can see the actual crash reason.
    term.write("\x1b[31m" + text + "\x1b[0m\r\n");
    console.error("[Angband stderr]", text);
  },

  // Progress hook while angband.data is downloading.
  setStatus: function (msg) {
    if (msg && msg.indexOf("Running") === -1) {
      setStatus("Loading game data: " + msg);
    } else {
      setStatus("", "ok");
    }
  },

  // Fires when the C process calls exit(). Emscripten calls this before
  // postRun resets Module.setStatus, so we lock the error in place.
  onExit: function (code) {
    gameOver = true;
    var msg =
      code === 0
        ? "Game ended normally. Reload to play again."
        : "Game crashed (exit " + code + "). Reload to play again.";
    setStatus(msg, "error");
    console.error("Angband exited with code", code);
  },

  onRuntimeInitialized: function () {
    setStatus("", "ok");
    // Drain any keypresses that accumulated while the WASM was loading.
    Module._keyQueue.length = 0;
    Module._keyWaiter = null;

    // --- DIAGNOSTIC: write directly to xterm.js to confirm rendering works ---
    var twCalls = 0;
    var twBytes = 0;
    var origTermWrite = Module.termWrite;
    Module.termWrite = function (str) {
      twCalls++;
      twBytes += str.length;
      origTermWrite(str);
    };

    term.write("\x1b[2J\x1b[H\x1b[32mAngband starting...\x1b[0m\r\n");

    try {
      Module["_web_main"]();
    } catch (e) {
      if (e && e.name === "ExitStatus") {
        // onExit already fired for this case; this is a redundant catch.
        gameOver = true;
        setStatus(
          "Game exited (code " + e.status + "). Reload to play again.",
          "error"
        );
      } else if (e) {
        gameOver = true;
        setStatus("Runtime error: " + e.message, "error");
        console.error("Angband runtime error:", e);
      }
      // Asyncify suspension: _web_main() returns normally (no throw).
    }

    // Write diagnostic line after _web_main() returns.
    // If Asyncify is working, this runs once when the game suspends waiting
    // for the first keypress (at pause_line / news screen).
    term.write(
      "\r\n\x1b[33m[diag: termWrite=" +
        twCalls +
        " calls, " +
        twBytes +
        " bytes | cols=" +
        term.cols +
        " rows=" +
        term.rows +
        "]\x1b[0m\r\n"
    );
  },

  onAbort: function (what) {
    gameOver = true;
    setStatus("Fatal error: " + what, "error");
  },
};

// Wire xterm.js keyboard input → WASM key queue.
term.onData(function (data) {
  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    if (Module._keyWaiter) {
      const wakeUp = Module._keyWaiter;
      Module._keyWaiter = null;
      wakeUp(code);
    } else {
      Module._keyQueue.push(code);
    }
  }
});

window.addEventListener("resize", function () {
  fitAddon.fit();
});

document.getElementById("reset").addEventListener("click", function () {
  window.location.reload();
});

const script = document.createElement("script");
script.src = "./angband.js";
script.onerror = function () {
  setStatus(
    "Failed to load angband.js. Make sure the WASM files are deployed.",
    "error"
  );
};
document.head.appendChild(script);
