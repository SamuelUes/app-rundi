import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface DriverOffer {
  driver: {
    id: string;
    name: string;
    rating: number;
    phone: string;
    photoURL?: string;
    vehicle?: {
      make?: string;
      model?: string;
      color?: string;
      plate?: string;
      photos?: string[];
    } | null;
  };
  offeredPrice: number;
  acceptedClientPrice: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: number;
}

interface DriverOfferCardProps {
  offer: DriverOffer;
  estimatedPrice: number;
  clientSuggestedPrice?: number;
  onViewOffer: () => void;
  onAcceptOffer: () => void;
  hasPendingCounterOffer?: boolean;
}

export default function DriverOfferCard({
  offer,
  estimatedPrice,
  clientSuggestedPrice,
  onViewOffer,
  onAcceptOffer,
  hasPendingCounterOffer = false,
}: DriverOfferCardProps) {
  const { colors } = useTheme();

  const { driver, offeredPrice, acceptedClientPrice } = offer;
  const vehicle = driver.vehicle;

  // Calcular ahorro/diferencia
  const difference = estimatedPrice - offeredPrice;
  const savingsText = difference > 0 
    ? `Ahorras C$${difference.toFixed(2)}` 
    : difference < 0 
    ? `C$${Math.abs(difference).toFixed(2)} más` 
    : 'Precio estimado';

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header con foto, nombre y rating */}
      <View style={styles.header}>
        {/* Foto de perfil del conductor */}
        {driver.photoURL ? (
          <Image
            source={{ uri: driver.photoURL }}
            style={styles.driverAvatar}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.driverAvatar, { backgroundColor: colors.primary + '30' }]}>
            <Text style={[styles.driverAvatarText, { color: colors.primary }]}>
              {driver.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        
        <View style={styles.driverInfo}>
          <Text style={[styles.driverName, { color: colors.text }]}>
            {driver.name}
          </Text>
          {driver.rating > 0 && (
            <Text style={[styles.rating, { color: colors.textSecondary }]}>
              ⭐ {driver.rating.toFixed(1)}
            </Text>
          )}
        </View>
      </View>

      {/* Info del vehículo */}
      {vehicle && (vehicle.make || vehicle.model) && (
        <View style={styles.vehicleSection}>
          {/* Foto del vehículo */}
          {vehicle.photos && vehicle.photos.length > 0 && (
            <Image
              source={{ uri: vehicle.photos[0] }}
              style={styles.vehicleImage}
              resizeMode="cover"
            />
          )}
          
          <View style={styles.vehicleInfo}>
            <Text style={[styles.vehicleText, { color: colors.textSecondary }]}>
              🚗 {vehicle.make || (vehicle as any).brand || 'N/A'} {vehicle.model || 'N/A'} • {vehicle.color || 'N/A'}
            </Text>
            {vehicle.plate && (
              <Text style={[styles.plateText, { color: colors.textSecondary }]}>
                📋 Placa: {vehicle.plate}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Precio ofrecido */}
      <View style={styles.priceSection}>
        {acceptedClientPrice ? (
          <View style={styles.acceptedPriceContainer}>
            <Text style={[styles.acceptedLabel, { color: '#4CAF50' }]}>
              ✅ Aceptó tu precio
            </Text>
            <Text style={[styles.priceValue, { color: '#4CAF50' }]}>
              C${offeredPrice}
            </Text>
          </View>
        ) : (
          <View style={styles.offerPriceContainer}>
            <Text style={[styles.offerLabel, { color: colors.textSecondary }]}>
              💰 Ofrece:
            </Text>
            <Text style={[styles.priceValue, { color: '#FF9800' }]}>
              C${offeredPrice}
            </Text>
          </View>
        )}
        <Text style={[styles.savingsText, { color: difference > 0 ? '#4CAF50' : '#FF9800' }]}>
          {savingsText}
        </Text>
      </View>

      {/* Botones de acción */}
      <View style={styles.actions}>
        {acceptedClientPrice ? (
          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: '#4CAF50' }]}
            onPress={onAcceptOffer}
          >
            <Text style={styles.acceptButtonText}>
              🚀 Aceptar y Comenzar Viaje
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.viewButton, { backgroundColor: colors.primary }]}
              onPress={onViewOffer}
            >
              <Text style={styles.viewButtonText}>
                💬 Ver oferta y negociar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAcceptButton, { 
                backgroundColor: hasPendingCounterOffer ? '#9E9E9E' : '#4CAF50' 
              }]}
              onPress={hasPendingCounterOffer ? undefined : onAcceptOffer}
              disabled={hasPendingCounterOffer}
            >
              <Text style={styles.quickAcceptButtonText}>
                {hasPendingCounterOffer ? '⏳ Esperando confirmación' : `✅ Aceptar C$${offeredPrice}`}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  driverAvatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rating: {
    fontSize: 14,
  },
  vehicleSection: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  vehicleImage: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  vehicleText: {
    fontSize: 14,
    marginBottom: 4,
  },
  plateText: {
    fontSize: 13,
  },
  priceSection: {
    marginBottom: 12,
  },
  acceptedPriceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  offerPriceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  acceptedLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  offerLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  savingsText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'right',
  },
  actions: {
    gap: 8,
  },
  viewButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  quickAcceptButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAcceptButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
