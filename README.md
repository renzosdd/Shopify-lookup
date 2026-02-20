# Shopify Admin Inspector (Chrome Extension)

Extensión Chrome (Manifest V3) para consultar Shopify Admin API **sin backend** (sin Postman).

## Instalación (modo developer)
1. Abrí Chrome → `chrome://extensions`
2. Activá **Developer mode**
3. Click **Load unpacked**
4. Seleccioná la carpeta de esta extensión

## Configurar una Store
1. Abrí Options (desde el popup o desde la extensión)
2. Agregá:
   - **Shop domain**: `mi-tienda.myshopify.com`
   - **Admin API access token**: token de una **Custom App** instalada en la store
   - **API Version**: por defecto `2025-01`

### Scopes sugeridos (Custom App)
- `read_webhooks`
- `read_orders`
- `read_customers`
- `read_products`
- (opcional inventario) `read_inventory`

## Uso
Abrí el popup:
- **Test**: valida token consultando `shop.json`
- **Webhooks / Orders / Customers / Products**: lista items y muestra JSON

## Notas de seguridad
Sin backend, el token queda guardado localmente en tu navegador (`chrome.storage.local`). Usalo para entornos internos.
