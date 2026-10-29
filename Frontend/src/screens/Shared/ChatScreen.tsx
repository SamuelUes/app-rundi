import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Linking,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useChat, ChatMessage } from '../../hooks/shared/chat/useChat';
import { useRideCalls } from '../../hooks/shared/calls/useRideCalls';
import ChatBubble, { BubbleGroupPosition } from '../../components/shared/ChatBubble';
import { toNicaraguaDate, getNicaraguaDate } from '../../utils/dateUtils';
import { useTranslation } from 'react-i18next';

type ListItem =
  | { type: 'message'; id: string; message: ChatMessage; position: BubbleGroupPosition }
  | { type: 'date'; id: string; label: string };

function TypingDots({ dotColor }: { dotColor: string }) {
  const anims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;

  useEffect(() => {
    const CYCLE = 1080;
    const loops = anims.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 140),
          Animated.timing(value, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration: 260,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.delay(Math.max(0, CYCLE - i * 140 - 520)),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [anims]);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {anims.map((value, i) => (
        <Animated.View
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            marginHorizontal: 2.5,
            backgroundColor: dotColor,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
            transform: [
              { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export default function ChatScreen({ route }: any) {
  const { rideId, otherUserId, otherUserName, otherUserPhone } = route.params;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const navigation = useNavigation();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, isDark, insets]);
  const { user } = useAuth();
  const isFocused = useIsFocused();
  const {
    connected,
    otherUserOnline,
    messages,
    isTyping,
    typingUser,
    sendMessage,
    sendTypingIndicator,
    stopTypingIndicator,
  } = useChat(rideId, user!.id, user!.name, isFocused);
  const { activeCall: rideCall, resolvedUid: callResolvedUid } = useRideCalls(rideId, otherUserId);
  const { t, i18n } = useTranslation();

  const [inputText, setInputText] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [unseenCount, setUnseenCount] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const isNearBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const sendScale = useRef(new Animated.Value(1)).current;

  const quickMessages = useMemo(
    () =>
      ((t('shared.chat.quickMessages', {
        returnObjects: true,
      }) as string[]) ?? []),
    [t]
  );
  const statusLabels = t('shared.chat.status', {
    returnObjects: true,
  }) as Record<string, string>;
  const chatAlerts = t('shared.chat.alerts', {
    returnObjects: true,
  }) as Record<string, string>;
  const emptyMessage = t('shared.chat.empty.message', { name: otherUserName });

  useEffect(() => {
    if (otherUserName) {
      navigation.setOptions({ title: otherUserName });
    }
  }, [navigation, otherUserName]);

  const dayKey = useCallback((timestamp: string) => {
    const date = toNicaraguaDate(timestamp);
    return Number.isNaN(date.getTime()) ? 'unknown' : date.toDateString();
  }, []);

  const dayLabel = useCallback(
    (timestamp: string) => {
      const date = toNicaraguaDate(timestamp);
      if (Number.isNaN(date.getTime())) return '';
      const today = getNicaraguaDate();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return t('shared.chat.dates.today');
      }
      if (date.toDateString() === yesterday.toDateString()) {
        return t('shared.chat.dates.yesterday');
      }
      try {
        const options: Intl.DateTimeFormatOptions =
          date.getFullYear() === today.getFullYear()
            ? { day: 'numeric', month: 'long' }
            : { day: 'numeric', month: 'long', year: 'numeric' };
        return new Intl.DateTimeFormat(i18n.language, options).format(date);
      } catch {
        return date.toLocaleDateString();
      }
    },
    [t, i18n.language]
  );

  // Mensajes intercalados con separadores de fecha y posición de grupo
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    let lastDay = '';
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const day = dayKey(message.timestamp);
      if (day !== lastDay) {
        items.push({ type: 'date', id: `date-${day}`, label: dayLabel(message.timestamp) });
        lastDay = day;
      }
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const samePrev =
        !!prev && prev.senderId === message.senderId && dayKey(prev.timestamp) === day;
      const sameNext =
        !!next && next.senderId === message.senderId && dayKey(next.timestamp) === day;
      const position: BubbleGroupPosition = !samePrev && !sameNext
        ? 'single'
        : !samePrev
          ? 'first'
          : sameNext
            ? 'middle'
            : 'last';
      items.push({ type: 'message', id: message.id, message, position });
    }
    return items;
  }, [messages, dayKey, dayLabel]);

  const scrollToEnd = useCallback((animated = true) => {
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  // Scroll automático solo si el usuario está cerca del final o envió el mensaje
  useEffect(() => {
    const last = messages[messages.length - 1];
    const arrivedWhileAway = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;

    if (!messages.length) return;

    if (isNearBottomRef.current || last?.isOwn) {
      setTimeout(() => scrollToEnd(true), 60);
    } else if (arrivedWhileAway > 0) {
      setUnseenCount((count) => count + arrivedWhileAway);
      setShowScrollDown(true);
    }
  }, [messages, scrollToEnd]);

  const handleScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const distanceFromBottom =
        contentSize.height - contentOffset.y - layoutMeasurement.height;
      const nearBottom = distanceFromBottom < 100;
      isNearBottomRef.current = nearBottom;
      if (nearBottom) {
        setShowScrollDown(false);
        setUnseenCount(0);
      } else {
        setShowScrollDown(true);
      }
    },
    []
  );

  const handleScrollToBottom = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    scrollToEnd(true);
    setShowScrollDown(false);
    setUnseenCount(0);
    isNearBottomRef.current = true;
  }, [scrollToEnd]);

  const animateSend = useCallback(
    (toValue: number) => {
      Animated.spring(sendScale, {
        toValue,
        useNativeDriver: true,
        speed: 60,
        bounciness: 8,
      }).start();
    },
    [sendScale]
  );

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(text, otherUserId);
    setInputText('');
    isNearBottomRef.current = true;
  };

  const handleQuickMessage = (message: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sendMessage(message, otherUserId);
    isNearBottomRef.current = true;
  };

  const handleTextChange = (text: string) => {
    setInputText(text);
    if (text.trim().length > 0) {
      sendTypingIndicator();
    } else {
      stopTypingIndicator();
    }
  };

  const navigateToRideCall = useCallback(
    (autoStart = false) => {
      (navigation as any).navigate('RideCall', {
        rideId,
        otherUserId,
        otherUserName,
        autoStart,
      });
    },
    [navigation, rideId, otherUserId, otherUserName]
  );

  const handleCall = () => {
    const options: any[] = [
      {
        text: t('shared.chat.alerts.callInApp'),
        onPress: () => navigateToRideCall(true),
      },
    ];

    if (otherUserPhone) {
      options.push({
        text: t('shared.chat.alerts.callByPhone'),
        onPress: async () => {
          try {
            const phoneUrl = `tel:${otherUserPhone}`;
            const canOpen = await Linking.canOpenURL(phoneUrl);

            if (canOpen) {
              await Linking.openURL(phoneUrl);
            } else {
              Alert.alert(chatAlerts.deviceErrorTitle, chatAlerts.cannotCallDevice);
            }
          } catch (error) {
            console.error('Error al intentar llamar:', error);
            Alert.alert(chatAlerts.callFailedTitle, chatAlerts.callFailedMessage);
          }
        },
      });
    }

    options.push({ text: chatAlerts.cancel, style: 'cancel' });

    Alert.alert(
      chatAlerts.callTitle,
      t('shared.chat.alerts.callMessage', {
        name: otherUserName,
        phone: otherUserPhone || '',
      }),
      options
    );
  };

  const initials = useMemo(() => {
    const parts = String(otherUserName || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    return parts
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join('');
  }, [otherUserName]);

  const isOnline = connected && otherUserOnline;
  const statusText = !connected
    ? statusLabels.connecting || statusLabels.offline
    : isOnline
      ? statusLabels.online
      : statusLabels.offline;
  const statusColor = !connected
    ? colors.warning
    : isOnline
      ? colors.success
      : colors.textTertiary;

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      if (item.type === 'date') {
        return (
          <View style={styles.dateSeparator}>
            <Text style={styles.dateSeparatorText}>{item.label}</Text>
          </View>
        );
      }
      return <ChatBubble message={item.message} position={item.position} />;
    },
    [styles]
  );

  const sendDisabled = !inputText.trim();

  const rideCallStatus = String(rideCall?.status || '').toLowerCase();
  const rideCallRinging = ['initiated', 'ringing_client', 'ringing_driver'].includes(rideCallStatus);
  const rideCallInitiatedByMe = Boolean(
    rideCall?.events?.initiated?.by &&
      callResolvedUid &&
      rideCall.events.initiated.by === callResolvedUid
  );
  const incomingRideCall = Boolean(rideCall && rideCallRinging && !rideCallInitiatedByMe);
  const ongoingRideCall = Boolean(
    rideCall &&
      !incomingRideCall &&
      (rideCallRinging || rideCallStatus === 'accepted' || rideCallStatus === 'connected')
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
    >
      {/* Barra de contacto: avatar, estado y llamada */}
      <View style={styles.contactBar}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName} numberOfLines={1}>
            {otherUserName}
          </Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, isOnline && { color: colors.success }]}>
              {statusText}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.callButton}
          onPress={handleCall}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={chatAlerts.callTitle}
        >
          <MaterialIcons name="call" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Banner de llamada del viaje: entrante o en curso */}
      {(incomingRideCall || ongoingRideCall) && (
        <TouchableOpacity
          style={[
            styles.callBanner,
            incomingRideCall ? styles.callBannerIncoming : styles.callBannerActive,
          ]}
          onPress={() => navigateToRideCall(false)}
          activeOpacity={0.85}
          accessibilityRole="button"
        >
          <MaterialIcons
            name={incomingRideCall ? 'call-received' : 'call'}
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.callBannerText} numberOfLines={1}>
            {incomingRideCall
              ? t('shared.chat.alerts.incomingCall', { name: otherUserName })
              : t('shared.chat.alerts.incomingCallView')}
          </Text>
          {incomingRideCall && (
            <Text style={styles.callBannerAction}>
              {t('shared.chat.alerts.incomingCallAnswer')}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Lista de mensajes */}
      <View style={styles.messagesArea}>
        <FlatList
          ref={flatListRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.messagesList,
            listItems.length === 0 && styles.messagesListEmpty,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconWrap}>
                <MaterialIcons name="chat-bubble-outline" size={30} color={colors.primary} />
              </View>
              <Text style={styles.emptyText}>{emptyMessage}</Text>
            </View>
          }
          ListFooterComponent={
            isTyping ? (
              <View
                style={styles.typingRow}
                accessibilityLabel={t('shared.chat.typing', {
                  name: typingUser || otherUserName,
                })}
              >
                <View style={styles.typingBubble}>
                  <TypingDots dotColor={colors.textSecondary} />
                </View>
              </View>
            ) : null
          }
          onScroll={handleScroll}
          scrollEventThrottle={80}
          onContentSizeChange={() => {
            if (isNearBottomRef.current) {
              scrollToEnd(true);
            }
          }}
          onScrollBeginDrag={() => Keyboard.dismiss()}
          keyboardShouldPersistTaps="handled"
        />

        {/* Botón flotante para ir al final */}
        {showScrollDown && (
          <TouchableOpacity
            style={styles.scrollDownButton}
            onPress={handleScrollToBottom}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('shared.chat.scrollToBottom')}
          >
            <MaterialIcons name="keyboard-arrow-down" size={22} color={colors.text} />
            {unseenCount > 0 && (
              <View style={styles.unseenBadge}>
                <Text style={styles.unseenBadgeText}>
                  {unseenCount > 99 ? '99+' : unseenCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Mensajes rápidos */}
      <View style={styles.quickMessagesContainer}>
        <FlatList
          horizontal
          data={quickMessages}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.quickMessageButton}
              onPress={() => handleQuickMessage(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.quickMessageText}>{item}</Text>
            </TouchableOpacity>
          )}
          keyExtractor={(item) => item}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickMessagesList}
        />
      </View>

      {/* Input de mensaje */}
      <View style={styles.inputContainer}>
        <View style={[styles.inputPill, inputFocused && styles.inputPillFocused]}>
          <TextInput
            style={styles.input}
            placeholder={t('shared.chat.input.placeholder')}
            placeholderTextColor={colors.textTertiary}
            value={inputText}
            onChangeText={handleTextChange}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            multiline
            maxLength={500}
            cursorColor={colors.primary}
            selectionColor={colors.primary}
          />
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
            <TouchableOpacity
              style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
              onPress={handleSend}
              onPressIn={() => animateSend(0.82)}
              onPressOut={() => animateSend(1)}
              disabled={sendDisabled}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('shared.chat.input.send')}
            >
              <MaterialIcons
                name="send"
                size={17}
                color={sendDisabled ? colors.textSecondary : '#241A05'}
              />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (
  colors: any,
  isDark: boolean,
  insets: { top: number; bottom: number }
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    contactBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 12,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(201, 163, 90, 0.22)' : 'rgba(179, 135, 55, 0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.primary,
    },
    contactInfo: {
      flex: 1,
    },
    contactName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 3,
    },
    statusDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      marginRight: 6,
    },
    statusText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    callButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isDark ? 'rgba(201, 163, 90, 0.22)' : 'rgba(179, 135, 55, 0.15)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    callBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 10,
    },
    callBannerIncoming: {
      backgroundColor: colors.success,
    },
    callBannerActive: {
      backgroundColor: colors.primary,
    },
    callBannerText: {
      flex: 1,
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '600',
    },
    callBannerAction: {
      color: '#FFFFFF',
      fontSize: 13,
      fontWeight: '700',
    },
    messagesArea: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    messagesList: {
      paddingTop: 8,
      paddingBottom: 16,
    },
    messagesListEmpty: {
      flexGrow: 1,
      justifyContent: 'center',
    },
    dateSeparator: {
      alignSelf: 'center',
      marginTop: 14,
      marginBottom: 4,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.05)',
    },
    dateSeparatorText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 0.2,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
      paddingHorizontal: 32,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    typingRow: {
      alignItems: 'flex-start',
      marginTop: 4,
      marginHorizontal: 16,
    },
    typingBubble: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 20,
      borderBottomLeftRadius: 6,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    scrollDownButton: {
      position: 'absolute',
      right: 16,
      bottom: 12,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
    unseenBadge: {
      position: 'absolute',
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      paddingHorizontal: 4,
      borderRadius: 9,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.card,
    },
    unseenBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#241A05',
    },
    quickMessagesContainer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
    quickMessagesList: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    quickMessageButton: {
      backgroundColor: colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    quickMessageText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
    },
    inputContainer: {
      paddingTop: 8,
      paddingHorizontal: 12,
      paddingBottom: insets.bottom + 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: isDark ? 0.25 : 0.05,
      shadowRadius: 12,
      elevation: 10,
    },
    inputPill: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 24,
      paddingLeft: 16,
      paddingRight: 6,
      paddingVertical: 5,
      minHeight: 48,
    },
    inputPillFocused: {
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 8,
      elevation: 3,
    },
    input: {
      flex: 1,
      fontSize: 15,
      paddingTop: 9,
      paddingBottom: 9,
      paddingRight: 8,
      maxHeight: 110,
      color: colors.text,
    },
    sendButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
  });
