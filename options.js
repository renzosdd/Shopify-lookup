function uid() {
  return crypto.randomUUID();
}

async function load() {
  const { stores = [], activeStoreId = null } = await chrome.storage.local.get(["stores", "activeStoreId"]);
  const list = document.getElementById("list");
  const status = document.getElementById("status");

  status.textContent = stores.length
    ? `Stores configuradas: ${stores.length}. Store activa: ${stores.find(s => s.id === activeStoreId)?.name || stores[0].name}`
    : "No hay stores configuradas todavía.";

  list.innerHTML = "";

  stores.forEach(store => {
    const li = document.createElement("li");
    const isActive = store.id === activeStoreId;
    li.innerHTML = `
      <div class="row">
        <span class="pill">${isActive ? "ACTIVA" : " "}</span>
        <b>${store.name}</b>
        <span class="muted">— ${store.shopDomain} — API ${store.apiVersion || "2025-01"}</span>
      </div>
      <div class="row" style="margin-top:6px;">
        <button data-act="${store.id}">Usar</button>
        <button data-del="${store.id}">Borrar</button>
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll("[data-act]").forEach(btn => {
    btn.onclick = async () => {
      await chrome.storage.local.set({ activeStoreId: btn.dataset.act });
      load();
    };
  });

  list.querySelectorAll("[data-del]").forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      const next = stores.filter(s => s.id !== id);
      const newActive = next[0]?.id || null;
      await chrome.storage.local.set({ stores: next, activeStoreId: newActive });
      load();
    };
  });
}

document.getElementById("add").onclick = async () => {
  const name = document.getElementById("name").value.trim();
  const shopDomain = document.getElementById("domain").value.trim();
  const token = document.getElementById("token").value.trim();
  const apiVersion = (document.getElementById("version").value.trim() || "2025-01");

  if (!name || !shopDomain || !token) return alert("Faltan datos (nombre, domain o token).");

  const { stores = [] } = await chrome.storage.local.get(["stores"]);
  const store = { id: uid(), name, shopDomain, token, apiVersion };
  const next = [...stores, store];

  await chrome.storage.local.set({ stores: next, activeStoreId: store.id });

  document.getElementById("name").value = "";
  document.getElementById("domain").value = "";
  document.getElementById("token").value = "";
  document.getElementById("version").value = "";

  load();
};

load();
