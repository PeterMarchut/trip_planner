import { checkAndIncrementDailyCap, cacheGet, cacheSet } from '../../../lib/quota';

export const runtime = 'nodejs';

const FLIGHTS_DAILY_LIMIT = 100;
const FLIGHTS_CACHE = 'flights';

function formatAirport(airport) {
  if (!airport) return '';
  const name = airport.shortName || airport.name || airport.municipalityName || '';
  const iata = airport.iata ? ` (${airport.iata})` : '';
  return name + iata;
}

function extractLocalTime(localStr) {
  if (!localStr) return '';
  const match = localStr.match(/(\d{2}:\d{2})/);
  return match ? match[1] : '';
}

function extractLocalDate(localStr) {
  if (!localStr) return '';
  const match = localStr.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const number = searchParams.get('number');
  const date = searchParams.get('date');

  if (!number || !date) {
    return Response.json({ error: 'number and date are required' }, { status: 400 });
  }

  const key = process.env.AERODATABOX_API_KEY;
  if (!key) {
    return Response.json({ error: 'AERODATABOX_API_KEY not configured' }, { status: 500 });
  }

  // Cache successful lookups so repeats don't burn quota.
  const cacheKey = `${number}|${date}`;
  const cached = cacheGet(FLIGHTS_CACHE, cacheKey);
  if (cached) return Response.json(cached);

  // Daily cap on the sandbox instance only.
  const cap = checkAndIncrementDailyCap('flights', FLIGHTS_DAILY_LIMIT);
  if (!cap.ok) {
    return Response.json(
      { error: `Daily flight-lookup limit reached on this demo instance. Try again in ${Math.ceil(cap.retryAfter / 3600)}h.` },
      { status: 429, headers: { 'Retry-After': String(cap.retryAfter) } }
    );
  }

  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(number)}/${encodeURIComponent(date)}?withAircraftImage=false&withLocation=true&dateLocalRole=Departure`;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'x-rapidapi-key': key,
        'x-rapidapi-host': 'aerodatabox.p.rapidapi.com'
      }
    });
  } catch (err) {
    return Response.json({ error: `Network error: ${err.message}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return Response.json({ error: `Upstream ${res.status}: ${text.slice(0, 300)}` }, { status: res.status });
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    return Response.json({ error: 'No flight matched that number/date' }, { status: 404 });
  }

  const flight = data[0];
  const dep = flight.departure || {};
  const arr = flight.arrival || {};
  const depAirport = dep.airport || {};
  const arrAirport = arr.airport || {};

  const depLocalDate = extractLocalDate(dep.scheduledTime?.local);
  const arrLocalDate = extractLocalDate(arr.scheduledTime?.local);

  const result = {
    airline: flight.airline?.name || '',
    flightNumber: (flight.number || number).replace(/\s+/g, ''),
    origin: formatAirport(depAirport),
    destination: formatAirport(arrAirport),
    originCoord: depAirport.location ? [depAirport.location.lat, depAirport.location.lon] : null,
    destinationCoord: arrAirport.location ? [arrAirport.location.lat, arrAirport.location.lon] : null,
    departure: extractLocalTime(dep.scheduledTime?.local),
    arrival: extractLocalTime(arr.scheduledTime?.local),
    arrivalDate: depLocalDate && arrLocalDate && depLocalDate !== arrLocalDate ? arrLocalDate : ''
  };
  cacheSet(FLIGHTS_CACHE, cacheKey, result);
  return Response.json(result);
}
