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

// Output buffer: accumulate chars from C fflush calls, then write to xterm.js.
// Module.print is called by Emscripten when C flushes a line to stdout.
let outputBuffer = "";

// The Module object must exist before angband.js is loaded so Emscripten
// picks up our overrides (print, preRun, onRuntimeInitialized).
window.Module = {
  // Key queue shared between xterm.js (producer) and js_getchar (consumer).
  _keyQueue: [],
  _keyWaiter: null,

  preRun: [
    function () {
      // Tell the game where its data files live (preloaded at /lib).
      Module.ENV.ANGBAND_PATH = "/lib/";
      Module.ENV.TERM = "vt100";
    },
  ],

  // Emscripten calls Module.print() for each chunk of stdout that was
  // flushed (either on \n or when C calls fflush).  We pipe it straight
  // to xterm.js so escape sequences are rendered by the terminal.
  print: function (text) {
    term.write(text);
  },

  printErr: function () {
    // Suppress stderr noise.
  },

  // Progress hook while angband.data is downloading.
  setStatus: function (msg) {
    if (msg) setStatus("Loading game data: " + msg);
  },

  onRuntimeInitialized: function () {
    setStatus("Starting Angband...");
    try {
      Module.callMain([]);
    } catch (e) {
      // Asyncify unwinds via a thrown object on first suspend; ignore it.
    }
    // After callMain returns the game is running asynchronously via Asyncify.
    // Clear the status bar so it doesn't overlap the game screen.
    setStatus("", "ok");
  },
};

// Wire xterm.js keyboard input → WASM key queue.
// Each character (or escape sequence byte) is pushed as a char code.
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

// Resize the terminal when the window changes.
window.addEventListener("resize", function () {
  fitAddon.fit();
});

// Reset: reload the page so the WASM restarts cleanly.
document.getElementById("reset").addEventListener("click", function () {
  window.location.reload();
});

// Dynamically load the Emscripten-generated game script.
const script = document.createElement("script");
script.src = "./angband.js";
script.onerror = function () {
  setStatus(
    "Failed to load angband.js. Make sure the WASM files are deployed.",
    "error"
  );
};
document.head.appendChild(script);
