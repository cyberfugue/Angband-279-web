const term = new Terminal({
  cursorBlink: true,
  fontSize: 15,
  fontFamily: "monospace",
  convertEol: false,
});
const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById("terminal"));
fitAddon.fit();
term.focus();

let cursor = 0;

async function post(path, data) {
  await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

async function pump() {
  try {
    const res = await fetch(`/api/output?since=${cursor}`);
    const payload = await res.json();
    cursor = payload.next;
    if (payload.data) term.write(payload.data);
  } catch (err) {
    term.writeln("\r\n[connection lost]");
  } finally {
    setTimeout(pump, 30);
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
});

resize().then(pump);
