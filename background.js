// background.js (MV3 service worker) - Shopify REST client
// Stores are configured in Options page (shopDomain + Admin API access token).

const DEFAULT_API_VERSION = "2025-01";
const MAX_SEARCH_LIMIT = 25;
const DEFAULT_SEARCH_LIMIT = 10;
const MAX_LIST_LIMIT = 250;
const DEFAULT_LIST_LIMIT = 50;
const SEARCH_SCAN_LIMIT = 500;
const MAX_ALL_PRODUCTS_EXPORT = 100000;

async function getActiveStore() {
  const { activeStoreId, stores } = await chrome.storage.local.get(["activeStoreId", "stores"]);
  if (!stores?.length) throw new Error("No hay stores configuradas. Abrí Options y agregá una.");
  const store = stores.find(s => s.id === activeStoreId) || stores[0];
  if (!store?.shopDomain || !store?.token) throw new Error("Store incompleta (domain/token).");
  return { ...store, apiVersion: store.apiVersion || DEFAULT_API_VERSION };
}

async function shopifyRequest(path, { method = "GET", body } = {}) {
  const store = await getActiveStore();
  const url = `https://${store.shopDomain}/admin/api/${store.apiVersion}/${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-Shopify-Access-Token": store.token,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!res.ok) {
    const msg = json?.errors ? JSON.stringify(json.errors) : (json?.raw || res.statusText);
    throw new Error(`Shopify ${res.status}: ${msg}`);
  }
  return json;
}

function toStoreMeta(store) {
  return {
    name: store.name,
    shopDomain: store.shopDomain,
    apiVersion: store.apiVersion
  };
}

function clampLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_SEARCH_LIMIT;
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.trunc(value)));
}

function clampListLimit(limit) {
  const value = Number(limit);
  if (!Number.isFinite(value)) return DEFAULT_LIST_LIMIT;
  return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.trunc(value)));
}

function normalizeTerm(term) {
  return String(term ?? "").trim();
}

function isNumericId(value) {
  return /^\d+$/.test(value);
}

function cleanOrderName(term) {
  return term.startsWith("#") ? term : `#${term}`;
}

function includesIgnoreCase(value, needle) {
  return String(value ?? "").toLowerCase().includes(String(needle ?? "").toLowerCase());
}

function isOrderMatch(order, term) {
  return [
    order?.id,
    order?.name,
    order?.email,
    order?.customer?.email,
    order?.customer?.first_name,
    order?.customer?.last_name,
    order?.customer?.phone,
    order?.order_number
  ].some(value => includesIgnoreCase(value, term));
}

function isCustomerMatch(customer, term) {
  return [
    customer?.id,
    customer?.email,
    customer?.phone,
    customer?.first_name,
    customer?.last_name
  ].some(value => includesIgnoreCase(value, term));
}

function isProductMatch(product, term) {
  if ([
    product?.id,
    product?.title,
    product?.vendor,
    product?.handle,
    product?.product_type
  ].some(value => includesIgnoreCase(value, term))) {
    return true;
  }

  const variants = Array.isArray(product?.variants) ? product.variants : [];
  return variants.some(variant => includesIgnoreCase(variant?.sku, term));
}

async function listAllWebhooks() {
  const all = await collectPaginatedList("webhooks.json", "webhooks", { maxTotal: Number.MAX_SAFE_INTEGER });
  return { webhooks: all };
}

async function listAllProducts(maxTotal = MAX_ALL_PRODUCTS_EXPORT) {
  const safeMax = Number.isFinite(Number(maxTotal))
    ? Math.min(MAX_ALL_PRODUCTS_EXPORT, Math.max(1, Math.trunc(Number(maxTotal))))
    : MAX_ALL_PRODUCTS_EXPORT;
  const all = await collectPaginatedList("products.json", "products", { maxTotal: safeMax });
  return { products: all };
}

async function collectPaginatedList(path, listKey, { params = {}, maxTotal = SEARCH_SCAN_LIMIT } = {}) {
  let sinceId = null;
  const all = [];

  while (all.length < maxTotal) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        query.set(key, String(value));
      }
    });
    query.set("limit", String(MAX_LIST_LIMIT));
    if (sinceId) query.set("since_id", String(sinceId));

    const url = `${path}?${query.toString()}`;
    const data = await shopifyRequest(url);
    const items = Array.isArray(data?.[listKey]) ? data[listKey] : [];
    all.push(...items);

    if (items.length < MAX_LIST_LIMIT) break;
    const last = items[items.length - 1];
    if (!last?.id) break;
    sinceId = last.id;
  }

  return all.slice(0, maxTotal);
}

