import React from 'react';
import { View, Text, TextInput } from 'react-native';

interface VehicleInfoTechnicalSectionProps {
  sections: Record<string, string>;
  completionText: Record<string, string>;
  fieldLabel: (key: string) => string;
  fieldPlaceholder: (key: string) => string;
  colors: any;
  formState: any;
  updateField: (field: any, value: string | boolean) => void;
  styles: any;
}

export function VehicleInfoTechnicalSection({
  sections,
  completionText,
  fieldLabel,
  fieldPlaceholder,
  colors,
  formState,
  updateField,
  styles,
}: VehicleInfoTechnicalSectionProps) {
  const fields = [
    { key: 'motor', numeric: false },
    { key: 'chasis', numeric: false },
    { key: 'vin', numeric: false },
    { key: 'cylinders', numeric: true },
    { key: 'passengers', numeric: true },
    { key: 'fuelType', numeric: false },
    { key: 'tonnage', numeric: false, decimal: true },
    { key: 'vehicleClass', numeric: false },
    { key: 'serviceType', numeric: false },
    { key: 'lien', numeric: false },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sections.technical}</Text>
        <View style={styles.completionBadge}>
          <View style={[styles.completionIcon, styles.iconNotRequired]} />
          <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{completionText.optional}</Text>
        </View>
      </View>

      {fields.map(({ key, numeric, decimal }) => (
        <View style={styles.inputGroup} key={key}>
          <Text style={styles.inputLabel}>{fieldLabel(key)}</Text>
          <TextInput
            style={styles.input}
            value={formState[key]}
            onChangeText={(text) => updateField(key, text)}
            placeholder={fieldPlaceholder(key)}
            keyboardType={numeric ? (decimal ? 'decimal-pad' : 'numeric') : 'default'}
            placeholderTextColor={colors.textSecondary}
          />
        </View>
      ))}
    </View>
  );
}
