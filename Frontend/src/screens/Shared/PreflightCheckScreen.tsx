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
import type { PreflightRole, PreflightRouteConfig } from '../../types/preflight';
import proximityService from '../../services/proximityService';

type NavigationLike = {
  replace: (routeName: string, params?: any) => void;
  navigate: (routeName: string, params?: any) => void;
};

const ACTIVE_DRIVER_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const ACTIVE_CLIENT_TRACK_STATUSES = ['accepted', 'driver_on_route', 'driver_arrived', 'in_progress'];
const CLIENT_WAITING_STATUSES = ['requested', 'searching', 'pending', 'pending_confirmation'];
const PENALTIES_LIMIT_CORDOBAS = 150;

const CRITICAL_CHECKS = ['auth', 'notifications', 'foregroundLocation', 'backgroundLocation', 'overlay'];

const getCheckLabels = (): Record<string, string> => ({
  auth: 'Verificando sesión',
  notifications: 'Verificando notificaciones',
  foregroundLocation: 'Verificando ubicación',
  backgroundLocation: 'Verificando ubicación en segundo plano',
  overlay: 'Verificando permisos de superposición',
  activity: 'Verificando permiso de actividad',
  pendingPayments: 'Buscando pagos pendientes',
  penalties: 'Verificando comisiones',
  activeRide: 'Buscando viajes activos',
});

const PreflightCheckScreen = ({ navigation, route }: any) => {
  const nav = navigation as NavigationLike;
  const params = (route?.params ?? {}) as PreflightRouteConfig;
  const { user } = useAuth();
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
      ...(role === 'driver' ? ['backgroundLocation'] : []),
      ...(role === 'driver' && Platform.OS === 'android' ? ['overlay'] : []),
      ...(role === 'driver' && Platform.OS === 'android' ? ['activity'] : []),
      'pendingPayments',
      ...(role === 'driver' ? ['penalties'] : []),
      'activeRide',
    ];

    const labels = getCheckLabels();
    const totalChecks = checkList.length;

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
          setError(`Error en ${labels[checkId]}: Por favor, verifica y reintenta.`);
          setCanRetry(true);
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
    };
    setPreflightResult(summary);

    console.log(`✅ [Preflight] Verificaciones completadas. Acciones: ${actionsRef.current.length}`);

    // Auto-navegar después de 1 segundo
    setTimeout(() => {
      nav.replace(successRoute as any);
    }, 1000);

  }, [role, user, nav, successRoute, activeRideRoute, pendingPaymentsRoute, payCommissionsRoute, rideTrackingRoute, animateProgress]);

  useEffect(() => {
    if (!checksRunRef.current) {
      runChecks();
    }
  }, [runChecks]);

  const handleRetry = useCallback(() => {
    checksRunRef.current = false;
    runChecks();
  }, [runChecks]);

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
    </View>
  );
};

// ==================== CHECK FUNCTIONS ====================

async function checkAuth(user: any): Promise<boolean> {
  if (!user?.id) {
    console.warn('⚠️ [Preflight] Usuario no autenticado');
    return false;
  }
  console.log(`✅ [Preflight] Usuario autenticado: ${user.id}`);
  return true;
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
  });

export default PreflightCheckScreen;
