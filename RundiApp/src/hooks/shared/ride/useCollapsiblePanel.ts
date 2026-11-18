import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, PanResponder, type PanResponderInstance } from 'react-native';

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
  panHandlers: PanResponderInstance['panHandlers'];
}

export function useCollapsiblePanel({
  initialExpanded = true,
  minHeight = 240,
  maxHeight = SCREEN_HEIGHT * 0.65,
  useAnimatedHeight = false,
}: UseCollapsiblePanelOptions = {}): UseCollapsiblePanelResult {
  const [isPanelExpanded, setIsPanelExpanded] = useState(initialExpanded);
  const panelHeight = useRef(new Animated.Value(initialExpanded ? maxHeight : minHeight)).current;
  const targetExpanded = useRef(initialExpanded);
  const dragStartHeight = useRef(initialExpanded ? maxHeight : minHeight);
  const currentHeight = useRef(dragStartHeight.current);

  useEffect(() => {
    const id = panelHeight.addListener(({ value }) => {
      currentHeight.current = value;
    });
    return () => panelHeight.removeListener(id);
  }, [panelHeight]);

  const setPanelExpanded = useCallback((expanded: boolean) => {
    targetExpanded.current = expanded;
    setIsPanelExpanded(expanded);
    if (useAnimatedHeight) {
      Animated.timing(panelHeight, {
        toValue: expanded ? maxHeight : minHeight,
        duration: 220,
        useNativeDriver: false,
      }).start();
    } else {
      panelHeight.setValue(expanded ? maxHeight : minHeight);
    }
  }, [panelHeight, maxHeight, minHeight, useAnimatedHeight]);

  useEffect(() => {
    panelHeight.setValue(targetExpanded.current ? maxHeight : minHeight);
  }, [panelHeight, minHeight, maxHeight]);

  const togglePanel = useCallback(() => {
    setPanelExpanded(!targetExpanded.current);
  }, [setPanelExpanded]);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, gesture) =>
      Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      panelHeight.stopAnimation();
      dragStartHeight.current = currentHeight.current;
    },
    onPanResponderMove: (_, gesture) => {
      panelHeight.setValue(Math.max(minHeight, Math.min(maxHeight, dragStartHeight.current - gesture.dy)));
    },
    onPanResponderRelease: (_, gesture) => {
      const projected = dragStartHeight.current - gesture.dy - gesture.vy * 150;
      setPanelExpanded(projected > (minHeight + maxHeight) / 2);
    },
    onPanResponderTerminate: () => {
      setPanelExpanded(targetExpanded.current);
    },
  }), [panelHeight, minHeight, maxHeight, setPanelExpanded]);

  return {
    isPanelExpanded,
    panelHeight,
    togglePanel,
    setPanelExpanded,
    panHandlers: panResponder.panHandlers,
  };
}
