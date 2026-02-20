# Shopify Admin Inspector (Chrome Extension)

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
- **Orders / Customers / Products**: buscá por término o ID (sin listar masivamente)
- **Webhooks**: carga completa sin búsqueda (y admite filtro opcional)
- **View detail**: carga el detalle completo del registro seleccionado
- **View payload**: abre el JSON completo (search o detail) en un modal
- **Download payload**: descarga el último payload como archivo `.json`
