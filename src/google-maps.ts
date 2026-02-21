import "dotenv/config";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

interface GeocodeResult {
  lat: number;
  lng: number;
  formattedAddress: string;
}

interface StoreLocation {
  name: string;
  placeId: string;
  address: string;
  lat: number;
  lng: number;
}

const DEFAULT_STORE_NAMES = [
  "Trader Joe's",
  "Whole Foods",
  "Safeway",
  "Kroger",
  "Target",
];

export async function geocodeLocation(address: string): Promise<GeocodeResult> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY not set. Add it to your .env file."
    );
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
  const response = await fetch(url);
  const data = (await response.json()) as {
    status: string;
    results: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
  };

  if (data.status !== "OK" || !data.results.length) {
    throw new Error(`Geocoding failed: ${data.status}`);
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formattedAddress: result.formatted_address,
  };
}

export async function findStoresNearby(
  lat: number,
  lng: number,
  storeNames?: string[],
  radiusMeters: number = 8000,
  maxPerStore: number = 3
): Promise<Record<string, StoreLocation[]>> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error(
      "GOOGLE_MAPS_API_KEY not set. Add it to your .env file."
    );
  }

  const names = storeNames && storeNames.length > 0 ? storeNames : DEFAULT_STORE_NAMES;
  const stores: Record<string, StoreLocation[]> = {};

  await Promise.all(
    names.map(async (storeName) => {
      const query = encodeURIComponent(storeName);
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&keyword=${query}&type=grocery_or_supermarket&key=${GOOGLE_MAPS_API_KEY}`;

      try {
        const response = await fetch(url);
        const data = (await response.json()) as {
          status: string;
          results: Array<{
            name: string;
            place_id: string;
            vicinity: string;
            geometry: { location: { lat: number; lng: number } };
          }>;
        };

        if (data.status !== "OK" || !data.results) {
          stores[storeName] = [];
          return;
        }

        stores[storeName] = data.results.slice(0, maxPerStore).map((r) => ({
          name: r.name,
          placeId: r.place_id,
          address: r.vicinity,
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
        }));
      } catch {
        stores[storeName] = [];
      }
    })
  );

  return stores;
}
