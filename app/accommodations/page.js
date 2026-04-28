'use client';
import Link from 'next/link';
import { useTripData } from '../components/useTripData';
import { useOwnerToken } from '../lib/auth';
import { collectByCategory, formatDate } from '../lib/trip-utils';

export default function AccommodationsPage() {
  const { days, status } = useTripData();
  const { isOwner } = useOwnerToken();
  if (status === 'loading') return <main className="view-page">Loading…</main>;
  if (status === 'error') return <main className="view-page">Could not load trip data.</main>;

  const items = collectByCategory(days, 'accommodations');
  if (!items.length) return <main className="view-page"><h1>🏨 Accommodations</h1><p>No accommodations booked yet.</p></main>;

  return (
    <main className="view-page">
      <h1>🏨 Accommodations</h1>
      {items.map((it, idx) => {
        const nights = parseInt(it.nights, 10) || 1;
        // Compute checkout date from check-in date + nights
        let checkOutDate = '';
        try {
          const d = new Date(it.date);
          d.setDate(d.getDate() + nights);
          checkOutDate = d.toISOString().split('T')[0];
        } catch {}
        return (
          <article key={idx} className="booking-card">
            <div className="booking-head">
              <span className="badge">{nights} {nights === 1 ? 'night' : 'nights'}</span>
              <strong>{it.name || 'Accommodation'}</strong>
              <span className="date">
                {formatDate(it.date)}
                {checkOutDate ? ` → ${formatDate(checkOutDate)}` : ''}
              </span>
              {isOwner && (
                <Link
                  href={`/?day=${it.dayId}&edit=${it.category}:${it.index}`}
                  className="details-btn"
                  style={{ marginLeft: 'auto', textDecoration: 'none', padding: '2px 8px', fontSize: '0.78em' }}
                  title="Edit on the Planning page"
                >
                  ✎ Edit
                </Link>
              )}
            </div>
            <div className="booking-meta">
              {it.checkIn && <span>Check-in: {it.checkIn}</span>}
              {it.checkOut && <span>Check-out: {it.checkOut}</span>}
              {it.address && <span>Address: {it.address}</span>}
              {it.phone && <span>Phone: {it.phone}</span>}
              {it.bookingVendor && <span>Vendor: {it.bookingVendor}</span>}
              {it.confirmationNumber && <span>Conf #: {it.confirmationNumber}</span>}
            </div>
          </article>
        );
      })}
    </main>
  );
}
