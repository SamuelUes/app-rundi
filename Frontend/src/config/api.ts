// Configuración de la API
export { API_BASE_URL } from './environment';

export const ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  REGISTER: '/auth/register',
  
  // Users
  USERS: '/users',
  
  // Drivers
  DRIVERS: '/drivers',
  DRIVERS_AVAILABLE: '/drivers/available',
  
  // Rides
  RIDES: '/rides',
  RIDES_REQUEST: '/rides/request',
  RIDES_AVAILABLE: '/rides/available/list',
  RIDES_ACCEPT: (id: string) => `/rides/${id}/accept`,
  RIDES_STATUS: (id: string) => `/rides/${id}/status`,
  RIDES_CANCEL: (id: string) => `/rides/${id}/cancel`,
  RIDES_INSPECTION: '/rides/inspections',
  RIDES_GET_INSPECTION: (rideId: string) => `/rides/${rideId}/inspection`,
  
  // Payments
  PAYMENTS: '/payments',
  
  // Tracking (WebSocket)
  TRACKING_WS: '/tracking',
};
