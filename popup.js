function $(id) {
  return document.getElementById(id);
}

const LOOKUP_CONFIG = {
  item: {
    type: "item",
    label: "items",
    singular: "Item",
    entity: "products",
    searchType: "SEARCH_PRODUCTS",
    detailType: "GET_PRODUCT_DETAIL",
    listKey: "products",
    detailKey: "product",
    inputPlaceholder: "SKU, title or numeric ID...",
    sectionId: "itemSummarySection",
    listId: "itemSummary",
    metaId: "itemMeta",
    defaultMeta: "Waiting for lookup.",
    defaultEmpty: "No items loaded.",
    rowTitle: (item) => item?.title || `Product ${item?.id ?? "-"}`,
    rowMeta: (item) => `ID ${item?.id ?? "-"} • vendor ${item?.vendor || "-"} • variants ${item?.variants?.length ?? 0}`,
    detailMeta: (item) => `Product ${item?.id ?? "-"} • status ${item?.status || "-"}`,
    detailPairs: (item, context = {}) => {
      const pickedVariant = pickPreferredVariant(item, context.lookupTerm || "");
      return [
        ["Product ID", toShopifyGid("Product", item?.id)],
        ["Variant ID", toShopifyGid("ProductVariant", pickedVariant?.id)],
        ["Inventory ID", toShopifyGid("InventoryItem", pickedVariant?.inventory_item_id)],
        ["Variant SKU", pickedVariant?.sku || "-"],
        ["Title", item?.title],
        ["Vendor", item?.vendor],
        ["Type", item?.product_type],
        ["Status", item?.status],
        ["Handle", item?.handle],
        ["Variants", item?.variants?.length ?? 0],
        ["Created", formatDate(item?.created_at)]
      ];
    }
  },
  order: {
    type: "order",
    label: "orders",
    singular: "Order",
    entity: "orders",
    searchType: "SEARCH_ORDERS",
    detailType: "GET_ORDER_DETAIL",
    listKey: "orders",
    detailKey: "order",
    inputPlaceholder: "Order name, email or numeric ID...",
    sectionId: "orderSummarySection",
    listId: "orderSummary",
    metaId: "orderMeta",
    defaultMeta: "Waiting for lookup.",
    defaultEmpty: "No orders loaded.",
    rowTitle: (item) => item?.name || `Order ${item?.id ?? "-"}`,
    rowMeta: (item) => {
      const total = item?.total_price ? `${item.total_price} ${item.currency || ""}`.trim() : "-";
      return `ID ${item?.id ?? "-"} • ${item?.email || item?.customer?.email || "-"} • total ${total}`;
    },
    detailMeta: (item) => `Order ${item?.id ?? "-"} • ${item?.financial_status || "-"} / ${item?.fulfillment_status || "-"}`,
    detailPairs: (item) => ([
      ["ID", item?.id],
      ["Name", item?.name],
      ["Email", item?.email || item?.customer?.email],
      ["Customer", item?.customer ? `${item.customer.first_name || ""} ${item.customer.last_name || ""}`.trim() : "-"],
      ["Total", item?.total_price ? `${item.total_price} ${item.currency || ""}`.trim() : "-"],
      ["Financial", item?.financial_status],
      ["Fulfillment", item?.fulfillment_status],
      ["Created", formatDate(item?.created_at)]
    ])
  },
  customer: {
    type: "customer",
    label: "customers",
    singular: "Customer",
    entity: "customers",
    searchType: "SEARCH_CUSTOMERS",
    detailType: "GET_CUSTOMER_DETAIL",
    listKey: "customers",
    detailKey: "customer",
    inputPlaceholder: "Email, name, phone or numeric ID...",
    sectionId: "customerSummarySection",
    listId: "customerSummary",
    metaId: "customerMeta",
    defaultMeta: "Waiting for lookup.",
    defaultEmpty: "No customers loaded.",
    rowTitle: (item) => {
      const fullName = `${item?.first_name || ""} ${item?.last_name || ""}`.trim();
      return fullName || item?.email || `Customer ${item?.id ?? "-"}`;
    },
    rowMeta: (item) => `ID ${item?.id ?? "-"} • ${item?.email || "-"} • orders ${item?.orders_count ?? 0}`,
    detailMeta: (item) => `Customer ${item?.id ?? "-"} • state ${item?.state || "-"}`,
    detailPairs: (item) => ([
      ["ID", item?.id],
      ["Name", `${item?.first_name || ""} ${item?.last_name || ""}`.trim()],
      ["Email", item?.email],
      ["Phone", item?.phone],
      ["State", item?.state],
      ["Orders count", item?.orders_count],
      ["Verified email", String(item?.verified_email ?? "-")],
      ["Created", formatDate(item?.created_at)]
    ])
  },
  hooks: {
    type: "hooks",
    label: "webhooks",
    singular: "Hook",
    entity: "webhooks",
    searchType: "SEARCH_WEBHOOKS",
    detailType: "GET_WEBHOOK_DETAIL",
    listKey: "webhooks",
    detailKey: "webhook",
    inputPlaceholder: "Optional filter (topic, endpoint or ID)...",
    sectionId: "hooksSection",
    listId: "hooksList",
    metaId: "hooksMeta",
    defaultMeta: "Click look up to load all webhooks.",
    defaultEmpty: "No hooks loaded.",
    rowTitle: (item) => item?.topic || `Webhook ${item?.id ?? "-"}`,
    rowMeta: (item) => `ID ${item?.id ?? "-"} • ${item?.address || "-"} • ${item?.format || "-"}`,
    detailMeta: (item) => `Webhook ${item?.id ?? "-"} • api ${item?.api_version || "-"}`,
    detailPairs: (item) => ([
      ["ID", item?.id],
      ["Topic", item?.topic],
      ["Address", item?.address],
      ["Format", item?.format],
      ["API version", item?.api_version],
      ["Fields", Array.isArray(item?.fields) ? item.fields.join(", ") : "-"],
      ["Created", formatDate(item?.created_at)],
      ["Updated", formatDate(item?.updated_at)]
    ])
  }
};

