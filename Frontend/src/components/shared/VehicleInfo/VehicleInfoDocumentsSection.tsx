import React from 'react';
import { View, Text, TextInput } from 'react-native';

interface VehicleInfoDocumentsSectionProps {
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

export function VehicleInfoDocumentsSection({
  isComplete,
  formState,
  sections,
  completionText,
  fieldLabel,
  fieldPlaceholder,
  colors,
  updateField,
  styles,
}: VehicleInfoDocumentsSectionProps) {
  const fields = [
    'registrationNumber',
    'registrationExpiry',
    'insuranceNumber',
    'insuranceCompany',
    'insuranceExpiry',
    'insuranceStartDate',
  ];

  return (
    <View style={[styles.section, isComplete && styles.completedSection]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sections.documents}</Text>
        {isComplete && (
          <View style={styles.completionBadge}>
            <View style={[styles.completionIcon, styles.iconComplete]} />
            <Text style={styles.completedText}>{completionText.badge}</Text>
          </View>
        )}
      </View>

      {fields.map((key) => (
        <View style={styles.inputGroup} key={key}>
          <Text style={styles.inputLabel}>{fieldLabel(key)}</Text>
          <TextInput
            style={styles.input}
            value={formState[key]}
            onChangeText={(text) => updateField(key, text)}
            placeholder={fieldPlaceholder(key)}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      ))}
    </View>
  );
}
