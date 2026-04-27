import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = '@mineral_bridge_token';
const FRIENDLY_NETWORK_ERROR = 'Unable to connect. Please check your internet connection and try again.';

// Dev fallback only. Prefer configuring `EXPO_PUBLIC_API_BASE_URL` in `.env` (or EAS env),
// or `extra.apiUrl` in app config for built apps.
const DEFAULT_API_BASE_URL = 'http://localhost:5000';

export function getApiBase() {
  // Standard Expo env var support (works with `.env` + Metro).
  const envRaw =
    (typeof process !== 'undefined' && process?.env && process.env.EXPO_PUBLIC_API_BASE_URL) ||
    (typeof process !== 'undefined' && process?.env && process.env.REACT_APP_API_BASE_URL);
  if (envRaw !== undefined && envRaw !== null) {
    const s = String(envRaw).trim().replace(/\/$/, '');
    if (s) return s;
    return '';
  }

  // `extra` can appear in different places depending on build type (dev, prebuild/bare, EAS, etc).
  const extra =
    Constants.expoConfig?.extra ||
    Constants.manifest?.extra ||
    Constants.manifest2?.extra;

  const raw = extra?.apiUrl;
  if (raw !== undefined && raw !== null) {
    const s = String(raw).trim().replace(/\/$/, '');
    if (s) return s;
    return '';
  }
  return DEFAULT_API_BASE_URL;
}

const STARTUP_API_BASE = getApiBase();
if (!STARTUP_API_BASE || /(?:192\.168\.|localhost|127\.0\.0\.1)/i.test(STARTUP_API_BASE)) {
  console.warn('WARNING: API base URL is a local address. Login will fail on real devices.');
}

function getFetchTimeout() {
  const extra =
    Constants.expoConfig?.extra ||
    Constants.manifest?.extra ||
    Constants.manifest2?.extra;
  const fromConfig = extra?.apiTimeout;
  if (typeof fromConfig === 'number' && fromConfig >= 5000) return fromConfig;
  return 60000; // 60s default (was 30s; many networks need longer)
}

/** True when api base is a host real devices usually cannot reach (LAN / loopback). */
export function isApiBaseLikelyUnreachableFromPhones() {
  const base = getApiBase();
  if (!base) return false;
  try {
    const u = new URL(base.includes('://') ? base : `http://${base}`);
    const host = (u.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') return true;
    if (host === '10.0.2.2') return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return false;
  }
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setToken(token) {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function fetchWithAuth(path, options = {}) {
  const base = getApiBase();
  if (!base) {
    throw new Error(FRIENDLY_NETWORK_ERROR);
  }
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const { signal: optsSignal, ...restOpts } = options;
  const controller = new AbortController();
  const timeoutMs = getFetchTimeout();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = optsSignal || controller.signal;
  try {
    const res = await fetch(`${base}${path}`, { ...restOpts, headers, signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(FRIENDLY_NETWORK_ERROR);
    }
    const msg = err?.message || '';
    if (msg.includes('Network request failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error(FRIENDLY_NETWORK_ERROR);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Unauthenticated JSON fetch (login / OTP). Same timeout and network diagnostics as fetchWithAuth. */
export async function fetchPublic(path, options = {}) {
  const base = getApiBase();
  if (!base) {
    throw new Error(FRIENDLY_NETWORK_ERROR);
  }
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  const { signal: optsSignal, ...restOpts } = options;
  const controller = new AbortController();
  const timeoutMs = getFetchTimeout();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = optsSignal || controller.signal;
  try {
    const res = await fetch(`${base}${path}`, { ...restOpts, headers, signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(FRIENDLY_NETWORK_ERROR);
    }
    const msg = err?.message || '';
    if (msg.includes('Network request failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      throw new Error(FRIENDLY_NETWORK_ERROR);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

const FETCH_MULTIPART_TIMEOUT_MS = 60000; // 60s for uploads

/**
 * Send a multipart/form-data request with auth.
 * Pass a FormData instance as `body`. Content-Type is set automatically by fetch.
 */
export async function fetchMultipart(path, formData, method = 'POST') {
  const base = getApiBase();
  if (!base) {
    throw new Error(
      'API base URL is not configured for this build. Set EXPO_PUBLIC_API_BASE_URL (https://…) in EAS Environment Variables or eas.json env for this profile, then rebuild.'
    );
  }
  const token = await getToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_MULTIPART_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}${path}`, { method, headers, body: formData, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Upload timed out. Please check your connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
