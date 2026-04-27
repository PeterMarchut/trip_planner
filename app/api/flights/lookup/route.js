export const runtime = 'nodejs';

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

  const url = `https://aerodatabox.p.rapidapi.com/flights/number/${encodeURIComponent(number)}/${encodeURIComponent(date)}?withAircraftImage=false&withLocation=true`;

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

  return Response.json({
    airline: flight.airline?.name || '',
    flightNumber: (flight.number || number).replace(/\s+/g, ''),
    origin: formatAirport(depAirport),
    destination: formatAirport(arrAirport),
    originCoord: depAirport.location ? [depAirport.location.lat, depAirport.location.lon] : null,
    destinationCoord: arrAirport.location ? [arrAirport.location.lat, arrAirport.location.lon] : null,
    departure: extractLocalTime(dep.scheduledTime?.local),
    arrival: extractLocalTime(arr.scheduledTime?.local),
    // Only set when arrival is on a different local date than departure (overnight flight)
    arrivalDate: depLocalDate && arrLocalDate && depLocalDate !== arrLocalDate ? arrLocalDate : ''
  });
}
