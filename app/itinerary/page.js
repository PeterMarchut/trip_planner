'use client';
import { useTripData } from '../components/useTripData';
import { getDayItems, formatDate } from '../lib/trip-utils';

export default function ItineraryPage() {
  const { days, status } = useTripData();

  if (status === 'loading') return <main className="view-page">Loading…</main>;
  if (status === 'error') return <main className="view-page">Could not load trip data.</main>;
  if (!days.length) return <main className="view-page">No trip data yet — add some days on the Planning page.</main>;

  return (
    <main className="view-page">
      <h1>🗓️ Itinerary</h1>
      {days.map(day => {
        const items = getDayItems(day);
        return (
          <section key={day.id} className="timeline-day">
            <div className="timeline-dot" />
            <div className="timeline-header">
              {formatDate(day.date)}
              {day.startLocation && (
                <span className="muted">
                  {day.startLocation}
                  {day.endLocation && day.startLocation !== day.endLocation ? ` → ${day.endLocation}` : ''}
                </span>
              )}
            </div>
            {items.length === 0 ? (
              <div className="timeline-item empty">No items planned</div>
            ) : (
              items.map((item, idx) => (
                <div key={idx} className="timeline-item">
                  <span className="icon">{item.icon}</span>
                  <span className="time">{item.time || '—'}</span>
                  <span>
                    {item.label}
                    {item.name ? `: ${item.name}` : ''}
                    {item.airline ? `: ${item.airline} ${item.flightNumber || ''}` : ''}
                    {item.company && !item.name ? `: ${item.company}` : ''}
                    {item.origin && item.destination ? ` (${item.origin} → ${item.destination})` : ''}
                    {item.notes ? ` — ${item.notes}` : ''}
                  </span>
                </div>
              ))
            )}
          </section>
        );
      })}
    </main>
  );
}
