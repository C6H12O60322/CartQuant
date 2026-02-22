# Ejemplos de Uso - Multi-Store Grocery Scraper

Este documento contiene ejemplos prácticos de cómo usar las herramientas del scraper.

## 🔍 Tool 1: search-grocery-products

Busca productos en múltiples tiendas y obtiene información superficial (top 5 de cada tienda).

### Ejemplo 1: Buscar en todas las tiendas

```json
{
  "query": "almond milk"
}
```

**Resultado:**
```json
{
  "query": "almond milk",
  "total_products": 15,
  "stores_searched": 3,
  "results": {
    "traderjoes": {
      "store_name": "Trader Joe's",
      "count": 5,
      "products": [
        {
          "name": "Organic Unsweetened Almond Milk",
          "price": "$3.99",
          "url": "https://www.traderjoes.com/...",
          "image_url": "https://...",
          "store": "Trader Joe's",
          "store_id": "traderjoes"
        }
      ]
    },
    "safeway": {
      "store_name": "Safeway",
      "count": 5,
      "products": [...]
    },
    "target": {
      "store_name": "Target",
      "count": 5,
      "products": [...]
    }
  }
}
```

### Ejemplo 2: Buscar solo en Trader Joe's y Safeway

```json
{
  "query": "organic pasta",
  "stores": ["traderjoes", "safeway"]
}
```

### Ejemplo 3: Buscar solo en Target

```json
{
  "query": "frozen pizza",
  "stores": ["target"]
}
```

## 📋 Tool 2: get-product-details

Obtiene información detallada de un producto específico usando la URL de los resultados de búsqueda.

### Ejemplo 1: Obtener detalles de un producto de Trader Joe's

```json
{
  "url": "https://www.traderjoes.com/home/products/pdp/organic-penne-pasta-12345"
}
```

**Resultado:**
```json
{
  "success": true,
  "store": "Trader Joe's",
  "store_id": "traderjoes",
  "product": {
    "name": "Organic Penne Pasta",
    "price": "$2.99",
    "unit_price": "$0.19/oz",
    "description": "Made with 100% organic durum wheat semolina...",
    "image_url": "https://...",
    "additional_images": ["https://...", "https://..."],
    "ingredients": [
      "Organic Durum Wheat Semolina",
      "Water"
    ],
    "nutrition_facts": {
      "serving_size": "2 oz (56g)",
      "servings_per_container": "8",
      "calories": "200",
      "total_fat": "1g",
      "saturated_fat": "0g",
      "trans_fat": "0g",
      "cholesterol": "0mg",
      "sodium": "0mg",
      "total_carbohydrate": "42g",
      "dietary_fiber": "2g",
      "total_sugars": "2g",
      "protein": "7g"
    },
    "allergens": ["Wheat"],
    "category": "Pasta & Grains",
    "brand": "Trader Joe's"
  },
  "scraped_at": "2026-02-21T10:30:00Z",
  "source_url": "https://..."
}
```

### Ejemplo 2: Con store_id explícito

```json
{
  "url": "https://www.safeway.com/shop/product-details.123456.html",
  "store_id": "safeway"
}
```

## 🎯 Flujo de Trabajo Completo

### Caso de Uso: Comparar precios de leche de almendras

**Paso 1:** Buscar en todas las tiendas
```json
{
  "tool": "search-grocery-products",
  "query": "almond milk",
  "stores": ["traderjoes", "safeway", "target"]
}
```

**Paso 2:** Revisar los resultados y elegir productos interesantes

**Paso 3:** Obtener detalles del producto más barato
```json
{
  "tool": "get-product-details",
  "url": "https://www.traderjoes.com/home/products/pdp/almond-milk-12345"
}
```

**Paso 4:** Comparar información nutricional y decidir

## 🛒 Casos de Uso Avanzados

### 1. Encontrar el mejor precio para pasta orgánica

