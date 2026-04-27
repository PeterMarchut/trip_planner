export const itemTypes = {
  flights: { label: 'Flight', timeField: 'departure', icon: '✈️' },
  ferries: { label: 'Ferry', timeField: 'departure', icon: '⛴' },
  carRentals: { label: 'Car Rental', timeField: 'pickup', icon: '🚗' },
  accommodations: { label: 'Stay', timeField: 'checkIn', icon: '🏨' },
  dinners: { label: 'Dinner', timeField: 'time', icon: '🍽' },
  excursions: { label: 'Excursion', timeField: 'time', icon: '🎯' }
};

export function getDayItems(day) {
  const items = [];
  Object.entries(itemTypes).forEach(([category, cfg]) => {
    (day[category] || []).forEach((item, idx) => {
      items.push({
        ...item,
        category,
        index: idx,
        time: item[cfg.timeField] || '',
        label: cfg.label,
        icon: cfg.icon
      });
    });
  });
  items.sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });
  return items;
}

// Pull all items of a given category across all days, with the day's date attached.
export function collectByCategory(days, categories) {
  const out = [];
  const cats = Array.isArray(categories) ? categories : [categories];
  days.forEach(day => {
    cats.forEach(cat => {
      (day[cat] || []).forEach((item, idx) => {
        out.push({
          ...item,
          category: cat,
          index: idx,
          date: day.date,
          dayId: day.id,
          dayLocation: day.startLocation || day.endLocation || ''
        });
      });
    });
  });
  out.sort((a, b) => {
    if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
    const aTime = a[itemTypes[a.category].timeField] || '';
    const bTime = b[itemTypes[b.category].timeField] || '';
    return aTime.localeCompare(bTime);
  });
  return out;
}

export function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  } catch {
    return dateStr;
  }
}
