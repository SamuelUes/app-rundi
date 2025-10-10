export function initializeStripe() {
  const key = process.env.STRIPE_PUBLIC_KEY;
  if (!key) console.warn('STRIPE_PUBLIC_KEY not set');
  // TODO: Setup with tipsi-stripe or @stripe/stripe-react-native for Expo
}
