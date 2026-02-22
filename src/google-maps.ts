/**
 * Google Maps API wrapper for geocoding and nearby store search.
 * Includes in-memory caching to minimize API calls.
 */

// ─── Types ───

export interface GeocodingResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

export interface StoreLocation {
  name: string;
  placeId: string;
  address: string;
  lat: number;
  lng: number;
  rating: number | null;
  openNow: boolean | null;
}

// ─── Cache ───

const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) return entry.data as T;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL_MS });
}

// ─── API Key ───

function getApiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY environment variable is not set. " +
        "Add it to mcp.json env or export it in your shell."
    );
  }
  return key;
}

// ─── Geocoding ───

export async function geocodeLocation(
  address: string
): Promise<GeocodingResult> {
  const cacheKey = `geocode:${address.trim().toLowerCase()}`;
  const cached = getCached<GeocodingResult>(cacheKey);
  if (cached) return cached;

  const apiKey = getApiKey();
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Geocoding API HTTP error: ${res.status}`);
  }

  const data = await res.json();

  if (data.status === "ZERO_RESULTS") {
    throw new Error(`No results found for address "${address}".`);
  }
  if (data.status !== "OK" || !data.results?.length) {
    throw new Error(
      `Geocoding API error for "${address}": ${data.status}${
        data.error_message ? " – " + data.error_message : ""
      }`
    );
  }

  const first = data.results[0];
  const result: GeocodingResult = {
    lat: first.geometry.location.lat,
    lng: first.geometry.location.lng,
    formattedAddress: first.formatted_address,
  };

  setCache(cacheKey, result);
  return result;
}

// ─── Nearby Store Search ───

const DEFAULT_STORE_NAMES = [
  "Trader Joe's",
  "Whole Foods",
  "Safeway",
  "Kroger",
  "Target",
];

export async function findStoresNearby(
  lat: number,
  lng: number,
  storeNames?: string[],
  radiusMeters: number = 8000,
  maxPerStore: number = 3
): Promise<Record<string, StoreLocation[]>> {
  const apiKey = getApiKey();
  const names = storeNames?.length ? storeNames : DEFAULT_STORE_NAMES;
  const results: Record<string, StoreLocation[]> = {};

  // Fetch all store types in parallel using Places API (New) — searchText endpoint
  const entries = await Promise.all(
    names.map(async (storeName): Promise<[string, StoreLocation[]]> => {
      const cacheKey = `places:${storeName.toLowerCase()}:${lat.toFixed(4)}:${lng.toFixed(4)}:${radiusMeters}`;
      const cached = getCached<StoreLocation[]>(cacheKey);
      if (cached) return [storeName, cached];

      try {
        const res = await fetch(
          "https://places.googleapis.com/v1/places:searchText",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.currentOpeningHours",
            },
            body: JSON.stringify({
              textQuery: storeName,
              maxResultCount: maxPerStore,
              locationBias: {
                circle: {
                  center: { latitude: lat, longitude: lng },
                  radius: radiusMeters,
                },
              },
            }),
          }
        );

        if (!res.ok) {
          console.error(
            `Places API HTTP error for "${storeName}": ${res.status}`
          );
          return [storeName, []];
        }

        const data = await res.json();

        if (!data.places?.length) {
          return [storeName, []];
        }

        const locations: StoreLocation[] = data.places.map((place: any) => ({
          name: place.displayName?.text ?? storeName,
          placeId: place.id ?? "",
          address: place.formattedAddress ?? "",
          lat: place.location?.latitude ?? lat,
          lng: place.location?.longitude ?? lng,
          rating: place.rating ?? null,
          openNow: place.currentOpeningHours?.openNow ?? null,
        }));

        setCache(cacheKey, locations);
        return [storeName, locations];
      } catch (err) {
        console.error(`Places API fetch error for "${storeName}":`, err);
        return [storeName, []];
      }
    })
  );

  for (const [name, locations] of entries) {
    results[name] = locations;
  }

  return results;
}
