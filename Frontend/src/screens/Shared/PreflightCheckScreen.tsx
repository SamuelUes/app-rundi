import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { checkBackgroundLocationPermission } from '../../services/backgroundLocationService';
import { overlayManager } from '../../native/overlay';
import { ensureActivityRecognitionPermission } from '../../utils/activityPermission';
import alertService from '../../services/alertService';
import { setPreflightResult, PreflightAction, PreflightSummary } from '../../state/preflightStore';
import type { PreflightRole, PreflightRouteConfig, PreflightRegionInfo } from '../../types/preflight';
import proximityService from '../../services/proximityService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import TermsAndConditionsModal, { CURRENT_TERMS_VERSION } from '../../components/TermsAndConditionsModal';

type NavigationLike = {
  replace: (routeName: string, params?: any) => void;
  navigate: (routeName: string, params?: any) => void;
};

const ACTIVE_DRIVER_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const ACTIVE_CLIENT_TRACK_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const CLIENT_WAITING_STATUSES = ['requested', 'searching', 'pending', 'pending_confirmation'];
const PENALTIES_LIMIT_CORDOBAS = 150;

const CRITICAL_CHECKS = ['auth', 'notifications', 'foregroundLocation', 'backgroundLocation', 'overlay'];

const MANAGUA_BOUNDS = {
  north: 12.2,
  south: 12.05,
  east: -86.15,
  west: -86.35,
};

const getLocalRegionFallback = (latitude: number, longitude: number): PreflightRegionInfo => {
  const inBounds =
    latitude >= MANAGUA_BOUNDS.south &&
    latitude <= MANAGUA_BOUNDS.north &&
    longitude >= MANAGUA_BOUNDS.west &&
    longitude <= MANAGUA_BOUNDS.east;

  if (inBounds) {
    return {
      allowed: true,
      serviceAreaId: 'ni-managua',
      areaName: 'Managua',
      message: 'Servicio disponible en Managua (configuración por defecto).',
      reasonCode: 'OK_FALLBACK_LOCAL',
      latitude,
      longitude,
    };
  }

  return {
    allowed: false,
    serviceAreaId: null,
    areaName: undefined,
    message:
      'Por el momento el servicio solo está disponible dentro de las áreas activas (actualmente Managua).',
    reasonCode: 'AREA_NOT_SUPPORTED_LOCAL',
    latitude,
    longitude,
  };
};

const getCheckLabels = (): Record<string, string> => ({
  auth: 'Verificando sesión',
  notifications: 'Verificando notificaciones',
  foregroundLocation: 'Verificando ubicación',
  backgroundLocation: 'Verificando ubicación en segundo plano',
  overlay: 'Verificando permisos de superposición',
  activity: 'Verificando permiso de actividad',
  region: 'Verificando área de servicio',
  pendingPayments: 'Buscando pagos pendientes',
  penalties: 'Verificando comisiones',
  activeRide: 'Buscando viajes activos',
});

