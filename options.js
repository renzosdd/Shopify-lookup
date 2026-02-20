function uid() {
  return crypto.randomUUID();
}

const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const nameEl = document.getElementById("name");
const domainEl = document.getElementById("domain");
const tokenEl = document.getElementById("token");
const versionEl = document.getElementById("version");
const addBtn = document.getElementById("add");

function normalizeDomain(input) {
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function setStatus(message) {
  statusEl.textContent = message;
}

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (typeof text === "string") el.textContent = text;
  return el;
}

function renderStoreItem(store, isActive, stores, activeStoreId) {
  const li = createEl("li", "store-item");

  const topRow = createEl("div", "row");
  const badge = createEl("span", "pill", isActive ? "ACTIVE" : "INACTIVE");
  const name = createEl("strong", "", store.name);
  const meta = createEl("span", "store-meta", `${store.shopDomain} • API ${store.apiVersion || "2025-01"}`);
  topRow.appendChild(badge);
  topRow.appendChild(name);
  topRow.appendChild(meta);

  const controls = createEl("div", "row");
  controls.style.marginTop = "10px";

  const useBtn = createEl("button", "btn btn-tonal", "Use");
  useBtn.type = "button";
  useBtn.disabled = isActive;
  useBtn.onclick = async () => {
    await chrome.storage.local.set({ activeStoreId: store.id });
    await load();
  };

  const delBtn = createEl("button", "btn btn-danger", "Delete");
  delBtn.type = "button";
  delBtn.onclick = async () => {
    const next = stores.filter(s => s.id !== store.id);
    const newActive = activeStoreId === store.id ? next[0]?.id || null : activeStoreId;
    await chrome.storage.local.set({ stores: next, activeStoreId: newActive });
    await load();
  };

  controls.appendChild(useBtn);
  controls.appendChild(delBtn);
  li.appendChild(topRow);
  li.appendChild(controls);
  return li;
}

async function load() {
  const state = await chrome.storage.local.get(["stores", "activeStoreId"]);
  const stores = state.stores || [];
  let activeStoreId = state.activeStoreId || null;
  if (stores.length && !stores.some(s => s.id === activeStoreId)) {
    activeStoreId = stores[0].id;
    await chrome.storage.local.set({ activeStoreId });
  }
  const active = stores.find(s => s.id === activeStoreId) || stores[0];

  setStatus(
    stores.length
      ? `Configured stores: ${stores.length}. Active store: ${active?.name || "-"}`
      : "No stores configured yet."
  );

  listEl.innerHTML = "";
  stores.forEach(store => {
    const isActive = store.id === active?.id;
    listEl.appendChild(renderStoreItem(store, isActive, stores, activeStoreId));
  });
}

addBtn.onclick = async () => {
  const name = nameEl.value.trim();
  const shopDomain = normalizeDomain(domainEl.value);
  const token = tokenEl.value.trim();
  const apiVersion = versionEl.value.trim() || "2025-01";

  if (!name || !shopDomain || !token) {
    setStatus("Missing required fields: name, shop domain or token.");
    return;
  }

  if (!/^[a-z0-9-]+\.myshopify\.com$/i.test(shopDomain)) {
    setStatus("Invalid shop domain format. Use my-store.myshopify.com.");
    return;
  }

  const { stores = [] } = await chrome.storage.local.get(["stores"]);
  const exists = stores.some(s => s.shopDomain === shopDomain);
  if (exists) {
    setStatus("That shop domain is already configured.");
    return;
  }

  const store = { id: uid(), name, shopDomain, token, apiVersion };
  const next = [...stores, store];

  await chrome.storage.local.set({ stores: next, activeStoreId: store.id });

  nameEl.value = "";
  domainEl.value = "";
  tokenEl.value = "";
  versionEl.value = "";
  setStatus(`Store "${store.name}" saved. Active store updated.`);

  await load();
};

load();
