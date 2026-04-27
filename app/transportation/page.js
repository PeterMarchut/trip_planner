'use client';
import { useTripData } from '../components/useTripData';
import { collectByCategory, formatDate } from '../lib/trip-utils';

const CATEGORY_LABEL = { flights: 'Flight', ferries: 'Ferry', carRentals: 'Car Rental' };

export default function TransportationPage() {
  const { days, status } = useTripData();
  if (status === 'loading') return <main className="view-page">Loading…</main>;
  if (status === 'error') return <main className="view-page">Could not load trip data.</main>;

  const items = collectByCategory(days, ['flights', 'ferries', 'carRentals']);
  if (!items.length) return <main className="view-page"><h1>🚗 Transportation</h1><p>No transportation booked yet.</p></main>;

  return (
    <main className="view-page">
      <h1>🚗 Transportation</h1>
      {items.map((it, idx) => {
        const time = it.departure || it.pickup || '';
        const endTime = it.arrival || it.dropoff || '';
        const route = it.origin && it.destination ? `${it.origin} → ${it.destination}` :
                      it.pickup && it.dropoff ? `Pickup ${it.pickup} → Dropoff ${it.dropoff}` : '';
        const title = it.airline ? `${it.airline} ${it.flightNumber || ''}` :
                      it.vessel ? it.vessel :
                      it.company || it.name || CATEGORY_LABEL[it.category];
        return (
          <article key={idx} className="booking-card">
            <div className="booking-head">
              <span className="badge">{CATEGORY_LABEL[it.category]}</span>
              <strong>{title}</strong>
              <span className="date">{formatDate(it.date)}</span>
              {time && <span className="date">{time}{endTime ? `–${endTime}` : ''}</span>}
            </div>
            <div className="booking-meta">
              {route && <span>{route}</span>}
              {it.company && it.airline && <span>Operator: {it.company}</span>}
              {it.bookingVendor && <span>Vendor: {it.bookingVendor}</span>}
              {it.confirmationNumber && <span>Conf #: {it.confirmationNumber}</span>}
              {it.passengers && <span>Passengers: {it.passengers}</span>}
              {it.arrivalDate && <span>Arrives: {formatDate(it.arrivalDate)}</span>}
              {it.pickupAddress && <span>Pickup: {it.pickupAddress}</span>}
              {it.dropoffAddress && <span>Dropoff: {it.dropoffAddress}</span>}
              {it.departureAddress && <span>Departs from: {it.departureAddress}</span>}
              {it.arrivalAddress && <span>Arrives at: {it.arrivalAddress}</span>}
            </div>
          </article>
        );
      })}
    </main>
  );
}
