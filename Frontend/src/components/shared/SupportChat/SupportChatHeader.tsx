import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SupportChatComplaintForm } from './SupportChatComplaintForm';
import type { TFunction } from 'i18next';

interface CategoryOption {
  id?: string;
  label: string;
}

interface SupportChatHeaderProps {
  rideId: string | null | undefined;
  complaintId: string | null;
  category?: string;
  priority: string;
  title: string;
  description: string;
  creatingComplaint: boolean;
  creationError: string | null;
  creatingFunctionsError: string | null;
  categoryOptions: CategoryOption[];
  priorityOptions: CategoryOption[];
  activeCall: any;
  colors: any;
  onBack: () => void;
  onSetCategory: (id: any) => void;
  onSetPriority: (id: any) => void;
  onSetTitle: (v: string) => void;
  onSetDescription: (v: string) => void;
  onCreateComplaint: () => void;
  onCallButton: () => void;
  t: TFunction;
  ns: string;
  styles: any;
}

export function SupportChatHeader({
  rideId,
  complaintId,
  category,
  priority,
  title,
  description,
  creatingComplaint,
  creationError,
  creatingFunctionsError,
  categoryOptions,
  priorityOptions,
  activeCall,
  colors,
  onBack,
  onSetCategory,
  onSetPriority,
  onSetTitle,
  onSetDescription,
  onCreateComplaint,
  onCallButton,
  t,
  ns,
  styles,
}: SupportChatHeaderProps) {
  return (
    <View>
      {rideId ? (
        <View style={styles.rideTag}>
          <View style={styles.rideTagIcon}>
            <Ionicons name="navigate-outline" size={16} color={colors.primary} />
          </View>
          <View style={styles.rideTagTexts}>
            <Text style={styles.rideTagLabel}>{t(`${ns}.rideTagLabel`)}</Text>
            <Text style={styles.rideTagValue}>{rideId}</Text>
          </View>
        </View>
      ) : null}

      {!complaintId && (
        <SupportChatComplaintForm
          category={category}
          priority={priority}
          title={title}
          description={description}
          creatingComplaint={creatingComplaint}
          creationError={creationError}
          creatingFunctionsError={creatingFunctionsError}
          categoryOptions={categoryOptions}
          priorityOptions={priorityOptions}
          colors={colors}
          onSetCategory={onSetCategory}
          onSetPriority={onSetPriority}
          onSetTitle={onSetTitle}
          onSetDescription={onSetDescription}
          onCreateComplaint={onCreateComplaint}
          t={t}
          ns={ns}
          styles={styles}
        />
      )}

      {complaintId ? (
        <View style={styles.caseHeader}>
          <View style={styles.caseIcon}>
            <Ionicons name="clipboard-outline" size={19} color={colors.primary} />
          </View>
          <View style={styles.caseTexts}>
            <Text style={styles.caseIdLabel}>{t(`${ns}.caseHeader.createdLabel`)}</Text>
            <Text style={styles.caseIdValue}>{complaintId}</Text>
            <Text style={styles.caseHint}>
              {t(`${ns}.caseHeader.hint`)}
            </Text>
          </View>
        </View>
      ) : null}

      {activeCall && !['ended', 'rejected', 'missed'].includes(String(activeCall.status || '')) ? (
        <TouchableOpacity
          style={styles.callBanner}
          onPress={onCallButton}
          activeOpacity={0.8}
        >
          <View style={styles.callBannerDot} />
          <View style={styles.callBannerTexts}>
            <Text style={styles.callBannerTitle}>Llamada en curso</Text>
            <Text style={styles.callBannerSubtitle}>
              Estado: {String(activeCall.status || 'pending').replace('_', ' ')} · Toca para abrir controles
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
