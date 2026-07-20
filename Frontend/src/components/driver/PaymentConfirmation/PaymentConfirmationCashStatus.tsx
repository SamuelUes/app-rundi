import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

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
  styles: any;
}

export function PaymentConfirmationCashStatus({
  clientConfirmed,
  cashStatusTexts,
  instructionsTexts,
  styles,
}: PaymentConfirmationCashStatusProps) {
  return (
    <>
      {clientConfirmed ? (
        <View style={[styles.statusCard, styles.statusCardSuccess]}>
          <MaterialIcons name="check-circle" size={32} color="#4CAF50" />
          <Text style={styles.statusTextSuccess}>{cashStatusTexts.confirmedTitle}</Text>
          <Text style={styles.statusSubtext}>{cashStatusTexts.confirmedSubtitle}</Text>
        </View>
      ) : (
        <View style={[styles.statusCard, styles.statusCardWarning]}>
          <MaterialIcons name="hourglass-empty" size={32} color="#FF9800" />
          <Text style={styles.statusTextWarning}>{cashStatusTexts.waitingTitle}</Text>
          <Text style={styles.statusSubtext}>{cashStatusTexts.waitingSubtitle}</Text>
        </View>
      )}

      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsTitle}>{instructionsTexts.title}</Text>
        <Text style={styles.instructionsText}>{instructionsTexts.text}</Text>
      </View>
    </>
  );
}
