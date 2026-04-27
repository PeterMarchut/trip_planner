'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { MapPin, Plane, Calendar, Plus, Trash2, ChevronDown, ChevronRight, Sun, Moon } from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import for map to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });

const LOCAL_CACHE_KEY = 'vp:trip';

// City coordinates and aliases
const cityCoords = {
  'Athens': [37.9838, 23.7275],
  'Athens - Monastiraki': [37.9838, 23.7275],
  'Home': [37.9838, 23.7275],
  'Chania': [35.5122, 24.0180],
  'Chania (Agii Apostoli)': [35.5122, 24.0180],
  'Piraeus': [37.9420, 23.6460],
  'Heraklion': [35.3387, 25.1442],
  'Santorini': [36.3932, 25.4615],
  'Santorini (Fira)': [36.3932, 25.4615],
  'Milos': [36.7333, 24.4167],
  'Naxos': [37.1031, 25.3784]
};

const cityAliases = {
  'Home': 'Athens',
  'Athens - Monastiraki': 'Athens',
  'Chania (Agii Apostoli)': 'Chania',
  'Santorini (Fira)': 'Santorini'
};

const getCityKey = (location) => {
  if (!location) return null;
  const normalized = location.trim();
  return cityAliases[normalized] || normalized;
};

const getCityCoords = (location) => {
  const key = getCityKey(location);
  return key ? cityCoords[key] : null;
};

