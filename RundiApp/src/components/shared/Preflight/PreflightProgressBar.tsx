import React from 'react';
import { View, Text, Animated } from 'react-native';

interface PreflightProgressBarProps {
  progress: number;
  progressWidth: Animated.AnimatedInterpolation<string>;
  error: string | null;
  completed: boolean;
  currentCheckLabel: string;
  colors: any;
  styles: any;
}

export function PreflightProgressBar({
  progress,
  progressWidth,
  error,
  completed,
  currentCheckLabel,
  colors,
  styles,
}: PreflightProgressBarProps) {
  return (
    <>
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

      {!error && !completed && (
        <Text style={styles.currentCheck}>{currentCheckLabel}</Text>
      )}
    </>
  );
}
