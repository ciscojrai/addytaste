import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import type { Pin } from '../lib/types';

export function MiniMap({ pins }: { pins: Pin[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(m);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => { m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngTuple[] = [];
    for (const p of pins) {
      const icon = L.divIcon({ className: '', html: `<div class="pin${p.primary ? ' primary' : ''}"></div>`, iconSize: p.primary ? [22, 22] : [16, 16] });
      L.marker([p.lat, p.lon], { icon, title: p.name.replace(/^\[sample\] /, '') }).bindTooltip(p.name).addTo(g);
      pts.push([p.lat, p.lon]);
    }
    if (pts.length) m.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 });
    setTimeout(() => m.invalidateSize(), 50);
  }, [pins]);

  return <div ref={el} className="map" role="img" aria-label="Map of the places Qloo matched" />;
}
