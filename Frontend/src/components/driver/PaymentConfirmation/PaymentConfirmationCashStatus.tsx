import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useIsDark } from '../../../stores/themeStore';

interface PaymentConfirmationCashStatusProps {
  clientConfirmed: boolean;
  cashStatusTexts: {
    confirmedTitle: string;
    confirmedSubtitle: string;
    waitingTitle: string;
    waitingSubtitle: string;
  };
  instructionsTexts: {
    title: string;
    text: string;
  };
  colors: any;
  styles: any;
}

export function PaymentConfirmationCashStatus({
  clientConfirmed,
  cashStatusTexts,
  instructionsTexts,
  colors,
  styles,
}: PaymentConfirmationCashStatusProps) {
  const isDark = useIsDark();
  const accent = isDark ? colors.SecondBorder : colors.primary;

  return (
    <>
      {clientConfirmed ? (
        <View style={[styles.statusCard, styles.statusCardSuccess]}>
          <View style={[styles.statusIconWrap, styles.statusIconWrapSuccess]}>
            <MaterialIcons name="check-circle" size={20} color={colors.success} />
          </View>
          <View style={styles.statusBody}>
            <Text style={styles.statusTextSuccess}>{cashStatusTexts.confirmedTitle}</Text>
            <Text style={styles.statusSubtext}>{cashStatusTexts.confirmedSubtitle}</Text>
          </View>
        </View>
      ) : (
        <View style={[styles.statusCard, styles.statusCardWarning]}>
          <View style={[styles.statusIconWrap, styles.statusIconWrapWarning]}>
            <MaterialIcons name="hourglass-top" size={20} color={colors.warning} />
          </View>
          <View style={styles.statusBody}>
            <Text style={styles.statusTextWarning}>{cashStatusTexts.waitingTitle}</Text>
            <Text style={styles.statusSubtext}>{cashStatusTexts.waitingSubtitle}</Text>
          </View>
        </View>
      )}

      <View style={styles.instructionsCard}>
        <View style={styles.instructionsTitleRow}>
          <MaterialIcons name="receipt-long" size={16} color={accent} />
          <Text style={styles.instructionsTitle}>{instructionsTexts.title}</Text>
        </View>
        <Text style={styles.instructionsText}>{instructionsTexts.text}</Text>
      </View>
    </>
  );
}
