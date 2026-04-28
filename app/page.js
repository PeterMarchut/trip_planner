'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { MapPin, Plane, Calendar, Plus, Trash2, ChevronDown, ChevronRight, Sun, Moon } from 'lucide-react';
import dynamic from 'next/dynamic';
import { authFetch, useOwnerToken } from './lib/auth';

// Dynamic import for map to avoid SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import('react-leaflet').then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import('react-leaflet').then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import('react-leaflet').then(mod => mod.Popup), { ssr: false });
const Polyline = dynamic(() => import('react-leaflet').then(mod => mod.Polyline), { ssr: false });

const LOCAL_CACHE_KEY = 'vp:trip';

// Schema for itinerary items, used by the chronological list, the add/edit
// modal, and the idea-promotion modal.
const ITEM_TYPES = {
  flights: {
    fields: ['airline', 'flightNumber', 'origin', 'destination', 'departure', 'arrival'],
    detailFields: ['arrivalDate', 'bookingVendor', 'confirmationNumber', 'notes'],
    timeField: 'departure',
    label: 'Flight'
  },
  ferries: {
    fields: ['company', 'vessel', 'origin', 'destination', 'departure', 'arrival'],
    detailFields: ['departureAddress', 'arrivalAddress', 'passengers', 'bookingVendor', 'confirmationNumber', 'notes'],
    timeField: 'departure',
    label: 'Ferry'
  },
  carRentals: {
    fields: ['company', 'pickup', 'dropoff'],
    detailFields: ['dropoffDate', 'pickupAddress', 'dropoffAddress', 'bookingVendor', 'confirmationNumber', 'notes'],
    timeField: 'pickup',
    label: 'Car Rental'
  },
  accommodations: {
    fields: ['name', 'checkIn', 'checkOut', 'nights'],
    detailFields: ['address', 'phone', 'bookingVendor', 'confirmationNumber', 'notes'],
    timeField: 'checkIn',
    label: 'Accommodation'
  },
  dinners: {
    fields: ['name', 'time'],
    detailFields: ['address', 'phone', 'bookingVendor', 'confirmationNumber', 'notes'],
    timeField: 'time',
    label: 'Dinner'
  },
  excursions: {
    fields: ['name', 'time'],
    detailFields: ['address', 'phone', 'bookingVendor', 'confirmationNumber', 'notes'],
    timeField: 'time',
    label: 'Excursion'
  }
};

// Fields that should render as <input type="time"> for strict HH:MM entry.
const TIME_FIELDS = new Set(['departure', 'arrival', 'pickup', 'dropoff', 'checkIn', 'checkOut', 'time']);

// Categories that show "Save to Ideas" on their items.
const IDEA_RETURNABLE = new Set(['excursions', 'dinners']);

