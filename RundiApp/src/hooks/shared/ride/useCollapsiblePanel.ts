import { useCallback, useRef, useState } from 'react';
import { Animated, Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface UseCollapsiblePanelOptions {
  initialExpanded?: boolean;
  minHeight?: number;
  maxHeight?: number;
  useAnimatedHeight?: boolean;
}

interface UseCollapsiblePanelResult {
  isPanelExpanded: boolean;
  panelHeight: Animated.Value;
  togglePanel: () => void;
  setPanelExpanded: (value: boolean) => void;
}

export function useCollapsiblePanel({
  initialExpanded = true,
  minHeight = 240,
  maxHeight = SCREEN_HEIGHT * 0.65,
  useAnimatedHeight = false,
}: UseCollapsiblePanelOptions = {}): UseCollapsiblePanelResult {
  const [isPanelExpanded, setIsPanelExpanded] = useState(initialExpanded);
  const panelHeight = useRef(new Animated.Value(initialExpanded ? maxHeight : minHeight)).current;

  const togglePanel = useCallback(() => {
    const next = !isPanelExpanded;
    setIsPanelExpanded(next);
    if (useAnimatedHeight) {
      Animated.timing(panelHeight, {
        toValue: next ? maxHeight : minHeight,
        duration: 220,
        useNativeDriver: false,
      }).start();
    }
  }, [isPanelExpanded, panelHeight, maxHeight, minHeight, useAnimatedHeight]);

  return {
    isPanelExpanded,
    panelHeight,
    togglePanel,
    setPanelExpanded: setIsPanelExpanded,
  };
}
