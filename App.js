import './splashInit';
import * as SplashScreen from 'expo-splash-screen';
import React, { useState, useEffect, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { navigationRef } from './navigation/navigationRef';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from '@expo-google-fonts/inter/useFonts';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import { getToken, fetchWithAuth } from './lib/api';
import { prefetchBannersForTargets, syncBannerCacheVersion } from './lib/services';
import { registerForPushNotificationsAsync } from './lib/pushNotifications';
import { SPLASH_SCREEN_IMAGE } from './lib/splashScreenImage';
import { useNotificationTapHandler } from './lib/NotificationTapHandler';
import AuthStack from './navigation/AuthStack';
import RootStack from './navigation/RootStack';

const NAV_STATE_KEY = '@mineral_bridge_nav_state';
const BOOT_BG = '#000000';
const APP_BOOT_FALLBACK_MS = 6000;
const PROFILE_REQUEST_TIMEOUT_MS = 5000;

SplashScreen.preventAutoHideAsync().catch(() => {});

class AppErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error?.message || 'Unknown error'}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function LoggedInShell({ children }) {
  useNotificationTapHandler();
  return children;
}

// Existing user = has name + email (and OTP already verified = has token). They go straight into the app when they open it.
// New user = has token but no name/email → must complete onboarding (name, email, photo, national ID, selfie) before app access.
function isOnboardingComplete(me) {
  if (!me) return false;
  const hasName = !!(me.name && String(me.name).trim());
  const hasEmail = !!(me.email && String(me.email).trim());
  return hasName && hasEmail;
}

function withTimeout(promise, timeoutMs, timeoutMessage = 'Request timed out') {
  let timerId;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timerId));
}

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [initialNavState, setInitialNavState] = useState(null);
  /** False while reading NAV_STATE_KEY for a logged-in session (avoids hanging on Strict Mode cancel + null initialNavState). */
  const [navRestoreSettled, setNavRestoreSettled] = useState(true);

  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const hideNativeSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Keep boot deterministic on slow networks/storage.
    const t = setTimeout(() => {
      if (!cancelled) {
        setIsLoggedIn(false);
        setNeedsOnboarding(false);
      }
    }, APP_BOOT_FALLBACK_MS);
    getToken()
      .then(async (token) => {
        if (cancelled || !token) {
          if (!cancelled) { setIsLoggedIn(false); setNeedsOnboarding(false); }
          return;
        }
        // Optimistic startup: unlock app shell immediately for known sessions.
        if (!cancelled) {
          setIsLoggedIn(true);
          setNeedsOnboarding(false);
        }
        try {
          const res = await withTimeout(
            fetchWithAuth('/api/users/me'),
            PROFILE_REQUEST_TIMEOUT_MS,
            'Profile bootstrap timed out'
          );
          if (cancelled) return;
          if (!res.ok) {
            // Only force logout for auth failures. Keep optimistic session on transient server/network issues.
            if (res.status === 401 || res.status === 403) {
              setIsLoggedIn(false);
              setNeedsOnboarding(false);
            }
            return;
          }
          const me = await res.json();
          if (isOnboardingComplete(me)) {
            setIsLoggedIn(true);
            setNeedsOnboarding(false);
          } else {
            setIsLoggedIn(false);
            setNeedsOnboarding(true);
          }
        } catch (_) {
          // Keep optimistic login state on transient bootstrap failures/timeouts.
        }
      })
      .catch(() => { if (!cancelled) setIsLoggedIn(false); setNeedsOnboarding(false); })
      .finally(() => clearTimeout(t));
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  useEffect(() => {
    if (!isLoggedIn && !needsOnboarding) {
      setInitialNavState(null);
      setNavRestoreSettled(true);
      return;
    }
    if (!isLoggedIn) return;
    let cancelled = false;
    setNavRestoreSettled(false);
    AsyncStorage.getItem(NAV_STATE_KEY)
      .then((s) => {
        if (cancelled) return;
        try {
          setInitialNavState(s ? JSON.parse(s) : undefined);
        } catch {
          setInitialNavState(undefined);
        }
      })
      .catch(() => { if (!cancelled) setInitialNavState(undefined); })
      .finally(() => {
        if (!cancelled) setNavRestoreSettled(true);
      });
    return () => { cancelled = true; };
  }, [isLoggedIn, needsOnboarding]);

  useEffect(() => {
    if (isLoggedIn) registerForPushNotificationsAsync().catch(() => {});
  }, [isLoggedIn]);

  useEffect(() => {
    // Warm banners/images as early as possible to speed first screen paints.
    (async () => {
      await syncBannerCacheVersion().catch(() => false);
      await prefetchBannersForTargets(['splash', 'onboarding', 'home', 'buy', 'sell', 'artisanal']).catch(() => {});
    })();
  }, []);

  const onNavStateChange = (state) => {
    if (state) AsyncStorage.setItem(NAV_STATE_KEY, JSON.stringify(state)).catch(() => {});
  };

  const fontsReady = fontsLoaded || !!fontError;
  const waitingNavRestore = isLoggedIn === true && !navRestoreSettled;
  const appReady = fontsReady && isLoggedIn !== null && !waitingNavRestore;

  useEffect(() => {
    if (!appReady) return;
    hideNativeSplash();
  }, [appReady, hideNativeSplash]);

  if (!appReady) {
    return (
      <View style={styles.bootPlaceholder}>
        <Image
          source={SPLASH_SCREEN_IMAGE}
          cachePolicy="memory-disk"
          style={styles.bootSplashImage}
          contentFit="contain"
          contentPosition="center"
          priority="high"
          transition={0}
        />
      </View>
    );
  }

  const onAuthComplete = () => {
    setInitialNavState(undefined);
    setNeedsOnboarding(false);
    setIsLoggedIn(true);
  };

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          initialState={initialNavState ?? undefined}
          onStateChange={onNavStateChange}
        >
          {isLoggedIn ? (
            <LoggedInShell>
                <RootStack onLogout={() => { setIsLoggedIn(false); setNeedsOnboarding(false); }} />
            </LoggedInShell>
          ) : (
            <AuthStack
              onAuthComplete={onAuthComplete}
              onboardingResume={needsOnboarding}
            />
          )}
        </NavigationContainer>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  bootPlaceholder: { flex: 1, backgroundColor: BOOT_BG },
  bootSplashImage: { ...StyleSheet.absoluteFillObject },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#eff6ff', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 14, color: '#64748b' },
  errorTitle: { fontSize: 18, fontWeight: '700', color: '#1F2A44', marginBottom: 8 },
  errorText: { fontSize: 14, color: '#64748b', textAlign: 'center' },
});
