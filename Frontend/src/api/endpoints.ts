export const ENDPOINTS = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
    profile: '/auth/profile',
  },
  rides: {
    search: '/rides/search',
    request: '/rides/request',
    myRides: '/rides/me',
  },
  payments: {
    intent: '/payments/intent',
  },
} as const;

export type EndpointGroup = typeof ENDPOINTS;