// DetailsSection component
const DetailsSection = ({ title, items, fields, onAdd, onRemove }) => {
  const [newItem, setNewItem] = useState(fields.reduce((acc, field) => ({ ...acc, [field]: '' }), {}));
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAdd = () => {
    if (Object.values(newItem).some(value => value.trim())) {
      onAdd(newItem);
      setNewItem(fields.reduce((acc, field) => ({ ...acc, [field]: '' }), {}));
    }
  };

  return (
    <div className="details-section">
      <div className="section-header" onClick={() => setIsExpanded(!isExpanded)}>
        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <h4>{title} ({items.length})</h4>
      </div>
      {isExpanded && (
        <div className="section-content">
          <div className="add-item">
            {fields.map(field => (
              <input
                key={field}
                value={newItem[field]}
                onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              />
            ))}
            <button onClick={handleAdd} className="add-btn">
              <Plus size={16} />
            </button>
          </div>
          <ul className="item-list">
            {items.map((item, index) => (
              <li key={index} className="item">
                <div className="item-details">
                  {fields.map(field => (
                    <span key={field}>
                      <strong>{field}:</strong> {item[field]}
                    </span>
                  ))}
                </div>
                <button onClick={() => onRemove(index)} className="remove-btn">
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// IdeasCard component — global list of unscheduled activity ideas
const IdeasCard = ({ ideas, onAdd, onRemove }) => {
  const [draft, setDraft] = useState({ name: '', location: '', notes: '' });

  const submit = () => {
    if (!draft.name.trim() || !draft.location.trim()) return;
    onAdd({ name: draft.name.trim(), location: draft.location.trim(), notes: draft.notes.trim() });
    setDraft({ name: '', location: '', notes: '' });
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>💡 Activity Ideas</h2>
      </div>
      <div className="add-item" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <input
          value={draft.name}
          onChange={e => setDraft({ ...draft, name: e.target.value })}
          placeholder="Idea (e.g. Balos Beach)"
          style={{ flex: '2 1 200px' }}
        />
        <input
          value={draft.location}
          onChange={e => setDraft({ ...draft, location: e.target.value })}
          placeholder="Location (e.g. Chania)"
          style={{ flex: '1 1 140px' }}
        />
        <input
          value={draft.notes}
          onChange={e => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Notes (optional)"
          style={{ flex: '2 1 200px' }}
        />
        <button onClick={submit} className="add-btn"><Plus size={16} /></button>
      </div>
      {ideas.length === 0 ? (
        <p style={{ opacity: 0.6, fontStyle: 'italic' }}>No ideas yet — add things you might want to do.</p>
      ) : (
        <ul className="item-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ideas.map(idea => (
            <li key={idea.id} className="item" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ flex: 1 }}>
                <div><strong>{idea.name}</strong> <span style={{ opacity: 0.7 }}>· {idea.location}</span></div>
                {idea.notes && <div style={{ fontSize: '0.85em', opacity: 0.75 }}>{idea.notes}</div>}
              </div>
              <button onClick={() => onRemove(idea.id)} className="remove-btn"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ChronologicalItinerary component
const ChronologicalItinerary = ({ day, contextualAccommodations = [], onAddItem, onRemoveItem }) => {
  const [newItemType, setNewItemType] = useState('flights');
  const [newItem, setNewItem] = useState({});
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [lookup, setLookup] = useState({ loading: false, error: null });

  const handleFlightLookup = async () => {
    const number = (newItem.flightNumber || '').trim();
    if (!number) {
      setLookup({ loading: false, error: 'Enter a flight number first' });
      return;
    }
    setLookup({ loading: true, error: null });
    try {
      const res = await fetch(`/api/flights/lookup?number=${encodeURIComponent(number)}&date=${encodeURIComponent(day.date)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
      setNewItem(prev => ({
        ...prev,
        airline: data.airline || prev.airline || '',
        flightNumber: data.flightNumber || prev.flightNumber || number,
        origin: data.origin || prev.origin || '',
        destination: data.destination || prev.destination || '',
        departure: data.departure || prev.departure || '',
        arrival: data.arrival || prev.arrival || '',
        arrivalDate: data.arrivalDate || prev.arrivalDate || '',
        originCoord: data.originCoord || null,
        destinationCoord: data.destinationCoord || null
      }));
      setLookup({ loading: false, error: null });
    } catch (err) {
      setLookup({ loading: false, error: err.message });
    }
  };

  const itemTypes = {
    flights: {
      fields: ['airline', 'flightNumber', 'origin', 'destination', 'departure', 'arrival'],
      detailFields: ['arrivalDate', 'bookingVendor', 'confirmationNumber'],
      timeField: 'departure',
      label: 'Flight'
    },
    ferries: {
      fields: ['company', 'vessel', 'origin', 'destination', 'departure', 'arrival'],
      detailFields: ['departureAddress', 'arrivalAddress', 'passengers', 'bookingVendor', 'confirmationNumber'],
      timeField: 'departure',
      label: 'Ferry'
    },
    carRentals: {
      fields: ['company', 'pickup', 'dropoff'],
      detailFields: ['pickupAddress', 'dropoffAddress', 'bookingVendor', 'confirmationNumber'],
      timeField: 'pickup',
      label: 'Car Rental'
    },
    accommodations: {
      fields: ['name', 'checkIn', 'checkOut', 'nights'],
      detailFields: ['address', 'phone', 'bookingVendor', 'confirmationNumber'],
      timeField: 'checkIn',
      label: 'Accommodation'
    },
    dinners: {
      fields: ['name', 'time'],
      detailFields: ['bookingVendor', 'confirmationNumber'],
      timeField: 'time',
      label: 'Dinner'
    },
    excursions: {
      fields: ['name', 'time', 'notes'],
      detailFields: ['bookingVendor', 'confirmationNumber'],
      timeField: 'time',
      label: 'Excursion'
    }
  };

  // Combine all items with metadata. Skip accommodations here — they're rendered
  // contextually based on which night of the stay this day falls on.
  const allItems = [];
  Object.entries(itemTypes).forEach(([category, config]) => {
    if (category === 'accommodations') return;
    day[category].forEach((item, index) => {
      allItems.push({
        ...item,
        category,
        index,
        time: item[config.timeField],
        label: config.label,
        fields: config.fields
      });
    });
  });

  // Layer in accommodations relevant to *this* day with role-specific labels and times
  contextualAccommodations.forEach(({ acc, role, hostDayId, accIndex }) => {
    let time, fields, label;
    if (role === 'checkIn') {
      time = acc.checkIn || '';
      fields = ['name', 'nights'];
      label = 'Accommodation – Check-in';
    } else if (role === 'middle') {
      time = '';
      fields = ['name'];
      label = 'Staying at';
    } else {
      time = acc.checkOut || '';
      fields = ['name'];
      label = 'Accommodation – Check-out';
    }
    allItems.push({
      ...acc,
      category: 'accommodations',
      index: accIndex,
      time,
      label,
      fields,
      role,
      hostDayId
    });
  });

  // Sort chronologically
  allItems.sort((a, b) => {
    if (!a.time) return 1;
    if (!b.time) return -1;
    return a.time.localeCompare(b.time);
  });

  const handleTypeChange = (type) => {
    setNewItemType(type);
    const config = itemTypes[type];
    const allFields = [...config.fields, ...(config.detailFields || [])];
    setNewItem(allFields.reduce((acc, field) => ({ ...acc, [field]: '' }), {}));
  };

  const handleAdd = () => {
    const hasContent = Object.values(newItem).some(v => typeof v === 'string' && v.trim());
    if (hasContent) {
      onAddItem(day.id, newItemType, newItem);
      setNewItem({});
      setLookup({ loading: false, error: null });
      setShowAddModal(false);
    }
  };

  const toggleItemDetails = (itemKey) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey);
    } else {
      newExpanded.add(itemKey);
    }
    setExpandedItems(newExpanded);
  };

  return (
    <div className="chronological-itinerary">
      <div className="itinerary-header">
        <h4>Itinerary Items</h4>
        <button onClick={() => setShowAddModal(true)} className="add-item-btn">
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Itinerary Item</h3>
              <button onClick={() => setShowAddModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Item Type</label>
                <select value={newItemType} onChange={(e) => handleTypeChange(e.target.value)}>
                  {Object.entries(itemTypes).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
              {itemTypes[newItemType].fields.map(field => {
                const isFlightNumber = newItemType === 'flights' && field === 'flightNumber';
                return (
                  <div key={field} className="form-group">
                    <label>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                    {isFlightNumber ? (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          value={newItem[field] || ''}
                          onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                          placeholder="e.g. DL123"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          onClick={handleFlightLookup}
                          disabled={lookup.loading}
                          className="add-btn"
                        >
                          {lookup.loading ? 'Looking up…' : 'Lookup'}
                        </button>
                      </div>
                    ) : (
                      <input
                        value={newItem[field] || ''}
                        onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                        placeholder={`Enter ${field}`}
                      />
                    )}
                    {isFlightNumber && lookup.error && (
                      <div style={{ color: '#ef4444', fontSize: '0.85em', marginTop: '4px' }}>
                        {lookup.error}
                      </div>
                    )}
                  </div>
                );
              })}
              {(itemTypes[newItemType].detailFields || []).map(field => (
                <div key={field} className="form-group">
                  <label>{field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</label>
                  <input
                    value={newItem[field] || ''}
                    onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                    placeholder={`Enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)} className="cancel-btn">Cancel</button>
              <button onClick={handleAdd} className="add-btn">Add Item</button>
            </div>
          </div>
        </div>
      )}

      <ul className="chronological-list">
        {allItems.length > 0 && day.carRentals.length === 0 && (
          <li className="chronological-item" style={{ borderLeft: '3px solid #f59e0b', background: 'rgba(245, 158, 11, 0.06)' }}>
            <div className="item-time">—</div>
            <div className="item-content">
              <div className="item-type" style={{ color: '#f59e0b' }}>⚠ Transportation</div>
              <div className="item-details">
                <span style={{ fontStyle: 'italic' }}>Unconfirmed — no car rental booked for this day</span>
              </div>
            </div>
          </li>
        )}
        {allItems.map((item, listIndex) => {
          const itemKey = `${item.category}-${item.index}-${item.role || 'self'}`;
          const isExpanded = expandedItems.has(itemKey);
          const hasDetails = itemTypes[item.category].detailFields && itemTypes[item.category].detailFields.some(field => item[field]);
          const canRemove = !item.role || item.role === 'checkIn';
          const isDerivedAccommodation = item.category === 'accommodations' && (item.role === 'middle' || item.role === 'checkOut');

          return (
            <li key={itemKey} className="chronological-item" style={isDerivedAccommodation ? { opacity: 0.85 } : undefined}>
              <div className="item-time">{item.time || '—'}</div>
              <div className="item-content">
                <div className="item-type">{item.label}</div>
                <div className="item-details">
                  {item.fields.map(field => (
                    field !== itemTypes[item.category].timeField && item[field] != null && item[field] !== '' && (
                      <span key={field}>
                        <strong>{field}:</strong> {item[field]}
                      </span>
                    )
                  ))}
                </div>
                {hasDetails && (
                  <button
                    onClick={() => toggleItemDetails(itemKey)}
                    className="details-btn"
                  >
                    {isExpanded ? 'Hide' : 'Show'} Details
                  </button>
                )}
                {isExpanded && hasDetails && (
                  <div className="item-details-expanded">
                    {itemTypes[item.category].detailFields.map(field => (
                      item[field] && (
                        <div key={field} className="detail-field">
                          <strong>{field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</strong> {item[field]}
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
              {canRemove ? (
                <button
                  onClick={() => onRemoveItem(item.role === 'checkIn' ? item.hostDayId : day.id, item.category, item.index)}
                  className="remove-btn"
                >
                  <Trash2 size={12} />
                </button>
              ) : (
                <span style={{ width: '24px' }} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default function HomePage() {
  // Initial data restructured into days
  // Generic sample shown only on a fresh install (when neither the server nor
  // localStorage has any saved trip data). Real trip data lives in the database.
  const initialDays = [
    {
      id: 1,
      date: '2026-05-20',
      startLocation: 'Home',
      endLocation: 'Athens',
      flights: [{ airline: 'Sample Airline', flightNumber: 'SA100', origin: 'Home airport', destination: 'Athens (ATH)', departure: '10:00', arrival: '16:00' }],
      ferries: [], carRentals: [], accommodations: [], dinners: [], excursions: []
    },
    {
      id: 2,
      date: '2026-05-21',
      startLocation: 'Athens',
      endLocation: 'Athens',
      flights: [], ferries: [], carRentals: [],
      accommodations: [{ name: 'Sample Hotel', checkIn: '15:00', checkOut: '11:00', nights: '2' }],
      dinners: [], excursions: [{ name: 'City tour', time: '09:00', notes: '' }]
    },
    {
      id: 3,
      date: '2026-05-22',
      startLocation: 'Athens',
      endLocation: 'Chania',
      flights: [],
      ferries: [{ company: 'Sample Ferries', origin: 'Piraeus', destination: 'Chania', departure: '08:00', arrival: '12:30' }],
      carRentals: [], accommodations: [], dinners: [], excursions: []
    },
    {
      id: 4,
      date: '2026-05-23',
      startLocation: 'Chania',
      endLocation: 'Chania',
      flights: [], ferries: [], carRentals: [],
      accommodations: [{ name: 'Sample Resort', checkIn: '15:00', checkOut: '10:00' }],
      dinners: [], excursions: []
    },
    {
      id: 5,
      date: '2026-05-24',
      startLocation: 'Chania',
      endLocation: 'Heraklion',
      flights: [], ferries: [], carRentals: [], accommodations: [], dinners: [], excursions: []
    }
  ];

  const initialIdeas = [
    { id: 1, name: 'Beach day', location: 'Chania', notes: 'Pick a beach and go' },
    { id: 2, name: 'Archaeological site', location: 'Heraklion', notes: '' },
    { id: 3, name: 'Old town walk', location: 'Athens', notes: '' }
  ];

  const [days, setDays] = useState(initialDays);
  const [ideas, setIdeas] = useState(initialIdeas);
  const [selectedDayId, setSelectedDayId] = useState(null);
  const [theme, setTheme] = useState('dark');
  const [syncStatus, setSyncStatus] = useState('loading');
  const [hydrated, setHydrated] = useState(false);
  const lastSavedRef = useRef(null);

  // Initial load: server first, fall back to localStorage cache, fall back to sample.
  useEffect(() => {
    let active = true;
    (async () => {
      let loaded = false;
      try {
        const res = await fetch('/api/trip', { cache: 'no-store' });
        if (res.ok) {
          const body = await res.json();
          if (active && body && Array.isArray(body.days)) {
            setDays(body.days);
            if (Array.isArray(body.ideas)) setIdeas(body.ideas);
            lastSavedRef.current = JSON.stringify({ days: body.days, ideas: body.ideas || initialIdeas });
            setSyncStatus('synced');
            loaded = true;
          }
        }
      } catch {}
      if (!loaded && active) {
        try {
          const cached = JSON.parse(window.localStorage.getItem(LOCAL_CACHE_KEY) || 'null');
          if (cached && Array.isArray(cached.days)) {
            setDays(cached.days);
            if (Array.isArray(cached.ideas)) setIdeas(cached.ideas);
          }
        } catch {}
        setSyncStatus('offline');
      }
      if (active) setHydrated(true);
    })();
    return () => { active = false; };
  }, []);

  // Save: write localStorage immediately, debounced PUT to server.
  useEffect(() => {
    if (!hydrated) return;
    const payload = JSON.stringify({ days, ideas });
    if (lastSavedRef.current === payload) return;
    try {
      window.localStorage.setItem(LOCAL_CACHE_KEY, payload);
    } catch {}
    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/trip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        if (res.ok) {
          lastSavedRef.current = payload;
          setSyncStatus('synced');
        } else {
          setSyncStatus('offline');
        }
      } catch {
        setSyncStatus('offline');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [days, ideas, hydrated]);

  const resetTripData = async () => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('Reset all trip data and ideas to the sample? This cannot be undone.')) return;
    try {
      window.localStorage.removeItem(LOCAL_CACHE_KEY);
    } catch {}
    setDays(initialDays);
    setIdeas(initialIdeas);
    setSelectedDayId(null);
    lastSavedRef.current = null;
    try {
      await fetch('/api/trip', { method: 'DELETE' });
    } catch {}
  };

  const mapRef = useRef();

  // Theme management
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Focus the map on the selected day start location only
  useEffect(() => {
    if (selectedDayId && mapRef.current) {
      const day = days.find(d => d.id === selectedDayId);
      if (day && day.startLocation) {
        const startCoord = getCityCoords(day.startLocation);
        if (startCoord) {
          mapRef.current.setView(startCoord, 10);
        }
      }
    }
  }, [selectedDayId, days]);

  const addDay = () => {
    const lastDay = days[days.length - 1];
    const nextId = days.length > 0 ? Math.max(...days.map(d => d.id)) + 1 : 1;
    const nextDate = lastDay ? new Date(lastDay.date) : new Date();
    nextDate.setDate(nextDate.getDate() + 1);
    const defaultStart = lastDay ? lastDay.endLocation : '';
    setDays([...days, {
      id: nextId,
      date: nextDate.toISOString().split('T')[0],
      startLocation: defaultStart,
      endLocation: '',
      flights: [],
      ferries: [],
      carRentals: [],
      accommodations: [],
      dinners: [],
      excursions: []
    }]);
  };

  const updateDay = (id, field, value) => {
    setDays(days.map(day => day.id === id ? { ...day, [field]: value } : day));
  };

  const removeDay = (id) => {
    setDays(days.filter(day => day.id !== id));
  };

  const addItemToDay = (dayId, category, item) => {
    setDays(prevDays => {
      let updated = prevDays.map(d =>
        d.id === dayId ? { ...d, [category]: [...d[category], item] } : d
      );

      if (category === 'accommodations') {
        const nights = parseInt(item.nights, 10);
        if (Number.isFinite(nights) && nights >= 1) {
          const checkInDay = updated.find(d => d.id === dayId);
          if (checkInDay && checkInDay.date) {
            const stayLocation = checkInDay.endLocation || checkInDay.startLocation || '';
            const baseDate = new Date(checkInDay.date);
            for (let i = 1; i <= nights; i++) {
              const target = new Date(baseDate);
              target.setDate(target.getDate() + i);
              const dateStr = target.toISOString().split('T')[0];
              if (!updated.some(d => d.date === dateStr)) {
                const nextId = updated.length > 0 ? Math.max(...updated.map(d => d.id)) + 1 : 1;
                updated.push({
                  id: nextId,
                  date: dateStr,
                  startLocation: stayLocation,
                  endLocation: stayLocation,
                  flights: [],
                  ferries: [],
                  carRentals: [],
                  accommodations: [],
                  dinners: [],
                  excursions: []
                });
              }
            }
            updated.sort((a, b) => a.date.localeCompare(b.date));
          }
        }
      }

      // Overnight flight: ensure the local-arrival date exists as a day.
      if (category === 'flights' && item.arrivalDate) {
        const departureDay = updated.find(d => d.id === dayId);
        if (departureDay && /^\d{4}-\d{2}-\d{2}$/.test(item.arrivalDate) && item.arrivalDate !== departureDay.date) {
          if (!updated.some(d => d.date === item.arrivalDate)) {
            const arrivalLocation = departureDay.endLocation || item.destination || '';
            const nextId = updated.length > 0 ? Math.max(...updated.map(d => d.id)) + 1 : 1;
            updated.push({
              id: nextId,
              date: item.arrivalDate,
              startLocation: arrivalLocation,
              endLocation: arrivalLocation,
              flights: [], ferries: [], carRentals: [], accommodations: [], dinners: [], excursions: []
            });
            updated.sort((a, b) => a.date.localeCompare(b.date));
          }
        }
      }

      return updated;
    });
  };

  const removeItemFromDay = (dayId, category, index) => {
    setDays(days.map(day =>
      day.id === dayId
        ? { ...day, [category]: day[category].filter((_, i) => i !== index) }
        : day
    ));
  };

  const selectDay = (dayId) => {
    setSelectedDayId(dayId);
    // Map zoom will be handled in the map component
  };

  const addIdea = (idea) => {
    const nextId = ideas.length > 0 ? Math.max(...ideas.map(i => i.id)) + 1 : 1;
    setIdeas([...ideas, { ...idea, id: nextId }]);
  };

  const removeIdea = (id) => {
    setIdeas(ideas.filter(i => i.id !== id));
  };

  const promoteIdeaToDay = (ideaId, dayId) => {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    setDays(prevDays => prevDays.map(d =>
      d.id === dayId
        ? { ...d, excursions: [...d.excursions, { name: idea.name, time: '', notes: idea.notes || '' }] }
        : d
    ));
    setIdeas(prevIdeas => prevIdeas.filter(i => i.id !== ideaId));
  };

  const ideasForDay = (day) => {
    if (!day) return [];
    const dayKeys = new Set([getCityKey(day.startLocation), getCityKey(day.endLocation)].filter(Boolean));
    return ideas.filter(i => {
      const key = getCityKey(i.location);
      return key && dayKeys.has(key);
    });
  };

  const itinerarySummary = useMemo(() => {
    return { days };
  }, [days]);

  // For each day, collect contextual accommodation entries: check-in on host day,
  // 'middle' on intermediate nights, 'checkOut' on the morning after the last night.
  const accommodationsByDay = useMemo(() => {
    const result = {};
    days.forEach(hostDay => {
      (hostDay.accommodations || []).forEach((acc, accIndex) => {
        const nights = Math.max(1, parseInt(acc.nights, 10) || 1);
        const base = new Date(hostDay.date);
        (result[hostDay.id] ||= []).push({ acc, role: 'checkIn', hostDayId: hostDay.id, accIndex });
        for (let i = 1; i <= nights; i++) {
          const t = new Date(base);
          t.setDate(t.getDate() + i);
          const dateStr = t.toISOString().split('T')[0];
          const target = days.find(d => d.date === dateStr);
          if (target) {
            const role = i === nights ? 'checkOut' : 'middle';
            (result[target.id] ||= []).push({ acc, role, hostDayId: hostDay.id, accIndex });
          }
        }
      });
    });
    return result;
  }, [days]);

  // Map data - include all transportation routes and excursions
  const allLocations = new Set();

  days.forEach(day => {
    [day.startLocation, day.endLocation].forEach(loc => {
      const key = getCityKey(loc);
      if (key && cityCoords[key]) allLocations.add(key);
    });

    day.ferries.forEach(ferry => {
      const originKey = getCityKey(ferry.origin);
      const destKey = getCityKey(ferry.destination);
      if (originKey && cityCoords[originKey]) allLocations.add(originKey);
      if (destKey && cityCoords[destKey]) allLocations.add(destKey);
    });

    day.excursions.forEach(excursion => {
      const name = excursion.name.toLowerCase();
      Object.keys(cityCoords).forEach(city => {
        if (name.includes(city.toLowerCase())) {
          allLocations.add(city);
        }
      });
    });
  });

  const mapLocations = [...allLocations];
  const routeCoords = mapLocations.map(loc => cityCoords[loc]);

  // Airport markers from looked-up flight data (coords stored on the flight item)
  const airportMarkers = [];
  const seenAirports = new Set();
  days.forEach(day => {
    day.flights.forEach(flight => {
      [['origin', 'originCoord'], ['destination', 'destinationCoord']].forEach(([nameKey, coordKey]) => {
        const coord = flight[coordKey];
        const name = flight[nameKey];
        if (coord && name) {
          const id = `${coord[0]},${coord[1]}`;
          if (!seenAirports.has(id)) {
            seenAirports.add(id);
            airportMarkers.push({ name, coord });
          }
        }
      });
    });
  });

  // Create transportation routes
  const sameCoord = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const transportationRoutes = [];
  days.forEach(day => {
    // Per-flight routes: prefer the flight's own origin/destination, fall back to day's start/end
    day.flights.forEach(flight => {
      const originCoord = flight.originCoord || getCityCoords(flight.origin) || getCityCoords(day.startLocation);
      const destCoord = flight.destinationCoord || getCityCoords(flight.destination) || getCityCoords(day.endLocation);
      if (originCoord && destCoord && !sameCoord(originCoord, destCoord)) {
        transportationRoutes.push({
          coords: [originCoord, destCoord],
          color: '#f59e0b',
          type: 'flight',
          dashArray: '8 6'
        });
      }
    });

    // Ferry routes
    day.ferries.forEach(ferry => {
      const originCoord = getCityCoords(ferry.origin);
      const destCoord = getCityCoords(ferry.destination);
      if (originCoord && destCoord && !sameCoord(originCoord, destCoord)) {
        transportationRoutes.push({
          coords: [originCoord, destCoord],
          color: '#10b981',
          type: 'ferry'
        });
      }
    });

    // Generic day-travel line only when there's no specific transport for the day
    if (day.flights.length === 0 && day.ferries.length === 0 &&
        day.startLocation && day.endLocation && day.startLocation !== day.endLocation) {
      const startCoord = getCityCoords(day.startLocation);
      const endCoord = getCityCoords(day.endLocation);
      if (startCoord && endCoord && !sameCoord(startCoord, endCoord)) {
        transportationRoutes.push({
          coords: [startCoord, endCoord],
          color: '#3b82f6',
          type: 'day-travel'
        });
      }
    }
  });

  return (
    <main className="page-shell">
      <header className="hero">
        <h1>🌍 Vacation Planner</h1>
        <p>Plan your trip day by day with an interactive map.</p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'absolute', top: '1rem', right: '1rem' }}>
          <span style={{ fontSize: '0.8em', opacity: 0.7, padding: '0 0.5rem' }} title={`Sync: ${syncStatus}`}>
            {syncStatus === 'loading' && '⏳ Loading…'}
            {syncStatus === 'saving' && '💾 Saving…'}
            {syncStatus === 'synced' && '✓ Synced'}
            {syncStatus === 'offline' && '⚠ Offline'}
          </span>
          <button onClick={resetTripData} className="theme-toggle" style={{ position: 'static' }} title="Reset to sample data">
            Reset
          </button>
          <button onClick={toggleTheme} className="theme-toggle" style={{ position: 'static' }}>
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <div className="main-grid">
        <div className="days-list">
          <div className="card">
            <div className="card-header">
              <Calendar className="icon" />
              <h2>Trip Days</h2>
              <button onClick={addDay} className="add-btn">
                <Plus size={16} />
              </button>
            </div>
            <div className="days-container">
              {days.map((day) => (
                <div
                  key={day.id}
                  className={`day-card ${selectedDayId === day.id ? 'selected' : ''}`}
                  onClick={() => selectDay(day.id)}
                >
                  <div className="day-header">
                    <div className="day-date">{day.date}</div>
                    <div className="day-locations">
                      <span className="start">{day.startLocation || 'Start'}</span>
                      <span className="arrow">→</span>
                      <span className="end">{day.endLocation || 'End'}</span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeDay(day.id); }} className="remove-btn">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedDayId && (
          <div className="day-details">
            <div className="card">
              <h2>Day Details - {days.find(d => d.id === selectedDayId)?.date}</h2>
              {(() => {
                const day = days.find(d => d.id === selectedDayId);
                return (
                  <div className="day-details-full">
                    <div className="basic-info">
                      <label>
                        Start Location
                        <input
                          value={day.startLocation}
                          onChange={(e) => updateDay(day.id, 'startLocation', e.target.value)}
                          placeholder="Where the day starts"
                        />
                      </label>
                      <label>
                        End Location
                        <input
                          value={day.endLocation}
                          onChange={(e) => updateDay(day.id, 'endLocation', e.target.value)}
                          placeholder="Where the day ends"
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          value={day.date}
                          onChange={(e) => updateDay(day.id, 'date', e.target.value)}
                        />
                      </label>
                    </div>

                    <ChronologicalItinerary
                      day={day}
                      contextualAccommodations={accommodationsByDay[day.id] || []}
                      onAddItem={addItemToDay}
                      onRemoveItem={removeItemFromDay}
                    />

                    {(() => {
                      const nearby = ideasForDay(day);
                      if (nearby.length === 0) return null;
                      return (
                        <div className="nearby-ideas" style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.06)', borderLeft: '3px solid #3b82f6' }}>
                          <h4 style={{ margin: '0 0 0.5rem 0' }}>💡 Nearby ideas ({nearby.length})</h4>
                          <ul className="item-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                            {nearby.map(idea => (
                              <li key={idea.id} className="item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0' }}>
                                <div className="item-details" style={{ flex: 1 }}>
                                  <span><strong>{idea.name}</strong> — {idea.location}</span>
                                  {idea.notes && <span style={{ display: 'block', fontSize: '0.85em', opacity: 0.75 }}>{idea.notes}</span>}
                                </div>
                                <button onClick={() => promoteIdeaToDay(idea.id, day.id)} className="add-btn" title="Add to this day as excursion">
                                  <Plus size={14} />
                                </button>
                                <button onClick={() => removeIdea(idea.id)} className="remove-btn" title="Discard idea">
                                  <Trash2 size={12} />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div className="map-section">
          <div className="card map-card">
            <h2>🗺️ Trip Map</h2>
            <div className="map-container">
              <MapContainer ref={mapRef} center={[37.5, 24.5]} zoom={7} style={{ height: '400px', width: '100%' }}>
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                {mapLocations.map((loc, index) => (
                  <Marker key={`city-${index}`} position={cityCoords[loc]}>
                    <Popup>{loc}</Popup>
                  </Marker>
                ))}
                {airportMarkers.map((airport, index) => (
                  <Marker key={`airport-${index}`} position={airport.coord}>
                    <Popup>{airport.name}</Popup>
                  </Marker>
                ))}
                {transportationRoutes.map((route, index) => (
                  <Polyline 
                    key={index} 
                    positions={route.coords} 
                    color={route.color} 
                    weight={3}
                    opacity={0.8}
                  />
                ))}
              </MapContainer>
            </div>
          </div>
        </div>
      </div>

      <IdeasCard ideas={ideas} onAdd={addIdea} onRemove={removeIdea} />

      <section className="summary card">
        <h2>Planning summary</h2>
        <p>Days: {days.length}</p>
        <p>Total activities: {days.reduce((sum, day) => sum + day.flights.length + day.ferries.length + day.carRentals.length + day.accommodations.length + day.dinners.length + day.excursions.length, 0)}</p>
        <pre>{JSON.stringify(itinerarySummary, null, 2)}</pre>
      </section>
    </main>
  );
}
