// In-memory daily counter + cache shared across requests on a single Render
// instance. Resets when the container restarts. Used to protect free-tier
// API quotas (AeroDataBox, Nominatim) on the public sandbox deployment.

// Sandbox mode = no OWNER_TOKEN configured. Personal instances skip the cap.
export const SANDBOX = !process.env.OWNER_TOKEN;

const counters = new Map(); // name -> { count, resetAt }
const caches = new Map();   // name -> Map(key -> { value, expiresAt })

const DAY_MS = 24 * 60 * 60 * 1000;

export function checkAndIncrementDailyCap(name, limit) {
  if (!SANDBOX) return { ok: true };
  const now = Date.now();
  let entry = counters.get(name);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + DAY_MS };
    counters.set(name, entry);
  }
  if (entry.count >= limit) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { ok: false, retryAfter };
  }
  entry.count++;
  return { ok: true };
}

export function cacheGet(name, key) {
  const bucket = caches.get(name);
  if (!bucket) return null;
  const entry = bucket.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    bucket.delete(key);
    return null;
  }
  return entry.value;
}

export function cacheSet(name, key, value, ttlMs = DAY_MS) {
  let bucket = caches.get(name);
  if (!bucket) { bucket = new Map(); caches.set(name, bucket); }
  bucket.set(key, { value, expiresAt: Date.now() + ttlMs });
}
