import React from 'react';
import { View, Text, TextInput, Switch } from 'react-native';

interface VehicleInfoVehicleSectionProps {
  isComplete: boolean;
  formState: any;
  sections: Record<string, string>;
  completionText: Record<string, string>;
  messages: Record<string, string>;
  fieldLabel: (key: string) => string;
  fieldPlaceholder: (key: string) => string;
  colors: any;
  updateField: (field: any, value: string | boolean) => void;
  styles: any;
}

export function VehicleInfoVehicleSection({
  isComplete,
  formState,
  sections,
  completionText,
  messages,
  fieldLabel,
  fieldPlaceholder,
  colors,
  updateField,
  styles,
}: VehicleInfoVehicleSectionProps) {
  return (
    <View style={[styles.section, isComplete && styles.completedSection]}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{sections.vehicle}</Text>
        {isComplete && (
          <View style={styles.completionBadge}>
            <View style={[styles.completionIcon, styles.iconComplete]} />
            <Text style={styles.completedText}>{completionText.badge}</Text>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('plate')}</Text>
        <TextInput
          style={[styles.input, formState.plate ? styles.inputFilled : styles.inputRequired]}
          value={formState.plate}
          onChangeText={(text) => updateField('plate', text)}
          placeholder={fieldPlaceholder('plate')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('brand')}</Text>
        <TextInput
          style={[styles.input, formState.brand ? styles.inputFilled : styles.inputRequired]}
          value={formState.brand}
          onChangeText={(text) => updateField('brand', text)}
          placeholder={fieldPlaceholder('brand')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('model')}</Text>
        <TextInput
          style={styles.input}
          value={formState.model}
          onChangeText={(text) => updateField('model', text)}
          placeholder={fieldPlaceholder('model')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('year')}</Text>
        <TextInput
          style={styles.input}
          value={formState.year}
          onChangeText={(text) => updateField('year', text)}
          placeholder={fieldPlaceholder('year')}
          keyboardType="numeric"
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('color')}</Text>
        <TextInput
          style={styles.input}
          value={formState.color}
          onChangeText={(text) => updateField('color', text)}
          placeholder={fieldPlaceholder('color')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('vehicleType')}</Text>
        <TextInput
          style={styles.input}
          value={formState.vehicleType}
          onChangeText={(text) => updateField('vehicleType', text)}
          placeholder={fieldPlaceholder('vehicleType')}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{fieldLabel('fourByFour')}</Text>
        <View style={styles.switchContainer}>
          <Text style={styles.switchLabel}>{messages.switchNo}</Text>
          <Switch
            value={formState.is4x4}
            onValueChange={(val) => updateField('is4x4', val)}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={formState.is4x4 ? colors.primary : colors.textSecondary}
          />
          <Text style={styles.switchLabel}>{messages.switchYes}</Text>
        </View>
      </View>
    </View>
  );
}