```javascript
// Paso 1: Buscar
const searchResults = await search_grocery_products({
  query: "organic pasta",
  stores: ["traderjoes", "safeway", "target"]
});

// Paso 2: Comparar precios
const allProducts = [];
for (const [storeId, storeData] of Object.entries(searchResults.results)) {
  allProducts.push(...storeData.products);
}

// Ordenar por precio
const sortedByPrice = allProducts.sort((a, b) => {
  const priceA = parseFloat(a.price.replace('$', ''));
  const priceB = parseFloat(b.price.replace('$', ''));
  return priceA - priceB;
});

// Paso 3: Obtener detalles del más barato
const cheapest = sortedByPrice[0];
const details = await get_product_details({
  url: cheapest.url
});
```

### 2. Buscar productos sin gluten

```javascript
// Paso 1: Buscar productos
const results = await search_grocery_products({
  query: "gluten free bread",
  stores: ["traderjoes", "safeway", "target"]
});

// Paso 2: Obtener detalles de cada producto para verificar ingredientes
for (const product of results.results.traderjoes.products) {
  const details = await get_product_details({
    url: product.url
  });
  
  // Verificar ingredientes y alérgenos
  if (!details.product.allergens.includes("Wheat")) {
    console.log(`✓ ${details.product.name} es sin gluten`);
  }
}
```

### 3. Crear lista de compras optimizada

```javascript
const shoppingList = [
  "organic milk",
  "whole wheat bread",
  "almond butter",
  "greek yogurt"
];

const optimizedCart = {};

for (const item of shoppingList) {
  // Buscar en todas las tiendas
  const results = await search_grocery_products({
    query: item,
    stores: ["traderjoes", "safeway", "target"]
  });
  
  // Encontrar el precio más bajo
  let bestDeal = null;
  let lowestPrice = Infinity;
  
  for (const [storeId, storeData] of Object.entries(results.results)) {
    for (const product of storeData.products) {
      const price = parseFloat(product.price.replace('$', ''));
      if (price < lowestPrice) {
        lowestPrice = price;
        bestDeal = { ...product, store_id: storeId };
      }
    }
  }
  
  // Agregar al carrito optimizado
  if (bestDeal) {
    if (!optimizedCart[bestDeal.store_id]) {
      optimizedCart[bestDeal.store_id] = [];
    }
    optimizedCart[bestDeal.store_id].push(bestDeal);
  }
}

console.log("🛒 Carrito optimizado:", optimizedCart);
```

## 🔧 Tips y Mejores Prácticas

1. **Siempre usa `search-grocery-products` primero** para obtener URLs de productos
2. **Usa `get-product-details` solo cuando necesites información completa** (ingredientes, nutrición, etc.)
3. **Especifica las tiendas** si solo te interesan algunas: `stores: ["traderjoes"]`
4. **Maneja errores**: Algunas tiendas pueden fallar, revisa el campo `error` en los resultados
5. **Respeta rate limits**: Espera entre llamadas si haces muchas búsquedas
6. **Cache los resultados**: Los precios no cambian cada segundo, puedes cachear por algunas horas

## ⚠️ Limitaciones

- Máximo 5 productos por tienda en `search-grocery-products`
- Los precios pueden variar por ubicación
- Algunos productos pueden no estar disponibles en todas las ubicaciones
- La información nutricional depende de que esté disponible en el sitio web
- Rate limiting aplicado por Firecrawl

## 🆘 Solución de Problemas

### Error: "Could not extract product data"
- Verifica que la URL sea válida y el producto exista
- Algunos productos pueden tener páginas con formato diferente

### Error: "Failed to search"
- Verifica tu API key de Firecrawl
- Revisa tu conexión a internet
- La tienda puede estar temporalmente inaccesible

### Resultados vacíos
- Intenta con términos de búsqueda más generales
- Verifica que el producto exista en esa tienda
- Algunas tiendas pueden tener menos productos disponibles online
