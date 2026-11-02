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
  colors: any;
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
  colors,
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
        iconName="check-circle"
        size="large"
        style={styles.confirmButton}
      />

      <AnimatedButton
        title={buttonTexts.reportIssue}
        onPress={onReportIssue}
        variant="outline"
        color={colors.warning}
        disabled={confirming || switching}
        iconName="report-problem"
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
