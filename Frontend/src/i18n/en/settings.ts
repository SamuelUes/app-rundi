/**
 * Namespace `settings` del locale `en`.
 * Extraído desde `src/i18n/index.ts` (`en.translation.settings`).
 */
const settings = {
        title: 'Settings',
        loading: { logout: 'Signing out...' },
        roles: {
          driver: 'Driver',
          client: 'Client',
          designated_driver: 'Designated driver',
          admin: 'Admin',
          default: 'User',
        },
        sections: {
          account: 'Account',
          privacy: 'Privacy & Security',
          about: 'About',
          language: 'Language',
        },
        account: {
          title: 'My account',
          description: 'Manage email, password, and phone',
          upgradeTitle: 'I want to drive',
          upgradeDescription: 'Complete your info and documents to offer rides on Rundi.',
          deleteTitle: 'Delete my account',
          deleteDescription: 'Guided flow to request deletion',
        },
        privacy: {
          policy: 'Privacy Policy',
          terms: 'Terms and Conditions',
        },
        about: {
          version: 'Version',
          versionValue: 'Beta- 1.8',
          domain: 'Domain',
          domainValue: 'rundiapp.com',
          licenses: 'Open-source licenses',
        },
        language: {
          title: 'App language',
          description: 'Choose your preferred language.',
          deviceDefault: 'Device language: {{language}}',
          options: {
            en: 'English',
            es: 'Spanish',
            zh: 'Chinese',
          },
        },
        alerts: {
          buildTitle: 'Build the app',
          buildMessage:
            'Push notifications only work on a development or production build. Use “npx expo run:android” or “npx expo run:ios”.',
          disableTitle: 'Disable notifications',
          disableMessage:
            'To turn off push notifications, open the system settings and revoke the app permissions.',
          notAvailableTitle: 'Not available',
          notAvailableMessage: 'Only client accounts can start driver registration here.',
          smsErrorTitle: 'Error',
          smsErrorMessage: 'Could not send the SMS code. Please try again.',
          genericError: 'Something went wrong. Please try again.',
        },
        actions: {
          logout: 'Sign out',
          logoutTitle: 'Sign out',
          logoutMessage: 'Are you sure you want to sign out?',
          cancel: 'Cancel',
          confirm: 'Sign out',
          accept: 'Accept',
        },
      };

export default settings;
