import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export const CURRENT_TERMS_VERSION = '2025-11-29';

interface TermsAndConditionsModalProps {
  visible: boolean;
  saving?: boolean;
  requireCheck?: boolean;
  checked?: boolean;
  acceptLabel?: string;
  onToggleChecked?: () => void;
  onAccept?: () => void;
  onRequestClose?: () => void;
}

const TermsAndConditionsModal: React.FC<TermsAndConditionsModalProps> = ({
  visible,
  saving = false,
  requireCheck = false,
  checked = false,
  acceptLabel = 'Aceptar',
  onToggleChecked,
  onAccept,
  onRequestClose,
}) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!visible) {
    return null;
  }

  const isChecked = requireCheck ? !!checked : true;
  const disabled = saving || !isChecked;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.title}>Términos y condiciones</Text>
        <Text style={styles.version}>Versión {CURRENT_TERMS_VERSION}</Text>
        <ScrollView style={styles.content}>
          <Text style={styles.text}>
            Contrato de Términos y Condiciones

            Términos y Condiciones del Servicio Conductor Designado
            1. Definición del Servicio. Driveangel proporciona un conductor designado que se desplaza hasta la ubicación del Cliente para conducir el vehículo de propiedad del Cliente hasta un destino acordado. El Conductor de Driveangel actúa como agente independiente del Cliente durante la prestación del servicio.
            2. Responsabilidad del Cliente. El Cliente declara ser el propietario legítimo del vehículo o tener su permiso expreso para su uso. El Cliente garantiza que el vehículo cuenta con un seguro de responsabilidad civil vigente que cubre la conducción por parte de terceros con permiso. El Cliente es responsable de verificar que no quedan objetos personales de valor en el vehículo al finalizar el servicio.
            3. Exoneración y Limitación de Responsabilidad.
            a. Objetos Personales. Driveangel no se responsabiliza por la pérdida, daño o robo de cualquier objeto personal que no esté debidamente detallado en el acta de objetos que se levantará al inicio del servicio. El Cliente asume todo el riesgo sobre sus pertenencias.
            b. Daños al Vehículo. Driveangel responderá únicamente por los daños al vehículo que sean consecuencia directa de una negligencia grave o dolo demostrable de su Conductor. Quedan excluidos los daños por uso normal o preexistentes.
            c. Accidentes. En caso de accidente, la responsabilidad se determinará conforme a la legislación de seguros aplicable. Los conductores afiliados a la plataforma mantienen una póliza de responsabilidad civil, pero la cobertura primaria recae sobre el seguro del vehículo del Cliente.
            4. Aceptación de Riesgo. El Cliente reconoce que el servicio se presta mientras se encuentra en estado de ebriedad y, en consecuencia, exonera a Driveangel de cualquier reclamación que pudiera derivarse de su estado, siempre que Driveangel haya cumplido con el servicio de forma diligente.
            5. Protección de Datos. El Cliente consiente el tratamiento de sus datos personales para la gestión del servicio, conforme a nuestra Política de Privacidad.
          </Text>
        </ScrollView>

        {requireCheck && (
          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={onToggleChecked}
            disabled={saving}
          >
            <View
              style={[
                styles.checkbox,
                checked && styles.checkboxChecked,
              ]}
            >
              {checked && <Text style={styles.checkboxIcon}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              He leído y acepto los términos y condiciones
            </Text>
          </TouchableOpacity>
        )}

        {onAccept && (
          <TouchableOpacity
            style={[styles.acceptButton, disabled && styles.buttonDisabled]}
            onPress={onAccept}
            disabled={disabled}
          >
            <Text style={styles.acceptButtonText}>
              {saving ? 'Guardando...' : acceptLabel}
            </Text>
          </TouchableOpacity>
        )}

        {onRequestClose && !requireCheck && (
          <TouchableOpacity
            style={styles.closeLink}
            onPress={onRequestClose}
            disabled={saving}
          >
          {/* <Text style={styles.closeLinkText}>Cerrar</Text> */}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxHeight: '80%',
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
      textAlign: 'center',
    },
    version: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 12,
      textAlign: 'center',
    },
    content: {
      maxHeight: 260,
      marginBottom: 16,
    },
    text: {
      fontSize: 13,
      color: colors.textSecondary || 'rgba(255,255,255,0.75)',
      lineHeight: 18,
    },
    checkboxRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      backgroundColor: colors.background,
    },
    checkboxChecked: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    checkboxIcon: {
      fontSize: 14,
      color: '#0F172A',
      fontWeight: '700',
    },
    checkboxLabel: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
    },
    acceptButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    acceptButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#0F172A',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    closeLink: {
      marginTop: 12,
      alignItems: 'center',
    },
    closeLinkText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });

export default TermsAndConditionsModal;
