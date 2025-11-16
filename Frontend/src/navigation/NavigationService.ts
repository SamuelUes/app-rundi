import { createNavigationContainerRef } from '@react-navigation/native';

// Global navigation ref to navigate outside React components (services, background handlers)
export const navigationRef = createNavigationContainerRef<any>();

export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    // @ts-ignore
    navigationRef.navigate(name as never, params as never);
  }
}

export function replace(name: string, params?: any) {
  if (navigationRef.isReady()) {
    // @ts-ignore
    navigationRef.dispatch({
      type: 'REPLACE',
      payload: { name, params },
    } as any);
  }
}
