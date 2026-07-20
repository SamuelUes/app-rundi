import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
import type { TFunction } from 'i18next';

interface CategoryOption {
  id?: string;
  label: string;
}

interface SupportChatComplaintFormProps {
  category?: string;
  priority: string;
  title: string;
  description: string;
  creatingComplaint: boolean;
  creationError: string | null;
  creatingFunctionsError: string | null;
  categoryOptions: CategoryOption[];
  priorityOptions: CategoryOption[];
  colors: any;
  onSetCategory: (id: any) => void;
  onSetPriority: (id: any) => void;
  onSetTitle: (v: string) => void;
  onSetDescription: (v: string) => void;
  onCreateComplaint: () => void;
  t: TFunction;
  ns: string;
  styles: any;
}

export function SupportChatComplaintForm({
  category,
  priority,
  title,
  description,
  creatingComplaint,
  creationError,
  creatingFunctionsError,
  categoryOptions,
  priorityOptions,
  colors,
  onSetCategory,
  onSetPriority,
  onSetTitle,
  onSetDescription,
  onCreateComplaint,
  t,
  ns,
  styles,
}: SupportChatComplaintFormProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t(`${ns}.categories.title`)}</Text>
      <View style={styles.chipsRow}>
        {categoryOptions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.chip,
              category === item.id && styles.chipSelected,
            ]}
            onPress={() => onSetCategory(item.id)}
          >
            <Text
              style={[
                styles.chipLabel,
                category === item.id && styles.chipLabelSelected,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 20 }]}>{t(`${ns}.priorities.title`)}</Text>
      <View style={styles.chipsRow}>
        {priorityOptions.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.chipSmall,
              priority === item.id && styles.chipSelected,
            ]}
            onPress={() => onSetPriority(item.id)}
          >
            <Text
              style={[
                styles.chipLabel,
                priority === item.id && styles.chipLabelSelected,
              ]}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t(`${ns}.form.problemTitleLabel`)}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={t(`${ns}.form.problemTitlePlaceholder`)}
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={onSetTitle}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{t(`${ns}.form.descriptionLabel`)}</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          multiline
          numberOfLines={4}
          placeholder={t(`${ns}.form.descriptionPlaceholder`)}
          placeholderTextColor={colors.textSecondary}
          value={description}
          onChangeText={onSetDescription}
        />
      </View>

      {creationError ? <Text style={styles.errorText}>{creationError}</Text> : null}
      {creatingFunctionsError ? (
        <Text style={styles.errorText}>{creatingFunctionsError}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryButton, creatingComplaint && styles.primaryButtonDisabled]}
        disabled={creatingComplaint}
        onPress={onCreateComplaint}
      >
        {creatingComplaint ? (
          <View style={styles.buttonContentRow}>
            <LoadingIcon size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>{t(`${ns}.actions.creatingCase`)}</Text>
          </View>
        ) : (
          <Text style={styles.primaryButtonText}>{t(`${ns}.actions.createCase`)}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
