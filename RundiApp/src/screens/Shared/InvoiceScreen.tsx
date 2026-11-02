import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Share,
  StyleSheet,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../../config/firebase';
import { getPaymentDetails } from '../../api/payments';
import { getRideDetail, getRideLocations } from '../../api/rides';
import { FS_COL } from '../../constants/firestore';

interface Invoice {
  id: string;
  rideId: string;
  invoiceNumber: string;
  date: Date;
  clientName: string;
  driverName: string;
  vehicleInfo: string;
  origin: { address: string };
  destination: { address: string };
  distance: number;
  duration: number;
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  subtotal: number;
  commission: number;
  commissionPercentage: number;
  tip: number;
  totalAmount: number;
  driverEarnings: number;
  paymentMethod: string;
  paymentStatus: string;
  biometric_authenticated: boolean;
  biometric_type?: string;
  authentication_method?: string;
}

export default function InvoiceScreen({ route, navigation }: any) {
  const { rideId } = route.params;
  const { colors } = useTheme();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInvoice();
  }, [rideId]);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      setError(null);

      console.log('📄 Cargando factura para rideId:', rideId);

      // Pago + viaje + ruta vía API v2; perfiles vía proyecciones Firestore.
      const paymentData = await getPaymentDetails(rideId);
      const rideData = await getRideDetail(rideId);
      const locations = await getRideLocations(rideId).catch(() => []);
      const db = await getFirebaseFirestore();

      const driverId = rideData.driverId;
      const driverData = driverId
        ? (await getDoc(doc(db, FS_COL.driverPublic, driverId))).data() ?? {}
        : {};
      const serviceId = (rideData as any).serviceId ?? (rideData as any).service_id;
      const serviceData = serviceId
        ? (await getDoc(doc(db, FS_COL.services, serviceId))).data() ?? {}
        : {};

      const originLoc = locations.find((l) => l.type === 'origin') ?? locations[0];
      const destinationLoc =
        locations.find((l) => l.type === 'destination') ?? locations[locations.length - 1];

      // Calcular desglose
      const distance = (rideData as any).actualDistance ?? (rideData as any).estimatedDistance ?? 0;
      const duration = (rideData as any).actualDuration ?? (rideData as any).estimatedDuration ?? 0;

      const baseFare = Number((serviceData as any).baseFare ?? (serviceData as any).base_price ?? 0);
      const distanceFare = distance * (Number((serviceData as any).pricePerKm ?? (serviceData as any).price_per_km) || 0);
      const timeFare = (duration / 60) * (Number((serviceData as any).pricePerMinute ?? (serviceData as any).price_per_minute) || 0);
      const subtotal = baseFare + distanceFare + timeFare;
      const commission = paymentData.commission || subtotal * 0.1;
      const driverEarnings = subtotal - commission;
      const commissionRate = Number(
        paymentData.commissionRateApplied ?? (serviceData as any).commissionRate ?? (serviceData as any).commission_rate ?? 0.1,
      );

      // Construir factura
      const invoiceData: Invoice = {
        id: paymentData.id,
        rideId: rideData.id,
        invoiceNumber: `INV-${String(rideData.id).substring(0, 8).toUpperCase()}-${Date.now()}`,
        date: new Date(paymentData.paidAt || (paymentData as any).createdAt || Date.now()),
        clientName: 'Cliente',
        driverName: (driverData as any).displayName || (driverData as any).name || 'Conductor',
        vehicleInfo: `${(driverData as any).vehicle_make || (driverData as any).vehicleMake || 'Vehículo'} ${(driverData as any).vehicle_model || (driverData as any).vehicleModel || ''}`,
        origin: { address: originLoc?.address || 'Origen' },
        destination: { address: destinationLoc?.address || 'Destino' },
        distance,
        duration,
        baseFare,
        distanceFare,
        timeFare,
        subtotal,
        commission,
        commissionPercentage: commissionRate * 100,
        tip: paymentData.tip || 0,
        totalAmount: paymentData.amount || subtotal,
        driverEarnings,
        paymentMethod: paymentData.paymentMethod || 'cash',
        paymentStatus: paymentData.status || 'completed',
        biometric_authenticated: (paymentData as any).biometric_authenticated || false,
        biometric_type: (paymentData as any).biometric_type,
        authentication_method: (paymentData as any).authentication_method,
      };

      console.log('✅ Factura generada correctamente');
      setInvoice(invoiceData);
    } catch (err: any) {
      console.error('❌ Error cargando factura:', err);
      setError(err.message || 'Error al cargar la factura');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!invoice) return;

    try {
      const message = `
FACTURA ${invoice.invoiceNumber}
═════════════════════════════════════
Fecha: ${invoice.date.toLocaleDateString()}

DETALLES DEL VIAJE
Origen: ${invoice.origin.address}
Destino: ${invoice.destination.address}
Distancia: ${invoice.distance.toFixed(1)} km
Duración: ${invoice.duration} min

DESGLOSE DE TARIFA
Tarifa Base: C$${invoice.baseFare.toFixed(2)}
Por km: C$${invoice.distanceFare.toFixed(2)}
Por tiempo: C$${invoice.timeFare.toFixed(2)}
Subtotal: C$${invoice.subtotal.toFixed(2)}

COMISIÓN
Comisión (${invoice.commissionPercentage}%): -C$${invoice.commission.toFixed(2)}

TOTALES
Total: C$${invoice.totalAmount.toFixed(2)}
Ganancias Conductor: C$${invoice.driverEarnings.toFixed(2)}

Método de pago: ${invoice.paymentMethod}
      `;

      await Share.share({
        message,
        title: `Factura ${invoice.invoiceNumber}`,
      });
    } catch (error) {
      console.error('Error compartiendo:', error);
      Alert.alert('Error', 'No se pudo compartir la factura');
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <LoadingIcon size={32} color={colors.primary} />
      </View>
    );
  }

  if (error || !invoice) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>
          {error || 'Error cargando factura'}
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>FACTURA</Text>
        <Text style={[styles.invoiceNumber, { color: colors.textSecondary }]}>
          {invoice.invoiceNumber}
        </Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>
          {invoice.date.toLocaleDateString()} {invoice.date.toLocaleTimeString()}
        </Text>
      </View>

      {/* Detalles del Viaje */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Detalles del Viaje</Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Origen:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{invoice.origin.address}</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Destino:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{invoice.destination.address}</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Distancia:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{invoice.distance.toFixed(1)} km</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Duración:</Text>
          <Text style={[styles.value, { color: colors.text }]}>{invoice.duration} min</Text>
        </View>
      </View>

      {/* Desglose de Tarifa */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Desglose de Tarifa</Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Tarifa Base:</Text>
          <Text style={[styles.value, { color: colors.text }]}>C${invoice.baseFare.toFixed(2)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Por km:</Text>
          <Text style={[styles.value, { color: colors.text }]}>C${invoice.distanceFare.toFixed(2)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Por tiempo:</Text>
          <Text style={[styles.value, { color: colors.text }]}>C${invoice.timeFare.toFixed(2)}</Text>
        </View>

        <View style={[styles.divider, { borderColor: colors.border }]} />

        <View style={styles.row}>
          <Text style={[styles.boldLabel, { color: colors.text }]}>Subtotal:</Text>
          <Text style={[styles.boldValue, { color: colors.text }]}>C${invoice.subtotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Comisión */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Comisión</Text>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Comisión ({invoice.commissionPercentage}%):
          </Text>
          <Text style={[styles.value, { color: '#FF6B6B' }]}>-C${invoice.commission.toFixed(2)}</Text>
        </View>
      </View>

      {/* Totales */}
      <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Totales</Text>

        <View style={styles.row}>
          <Text style={[styles.boldLabel, { color: colors.text }]}>Total:</Text>
          <Text style={[styles.totalValue, { color: '#4CAF50' }]}>C${invoice.totalAmount.toFixed(2)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Ganancias Conductor:</Text>
          <Text style={[styles.value, { color: colors.text }]}>C${invoice.driverEarnings.toFixed(2)}</Text>
        </View>
      </View>

      {/* Autenticación */}
      {invoice.biometric_authenticated && (
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Autenticación</Text>

          <View style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Método:</Text>
            <Text style={[styles.value, { color: colors.text }]}>
              {invoice.authentication_method === 'biometric' ? 'Biometría' : 'SMS'}
            </Text>
          </View>

          {invoice.biometric_type && (
            <View style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Tipo:</Text>
              <Text style={[styles.value, { color: colors.text }]}>
                {invoice.biometric_type === 'fingerprint' ? 'Huella Dactilar' : 'Face ID'}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Botones */}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={handleShare}
      >
        <Text style={styles.buttonText}><MaterialIcons name="share" size={18} color="#fff" /> Compartir Factura</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.primary }]}
        onPress={() => navigation.replace('RateConductor', { rideId })}
      >
        <Text style={styles.buttonText}>Continuar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  invoiceNumber: {
    fontSize: 14,
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
  },
  boldLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  boldValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    marginVertical: 12,
    borderWidth: 1,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
});
