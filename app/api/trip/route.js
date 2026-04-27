import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'vp:trip';

// Fields stripped from items when the requester isn't the owner.
const PRIVATE_FIELDS = [
  'confirmationNumber',
  'phone',
  'bookingVendor',
  'passengers',
  'address',
  'pickupAddress',
  'dropoffAddress',
  'departureAddress',
  'arrivalAddress'
];

let _client;
function client() {
  if (!_client) {
    if (!process.env.REDIS_URL) throw new Error('REDIS_URL not configured');
    _client = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3
    });
    _client.on('error', err => {
      console.error('[redis]', err.message);
    });
  }
  return _client;
}

function isOwner(request) {
  const required = process.env.OWNER_TOKEN;
  // If no token is configured, run open (back-compat). Set OWNER_TOKEN in
  // production to lock down writes and strip private fields from guests.
  if (!required) return true;
  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return !!(match && match[1] === required);
}

function stripItem(item) {
  if (!item || typeof item !== 'object') return item;
  const clean = { ...item };
  for (const f of PRIVATE_FIELDS) delete clean[f];
  return clean;
}

function sanitize(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.days)) return data;
  return {
    ...data,
    days: data.days.map(day => ({
      ...day,
      flights: (day.flights || []).map(stripItem),
      ferries: (day.ferries || []).map(stripItem),
      carRentals: (day.carRentals || []).map(stripItem),
      accommodations: (day.accommodations || []).map(stripItem),
      dinners: (day.dinners || []).map(stripItem),
      excursions: (day.excursions || []).map(stripItem)
    }))
  };
}

export async function GET(request) {
  try {
    const raw = await client().get(KEY);
    if (raw == null) return Response.json({ days: null, ideas: null });
    const data = JSON.parse(raw);
    const payload = isOwner(request) ? data : sanitize(data);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
  if (!isOwner(request)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Invalid body' }, { status: 400 });
    }
    await client().set(KEY, JSON.stringify(body));
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  if (!isOwner(request)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await client().del(KEY);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
