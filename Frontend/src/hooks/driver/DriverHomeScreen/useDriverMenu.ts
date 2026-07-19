import { useCallback, useRef, useState } from 'react';
import { Animated, Dimensions } from 'react-native';

export function useDriverMenu() {
  const panelWidthRef = useRef(Math.min(Dimensions.get('window').width * 0.8, 336));
  const panelWidth = panelWidthRef.current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuTranslate = useRef(new Animated.Value(panelWidth)).current;
  const [menuVisible, setMenuVisible] = useState(false);

  const closeMenu = useCallback(() => {
    if (!menuVisible) return;
    Animated.parallel([
      Animated.timing(menuOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(menuTranslate, { toValue: panelWidth, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setMenuVisible(false);
    });
  }, [menuOpacity, menuTranslate, menuVisible, panelWidth]);

  const openMenu = useCallback(() => {
    menuOpacity.setValue(0);
    menuTranslate.setValue(panelWidth);
    setMenuVisible(true);
    Animated.parallel([
      Animated.timing(menuOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(menuTranslate, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [menuOpacity, menuTranslate, panelWidth]);

  const toggleMenu = useCallback(() => {
    if (menuVisible) closeMenu();
    else openMenu();
  }, [menuVisible, closeMenu, openMenu]);

  return {
    menuVisible,
    setMenuVisible,
    menuOpacity,
    menuTranslate,
    panelWidth,
    openMenu,
    closeMenu,
    toggleMenu,
  };
}
