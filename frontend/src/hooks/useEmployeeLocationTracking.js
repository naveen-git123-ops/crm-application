import { useCallback, useEffect, useRef } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
const API = `${BACKEND_URL}/api`;

const MIN_INTERVAL_MS = 3 * 60 * 1000;
const MIN_DISTANCE_M = 35;
const PUNCH_CHECK_MS = 60 * 1000;
const MAX_ACCURACY_M = 120;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem('token')}` };
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const r = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

/**
 * While punched in, sends GPS breadcrumbs to the server (browser must stay open for web).
 */
export function useEmployeeLocationTracking({ enabled, employeeId }) {
  const watchIdRef = useRef(null);
  const punchedInRef = useRef(false);
  const lastSentRef = useRef({ lat: null, lng: null, at: 0 });
  const sendingRef = useRef(false);

  const stopWatch = useCallback(() => {
    if (watchIdRef.current != null && navigator.geolocation?.clearWatch) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const sendPoint = useCallback(
    async (coords) => {
      if (!employeeId || sendingRef.current) return;
      const lat = coords.latitude;
      const lng = coords.longitude;
      const accuracy = coords.accuracy;
      const now = Date.now();

      if (accuracy != null && accuracy > MAX_ACCURACY_M) return;

      const last = lastSentRef.current;
      if (last.lat != null && last.lng != null) {
        const dist = distanceMeters(last.lat, last.lng, lat, lng);
        if (now - last.at < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) return;
      }

      sendingRef.current = true;
      try {
        await axios.post(
          `${API}/attendance/location-log`,
          {
            latitude: lat,
            longitude: lng,
            accuracy: accuracy ?? null,
            speed: coords.speed ?? null,
            heading: coords.heading ?? null,
            source: 'web',
          },
          { headers: authHeaders() },
        );
        lastSentRef.current = { lat, lng, at: now };
      } catch (err) {
        const status = err.response?.status;
        if (status === 400) {
          punchedInRef.current = false;
          stopWatch();
        }
      } finally {
        sendingRef.current = false;
      }
    },
    [employeeId, stopWatch],
  );

  const onPosition = useCallback(
    (pos) => {
      if (!punchedInRef.current) return;
      sendPoint({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
      });
    },
    [sendPoint],
  );

  const startWatch = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current != null) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      onPosition,
      () => {},
      { enableHighAccuracy: true, maximumAge: 90_000, timeout: 25_000 },
    );
    navigator.geolocation.getCurrentPosition(onPosition, () => {}, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
  }, [onPosition]);

  const refreshPunchStatus = useCallback(async () => {
    if (!enabled || !employeeId) {
      punchedInRef.current = false;
      stopWatch();
      return;
    }
    try {
      const res = await axios.get(`${API}/attendance/today`, { headers: authHeaders() });
      const punched = res.data?.is_punched_in === true;
      punchedInRef.current = punched;
      if (punched) {
        startWatch();
      } else {
        stopWatch();
      }
    } catch {
      punchedInRef.current = false;
      stopWatch();
    }
  }, [enabled, employeeId, startWatch, stopWatch]);

  useEffect(() => {
    if (!enabled || !employeeId) {
      stopWatch();
      return undefined;
    }

    refreshPunchStatus();
    const interval = setInterval(refreshPunchStatus, PUNCH_CHECK_MS);

    const onPunchEvent = (e) => {
      if (typeof e.detail?.isPunchedIn === 'boolean') {
        punchedInRef.current = e.detail.isPunchedIn;
        if (e.detail.isPunchedIn) startWatch();
        else stopWatch();
      } else {
        refreshPunchStatus();
      }
    };
    window.addEventListener('crm-attendance-changed', onPunchEvent);

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPunchStatus();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('crm-attendance-changed', onPunchEvent);
      document.removeEventListener('visibilitychange', onVisible);
      stopWatch();
    };
  }, [enabled, employeeId, refreshPunchStatus, startWatch, stopWatch]);
}
