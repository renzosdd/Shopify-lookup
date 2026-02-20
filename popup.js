const out = document.getElementById("out");
const storePill = document.getElementById("storePill");
const verPill = document.getElementById("verPill");
const payloadInfo = document.getElementById("payloadInfo");
const viewPayloadBtn = document.getElementById("viewPayload");
const downloadPayloadBtn = document.getElementById("downloadPayload");
const payloadDialog = document.getElementById("payloadDialog");
const dialogOut = document.getElementById("dialogOut");
const dialogClose = document.getElementById("dialogClose");
const dialogDownload = document.getElementById("dialogDownload");

let lastPayload = null;
let lastType = null;

function call(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, resolve);
  });
}

function buildPayload(type, res) {
  return {
    type,
    generatedAt: new Date().toISOString(),
    store: res?.store || null,
    payload: res?.data ?? null
  };
}

function pretty(data) {
  return JSON.stringify(data, null, 2);
}

function setPayloadState(enabled) {
  viewPayloadBtn.disabled = !enabled;
  downloadPayloadBtn.disabled = !enabled;
  dialogDownload.disabled = !enabled;
}

function renderPreview(payload) {
  const full = pretty(payload);
  const lines = full.split("\n");
  const maxLines = 34;
  if (lines.length > maxLines) {
    out.textContent = `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} more lines)`;
  } else {
    out.textContent = full;
  }
}

function toFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = (lastType || "payload").toLowerCase();
  return `shopify-${label}-${stamp}.json`;
}

function downloadPayload() {
  if (!lastPayload) return;
  const blob = new Blob([pretty(lastPayload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = toFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

function openPayloadDialog() {
  if (!lastPayload) return;
  dialogOut.textContent = pretty(lastPayload);
  if (payloadDialog.open) return;
  payloadDialog.showModal();
}

function setBusy(isBusy) {
  const testBtn = document.getElementById("ping");
  if (isBusy) {
    testBtn.classList.add("busy");
    payloadInfo.textContent = "Loading response...";
    return;
  }
  testBtn.classList.remove("busy");
}

async function run(type, payload) {
  setBusy(true);
  out.textContent = "Loading...";
  const res = await call(type, payload);
  setBusy(false);

  if (!res?.ok) {
    payloadInfo.textContent = `Error for ${type}`;
    lastType = type;
    lastPayload = {
      type,
      generatedAt: new Date().toISOString(),
      error: res?.error || "unknown"
    };
    setPayloadState(true);
    renderPreview(lastPayload);
    return;
  }

  if (type === "PING") {
    storePill.textContent = `store: ${res.store?.name || "-"}`;
    verPill.textContent = `api: ${res.store?.apiVersion || "-"}`;
  }

  lastType = type;
  lastPayload = buildPayload(type, res);
  setPayloadState(true);
  payloadInfo.textContent = `${type} payload ready`;
  renderPreview(lastPayload);
}

document.getElementById("openOptions").onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

document.getElementById("ping").onclick = () => run("PING");
document.getElementById("webhooks").onclick = () => run("LIST_WEBHOOKS");
document.getElementById("orders").onclick = () => run("LIST_ORDERS", { status: "any", limit: 50 });
document.getElementById("customers").onclick = () => run("LIST_CUSTOMERS", { limit: 50 });
document.getElementById("products").onclick = () => run("LIST_PRODUCTS", { limit: 50 });

viewPayloadBtn.onclick = openPayloadDialog;
downloadPayloadBtn.onclick = downloadPayload;
dialogClose.onclick = () => payloadDialog.close();
dialogDownload.onclick = downloadPayload;

setPayloadState(false);