const LOOKUP_ORDER = ["item", "order", "customer", "hooks"];
const WEBHOOKS_ALL_LIMIT = 250;
const LEGACY_SCAN_LIMIT = 250;

const state = {
  currentType: "item",
  resultsByType: {
    item: [],
    order: [],
    customer: [],
    hooks: []
  },
  lastLookupTermByType: {
    item: "",
    order: "",
    customer: "",
    hooks: ""
  },
  selectedDetail: null,
  lastPayload: null,
  lastPayloadType: null
};

function normalize(value) {
  return String(value ?? "").toLowerCase();
}

function isNumericId(value) {
  return /^\d+$/.test(String(value).trim());
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return char;
    }
  });
}

function safeValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function toShopifyGid(resourceType, numericId) {
  if (numericId === null || numericId === undefined || numericId === "") return "-";
  return `gid://shopify/${resourceType}/${numericId}`;
}

function pickPreferredVariant(product, hint = "") {
  const variants = Array.isArray(product?.variants) ? product.variants : [];
  if (!variants.length) return null;

  const cleaned = String(hint || "").trim();
  if (!cleaned) return variants[0];

  if (isNumericId(cleaned)) {
    const byId = variants.find((variant) => String(variant?.id) === cleaned);
    if (byId) return byId;
  }

  const lowered = cleaned.toLowerCase();
  const exactSku = variants.find((variant) => String(variant?.sku || "").toLowerCase() === lowered);
  if (exactSku) return exactSku;

  const partialSku = variants.find((variant) => String(variant?.sku || "").toLowerCase().includes(lowered));
  if (partialSku) return partialSku;

  return variants[0];
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}

