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
const detailTitle = document.getElementById("detailTitle");
const detailMeta = document.getElementById("detailMeta");
const detailGrid = document.getElementById("detailGrid");
const searchStatus = document.getElementById("searchStatus");
const resultCount = document.getElementById("resultCount");
const resultsEl = document.getElementById("results");
const runSearchBtn = document.getElementById("runSearch");
const searchTermEl = document.getElementById("searchTerm");
const searchLimitEl = document.getElementById("searchLimit");
const pingBtn = document.getElementById("ping");

const entityButtons = {
  orders: document.getElementById("entityOrders"),
  customers: document.getElementById("entityCustomers"),
  products: document.getElementById("entityProducts"),
  webhooks: document.getElementById("entityWebhooks")
};

const ENTITY_CONFIG = {
  orders: {
    label: "Orders",
    searchType: "SEARCH_ORDERS",
    detailType: "GET_ORDER_DETAIL",
    listKey: "orders",
    detailKey: "order",
    searchPlaceholder: "Ej: #1001 o ID numérico",
    toResultTitle: item => item.name || `Order ${item.id}`,
    toResultMeta: item => {
      const email = item.email || item.customer?.email || "-";
      const total = item.total_price ? `${item.total_price} ${item.currency || ""}`.trim() : "-";
      return `ID ${item.id} • ${email} • total ${total}`;
    },
    toDetailTitle: item => item.name || `Order ${item.id}`,
    toDetailMeta: item => `Creada ${formatDate(item.created_at)} • ${item.financial_status || "-"} / ${item.fulfillment_status || "-"}`,
    detailPairs: item => ([
      ["ID", item.id],
      ["Name", item.name],
      ["Email", item.email || item.customer?.email],
      ["Customer", item.customer ? `${item.customer.first_name || ""} ${item.customer.last_name || ""}`.trim() : "-"],
      ["Total", item.total_price ? `${item.total_price} ${item.currency || ""}`.trim() : "-"],
      ["Financial", item.financial_status],
      ["Fulfillment", item.fulfillment_status],
      ["Created", formatDate(item.created_at)]
    ])
  },
  customers: {
    label: "Customers",
    searchType: "SEARCH_CUSTOMERS",
    detailType: "GET_CUSTOMER_DETAIL",
    listKey: "customers",
    detailKey: "customer",
    searchPlaceholder: "Ej: mail, nombre, teléfono o ID",
    toResultTitle: item => `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.email || `Customer ${item.id}`,
    toResultMeta: item => `ID ${item.id} • ${item.email || "-"} • orders ${item.orders_count ?? "-"}`,
    toDetailTitle: item => `${item.first_name || ""} ${item.last_name || ""}`.trim() || item.email || `Customer ${item.id}`,
    toDetailMeta: item => `Creado ${formatDate(item.created_at)} • estado ${item.state || "-"}`,
    detailPairs: item => ([
      ["ID", item.id],
      ["Name", `${item.first_name || ""} ${item.last_name || ""}`.trim()],
      ["Email", item.email],
      ["Phone", item.phone],
      ["State", item.state],
      ["Orders count", item.orders_count],
      ["Verified email", String(item.verified_email ?? "-")],
      ["Created", formatDate(item.created_at)]
    ])
  },
  products: {
    label: "Products",
    searchType: "SEARCH_PRODUCTS",
    detailType: "GET_PRODUCT_DETAIL",
    listKey: "products",
    detailKey: "product",
    searchPlaceholder: "Ej: título, SKU o ID",
    toResultTitle: item => item.title || `Product ${item.id}`,
    toResultMeta: item => `ID ${item.id} • ${item.vendor || "-"} • variants ${item.variants?.length ?? "-"}`,
    toDetailTitle: item => item.title || `Product ${item.id}`,
    toDetailMeta: item => `Creado ${formatDate(item.created_at)} • status ${item.status || "-"}`,
    detailPairs: item => ([
      ["ID", item.id],
      ["Title", item.title],
      ["Vendor", item.vendor],
      ["Type", item.product_type],
      ["Status", item.status],
      ["Handle", item.handle],
      ["Variants", item.variants?.length ?? 0],
      ["Created", formatDate(item.created_at)]
    ])
  },
  webhooks: {
    label: "Webhooks",
    searchType: "SEARCH_WEBHOOKS",
    detailType: "GET_WEBHOOK_DETAIL",
    listKey: "webhooks",
    detailKey: "webhook",
    searchPlaceholder: "Ej: orders/create, endpoint o ID",
    toResultTitle: item => item.topic || `Webhook ${item.id}`,
    toResultMeta: item => `ID ${item.id} • ${item.address || "-"} • ${item.format || "-"}`,
    toDetailTitle: item => item.topic || `Webhook ${item.id}`,
    toDetailMeta: item => `Actualizado ${formatDate(item.updated_at)} • API ${item.api_version || "-"}`,
    detailPairs: item => ([
      ["ID", item.id],
      ["Topic", item.topic],
      ["Address", item.address],
      ["Format", item.format],
      ["API version", item.api_version],
      ["Fields", Array.isArray(item.fields) ? item.fields.join(", ") : "-"],
      ["Created", formatDate(item.created_at)],
      ["Updated", formatDate(item.updated_at)]
    ])
  }
};

let activeEntity = "orders";
let lastPayload = null;
let lastType = null;
const LEGACY_SCAN_LIMIT = 250;
const WEBHOOKS_ALL_LIMIT = 250;

function call(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, response => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function isNumericId(value) {
  return /^\d+$/.test(String(value).trim());
}

function formatDate(input) {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return input;
  return d.toLocaleString();
}

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function pretty(data) {
  return JSON.stringify(data, null, 2);
}

function safeValue(v) {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

function setPayloadState(enabled) {
  viewPayloadBtn.disabled = !enabled;
  downloadPayloadBtn.disabled = !enabled;
  dialogDownload.disabled = !enabled;
}

function setBusy(button, busy) {
  button.disabled = busy;
  if (busy) {
    button.classList.add("busy");
  } else {
    button.classList.remove("busy");
  }
}

function setStorePills(store) {
  if (!store) return;
  storePill.textContent = `store: ${store.name || store.shopDomain || "-"}`;
  verPill.textContent = `api: ${store.apiVersion || "-"}`;
}

function isUnsupportedTypeError(res) {
  const msg = normalize(res?.error);
  return msg.includes("tipo de mensaje no soportado");
}

function getLegacyListRequest(entity, limit, all = false) {
  switch (entity) {
    case "orders":
      return { type: "LIST_ORDERS", payload: { status: "any", limit } };
    case "customers":
      return { type: "LIST_CUSTOMERS", payload: { limit } };
    case "products":
      return { type: "LIST_PRODUCTS", payload: { limit } };
    case "webhooks":
      return { type: "LIST_WEBHOOKS", payload: { limit, all } };
    default:
      return null;
  }
}

function extractItems(entity, data) {
  const key = ENTITY_CONFIG[entity].listKey;
  const list = data?.[key];
  return Array.isArray(list) ? list : [];
}

function legacyItemMatches(entity, item, term) {
  const needle = normalize(term);
  if (!needle) return true;
  if (/^\d+$/.test(needle)) return String(item?.id ?? "") === needle;

  switch (entity) {
    case "orders":
      return [item?.name, item?.email, item?.customer?.email, item?.customer?.first_name, item?.customer?.last_name]
        .some(v => normalize(v).includes(needle));
    case "customers":
      return [item?.id, item?.email, item?.phone, item?.first_name, item?.last_name]
        .some(v => normalize(v).includes(needle));
    case "products":
      return [item?.id, item?.title, item?.vendor, item?.handle]
        .some(v => normalize(v).includes(needle));
    case "webhooks":
      return [item?.id, item?.topic, item?.address, item?.format, item?.api_version]
        .some(v => normalize(v).includes(needle));
    default:
      return false;
  }
}

async function searchWithFallback(entity, term, limit) {
  const cfg = ENTITY_CONFIG[entity];
  const isWebhookAll = entity === "webhooks" && !term;
  const primary = await call(cfg.searchType, { term, limit: isWebhookAll ? WEBHOOKS_ALL_LIMIT : limit });
  if (!isUnsupportedTypeError(primary)) return primary;

  const legacyReq = getLegacyListRequest(
    entity,
    entity === "webhooks" ? WEBHOOKS_ALL_LIMIT : LEGACY_SCAN_LIMIT,
    isWebhookAll
  );
  if (!legacyReq) return primary;

  const legacy = await call(legacyReq.type, legacyReq.payload);
  if (!legacy?.ok) return legacy;

  const rawItems = extractItems(entity, legacy.data);
  const filtered = rawItems.filter(item => legacyItemMatches(entity, item, term)).slice(0, isWebhookAll ? rawItems.length : limit);

  return {
    ok: true,
    store: legacy.store,
    data: { [cfg.listKey]: filtered },
    legacyFallback: true
  };
}

async function detailWithFallback(entity, id) {
  const cfg = ENTITY_CONFIG[entity];
  const primary = await call(cfg.detailType, { id: String(id) });
  if (!isUnsupportedTypeError(primary)) return primary;

  const fallbackList = await searchWithFallback(entity, String(id), 25);
  if (!fallbackList?.ok) return fallbackList;

  const list = extractItems(entity, fallbackList.data);
  const item = list.find(entry => String(entry?.id ?? "") === String(id));
  if (!item) return { ok: false, error: `No se encontró detalle para ID ${id}.` };

  return {
    ok: true,
    store: fallbackList.store,
    data: { [cfg.detailKey]: item },
    legacyFallback: true
  };
}

function buildPayload(type, res, meta = {}) {
  return {
    type,
    entity: activeEntity,
    generatedAt: new Date().toISOString(),
    store: res?.store || null,
    ...meta,
    payload: res?.data ?? null
  };
}

function renderPreview(payload) {
  const full = pretty(payload);
  const lines = full.split("\n");
  const maxLines = 36;
  if (lines.length > maxLines) {
    out.textContent = `${lines.slice(0, maxLines).join("\n")}\n... (${lines.length - maxLines} more lines)`;
  } else {
    out.textContent = full;
  }
}

function toFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const label = (lastType || "payload").toLowerCase();
  return `shopify-${activeEntity}-${label}-${stamp}.json`;
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

function clearDetailState(message = "Select a record to load full detail.") {
  detailTitle.textContent = "Detail";
  detailMeta.textContent = message;
  detailGrid.innerHTML = "";
}

function setEntity(entity) {
  activeEntity = entity;
  const cfg = ENTITY_CONFIG[activeEntity];
  Object.entries(entityButtons).forEach(([key, btn]) => {
    btn.classList.toggle("active", key === activeEntity);
  });
  lastPayload = null;
  lastType = null;
  setPayloadState(false);
  searchTermEl.placeholder = cfg.searchPlaceholder;
  runSearchBtn.textContent = activeEntity === "webhooks" ? "Load" : "Search";
  searchStatus.textContent = activeEntity === "webhooks"
    ? "Webhooks se cargan completos. Podés filtrar opcionalmente por topic/address/ID."
    : `Searching ${cfg.label.toLowerCase()} with capped limit.`;
  resultCount.textContent = "0 records";
  resultsEl.innerHTML = activeEntity === "webhooks"
    ? `<div class="empty-state">Click "Load" to fetch all webhooks, or type a filter.</div>`
    : `<div class="empty-state">Enter a search term to query ${cfg.label.toLowerCase()}.</div>`;
  clearDetailState();
  payloadInfo.textContent = "Detail payload preview";
  out.textContent = "Run a search and open a record detail.";

  if (activeEntity === "webhooks") {
    searchTermEl.value = "";
    runSearch();
  }
}

function getItemsFromSearch(data) {
  const cfg = ENTITY_CONFIG[activeEntity];
  const arr = data?.[cfg.listKey];
  return Array.isArray(arr) ? arr : [];
}

function renderDetail(item) {
  const cfg = ENTITY_CONFIG[activeEntity];
  detailTitle.textContent = cfg.toDetailTitle(item);
  detailMeta.textContent = cfg.toDetailMeta(item);
  detailGrid.innerHTML = "";
  cfg.detailPairs(item).forEach(([label, value]) => {
    const cell = document.createElement("div");
    cell.className = "kv";
    const k = document.createElement("span");
    k.className = "kv-label";
    k.textContent = label;
    const v = document.createElement("span");
    v.className = "kv-value";
    v.textContent = safeValue(value);
    cell.appendChild(k);
    cell.appendChild(v);
    detailGrid.appendChild(cell);
  });
}

async function loadDetail(recordId) {
  const cfg = ENTITY_CONFIG[activeEntity];
  setBusy(runSearchBtn, true);
  searchStatus.textContent = `Loading ${cfg.label.slice(0, -1).toLowerCase()} detail...`;

  const res = await detailWithFallback(activeEntity, String(recordId));
  setBusy(runSearchBtn, false);

  if (!res?.ok) {
    searchStatus.textContent = `Error: ${res?.error || "unknown"}`;
    return;
  }

  setStorePills(res.store);
  const item = res?.data?.[cfg.detailKey];
  if (!item) {
    searchStatus.textContent = "No detail payload returned.";
    return;
  }

  renderDetail(item);
  searchStatus.textContent = `${cfg.label.slice(0, -1)} detail loaded for ID ${item.id}.`;
  if (res.legacyFallback) {
    searchStatus.textContent += " (fallback legacy; reload extension to update service worker)";
  }

  lastType = "DETAIL";
  lastPayload = buildPayload("DETAIL", res, { recordId: item.id });
  payloadInfo.textContent = `${cfg.label.slice(0, -1)} detail payload`;
  renderPreview(lastPayload);
  setPayloadState(true);
}

function renderResults(items) {
  const cfg = ENTITY_CONFIG[activeEntity];
  resultsEl.innerHTML = "";
  if (!items.length) {
    resultsEl.innerHTML = `<div class="empty-state">No ${cfg.label.toLowerCase()} found for this search.</div>`;
    return;
  }

  items.forEach(item => {
    const card = document.createElement("div");
    card.className = "result-card";

    const title = document.createElement("p");
    title.className = "result-title";
    title.textContent = cfg.toResultTitle(item);

    const meta = document.createElement("p");
    meta.className = "result-meta";
    meta.textContent = cfg.toResultMeta(item);

    const actions = document.createElement("div");
    actions.className = "result-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-tonal";
    viewBtn.type = "button";
    viewBtn.textContent = "View detail";
    if (item?.id === null || item?.id === undefined) {
      viewBtn.disabled = true;
    } else {
      viewBtn.onclick = () => loadDetail(item.id);
    }

    actions.appendChild(viewBtn);
    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(actions);
    resultsEl.appendChild(card);
  });
}

async function runSearch() {
  const term = searchTermEl.value.trim();
  const isWebhookMode = activeEntity === "webhooks";
  const limit = isWebhookMode && !term ? WEBHOOKS_ALL_LIMIT : Number(searchLimitEl.value || 10);
  if (!term && !isWebhookMode) {
    searchStatus.textContent = "Enter a search term.";
    return;
  }

  if (!isWebhookMode && term.length < 2 && !isNumericId(term)) {
    searchStatus.textContent = "Use at least 2 chars or a numeric ID.";
    return;
  }

  const cfg = ENTITY_CONFIG[activeEntity];
  setBusy(runSearchBtn, true);
  searchStatus.textContent = isWebhookMode && !term
    ? "Loading all webhooks..."
    : `Searching ${cfg.label.toLowerCase()}...`;
  clearDetailState();

  const res = await searchWithFallback(activeEntity, term, limit);
  setBusy(runSearchBtn, false);

  if (!res?.ok) {
    searchStatus.textContent = `Error: ${res?.error || "unknown"}`;
    resultsEl.innerHTML = `<div class="empty-state">Search failed. Check token/scopes and term.</div>`;
    resultCount.textContent = "0 records";
    return;
  }

  setStorePills(res.store);
  const items = getItemsFromSearch(res.data);
  renderResults(items);
  resultCount.textContent = `${items.length} record${items.length === 1 ? "" : "s"}`;
  searchStatus.textContent = isWebhookMode && !term
    ? `Loaded ${items.length} webhooks.`
    : `Found ${items.length} ${cfg.label.toLowerCase()} for "${term}".`;
  if (res.legacyFallback) {
    searchStatus.textContent += " (fallback legacy; reload extension to update service worker)";
  }

  lastType = "SEARCH";
  lastPayload = buildPayload("SEARCH", res, { term, limit });
  payloadInfo.textContent = `${cfg.label} search payload`;
  renderPreview(lastPayload);
  setPayloadState(true);
}

async function ping() {
  setBusy(pingBtn, true);
  const res = await call("PING");
  setBusy(pingBtn, false);
  if (!res?.ok) {
    searchStatus.textContent = `Connection error: ${res?.error || "unknown"}`;
    return;
  }
  setStorePills(res.store);
  searchStatus.textContent = "Connection OK.";
}

document.getElementById("openOptions").onclick = (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
};

entityButtons.orders.onclick = () => setEntity("orders");
entityButtons.customers.onclick = () => setEntity("customers");
entityButtons.products.onclick = () => setEntity("products");
entityButtons.webhooks.onclick = () => setEntity("webhooks");

runSearchBtn.onclick = runSearch;
pingBtn.onclick = ping;

searchTermEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") runSearch();
});

viewPayloadBtn.onclick = openPayloadDialog;
downloadPayloadBtn.onclick = downloadPayload;
dialogClose.onclick = () => payloadDialog.close();
dialogDownload.onclick = downloadPayload;

setPayloadState(false);
setEntity("orders");
ping();
