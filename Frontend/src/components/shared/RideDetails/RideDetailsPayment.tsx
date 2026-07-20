import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface RideDetailsPaymentProps {
  ride: any;
  finalPrice: number;
  formatCurrency: (amount: number) => string;
  getPaymentStatusColor: (status: string) => string;
  getPaymentStatusText: (status: string) => string;
  colors: any;
  t: TFunction;
  styles: any;
}

export function RideDetailsPayment({
  ride,
  finalPrice,
  formatCurrency,
  getPaymentStatusColor,
  getPaymentStatusText,
  colors,
  t,
  styles,
}: RideDetailsPaymentProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.payment.title')}</Text>
      <View style={styles.card}>
        {/* Precio Calculado por el Sistema */}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.calculated')}</Text>
          <Text style={styles.priceValue}>{formatCurrency(finalPrice)}</Text>
        </View>

        {/* Precio Sugerido por Cliente */}
        {ride.clientSuggestedPrice ? (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.clientSuggested')}</Text>
            <Text style={[styles.priceValue, { color: '#FF9800' }]}>
              {formatCurrency(parseFloat(String(ride.clientSuggestedPrice)))}
            </Text>
          </View>
        ) : null}

        {/* Contraoferta del Conductor */}
        {ride.driverOfferedPrice ? (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.driverOffered')}</Text>
            <Text style={[styles.priceValue, { color: '#2196F3' }]}>
              {formatCurrency(parseFloat(String(ride.driverOfferedPrice)))}
            </Text>
          </View>
        ) : null}

        {/* Precio Final Acordado */}
        {ride.finalFare ? (
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.finalAgreed')}</Text>
            <Text style={[styles.priceValue, { color: '#4CAF50', fontWeight: '700' }]}>
              {formatCurrency(parseFloat(String(ride.finalFare)))}
            </Text>
          </View>
        ) : null}

        <View style={styles.priceDivider} />

        {/* Estado del Pago */}
        <View style={styles.priceRow}>
          <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.status')}</Text>
          <Text style={[styles.priceValue, { color: ride.payment ? getPaymentStatusColor(ride.payment.status) : colors.textSecondary }]}>
            {ride.payment
              ? getPaymentStatusText(ride.payment.status)
              : t('shared.rideDetail.sections.payment.noPayment')}
          </Text>
        </View>

        {/* Comisión - Calcular si no existe */}
        {(() => {
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

          if (isNaN(finalFareNum) || finalFareNum === 0) {
            return null;
          }

          const rideType = ride.rideType || 'normal';
          const commissionRate = rideType === 'designated_driver' ? 0.25 : 0.11;

          let commission = 0;
          if (ride.payment?.commission) {
            commission = typeof ride.payment.commission === 'string'
              ? parseFloat(ride.payment.commission)
              : ride.payment.commission;
          } else {
            commission = finalFareNum * commissionRate;
          }

          let tip = 0;
          if (ride.payment?.tip) {
            tip = typeof ride.payment.tip === 'string'
              ? parseFloat(ride.payment.tip)
              : ride.payment.tip;
          }

          const netAmount = finalFareNum - commission + tip;

          if (isNaN(netAmount)) {
            console.error('❌ netAmount es NaN:', { finalFareNum, commission, tip });
            return null;
          }

          return (
            <>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>
                  {t('shared.rideDetail.sections.payment.commission', {
                    rate: Math.round(commissionRate * 100),
                  })}
                </Text>
                <Text style={[styles.priceValue, { color: '#F44336' }]}>
                  -{formatCurrency(commission)}
                </Text>
              </View>

              {tip > 0 ? (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>{t('shared.rideDetail.sections.payment.tip')}</Text>
                  <Text style={[styles.priceValue, { color: '#4CAF50' }]}>
                    {formatCurrency(tip)}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.priceRow, styles.finalPriceRow]}>
                <Text style={styles.finalPriceLabel}>{t('shared.rideDetail.sections.payment.driverPayout')}</Text>
                <Text style={styles.finalPriceValue}>
                  {formatCurrency(netAmount)}
                </Text>
              </View>
            </>
          );
        })()}
      </View>
    </View>
  );
}
