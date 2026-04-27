const statusEl = document.getElementById("status");

function setStatus(message, tone = "info") {
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

  printErr: function () {},

  // Progress hook while angband.data is downloading.
  setStatus: function (msg) {
    if (msg && msg.indexOf("Running") === -1) {
      setStatus("Loading game data: " + msg);
    } else {
      setStatus("", "ok");
    }
  },

  onRuntimeInitialized: function () {
    setStatus("", "ok");
    // Drain any keypresses that accumulated in the queue while the WASM was
    // loading (e.g. from the iOS keyboard opening, stray touch events, etc.).
    // Without this flush a phantom key would skip past pause_line(23) straight
    // into play_game() → Term_clear(), leaving a blank screen.
    Module._keyQueue.length = 0;
    Module._keyWaiter = null;
    try {
      Module["_web_main"]();
    } catch (e) {
      if (e && e.name === "ExitStatus") {
        setStatus(
          "Game exited (code " + e.status + "). Reload to play again.",
          "error"
        );
      } else if (e) {
        setStatus("Runtime error: " + e.message, "error");
        console.error("Angband runtime error:", e);
      }
      // Asyncify in emscripten 3.1.6 does NOT throw on suspension —
      // the WASM stack unwinds internally and _web_main() returns normally.
    }
  },

  onAbort: function (what) {
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
