'use client';
import { useTripData } from '../components/useTripData';
import { collectByCategory, formatDate } from '../lib/trip-utils';

const CATEGORY_LABEL = { dinners: 'Dinner', excursions: 'Excursion' };

export default function EventsPage() {
  const { days, status } = useTripData();
  if (status === 'loading') return <main className="view-page">Loading…</main>;
  if (status === 'error') return <main className="view-page">Could not load trip data.</main>;

  const items = collectByCategory(days, ['dinners', 'excursions']);
  if (!items.length) return <main className="view-page"><h1>🎉 Events</h1><p>No events scheduled yet.</p></main>;

  return (
    <main className="view-page">
      <h1>🎉 Events</h1>
      {items.map((it, idx) => (
        <article key={idx} className="booking-card">
          <div className="booking-head">
            <span className="badge">{CATEGORY_LABEL[it.category]}</span>
            <strong>{it.name || '(unnamed)'}</strong>
            <span className="date">{formatDate(it.date)}</span>
            {it.time && <span className="date">{it.time}</span>}
          </div>
          <div className="booking-meta">
            {it.notes && <span>{it.notes}</span>}
            {it.dayLocation && <span>Location: {it.dayLocation}</span>}
            {it.bookingVendor && <span>Vendor: {it.bookingVendor}</span>}
            {it.confirmationNumber && <span>Conf #: {it.confirmationNumber}</span>}
          </div>
        </article>
      ))}
    </main>
  );
}
