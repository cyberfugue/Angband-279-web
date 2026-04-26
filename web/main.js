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
  });
  fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(document.getElementById("terminal"));
  fitAddon.fit();
  term.focus();
  term.writeln("Connecting to Angband server...");
} catch (err) {
  setStatus(`Terminal failed to start: ${err.message}`, "error");
  throw err;
}

let cursor = 0;
let hadSuccessfulPoll = false;

setStatus("Connecting to the game backend...");

async function post(path, data) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (err) {
    setStatus(`Request to ${path} failed: ${err.message}`, "error");
  }
}

async function pump() {
  try {
    const res = await fetch(`/api/output?since=${cursor}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (!hadSuccessfulPoll) {
      hadSuccessfulPoll = true;
      setStatus("Connected. Use your keyboard to play.", "ok");
    }
    cursor = payload.next;
    if (payload.data) term.write(payload.data);
  } catch (err) {
    if (!hadSuccessfulPoll) {
      setStatus(
        "No backend detected. This Vercel deploy is frontend-only, so Angband cannot run here. Run the Python server locally or connect this page to a live backend.",
        "error"
      );
    } else {
      setStatus("Connection lost. Trying to reconnect...", "error");
      term.writeln("\r\n[connection lost]");
    }
  } finally {
    setTimeout(pump, hadSuccessfulPoll ? 30 : 1000);
  }
}

term.onData((data) => post("/api/input", { data }));

async function resize() {
  fitAddon.fit();
  await post("/api/resize", { rows: term.rows, cols: term.cols });
}

window.addEventListener("resize", resize);
document.getElementById("reset").addEventListener("click", async () => {
  await post("/api/reset", {});
  term.reset();
  cursor = 0;
  hadSuccessfulPoll = false;
  setStatus("Restart requested. Reconnecting...");
});

resize().then(pump);
