const out = document.getElementById("out");
const storePill = document.getElementById("storePill");
const verPill = document.getElementById("verPill");

function call(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, resolve);
  });
}

async function run(type, payload) {
  out.textContent = "Cargando...";
  const res = await call(type, payload);
  if (!res?.ok) {
    out.textContent = `Error: ${res?.error || "unknown"}`;
    return;
  }
  if (type === "PING") {
    storePill.textContent = `store: ${res.store?.name || "-"}`;
    verPill.textContent = `api: ${res.store?.apiVersion || "-"}`;
  }
  out.textContent = JSON.stringify(res.data, null, 2);
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
