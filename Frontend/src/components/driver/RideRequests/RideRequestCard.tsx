import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface RideRequest {
  id: string;
  client: {
    name: string;
    rating: number;
    phone: string;
  };
  origin: {
    lat: number;
    lng: number;
    address: string;
  };
  destination: {
    lat: number;
    lng: number;
    address: string;
  };
  estimatedDistance: number;
  estimatedDuration: number;
  estimatedPrice: number;
  clientSuggestedPrice?: number;
  passengers?: number;
  rideType: string;
  createdAt: string;
  clientVehicle?: {
    make?: string;
    model?: string;
    color?: string;
    plate?: string;
    photos?: string[];
  };
  extraDestinations?: Array<{
    lat: number;
    lng: number;
    address: string;
  }>;
  waypointsCount?: number;
  hasMultipleDestinations?: boolean;
}

interface RideRequestCardProps {
  item: RideRequest;
  distanceKm: string;
  durationMin: number;
  timeAgo: string;
  hasSuggestedPrice: boolean;
  accepting: boolean;
  colors: any;
  onSelect: (ride: RideRequest) => void;
  onAccept: (ride: RideRequest) => void;
  onOffer: (ride: RideRequest) => void;
  styles: any;
}

export function RideRequestCard({
  item,
  distanceKm,
  durationMin,
  timeAgo,
  hasSuggestedPrice,
  accepting,
  colors,
  onSelect,
  onAccept,
  onOffer,
  styles,
}: RideRequestCardProps) {
  return (
    <TouchableOpacity
      style={styles.rideCard}
      onPress={() => onSelect(item)}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.clientSection}>
          <View style={styles.clientAvatar}>
            <Text style={styles.clientAvatarText}>
              {item.client.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.clientInfo}>
            <Text style={styles.clientName}>{item.client.name}</Text>
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingText}>{item.client.rating.toFixed(1)}</Text>
              <Text style={styles.timeText}> • {timeAgo}</Text>
            </View>
          </View>
        </View>
        <View style={styles.priceSection}>
          <Text style={styles.priceLabel}>Tarifa</Text>
          <Text style={styles.priceValue}>C${item.estimatedPrice}</Text>
          {hasSuggestedPrice && (
            <Text style={styles.suggestedPrice}>
              Cliente ofrece: C${item.clientSuggestedPrice}
            </Text>
          )}
        </View>
      </View>

      {/* Distancia desde conductor */}
      <View style={styles.distanceBadge}>
        <Text style={styles.distanceBadgeText}><MaterialIcons name="place" size={14} color={colors.textSecondary} /> ~{distanceKm} km de ti</Text>
      </View>

      {/* Ruta */}
      <View style={styles.routeContainer}>
        <View style={styles.routePoint}>
          <MaterialIcons name="circle" size={16} color="#2196F3" />
          <View style={styles.routeDetails}>
            <Text style={styles.routeLabel}>RECOGER EN</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>
              {item.origin.address}
            </Text>
          </View>
        </View>

        <View style={styles.routeLine} />

        {item.extraDestinations && item.extraDestinations.length > 0 && (
          <>
            {item.extraDestinations.map((stop: any, index: number) => (
              <View key={`waypoint-${index}`}>
                <View style={styles.routePoint}>
                  <MaterialIcons name="adjust" size={16} color="#FFC107" />
                  <View style={styles.routeDetails}>
                    <Text style={styles.routeLabel}>PARADA {index + 1}</Text>
                    <Text style={styles.routeAddress} numberOfLines={2}>
                      {stop.address}
                    </Text>
                  </View>
                </View>
                <View style={styles.routeLine} />
              </View>
            ))}
          </>
        )}

        <View style={styles.routePoint}>
          <MaterialIcons name="place" size={16} color="#F44336" />
          <View style={styles.routeDetails}>
            <Text style={styles.routeLabel}>DEJAR EN</Text>
            <Text style={styles.routeAddress} numberOfLines={2}>
              {item.destination.address}
            </Text>
          </View>
        </View>
      </View>

      {/* Info del viaje */}
      <View style={styles.tripInfo}>
        <View style={styles.tripInfoItem}>
          <MaterialIcons name="straighten" size={20} color={colors.textSecondary} />
          <Text style={styles.tripInfoText}>{distanceKm} km</Text>
        </View>
        <View style={styles.tripInfoDivider} />
        <View style={styles.tripInfoItem}>
          <MaterialIcons name="schedule" size={20} color={colors.textSecondary} />
          <Text style={styles.tripInfoText}>{durationMin} min</Text>
        </View>
        <View style={styles.tripInfoDivider} />
        <View style={styles.tripInfoItem}>
          <MaterialIcons name="people" size={20} color={colors.textSecondary} />
          <Text style={styles.tripInfoText}>{item.passengers || 1} pax</Text>
        </View>
        <View style={styles.tripInfoDivider} />
        <View style={styles.tripInfoItem}>
          <MaterialIcons name={item.rideType === 'designated_driver' ? 'directions-car' : 'local-taxi'} size={20} color={colors.textSecondary} />
          <Text style={styles.tripInfoText}>
            {item.rideType === 'designated_driver' ? 'C.D.' : 'Normal'}
          </Text>
        </View>
      </View>

      {/* Foto del vehículo del cliente - Solo para conductor designado */}
      {item.rideType === 'designated_driver' && item.clientVehicle?.photos && item.clientVehicle.photos.length > 0 && (
        <View style={styles.clientVehicleContainer}>
          <Text style={styles.clientVehicleTitle}><MaterialIcons name="directions-car" size={18} color={colors.text} /> Vehículo del Cliente</Text>
          <View style={styles.clientVehicleContent}>
            <Image
              source={{ uri: item.clientVehicle.photos[0] }}
              style={styles.clientVehicleImage}
              resizeMode="cover"
            />
            <View style={styles.clientVehicleInfo}>
              <Text style={styles.clientVehicleText}>
                {item.clientVehicle.make || 'N/A'} {item.clientVehicle.model || 'N/A'}
              </Text>
              <Text style={styles.clientVehicleText}>
                {item.clientVehicle.color || 'N/A'}
              </Text>
              {item.clientVehicle.plate && (
                <Text style={styles.clientVehiclePlate}>
                  <MaterialIcons name="assignment" size={14} color={colors.textSecondary} /> {item.clientVehicle.plate}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}

      {/* Botones de acción */}
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.acceptButton}
          onPress={() => onAccept(item)}
          disabled={accepting}
        >
          <Text style={styles.acceptButtonText}>
            <MaterialIcons name="check" size={18} color="#fff" /> Aceptar C${item.estimatedPrice}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.offerButton}
          onPress={() => onOffer(item)}
          disabled={accepting}
        >
          <Text style={styles.offerButtonText}><MaterialIcons name="payments" size={18} color={colors.primary} /> Ofrecer Tarifa</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export type { RideRequest };
