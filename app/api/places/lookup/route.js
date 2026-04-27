export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cities the planner already knows about. Used to snap a parsed coord to the
// nearest trip location so the resulting idea filters correctly.
const KNOWN_CITIES = {
  Athens:    [37.9838, 23.7275],
  Chania:    [35.5122, 24.0180],
  Heraklion: [35.3387, 25.1442],
  Santorini: [36.3932, 25.4615],
  Milos:     [36.7333, 24.4167],
  Naxos:     [37.1031, 25.3784],
  Piraeus:   [37.9420, 23.6460]
};

function haversine([lat1, lon1], [lat2, lon2]) {
  const toRad = x => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestCity(lat, lon) {
  let best = null, bestDist = Infinity;
  for (const [name, c] of Object.entries(KNOWN_CITIES)) {
    const d = haversine([lat, lon], c);
    if (d < bestDist) { bestDist = d; best = name; }
  }
  return { city: best, distanceKm: bestDist };
}

function parseGoogleMapsUrl(urlStr) {
  let name = '';
  let coord = null;

  // /place/<name>/  — name is + or %20 encoded
  const placeMatch = urlStr.match(/\/place\/([^/?]+)/);
  if (placeMatch) {
    try {
      name = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
    } catch {
      name = placeMatch[1].replace(/\+/g, ' ');
    }
  }

  // Prefer canonical coords from the data parameter (!3d<lat>!4d<lng>) — these
  // are the actual place coords, not the viewport center.
  const data3d = urlStr.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (data3d) {
    coord = [parseFloat(data3d[1]), parseFloat(data3d[2])];
  } else {
    // Fall back to the @lat,lng viewport center
    const atMatch = urlStr.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) coord = [parseFloat(atMatch[1]), parseFloat(atMatch[2])];
    else {
      // ?q=lat,lng or ?q=loc:lat,lng
      const qMatch = urlStr.match(/[?&]q=(?:loc:)?(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) coord = [parseFloat(qMatch[1]), parseFloat(qMatch[2])];
    }
  }

  if (!coord && !name) return null;
  return { name, coord };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const inputUrl = searchParams.get('url');
  if (!inputUrl) return Response.json({ error: 'url required' }, { status: 400 });

  // Follow redirects to expand maps.app.goo.gl short URLs to the long /place/... form.
  let resolved = inputUrl;
  try {
    const res = await fetch(inputUrl, { redirect: 'follow' });
    resolved = res.url || inputUrl;
  } catch (err) {
    return Response.json({ error: `Could not resolve URL: ${err.message}` }, { status: 502 });
  }

  const parsed = parseGoogleMapsUrl(resolved);
  if (!parsed || (!parsed.coord && !parsed.name)) {
    return Response.json({
      error: 'Could not extract a place from this URL. Lists URLs and some dropped-pin URLs don\'t carry a single place\'s name + coord.',
      resolved
    }, { status: 422 });
  }

  let location = '';
  if (parsed.coord) {
    const { city, distanceKm } = nearestCity(parsed.coord[0], parsed.coord[1]);
    if (distanceKm < 200) location = city;
  }

  return Response.json({
    name: parsed.name || '',
    coord: parsed.coord || null,
    location
  });
}