const PreflightCheckScreen = ({ navigation, route }: any) => {
  const nav = navigation as NavigationLike;
  const params = (route?.params ?? {}) as PreflightRouteConfig;
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  
  const role = useMemo<PreflightRole>(() => {
    const paramRole = params?.role;
    if (paramRole === 'driver' || paramRole === 'client') {
      return paramRole;
    }
    const rawRole = user?.role ?? 'client';
    return rawRole === 'driver' || rawRole === 'designated_driver' ? 'driver' : 'client';
  }, [params?.role, user?.role]);

  const successRoute = params?.successRoute ?? (role === 'driver' ? 'DriverHome' : 'ClientHome');
  const activeRideRoute = params?.activeRideRoute ?? (role === 'driver' ? 'ActiveRide' : 'RideTracking');
  const pendingPaymentsRoute = params?.pendingPaymentsRoute ?? 'PendingPayments';
  const payCommissionsRoute = params?.payCommissionsRoute ?? (role === 'driver' ? 'PayCommissions' : undefined);
  const rideTrackingRoute = params?.rideTrackingRoute ?? 'RideTracking';

  const [progress, setProgress] = useState(0);
  const [currentCheckLabel, setCurrentCheckLabel] = useState('Iniciando...');
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [canRetry, setCanRetry] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [savingTerms, setSavingTerms] = useState(false);
  
  const progressAnim = useRef(new Animated.Value(0)).current;
  const actionsRef = useRef<PreflightAction[]>([]);
  const checksRunRef = useRef(false);

  const styles = useMemo(() => createStyles(colors), [colors]);

  const animateProgress = useCallback((toValue: number) => {
    Animated.timing(progressAnim, {
      toValue,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progressAnim]);

  const handleTermsIfNeeded = useCallback(async (): Promise<boolean> => {
    try {
      if (!user?.id) {
        return true;
      }

      const profile = await firebaseAuthService.getUserProfile(user.id);
      const existingVersion = (profile as any)?.termsVersion;

      if (existingVersion === CURRENT_TERMS_VERSION) {
        return true;
      }

      setShowTerms(true);
      setTermsChecked(false);
      return false;
    } catch (err: any) {
      console.error('❌ [Preflight] Error obteniendo perfil para términos:', err);

      const message = String(err?.message || '');
      const code = (err && (err as any).code) || '';

      if (
        message.includes('Missing or insufficient permissions') ||
        code === 'permission-denied' ||
        code === 'unauthenticated'
      ) {
        console.warn(
          '⚠️ [Preflight] Sin permisos para leer perfil/términos; permitiendo continuar sin bloqueo',
        );
        // No bloquear el flujo de navegación por falta de permisos en Firestore
        return true;
      }

      if (user?.id) {
        setShowTerms(true);
        setTermsChecked(false);
        return false;
      }
      return true;
    }
  }, [user?.id]);

  const runChecks = useCallback(async () => {
    if (checksRunRef.current) return;
    checksRunRef.current = true;

    console.log(`🔍 [Preflight] Iniciando verificaciones para rol=${role}`);
    
    setProgress(0);
    setError(null);
    setCompleted(false);
    setCanRetry(false);
    actionsRef.current = [];
    animateProgress(0);

    const checkList: string[] = [
      'auth',
      'notifications',
      'foregroundLocation',
      'region',
      ...(role === 'driver' ? ['backgroundLocation'] : []),
      ...(role === 'driver' && Platform.OS === 'android' ? ['overlay'] : []),
      ...(role === 'driver' && Platform.OS === 'android' ? ['activity'] : []),
      'activeRide',
      'pendingPayments',
      ...(role === 'driver' ? ['penalties'] : []),
    ];

    const labels = getCheckLabels();
    const totalChecks = checkList.length;

    let regionInfo: PreflightRegionInfo | undefined;

    for (let i = 0; i < checkList.length; i++) {
      const checkId = checkList[i];
      const isCritical = CRITICAL_CHECKS.includes(checkId);
      
      setCurrentCheckLabel(labels[checkId] || checkId);
      console.log(`🔸 [Preflight] Verificando ${checkId} (${i + 1}/${totalChecks})`);

      try {
        let success = false;
        let action: PreflightAction | undefined;

        switch (checkId) {
          case 'auth':
            success = await checkAuth(user);
            break;
          case 'notifications':
            success = await checkNotifications();
            break;
          case 'foregroundLocation':
            success = await checkForegroundLocation();
            break;
          case 'region': {
            const region = await checkRegionAvailabilityPreflight();
            if (region) {
              regionInfo = region;
            }
            success = true; // No crítico, solo informativo
            break;
          }
          case 'backgroundLocation':
            success = await checkBackgroundLocation();
            break;
          case 'overlay':
            success = await checkOverlay();
            break;
          case 'activity':
            success = await checkActivity();
            break;
          case 'pendingPayments':
            action = await checkPendingPayments(role, user?.id, nav, pendingPaymentsRoute);
            success = true; // No crítico
            break;
          case 'penalties':
            action = await checkPenalties(user?.id, nav, payCommissionsRoute);
            success = true; // No crítico
            break;
          case 'activeRide':
            action = await checkActiveRide(role, user?.id, nav, activeRideRoute, rideTrackingRoute);
            success = true; // No crítico
            break;
        }

        if (action) {
          actionsRef.current.push(action);
        }

        if (!success && isCritical) {
          console.error(`❌ [Preflight] Check crítico falló: ${checkId}`);

          if (checkId === 'auth') {
            console.warn('⚠️ [Preflight] Auth crítico falló, cerrando sesión y volviendo a Login');
            try {
              await logout();
            } catch (logoutError) {
              console.error('❌ [Preflight] Error durante logout tras fallo de auth:', logoutError);
            }
          } else {
            setError(`Error en ${labels[checkId]}: Por favor, verifica y reintenta.`);
            setCanRetry(true);
          }

          checksRunRef.current = false;
          return;
        }

        const newProgress = ((i + 1) / totalChecks) * 100;
        setProgress(newProgress);
        animateProgress(newProgress);

      } catch (err: any) {
        console.error(`❌ [Preflight] Error en check ${checkId}:`, err);
        
        if (isCritical) {
          setError(`Error inesperado: ${err?.message || 'Intenta nuevamente'}`);
          setCanRetry(true);
          checksRunRef.current = false;
          return;
        }
      }
    }

    // ✅ Todos los checks completados
    setProgress(100);
    animateProgress(100);
    setCompleted(true);
    setCurrentCheckLabel('Verificación completada');

    // Guardar resultado en el store
    const summary: PreflightSummary = {
      role,
      timestamp: Date.now(),
      actions: actionsRef.current,
      region: regionInfo,
    };
    setPreflightResult(summary);

    console.log(`✅ [Preflight] Verificaciones completadas. Acciones: ${actionsRef.current.length}`);

    const shouldNavigate = await handleTermsIfNeeded();
    if (shouldNavigate) {
      setTimeout(() => {
        nav.replace(successRoute as any);
      }, 1000);
    }

  }, [role, user, nav, successRoute, activeRideRoute, pendingPaymentsRoute, payCommissionsRoute, rideTrackingRoute, animateProgress, handleTermsIfNeeded]);

  useEffect(() => {
    if (!checksRunRef.current) {
      runChecks();
    }
  }, [runChecks]);

  const handleRetry = useCallback(() => {
    checksRunRef.current = false;
    runChecks();
  }, [runChecks]);

  const handleAcceptTerms = useCallback(async () => {
    if (!user?.id) {
      return;
    }
    if (!termsChecked || savingTerms) {
      return;
    }

    try {
      setSavingTerms(true);
      await firebaseAuthService.updateUserProfile(user.id, {
        termsVersion: CURRENT_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      });
      setShowTerms(false);
      setTimeout(() => {
        nav.replace(successRoute as any);
      }, 300);
    } catch (err: any) {
      console.error('❌ [Preflight] Error guardando aceptación de términos:', err);
      const message = String(err?.message || '');
      const code = err?.code;

      if (
        message.includes('Missing or insufficient permissions') ||
        code === 'permission-denied' ||
        code === 'unauthenticated'
      ) {
        console.warn(
          '⚠️ [Preflight] Sin permisos para guardar términos; continuando sin actualizar perfil',
        );
        setShowTerms(false);
        setTimeout(() => {
          nav.replace(successRoute as any);
        }, 300);
      } else {
        alertService.showErrorAlert(
          'No pudimos guardar tu aceptación de términos. Revisa tu conexión e inténtalo de nuevo.',
        );
      }
    } finally {
      setSavingTerms(false);
    }
  }, [user?.id, termsChecked, savingTerms, nav, successRoute]);

  const handleSkip = useCallback(() => {
    alertService.showInfoAlert(
      'No se puede continuar',
      'Debes completar las verificaciones requeridas antes de usar la aplicación.'
    );
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Preparando tu experiencia</Text>
        <Text style={styles.subtitle}>
          {completed
            ? '¡Todo listo! Redirigiendo...'
            : error
            ? 'Ocurrió un problema'
            : 'Verificamos que todo esté en orden'}
        </Text>

        {/* Barra de progreso */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBackground}>
            <Animated.View
              style={[
                styles.progressBar,
                {
                  width: progressWidth,
                  backgroundColor: error ? '#EF4444' : completed ? '#22C55E' : colors.primary,
                },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {Math.round(progress)}%
          </Text>
        </View>

        {/* Label actual */}
        {!error && !completed && (
          <Text style={styles.currentCheck}>{currentCheckLabel}</Text>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Acciones detectadas */}
        {completed && actionsRef.current.length > 0 && (
          <View style={styles.actionsContainer}>
            <Text style={styles.actionsTitle}>Acciones pendientes detectadas:</Text>
            {actionsRef.current.slice(0, 3).map((action, idx) => (
              <View key={idx} style={styles.actionItem}>
                <Text style={styles.actionBullet}>•</Text>
                <Text style={styles.actionText}>{action.title}</Text>
              </View>
            ))}
            {actionsRef.current.length > 3 && (
              <Text style={styles.actionsMore}>
                +{actionsRef.current.length - 3} más
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Botones */}
      <View style={styles.footer}>
        {canRetry && (
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        )}
      </View>

      <TermsAndConditionsModal
        visible={showTerms}
        saving={savingTerms}
        requireCheck
        checked={termsChecked}
        acceptLabel="Aceptar y continuar"
        onToggleChecked={() => {
          if (!savingTerms) {
            setTermsChecked(!termsChecked);
          }
        }}
        onAccept={handleAcceptTerms}
      />
    </View>
  );
};

// ==================== CHECK FUNCTIONS ====================

async function checkAuth(user: any): Promise<boolean> {
  try {
    if (!user?.id) {
      console.warn('⚠️ [Preflight] Usuario no autenticado en AuthContext');
      return false;
    }

    // 1️⃣ Intentar validar sesión usando React Native Firebase Auth (teléfono SMS, etc.)
    try {
      const { default: rnAuth } = await import('@react-native-firebase/auth');
      const rnUser = rnAuth().currentUser;

      if (rnUser) {
        if (rnUser.uid === user.id) {
          console.log(`✅ [Preflight] Usuario autenticado vía RN Firebase Auth: ${user.id}`);
          return true;
        }

        console.warn(
          '⚠️ [Preflight] Inconsistencia entre AuthContext y RN Firebase Auth:',
          'contextId=',
          user.id,
          'rnUid=',
          rnUser.uid,
        );
        // No retornamos aún: intentaremos validar con Firebase web auth más abajo
      }
    } catch (rnError) {
      console.warn('⚠️ [Preflight] No se pudo verificar sesión con RN Firebase Auth:', rnError);
    }

    // 2️⃣ Fallback: validar usando Firebase Web Auth (config/firebase)
    const { getFirebaseAuth } = await import('../../config/firebase');
    const auth = await getFirebaseAuth();
    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      console.warn('⚠️ [Preflight] No hay sesión Firebase Auth activa');
      return false;
    }

    if (firebaseUser.uid !== user.id) {
      console.warn(
        '⚠️ [Preflight] Inconsistencia entre AuthContext y Firebase Auth:',
        'contextId=',
        user.id,
        'firebaseUid=',
        firebaseUser.uid,
      );
      return false;
    }

    console.log(`✅ [Preflight] Usuario autenticado (context + Firebase web): ${user.id}`);
    return true;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando sesión Firebase Auth:', error);
    return false;
  }
}

async function checkNotifications(): Promise<boolean> {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (permissions.status === 'granted') {
      return true;
    }

    const result = await Notifications.requestPermissionsAsync();
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando notificaciones:', error);
    return false;
  }
}

async function checkRegionAvailabilityPreflight(): Promise<PreflightRegionInfo | null> {
  let latitude: number | null = null;
  let longitude: number | null = null;

  try {
    // Intentar usar la última ubicación conocida para acelerar
    let position = await Location.getLastKnownPositionAsync();
    if (!position) {
      position = await Location.getCurrentPositionAsync({});
    }

    if (!position) {
      console.warn('⚠️ [Preflight] No se pudo obtener ubicación para verificación de región');
      return null;
    }

    latitude = position.coords.latitude;
    longitude = position.coords.longitude;

    const { default: client } = await import('../../api/client');
    const { getFirebaseAuth } = await import('../../config/firebase');

    const auth = await getFirebaseAuth();
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      console.warn('[Preflight] No hay sesión Firebase Auth; omitiendo checkRegionAvailability');
      return null;
    }

    try {
      await firebaseUser.getIdToken(true);
    } catch (tokenError) {
      console.warn('[Preflight] No se pudo refrescar token antes de checkRegionAvailability:', tokenError);
    }

    const response = await client.post('/checkRegionAvailabilityHttp', {
      latitude,
      longitude,
      platform: Platform.OS,
    });

    const data = response.data as any;

    const region: PreflightRegionInfo = {
      allowed: !!data?.allowed,
      serviceAreaId:
        typeof data?.serviceAreaId === 'string' && data.serviceAreaId.trim().length > 0
          ? data.serviceAreaId.trim()
          : null,
      areaName: typeof data?.areaName === 'string' ? data.areaName : undefined,
      message: typeof data?.message === 'string' ? data.message : undefined,
      reasonCode: typeof data?.reasonCode === 'string' ? data.reasonCode : undefined,
      latitude,
      longitude,
    };

    console.log('[Preflight] Región detectada:', region);
    return region;
  } catch (error: any) {
    console.error('❌ [Preflight] Error verificando región (HTTP):', error?.response?.data ?? error);

    if (latitude != null && longitude != null) {
      const region = getLocalRegionFallback(latitude, longitude);
      console.log('[Preflight] Región fallback local:', region);
      return region;
    }

    return null;
  }
}

async function checkForegroundLocation(): Promise<boolean> {
  try {
    const permissions = await Location.getForegroundPermissionsAsync();
    if (permissions.status === 'granted') {
      return true;
    }

    const result = await Location.requestForegroundPermissionsAsync();
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando ubicación foreground:', error);
    return false;
  }
}

async function checkBackgroundLocation(): Promise<boolean> {
  try {
    const granted = await checkBackgroundLocationPermission();
    if (granted) {
      return true;
    }

    const result = await Location.requestBackgroundPermissionsAsync();
    return result.status === 'granted';
  } catch (error) {
    console.error('❌ [Preflight] Error verificando ubicación background:', error);
    return false;
  }
}

async function checkOverlay(): Promise<boolean> {
  try {
    const hasPermission = await overlayManager.hasPermission();
    if (hasPermission) {
      // Si ya tiene permiso, asegurar que la preferencia esté guardada
      await proximityService.setOverlayEnabled(true);
      console.log('✅ [Preflight] Overlay permission ya activo, preferencia guardada');
      return true;
    }

    // Sin permiso → reflejar estado en la preferencia antes de solicitarlo
    await proximityService.setOverlayEnabled(false);
    console.log('⚠️ [Preflight] Overlay permission faltante, solicitando al usuario');

    const granted = await overlayManager.requestPermission();
    if (granted) {
      // Guardar preferencia cuando el usuario acepta el permiso
      await proximityService.setOverlayEnabled(true);
      console.log('✅ [Preflight] Overlay permission concedido, preferencia guardada');
    } else {
      console.warn('❌ [Preflight] Overlay permission denegado por el usuario');
    }
    return granted;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando permiso de overlay:', error);
    return false;
  }
}

async function checkActivity(): Promise<boolean> {
  try {
    const granted = await ensureActivityRecognitionPermission();
    return granted;
  } catch (error) {
    console.error('❌ [Preflight] Error verificando permiso de actividad:', error);
    return false;
  }
}

async function checkPendingPayments(
  role: PreflightRole,
  userId: string | undefined,
  navigation: NavigationLike,
  pendingPaymentsRoute: string,
): Promise<PreflightAction | undefined> {
  if (!userId) return undefined;

  try {
    if (role === 'driver') {
      return await checkDriverPendingPayments(userId, navigation, pendingPaymentsRoute);
    } else {
      return await checkClientPendingPayments(navigation, pendingPaymentsRoute);
    }
  } catch (error) {
    console.error('❌ [Preflight] Error verificando pagos pendientes:', error);
    return undefined;
  }
}

async function checkDriverPendingPayments(
  driverId: string,
  navigation: NavigationLike,
  pendingPaymentsRoute: string,
): Promise<PreflightAction | undefined> {
  try {
    const { initializeFirebase } = await import('../../config/firebase');
    const { getDatabase, ref, get } = await import('firebase/database');
    const { app } = await initializeFirebase();
    if (!app) {
      console.warn('⚠️ [Preflight] Firebase no inicializado');
      return undefined;
    }

    const db = getDatabase(app);
    
    // Intentar leer paymentStatus, pero manejar errores de permisos
    let data: any;
    try {
      const snapshot = await get(ref(db, 'paymentStatus'));
      data = snapshot.val();
    } catch (permError: any) {
      // Si es un error de permisos, simplemente retornar undefined sin crashear
      if (permError?.message?.includes('permission') || permError?.message?.includes('Permission')) {
        console.warn('⚠️ [Preflight] Sin permisos para leer paymentStatus, saltando verificación');
        return undefined;
      }
      // Si es otro tipo de error, re-lanzarlo
      throw permError;
    }

    if (!data) return undefined;

    const pendingItems = Object.entries<any>(data)
      .filter(([, payment]) => {
        if (!payment) return false;
        if (payment.driverId !== driverId) return false;
        const status = String(payment.status || '').toLowerCase();
        const isPending = ['pending', 'pending_confirmation', 'in_progress'].includes(status);
        const requiresClientPayment = payment.requiresClientPayment === true || payment.chargeTarget === 'client';
        return isPending && requiresClientPayment;
      })
      .map(([rideId, payment]) => ({ rideId, ...payment }));

    if (pendingItems.length === 0) return undefined;

    const firstPayment = pendingItems[0];
    return {
      type: 'pending_payment',
      title: pendingItems.length === 1 ? 'Pago pendiente' : `${pendingItems.length} pagos pendientes`,
      subtitle: 'Confirma los pagos pendientes',
      ctaLabel: 'Ver pagos',
      routeName: 'PaymentConfirmation',
      routeParams: {
        rideId: firstPayment.rideId,
        amount: firstPayment.finalAmount,
        method: firstPayment.method,
        fromHome: true,
      },
      metadata: { count: pendingItems.length },
    };
  } catch (error: any) {
    console.warn('⚠️ [Preflight] No se pudo verificar pagos pendientes (driver):', error?.message || error);
    return undefined;
  }
}

async function checkClientPendingPayments(
  navigation: NavigationLike,
  pendingPaymentsRoute: string,
): Promise<PreflightAction | undefined> {
  try {
    const { getFirebaseFunctions } = await import('../../config/firebase');
    const { httpsCallable } = await import('firebase/functions');
    const functions = await getFirebaseFunctions();
    const getPendingPaymentsFn = httpsCallable(functions, 'getPendingPayments');
    const result = await getPendingPaymentsFn();
    const data = result.data as any;

    if (data?.success && data?.count > 0) {
      const count = Number(data.count) || 0;
      const totalDebt = Number(data.totalDebt) || 0;
      return {
        type: 'pending_payment',
        title: `${count} pago${count === 1 ? '' : 's'} pendiente${count === 1 ? '' : 's'}`,
        subtitle: `Total: C$${totalDebt.toFixed(2)}`,
        ctaLabel: 'Pagar ahora',
        routeName: pendingPaymentsRoute,
        metadata: { count, totalDebt },
      };
    }

    return undefined;
  } catch (error) {
    console.error('❌ [Preflight] Error obteniendo pagos pendientes (client):', error);
    return undefined;
  }
}

async function checkPenalties(
  driverId: string | undefined,
  navigation: NavigationLike,
  payCommissionsRoute?: string,
): Promise<PreflightAction | undefined> {
  if (!driverId || !payCommissionsRoute) return undefined;

  try {
    const { initializeFirebase } = await import('../../config/firebase');
    const { getDatabase, ref, get } = await import('firebase/database');
    const { app } = await initializeFirebase();
    if (!app) return undefined;

    const db = getDatabase(app);
    const snapshot = await get(ref(db, `driverPenalties/${driverId}/summary`));
    const data = snapshot.val();

    const pendingAmount = Number(
      data?.pendingAmount ??
        data?.paymentCommissionPendingAmount ??
        data?.paymentPendingAmount ??
        data?.penaltyPendingAmount ??
        0,
    );

    const pendingCount = Number(
      data?.pendingCount ??
        data?.paymentCommissionPendingCount ??
        data?.paymentPendingCount ??
        data?.penaltyPendingCount ??
        0,
    );

    if (!pendingAmount || pendingAmount <= 0) return undefined;

    return {
      type: 'penalties',
      title: 'Comisiones pendientes',
      subtitle: `C$${pendingAmount.toFixed(2)} pendientes`,
      ctaLabel: 'Pagar comisiones',
      routeName: payCommissionsRoute,
      metadata: { pendingAmount, pendingCount, blocking: pendingAmount > PENALTIES_LIMIT_CORDOBAS },
    };
  } catch (error) {
    console.error('❌ [Preflight] Error verificando comisiones:', error);
    return undefined;
  }
}

async function checkActiveRide(
  role: PreflightRole,
  userId: string | undefined,
  navigation: NavigationLike,
  activeRideRoute: string,
  rideTrackingRoute: string,
): Promise<PreflightAction | undefined> {
  if (!userId) return undefined;

  try {
    const { initializeFirebase } = await import('../../config/firebase');
    const { getDatabase, ref, get } = await import('firebase/database');
    const { app } = await initializeFirebase();
    if (!app) return undefined;

    const db = getDatabase(app);
    const snapshot = await get(ref(db, 'activeRides'));
    const data = snapshot.val();

    if (!data) return undefined;

    const entry = Object.entries<any>(data).find(([, ride]) => {
      if (!ride) return false;
      if (role === 'driver') {
        if (ride.driverId !== userId) return false;
        const status = String(ride.status || '').toLowerCase();
        return ACTIVE_DRIVER_STATUSES.includes(status);
      }
      if (ride.clientId !== userId) return false;
      const status = String(ride.status || '').toLowerCase();
      return ACTIVE_CLIENT_TRACK_STATUSES.includes(status) || CLIENT_WAITING_STATUSES.includes(status);
    });

    if (!entry) return undefined;

    const [rideId, rideData] = entry;
    const status = String(rideData.status || '');

    if (role === 'driver') {
      return {
        type: 'active_ride',
        title: 'Viaje activo',
        subtitle: `Estado: ${status}`,
        ctaLabel: 'Ir al viaje',
        routeName: activeRideRoute,
        routeParams: {
          rideId,
          clientId: rideData.clientId,
          origin: rideData.origin,
          destination: rideData.destination,
          estimatedFare: rideData.finalFare || rideData.estimatedPrice,
        },
        metadata: { rideId, status },
      };
    }

    // Client
    if (CLIENT_WAITING_STATUSES.includes(status.toLowerCase())) {
      return {
        type: 'active_ride',
        title: 'Viaje en espera',
        subtitle: `Estado: ${status}`,
        ctaLabel: 'Ver viaje',
        routeName: 'RideConfirmation',
        routeParams: { rideId },
        metadata: { rideId, status },
      };
    }

    return {
      type: 'active_ride',
      title: 'Viaje en curso',
      subtitle: `Estado: ${status}`,
      ctaLabel: 'Ver viaje',
      routeName: rideTrackingRoute,
      routeParams: {
        rideId,
        driverId: rideData.driverId,
        driverName: rideData.driver?.name,
        vehiclePlate: rideData.vehicle?.plate,
        vehicleBrand: rideData.vehicle?.brand,
        vehicleModel: rideData.vehicle?.model,
        estimatedFare: rideData.estimatedPrice,
      },
      metadata: { rideId, status },
    };
  } catch (error) {
    console.error('❌ [Preflight] Error verificando viaje activo:', error);
    return undefined;
  }
}

// ==================== STYLES ====================

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingTop: 60,
      paddingBottom: 32,
    },
    content: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary || 'rgba(255,255,255,0.7)',
      marginBottom: 48,
      textAlign: 'center',
      lineHeight: 22,
    },
    progressContainer: {
      width: '100%',
      alignItems: 'center',
      marginBottom: 24,
    },
    progressBackground: {
      width: '100%',
      height: 8,
      backgroundColor: colors.card,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 12,
    },
    progressBar: {
      height: '100%',
      borderRadius: 4,
    },
    progressText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    currentCheck: {
      fontSize: 14,
      color: colors.textSecondary || 'rgba(255,255,255,0.65)',
      marginTop: 16,
      textAlign: 'center',
    },
    errorContainer: {
      marginTop: 24,
      padding: 20,
      backgroundColor: 'rgba(239, 68, 68, 0.1)',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#EF4444',
      alignItems: 'center',
    },
    errorIcon: {
      fontSize: 32,
      marginBottom: 8,
    },
    errorText: {
      fontSize: 14,
      color: '#EF4444',
      textAlign: 'center',
      lineHeight: 20,
    },
    actionsContainer: {
      marginTop: 32,
      width: '100%',
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
    },
    actionsTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    actionItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
    },
    actionBullet: {
      fontSize: 14,
      color: colors.primary,
      marginRight: 8,
      marginTop: 2,
    },
    actionText: {
      flex: 1,
      fontSize: 14,
      color: colors.textSecondary || 'rgba(255,255,255,0.75)',
      lineHeight: 20,
    },
    actionsMore: {
      fontSize: 12,
      color: colors.textSecondary || 'rgba(255,255,255,0.5)',
      fontStyle: 'italic',
      marginTop: 4,
    },
    footer: {
      paddingTop: 24,
    },
    retryButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      borderRadius: 16,
      alignItems: 'center',
    },
    retryButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0F172A',
    },
    termsOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    termsCard: {
      width: '100%',
      maxHeight: '80%',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    termsTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
      textAlign: 'center',
    },
    termsContent: {
      maxHeight: 260,
      marginBottom: 16,
    },
    termsText: {
      fontSize: 13,
      color: colors.textSecondary || 'rgba(255,255,255,0.75)',
      lineHeight: 18,
    },
    termsCheckboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    termsCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: colors.background,
    },
    termsCheckboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    termsCheckboxIcon: {
      fontSize: 14,
      color: '#0F172A',
      fontWeight: '700',
    },
    termsCheckboxLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    termsAcceptButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    termsAcceptButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#0F172A',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
  });

export default PreflightCheckScreen;
