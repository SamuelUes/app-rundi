import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../ui/LoadingIcon';
import { useTheme } from '../../context/ThemeContext';

type PreflightBiometricPhase = 'scanning' | 'pin_fallback' | 'success' | 'failed';

type PreflightBiometricPromptProps = {
  visible: boolean;
  title: string;
  subtitle: string;
  attemptText: string;
  phase: PreflightBiometricPhase;
};

const PreflightBiometricPrompt = ({
  visible,
  title,
  subtitle,
  attemptText,
  phase,
}: PreflightBiometricPromptProps) => {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          {phase === 'success' ? (
            <MaterialIcons name="check-circle" size={48} color="#4CAF50" style={styles.icon} />
          ) : phase === 'failed' ? (
            <MaterialIcons name="warning" size={48} color="#FF9800" style={styles.icon} />
          ) : (
            <LoadingIcon icon="fingerprint" size={40} color={colors.primary} animation="pulse" style={styles.spinner} />
          )}

          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
          <Text style={[styles.attempt, { color: colors.primary }]}>{attemptText}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 22,
    alignItems: 'center',
  },
  spinner: {
    marginBottom: 14,
  },
  icon: {
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  attempt: {
    marginTop: 14,
    fontSize: 13,
    fontWeight: '600',
  },
});

export default PreflightBiometricPrompt;
