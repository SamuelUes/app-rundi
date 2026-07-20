import React from 'react';
import { View, Text, TouchableOpacity, FlatList, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ChatBubble from '../ChatBubble';
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
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Image source={require('../../../assets/icons/back_button/back_button2x.png')} style={styles.backIcon} resizeMode="contain" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t(`${ns}.title`)}</Text>
          <Text style={styles.subtitle}>{t(`${ns}.subtitle`)}</Text>
        </View>
      </View>

      {rideId ? (
        <View style={styles.rideTag}>
          <Text style={styles.rideTagLabel}>{t(`${ns}.rideTagLabel`)}</Text>
          <Text style={styles.rideTagValue}>{rideId}</Text>
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
          <Text style={styles.caseIdLabel}>{t(`${ns}.caseHeader.createdLabel`)}</Text>
          <Text style={styles.caseIdValue}>{complaintId}</Text>
          <Text style={styles.caseHint}>
            {t(`${ns}.caseHeader.hint`)}
          </Text>
        </View>
      ) : null}

      {activeCall && activeCall.status !== 'ended' ? (
        <TouchableOpacity
          style={styles.callBanner}
          onPress={onCallButton}
        >
          <View style={styles.callBannerDot} />
          <View style={styles.callBannerTexts}>
            <Text style={styles.callBannerTitle}>Llamada en curso</Text>
            <Text style={styles.callBannerSubtitle}>
              Estado: {String(activeCall.status || 'pending').replace('_', ' ')} · Toca para abrir controles
            </Text>
          </View>
          <Text style={styles.callBannerArrow}>→</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