async function searchOrders(term, limit) {
  if (isNumericId(term)) {
    const detail = await shopifyRequest(`orders/${encodeURIComponent(term)}.json?status=any`);
    return { orders: detail?.order ? [detail.order] : [] };
  }

  const byName = await shopifyRequest(
    `orders.json?status=any&name=${encodeURIComponent(cleanOrderName(term))}&limit=${encodeURIComponent(limit)}`
  );
  if (Array.isArray(byName?.orders) && byName.orders.length > 0) return byName;

  const byRawName = await shopifyRequest(
    `orders.json?status=any&name=${encodeURIComponent(term)}&limit=${encodeURIComponent(limit)}`
  );
  if (Array.isArray(byRawName?.orders) && byRawName.orders.length > 0) return byRawName;

  const scan = await shopifyRequest(
    `orders.json?status=any&limit=${encodeURIComponent(limit)}`
  );
  const directList = Array.isArray(scan?.orders) ? scan.orders : [];
  if (directList.length > 0) {
    const filtered = directList.filter(order => isOrderMatch(order, term)).slice(0, limit);
    if (filtered.length > 0) return { orders: filtered };
  }

  const pagedList = await collectPaginatedList("orders.json", "orders", {
    params: { status: "any" },
    maxTotal: SEARCH_SCAN_LIMIT
  });
  return { orders: pagedList.filter(order => isOrderMatch(order, term)).slice(0, limit) };
}

async function searchCustomers(term, limit) {
  if (isNumericId(term)) {
    const detail = await shopifyRequest(`customers/${encodeURIComponent(term)}.json`);
    return { customers: detail?.customer ? [detail.customer] : [] };
  }

  const bySearch = await shopifyRequest(
    `customers/search.json?query=${encodeURIComponent(term)}&limit=${encodeURIComponent(limit)}`
  );
  if (Array.isArray(bySearch?.customers) && bySearch.customers.length > 0) return bySearch;

  const directScan = await shopifyRequest(
    `customers.json?limit=${encodeURIComponent(limit)}`
  );
  const directList = Array.isArray(directScan?.customers) ? directScan.customers : [];
  if (directList.length > 0) {
    const filtered = directList.filter(customer => isCustomerMatch(customer, term)).slice(0, limit);
    if (filtered.length > 0) return { customers: filtered };
  }

  const pagedList = await collectPaginatedList("customers.json", "customers", {
    maxTotal: SEARCH_SCAN_LIMIT
  });
  return { customers: pagedList.filter(customer => isCustomerMatch(customer, term)).slice(0, limit) };
}

async function searchProducts(term, limit) {
  if (isNumericId(term)) {
    const detail = await shopifyRequest(`products/${encodeURIComponent(term)}.json`);
    return { products: detail?.product ? [detail.product] : [] };
  }

  const byTitle = await shopifyRequest(
    `products.json?title=${encodeURIComponent(term)}&limit=${encodeURIComponent(limit)}`
  );
  if (Array.isArray(byTitle?.products) && byTitle.products.length > 0) return byTitle;

  const variantScan = await shopifyRequest(
    `variants.json?limit=${encodeURIComponent(MAX_LIST_LIMIT)}`
  );
  const variants = Array.isArray(variantScan?.variants) ? variantScan.variants : [];
  const pagedVariants = variants.length >= MAX_LIST_LIMIT
    ? await collectPaginatedList("variants.json", "variants", { maxTotal: SEARCH_SCAN_LIMIT })
    : variants;
  const ids = [...new Set(
    pagedVariants
      .filter(variant => includesIgnoreCase(variant?.sku, term))
      .map(variant => variant?.product_id)
      .filter(Boolean)
  )];
  if (ids.length > 0) {
    const idSlice = ids.slice(0, limit).join(",");
    const byIds = await shopifyRequest(
      `products.json?ids=${encodeURIComponent(idSlice)}&limit=${encodeURIComponent(limit)}`
    );
    if (Array.isArray(byIds?.products) && byIds.products.length > 0) return byIds;
  }

  const directScan = await shopifyRequest(
    `products.json?limit=${encodeURIComponent(MAX_LIST_LIMIT)}`
  );
  const directList = Array.isArray(directScan?.products) ? directScan.products : [];
  if (directList.length > 0) {
    const filtered = directList.filter(product => isProductMatch(product, term)).slice(0, limit);
    if (filtered.length > 0) return { products: filtered };
  }

  const pagedList = await collectPaginatedList("products.json", "products", {
    maxTotal: SEARCH_SCAN_LIMIT
  });
  return { products: pagedList.filter(product => isProductMatch(product, term)).slice(0, limit) };
}

