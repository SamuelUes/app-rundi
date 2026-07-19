import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function navigate<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName]
) {
  if (navigationRef.isReady()) {
    // CommonActions.navigate acepta (string, object?) — los tipos de react-navigation
    // no propagan RouteName genérico, por eso usamos el overload de string.
    navigationRef.dispatch(CommonActions.navigate(name, params));
  }
}

export function replace<RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName]
) {
  if (navigationRef.isReady()) {
    // CommonActions no expone replace directamente; usamos dispatch con acción REPLACE.
    navigationRef.dispatch({
      ...CommonActions.navigate(name, params),
      type: 'REPLACE',
    });
  }
}
