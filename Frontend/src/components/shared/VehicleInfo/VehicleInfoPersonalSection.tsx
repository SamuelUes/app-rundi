import React from 'react';
import { View, Text, TextInput } from 'react-native';

interface VehicleInfoPersonalSectionProps {
  isComplete: boolean;
  formState: any;
  sections: Record<string, string>;
  completionText: Record<string, string>;
  fieldLabel: (key: string) => string;
  fieldPlaceholder: (key: string) => string;
  colors: any;
  updateField: (field: any, value: string | boolean) => void;
  styles: any;
}

export function VehicleInfoPersonalSection({
  isComplete,
  formState,
  sections,
  completionText,
  fieldLabel,
  fieldPlaceholder,
  colors,
  updateField,
  styles,
}: VehicleInfoPersonalSectionProps) {
  return (
    <View style={[styles.section, isComplete && styles.completedSection]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sections.personal}</Text>
        {isComplete && (
          <View style={styles.completionBadge}>
            <View style={[styles.completionIcon, styles.iconComplete]} />
            <Text style={styles.completedText}>{completionText.badge}</Text>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('licenseNumber')}</Text>
        <TextInput
          style={[styles.input, formState.licenseNumber ? styles.inputFilled : styles.inputRequired]}
          value={formState.licenseNumber}
          onChangeText={(text) => updateField('licenseNumber', text)}
          placeholder={fieldPlaceholder('licenseNumber')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('licenseExpiry')}</Text>
        <TextInput
          style={styles.input}
          value={formState.licenseExpiry}
          onChangeText={(text) => updateField('licenseExpiry', text)}
          placeholder={fieldPlaceholder('licenseExpiry')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('department')}</Text>
        <TextInput
          style={styles.input}
          value={formState.department}
          onChangeText={(text) => updateField('department', text)}
          placeholder={fieldPlaceholder('department')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('municipality')}</Text>
        <TextInput
          style={styles.input}
          value={formState.municipality}
          onChangeText={(text) => updateField('municipality', text)}
          placeholder={fieldPlaceholder('municipality')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>
    </View>
  );
}
