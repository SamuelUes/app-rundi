import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import ridesService from '../../services/ridesService';

export default function RideDetailsScreen({ navigation, route }: any) {
  const { rideId } = route.params;
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [ride, setRide] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRideDetails();
  }, [rideId]);

  const loadRideDetails = async () => {
    try {
      setLoading(true);
      const rideData = await ridesService.getRideDetails(rideId);
      if (rideData) {
        setRide(rideData);
      }
    } catch (error) {
      console.error('Error loading ride details:', error);
      Alert.alert('Error', 'No se pudieron cargar los detalles del viaje');
    } finally {
      setLoading(false);
    }
  };

  // Helper: Convertir cualquier valor a string seguro
  const safeString = (value: any, fallback: string = 'N/A'): string => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return fallback;
    if (value === '') return fallback;
    return String(value);
  };

  // Helper: Formatear fecha
  const formatDateTime = (dateString: any): string => {
    if (!dateString || typeof dateString === 'object') return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'N/A';
      return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  // Helper: Formatear duración
  const formatDuration = (seconds: any): string => {
    const sec = parseInt(String(seconds || 0));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  // Helper: Obtener color de estado
  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'canceled': return '#F44336';
      case 'in_progress': return '#FF9800';
      case 'accepted': return '#2196F3';
      default: return colors.textSecondary;
    }
  };

  // Helper: Obtener texto de estado
  const getStatusText = (status: string): string => {
    switch (status) {
      case 'completed': return 'Completado';
      case 'canceled': return 'Cancelado';
      case 'in_progress': return 'En Progreso';
      case 'accepted': return 'Aceptado';
      case 'requested': return 'Solicitado';
      default: return safeString(status);
    }
  };

  // Helper: Obtener color de estado de pago
  const getPaymentStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return '#4CAF50';
      case 'pending': return '#FF9800';
      case 'failed': return '#F44336';
      case 'no_payment_data': return '#757575';
      default: return colors.textSecondary;
    }
  };

  // Helper: Obtener texto de estado de pago
  const getPaymentStatusText = (status: string): string => {
    switch (status) {
      case 'completed': return 'Pagado';
      case 'pending': return 'Pendiente';
      case 'failed': return 'Fallido';
      case 'no_payment_data': return 'Sin datos de pago';
      default: return safeString(status);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando detalles...</Text>
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>❌</Text>
        <Text style={styles.errorTitle}>Viaje no encontrado</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadRideDetails}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isDriver = user?.role === 'driver';
  
  // Convertir distancia de forma segura
  const distanceKm = (() => {
    try {
      if (ride.estimatedDistance && !isNaN(Number(ride.estimatedDistance))) {
        return (Number(ride.estimatedDistance) / 1000).toFixed(1);
      }
      return '0.0';
    } catch {
      return '0.0';
    }
  })();
  
  // Calcular precio final de forma segura
  const getFinalPrice = (): number => {
    // Intentar obtener de finalFare primero
    if (ride.finalFare) {
      return typeof ride.finalFare === 'string' 
        ? parseFloat(ride.finalFare) 
        : ride.finalFare;
    }
    
    // Si no, usar estimatedPrice
    if (ride.estimatedPrice) {
      return typeof ride.estimatedPrice === 'string'
        ? parseFloat(ride.estimatedPrice)
        : ride.estimatedPrice;
    }
    
    // Si hay payment, usar amount
    if (ride.payment?.amount) {
      return ride.payment.amount;
    }
    
    return 0;
  };
  
  const finalPrice = getFinalPrice();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Detalles del Viaje</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(safeString(ride.status)) }]}>
            <Text style={styles.statusText}>{getStatusText(safeString(ride.status))}</Text>
          </View>
        </View>
        <Text style={styles.rideId}>
          ID: {typeof ride.id === 'string' ? ride.id.slice(-8) : safeString(ride.id)}
        </Text>
      </View>

      {/* Ruta */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 Ruta</Text>
        <View style={styles.card}>
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔵</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Origen</Text>
              <Text style={styles.locationText}>{safeString(ride.originAddress)}</Text>
            </View>
          </View>
          
          <View style={styles.routeLine} />
          
          <View style={styles.locationRow}>
            <Text style={styles.locationIcon}>🔴</Text>
            <View style={styles.locationInfo}>
              <Text style={styles.locationLabel}>Destino</Text>
              <Text style={styles.locationText}>{safeString(ride.destinationAddress)}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Información del Viaje */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚗 Información del Viaje</Text>
        <View style={styles.card}>
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Distancia</Text>
              <Text style={styles.infoValue}>{distanceKm} km</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Duración</Text>
              <Text style={styles.infoValue}>{formatDuration(ride.estimatedDuration)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Precio Final</Text>
              <Text style={styles.infoValue}>C${finalPrice.toFixed(2)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Pasajeros</Text>
              <Text style={styles.infoValue}>{safeString(ride.passengers || 1)}</Text>
            </View>
          </View>
          
          {ride.notes && typeof ride.notes === 'string' && ride.notes.trim() !== '' ? (
            <View style={styles.notesBox}>
              <Text style={styles.notesLabel}>📝 Notas:</Text>
              <Text style={styles.notesText}>{ride.notes}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Información de Cliente/Conductor */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{isDriver ? '👤 Cliente' : '🚗 Conductor'}</Text>
        <View style={styles.card}>
          {isDriver ? (
            ride.client && typeof ride.client === 'object' ? (
              <View>
                <Text style={styles.personName}>{safeString(ride.client.name, 'Usuario')}</Text>
                <Text style={styles.personDetail}>{safeString(ride.client.email)}</Text>
                {ride.client.phone && typeof ride.client.phone !== 'object' ? (
                  <Text style={styles.personDetail}>{safeString(ride.client.phone)}</Text>
                ) : null}
              </View>
            ) : (
              <Text style={styles.personName}>Sin información del cliente</Text>
            )
          ) : (
            ride.driver && typeof ride.driver === 'object' ? (
              <View>
                <Text style={styles.personName}>{safeString(ride.driver.name, 'Conductor')}</Text>
                <Text style={styles.personDetail}>{safeString(ride.driver.email)}</Text>
                {ride.driver.phone && typeof ride.driver.phone !== 'object' ? (
                  <Text style={styles.personDetail}>{safeString(ride.driver.phone)}</Text>
                ) : null}
                {ride.driver.licenseNumber && typeof ride.driver.licenseNumber !== 'object' ? (
                  <Text style={styles.personDetail}>
                    Licencia: {safeString(ride.driver.licenseNumber)}
                  </Text>
                ) : null}
                {ride.driver.rating && parseFloat(String(ride.driver.rating)) > 0 ? (
                  <View style={styles.ratingRow}>
                    <Text style={styles.ratingStars}>
                      {'⭐'.repeat(Math.round(parseFloat(String(ride.driver.rating))))}
                    </Text>
                    <Text style={styles.ratingValue}>
                      {parseFloat(String(ride.driver.rating)).toFixed(1)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.personName}>Sin información del conductor</Text>
            )
          )}
        </View>
      </View>

      {/* Vehículo (solo clientes) */}
      {!isDriver && ride.vehicle && typeof ride.vehicle === 'object' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🚙 Vehículo</Text>
          <View style={styles.card}>
            <Text style={styles.vehicleName}>
              {safeString(ride.vehicle.brand)} {safeString(ride.vehicle.model)} ({safeString(ride.vehicle.year)})
            </Text>
            <Text style={styles.vehicleDetail}>
              {safeString(ride.vehicle.color)} • {safeString(ride.vehicle.plate)}
            </Text>
            {ride.vehicle.registrationNumber && typeof ride.vehicle.registrationNumber !== 'object' ? (
              <Text style={styles.vehicleDetail}>
                Matrícula: {safeString(ride.vehicle.registrationNumber)}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Fechas */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📅 Cronología</Text>
        <View style={styles.card}>
          {ride.requestedAt && typeof ride.requestedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Solicitado</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.requestedAt)}</Text>
            </View>
          ) : null}
          {ride.acceptedAt && typeof ride.acceptedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Aceptado</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.acceptedAt)}</Text>
            </View>
          ) : null}
          {ride.startedAt && typeof ride.startedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Iniciado</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.startedAt)}</Text>
            </View>
          ) : null}
          {ride.completedAt && typeof ride.completedAt !== 'object' ? (
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>Completado</Text>
              <Text style={styles.dateValue}>{formatDateTime(ride.completedAt)}</Text>
            </View>
          ) : null}
          {ride.canceledAt && typeof ride.canceledAt !== 'object' ? (
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Cancelado</Text>
                {ride.cancelReason && typeof ride.cancelReason === 'string' ? (
                  <Text style={styles.cancelReason}>
                    Razón: {ride.cancelReason}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.dateValue}>{formatDateTime(ride.canceledAt)}</Text>
            </View>
          ) : null}
          {(!ride.canceledAt || typeof ride.canceledAt === 'object') && 
           ride.cancelReason && typeof ride.cancelReason === 'string' ? (
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>Cancelado</Text>
                <Text style={styles.cancelReason}>
                  Razón: {ride.cancelReason}
                </Text>
              </View>
              <Text style={styles.dateValue}>N/A</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Información de Pagos */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 Información de Pagos</Text>
        <View style={styles.card}>
          {/* Precio Calculado por el Sistema */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Precio Calculado</Text>
            <Text style={styles.priceValue}>
              C${finalPrice.toFixed(2)}
            </Text>
          </View>

          {/* Precio Sugerido por Cliente */}
          {ride.clientSuggestedPrice ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>💡 Precio Sugerido (Cliente)</Text>
              <Text style={[styles.priceValue, { color: '#FF9800' }]}>
                C${parseFloat(String(ride.clientSuggestedPrice)).toFixed(2)}
              </Text>
            </View>
          ) : null}

          {/* Contraoferta del Conductor */}
          {ride.driverOfferedPrice ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>🚗 Contraoferta (Conductor)</Text>
              <Text style={[styles.priceValue, { color: '#2196F3' }]}>
                C${parseFloat(String(ride.driverOfferedPrice)).toFixed(2)}
              </Text>
            </View>
          ) : null}

          {/* Precio Final Acordado */}
          {ride.finalFare ? (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>✅ Precio Final Acordado</Text>
              <Text style={[styles.priceValue, { color: '#4CAF50', fontWeight: '700' }]}>
                C${parseFloat(String(ride.finalFare)).toFixed(2)}
              </Text>
            </View>
          ) : null}
          
          <View style={styles.priceDivider} />

          {/* Estado del Pago */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Estado del Pago</Text>
            <Text style={[styles.priceValue, { color: ride.payment ? getPaymentStatusColor(ride.payment.status) : colors.textSecondary }]}>
              {ride.payment ? getPaymentStatusText(ride.payment.status) : 'Sin datos de pago'}
            </Text>
          </View>
          
          {/* Comisión - Calcular si no existe */}
          {(() => {
            // Obtener precio final de forma segura
            let finalFareNum = 0;
            if (ride.finalFare) {
              finalFareNum = typeof ride.finalFare === 'string' 
                ? parseFloat(ride.finalFare) 
                : ride.finalFare;
            } else if (ride.estimatedPrice) {
              finalFareNum = typeof ride.estimatedPrice === 'string'
                ? parseFloat(ride.estimatedPrice)
                : ride.estimatedPrice;
            }
            
            // Validar que sea un número válido
            if (isNaN(finalFareNum) || finalFareNum === 0) {
              return null; // No mostrar si no hay precio válido
            }
            
            const rideType = ride.rideType || 'normal';
            const commissionRate = rideType === 'designated_driver' ? 0.15 : 0.10;
            
            // Convertir commission a número de forma segura
            let commission = 0;
            if (ride.payment?.commission) {
              commission = typeof ride.payment.commission === 'string'
                ? parseFloat(ride.payment.commission)
                : ride.payment.commission;
            } else {
              commission = finalFareNum * commissionRate;
            }
            
            // Convertir tip a número de forma segura
            let tip = 0;
            if (ride.payment?.tip) {
              tip = typeof ride.payment.tip === 'string'
                ? parseFloat(ride.payment.tip)
                : ride.payment.tip;
            }
            
            // Calcular netAmount (validar que todos sean números)
            const netAmount = finalFareNum - commission + tip;
            
            // Validar que netAmount sea un número válido
            if (isNaN(netAmount)) {
              console.error('❌ netAmount es NaN:', { finalFareNum, commission, tip });
              return null;
            }
            
            return (
              <>
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>
                    Comisión ({Math.round(commissionRate * 100)}%)
                  </Text>
                  <Text style={[styles.priceValue, { color: '#F44336' }]}>
                    -C${commission.toFixed(2)}
                  </Text>
                </View>
                
                {/* Propina */}
                {tip > 0 ? (
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Propina</Text>
                    <Text style={[styles.priceValue, { color: '#4CAF50' }]}>
                      C${tip.toFixed(2)}
                    </Text>
                  </View>
                ) : null}
                
                {/* Pago Final al Conductor */}
                <View style={[styles.priceRow, styles.finalPriceRow]}>
                  <Text style={styles.finalPriceLabel}>💵 Pago Final al Conductor</Text>
                  <Text style={styles.finalPriceValue}>
                    C${netAmount.toFixed(2)}
                  </Text>
                </View>
              </>
            );
          })()}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: 20,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    backgroundColor: colors.card,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  rideId: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  locationIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  locationInfo: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  locationText: {
    fontSize: 14,
    color: colors.text,
  },
  routeLine: {
    width: 2,
    height: 30,
    backgroundColor: colors.border,
    marginLeft: 9,
    marginVertical: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  infoItem: {
    width: '50%',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  notesBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.surface || colors.background,
    borderRadius: 8,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: colors.text,
  },
  personName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  personDetail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  ratingStars: {
    fontSize: 16,
    marginRight: 4,
  },
  ratingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  vehicleName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  vehicleDetail: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  dateValue: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cancelReason: {
    fontSize: 12,
    color: '#F44336',
    fontStyle: 'italic',
    marginTop: 4,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  priceLabel: {
    fontSize: 14,
    color: colors.text,
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  priceDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  finalPriceRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 12,
  },
  finalPriceLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  finalPriceValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
});
