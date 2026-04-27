import Redis from 'ioredis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KEY = 'vp:trip';

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

export async function GET() {
  try {
    const raw = await client().get(KEY);
    if (raw == null) return Response.json({ days: null, ideas: null }, { status: 200 });
    return new Response(raw, { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request) {
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

export async function DELETE() {
  try {
    await client().del(KEY);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