function webhookMatchesTerm(webhook, term) {
  const needle = term.toLowerCase();
  const fields = [
    webhook?.id,
    webhook?.topic,
    webhook?.address,
    webhook?.format,
    webhook?.api_version
  ]
    .filter(Boolean)
    .map(v => String(v).toLowerCase());

  return fields.some(value => value.includes(needle));
}

async function searchWebhooks(term, limit) {
  if (!term) {
    return listAllWebhooks();
  }

  if (isNumericId(term)) {
    const detail = await shopifyRequest(`webhooks/${encodeURIComponent(term)}.json`);
    return { webhooks: detail?.webhook ? [detail.webhook] : [] };
  }

  const list = await collectPaginatedList("webhooks.json", "webhooks", { maxTotal: SEARCH_SCAN_LIMIT });
  return { webhooks: list.filter(item => webhookMatchesTerm(item, term)).slice(0, limit) };
}

function requireTerm(term) {
  if (!term) throw new Error("Ingresá un término de búsqueda.");
  if (term.length < 2 && !isNumericId(term)) {
    throw new Error("La búsqueda debe tener al menos 2 caracteres o un ID numérico.");
  }
}

// Message router (UI -> background)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      const store = await getActiveStore();
      switch (msg.type) {
        case "PING": {
          // Simple call to verify token/permissions
          const data = await shopifyRequest("shop.json");
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "LIST_WEBHOOKS": {
          const data = msg.all
            ? await listAllWebhooks()
            : await shopifyRequest(`webhooks.json?limit=${encodeURIComponent(clampListLimit(msg.limit))}`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "LIST_ORDERS": {
          const status = msg.status ?? "any";
          const limit = clampListLimit(msg.limit);
          const data = await shopifyRequest(`orders.json?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "LIST_CUSTOMERS": {
          const limit = clampListLimit(msg.limit);
          const data = await shopifyRequest(`customers.json?limit=${encodeURIComponent(limit)}`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "LIST_PRODUCTS": {
          const limit = clampListLimit(msg.limit);
          const data = await shopifyRequest(`products.json?limit=${encodeURIComponent(limit)}`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "LIST_ALL_PRODUCTS": {
          const data = await listAllProducts(msg.maxTotal);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "SEARCH_ORDERS": {
          const term = normalizeTerm(msg.term);
          requireTerm(term);
          const limit = clampLimit(msg.limit);
          const data = await searchOrders(term, limit);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "SEARCH_CUSTOMERS": {
          const term = normalizeTerm(msg.term);
          requireTerm(term);
          const limit = clampLimit(msg.limit);
          const data = await searchCustomers(term, limit);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "SEARCH_PRODUCTS": {
          const term = normalizeTerm(msg.term);
          requireTerm(term);
          const limit = clampLimit(msg.limit);
          const data = await searchProducts(term, limit);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "SEARCH_WEBHOOKS": {
          const term = normalizeTerm(msg.term);
          const limit = clampLimit(msg.limit);
          const data = await searchWebhooks(term, limit);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "GET_ORDER_DETAIL": {
          const id = normalizeTerm(msg.id);
          if (!isNumericId(id)) throw new Error("ID de orden inválido.");
          const data = await shopifyRequest(`orders/${encodeURIComponent(id)}.json?status=any`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "GET_CUSTOMER_DETAIL": {
          const id = normalizeTerm(msg.id);
          if (!isNumericId(id)) throw new Error("ID de customer inválido.");
          const data = await shopifyRequest(`customers/${encodeURIComponent(id)}.json`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "GET_PRODUCT_DETAIL": {
          const id = normalizeTerm(msg.id);
          if (!isNumericId(id)) throw new Error("ID de product inválido.");
          const data = await shopifyRequest(`products/${encodeURIComponent(id)}.json`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        case "GET_WEBHOOK_DETAIL": {
          const id = normalizeTerm(msg.id);
          if (!isNumericId(id)) throw new Error("ID de webhook inválido.");
          const data = await shopifyRequest(`webhooks/${encodeURIComponent(id)}.json`);
          return sendResponse({ ok: true, store: toStoreMeta(store), data });
        }
        default:
          return sendResponse({ ok: false, error: "Tipo de mensaje no soportado" });
      }
    } catch (e) {
      return sendResponse({ ok: false, error: e?.message || String(e) });
    }
  })();

  // Keep message channel open for async response
  return true;
});
