import { MapPin } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { INCIDENT_STATUS_COLORS } from '../config/chartPalette.js';
import { useIncidents } from '../hooks/useRepos.js';
import { tokens } from '../lib/tokens.js';

const PGIA = { lat: 17.539, lng: -88.308 };

function hasCoords(incident) {
  const lat = Number(incident?.latitude);
  const lng = Number(incident?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

export default function LocationsPage() {
  const { rows } = useIncidents();
  const navigate = useNavigate();
  const mapRef = useRef(null);
  const layerRef = useRef(null);

  const plotted = useMemo(() => rows.filter(hasCoords), [rows]);

  const statusKeysPresent = useMemo(() => {
    const keys = new Set(plotted.map((i) => i.status).filter(Boolean));
    return Object.keys(INCIDENT_STATUS_COLORS).filter((k) => keys.has(k));
  }, [plotted]);

  useEffect(() => {
    const map = L.map('pgia-map', { scrollWheelZoom: true }).setView([PGIA.lat, PGIA.lng], 14);
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

    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const incident of plotted) {
      const color = INCIDENT_STATUS_COLORS[incident.status] || tokens.primary;
      const marker = L.circleMarker([Number(incident.latitude), Number(incident.longitude)], {
        radius: 8,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 2,
      });
      const title = incident.incident_ref || incident.noc_no || 'Incident';
      const body = (incident.title || incident.description || '').slice(0, 120);
      marker.bindPopup(
        `<strong>${escapeHtml(title)}</strong><br/>${escapeHtml(body)}${body.length >= 120 ? '…' : ''}`,
      );
      marker.on('click', () => navigate(`/incidents/${incident.id}`));
      layer.addLayer(marker);
    }
  }, [plotted, navigate]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-ink sm:text-2xl">Locations</h1>
      <p className="text-sm text-muted">
        PGIA base map with incident pins for every record that has a captured location.
        {plotted.length === 0
          ? ' No incident pins yet — raise an incident with a map pin to see it here.'
          : ` Showing ${plotted.length} incident pin${plotted.length === 1 ? '' : 's'}.`}
      </p>
      <div className="isolate overflow-hidden rounded-lg border border-line/15">
        <div id="pgia-map" className="h-80 w-full" />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink">
        <span className="inline-flex items-center gap-2">
          <MapPin className="h-4 w-4 text-teal" aria-hidden />
          Philip S.W. Goldson International Airport · PGIA / BZE
        </span>
        {statusKeysPresent.length > 0 && (
          <span className="flex flex-wrap items-center gap-3 text-xs text-muted" aria-label="Incident status legend">
            {statusKeysPresent.map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: INCIDENT_STATUS_COLORS[key] }}
                  aria-hidden
                />
                {key.replace('_', ' ')}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