function toCsv(rows) {
  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

function buildNetsuiteCsvRowsFromProducts(products, storeSite) {
  const rows = [
    ["NetSuite Item Id", "Foreign Item Id", "Foreign Variant Id", "Foreign Inventory Id", "Store Site"]
  ];

  const safeProducts = Array.isArray(products) ? products : [];
  safeProducts.forEach((product) => {
    const productGid = toShopifyGid("Product", product?.id);
    const variants = Array.isArray(product?.variants) ? product.variants : [];

    if (!variants.length) {
      rows.push([
        product?.handle || product?.title || String(product?.id || ""),
        productGid,
        "",
        "",
        storeSite
      ]);
      return;
    }

    variants.forEach((variant) => {
      const nsItemId = variant?.sku || product?.handle || product?.title || String(product?.id || "");
      rows.push([
        nsItemId,
        productGid,
        toShopifyGid("ProductVariant", variant?.id),
        toShopifyGid("InventoryItem", variant?.inventory_item_id),
        storeSite
      ]);
    });
  });

  return rows;
}

function formatDate(input) {
  if (!input) return "-";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return String(input);
  return date.toLocaleString();
}

function setStatus(message, tone = null) {
  const el = $("status");
  if (!el) return;
  const toneClass = tone === true || tone === "ok"
    ? "ok"
    : tone === false || tone === "bad"
      ? "bad"
      : tone === "warn"
        ? "warn"
        : "";
  el.textContent = message || "";
  el.className = `status${toneClass ? ` ${toneClass}` : ""}`;
}

function setStorePills(store) {
  if (!store) return;
  $("storePill").textContent = `store: ${store.name || store.shopDomain || "-"}`;
  $("verPill").textContent = `api: ${store.apiVersion || "-"}`;
}

function setBusy(buttonId, isBusy) {
  const btn = $(buttonId);
  if (!btn) return;
  btn.disabled = isBusy;
}

function call(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

function getConfigByType(type) {
  return LOOKUP_CONFIG[type] || LOOKUP_CONFIG.item;
}

function getConfigByEntity(entity) {
  return Object.values(LOOKUP_CONFIG).find((cfg) => cfg.entity === entity) || null;
}

function setPayloadState(enabled) {
  $("viewPayload").disabled = !enabled;
  $("downloadPayload").disabled = !enabled;
  $("dialogDownload").disabled = !enabled;
}

function buildPayload(kind, response, meta = {}) {
  return {
    kind,
    lookupType: state.currentType,
    generatedAt: new Date().toISOString(),
    store: response?.store || null,
    ...meta,
    payload: response?.data ?? null
  };
}

function isUnsupportedTypeError(response) {
  const msg = normalize(response?.error);
  return (
    msg.includes("tipo de mensaje no soportado")
    || msg.includes("could not establish connection")
    || msg.includes("receiving end does not exist")
  );
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
  const cfg = getConfigByEntity(entity);
  if (!cfg) return [];
  const list = data?.[cfg.listKey];
  return Array.isArray(list) ? list : [];
}

function legacyItemMatches(entity, item, term) {
  const needle = normalize(term);
  if (!needle) return true;
  if (isNumericId(needle)) return String(item?.id ?? "") === needle;

  switch (entity) {
    case "orders":
      return [
        item?.id,
        item?.name,
        item?.email,
        item?.customer?.email,
        item?.customer?.first_name,
        item?.customer?.last_name,
        item?.customer?.phone
      ].some((v) => normalize(v).includes(needle));
    case "customers":
      return [
        item?.id,
        item?.email,
        item?.phone,
        item?.first_name,
        item?.last_name
      ].some((v) => normalize(v).includes(needle));
    case "products":
      return [
        item?.id,
        item?.title,
        item?.vendor,
        item?.handle,
        item?.product_type
      ].some((v) => normalize(v).includes(needle));
    case "webhooks":
      return [
        item?.id,
        item?.topic,
        item?.address,
        item?.format,
        item?.api_version
      ].some((v) => normalize(v).includes(needle));
    default:
      return false;
  }
}

async function searchWithFallback(entity, term, limit) {
  const cfg = getConfigByEntity(entity);
  if (!cfg) return { ok: false, error: "Unsupported entity." };

  const loadAllHooks = entity === "webhooks" && !term;
  const primary = await call(cfg.searchType, {
    term,
    limit: loadAllHooks ? WEBHOOKS_ALL_LIMIT : limit
  });

  if (!isUnsupportedTypeError(primary)) return primary;

  const legacyReq = getLegacyListRequest(
    entity,
    loadAllHooks ? WEBHOOKS_ALL_LIMIT : LEGACY_SCAN_LIMIT,
    loadAllHooks
  );
  if (!legacyReq) return primary;

  const legacy = await call(legacyReq.type, legacyReq.payload);
  if (!legacy?.ok) return legacy;

  const rawItems = extractItems(entity, legacy.data);
  const filtered = rawItems
    .filter((item) => legacyItemMatches(entity, item, term))
    .slice(0, loadAllHooks ? rawItems.length : limit);

  return {
    ok: true,
    store: legacy.store,
    data: { [cfg.listKey]: filtered },
    legacyFallback: true
  };
}

async function detailWithFallback(entity, id) {
  const cfg = getConfigByEntity(entity);
  if (!cfg) return { ok: false, error: "Unsupported entity." };

  const primary = await call(cfg.detailType, { id: String(id) });
  if (!isUnsupportedTypeError(primary)) return primary;

  const fallbackList = await searchWithFallback(entity, String(id), 25);
  if (!fallbackList?.ok) return fallbackList;

  const list = extractItems(entity, fallbackList.data);
  const item = list.find((entry) => String(entry?.id ?? "") === String(id));
  if (!item) return { ok: false, error: `No detail found for ID ${id}.` };

  return {
    ok: true,
    store: fallbackList.store,
    data: { [cfg.detailKey]: item },
    legacyFallback: true
  };
}

function updateTypeButtons() {
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    const btnType = btn.getAttribute("data-type");
    const active = btnType === state.currentType;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function updateVisibleSummarySection() {
  LOOKUP_ORDER.forEach((type) => {
    const cfg = getConfigByType(type);
    const section = $(cfg.sectionId);
    if (!section) return;
    section.classList.toggle("hidden", type !== state.currentType);
  });
}

function renderDetailCard(detail = null) {
  const cfg = getConfigByType(state.currentType);
  const titleEl = $("shopifyResultTitle");
  const metaEl = $("shopifyResultMeta");
  const summaryEl = $("resultSummary");

  titleEl.textContent = "Shopify Result";

  if (!detail) {
    metaEl.textContent = "Select a record to view detail summary.";
    summaryEl.innerHTML = "<div class=\"placeholder\">No detail selected.</div>";
    return;
  }

  metaEl.textContent = cfg.detailMeta(detail);
  const lookupTerm = state.lastLookupTermByType[state.currentType] || "";
  const rows = cfg.detailPairs(detail, { lookupTerm }).map(([label, value]) => `
    <div class="summary-row">
      <span class="summary-label">${escapeHtml(label)}</span>
      <span class="summary-value">${escapeHtml(safeValue(value))}</span>
      <button class="btn ghost small copy-value" data-copy-value="${escapeHtml(safeValue(value))}" type="button">Copy</button>
    </div>
  `);
  summaryEl.innerHTML = rows.join("");
}

function renderSummaryForType(type) {
  const cfg = getConfigByType(type);
  const items = state.resultsByType[type] || [];
  const listEl = $(cfg.listId);
  const metaEl = $(cfg.metaId);

  if (!listEl || !metaEl) return;

  if (!items.length) {
    listEl.innerHTML = `<div class="placeholder">${escapeHtml(cfg.defaultEmpty)}</div>`;
    metaEl.textContent = cfg.defaultMeta;
    return;
  }

  metaEl.textContent = `${items.length} ${cfg.label} loaded.`;
  listEl.innerHTML = items.map((item) => {
    const title = cfg.rowTitle(item);
    const meta = cfg.rowMeta(item);
    const id = item?.id;
    const canView = id !== null && id !== undefined && String(id) !== "";
    return `
      <div class="id-row">
        <div class="id-label">${escapeHtml(cfg.singular)}</div>
        <code class="id-value">${escapeHtml(title)}</code>
        <button class="btn ghost small" data-view-id="${canView ? escapeHtml(String(id)) : ""}" ${canView ? "" : "disabled"}>View</button>
        <div class="comparison-note">${escapeHtml(meta)}</div>
      </div>
    `;
  }).join("");
}

function renderAllSummaries() {
  LOOKUP_ORDER.forEach((type) => renderSummaryForType(type));
}

function setLookupType(type, { autoLookupHooks = true } = {}) {
  if (!LOOKUP_CONFIG[type]) return;
  state.currentType = type;
  const cfg = getConfigByType(type);

  updateTypeButtons();
  updateVisibleSummarySection();

  $("lookupInput").placeholder = cfg.inputPlaceholder;
  $("lookup").textContent = type === "hooks" ? "Load hooks" : "Look up";
  $("summaryMeta").textContent = type === "hooks"
    ? "Load all webhooks (optional filter available)."
    : `Run a ${cfg.singular.toLowerCase()} lookup and then open detail for any record.`;

  if (!state.selectedDetail || state.selectedDetail.type !== type) {
    renderDetailCard(null);
  } else {
    renderDetailCard(state.selectedDetail.data);
  }

  if (type === "hooks" && autoLookupHooks && (!state.resultsByType.hooks || state.resultsByType.hooks.length === 0)) {
    $("lookupInput").value = "";
    runLookup();
  }
}

function toFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const kind = (state.lastPayloadType || "payload").toLowerCase();
  return `shopify-${state.currentType}-${kind}-${stamp}.json`;
}

function openPayloadDialog() {
  if (!state.lastPayload) return;
  $("dialogOut").textContent = JSON.stringify(state.lastPayload, null, 2);
  const dlg = $("payloadDialog");
  if (dlg.open) return;
  dlg.showModal();
}

function downloadPayload() {
  if (!state.lastPayload) return;
  const blob = new Blob([JSON.stringify(state.lastPayload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = toFilename();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

async function ping() {
  setBusy("ping", true);
  setStatus("Testing connection...");
  const res = await call("PING");
  setBusy("ping", false);

  if (!res?.ok) {
    setStatus(`Connection error: ${res?.error || "unknown"}`, "bad");
    return;
  }
  setStorePills(res.store);
  setStatus("Connection OK.", "ok");
}

async function runLookup() {
  const cfg = getConfigByType(state.currentType);
  const term = $("lookupInput").value.trim();
  const hooksAllMode = cfg.type === "hooks" && term === "";
  const limit = hooksAllMode ? WEBHOOKS_ALL_LIMIT : Number($("searchLimit").value || 10);

  if (!hooksAllMode && !term) {
    setStatus("Provide a lookup value.", "bad");
    return;
  }
  if (!hooksAllMode && term.length < 2 && !isNumericId(term)) {
    setStatus("Use at least 2 chars or a numeric ID.", "bad");
    return;
  }

  state.lastLookupTermByType[state.currentType] = term;

  setBusy("lookup", true);
  setStatus(
    hooksAllMode ? "Loading all webhooks..." : `Looking up ${cfg.label}...`,
    null
  );

  const res = await searchWithFallback(cfg.entity, term, limit);
  setBusy("lookup", false);

  if (!res?.ok) {
    state.resultsByType[state.currentType] = [];
    renderSummaryForType(state.currentType);
    $("summaryMeta").textContent = `Lookup failed for ${cfg.label}.`;
    setStatus(`Error: ${res?.error || "unknown"}`, "bad");
    return;
  }

  setStorePills(res.store);
  const items = extractItems(cfg.entity, res.data);
  state.resultsByType[state.currentType] = items;
  renderSummaryForType(state.currentType);

  state.selectedDetail = null;
  renderDetailCard(null);

  const loadedMsg = hooksAllMode
    ? `Loaded ${items.length} webhooks.`
    : `Found ${items.length} ${cfg.label} for "${term}".`;
  $("summaryMeta").textContent = loadedMsg;
  setStatus(res.legacyFallback ? `${loadedMsg} (legacy fallback mode)` : loadedMsg, items.length ? "ok" : "warn");

  state.lastPayloadType = "SEARCH";
  state.lastPayload = buildPayload("SEARCH", res, {
    term,
    limit: hooksAllMode ? "all" : limit,
    count: items.length
  });
  setPayloadState(true);
}

async function openDetailForRecord(id) {
  const cfg = getConfigByType(state.currentType);
  if (!id) return;

  setBusy("lookup", true);
  setStatus(`Loading ${cfg.singular.toLowerCase()} detail...`);
  const res = await detailWithFallback(cfg.entity, id);
  setBusy("lookup", false);

  if (!res?.ok) {
    setStatus(`Error: ${res?.error || "unknown"}`, "bad");
    return;
  }

  setStorePills(res.store);
  const detail = res?.data?.[cfg.detailKey];
  if (!detail) {
    setStatus("No detail payload returned.", "bad");
    return;
  }

  state.selectedDetail = { type: state.currentType, data: detail };
  renderDetailCard(detail);
  setStatus(
    `${cfg.singular} detail loaded for ID ${detail?.id ?? "-"}.`
      + (res.legacyFallback ? " (legacy fallback mode)" : ""),
    "ok"
  );

  state.lastPayloadType = "DETAIL";
  state.lastPayload = buildPayload("DETAIL", res, {
    recordId: detail?.id ?? id
  });
  setPayloadState(true);
}

function getStoreSiteValue() {
  const raw = String($("storeSite")?.value ?? "").trim();
  return raw || "1";
}

function csvTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function exportLoadedItemsCsv() {
  const products = state.resultsByType.item || [];
  if (!products.length) {
    setStatus("No loaded items to export. Run an item lookup first.", "warn");
    return;
  }

  const rows = buildNetsuiteCsvRowsFromProducts(products, getStoreSiteValue());
  if (rows.length <= 1) {
    setStatus("No rows generated for loaded items.", "warn");
    return;
  }

  const csv = toCsv(rows);
  const filename = `shopify-items-loaded-netsuite-${csvTimestamp()}.csv`;
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  setStatus(`CSV exported for loaded items (${rows.length - 1} rows).`, "ok");
}

async function exportAllProductsCsv() {
  setBusy("downloadAllProductsCsv", true);
  setStatus("Loading all products for CSV export...");

  const res = await call("LIST_ALL_PRODUCTS");
  setBusy("downloadAllProductsCsv", false);

  if (!res?.ok) {
    setStatus(`Error exporting all products: ${res?.error || "unknown"}`, "bad");
    return;
  }

  setStorePills(res.store);
  const products = extractItems("products", res.data);
  if (!products.length) {
    setStatus("No products found to export.", "warn");
    return;
  }

  const rows = buildNetsuiteCsvRowsFromProducts(products, getStoreSiteValue());
  const csv = toCsv(rows);
  const filename = `shopify-products-all-netsuite-${csvTimestamp()}.csv`;
  downloadTextFile(filename, csv, "text/csv;charset=utf-8");
  setStatus(`CSV exported for all products (${rows.length - 1} rows).`, "ok");
}

function bindEvents() {
  $("openOptions").addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  $("ping").addEventListener("click", () => ping());
  $("lookup").addEventListener("click", () => runLookup());

  $("lookupInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") runLookup();
  });

  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.getAttribute("data-type");
      setLookupType(type);
    });
  });

  $("summaryGrid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view-id]");
    if (!button) return;
    const id = button.getAttribute("data-view-id");
    if (!id) return;
    openDetailForRecord(id);
  });

  $("resultSummary").addEventListener("click", async (event) => {
    const button = event.target.closest(".copy-value");
    if (!button) return;
    const value = button.getAttribute("data-copy-value") || "";
    if (!value || value === "-") return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Value copied to clipboard.", "ok");
    } catch (error) {
      setStatus("Could not copy value.", "bad");
    }
  });

  $("downloadItemCsv").addEventListener("click", () => exportLoadedItemsCsv());
  $("downloadAllProductsCsv").addEventListener("click", () => exportAllProductsCsv());

  $("viewPayload").addEventListener("click", () => openPayloadDialog());
  $("downloadPayload").addEventListener("click", () => downloadPayload());
  $("dialogClose").addEventListener("click", () => $("payloadDialog").close());
  $("dialogDownload").addEventListener("click", () => downloadPayload());
}

async function init() {
  bindEvents();
  renderAllSummaries();
  renderDetailCard(null);
  setPayloadState(false);
  setLookupType("item", { autoLookupHooks: false });
  await ping();
}

init();