// Reusable Google Maps URL lookup row for the Add/Edit Item modal.
const MapsLinkLookup = ({ label, hint = '(optional — fills name + map pin)', coord, onResult }) => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState({ loading: false, error: null });

  const lookup = async () => {
    const u = url.trim();
    if (!u) return;
    setStatus({ loading: true, error: null });
    try {
      const res = await fetch(`/api/places/lookup?url=${encodeURIComponent(u)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
      onResult(data);
      setUrl('');
      setStatus({ loading: false, error: null });
    } catch (err) {
      setStatus({ loading: false, error: err.message });
    }
  };

  return (
    <div className="form-group">
      <label>{label} <span style={{ opacity: 0.6, fontWeight: 'normal' }}>{hint}</span></label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/..."
          style={{ flex: 1 }}
        />
        <button type="button" onClick={lookup} disabled={status.loading || !url.trim()} className="add-btn">
          {status.loading ? 'Looking up…' : 'Load'}
        </button>
      </div>
      {status.error && (
        <div style={{ color: '#ef4444', fontSize: '0.85em', marginTop: '4px' }}>{status.error}</div>
      )}
      {coord && Array.isArray(coord) && (
        <div style={{ fontSize: '0.8em', opacity: 0.65, marginTop: '4px' }}>
          📍 ({coord[0].toFixed(4)}, {coord[1].toFixed(4)})
        </div>
      )}
    </div>
  );
};

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
const IdeasCard = ({ ideas, onAdd, onUpdate, onRemove, readOnly = false }) => {
  const [draft, setDraft] = useState({ name: '', location: '', notes: '', coord: null });
  const [editingId, setEditingId] = useState(null);
  const [pasteUrl, setPasteUrl] = useState('');
  const [pasteStatus, setPasteStatus] = useState({ loading: false, error: null });

  // Group ideas by location, sort locations alphabetically (Unspecified last)
  // and sort items within each location alphabetically by name.
  const grouped = useMemo(() => {
    const map = new Map();
    ideas.forEach(idea => {
      const loc = (idea.location || '').trim() || 'Unspecified';
      if (!map.has(loc)) map.set(loc, []);
      map.get(loc).push(idea);
    });
    for (const items of map.values()) {
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'Unspecified') return 1;
      if (b === 'Unspecified') return -1;
      return a.localeCompare(b);
    });
  }, [ideas]);

  const submit = () => {
    if (!draft.name.trim() || !draft.location.trim()) return;
    const payload = {
      name: draft.name.trim(),
      location: draft.location.trim(),
      notes: draft.notes.trim(),
      coord: draft.coord || null
    };
    if (editingId != null) {
      onUpdate(editingId, payload);
    } else {
      onAdd(payload);
    }
    setDraft({ name: '', location: '', notes: '', coord: null });
    setEditingId(null);
  };

  const handlePasteLookup = async () => {
    const url = pasteUrl.trim();
    if (!url) return;
    setPasteStatus({ loading: true, error: null });
    try {
      const res = await fetch(`/api/places/lookup?url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Lookup failed (${res.status})`);
      setDraft(prev => ({
        name: data.name || prev.name || '',
        location: data.location || prev.location || '',
        notes: prev.notes || '',
        coord: data.coord || null
      }));
      setPasteUrl('');
      setPasteStatus({ loading: false, error: null });
    } catch (err) {
      setPasteStatus({ loading: false, error: err.message });
    }
  };

  const startEdit = (idea) => {
    setDraft({ name: idea.name || '', location: idea.location || '', notes: idea.notes || '', coord: idea.coord || null });
    setEditingId(idea.id);
  };

  const cancelEdit = () => {
    setDraft({ name: '', location: '', notes: '', coord: null });
    setEditingId(null);
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>💡 Activity Ideas</h2>
      </div>
      {!readOnly && (
        <>
          <div className="add-item" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <input
              value={pasteUrl}
              onChange={e => setPasteUrl(e.target.value)}
              placeholder="Paste a Google Maps link to import a place…"
              style={{ flex: '1 1 320px' }}
            />
            <button onClick={handlePasteLookup} disabled={pasteStatus.loading || !pasteUrl.trim()} className="add-btn">
              {pasteStatus.loading ? 'Loading…' : 'Load'}
            </button>
          </div>
          {pasteStatus.error && (
            <div style={{ color: '#ef4444', fontSize: '0.85em', marginBottom: '0.5rem' }}>{pasteStatus.error}</div>
          )}
          {draft.coord && (
            <div style={{ fontSize: '0.8em', opacity: 0.65, marginBottom: '0.4rem' }}>
              📍 ({draft.coord[0].toFixed(4)}, {draft.coord[1].toFixed(4)})
            </div>
          )}
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
            <button onClick={submit} className="add-btn" title={editingId != null ? 'Save changes' : 'Add idea'}>
              {editingId != null ? '✓' : <Plus size={16} />}
            </button>
            {editingId != null && (
              <button onClick={cancelEdit} className="cancel-btn">Cancel</button>
            )}
          </div>
        </>
      )}
      {ideas.length === 0 ? (
        <p style={{ opacity: 0.6, fontStyle: 'italic' }}>No ideas yet{readOnly ? '.' : ' — add things you might want to do.'}</p>
      ) : (
        grouped.map(([location, items]) => (
          <div key={location} style={{ marginBottom: '0.75rem' }}>
            <div className="ideas-group-header">
              {location} <span style={{ opacity: 0.6 }}>· {items.length}</span>
            </div>
            <ul className="item-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {items.map(idea => (
                <li key={idea.id} className="item" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ flex: 1 }}>
                    <div><strong>{idea.name}</strong></div>
                    {idea.notes && <div style={{ fontSize: '0.85em', opacity: 0.75 }}>{idea.notes}</div>}
                  </div>
                  {!readOnly && (
                    <>
                      <button onClick={() => startEdit(idea)} className="details-btn" style={{ padding: '2px 6px', fontSize: '0.78em' }} title="Edit">✎</button>
                      <button onClick={() => onRemove(idea.id)} className="remove-btn"><Trash2 size={12} /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
};

// ChronologicalItinerary component
const ChronologicalItinerary = ({ day, contextualAccommodations = [], contextualCarRentals = [], onAddItem, onRemoveItem, onUpdateItem, onSendToIdeas, readOnly = false, initialEdit = null, onInitialEditConsumed }) => {
  const [newItemType, setNewItemType] = useState('flights');
  const [newItem, setNewItem] = useState({});
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [lookup, setLookup] = useState({ loading: false, error: null });
  const [editing, setEditing] = useState(null); // { category, index } or null

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

  const itemTypes = ITEM_TYPES;

  // Combine all items with metadata. Skip accommodations and carRentals here —
  // they're rendered contextually based on which segment of the stay/rental
  // this day belongs to.
  const allItems = [];
  Object.entries(itemTypes).forEach(([category, config]) => {
    if (category === 'accommodations' || category === 'carRentals') return;
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

  // Layer in car rentals relevant to *this* day with role-specific labels.
  contextualCarRentals.forEach(({ cr, role, hostDayId, crIndex }) => {
    let time, fields, label;
    if (role === null) {
      // Single-day rental — use defaults
      time = cr.pickup || '';
      fields = itemTypes.carRentals.fields;
      label = itemTypes.carRentals.label;
    } else if (role === 'pickup') {
      time = cr.pickup || '';
      fields = ['company'];
      label = 'Car Rental – Pickup';
    } else if (role === 'in-use') {
      time = '';
      fields = ['company'];
      label = 'Car Rental – Ongoing';
    } else { // dropoff
      time = cr.dropoff || '';
      fields = ['company'];
      label = 'Car Rental – Drop-off';
    }
    allItems.push({
      ...cr,
      category: 'carRentals',
      index: crIndex,
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

  const handleSubmit = () => {
    const hasContent = Object.values(newItem).some(v => typeof v === 'string' && v.trim());
    if (!hasContent) return;
    if (editing) {
      onUpdateItem(editing.dayId, editing.category, editing.index, newItem);
    } else {
      onAddItem(day.id, newItemType, newItem);
    }
    setNewItem({});
    setLookup({ loading: false, error: null });
    setEditing(null);
    setShowAddModal(false);
  };

  const startEdit = (item) => {
    // For accommodations on derived (middle/checkOut) rows, the data lives on
    // the host day, not the current day. We carry the merged item back into
    // the form, stripping our display-only metadata.
    const { category, index, label, fields, role, hostDayId, time, icon, ...formData } = item;
    const targetDayId = hostDayId || day.id;
    setNewItemType(category);
    setNewItem(formData);
    setEditing({ category, index, dayId: targetDayId });
    setShowAddModal(true);
  };

  // Honor a deep-link initialEdit (passed from the Planning page when navigated
  // here from a view-page card's Edit button). Lookup the source item by
  // category+index and open the modal once.
  useEffect(() => {
    if (!initialEdit || readOnly) return;
    const { category, index } = initialEdit;
    const source = day[category]?.[index];
    if (!source) {
      onInitialEditConsumed?.();
      return;
    }
    setNewItemType(category);
    setNewItem({ ...source });
    setEditing({ category, index, dayId: day.id });
    setShowAddModal(true);
    onInitialEditConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEdit?.category, initialEdit?.index]);

  const cancelModal = () => {
    setNewItem({});
    setEditing(null);
    setLookup({ loading: false, error: null });
    setShowAddModal(false);
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
        {!readOnly && (
          <button onClick={() => setShowAddModal(true)} className="add-item-btn">
            <Plus size={16} />
            Add Item
          </button>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" onClick={cancelModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editing ? 'Edit Item' : 'Add Itinerary Item'}</h3>
              <button onClick={cancelModal} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Item Type</label>
                <select value={newItemType} onChange={(e) => handleTypeChange(e.target.value)} disabled={!!editing}>
                  {Object.entries(itemTypes).map(([key, config]) => (
                    <option key={key} value={key}>{config.label}</option>
                  ))}
                </select>
              </div>
              {['accommodations', 'dinners', 'excursions'].includes(newItemType) && (
                <MapsLinkLookup
                  label="Paste a Google Maps link"
                  hint="(optional — fills name, address, phone, and map pin)"
                  coord={newItem.coord}
                  onResult={(data) => setNewItem(prev => ({
                    ...prev,
                    name: data.name || prev.name || '',
                    address: data.address || prev.address || '',
                    phone: data.phone || prev.phone || '',
                    coord: data.coord || prev.coord || null
                  }))}
                />
              )}
              {newItemType === 'ferries' && (
                <>
                  <MapsLinkLookup
                    label="Departure terminal"
                    hint="(optional — fills departure address + map pin)"
                    coord={newItem.departureCoord}
                    onResult={(data) => setNewItem(prev => ({
                      ...prev,
                      departureCoord: data.coord || prev.departureCoord || null,
                      departureAddress: data.address || prev.departureAddress || ''
                    }))}
                  />
                  <MapsLinkLookup
                    label="Arrival terminal"
                    hint="(optional — fills arrival address + map pin)"
                    coord={newItem.arrivalCoord}
                    onResult={(data) => setNewItem(prev => ({
                      ...prev,
                      arrivalCoord: data.coord || prev.arrivalCoord || null,
                      arrivalAddress: data.address || prev.arrivalAddress || ''
                    }))}
                  />
                </>
              )}
              {itemTypes[newItemType].fields.map(field => {
                const isFlightNumber = newItemType === 'flights' && field === 'flightNumber';
                const isTimeField = TIME_FIELDS.has(field);
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
                        type={isTimeField ? 'time' : 'text'}
                        value={newItem[field] || ''}
                        onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                        placeholder={isTimeField ? '' : `Enter ${field}`}
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
              {(itemTypes[newItemType].detailFields || []).map(field => {
                const isDateField = /Date$/.test(field);
                const isNotes = field === 'notes';
                return (
                  <div key={field} className="form-group">
                    <label>{field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</label>
                    {isNotes ? (
                      <textarea
                        rows={3}
                        value={newItem[field] || ''}
                        onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                        placeholder="Notes…"
                        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    ) : (
                      <input
                        type={isDateField ? 'date' : 'text'}
                        value={newItem[field] || ''}
                        onChange={(e) => setNewItem({ ...newItem, [field]: e.target.value })}
                        placeholder={isDateField ? '' : `Enter ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button onClick={cancelModal} className="cancel-btn">Cancel</button>
              <button onClick={handleSubmit} className="add-btn">{editing ? 'Save' : 'Add Item'}</button>
            </div>
          </div>
        </div>
      )}

      <ul className="chronological-list">
        {allItems.length > 0 && contextualCarRentals.length === 0 && (
          <li className="chronological-item" style={{ borderLeft: '3px solid #f59e0b', background: 'rgba(245, 158, 11, 0.06)' }}>
            <div className="item-time">—</div>
            <div className="item-content">
              <div className="item-type" style={{ color: '#f59e0b' }}>⚠ Transportation</div>
              <div className="item-details">
                <span style={{ fontStyle: 'italic' }}>Unconfirmed — no car rental booked for this day</span>
              </div>
              {!readOnly && (
                <button
                  onClick={() => onAddItem(day.id, 'carRentals', { company: 'Taxi/Uber', pickup: '', dropoff: '' })}
                  className="details-btn"
                  style={{ marginTop: '4px' }}
                >
                  Mark as Taxi/Uber
                </button>
              )}
            </div>
          </li>
        )}
        {allItems.map((item, listIndex) => {
          const itemKey = `${item.category}-${item.index}-${item.role || 'self'}`;
          const isExpanded = expandedItems.has(itemKey);
          const hasDetails = itemTypes[item.category].detailFields && itemTypes[item.category].detailFields.some(field => item[field]);
          const canRemove = !item.role || item.role === 'checkIn' || item.role === 'pickup';
          const isDerived = (item.category === 'accommodations' && (item.role === 'middle' || item.role === 'checkOut'))
                         || (item.category === 'carRentals' && (item.role === 'in-use' || item.role === 'dropoff'));

          return (
            <li
              key={itemKey}
              className="chronological-item"
              data-category={item.category}
              style={isDerived ? { opacity: 0.85 } : undefined}
            >
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
              {!readOnly && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <button
                    onClick={() => startEdit(item)}
                    className="details-btn"
                    title={isDerived ? 'Edit (changes apply to the booking)' : 'Edit'}
                    style={{ padding: '2px 6px', fontSize: '0.78em' }}
                  >
                    ✎
                  </button>
                  {canRemove && IDEA_RETURNABLE.has(item.category) && (
                    <button
                      onClick={() => onSendToIdeas(day.id, item.category, item.index)}
                      className="details-btn"
                      title="Move back to Ideas list"
                      style={{ padding: '2px 6px', fontSize: '0.78em' }}
                    >
                      💡
                    </button>
                  )}
                  {canRemove && (
                    <button
                      onClick={() => onRemoveItem(item.hostDayId || day.id, item.category, item.index)}
                      className="remove-btn"
                      title="Remove"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
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
  const [markerIcons, setMarkerIcons] = useState(null);
  const lastSavedRef = useRef(null);
  const { isOwner } = useOwnerToken();
  // Deep-link support: ?day=X&edit=cat:idx — opens a day's edit modal on mount.
  // The view pages link here to let users jump from a card directly into edit.
  const [initialEdit, setInitialEdit] = useState(null);
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const dayParam = params.get('day');
    const editCategory = params.get('editCategory');
    const editIndexParam = params.get('editIndex');
    if (!dayParam) return;
    const dayId = parseInt(dayParam, 10);
    if (!Number.isFinite(dayId)) return;
    if (!days.some(d => d.id === dayId)) {
      window.history.replaceState(null, '', '/');
      return;
    }
    setSelectedDayId(dayId);
    if (editCategory && editIndexParam !== null) {
      const index = parseInt(editIndexParam, 10);
      if (Number.isFinite(index)) {
        setInitialEdit({ category: editCategory, index });
      }
    }
    window.history.replaceState(null, '', '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Build category-colored map markers once, client-side (Leaflet uses window).
  useEffect(() => {
    let active = true;
    import('leaflet').then(({ default: L }) => {
      if (!active) return;
      const make = (color) => L.divIcon({
        html: `<svg width="22" height="30" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M11 0C5 0 0 5 0 11c0 8 11 19 11 19s11-11 11-19c0-6-5-11-11-11z" fill="${color}" stroke="white" stroke-width="2"/><circle cx="11" cy="11" r="4" fill="white"/></svg>`,
        className: 'category-marker',
        iconSize: [22, 30],
        iconAnchor: [11, 30],
        popupAnchor: [0, -24]
      });
      setMarkerIcons({
        flights:        make('#38bdf8'),
        ferries:        make('#14b8a6'),
        carRentals:     make('#f97316'),
        accommodations: make('#a855f7'),
        dinners:        make('#f43f5e'),
        excursions:     make('#10b981'),
        city:           make('#94a3b8')
      });
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Initial load: server first, fall back to localStorage cache, fall back to sample.
  useEffect(() => {
    let active = true;
    (async () => {
      let loaded = false;
      try {
        const res = await authFetch('/api/trip', { cache: 'no-store' });
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
    if (!isOwner) {
      // Read-only: skip the server PUT but keep localStorage for cache.
      lastSavedRef.current = payload;
      setSyncStatus('readonly');
      return;
    }
    setSyncStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const res = await authFetch('/api/trip', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: payload
        });
        if (res.ok) {
          lastSavedRef.current = payload;
          setSyncStatus('synced');
        } else if (res.status === 403) {
          setSyncStatus('forbidden');
        } else {
          setSyncStatus('offline');
        }
      } catch {
        setSyncStatus('offline');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [days, ideas, hydrated, isOwner]);

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
      await authFetch('/api/trip', { method: 'DELETE' });
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

      // Multi-day car rental: ensure every day from pickup through dropoff exists.
      if (category === 'carRentals' && item.dropoffDate && /^\d{4}-\d{2}-\d{2}$/.test(item.dropoffDate)) {
        const pickupDay = updated.find(d => d.id === dayId);
        if (pickupDay && pickupDay.date) {
          const base = new Date(pickupDay.date);
          const dropoff = new Date(item.dropoffDate);
          const dayDiff = Math.round((dropoff - base) / (24 * 60 * 60 * 1000));
          if (dayDiff > 0) {
            const stayLocation = pickupDay.endLocation || pickupDay.startLocation || '';
            for (let i = 1; i <= dayDiff; i++) {
              const t = new Date(base);
              t.setDate(t.getDate() + i);
              const dateStr = t.toISOString().split('T')[0];
              if (!updated.some(d => d.date === dateStr)) {
                const nextId = updated.length > 0 ? Math.max(...updated.map(d => d.id)) + 1 : 1;
                updated.push({
                  id: nextId,
                  date: dateStr,
                  startLocation: stayLocation,
                  endLocation: stayLocation,
                  flights: [], ferries: [], carRentals: [], accommodations: [], dinners: [], excursions: []
                });
              }
            }
            updated.sort((a, b) => a.date.localeCompare(b.date));
          }
        }
      }

      return updated;
    });
  };

  const removeItemFromDay = (dayId, category, index) => {
    setDays(prev => prev.map(day =>
      day.id === dayId
        ? { ...day, [category]: day[category].filter((_, i) => i !== index) }
        : day
    ));
  };

  const updateItemInDay = (dayId, category, index, item) => {
    setDays(prev => prev.map(day =>
      day.id === dayId
        ? { ...day, [category]: day[category].map((x, i) => i === index ? item : x) }
        : day
    ));
  };

  const sendItemToIdeas = (dayId, category, index) => {
    const day = days.find(d => d.id === dayId);
    if (!day) return;
    const item = day[category]?.[index];
    if (!item) return;
    const nextId = ideas.length > 0 ? Math.max(...ideas.map(i => i.id)) + 1 : 1;
    const ideaLocation = day.endLocation || day.startLocation || '';
    setIdeas([...ideas, {
      id: nextId,
      name: item.name || '(unnamed)',
      location: ideaLocation,
      notes: item.notes || '',
      coord: item.coord || null
    }]);
    removeItemFromDay(dayId, category, index);
  };

  const selectDay = (dayId) => {
    setSelectedDayId(dayId);
    // Map zoom will be handled in the map component
  };

  const addIdea = (idea) => {
    const nextId = ideas.length > 0 ? Math.max(...ideas.map(i => i.id)) + 1 : 1;
    setIdeas([...ideas, { ...idea, id: nextId }]);
  };

  const updateIdea = (id, updates) => {
    setIdeas(ideas.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const removeIdea = (id) => {
    setIdeas(ideas.filter(i => i.id !== id));
  };

  // Idea-promotion modal state. (Wrapper kept here for clarity below.) When set, the modal opens with category +
  // form pre-populated from the idea. Save adds to the day, removes from ideas.
  const [promoting, setPromoting] = useState(null); // { idea, dayId } | null
  const [promoteCategory, setPromoteCategory] = useState('excursions');
  const [promoteForm, setPromoteForm] = useState({});

  const startPromoteIdea = (idea, dayId) => {
    setPromoting({ idea, dayId });
    setPromoteCategory('excursions');
    setPromoteForm({
      name: idea.name || '',
      notes: idea.notes || '',
      coord: idea.coord || null
    });
  };

  const cancelPromote = () => {
    setPromoting(null);
    setPromoteForm({});
  };

  const onPromoteCategoryChange = (cat) => {
    setPromoteCategory(cat);
    const config = ITEM_TYPES[cat];
    const allFields = [...config.fields, ...(config.detailFields || [])];
    // Preserve name/notes/coord across category changes; clear other fields.
    setPromoteForm(prev => {
      const base = allFields.reduce((acc, f) => ({ ...acc, [f]: '' }), {});
      return {
        ...base,
        name: prev.name || '',
        notes: prev.notes || '',
        coord: prev.coord || null
      };
    });
  };

  const submitPromote = () => {
    if (!promoting) return;
    const hasContent = Object.values(promoteForm).some(v => typeof v === 'string' && v.trim());
    if (!hasContent) return;
    setDays(prev => prev.map(d =>
      d.id === promoting.dayId
        ? { ...d, [promoteCategory]: [...(d[promoteCategory] || []), promoteForm] }
        : d
    ));
    setIdeas(prev => prev.filter(i => i.id !== promoting.idea.id));
    cancelPromote();
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

  // Same idea for car rentals: pickup on host day, in-use on every day in
  // between, dropoff on the dropoffDate. Single-day rentals (no dropoffDate or
  // dropoff equal to pickup) get role: null and render unchanged.
  const carRentalsByDay = useMemo(() => {
    const result = {};
    days.forEach(hostDay => {
      (hostDay.carRentals || []).forEach((cr, crIndex) => {
        const hasMultiDay = cr.dropoffDate && /^\d{4}-\d{2}-\d{2}$/.test(cr.dropoffDate)
          && cr.dropoffDate > hostDay.date;
        if (!hasMultiDay) {
          (result[hostDay.id] ||= []).push({ cr, role: null, hostDayId: hostDay.id, crIndex });
          return;
        }
        const base = new Date(hostDay.date);
        const dropoff = new Date(cr.dropoffDate);
        const dayDiff = Math.round((dropoff - base) / (24 * 60 * 60 * 1000));
        (result[hostDay.id] ||= []).push({ cr, role: 'pickup', hostDayId: hostDay.id, crIndex });
        for (let i = 1; i <= dayDiff; i++) {
          const t = new Date(base);
          t.setDate(t.getDate() + i);
          const dateStr = t.toISOString().split('T')[0];
          const target = days.find(d => d.date === dateStr);
          if (target) {
            const role = i === dayDiff ? 'dropoff' : 'in-use';
            (result[target.id] ||= []).push({ cr, role, hostDayId: hostDay.id, crIndex });
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

  // Coord-anchored markers (flight airports + items with coords). Each carries
  // its category color and the day to jump to when clicked.
  const itemMarkers = [];
  const seenMarkers = new Set();
  const addMarker = (name, coord, category, dayId) => {
    if (!coord || !Array.isArray(coord) || coord.length !== 2) return;
    const id = `${coord[0]},${coord[1]}`;
    if (seenMarkers.has(id)) return;
    seenMarkers.add(id);
    itemMarkers.push({ name: name || 'Place', coord, category, dayId });
  };
  days.forEach(day => {
    day.flights.forEach(flight => {
      addMarker(flight.origin, flight.originCoord, 'flights', day.id);
      addMarker(flight.destination, flight.destinationCoord, 'flights', day.id);
    });
    day.ferries.forEach(ferry => {
      addMarker(ferry.origin, ferry.departureCoord, 'ferries', day.id);
      addMarker(ferry.destination, ferry.arrivalCoord, 'ferries', day.id);
    });
    ['excursions', 'dinners', 'accommodations', 'carRentals'].forEach(category => {
      (day[category] || []).forEach(item => addMarker(item.name || item.company, item.coord, category, day.id));
    });
  });

  // Map city name → first day visiting that city (start or end).
  const cityToFirstDay = {};
  days.forEach(day => {
    [day.startLocation, day.endLocation].forEach(loc => {
      const key = getCityKey(loc);
      if (key && !(key in cityToFirstDay)) cityToFirstDay[key] = day.id;
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

    // Ferry routes — prefer port coords if set, else city centers
    day.ferries.forEach(ferry => {
      const originCoord = ferry.departureCoord || getCityCoords(ferry.origin);
      const destCoord = ferry.arrivalCoord || getCityCoords(ferry.destination);
      if (originCoord && destCoord && !sameCoord(originCoord, destCoord)) {
        transportationRoutes.push({
          coords: [originCoord, destCoord],
          color: '#14b8a6',
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
        <div className="hero-actions">
          <span className="sync-status" title={`Sync: ${syncStatus}`}>
            {syncStatus === 'loading' && '⏳ Loading…'}
            {syncStatus === 'saving' && '💾 Saving…'}
            {syncStatus === 'synced' && '✓ Synced'}
            {syncStatus === 'offline' && '⚠ Offline'}
            {syncStatus === 'readonly' && '👁 Read-only'}
            {syncStatus === 'forbidden' && '🔒 Forbidden — sign in'}
          </span>
          {isOwner && (
            <button onClick={resetTripData} className="theme-toggle" style={{ position: 'static' }} title="Reset to sample data">
              Reset
            </button>
          )}
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
              {isOwner && (
                <button onClick={addDay} className="add-btn">
                  <Plus size={16} />
                </button>
              )}
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
                  {isOwner && (
                    <button onClick={(e) => { e.stopPropagation(); removeDay(day.id); }} className="remove-btn">
                      <Trash2 size={14} />
                    </button>
                  )}
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
                if (!day) return <p style={{ opacity: 0.6, fontStyle: 'italic' }}>Day not found.</p>;
                return (
                  <div className="day-details-full">
                    <div className="basic-info">
                      <label>
                        Start Location
                        <input
                          value={day.startLocation}
                          onChange={(e) => updateDay(day.id, 'startLocation', e.target.value)}
                          placeholder="Where the day starts"
                          readOnly={!isOwner}
                        />
                      </label>
                      <label>
                        End Location
                        <input
                          value={day.endLocation}
                          onChange={(e) => updateDay(day.id, 'endLocation', e.target.value)}
                          placeholder="Where the day ends"
                          readOnly={!isOwner}
                        />
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          value={day.date}
                          onChange={(e) => updateDay(day.id, 'date', e.target.value)}
                          readOnly={!isOwner}
                        />
                      </label>
                    </div>

                    <ChronologicalItinerary
                      day={day}
                      contextualAccommodations={accommodationsByDay[day.id] || []}
                      contextualCarRentals={carRentalsByDay[day.id] || []}
                      onAddItem={addItemToDay}
                      onRemoveItem={removeItemFromDay}
                      onUpdateItem={updateItemInDay}
                      onSendToIdeas={sendItemToIdeas}
                      readOnly={!isOwner}
                      initialEdit={day.id === selectedDayId ? initialEdit : null}
                      onInitialEditConsumed={() => setInitialEdit(null)}
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
                                {isOwner && (
                                  <>
                                    <button onClick={() => startPromoteIdea(idea, day.id)} className="add-btn" title="Add to this day…">
                                      <Plus size={14} />
                                    </button>
                                    <button onClick={() => removeIdea(idea.id)} className="remove-btn" title="Discard idea">
                                      <Trash2 size={12} />
                                    </button>
                                  </>
                                )}
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
                {mapLocations.map((loc, index) => {
                  const dayId = cityToFirstDay[loc];
                  return (
                    <Marker
                      key={`city-${index}`}
                      position={cityCoords[loc]}
                      icon={markerIcons?.city}
                      eventHandlers={dayId ? { click: () => selectDay(dayId) } : undefined}
                    >
                      <Popup>{loc}</Popup>
                    </Marker>
                  );
                })}
                {itemMarkers.map((m, index) => (
                  <Marker
                    key={`item-${index}`}
                    position={m.coord}
                    icon={markerIcons?.[m.category]}
                    eventHandlers={m.dayId ? { click: () => selectDay(m.dayId) } : undefined}
                  >
                    <Popup>{m.name}</Popup>
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

      <IdeasCard ideas={ideas} onAdd={addIdea} onUpdate={updateIdea} onRemove={removeIdea} readOnly={!isOwner} />

      {promoting && (() => {
        const cfg = ITEM_TYPES[promoteCategory];
        const isNotesField = (f) => f === 'notes';
        const renderField = (field) => {
          const isTime = TIME_FIELDS.has(field);
          const isDate = /Date$/.test(field);
          if (isNotesField(field)) {
            return (
              <textarea
                rows={3}
                value={promoteForm[field] || ''}
                onChange={(e) => setPromoteForm({ ...promoteForm, [field]: e.target.value })}
                placeholder="Notes…"
                style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
              />
            );
          }
          return (
            <input
              type={isTime ? 'time' : isDate ? 'date' : 'text'}
              value={promoteForm[field] || ''}
              onChange={(e) => setPromoteForm({ ...promoteForm, [field]: e.target.value })}
              placeholder={isTime || isDate ? '' : `Enter ${field}`}
            />
          );
        };
        return (
          <div className="modal-overlay" onClick={cancelPromote}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Add &ldquo;{promoting.idea.name}&rdquo; to {days.find(d => d.id === promoting.dayId)?.date}</h3>
                <button onClick={cancelPromote} className="close-btn">×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Category</label>
                  <select value={promoteCategory} onChange={(e) => onPromoteCategoryChange(e.target.value)}>
                    {Object.entries(ITEM_TYPES).map(([key, c]) => (
                      <option key={key} value={key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {cfg.fields.map(field => (
                  <div key={field} className="form-group">
                    <label>{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                    {renderField(field)}
                  </div>
                ))}
                {(cfg.detailFields || []).map(field => (
                  <div key={field} className="form-group">
                    <label>{field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</label>
                    {renderField(field)}
                  </div>
                ))}
                {promoteForm.coord && (
                  <div className="form-group" style={{ fontSize: '0.85em', opacity: 0.7 }}>
                    📍 Map coordinate carried over from idea ({promoteForm.coord[0].toFixed(3)}, {promoteForm.coord[1].toFixed(3)})
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button onClick={cancelPromote} className="cancel-btn">Cancel</button>
                <button onClick={submitPromote} className="add-btn">Add to day</button>
              </div>
            </div>
          </div>
        );
      })()}

      <section className="summary card">
        <h2>Planning summary</h2>
        <p>Days: {days.length}</p>
        <p>Total activities: {days.reduce((sum, day) => sum + day.flights.length + day.ferries.length + day.carRentals.length + day.accommodations.length + day.dinners.length + day.excursions.length, 0)}</p>
        <pre>{JSON.stringify(itinerarySummary, null, 2)}</pre>
      </section>
    </main>
  );
}
