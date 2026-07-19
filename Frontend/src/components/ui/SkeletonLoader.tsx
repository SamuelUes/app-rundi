import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

/**
 * Componente de Skeleton Loader con animación de pulso
 * Usado para mostrar estados de carga elegantes
 */
export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
};

/**
 * Skeleton para Card de Viaje
 */
export const RideCardSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <SkeletonLoader width={40} height={40} borderRadius={20} />
        <View style={styles.cardHeaderText}>
          <SkeletonLoader width="60%" height={16} />
          <SkeletonLoader width="40%" height={12} style={{ marginTop: 8 }} />
        </View>
      </View>

      <View style={styles.cardBody}>
        <SkeletonLoader width="100%" height={14} />
        <SkeletonLoader width="80%" height={14} style={{ marginTop: 8 }} />
      </View>

      <View style={styles.cardFooter}>
        <SkeletonLoader width={80} height={32} borderRadius={16} />
        <SkeletonLoader width={60} height={20} />
      </View>
    </View>
  );
};

/**
 * Skeleton para Lista de Viajes
 */
export const RideListSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <View>
      {Array.from({ length: count }).map((_, index) => (
        <RideCardSkeleton key={index} />
      ))}
    </View>
  );
};

/**
 * Skeleton para Perfil de Usuario
 */
export const ProfileSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.profileContainer, { backgroundColor: colors.background }]}>
      {/* Avatar */}
      <View style={styles.profileHeader}>
        <SkeletonLoader width={100} height={100} borderRadius={50} />
        <SkeletonLoader width="60%" height={24} style={{ marginTop: 16 }} />
        <SkeletonLoader width="40%" height={16} style={{ marginTop: 8 }} />
      </View>

      {/* Info Cards */}
      <View style={styles.profileCards}>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SkeletonLoader width={40} height={40} borderRadius={20} />
          <SkeletonLoader width="70%" height={16} style={{ marginTop: 12 }} />
          <SkeletonLoader width="50%" height={12} style={{ marginTop: 8 }} />
        </View>
        <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SkeletonLoader width={40} height={40} borderRadius={20} />
          <SkeletonLoader width="70%" height={16} style={{ marginTop: 12 }} />
          <SkeletonLoader width="50%" height={12} style={{ marginTop: 8 }} />
        </View>
      </View>

      {/* List Items */}
      <View style={styles.profileList}>
        {Array.from({ length: 5 }).map((_, index) => (
          <View key={index} style={[styles.listItem, { borderBottomColor: colors.border }]}>
            <SkeletonLoader width={24} height={24} borderRadius={12} />
            <SkeletonLoader width="60%" height={16} style={{ marginLeft: 16 }} />
          </View>
        ))}
      </View>
    </View>
  );
};

/**
 * Skeleton para Mapa
 */
export const MapSkeleton: React.FC = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.mapContainer, { backgroundColor: colors.border }]}>
      <SkeletonLoader width="100%" height={400} borderRadius={0} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  cardBody: {
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileContainer: {
    flex: 1,
    padding: 16,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  profileCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  infoCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  profileList: {
    marginTop: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  mapContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
});
