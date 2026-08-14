# Part 4.1 — Geocoding Locations

## Context

Part 4 resolves an extracted address to a canonical `supermarket_location` row, and its strongest dedup signal is **geo-proximity** (two receipts within ~150 m of each other are almost certainly the same store). But receipts almost never print coordinates, so `supermarket_location.latitude` / `.longitude` start empty. This part fills them: derive lat/lng from the address **once, when a location row is first created**, and cache it on the row.

This is a **separate work effort** from Part 4 — Part 4 ships with lat/lng-based matching simply inactive (it falls back to address/branch matching) until this lands. Nothing here blocks Part 4.

**Principle: geocode per _location_, never per _receipt_.** The same branch resolves to one row, so geocoding is a one-time cost per physical store. And treat the result as low-confidence: keep the raw address, store the provider's confidence, and let the existing human-in-the-loop verify step catch bad placements rather than trusting the point blindly.

## Provider choice

| Provider             | Cost                                        | Jamaica coverage                                | Notes                                                      |
| -------------------- | ------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| **Google Geocoding** | ~$5/1k after free tier, needs billing + key | Best                                            | Returns structured components + `location_type` confidence |
| **LocationIQ**       | Free tier, then cheap; key required         | Good (hosted Nominatim)                         | Higher rate limits than raw Nominatim                      |
| **Nominatim (OSM)**  | Free, no key                                | Decent for major roads, spotty for small plazas | ~1 req/sec, must honor usage policy                        |

Recommendation: **Google** for accuracy on Jamaican addresses; **LocationIQ/Nominatim** acceptable if cost must be zero. Wrap behind one interface so the provider is swappable.

## Implementation sketch

### `src/lib/server/geocoder.ts` (new)

```ts
export type GeocodeResult = {
	latitude: number;
	longitude: number;
	confidence: 'high' | 'medium' | 'low'; // mapped from provider's location_type/importance
	formattedAddress: string; // provider's normalized address, for display/audit
	provider: string;
};

// Returns null when the provider can't place the address confidently.
export async function geocodeAddress(
	query: string, // composed from supermarket fields, see below
	fetchImpl?: typeof fetch // injectable for tests
): Promise<GeocodeResult | null>;
```

- **Query string**: compose from the extracted/edited fields — `[address, city, region, country]` joined, defaulting `country` to "Jamaica" when absent. A fuller query geocodes far better than a bare street line.
- **Confidence mapping**: Google `location_type` (`ROOFTOP` → high, `RANGE_INTERPOLATED` → medium, `GEOMETRIC_CENTER`/`APPROXIMATE` → low) or Nominatim `importance`/`type`. Below medium ⇒ still store the point but flag it.
- Network/quota errors → return `null` and let the caller proceed without coordinates (never block a save on geocoding).

### Where it runs

At **location-create time** in `saveParsedReceipt` (Part 4's `createFrom` branch), not in the request hot path of parse/verify:

- After inserting the new `supermarket_location`, call `geocodeAddress`. If it returns a point, update the row's `latitude`/`longitude`.
- Prefer doing this **out of band** (after the save response, or a tiny job/queue) so the user isn't waiting on a third-party call. A synchronous call inside the transaction is acceptable for the tracer but adds latency + a failure mode — fire-and-forget update is better.
- Existing rows with null coords: a one-off backfill script iterating locations where `latitude IS NULL`.

### Schema

- `latitude` / `longitude` columns already exist (`schema.ts`). Optionally add `geocode_confidence` and `geocoded_at` to record provenance and support re-geocoding later. The PostGIS `geog` column is maintained by the existing trigger from lat/lng — we still never write `geog` directly.

### Config

- `GEOCODER_PROVIDER` + `GEOCODER_API_KEY` env vars. Document alongside `RECEIPT_EXTRACTOR` / `DATABASE_URL`.

## Files

- **New**: `src/lib/server/geocoder.ts`; `scripts/backfill-geocode.ts` (one-off).
- **Modify**: `src/lib/server/repo.ts` (call geocoder after creating a location); maybe a migration adding `geocode_confidence` / `geocoded_at`.
- **Reuse**: `supermarket_location` table (`schema.ts`), the composed `supermarket` fields from `ParsedReceipt`.

## Testing

`src/lib/server/geocoder.test.ts` (unit, inject `fetchImpl`):

- Stub a provider success payload → assert correct lat/lng, confidence mapping, `formattedAddress`.
- Stub a zero-results / low-confidence payload → `null` or `confidence: 'low'` per design.
- Stub a network error / quota 429 → returns `null`, does not throw.
- Query composition: fields `{ address, city, country: undefined }` → query includes a defaulted "Jamaica".

`repo` integration (Testcontainers, geocoder mocked):

- Create a location → mocked geocoder returns a point → row has lat/lng populated and `geog` set by the trigger.
- Geocoder returns `null` → location still created, lat/lng null, save succeeds.

Manual: run the backfill against a few real seeded locations with a live key; spot-check the points on a map.

## Out of scope

- Re-geocoding stale rows / handling a store that physically moves.
- Reverse geocoding (coords → address). Not needed here.
