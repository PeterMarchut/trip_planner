export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const required = process.env.OWNER_TOKEN;
  // If no token is configured server-side, treat as open (back-compat for dev).
  if (!required) return Response.json({ ok: true, configured: false });

  const auth = request.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const ok = !!(match && match[1] === required);
  return Response.json({ ok, configured: true }, { status: ok ? 200 : 401 });
}
