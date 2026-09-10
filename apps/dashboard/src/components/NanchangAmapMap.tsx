import { useEffect, useMemo, useRef, useState } from 'react';
import { getAmapConfig } from '../lib/deployment-config';

export type PoliceIncidentGeo = {
  id: string;
  incidentNo: string;
  title: string;
  jurisdiction: string;
  address: string;
  latitude: number;
  longitude: number;
};

type MapState = 'loading' | 'ready' | 'missing-key' | 'error';

declare global {
  interface Window {
    AMap?: any;
    _AMapSecurityConfig?: { securityJsCode?: string };
    __publicSecurityPlatformAmapLoader?: Promise<any>;
  }
}

export function PoliceJurisdictionAmapMap({
  incidents,
  selectedIncidentId,
}: {
  incidents: PoliceIncidentGeo[];
  selectedIncidentId: string;
}) {
  const { key } = getAmapConfig();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const lookupIdRef = useRef(0);
  const [state, setState] = useState<MapState>(key ? 'loading' : 'missing-key');
  const [geocoderReady, setGeocoderReady] = useState(false);

  const selectedIncident = useMemo(
    () => incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0],
    [incidents, selectedIncidentId],
  );

  useEffect(() => {
    if (!key) return;
    let cancelled = false;

    async function bootstrap() {
      try {
        const AMap = await loadAmapSdk();
        if (cancelled || !hostRef.current) return;

        const map = new AMap.Map(hostRef.current, {
          center: [115.86, 28.68],
          zoom: 10,
          resizeEnable: true,
          showIndoorMap: false,
          viewMode: '2D',
          layers: [
            new AMap.TileLayer.Satellite(),
            new AMap.TileLayer.RoadNet(),
          ],
        });

        map.setCity('南昌市');
        map.setStatus({
          dragEnable: true,
          keyboardEnable: false,
          doubleClickZoom: true,
          zoomEnable: true,
          rotateEnable: false,
          pitchEnable: false,
        });

        mapRef.current = map;
        setState('ready');

        try {
          AMap.plugin('AMap.Geocoder', () => {
            if (cancelled) return;
            try {
              geocoderRef.current = new AMap.Geocoder({ city: '南昌市' });
              setGeocoderReady(true);
            } catch {
              geocoderRef.current = null;
            }
          });
        } catch {
          geocoderRef.current = null;
        }
      } catch {
        if (!cancelled) setState('error');
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      geocoderRef.current = null;
      setGeocoderReady(false);
      setState(key ? 'loading' : 'missing-key');
    };
  }, [incidents, key]);

  useEffect(() => {
    if (state !== 'ready' || !mapRef.current || !selectedIncident) return;

    const lookupId = ++lookupIdRef.current;
    const moveTo = (position: [number, number]) => {
      if (lookupId !== lookupIdRef.current || !mapRef.current) return;
      mapRef.current.setZoomAndCenter(17, position, false, 650);
    };
    const fallbackPosition: [number, number] = [selectedIncident.longitude, selectedIncident.latitude];
    const geocoder = geocoderRef.current;

    if (!geocoder) {
      moveTo(fallbackPosition);
      return;
    }

    geocoder.getLocation(`${selectedIncident.title} ${selectedIncident.address}`, (status: string, result: any) => {
      const location = status === 'complete' && result?.info === 'OK' ? result.geocodes?.[0]?.location : null;
      if (location) {
        moveTo([location.lng, location.lat]);
      } else {
        moveTo(fallbackPosition);
      }
    });
  }, [geocoderReady, state, selectedIncident]);

  const fallback = state === 'missing-key'
    ? '公安辖区警情地图暂不可用'
    : state === 'error'
      ? '公安辖区警情地图加载失败，请检查 key、securityJsCode 和网络'
      : '公安辖区警情地图加载中';

  return (
    <div className="amap-shell">
      <div ref={hostRef} className="amap-canvas" />
      {state !== 'ready' && <div className="amap-placeholder">{fallback}</div>}
      {selectedIncident && (
        <div className="amap-selected">
          <strong>{selectedIncident.incidentNo} · {selectedIncident.title}</strong>
          <span>{selectedIncident.jurisdiction} · {selectedIncident.address}</span>
        </div>
      )}
    </div>
  );
}

async function loadAmapSdk() {
  if (window.AMap) return window.AMap;
  if (window.__publicSecurityPlatformAmapLoader) return window.__publicSecurityPlatformAmapLoader;
  const { key, securityJsCode } = getAmapConfig();
  if (!key) throw new Error('Missing AMap key');

  if (securityJsCode) {
    window._AMapSecurityConfig = { securityJsCode };
  }

  window.__publicSecurityPlatformAmapLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}&plugin=AMap.ToolBar,AMap.Scale`;
    script.onload = () => resolve(window.AMap);
    script.onerror = () => reject(new Error('Failed to load AMap JS API'));
    document.head.appendChild(script);
  });

  return window.__publicSecurityPlatformAmapLoader;
}
