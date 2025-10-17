# Script para Aplicar Dark Mode

## Pantallas Completadas ✅:
1. ✅ HomeScreen (Cliente)
2. ✅ SettingsScreen
3. ✅ ProfileScreen

## Pantallas Pendientes (Prioridad Alta):
1. ⏳ SearchRideScreen
2. ⏳ RideConfirmationScreen
3. ⏳ RideTrackingScreen
4. ⏳ PaymentScreen
5. ⏳ DriverHomeScreen
6. ⏳ AvailableRidesScreen
7. ⏳ ActiveRideScreen
8. ⏳ TodayRidesScreen

## Pantallas Pendientes (Prioridad Media):
9. ⏳ RideHistoryScreen
10. ⏳ RatingScreen
11. ⏳ ChatScreen
12. ⏳ PaymentMethodsScreen
13. ⏳ HelpScreen

## Pantallas Pendientes (Prioridad Baja):
14. ⏳ LoginScreen
15. ⏳ RegisterScreen
16. ⏳ EarningsScreen
17. ⏳ RideRequestsScreen
18. ⏳ VehicleInspectionScreen
19. ⏳ SplashScreen

## Patrón a Aplicar:

```tsx
// 1. Importar
import { useTheme } from '../../context/ThemeContext';
import { useMemo } from 'react';

// 2. En el componente
const { colors } = useTheme();
const styles = useMemo(() => createStyles(colors), [colors]);

// 3. Convertir StyleSheet.create a función
const createStyles = (colors: any) => StyleSheet.create({
  // Reemplazar colores hardcodeados:
  // #fff → colors.background o colors.card
  // #000 → colors.text
  // #666 → colors.textSecondary
  // #e0e0e0 → colors.border
  // #f5f5f5 → colors.surface
});
```
