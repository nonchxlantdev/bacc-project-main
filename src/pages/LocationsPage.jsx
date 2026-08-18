import { MapPin } from 'lucide-react';
import { useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tokens } from '../lib/tokens.js';

const PGIA = { lat: 17.539, lng: -88.308 };

export default function LocationsPage() {
  useEffect(() => {
    const map = L.map('pgia-map').setView([PGIA.lat, PGIA.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    L.circleMarker([PGIA.lat, PGIA.lng], {
      radius: 10,
      color: tokens.primary,
      fillColor: tokens.teal,
      fillOpacity: 0.9,
      weight: 2,
    })
      .addTo(map)
      .bindPopup('Philip S.W. Goldson International Airport');
    return () => map.remove();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-navy sm:text-2xl">Locations</h1>
      <p className="text-sm text-muted">
        PGIA is the Phase 1 location. Incident pin capture (BACC §7) ships with slice phase 2.
      </p>
      <div id="pgia-map" className="h-80 overflow-hidden rounded-lg border border-navy/15" />
      <div className="flex items-center gap-2 text-sm text-navy">
        <MapPin className="h-4 w-4 text-teal" />
        Philip S.W. Goldson International Airport · PGIA / BZE
      </div>
    </div>
  );
}
