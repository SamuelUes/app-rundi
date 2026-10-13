import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions,
  FlatList,
  TouchableOpacity,
  ViewToken,
} from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';

type OnboardingNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'Onboarding'>;

type Props = {
  navigation: OnboardingNavigationProp;
};

type Slide = {
  id: string;
  titleKey: string;
  subtitleKey: string;
  image: ImageSourcePropType;
};

const slides: Slide[] = [
  {
    id: '1',
    titleKey: 'authScreens.onboarding.slides.first.title',
    subtitleKey: 'authScreens.onboarding.slides.first.subtitle',
    image: require('../../assets/images/campaña2/ride_2.png'),
  },
  {
    id: '2',
    titleKey: 'authScreens.onboarding.slides.second.title',
    subtitleKey: 'authScreens.onboarding.slides.second.subtitle',
    image: require('../../assets/images/campaña2/moto_ride.png'),
  },
  {
    id: '3',
    titleKey: 'authScreens.onboarding.slides.third.title',
    subtitleKey: 'authScreens.onboarding.slides.third.subtitle',
    image: require('../../assets/images/campaña2/ride_3.png'),
  },
];

const { width } = Dimensions.get('window');

const OnboardingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList<Slide>>(null);

  const handleNext = async () => {
    if (currentIndex < slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
      return;
    }

    try {
      await AsyncStorage.setItem('@rundi_has_seen_onboarding', 'true');
    } catch (error) {
      console.warn('Error saving onboarding flag', error);
    }

    navigation.replace('AuthLanding');
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
        setCurrentIndex(viewableItems[0].index || 0);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    viewAreaCoveragePercentThreshold: 60,
  }).current;

  const renderItem = ({ item }: { item: Slide }) => (
    <View style={[styles.slideContainer, { width }]}>
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          {item.id === '1' && (
            <Image
              source={require('../../assets/images/rundi_logo_bg.png')}
              style={[styles.logoImage]}
              resizeMode="contain"
            />
          )}

          <Image source={item.image} style={styles.image} resizeMode="contain" />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.title}>{t(item.titleKey)}</Text>
          <Text style={styles.subtitle}>{t(item.subtitleKey)}</Text>
        </View>

        <View style={styles.bottomRow}>
          <View style={styles.dotsContainer}>
            {slides.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === currentIndex ? styles.dotActive : styles.dotInactive,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity style={styles.nextButton} onPress={handleNext} activeOpacity={0.9}>
            <Ionicons name="arrow-forward" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={slides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderItem}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
      />
    </View>
  );
};

export default OnboardingScreen;

const createStyles = (colors: any) => {
  const gold = '#D4AF37';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#FCFCFC',
    },
    slideContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 14,
      elevation: 10,
    },
    card: {
      flex: 1,
      width: '100%',
      borderRadius: 24,
      backgroundColor: '#FCFCFC',
      paddingHorizontal: 15,
      paddingVertical: 100,
      justifyContent: 'space-between',
    },
    imageContainer: {
      flex: 1,
      justifyContent: 'center',
      paddingVertical: 60,
    },
    logoImage: {
      width: '25%',
      height: '25%',
      borderRadius: 12,
    },
    image: {
      width: '100%',
      height: '100%',
      elevation: 80,
    },
    textContainer: {
      marginTop: 24,
    },
    title: {
      fontSize: 45,
      fontWeight: '800',
      color: '#252525',
      fontFamily: 'Montserrat',
    },
    subtitle: {
      marginTop: 8,
      fontSize: 28,
      fontWeight: '300',
      color: '#000000ff',
      fontFamily: 'Montserrat',
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 24,
    },
    dotsContainer: {
      flexDirection: 'row',
      gap: 4,
    },
    dot: {
      width: 15,
      height: 8,
      borderRadius: 6,
    },
    dotInactive: {
      backgroundColor: '#7130AA',
    },
    dotActive: {
      backgroundColor: '#E48837',
      width: 16,
    },
    nextButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
};
