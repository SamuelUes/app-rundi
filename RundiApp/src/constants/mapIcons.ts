import type { ImageSourcePropType } from 'react-native';

export const MAP_ICONS = {
  ORIGIN_PIN: require('../assets/icons/origin_marker/origin_marker.png'),
  DESTINATION_PIN: require('../assets/icons/select-final-destination/selectfinaldestination.png'),
  MULTI_STOP_PIN: require('../assets/icons/select-extra-destination/selectextradestination.png'),
  MULTI_STOP_LIST_PIN: require('../assets/icons/multiplelocationmarker/multiplelocationmarker.png'),
  USER_LOCATION_LIGHT: require('../assets/icons/actuall-position-white/actuallpositionwhite2x.png'),
  USER_LOCATION_DARK: require('../assets/icons/actuall-position-black/actuallpositionblack2x.png'),
  USER_LOCATION_HOLDING_LIGHT: require('../assets/icons/actuall-position-white-holding/actuallpositionwhiteholding2x.png'),
  USER_LOCATION_HOLDING_DARK: require('../assets/icons/actuall-position-black-holding/actuallpositionblackholding2x.png'),
  MANUAL_ORIGIN: require('../assets/icons/select-origin-position/selectoriginposition.png'),
  MANUAL_ORIGIN_HOLD: require('../assets/icons/select-origin-position-holding/selectoriginpositionholding.png'),
  REQUEST_PIN: require('../assets/icons/requests_pin/requests_pin2x.png'),
  DRIVER_PROFILE_BUBBLE: require('../assets/icons/driver-profile-bubble/driverprofilebubble_2x.png'),
} as const;

export const VEHICLE_ICONS = {
  sedan: require('../assets/icons/vehicles/sedan_V2/Icon_sedan2x.png'),
  suv: require('../assets/icons/vehicles/SUV/Icon_SUV_2x.png'),
  van: require('../assets/icons/vehicles/VAN/Icon_VAN_2x.png'),
  pickup: require('../assets/icons/vehicles/pickup_4x4/pickup_4x4_2x.png'),
  convertible: require('../assets/icons/vehicles/Convertible_Car_Sedan/Convertible_Car_Sedan2x.png'),
  moto: require('../assets/icons/vehicles/moto/moto_icon.png'),
  default: require('../assets/icons/vehicles/sedan_V2/Icon_sedan2x.png'),
} as const;

export type MapIconKey = keyof typeof MAP_ICONS;
export type VehicleIconKey = keyof typeof VEHICLE_ICONS;

export const VEHICLE_ICON_BASE_SIZE = 34;
export const VEHICLE_ICON_CONTAINER_SIZE = Math.round(VEHICLE_ICON_BASE_SIZE * 2);
