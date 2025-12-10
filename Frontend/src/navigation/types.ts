export type RegistrationMethod = 'email' | 'phone' | 'google';
export type RegistrationAuthProvider = 'email/password' | 'phone' | 'google';

export type AuthStackParamList = {
  Onboarding: undefined;
  AuthLanding: undefined;
  Login: undefined;
  Register: undefined;
  RegisterNew: undefined;
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
    context?: 'register_phone' | 'add_phone';
  };
  PhoneVerificationLogin: {
    phone: string;
    verificationId: string;
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
  };
  RoleSelection: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    phoneVerified?: boolean;
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
    googleIdToken?: string;
    driverData?: any;
    vehicleData?: any;
  };
};
