import React from 'react';
import { AnimatedButton } from '../../ui/AnimatedButton';
import SupportChatShortcut from '../../shared/SupportChatShortcut';

interface PaymentConfirmationActionsProps {
  rideId: string;
  buttonTexts: {
    confirmCash: string;
    switchToCard: string;
    switchToCash: string;
    reportIssue: string;
    generateCode: string;
  };
  confirming: boolean;
  switching: boolean;
  onConfirmCash: () => void;
  onReportIssue: () => void;
  t: any;
  styles: any;
}

export function PaymentConfirmationActions({
  rideId,
  buttonTexts,
  confirming,
  switching,
  onConfirmCash,
  onReportIssue,
  t,
  styles,
}: PaymentConfirmationActionsProps) {
  return (
    <>
      <AnimatedButton
        title={buttonTexts.confirmCash}
        onPress={onConfirmCash}
        loading={confirming}
        disabled={confirming || switching}
        style={styles.confirmButton}
      />

      <AnimatedButton
        title={buttonTexts.reportIssue}
        onPress={onReportIssue}
        variant="outline"
        disabled={confirming || switching}
        style={styles.reportButton}
      />

      <SupportChatShortcut
        style={{ marginTop: 16 }}
        rideId={rideId}
        initialCategory="payment"
        initialTitle={t('driver.paymentConfirmation.support.title')}
        label={t('driver.paymentConfirmation.support.label')}
        description={t('driver.paymentConfirmation.support.description')}
      />
    </>
  );
}
