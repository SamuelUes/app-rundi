import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface RatingDisplayProps {
  rating: number;
  totalRatings?: number;
  size?: 'small' | 'medium' | 'large';
  showCount?: boolean;
  color?: string;
}

export const RatingDisplay: React.FC<RatingDisplayProps> = ({
  rating,
  totalRatings,
  size = 'medium',
  showCount = true,
  color,
}) => {
  const fontSize = size === 'small' ? 12 : size === 'medium' ? 14 : 16;
  const starSize = size === 'small' ? 14 : size === 'medium' ? 16 : 20;

  const displayRating = rating > 0 ? rating.toFixed(1) : 'Nuevo';
  const textColor = color || '#000';

  return (
    <View style={styles.container}>
      <Text style={[styles.star, { fontSize: starSize }]}>⭐</Text>
      <Text style={[styles.rating, { fontSize, color: textColor }]}>
        {displayRating}
      </Text>
      {showCount && totalRatings !== undefined && totalRatings > 0 && (
        <Text style={[styles.count, { fontSize: fontSize - 2 }]}>
          ({totalRatings})
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  star: {
    lineHeight: 20,
  },
  rating: {
    fontWeight: '600',
  },
  count: {
    color: '#666',
  },
});
