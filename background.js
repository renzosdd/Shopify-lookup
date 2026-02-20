// background.js (MV3 service worker) - Shopify REST client
// Stores are configured in Options page (shopDomain + Admin API access token).

const DEFAULT_API_VERSION = "2025-01";

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

// Message router (UI -> background)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.type) {
        case "PING": {
          const store = await getActiveStore();
          // Simple call to verify token/permissions
          const data = await shopifyRequest("shop.json");
          return sendResponse({ ok: true, store: { name: store.name, shopDomain: store.shopDomain, apiVersion: store.apiVersion }, data });
        }
        case "LIST_WEBHOOKS": {
          const data = await shopifyRequest("webhooks.json?limit=50");
          return sendResponse({ ok: true, data });
        }
        case "LIST_ORDERS": {
          const status = msg.status ?? "any";
          const limit = msg.limit ?? 50;
          const data = await shopifyRequest(`orders.json?status=${encodeURIComponent(status)}&limit=${limit}`);
          return sendResponse({ ok: true, data });
        }
        case "LIST_CUSTOMERS": {
          const limit = msg.limit ?? 50;
          const data = await shopifyRequest(`customers.json?limit=${limit}`);
          return sendResponse({ ok: true, data });
        }
        case "LIST_PRODUCTS": {
          const limit = msg.limit ?? 50;
          const data = await shopifyRequest(`products.json?limit=${limit}`);
          return sendResponse({ ok: true, data });
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
