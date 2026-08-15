import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { tokens } from '../../lib/tokens.js';

export const PGIA_CENTER = { lat: 17.539, lng: -88.308 };

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
}) {
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const idRef = useRef(`map-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    const map = L.map(idRef.current).setView(
      [latitude || PGIA_CENTER.lat, longitude || PGIA_CENTER.lng],
      latitude ? 16 : 14,
    );
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
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
    if (!markerRef.current || !mapRef.current || latitude == null || longitude == null) return;
    const current = markerRef.current.getLatLng();
    if (Math.abs(current.lat - latitude) < 1e-6 && Math.abs(current.lng - longitude) < 1e-6) return;
    markerRef.current.setLatLng([latitude, longitude]);
    mapRef.current.setView([latitude, longitude]);
  }, [latitude, longitude]);

  return <div id={idRef.current} className="overflow-hidden rounded-md border border-navy/15" style={{ height }} />;
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
