export type RegistrationMethod = 'email' | 'phone' | 'google';
export type RegistrationAuthProvider = 'email/password' | 'phone' | 'google';

export type AuthStackParamList = {
  Onboarding: undefined;
  AuthLanding: undefined;
  Login: undefined;
  Register: undefined;
  RegisterNew: undefined;
  RegistrationCheckpoint: undefined;
  PhoneVerification: {
    name: string;
    email?: string;
    phone: string;
    password?: string;
    role?: 'client' | 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    context?: 'register_phone' | 'add_phone' | 'register_upgrade_driver';
  };
  PhoneVerificationLogin: {
    phone: string;
    displayPhone?: string;
    country?: any;
    verificationId?: string;
    mode?: 'login' | 'link';
  };
  EmailVerification: {
    name: string;
    email: string;
    phone?: string;
    password?: string;
    role?: 'client' | 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    context?: 'register_email' | 'register_google' | string;
  };
  GooglePhone: {
    name: string;
    email?: string;
    googleIdToken: string;
    initialPhone?: string;
  };
  DriverPhone: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    emailVerified?: boolean;
    context?: 'register_phone' | 'register_upgrade_driver';
  };
  RoleSelection: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    googleIdToken?: string;
  };
  DriverData: {
    name: string;
    email?: string;
    phone: string;
    password?: string;
    role: 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified: boolean;
    emailVerified?: boolean;
    context?: 'register_driver' | 'register_upgrade_driver';
    driverData?: any;
    vehicleData?: any;
  };
  RegisterConfirm: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    role: 'client' | 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    phoneVerified?: boolean;
    emailVerified?: boolean;
    googleIdToken?: string;
    driverData?: any;
    vehicleData?: any;
    context?: 'register_driver' | 'register_upgrade_driver';
  };
};
