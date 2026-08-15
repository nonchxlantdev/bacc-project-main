import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Layers } from 'lucide-react';
import { tokens } from '../../lib/tokens.js';

export const PGIA_CENTER = { lat: 17.539, lng: -88.308 };

/**
 * Satellite is the default: an inspector pinning a culvert or a drainage swale
 * needs aerial detail. A street map shows almost nothing airside.
 */
const LAYERS = {
  satellite: {
    label: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  street: {
    label: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
};

const pinIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:50%;background:${tokens.alert};border:2px solid white;box-shadow:0 0 0 2px ${tokens.navy}"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

export default function LocationPicker({
  latitude,
  longitude,
  onChange,
  height = 220,
  draggable = true,
  showLayerToggle = true,
  defaultLayer = 'satellite',
}) {
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const tileRef = useRef(null);
  const idRef = useRef(`map-${Math.random().toString(36).slice(2)}`);
  const [layer, setLayer] = useState(defaultLayer);

  useEffect(() => {
    const map = L.map(idRef.current).setView(
      [latitude || PGIA_CENTER.lat, longitude || PGIA_CENTER.lng],
      latitude ? 16 : 14,
    );
    const cfg = LAYERS[defaultLayer] ?? LAYERS.satellite;
    tileRef.current = L.tileLayer(cfg.url, {
      attribution: cfg.attribution,
      maxZoom: cfg.maxZoom,
    }).addTo(map);

    const marker = L.marker([latitude || PGIA_CENTER.lat, longitude || PGIA_CENTER.lng], {
      icon: pinIcon,
      draggable,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      onChange?.({
        latitude: +pos.lat.toFixed(6),
        longitude: +pos.lng.toFixed(6),
        location_capture_method: 'map_pin',
        location_user_adjusted: true,
        location_captured_at: new Date().toISOString(),
      });
    });
    map.on('click', (event) => {
      marker.setLatLng(event.latlng);
      onChange?.({
        latitude: +event.latlng.lat.toFixed(6),
        longitude: +event.latlng.lng.toFixed(6),
        location_capture_method: 'map_pin',
        location_user_adjusted: true,
        location_captured_at: new Date().toISOString(),
      });
    });

    mapRef.current = map;
    markerRef.current = marker;
    return () => map.remove();
    // Mount once; parent pushes lat/lng via the next effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !tileRef.current) return;
    const cfg = LAYERS[layer] ?? LAYERS.satellite;
    tileRef.current.setUrl(cfg.url);
    tileRef.current.options.attribution = cfg.attribution;
    mapRef.current.attributionControl?.setPrefix(false);
  }, [layer]);

  useEffect(() => {
    if (!markerRef.current || !mapRef.current || latitude == null || longitude == null) return;
    const current = markerRef.current.getLatLng();
    if (Math.abs(current.lat - latitude) < 1e-6 && Math.abs(current.lng - longitude) < 1e-6) return;
    markerRef.current.setLatLng([latitude, longitude]);
    mapRef.current.setView([latitude, longitude]);
  }, [latitude, longitude]);

  return (
    <div className="relative">
      <div
        id={idRef.current}
        className="overflow-hidden rounded-md border border-navy/15"
        style={{ height }}
      />
      {showLayerToggle && (
        <button
          type="button"
          onClick={() => setLayer((v) => (v === 'satellite' ? 'street' : 'satellite'))}
          title={`Switch to ${layer === 'satellite' ? 'street' : 'satellite'} view`}
          aria-label={`Switch to ${layer === 'satellite' ? 'street' : 'satellite'} view`}
          className="absolute bottom-3 right-3 z-[400] inline-flex min-h-9 items-center gap-1.5 rounded border border-navy/20 bg-white px-2.5 text-xs font-semibold text-navy shadow-sm hover:bg-stripe"
        >
          <Layers size={14} aria-hidden />
          {LAYERS[layer]?.label}
        </button>
      )}
    </div>
  );
}

export async function captureGps() {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not available on this device.');
  }
  const pos = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 12000,
    });
  });
  return {
    latitude: +pos.coords.latitude.toFixed(6),
    longitude: +pos.coords.longitude.toFixed(6),
    location_accuracy_m: pos.coords.accuracy,
    location_captured_at: new Date().toISOString(),
    location_capture_method: 'gps',
    location_user_adjusted: false,
  };
}
