/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'RideActivity',
  displayName: 'Rundi Viajes',
  deploymentTarget: '16.4',
  bundleIdentifier: '.RideActivity',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
  colors: {
    $accent: '#FF9800',
    $widgetBackground: '#0F2628',
    rideBackground: { light: '#0F2628', dark: '#0F2628' },
    rideAccent: { light: '#FF9800', dark: '#FFB74D' },
    rideText: { light: '#FFFFFF', dark: '#FFFFFF' },
    rideSubtext: { light: '#B0BEC5', dark: '#90A4AE' },
  },
  images: {
    appIcon: '../../src/assets/images/rundi_logo.png',
  },
};
