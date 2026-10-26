import SupportChatShortcut from '@/components/shared/SupportChatShortcut';
// import RideConfirmationScreen from '@/screens/Client/Trabajo-revision-pendiente-RideConfirmationScreen'; // DEPRECATED - sin uso, revisión próxima
import alertService from '@/services/alertService';
import accountLinkingService from '@/services/auth/accountLinkingService';
import firebaseAuthService from '@/services/auth/firebaseAuthService';
import googleAuthService from '@/services/auth/googleAuthService';
import localAuthService from '@/services/auth/localAuthService';
import phoneAuthService from '@/services/auth/phoneAuthService';
import backgroundLocationService from '@/services/backgroundLocationService';
import BiometricService from '@/services/biometricService';
import cardsService from '@/services/cardsService';
import driverAvailabilityService from '@/services/driverAvailabilityService';
import driversService from '@/services/driversService';
import earningsService from '@/services/earningsService';
import inspectionsService from '@/services/inspectionsService';
import locationTrackingService from '@/services/locationTrackingService';
import notificationService from '@/services/notificationService';
import paymentsService from '@/services/paymentsService';
import phoneLoginService from '@/services/phoneLoginService';
import priceNegotiationService from '@/services/priceNegotiationService';
import registrationService from '@/services/auth/registrationService';
import servicesService from '@/services/servicesService';
// import trackingService from '@/services/trackingService'; // DEPRECATED — socket.io sin uso, usar firebaseTrackingService
import uploadService from '@/services/uploadService';
import { userManagementService } from '@/services/userManagementService';
import vehiclesService from '@/services/vehiclesService';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      common: {
        actions: {
          accept: 'Accept',
          cancel: 'Cancel',
          save: 'Save',
          continue: 'Continue',
          back: 'Back',
          close: 'Close',
          confirm: 'Confirm',
          delete: 'Delete',
          edit: 'Edit',
          next: 'Next',
          previous: 'Previous',
          search: 'Search',
          submit: 'Submit',
          tryAgain: 'Try again',
          start: 'Start',
          stop: 'Stop',
          yes: 'Yes',
          no: 'No',
        },
        datePicker: {
          selectYear: 'Select a year',
        },
        mapPins: {
          origin: 'Origin',
          destination: 'Destination',
          extraStop: 'Stop {{index}}',
        },
        components: {
          camera: {
            unavailableTitle: 'Camera unavailable',
            unavailableMessage:
              'This device has no camera available. You can choose a photo from the gallery instead.',
            useGallery: 'Use gallery',
          },
          availableRideCard: {
            originFallback: 'Unknown origin',
            destinationFallback: 'Unknown destination',
            priceLabel: 'Suggested price:',
            priceValue: 'C${{amount}}',
            distanceValue: '{{value}} km',
            distanceUnknown: 'N/A',
          },
          button: {
            loading: 'Loading...',
          },
          cancelRideDialog: {
            title: '⚠️ Cancel ride',
            progress: 'Progress: {{value}}%',
            requiresReasonMessage:
              'This ride is {{progress}}% complete. Please provide a reason to cancel it.',
            confirmMessage: 'Are you sure you want to cancel this ride?',
            reasonLabel: 'Cancellation reason *',
            reasonPlaceholder: 'Enter the reason (minimum 10 characters)',
            charCount: '{{count}}/200 characters',
            suggestionsTitle: 'Suggested reasons:',
            suggestions: {
              personalEmergency: 'Personal emergency',
              vehicleIssue: 'Vehicle issue',
              changeOfPlans: 'Change of plans',
              wrongRoute: 'Wrong route',
              longDelay: 'Excessive delay',
            },
            actions: {
              keepRide: 'Keep ride',
              confirmCancel: 'Yes, cancel',
            },
            alerts: {
              reasonRequiredTitle: 'Reason required',
              reasonRequiredMessage:
                'Provide a reason with at least 10 characters to cancel this ride.',
              errorTitle: 'Error',
              errorMessage: 'We could not cancel the ride. Please try again.',
            },
          },
          emergencyButton: {
            modalTitle: '🚨 Emergency',
            modalSubtitle: 'Choose the emergency service you need',
            options: {
              police: {
                title: '👮 Police',
                description: 'Police emergencies, thefts, accidents',
                number: '118',
              },
              ambulance: {
                title: '🚑 Ambulance',
                description: 'Medical emergencies, accidents, injuries',
                number: '102',
              },
            },
            cancelLabel: 'Cancel',
            alerts: {
              callingTitle: '🚨 Emergency',
              callingMessage: 'Calling {{name}} ({{number}})\n\nThe call has been logged.',
              cannotCall: 'We couldn’t start the phone call.',
              errorTitle: 'Error',
              errorMessage: 'We could not complete the emergency call.',
            },
          },
          emptyRideList: {
            defaultTitle: 'No rides available right now',
            defaultDescription: 'New rides will appear here automatically.',
          },
          emptyState: {
            noRides: {
              title: 'No rides available',
              message: 'When new rides are available, they will appear here.',
              action: 'Refresh',
            },
            noHistory: {
              title: 'No ride history',
              message: 'Your completed rides will appear here.',
              action: 'Request ride',
            },
            noNotifications: {
              title: 'No notifications',
              message: 'We will let you know when there is something new.',
            },
            noSearchResults: {
              title: 'No results',
              message: 'We couldn’t find results for “{{term}}”.',
              genericMessage: 'Try another search.',
            },
            noDrivers: {
              title: 'No drivers available',
              message: 'Please try again in a moment.',
            },
            noConnection: {
              title: 'No connection',
              message: 'Check your internet connection and try again.',
              action: 'Retry',
            },
          },
          etaDisplay: {
            loading: 'Calculating...',
            etaLabel: 'Estimated arrival',
            distanceLabel: '{{value}} km remaining',
            realtime: 'Real-time update • Last update: {{value}}',
            errors: {
              generic: 'Error calculating ETA',
              calculating: 'Calculating...',
            },
            updateTimes: {
              now: 'just now',
              seconds: '{{count}}s ago',
              minutes: '{{count}}min ago',
            },
          },
          imagePicker: {
            alerts: {
              permissionsTitle: 'Permissions required',
              permissionsMessage: 'Camera and gallery permissions are required to continue.',
              selectTitle: 'Select image',
              selectMessage: 'Choose an option',
              cameraOption: '📷 Take photo',
              galleryOption: '🖼️ Gallery',
              cancelOption: 'Cancel',
              errorTitle: 'Error',
              selectError: 'We could not select the image.',
            },
            placeholder: 'Take or select a photo',
            changeButton: 'Change photo',
          },
          insuranceCompany: {
            selectTitle: 'Insurance company',
            otherOption: 'Other insurer',
          },
          imagePickerButton: {
            alerts: {
              pickTitle: 'Select image',
              pickMessage: 'Choose an option',
              cameraOption: 'Camera',
              galleryOption: 'Gallery',
              cancelOption: 'Cancel',
              permissionTitle: 'Permissions',
              permissionMessage: 'Camera permissions are required to continue.',
              permissionGalleryMessage: 'Gallery permissions are required to continue.',
              takePhotoError: 'We could not take the photo.',
              pickError: 'We could not select the image.',
              uploadSuccessTitle: 'Success',
              uploadSuccessMessage: 'Image uploaded successfully.',
              uploadErrorTitle: 'Error',
              uploadErrorMessage: 'We could not upload the image.',
            },
            placeholder: {
              label: 'Tap to select',
            },
            loadingLabel: 'Loading…',
          },
          loadingOverlay: {
            defaultMessage: 'Loading…',
            progressValue: '{{value}}%',
          },
          phoneNumberModal: {
            title: 'Phone number',
            subtitle: 'Select your country and enter the digits.',
            previewLabel: 'Current number',
            areaLabel: 'Area code',
            actions: {
              useNumber: 'Use this number',
              clearNumber: 'Remove number',
            },
            alerts: {
              invalidTitle: 'Invalid phone',
              invalidMessage: 'Enter a valid international phone number.',
            },
          },
          photoUploadField: {
            alerts: {
              permissionDeniedTitle: 'Permission denied',
              galleryPermission: 'We need access to your gallery.',
              cameraPermission: 'We need access to your camera.',
              errorTitle: 'Error',
              selectError: 'We could not select the image.',
              captureError: 'We could not take the photo.',
            },
            options: {
              title: 'Add photo',
              message: 'Choose how to add the photo',
              cancel: 'Cancel',
              gallery: 'Gallery',
              camera: 'Camera',
            },
            buttons: {
              change: 'Change photo',
              add: 'Add photo',
            },
          },
          supportChatShortcut: {
            defaultLabel: 'Need help?',
            defaultDescription: 'Open the support chat and get personalized help in minutes.',
          },
          deviationAlert: {
            title: {
              warning: 'Possible deviation',
              danger: 'Major deviation',
            },
            message: 'The driver is {{distance}} away from the expected route.',
            distanceLabel: 'Distance to origin:',
          },
          documentImageViewer: {
            buttons: {
              viewDocument: 'View document',
              front: 'Front',
              back: 'Back',
              close: 'Close',
            },
          },
          driverOfferCard: {
            defaults: {
              driver: 'Driver',
              vehicle: 'Vehicle',
              vehicleUnknown: 'N/A',
              plateLabel: 'Plate:',
            },
            savings: {
              save: 'You save C${{amount}}',
              extra: 'C${{amount}} more',
              match: 'Estimated price',
            },
            distance: '📍 Distance to origin:',
            negotiation: {
              title: '📊 Negotiation range:',
              min: 'Minimum',
              max: 'Maximum',
            },
            price: {
              acceptedLabel: '✅ Accepted your price',
              offerLabel: '💰 Offers:',
              acceptRide: '🚀 Accept and start ride',
              viewOffer: '💬 View offer & negotiate',
              quickAccept: '✅ Accept C${{amount}}',
              pending: '⏳ Waiting for confirmation',
            },
            biometric: {
              title: 'Verify your identity',
              subtitle: 'Biometric confirmation is required to accept this ride.',
              fingerprint: '👆 Use fingerprint',
              faceId: '👤 Use Face ID',
              cancel: 'Cancel',
              errorTitle: 'Error',
              errorMessage: 'Biometric authentication failed.',
            },
          },
          priceNegotiationModal: {
            header: {
              title: 'Price negotiation',
            },
            driverInfo: {
              label: 'Driver: {{name}}',
              rating: '{{value}}',
            },
            summary: {
              estimatedLabel: 'Estimated price:',
              clientLabel: 'Your suggested price:',
              driverLabel: 'Driver offers:',
            },
            state: {
              accepted: {
                title: 'Driver accepted your price!',
                subtitle: 'Final price: C${{amount}}',
                button: 'Accept and start ride',
              },
              counterOffer: {
                title: 'Driver proposes: C${{amount}}',
                subtitle: 'You can accept the offer or send a counter-offer.',
              },
              waiting: {
                message: 'Waiting for the driver’s response...',
              },
            },
            counterOffer: {
              label: 'Or send a counter-offer:',
              rangeHint: 'Allowed range:',
              minLabel: 'Minimum',
              maxLabel: 'Maximum',
              placeholder: 'Ex: {{value}}',
              send: 'Send',
            },
            actions: {
              acceptOffer: 'Accept C${{amount}}',
            },
            alerts: {
              invalidInput: 'Enter a valid price.',
              minPrice: 'Minimum price is C${{amount}}.',
              maxPrice: 'Maximum price is C${{amount}}.',
            },
          },
          rideProgressIndicator: {
            client: {
              freeCancel: '✅ Cancel now and you will not be charged.',
              cashPenalty:
                '⚠️ If you cancel now you must pay C${{amount}} in cash to the driver ({{percent}}% of the trip).',
              cardPenalty:
                '⚠️ If you cancel now we will charge {{percent}}% of the trip (C${{amount}}).',
            },
            driver: {
              freeCancel: '✅ You can cancel without penalty.',
              cashPenalty:
                '⚠️ If you cancel now, a penalty will be applied (deducted from your earnings).',
              cardPenalty:
                '⚠️ If you cancel now, a penalty will be applied (trip commission).',
            },
            stats: '{{value}}%',
          },
          routeHistory: {
            loading: 'Loading route history...',
            empty: 'No route data available.',
            errors: {
              load: 'We could not load the route history.',
            },
            title: '📊 Trip statistics',
            stats: {
              points: 'Recorded points',
              distance: 'Total distance',
              duration: 'Duration',
              avgSpeed: 'Average speed',
              maxSpeed: 'Top speed',
            },
            duration: {
              short: '{{value}} min',
              long: '{{hours}}h {{minutes}}min',
            },
            timeline: {
              title: '🕐 Timeline',
              noSpeed: 'No speed',
              more: '... and {{count}} more points',
            },
          },
          routeHistoryMap: {
            loading: 'Loading route...',
            errors: {
              load: 'We could not load the route.',
            },
            empty: 'No route data available.',
            markers: {
              startTitle: 'Start',
              startDescription: 'Departure point',
              endTitle: 'End',
              endDescription: 'Arrival point',
            },
            info: '📍 {{count}} GPS points recorded',
          },
          webNotice: {
            title: '📱 Web mode – limited functionality',
            descriptionPrimary: 'This app is designed for mobile devices with GPS.',
            descriptionSecondary: 'Unavailable on web:',
            bullets: {
              maps: '• 🗺️ Google Maps (react-native-maps)',
              gps: '• 📍 Real-time GPS',
              tracking: '• 🚗 Driver tracking',
            },
            instructionsTitle: 'To test the full app:',
            instructions: {
              step1: '1. Download {bold|Expo Go} on your Android/iOS phone',
              step2: '2. Scan the QR code from the terminal',
              step3: '3. Enjoy all the features!',
            },
          },
          waypointList: {
            title: 'Intermediate destinations',
            placeholder: 'Enter intermediate stop address',
            orderLabel: 'Stop {{index}}',
            removeButton: '✕',
            addButton: '+ Add intermediate destination',
            info: 'You can drag destinations to change their order.',
          },
          termsModal: {
            title: 'Terms and conditions',
            version: 'Version {{version}}',
            selectorLabel: 'Choose document',
            body: 'By using this app, you accept our terms and conditions.',
            documents: {
              general: {
                label: 'General terms',
                version: 'Version {{version}}',
                body:
                  'RUNDI MOBILITY PLATFORM\n' +
                  'Effective date: 03/24/26\n\n' +
                  'I. DEFINITIONS\n' +
                  'For the purposes of these Terms and Conditions:\n' +
                  '• "Rundi" / "Platform" / "We": GrupoRZC, a natural person with RUC 0010205740009M, owner of the mobile application "Rundi", which acts as a technological intermediary between Users and Drivers.\n' +
                  '• "Driver" / "You": A natural person who registers on the Platform to offer transportation services to Users.\n' +
                  '• "User": A person who requests transportation services through the Platform.\n' +
                  '• "Services": Passenger ground transportation services offered by the Driver to Users.\n' +
                  '• "Commission": The amount the Driver pays Rundi for using the Platform for each completed trip.\n' +
                  '• "Trip Fare": The price agreed directly between the User and the Driver for the transportation Services.\n\n' +
                  'II. NATURE OF THE RELATIONSHIP\n' +
                  '2.1. Rundi is a technology application. Rundi does not provide transportation services. Our role is to connect Users who need transportation with independent Drivers who offer such services.\n' +
                  '2.2. Independent relationship. The relationship between Rundi and the Driver is of an independent commercial nature. Nothing in these Terms creates an employment, partnership, franchise, or agency relationship between Rundi and the Driver.\n' +
                  '2.3. Driver autonomy. As a Driver you:\n' +
                  '• Are free to accept or reject any trip request.\n' +
                  '• Set the price of your Services by negotiating directly with the User.\n' +
                  '• Determine your own work schedule.\n' +
                  '• Use your own vehicle and assume its operating costs.\n\n' +
                  'III. DRIVER REGISTRATION AND REQUIREMENTS\n' +
                  '3.1. Enrollment requirements. To register as a Driver on the Platform, you must meet the following requirements:\n' +
                  'Requirement | Description\n' +
                  'Age | Be over 18 years old.\n' +
                  'Driver\'s license | Hold a valid driver\'s license (category 3,1,2 or higher).\n' +
                  'Vehicle | Be the owner of, or have legal authorization to operate, a vehicle in good mechanical condition and with valid insurance.\n' +
                  'Documentation | Provide: ID copy, driver\'s license, registration card, vehicle insurance, and a clean police record.\n' +
                  'Verification | Undergo the document and identity verification process established by Rundi.\n' +
                  '3.2. Updating information. The Driver commits to keeping their information and documentation on the Platform up to date.\n' +
                  '3.3. Background checks. Rundi reserves the right to perform police and driving background checks on applicants.\n\n' +
                  'IV. COMMISSIONS AND PAYMENT METHODS\n' +
                  '4.1. Commission structure. For using the Platform, Rundi will charge the Driver a commission for each completed trip.\n' +
                  'Concept | Detail\n' +
                  'Per-trip commission | 15% car trips, 7.5% motorcycle trips, 25% designated driver (car), 12.5% designated driver (motorcycle)\n' +
                  'Collection method | Rundi balance, credit/debit card, or authorized top-up points\n' +
                  'Charge timing | At the end of the trip or when the Driver confirms arrival at the pickup point\n' +
                  '4.2. Commission changes. Rundi reserves the right to modify the commission percentage. Any change will be notified to the Driver at least 7 days in advance through the Platform. Continued use after the modification constitutes acceptance of the new commission.\n' +
                  '4.3. Balance top-ups. The Driver may top up their Rundi account via:\n' +
                  '• Credit or debit cards\n' +
                  '• Bank transfers\n' +
                  '• Authorized top-up points (Super Express, AM PM, among others)\n' +
                  '4.4. Negative balance. If the Driver\'s balance is insufficient to cover the commission, access to the Platform will be restricted until the amount is settled. Negative balances must be paid within 2 days after notification.\n' +
                  '4.5. Refunds. If the User cancels the trip before it begins, the commission will not be charged. If the charge was already made, it will be refunded within a maximum of 3 days.\n\n' +
                  'V. BILLING AND TAX OBLIGATIONS\n' +
                  '5.1. Commission invoicing. Rundi will issue an electronic invoice for the commissions charged to the Driver. The invoice will itemize the applicable VAT (15%) in accordance with Nicaragua\'s Tax Concertation Law.\n' +
                  '5.2. Driver\'s tax responsibility. THE DRIVER IS SOLELY RESPONSIBLE BEFORE THE TAX AUTHORITIES FOR THE INCOME OBTAINED FROM THEIR TRANSPORTATION SERVICES.\n' +
                  'Rundi does not withhold or pay taxes on behalf of the Driver. The Driver acknowledges that:\n' +
                  '• Payments received from Users constitute taxable income under Law 822.\n' +
                  '• They must register with the Dirección General de Ingresos (DGI) if their income exceeds the limits established by law.\n' +
                  '• They must comply with all municipal and national tax obligations applicable to their economic activity.\n' +
                  '5.3. Legal notice. Rundi recommends that the Driver seek advice regarding tax obligations. Failure to comply is the Driver\'s sole responsibility.\n\n' +
                  'VI. SERVICE OPERATION\n' +
                  '6.1. Trip process. Each trip will proceed as follows:\n' +
                  'Step | Description\n' +
                  '1 | The User posts a trip request and offers a price.\n' +
                  '2 | The Driver views the request and may accept, counteroffer, or reject it.\n' +
                  '3 | If both agree, a direct contract is formed between User and Driver.\n' +
                  '4 | The Driver heads to the pickup point.\n' +
                  '5 | Upon arrival, the Driver confirms presence through the app.\n' +
                  '6 | The transportation service is performed.\n' +
                  '7 | At the end, the commission is charged to the Driver.\n' +
                  '6.2. Prohibitions. The Driver may not:\n' +
                  '• Request additional payments outside the fare agreed on the Platform.\n' +
                  '• Allow third parties to use their account or take trips on their behalf.\n' +
                  '• Provide services under the influence of alcohol, drugs, or fatigue.\n' +
                  '• Discriminate against Users for any reason.\n\n' +
                  'VII. SAFETY AND LIABILITY\n' +
                  '7.1. Platform safety. Rundi implements reasonable safety measures, including:\n' +
                  '• Driver document verification.\n' +
                  '• Panic button (SOS) for emergencies.\n' +
                  '• Sharing trip data with trusted contacts.\n' +
                  '7.2. Limitation of liability. Rundi is NOT responsible for:\n' +
                  '• Damages, accidents, or incidents occurring during the Services.\n' +
                  '• The Driver\'s failure to comply with their legal obligations.\n' +
                  '7.3. Insurance. The Driver must keep their vehicle insured according to Nicaraguan law (mandatory traffic accident insurance—SOAT—and optional coverage if desired).\n\n' +
                  'VIII. SUSPENSION AND TERMINATION\n' +
                  '8.1. Grounds for suspension. Rundi may temporarily suspend the Driver\'s account if there is:\n' +
                  '• Poor performance or high cancellation rates.\n' +
                  '• Verified complaints from Users.\n' +
                  '• Breach of any of these provisions.\n' +
                  '• Unresolved negative balance.\n' +
                  '8.2. Permanent termination. The account will be permanently terminated for:\n' +
                  '• Fraudulent use of the Platform.\n' +
                  '• Identity theft.\n' +
                  '• Behavior that endangers User safety.\n' +
                  '• Serious violation of Nicaraguan law.\n\n' +
                  'IX. FINAL PROVISIONS\n' +
                  '9.1. Modifications. Rundi may modify these Terms at any time. Changes will be notified through the Platform and will be deemed accepted if the Driver continues using the app after 7 days.\n' +
                  '9.2. Governing law. These Terms are governed by the laws of the Republic of Nicaragua. Any dispute will be submitted to the competent courts of Managua.\n' +
                  '9.3. Contact. For inquiries, the Driver may contact Rundi via:\n' +
                  '• Email: support@gruporzc.com\n' +
                  '• In-app support\n\n' +
                  '________________________________________\n' +
                  'DRIVER DECLARATION\n' +
                  'By registering on the Rundi Platform, I declare that:\n' +
                  '1. I have read and understood these Terms and Conditions.\n' +
                  '2. I agree to pay the commissions established for using the Platform.\n' +
                  '3. I acknowledge that I am an independent contractor and not a Rundi employee.\n' +
                  '4. I assume sole responsibility for fulfilling my tax obligations with the DGI and local municipalities.\n' +
                  '5. I commit to providing transportation services in compliance with all applicable laws.\n' +
                  '________________________________________\n' +
                  'Additional recommendations\n' +
                  '1. Commission collection mechanism: Similar to inDrive in Nicaragua, you can use the prepaid top-up system. Drivers deposit balance at authorized points (Super Express, AM PM, etc.) or via bank transfer, and you deduct the commission from that balance.\n' +
                  '2. Visible notice in the app: Add a clear message on the driver registration screen indicating their tax responsibility. For example:\n' +
                  '"Rundi is a technology platform that connects Users with independent Drivers. As a Driver, you are responsible for meeting your tax obligations (DGI and local municipalities) for the income earned through your transportation services."\n' +
                  '3. Model documentation before the DGI: When you file your tax return, make sure the income you report corresponds exclusively to the commissions charged to drivers, not the total value of trips. Keep the trip reports generated by the app as supporting documentation.',
              },
              users: {
                label: 'Terms and conditions of use for users',
                version: 'Version {{version}}',
                body:
                  '\n' +
                  'RUNDI MOBILITY PLATFORM\n' +
                  'Effective date: 03/24/2026\n\n' +
                  'I. DEFINITIONS\n' +
                  '• "Rundi" / "Platform" / "We": GrupoRZC, a natural person with 0010205740009M, owner of the mobile application "Rundi", acting as a technological intermediary between Users and Drivers (regular mobility) or Designated Drivers.\n' +
                  '• "User": A person who requests services through the Platform, either regular mobility or designated-driver service.\n' +
                  '• "Driver": A natural person who uses their own vehicle to provide transportation services to Users via the Platform (regular mobility).\n' +
                  '• "Designated Driver": A natural person affiliated with Rundi who, at the User\'s request, drives the User\'s personal vehicle to their destination (designated-driver service).\n' +
                  '• "Service": Any of the services offered by the Platform as selected by the User.\n' +
                  '• "Commission": The amount the Driver or Designated Driver pays Rundi for using the Platform for each completed service.\n\n' +
                  'II. NATURE OF THE PLATFORM\n' +
                  '2.1. Rundi is a technology platform that connects Users with independent Drivers or Designated Drivers. We do not provide transportation or driving services; our sole function is to facilitate the connection between the parties.\n' +
                  '2.2. Drivers and Designated Drivers are independent contractors, not Rundi employees. Each is solely responsible for providing their services.\n\n' +
                  'III. SERVICES OFFERED\n' +
                  '3.1. Standard mobility service (Rundi Móvil):\n' +
                  'The User requests a trip and is transported by a Driver using their own vehicle. The fare is agreed directly between the User and the Driver through the Platform. Rundi charges the Driver a commission for using the app.\n' +
                  '3.2. Designated-driver service (Rundi Designado):\n' +
                  'The User requests a Designated Driver to travel to the User\'s vehicle, perform an inspection, and then drive the vehicle to the User\'s chosen destination. This service is intended for Users who, due to health, fatigue, or alcohol consumption, cannot drive.\n\n' +
                  'IV. DESIGNATED-DRIVER SERVICE PROCESS\n' +
                  '4.1. Request:\n' +
                  'The User selects "Rundi Designado" in the app, indicates their location, and specifies the destination.\n' +
                  '4.2. Arrival of the Designated Driver:\n' +
                  'The Designated Driver arrives at the indicated location using their own vehicle and presents themselves to the User.\n' +
                  '4.3. Inspection of the User\'s vehicle:\n' +
                  'Before driving, the Designated Driver performs a visual inspection of the User\'s vehicle in the User\'s presence and documents the condition by:\n' +
                  '• Taking photos of the vehicle\'s exterior and interior (tires, body, windshield, dashboard, seats, etc.).\n' +
                  '• Completing the inspection report generated in the app and digitally signed by both parties (the User accepts in the app).\n' +
                  '4.4. Transport:\n' +
                  'Once the inspection is complete and the User accepts, the Designated Driver drives the User\'s vehicle to the agreed destination.\n' +
                  '4.5. Completion:\n' +
                  'Upon arrival, the Designated Driver parks where the User indicates, hands over the keys, and ends the service.\n' +
                  '4.6. Commission:\n' +
                  'Rundi charges the Designated Driver a commission for the service, according to the terms applicable to designated drivers.\n\n' +
                  'V. USER RESPONSIBILITIES\n' +
                  '5.1. For both services:\n' +
                  '• Provide truthful information about location and destination.\n' +
                  '• Treat Drivers and Designated Drivers respectfully.\n' +
                  '• Comply with traffic laws when applicable.\n' +
                  '5.2. For the designated-driver service:\n' +
                  '• Declare and guarantee ownership or legal authorization for a third party to drive the vehicle provided to the Designated Driver.\n' +
                  '• Ensure the vehicle is in legal and mechanical condition to circulate (inspection, mandatory insurance, registration, etc.).\n' +
                  '• Accept that the Designated Driver carries out the inspection and that, if unsafe conditions are detected (worn tires, faulty lights, evident mechanical issues, lack of mandatory insurance, etc.), the Designated Driver may refuse the service without liability to Rundi.\n' +
                  '• Acknowledge that any pre-existing damage not documented during the inspection will not be attributed to the Designated Driver.\n\n' +
                  'VI. RESPONSIBILITIES OF THE DRIVER / DESIGNATED DRIVER\n' +
                  'Specific responsibilities for each provider type are described in their respective Terms and Conditions. In any case, Rundi is not responsible for:\n' +
                  '• The quality, safety, or compliance with traffic laws by Drivers or Designated Drivers.\n' +
                  '• Damages, accidents, fines, or any incidents occurring during the service.\n\n' +
                  'VII. PAYMENTS AND COMMISSIONS\n' +
                  '7.1. Service payment is made directly between the User and the Driver / Designated Driver according to the app agreement (cash, transfer, etc.). Rundi neither receives nor handles payments between Users and providers.\n' +
                  '7.2. The Driver or Designated Driver pays Rundi a commission for each completed service, following the current commission structure.\n' +
                  '7.3. In the designated-driver service, the User does not pay a commission to Rundi; the Designated Driver covers it from their earnings.\n\n' +
                  'VIII. RUNDI\'S LIMITATION OF LIABILITY\n' +
                  '8.1. Rundi acts solely as a technological intermediary. Therefore, we do not assume responsibility for:\n' +
                  '• Traffic accidents, vehicle damage, or personal injuries during the service.\n' +
                  '• Non-compliance with tax, labor, or social-security obligations by Drivers or Designated Drivers.\n' +
                  '• Theft, loss, or damage to belongings inside the vehicle.\n' +
                  '• Traffic fines incurred during the service.\n' +
                  '8.2. In the designated-driver service, the User accepts that Rundi is not responsible for pre-existing vehicle damages not documented during the inspection, nor for damages occurring during driving, unless intentional misconduct or gross negligence by the Designated Driver is proven by a final court ruling.\n\n' +
                  'IX. PERSONAL DATA AND PRIVACY\n' +
                  '9.1. Rundi collects and processes Users\' personal data according to our Privacy Policy available in the app.\n' +
                  '9.2. In the designated-driver service, the User consents to vehicle photos and inspection reports being captured and stored in our systems.\n\n' +
                  'X. MODIFICATIONS AND ACCEPTANCE\n' +
                  '10.1. Rundi may modify these Terms at any time. Modifications will be notified through the app and will be deemed accepted if the User continues using the Platform after 7 days.\n' +
                  '10.2. Registering for and using the app implies full acceptance of these Terms and Conditions.\n\n' +
                  'XI. GOVERNING LAW AND JURISDICTION\n' +
                  'These Terms are governed by the laws of the Republic of Nicaragua. Any dispute will be submitted to the competent courts of Managua.',
              },
              designated_driver: {
                label: 'Terms for designated drivers',
                version: 'Version {{version}}',
                body:
                  'RUNDI DESIGNATED SERVICE\n' +
                  'Effective date: 03/24/2026\n\n' +
                  'I. DEFINITIONS\n' +
                  '• "Rundi" / "Platform" / "We": GrupoRZC, a natural person with RUC 0010205740009M, owner of the "Rundi" mobile application.\n' +
                  '• "Designated Driver" / "You": A natural person who registers on the Platform to provide the service of driving Users\' vehicles.\n' +
                  '• "User": A person who requests the designated-driver service through the app.\n' +
                  '• "User\'s Vehicle": The private vehicle that the User makes available to be driven by the Designated Driver.\n' +
                  '• "Inspection": The visual and documentary verification of the User\'s vehicle carried out by the Designated Driver before driving.\n\n' +
                  'II. NATURE OF THE RELATIONSHIP\n' +
                  '2.1. The Designated Driver is an independent contractor, not a Rundi employee. You freely decide whether to accept or reject requests, set your own schedule, and use your own means of transportation (personal vehicle) to reach the meeting point.\n' +
                  '2.2. Rundi is not responsible for delivering the driving service; the Designated Driver bears exclusive responsibility.\n\n' +
                  'III. REQUIREMENTS TO BECOME A DESIGNATED DRIVER\n' +
                  'To register as a Designated Driver in Rundi you must meet:\n\n' +
                  'Requirement | Description\n' +
                  'Age | Be over 21 years old.\n' +
                  'License | Hold a valid driver\'s license in category 1, 2, 3 (or higher) with at least 3 years of experience.\n' +
                  'Documentation | Copy of ID, driver\'s license, up-to-date clean police record.\n' +
                  'Personal vehicle | Have a personal vehicle in good condition (used to travel to the User\'s location).\n' +
                  'Insurance | Your personal vehicle must have current mandatory accident insurance (SOA).\n' +
                  'Course | Pass Rundi\'s induction course covering inspection procedures and defensive driving.\n\n' +
                  'IV. SERVICE PROCESS\n' +
                  '4.1. Acceptance:\n' +
                  'When a request arrives, the Designated Driver may accept or reject it. Once accepted, they must head to the location indicated by the User.\n' +
                  '4.2. Mandatory inspection:\n' +
                  'Before driving the User\'s vehicle, the Designated Driver must follow Rundi\'s inspection procedure:\n' +
                  '• Take clear photos of:\n' +
                  '  o Vehicle plates\n' +
                  '  o All four tires (including tread and apparent pressure)\n' +
                  '  o Windshield and mirrors\n' +
                  '  o Body (front, sides, rear)\n' +
                  '  o Dashboard (odometer, warning lights)\n' +
                  '  o Interior (seats, mirrors, steering wheel)\n' +
                  '• Fill out the inspection report in the app, noting any issue or pre-existing damage.\n' +
                  '• Show the report to the User for confirmation. The User must sign digitally in the app.\n' +
                  '4.3. Refusal to provide the service:\n' +
                  'The Designated Driver may decline the service without penalty if:\n' +
                  '• The User refuses the inspection.\n' +
                  '• The vehicle shows unsafe conditions (worn tires, lights not working, evident mechanical failures, lack of mandatory insurance, etc.).\n' +
                  '• The User or the vehicle is under the influence of alcohol or drugs (and Rundi must be notified).\n' +
                  '4.4. Driving:\n' +
                  'Once the inspection is complete and accepted, the Designated Driver drives the User\'s vehicle to the indicated destination, complying with traffic laws.\n' +
                  '4.5. Handover:\n' +
                  'Upon arrival, the vehicle must be parked safely and the keys returned to the User. The service is then finalized in the app.\n\n' +
                  'V. COMMISSIONS AND INVOICING\n' +
                  '5.1. Commission structure:\n' +
                  'For each completed service, Rundi charges the Designated Driver a commission of [25 ]% of the amount agreed with the User. The commission is deducted from the Designated Driver\'s in-app balance.\n' +
                  '5.2. Commission payment methods:\n' +
                  'The Designated Driver must keep a sufficient balance via top-ups at authorized points (Super Express, AM PM, etc.) or bank transfers. If the balance is insufficient, the account will be suspended until regularized.\n' +
                  '5.3. Invoicing:\n' +
                  'Rundi issues an electronic invoice for commissions charged, itemizing VAT (15%). The Designated Driver is solely responsible for fulfilling municipal and national tax obligations with the DGI and local authorities.\n\n' +
                  'VI. DESIGNATED DRIVER OBLIGATIONS\n' +
                  '6.1. Drive prudently and follow all traffic laws.\n' +
                  '6.2. Do not consume alcohol, drugs, or substances that impair abilities while available in the app.\n' +
                  '6.3. Keep your personal vehicle in legal and mechanical compliance.\n' +
                  '6.4. Perform inspections diligently and truthfully. Any deliberate omission of pre-existing damage is cause for immediate termination.\n' +
                  '6.5. Notify Rundi immediately if any accident or incident occurs during the service.\n' +
                  '6.6. Treat the User with respect and professionalism.\n\n' +
                  'VII. LIMITATION OF LIABILITY\n' +
                  '7.1. Rundi is not responsible for damage to the User\'s vehicle while it is being driven. The Designated Driver is directly responsible to the User and the authorities.\n' +
                  '7.2. Rundi recommends that the Designated Driver obtain liability insurance covering possible damage to third-party vehicles (traditional insurance on the User\'s vehicle may not cover third-party driving; it is the Designated Driver\'s duty to check coverage).\n' +
                  '7.3. In case of a traffic accident, the Designated Driver must follow Nicaraguan law (gather information, request Traffic Police presence, etc.) and notify Rundi within 24 hours.\n\n' +
                  'VIII. SUSPENSION AND TERMINATION\n' +
                  '8.1. Rundi may suspend or terminate the Designated Driver\'s account for:\n' +
                  '• Failing to follow the inspection procedure.\n' +
                  '• Verified User complaints about risky driving or inappropriate behavior.\n' +
                  '• Document fraud.\n' +
                  '• Not maintaining sufficient balance to pay commissions.\n' +
                  '• Driving under the influence of alcohol or drugs (immediate termination).\n\n' +
                  'IX. FINAL PROVISIONS\n' +
                  '9.1. Rundi may modify these Terms with notice via the app. Continued use after 7 days constitutes acceptance.\n' +
                  '9.2. These Terms are governed by Nicaraguan law. Any dispute will be submitted to the courts of Managua.\n' +
                  '________________________________________\n' +
                  'DESIGNATED DRIVER DECLARATION\n' +
                  'By registering as a Designated Driver in Rundi, I declare that:\n' +
                  '• I have read and understood these Terms.\n' +
                  '• I agree to carry out the inspection and photographic documentation as required.\n' +
                  '• I acknowledge my status as an independent contractor.\n' +
                  '• I assume full responsibility for my conduct when driving Users\' vehicles.',
              },
            },
            checkboxLabel: 'I have read and accept the terms and conditions.',
            acceptButton: 'Accept',
            saving: 'Saving...',
            close: 'Close',
          },
          profilePhotoCapture: {
            label: 'Profile photo',
            buttons: {
              instructions: 'ℹ️ Instructions',
              take: '📷 Take profile photo',
              retake: '🔄 Take new photo',
            },
            states: {
              uploading: 'Uploading photo...',
              empty: 'No photo',
            },
            alerts: {
              permissionTitle: 'Camera permission required',
              permissionMessage:
                'We need access to your camera to take the profile photo. This is required to verify your identity.',
              errorTitle: 'Error',
              errorMessage: 'We could not take the photo. Try again.',
            },
            instructions: {
              title: '📸 Profile photo instructions',
              message:
                '• Remove sunglasses\n• Make sure you have good lighting\n• Look directly at the camera\n• Your face must be clearly visible\n• Do not use filters or edits\n• The photo must be recent\n\nThis photo is REQUIRED to verify your identity and keep clients safe.',
              confirm: 'Got it',
            },
            warning: {
              intro: 'Important:',
              message:
                'Your profile photo is required. Your face must be clearly visible without sunglasses. It will be used to verify your identity.',
            },
          },
         SupportChatShortcut: {
          
         },
        },

        statuses: {
          pending: 'Pending',
          active: 'Active',
          completed: 'Completed',
          cancelled: 'Cancelled',
          inProgress: 'In progress',
          scheduled: 'Scheduled',
          offline: 'Offline',
          online: 'Online',
          error: 'Error',
        },
        labels: {
          email: 'Email',
          phone: 'Phone',
          password: 'Password',
          language: 'Language',
          theme: 'Theme',
          notifications: 'Notifications',
          profile: 'Profile',
          vehicle: 'Vehicle',
          driver: 'Driver',
          passenger: 'Passenger',
          map: 'Map',
          settings: 'Settings',
          home: 'Home',
          help: 'Help',
        },
        messages: {
          genericError: 'Something went wrong. Please try again.',
          networkError: 'Network error. Check your connection.',
          offline: 'You appear to be offline.',
          confirmExit: 'Are you sure you want to exit?',
          confirmDelete: 'Are you sure you want to delete this?',
          loading: 'Loading...',
        },
        roles: {
          driver: 'Driver',
          client: 'Client',
          designated_driver: 'Designated driver',
          admin: 'Admin',
          default: 'User',
        },
        ride: {
          pickup: 'Pickup',
          dropoff: 'Drop-off',
          eta: 'ETA',
          distance: 'Distance',
          price: 'Price',
          payment: 'Payment',
          driver: 'Driver',
          rider: 'Client',
          seat: 'Seat',
        },
        payment: {
          loading: 'Loading...',
          header: {
            titleDefault: 'Trip Payment',
            titlePending: 'Pending Payment',
            subtitleDefault: 'Complete your payment securely',
            subtitlePending: 'Your trip has ended. Please complete the payment to continue.',
          },
          summary: {
            title: 'Trip summary',
            origin: 'Origin',
            destination: 'Destination',
            distance: 'Distance',
            notAvailable: 'N/A',
          },
          cost: {
            title: 'Cost breakdown',
            fare: 'Trip fare',
            tip: 'Tip',
            total: 'Total to pay',
          },
          tip: {
            title: 'Would you like to add a tip?',
            customLabel: 'Or enter a custom amount:',
            placeholder: 'C$0.00',
          },
          paymentMethod: {
            title: 'Payment method',
            cardTitle: 'Credit/Debit card',
            cardSubtitle: 'Select your bank below',
            cashTitle: 'Cash',
            cashSubtitle: 'Pay your driver',
            cashUnavailable: 'Not available for pending payments',
          },
          savedCards: {
            title: 'Your cards',
            manageLink: 'Manage →',
            defaultBadge: 'Default',
            newCardTitle: 'New card',
            newCardSubtitle: 'Add a payment method',
          },
          banks: {
            title: 'Choose your bank',
            selectLabel: 'Select your bank:',
          },
          buttons: {
            payCard: 'Pay with card',
            payCardPending: 'Pay now',
            payCash: 'Confirm cash payment',
          },
          security: {
            message: 'Your information is protected with bank-level encryption.',
          },
          alerts: {
            missingCardNumber: 'Enter the card number.',
            missingCardHolder: 'Enter the cardholder name.',
            invalidExpiry: 'Enter the expiration date in MM/YY or MM/YYYY format.',
            invalidCVV: 'Enter a valid CVV (3 or 4 digits).',
            missingBank: 'Select a bank.',
            saveCardSuccessTitle: 'Card saved',
            saveCardSuccessMessage: 'Your {{brand}} card **** {{last4}} has been saved successfully.',
            saveCardError: 'We could not save the card.',
            changeMethodError: 'We could not change the payment method.',
            cardSuccessTitle: 'Payment completed',
            cardSuccessMessage: 'Your payment of C${{amount}} was processed successfully.',
            cardError: 'We could not process the payment.',
            cashInfoTitle: 'Cash payment',
            cashInfoMessage: 'Please pay C${{amount}} in cash to your driver. They will confirm receipt.',
          },
          biometric: {
            prompt: 'Confirm your identity to pay C${{amount}}',
            error: 'We could not confirm your identity. Try again.',
          },
          currencyAmount: 'C${{amount}}',
        },
        backgroundTracking: {
          foregroundService: {
            title: 'Location tracking active',
            body: 'Your location is being shared.',
          },
          driver: {
            title: 'Driver available',
            body: 'Sharing your location to receive nearby rides.',
          },
          client: {
            title: 'Ride under monitoring',
            body: 'Your ride is still active and we are monitoring your location.',
          },
        },
        auth: {
          errors: {
            notAuthenticated: 'User not authenticated.',
            emailRequired: 'Email is required.',
            passwordMin: 'Password must be at least 6 characters.',
            phoneFormatInvalidExample: 'Invalid phone format. Use {{example}}.',
            phoneFormatInvalidInternational:
              'Invalid phone format. Use an international number (+Country code and number).',
            verificationStartFailed: 'We could not start the phone verification. Please try again.',
            verificationMissing: 'We could not find an active verification. Please request a new code.',
            verificationNotFound: 'We could not find an active verification request. Please request a new code.',
            codeSixDigits: 'The code must be 6 digits.',
            codeInvalid: 'The code you entered is not valid. Check the SMS and try again.',
            codeMismatch: 'The code you entered does not match the SMS. Verify it and try again.',
            codeExpired: 'The code has expired. Tap “Resend code” to get a new one.',
            tooManyAttempts: 'You have made too many attempts. Wait a few minutes before trying again.',
            networkIssue:
              'We could not complete the request because of a network issue. Check your connection and try again.',
            smsSendGeneric: 'We could not send the SMS code. Please try again.',
            smsInvalidPhone: 'The phone number is not valid. Use the international format (+Country code and number).',
            smsTooManyRequests: 'You requested too many codes in a short time. Wait a few minutes before trying again.',
            smsQuotaExceeded: 'The SMS sending quota was reached for now. Try again later.',
            smsNetworkError: 'We could not connect to send the SMS. Check your connection and try again.',
            confirmGenericFailure: 'We could not confirm the code. Please try again.',
          },
        },
        searchRide: {
          defaults: {
            locationFallback: 'Selected location',
            origin: 'Origin point',
            destination: 'Destination',
            currentLocation: 'Current location',
            myLocation: 'My location',
            serviceFallback: 'Service',
          },
          alerts: {
            unavailableZoneTitle: 'Service temporarily unavailable',
            unavailableZoneMessage: 'This location is currently outside our service coverage.',
            selectValidPointTitle: 'Select a valid point',
            selectValidPointMessage: 'You must choose an exact location.',
            selectValidOriginMessage: 'You need to choose the exact origin point.',
            selectValidDestinationMessage: 'You need to choose the exact destination.',
            selectValidStopMessage: 'You need to choose the exact location of the stop.',
            destinationPromptTitle: 'Select your destination',
            destinationPromptMessage: 'You can now pick your final destination via search or the map.',
            vehiclePhotoRequired: 'Please provide a photo of your vehicle to request a designated driver.',
            vehiclePhotoUploadError: 'Vehicle photo upload failed. Please try again.',
            vehiclePhotoProcessTitle: 'Processing photo',
            vehiclePhotoProcess: 'We are processing your photo. Please wait before confirming.',
            loginRequired: 'Please sign in to request a ride.',
            photoLoginRequired: 'Please sign in to upload your vehicle photo.',
            destinationRequired: 'Tap the map to select your destination.',
            invalidAmount: 'Enter a valid amount.',
            priceCalculationFailed: 'Could not calculate the route.',
            locationUnavailableTitle: 'Location unavailable',
            locationUnavailableMessage: 'Enable your location or try again later.',
            serviceValidationFailed: 'We could not validate the selected zone. Check your connection and try again.',
            photoPermissionsTitle: 'Permissions needed',
            photoPermissionsMessage: 'Camera access is required.',
            photoOptionsTitle: 'Vehicle photo',
            photoOptionsMessage: 'Choose an option',
            photoOptionsCamera: 'Take photo',
            photoOptionsGallery: 'Gallery',
            photoOptionsCancel: 'Cancel',
            photoSelectedTitle: 'Photo selected',
            photoSelectedMessage: 'It will upload when you confirm your ride.',
            photoUploadedTitle: 'Photo uploaded',
            photoUploadedMessage: 'Your vehicle has been registered.',
            photoUploadFailed: 'Vehicle photo upload failed. Please try again.',
            photoCaptureFailed: 'We could not capture the photo. Please try again.',
            locationFetchFailed: 'We could not get the selected location. Try another search.',
            biometricRequiredTitle: 'Fingerprint required',
            biometricRequiredMessage: 'Fingerprint authentication is required for this service.',
            biometricUnavailableTitle: 'Biometrics unavailable',
            biometricUnavailableMessage: 'Your device has no biometric authentication configured. We will continue with a manual record.',
            biometricGenericError: 'Fingerprint verification failed. Please try again.',
            identityRequired: 'You must confirm your identity with your fingerprint.',
            biometricFallbackLabel: 'Enter passcode',
            requestError: 'Could not submit your ride request.',
            motoSelectedTitle: 'Motorcycle selected',
            designatedDriverMotoTitle: 'Designated driver on motorcycle',
            singlePassengerMessage: 'Motorcycles can only carry 1 passenger.',
          },
          mapSelection: {
            defaultTitle: 'Select a location',
            originTitle: 'Set the origin',
            originMessage: 'Move the map to your starting point.',
            destinationTitle: 'Select your destination',
            destinationMessage: 'Move the map to your final destination.',
            newStopTitle: 'New stop',
            newStopMessage: 'Tap the map to add stop {{index}}.',
            editStopTitle: 'Edit stop',
            editStopMessage: 'Tap the map to update stop {{index}}.',
          },
          labels: {
            selectingLocation: 'Select a location',
            setOrigin: 'Set origin',
            setDestination: 'Choose destination',
            newStop: 'New stop',
            editStop: 'Edit stop {{index}}',
            extraStopHint: 'Tap the map to add stop {{index}}.',
            selectOrigin: 'Choose your exact origin.',
            selectDestination: 'Choose your exact destination.',
            selectStop: 'Choose the exact location of the stop.',
            searchPlaceholder: 'Search for places',
            useCurrentLocation: 'Use current location',
            favorites: 'Favorites',
            recent: 'Recent',
            noResults: 'No matches found.',
            searching: 'Searching...',
            passengers: 'Passengers',
            passengersCount_one: '{{count}} passenger',
            passengersCount_other: '{{count}} passengers',
            paymentMethod: 'Payment method',
            priceSuggestion: 'Suggested price',
            pricePlaceholder: 'C$0.00',
            comment: 'Comment',
            commentPlaceholder: 'Trip details...',
            designatedDriverPhoto: 'Vehicle photo',
            addVehiclePhoto: 'Add photo',
            changeVehiclePhoto: 'Change photo',
            removeVehiclePhoto: 'Remove photo',
            confirmRequest: 'Confirm request',
            confirmRequestDisabled: 'Add destination and route',
            sendingRequest: 'Sending request…',
            driversAvailableTitle: 'Drivers available',
            driversAvailableDescription: 'We found drivers nearby',
            driversUnavailableTitle: 'No drivers nearby',
            driversUnavailableDescription: 'We will notify you when new drivers are available.',
            searchingAddress: 'Looking up address…',
            originPlaceholder: 'Select the origin',
            destinationPlaceholder: 'Select your destination',
            stopLabel: 'Stop {{index}}',
            inlineAddStop: 'Add extra destination',
            calculating: 'Calculating…',
            priceApproximation: '~C${{value}}',
            etaValue: '~{{minutes}} min',
            etaUnavailable: 'No ETA',
            viewOptions: 'View options',
          },
          vehicle: {
            motoLabel: 'Motorcycle',
            motoSubtitle: 'Agile and affordable trips',
            autoLabel: 'Car',
            autoSubtitle: 'Comfortable rides for up to 4 people',
            designatedLabel: 'Designated driver',
            designatedSubtitle: 'We drive you home in your car',
            recommendedBadge: 'Recommended',
            recommendationLabel: 'Recommended fare',
            modeLabel: 'Designated driver for:',
            modeAuto: 'Car',
            modeMoto: 'Motorcycle',
          },
          photo: {
            hint: 'Vehicle photo (required for designated driver):',
            buttonDefault: 'Take/Select photo',
            buttonChange: 'Change photo',
            buttonProcessing: 'Processing…',
          },
          notes: {
            designatedDriver: 'Designated driver: the client wants you to drive their vehicle.',
          },
          summary: {
            title: 'Summary and Price',
            distance: 'Distance',
            duration: 'Time',
            estimate: 'Estimate',
            calculatingRoute: 'Calculating route…',
          },
          payment: {
            cash: 'Cash',
            card: 'Card',
          },
          availability: {
            checking: 'Looking for drivers nearby…',
            low: 'Few or no drivers nearby right now',
            ok: 'Drivers available',
            unknown: 'Availability unknown',
          },
          search: {
            selectionOriginTitle: 'Origin',
            selectionDestinationTitle: 'Final destination',
            selectionNewStopTitle: 'New stop ({{current}}/{{max}})',
            selectionEditStopTitle: 'Edit stop {{index}}',
            selectionGenericTitle: 'Location',
            descriptionOrigin: 'Type an address or use your current location.',
            descriptionDestination: 'Search an address or pick it on the map.',
            descriptionExtra: 'You can search or pick the intermediate stop on the map.',
            descriptionGeneric: 'Search or pick a location on the map.',
            inputLabel: 'Search location',
            placeholderOrigin: 'Search origin…',
            placeholderDestination: 'Search destination…',
            placeholderDestinationReference: 'Ex: Conchita Palacios',
            placeholderStop: 'Search stop…',
            placeholderGeneric: 'Search location…',
            close: 'Close',
            useCurrentLocation: 'Use my location',
            pickOnMap: 'Select on map',
            destinationGuidanceTitle: 'Reference destination?',
            destinationGuidanceBody:
              'If you write a local reference, finish by selecting a result or using the map to pin the exact point.',
            destinationGuidanceStep1: '1) Write an exact location',
            destinationGuidanceStep2: '2) Pin exact point',
            destinationConfirmed: 'Destination confirmed on map',
            loading: 'Searching locations…',
            error: 'We could not search for locations.',
          },
          cta: {
            primary: 'Confirm and request ride',
            primaryScheduled: 'Confirm and schedule ride',
            loading: 'Sending request…',
            submittingOverlay: 'Sending your request…',
          },
          accessibility: {
            back: 'Go back',
            addExtraStop: 'Add extra destination',
            payCash: 'Pay in cash',
            payCard: 'Pay with card',
          },
        },
       services: {
          biometricService: {
            prompts: {
              reason: 'Confirm your identity',
              fallbackLabel: 'Use PIN',
            },
            errors: {
              notSupported: 'This device does not support biometrics.',
              notEnrolled: 'No biometric data is registered on this device.',
              authFailed: 'Biometric authentication failed.',
              unknown: 'Unknown error.',
              appleNotAvailable: 'Sign in with Apple is not available on this device.',
              appleNoToken: 'Apple Sign-In did not return an identity token.',
              appleCanceled: 'Apple Sign-In was canceled.',
            },
            modal: {
              title: 'Identity verification',
              scanning: 'Scanning biometrics…',
              pinFallback: 'Biometric scan unavailable. Continue with your device PIN.',
              appleSignIn: 'Verifying your identity with Apple ID…',
              success: 'Identity verified successfully.',
              retry: 'Verification failed. Retrying…',
            },
          },
          auth: {
            accountLinkingService: {
              errors: {
                notAuthenticated: 'You need to sign in to continue.',
                smsRequiresNative: 'SMS verification requires a native development or production build.',
                sendCodeFailed: 'We could not start the phone verification. Please try again.',
                missingVerificationId: 'We could not start the phone verification. Please try again.',
                noActiveVerification: 'No active verification found. Request a new code.',
                smsNotAvailableExpoGo: 'SMS verification is not available in Expo Go.',
                nativeAccessFailed: 'We could not access native Firebase. Use a development build.',
              },
              validation: {
                emailRequired: 'Email is required.',
                passwordLength: 'Password must be at least 6 characters.',
                phoneFormat: 'Enter a valid phone number like +505 XXXX XXXX.',
                codeLength: 'The code must be 6 digits.',
              },
            },
            firebaseAuthService: {
              errors: {
                registerInvalid: 'We could not complete your registration.',
                userProfileNotFound: 'User profile not found.',
                profileNotFound: 'Profile not found.',
                availabilityFailed: 'We could not validate account availability. Please try again later.',
                invalidIdToken: 'Invalid idToken for shared session generation.',
                customTokenMissing: 'The server response did not include a valid custom token.',
                sessionSyncFailed: 'We could not sync the session with the backend. Please try again later.',
              },
            },
            googleAuthService: {
              errors: {
                registerFailed: 'We could not finish signing you up with Google.',
                emailMissing: 'We could not get your Google account email.',
                loginFailed: 'We could not sign you in with Google.',
                profileNotFound: 'Profile not found.',
              },
            },
            localAuthService: {
              errors: {
                registerFailed: 'We could not register your account.',
                loginFailed: 'We could not sign you in.',
                logoutFailed: 'We could not sign you out. Please try again.',
              },
            },
            phoneAuthService: {
              errors: {
                invalidPhoneFormat: 'Enter a valid international number (+country code and number).',
                smsSendFailed: 'We could not send the SMS code. Please try again.',
                invalidPhoneNumber: 'The phone number is invalid. Check the international format.',
                smsTooManyRequests: 'You requested too many codes. Please wait before trying again.',
                smsQuotaExceeded: 'SMS quota reached for now. Please try again later.',
                smsNetworkError: 'We could not connect to send the SMS. Check your connection and retry.',
                noActiveVerification: 'No active verification found. Request a new code.',
                codeLength: 'Enter the 6-digit code from your SMS.',
                confirmFailed: 'We could not verify the code. Please try again.',
                invalidVerificationCode: 'The code does not match the SMS. Check it and try again.',
                codeExpired: 'The code has expired. Tap “Resend code” to get a new one.',
                confirmTooManyRequests: 'You tried too many times. Please wait before trying again.',
                confirmNetworkError: 'We could not verify the code due to a network issue. Check your connection.',
                smsRequiresBuild: 'SMS verification is only available in development/production builds.',
                nativeFirebaseUnavailable: 'Native Firebase Auth is not available. Use a development build.',
              },
            },
          },
         notificationService: {
           channels: {
             default: 'Rundi notifications',
             activeRide: 'Active ride',
           },
           quickReturnActiveRide: {
             title: 'Return to your active ride',
             body: 'Tap to return to your current ride details.',
           },
           newRide: {
             title: 'New ride available',
             body: 'Ride from {{origin}} · {{distance}} · {{price}}',
             originFallback: 'Origin not available',
           },
           rideAccepted: {
             title: 'Your ride was accepted',
             body: '{{driverName}} is heading your way.',
             driverFallback: 'Driver',
           },
           rideStarted: {
             title: 'Your trip has started',
             body: 'Enjoy your ride.',
           },
           rideCompleted: {
             title: 'Trip completed',
             body: 'Thanks for riding with Rundi.',
           },
           rideCanceled: {
             title: 'Ride canceled',
             body: 'The ride was canceled.',
           },
           formats: {
             priceCordoba: 'C${{amount}}',
             distanceKm: '{{value}} km away',
           },
         },
         alertService: {
           titles: {
             error: 'Error',
             important: 'Important',
             permissionsRequired: 'Permissions required',
           },
           messages: {
             locationPermissionRequired: 'Location access is required to use this feature.',
             locationAccessFailed: 'We could not access your location.',
           },
           buttons: {
             cancel: 'Cancel',
             confirm: 'Confirm',
             navigate: 'Navigate',
             understood: 'Got it',
             goToSettings: 'Go to Settings',
           },
         },
         backgroundLocationService: {
           foregroundService: {
             title: 'Location tracking active',
             body: 'Your location is being shared.',
           },
           driverStatus: {
             title: 'Driver available',
             body: 'Sharing your location to get nearby rides.',
           },
           clientStatus: {
             title: 'Trip under monitoring',
             body: 'Your ride is active and we are monitoring your location.',
           },
         },
         cardsService: {
           errors: {
             addFailed: 'We could not add the card.',
             addGeneric: 'An error occurred while adding the card.',
             defaultFailed: 'We could not set the default card.',
             defaultGeneric: 'An error occurred while setting the default card.',
             deleteFailed: 'We could not delete the card.',
             deleteGeneric: 'An error occurred while deleting the card.',
           },
         },
         driversService: {
           errors: {
             availabilityLimit:
               'You cannot go online: you have 10 or more pending commissions. Pay them from “Pay commissions”.',
             notAuthenticated: 'User not authenticated. Please sign in.',
             updateFailed: 'We could not update the driver status.',
             profileFetchFailed: 'We could not load the driver profile.',
             profileUpdateFailed: 'We could not update the driver profile.',
           },
         },
         earningsService: {
           errors: {
             statsFailed: 'We could not load your earnings stats.',
             earningsByDayFailed: 'We could not load the earnings by day.',
             pendingCashFailed: 'We could not load your pending cash rides.',
             createRechargeFailed: 'We could not create the cash recharge.',
             rechargesFailed: 'We could not load your recharge history.',
           },
         },
         inspectionsService: {
           errors: {
             saveFailed: 'We could not save the inspection.',
            requiredEvidenceMissing: 'Capture all six photos and confirm that the documents are current.',
             missingData: 'No data was returned after saving the inspection.',
             fetchFailed: 'We could not load the inspection.',
             listFailed: 'We could not load the inspections list.',
           },
         },
         locationTrackingService: {
           errors: {
             savePoint: 'We could not save the location point.',
             saveBatch: 'We could not save the location batch.',
             routeFailed: 'We could not calculate the route.',
             routeUnavailable: 'Route calculation is unavailable right now.',
             reverseGeocodeFailed: 'We could not fetch the address.',
             reverseGeocodeUnavailable: 'Address lookup is unavailable right now.',
             geocodeFailed: 'We could not fetch the coordinates.',
             geocodeUnavailable: 'Coordinate lookup is unavailable right now.',
             placesSearchFailed: 'We could not search for nearby places.',
             placesSearchUnavailable: 'Search is unavailable right now.',
             distanceFailed: 'We could not calculate the distance.',
             distanceUnavailable: 'Distance calculation is unavailable right now.',
             deleteRideLocations: 'We could not delete the ride locations.',
             routeSaveFailed: 'We could not save the ride route.',
             updateWaypointFailed: 'We could not update the waypoint.',
             deleteWaypointFailed: 'We could not delete the waypoint.',
             reorderWaypointsFailed: 'We could not reorder the waypoints.',
           },
         },
         paymentsService: {
           errors: {
             rideIdRequired: 'Ride ID is required.',
             amountPositive: 'Amount must be greater than 0.',
             invalidResponse: 'Invalid server response.',
             createFailed: 'We could not create the payment intent.',
           },
         },
         phoneLoginService: {
           messages: {
             codeSent: 'We sent a code to your phone number.',
             codeResent: 'Verification code resent successfully.',
           },
           defaults: {
             userName: 'User',
           },
           errors: {
             invalidPhoneFormat: 'Invalid phone format. Use the international format (+Country code and number).',
             requestFailed: 'We could not request the SMS code.',
             verifyCodeLength: 'The code must be 6 digits.',
             noFirebaseUser: 'We could not get the user after verifying the code.',
             verifyFailed: 'We could not verify the code.',
             resendFailed: 'We could not resend the verification code.',
           },
         },
         priceNegotiationService: {
           errors: {
             invalidNumber: 'Price must be a valid number.',
             minPrice: 'The minimum allowed price is C${{value}}.',
             maxPrice: 'The maximum allowed price is C${{value}}.',
             negotiateFailed: 'We could not negotiate the price.',
             notAuthenticated: 'User not authenticated. Please sign in again.',
             acceptClientPriceFailed: 'We could not accept the client price.',
             acceptDriverOfferFailed: 'We could not accept the driver offer.',
             acceptCounterOfferFailed: 'We could not accept the counteroffer.',
             rejectCounterOfferFailed: 'We could not reject the counteroffer.',
             sendOfferFailed: 'We could not send the offer.',
           },
         },
         registrationService: {
           errors: {
             requiredNameRole: 'Name and role are required.',
             invalidMethod: 'Invalid registration method.',
             emailPasswordRequired: 'Email and password are required for this method.',
             phoneVerificationRequired: 'A verified phone number is required for SMS registration.',
             driverDataRequired: 'Driver and vehicle data are required.',
             googleTokenMissing: 'Google token is missing to complete the registration.',
             googleAuthFailed: 'We could not authenticate with Google.',
             invalidServerResponse: 'Invalid server response.',
             createUserFailed: 'We could not create the user.',
             completeDriverFailed: 'We could not complete the driver registration.',
             upgradePhoneVerification: 'You must verify your phone number before completing the driver registration.',
             upgradePreconditionFailed: 'We could not upgrade your account. Check your information and try again.',
             upgradeFailed: 'We could not upgrade your account to driver. Please try again later.',
           },
           validation: {
             emailInvalid: 'Enter a valid email address.',
             nameTooShort: 'Name must be at least 2 characters.',
             phoneFormat: 'Phone must be in the format +505 XXXX XXXX.',
             roleInvalid: 'Select a valid role.',
             passwordLength: 'Password must be at least 6 characters.',
             licenseInvalid: 'Enter a valid license number.',
             plateInvalid: 'Enter a valid vehicle plate.',
             brandRequired: 'Vehicle brand is required.',
             modelRequired: 'Vehicle model is required.',
             yearInvalid: 'Enter a valid vehicle year.',
             colorRequired: 'Vehicle color is required.',
             typeInvalid: 'Select a valid vehicle type.',
           },
         },
         ridesService: {
           errors: {
             clientIdRequired: 'Client ID is required.',
             locationsRequired: 'Origin and destination are required.',
             estimatedPricePositive: 'Estimated price must be greater than 0.',
             scheduledAtRequired: 'Choose an hour is required to create a programmed ride.',
             invalidServerResponse: 'Invalid server response.',
             rideDetailsFailed: 'We could not load the ride details.',
             driverOnRouteFailed: 'We could not update the ride status to “on route”.',
            driverArrivedFailed: 'We could not mark your arrival.',
             unsupportedStatus: 'Unsupported ride status: {{status}}.',
           },
         },
         servicesService: {
           messages: {
             defaultName: 'Service',
           },
           errors: {
             fetchFailed: 'We could not load the services.',
           },
         },
         supabaseStorage: {
           errors: {
             missingUri: 'Image URI is required.',
             uploadFailed: 'We could not upload the image.',
             deleteFailed: 'We could not delete the image.',
           },
         },
         trackingService: {
           errors: {
             subscribeFailed: 'We could not subscribe to the ride.',
           },
         },
         uploadService: {
           errors: {
             processImage: 'We could not process the image.',
             processImages: 'We could not process the images.',
           },
         },
         userManagementService: {
           errors: {
             notAuthenticated: 'No authenticated user found.',
             wrongPassword: 'Incorrect password. Please check your credentials.',
             userNotFound: 'User not found.',
             tooManyRequests: 'Too many attempts. Please try again later.',
             deleteAccountFailed: 'We could not delete your account. Please try again later.',
             deleteDataFailed: 'We could not delete the user data.',
             emailMismatch: 'Enter the same email that is currently logged in.',
           },
         },
         vehiclesService: {
           errors: {
             notAuthenticated: 'User not authenticated.',
             addVehicleFailed: 'We could not add the vehicle.',
             switchVehicleFailed: 'We could not switch the vehicle.',
             updateVehicleFailed: 'We could not update the vehicle.',
             vehicleIdRequired: 'Vehicle ID is required.',
           },
         },
         fcm: {
            rideRequested: {
              title: 'Ride requested',
              body: 'We are looking for a driver for you.',
            },
            proximityRide: {
              title: 'Nearby ride',
              body: 'A new ride is available near you.',
            },
            fallback: {
              title: 'New notification',
              body: 'You have a new update in Rundi.',
            },
            alerts: {
              authErrorTitle: 'Not authenticated',
              authErrorMessage: 'Please sign in to continue.',
              testSuccessTitle: 'Success',
              testSuccessMessage: 'Test notification sent.',
              testErrorTitle: 'Error',
              testErrorMessage: 'Could not send the notification.',
            },
          },
       },
      },
     authScreens: {
            landing: {
              title: 'Welcome',
              subtitle: 'Your ride starts here',
              login: 'Log in',
              register: 'Create account',
            },
            login: {
              title: 'Welcome',
              subtitle: 'Log in to continue',
              tabs: {
                email: 'Email',
                phone: 'Phone',
              },
              fields: {
                emailLabel: 'Email',
                emailPlaceholder: 'you@email.com',
                passwordLabel: 'Password',
                passwordPlaceholder: '••••••••',
                phoneLabel: 'Phone number',
                phoneHelper: 'You will receive an SMS code to verify your identity.',
              },
              buttons: {
                loginEmail: {
                  idle: 'Log in',
                  loading: 'Logging in...',
                },
                loginPhone: {
                  idle: 'Send SMS code',
                  loading: 'Sending...',
                },
                register: 'Don’t have an account? Sign up',
              },
              divider: 'OR',
              alerts: {
                emailRequired: 'Enter your email.',
                passwordRequired: 'Enter your password to continue.',
                genericError: 'We could not log you in. Please try again.',
                invalidCredentials: 'The email or password you entered is incorrect. Please check and try again.',
                tooManyAttempts: 'Too many failed attempts. Wait a few minutes before trying again.',
                phoneInvalid: 'Enter a valid phone number in international format (+Country code).',
                smsError: 'We could not request the SMS code.',
              },
            },
            emailVerification: {
              title: 'Email verification',
              subtitle: 'Enter the long code from the link Firebase sent to:',
              label: 'Code',
              codePlaceholder: 'Tap here to paste your code',
              attemptsRemaining: 'Attempts remaining: {{remaining}} / {{max}}',
              verifyButton: 'Verify',
              resendIn: 'Resend in {{seconds}}s',
              resendButton: 'Resend code',
              verifyByLinkButton: 'I already verified my email',
              cancel: 'Cancel register',
              cancelConfirm: 'Do you want to cancel registration and return to start?',
              linkVerificationHint: 'Open the verification link from your email. Then return here and tap the button to continue.',
              alerts: {
                codeSentTitle: 'Code sent',
                c: 'Check your email {{email}} and open the link. If you don\'t see it, check your spam folder.',
                errorTitle: 'Error',
                resendError: 'We could not resend the verification code.',
                codeRequiredTitle: 'Code required',
                codeRequiredMessage: 'Enter the long code received by email.',
                tooManyAttemptsTitle: 'Too many attempts',
                tooManyAttemptsMessage: 'You reached the maximum attempts. Resend a new code.',
                noSessionError: 'No active session found to register verification.',
                verifiedTitle: 'Email verified',
                verifiedMessage: 'Your email was verified successfully.',
                verificationErrorTitle: 'Verification error',
                verificationErrorMessage: 'We could not verify the code.',
                notVerifiedYet: 'Your email is not verified yet. Open the link from your email and try again.',
              },
            },
            onboarding: {
              slides: {
                first: {
                  title: 'Travel easily',
                  subtitle: 'Exactly how you want',
                },
                second: {
                  title: 'Arrive at new places',
                  subtitle: 'To any destination',
                },
                third: {
                  title: 'Make your connection with Rundi',
                  subtitle: 'Find the ride of your dreams',
                },
              },
            },
            driverData: {
              headerTitle: 'Driver information',
              headerSubtitle: 'Complete your license and vehicle information',
              tabs: {
                license: 'License',
                vehicle: 'Vehicle',
              },
              photos: {
                sectionTitle: 'Photos',
                profileTitle: 'Profile photo *',
                licenseFrontTitle: 'Driver license (front) *',
                licenseBackTitle: 'Driver license (back) *',
                insuranceTitle: 'Insurance photo *',
                registrationFrontTitle: 'Registration – front *',
                registrationBackTitle: 'Registration – back *',
                takePhoto: 'Take photo',
                retakePhoto: 'Retake photo',
              },
              ocr: {
                hint: 'Take the photo facing the document straight on, with good light and no glare. Fill the frame and make sure small text reads clearly — that is how we fill in the fields for you.',
                reading: 'Reading document…',
                detected: 'We filled in: {{fields}}. Please verify them.',
                notDetected: 'Could not read data from the photo — retake it closer and sharper, or fill in the fields manually.',
                expandFields: 'View or edit fields',
                collapseFields: 'Hide fields',
                fields: {
                  licenseNumber: 'license number',
                  licenseExpiry: 'license expiration',
                  plate: 'plate',
                  brand: 'brand',
                  model: 'model',
                  year: 'year',
                  color: 'color',
                  type: 'vehicle type',
                  passengers: 'passengers',
                  registrationNumber: 'registration number',
                  registrationExpiry: 'registration expiration',
                  insuranceNumber: 'policy number',
                  insuranceCompany: 'insurance company',
                  insuranceExpiry: 'insurance expiration',
                },
              },
              license: {
                sectionTitle: 'License information',
                licenseNumberLabel: 'License number *',
                licenseNumberPlaceholder: 'Ex: 123456789',
                expiryLabel: 'Expiration (YYYY-MM-DD) *',
                expiryPlaceholder: 'Ex: 2030-12-31',
                departmentLabel: 'Department *',
                departmentPlaceholder: 'Select department',
                municipalityLabel: 'Municipality *',
                municipalityPlaceholder: 'Select municipality',
                info: '💡 Make sure your license is valid and not expired.',
              },
              vehicle: {
                sectionTitle: 'Vehicle information',
                plateLabel: 'Plate *',
                platePlaceholder: 'Ex: ABC-123',
                brandLabel: 'Brand *',
                brandPlaceholder: 'Ex: Toyota',
                modelLabel: 'Model *',
                modelPlaceholder: 'Ex: Corolla',
                yearLabel: 'Year *',
                yearPlaceholder: 'Ex: 2020',
                colorLabel: 'Color *',
                colorPlaceholder: 'Ex: White',
                typeLabel: 'Vehicle type *',
                registrationNumberLabel: 'Registration number',
                registrationNumberPlaceholder: 'Ex: B2301230',
                registrationExpiryLabel: 'Registration expiration (YYYY-MM-DD)',
                registrationExpiryPlaceholder: 'Ex: 2029-02-14',
                insuranceNumberLabel: 'Insurance policy number',
                insuranceNumberPlaceholder: 'Ex: RCO30201102',
                insuranceCompanyLabel: 'Insurance company',
                insuranceCompanyPlaceholder: 'Select your insurance company',
                insuranceExpiryLabel: 'Insurance expiration (YYYY-MM-DD)',
                insuranceExpiryPlaceholder: 'Ex: 2030-02-12',
                periodicSectionTitle: 'Periodic documents (optional — required to operate)',
                inspectionDateLabel: 'ITM inspection date (YYYY-MM-DD)',
                inspectionDatePlaceholder: 'Ex: 2025-11-05',
                inspectionValidUntilLabel: 'ITM valid until (YYYY-MM-DD)',
                inspectionValidUntilPlaceholder: 'Ex: 2026-11-05',
                emissionsTestedAtLabel: 'Emissions test date (YYYY-MM-DD)',
                emissionsTestedAtPlaceholder: 'Ex: 2025-11-05',
                emissionsValidUntilLabel: 'Emissions valid until (YYYY-MM-DD)',
                emissionsValidUntilPlaceholder: 'Ex: 2026-11-05',
                roadTaxPaidAtLabel: 'Road tax payment date (YYYY-MM-DD)',
                roadTaxPaidAtPlaceholder: 'Ex: 2026-01-15',
                revisadoValidUntilLabel: 'Revisado sticker valid until (YYYY-MM-DD)',
                revisadoValidUntilPlaceholder: 'Ex: 2026-12-31',
                typeOptions: {
                  sedan: 'Sedan',
                  suv: 'SUV',
                  van: 'Van',
                  moto: 'Motorcycle',
                },
                passengersLabel: 'Passenger capacity',
                passengersPlaceholder: 'Ex: 4',
                info: '💡 Make sure all the data matches your vehicle registration.',
              },
              alerts: {
                errorTitle: 'Error',
                incomplete: 'Please complete all required fields.',
                saveFailed: 'We could not save the data.',
              },
              buttons: {
                back: 'Go back',
                continue: 'Continue',
                saving: 'Saving...',
              },
              progress: 'Step {{current}} of {{total}}',
            },
            driverPhone: {
              title: 'Your phone number',
              subtitle: 'Confirm your country code and enter your number to continue.',
              info: {
                name: 'Name',
                email: 'Email',
              },
              field: {
                label: 'Phone number',
                helper: 'We will use this number to send you an SMS verification code.',
              },
              alerts: {
                errorTitle: 'Error',
                invalidPhone: 'Enter a valid number with international prefix (e.g., +505).',
                phoneExistsTitle: 'Phone already registered',
                phoneExistsMessage:
                  'This phone number is already linked to an existing account. Use a different number or log in with the account associated with this phone.',
                sendFailed: 'We could not send the SMS code. Please try again.',
              },
            },
            googlePhone: {
              title: 'We need your number',
              subtitle: 'Enter your phone number so we can verify it and finish the registration.',
              labels: {
                name: 'Name',
                email: 'Email',
                phone: 'Phone',
                placeholder: 'Your number',
              },
              buttons: {
                send: 'Send code',
                cancel: 'Cancel',
              },
              alerts: {
                errorTitle: 'Error',
                invalidPhone: 'Enter a valid phone number.',
                successTitle: 'Code sent',
                successMessage: 'We sent a code to {{phone}}.',
                sendFailed: 'We could not send the SMS code.',
              },
            },
            phoneVerificationLogin: {
              title: 'Verify your number',
              subtitle: 'We sent an SMS code to:',
              editLabel: 'Edit number (optional)',
              formatHint: 'Format: {{dialCode}} XXXX XXXX',
              codeSectionLabel: 'Verification code (6 digits)',
              codePlaceholder: '000000',
              attemptsLabel: 'Attempts remaining: {{remaining}}/{{max}}',
              verifyButton: 'Verify code',
              resend: {
                question: 'Didn’t receive the code?',
                timer: 'Resend in {{seconds}}s',
                button: 'Resend code',
              },
              info: {
                title: '💡 Information',
                codeValidity: '• The code is valid for 10 minutes',
                attempts: '• You have {{max}} attempts to enter the code',
                checkNumber: '• Make sure the phone number is correct',
              },
              backButton: '← Back',
              alerts: {
                codeIncompleteTitle: 'Incomplete code',
                codeIncompleteMessage: 'Enter a 6-digit code to continue.',
                tooManyAttemptsTitle: 'Too many attempts',
                tooManyAttemptsMessage:
                  'For security we temporarily blocked verification. Tap “Resend code” to try again.',
                invalidPhoneTitle: 'Invalid phone number',
                invalidPhoneMessage: 'Enter a valid number before resending the code.',
                resendSuccessTitle: 'Code sent',
                resendSuccessMessage: 'We sent a new code to {{phone}}.',
                resendErrorTitle: 'Error',
                resendErrorMessage: 'We could not resend the code.',
                verificationErrorTitle: 'We could not verify the code',
                sessionActiveMessage:
                  'You cannot log in because your account is active on another device. Sign out on the other phone to continue.',
                genericError: 'Check the SMS and make sure you enter the latest code you received.',
                permissionsError:
                  'We could not load your profile due to a permissions issue, but the SMS code may still be valid. Try again later or log in with email.',
                successTitle: '✅ Success',
                successMessage: 'Session started successfully.',
              },
            },
            phoneVerification: {
              title: 'Verify your number',
              subtitles: {
                register: 'Enter the code you received to continue with registration.',
                addPhone: 'Enter the code to confirm your new number.',
              },
              codeLabel: 'Verification code',
              codePlaceholder: '000000',
              attemptsLabel: 'Attempts remaining: {{remaining}}/{{max}}',
              verifyButton: 'Verify code',
              resend: {
                question: 'Didn’t receive the code?',
                timer: 'Resend in {{seconds}}s',
                button: 'Resend code',
              },
              info: {
                title: 'Reminder',
                codeValidity: '• The code expires in 10 minutes.',
                attempts: '• You have {{max}} attempts before the process is blocked.',
                checkNumber: '• Make sure the displayed number is correct.',
              },
              alerts: {
                saveErrorTitle: 'Error',
                saveErrorMessage: 'We could not continue with the registration.',
                codeIncompleteTitle: 'Incomplete code',
                codeIncompleteMessage: 'Enter a 6-digit code to continue.',
                tooManyAttemptsTitle: 'Too many attempts',
                tooManyAttemptsMessage:
                  'For security we temporarily blocked verification. Tap “Resend code” to try again.',
                addPhoneSuccessTitle: 'Phone verified',
                addPhoneSuccessMessage: 'Your number was linked successfully.',
                addPhoneErrorTitle: 'We could not link your phone',
                addPhoneErrorMessage: 'Check the SMS and make sure you enter the latest code.',
                phoneExistsTitle: 'Phone already registered',
                phoneExistsMessage:
                  'This phone number is already linked to an existing account. Use another number or sign in with the account tied to this phone.',
                verificationSuccessTitle: 'Phone verified',
                verificationSuccessMessage: 'Let’s continue with your registration.',
                verificationErrorTitle: 'We could not verify the code',
                verificationErrorMessage:
                  'Check the SMS and make sure you enter the latest code you received.',
                resendSuccessTitle: 'Code sent',
                resendSuccessMessage: 'We sent a new code to {{phone}}.',
                resendErrorTitle: 'Error',
                resendErrorMessage: 'We could not resend the code.',
              },
              backButton: '',
            },
            registerConfirm: {
              header: {
                title: 'Confirm registration',
                subtitle: 'Review your information before continuing',
              },
              sections: {
                basic: 'Basic information',
                license: 'License details',
                vehicle: 'Vehicle details',
                photos: 'Photos',
                vehiclePhotos: 'Vehicle photos',
                importantInfo: 'Important information',
              },
              photos: {
                hint: 'These photos were captured successfully and will be uploaded when you confirm.',
                profile: 'Profile photo',
                licenseFront: 'License (front)',
                licenseBack: 'License (back)',
                insurance: 'Insurance policy',
                vehicle: 'Vehicle photo',
                registrationFront: 'Registration (front)',
                registrationBack: 'Registration (back)',
              },
              infoBox: {
                line1: '• By confirming, you accept our Terms of Service.',
                line2: '• Your account will be reviewed by our team.',
                line3: '• Drivers are verified within 24-48 hours.',
              },
              data: {
                name: 'Name',
                email: 'Email',
                phone: 'Phone',
                role: 'Role',
                roleLabel: {
                  driver: 'Driver',
                  client: 'Client',
                },
                authMethod: 'Authentication',
                authMethodLabel: {
                  google: 'Google',
                  emailPassword: 'Email/Password',
                  phone: 'Phone',
                },
                phoneVerified: 'Phone verified',
                phoneVerifiedYes: 'Yes',
                phoneVerifiedNo: 'No',
                licenseNumber: 'License number',
                expiration: 'Expiration',
                department: 'Department',
                municipality: 'Municipality',
                plate: 'Plate',
                brand: 'Brand',
                model: 'Model',
                year: 'Year',
                color: 'Color',
                type: 'Type',
                typeLabel: {
                  sedan: 'Sedan',
                  suv: 'SUV',
                  van: 'Van',
                  moto: 'Motorcycle',
                },
                passengers: 'Passengers',
              },
              buttons: {
                back: 'Back',
                confirm: 'Confirm and register',
              },
              progress: 'Step {{current}} of {{total}}',
              alerts: {
                phoneNotVerifiedTitle: 'Error',
                phoneNotVerifiedMessage: 'Your phone number has not been verified yet.',
                missingDriverDataTitle: 'Error',
                missingDriverDataMessage: 'Driver or vehicle data is missing to finish the upgrade.',
                upgradeSuccessTitle: 'Information sent',
                upgradeSuccessMessage:
                  'We received your driver information. We’ll review your documents and let you know when your account is ready.',
                registerSuccessTitle: 'Welcome!',
                registerSuccessMessageDriver: 'Account created successfully for driver.',
                registerSuccessMessageClient: 'Account created successfully for client.',
                genericErrorTitle: 'Error',
                genericErrorMessage: 'We could not create the user.',
              },
            },
            register: {
              header: {
                title: 'Create account',
                subtitle: 'Choose how you want to sign up',
              },
              methods: {
                email: 'Email and password',
                phone: 'Phone only',
              },
              fields: {
                nameLabel: 'Full name',
                namePlaceholder: 'Your name',
                emailLabel: 'Email',
                emailPlaceholder: 'you@email.com',
                emailHelperRequired: 'We will use this email for your account.',
                emailHelperOptional: 'Optional, you can add it now or later.',
                phoneLabel: 'Phone',
                phonePlaceholder: 'Tap to add your number',
                phoneHelperRequired: 'Required so we can contact you.',
                phoneHelperOptional: 'Optional, you can add or edit it later.',
                passwordLabel: 'Password',
                passwordPlaceholder: 'Minimum 6 characters',
                confirmPasswordLabel: 'Confirm password',
                confirmPasswordPlaceholder: 'Repeat your password',
              },
              statusMessages: {
                passwordMatch: 'Passwords match',
                passwordMismatch: 'Passwords do not match',
              },
              buttons: {
                continueEmail: 'Continue with email',
                phoneNext: 'Continue',
              },
              footer: 'Step 1 of 4 · We will verify your phone before selecting the role.',
              alerts: {
                genericTitle: 'Error',
                confirmPasswordMissing: 'Confirm your password to continue.',
                passwordsMismatch: 'Passwords must match.',
                incompleteEmailForm: 'Complete name, email, and a valid password.',
                emailExists: 'An account with this email already exists.',
                phoneExists: 'An account with this phone number already exists.',
                phoneInvalidName: 'Enter your name before continuing.',
                phoneInvalidNumber:
                  'Enter your name and a valid phone number in international format (+Country code).',
                registerEmailError: 'We could not start the registration.',
                registerPhoneError: 'We could not continue with the registration.',
              },
            },
            registrationCheckpoint: {
              title: 'Resume your registration',
              subtitle: 'We found a pending registration for {{name}}. You left off at:',
              info: 'You can continue where you left off or start from scratch.',
              buttons: {
                continue: 'Continue registration',
                startOver: 'Start over',
              },
              startOverConfirm: {
                title: 'Start over?',
                message:
                  'The account that was created and all data from this registration will be deleted. This action cannot be undone.',
                confirm: 'Yes, start over',
                cancel: 'Cancel',
              },
              stepLabels: {
                default: 'Basic information',
                register: {
                  default: 'Registration basics',
                  google: 'Role selection with Google',
                  phone: 'Role selection with phone',
                },
                emailVerification: 'Email verification',
                googlePhone: 'Add phone number for Google account',
                driverPhone: 'Driver phone number',
                phoneVerification: {
                  default: 'Phone verification',
                  driver: 'Phone verification for driver',
                },
                driverData: 'License and vehicle data',
                roleSelection: 'Role selection',
                registerConfirm: 'Final registration confirmation',
              },
            },
            roleSelection: {
              header: {
                title: 'Choose your role',
                subtitle: 'Decide how you want to use Rundi. You can sign up as a client or a driver.',
              },
              section: {
                title: 'Your information',
                nameLabel: 'Name',
                emailLabel: 'Email',
                phoneLabel: 'Phone',
                methodLabel: 'Method',
              },
              methodLabels: {
                email: 'Email and password',
                phone: 'Phone (SMS)',
                google: 'Google',
              },
              buttons: {
                client: 'I want to be a client',
                driver: 'I want to be a driver',
              },
              options: {
                client: {
                  title: 'Client',
                  description: 'Request rides whenever you need them.',
                },
                driver: {
                  title: 'Driver',
                  description: 'Earn income driving with your vehicle.',
                },
              },
              alerts: {
                successTitle: 'Registration complete',
                successMessage: 'Welcome to Rundi!',
                errorTitle: 'Error',
                missingName: 'We need your full name to continue.',
                missingEmailPassword: 'Email and password are required for this method.',
                missingVerifiedPhone: 'We could not find a verified phone number.',
                networkError: 'We could not reach the server. Check your connection and try again.',
                genericError: 'We could not complete the registration. Please try again.',
                smsSendError: 'We could not send the SMS code. Try again in a moment.',
                driverFlowError: 'We could not continue with the driver registration.',
              },
            },
           googlesinginbutton: {
            login: 'Login...',
            logincontinue: 'Continue with google',
            register: 'Registering...',
            registercontinue: 'Continue with google'

           },
           
          },
      client: {
        pendingPayments: {
          supportTitle: 'Need help with my pending payments',
          supportLabel: 'Need help with a pending payments?',
          supportDescription: 'Open a chat with support to check invoices, charges or any discrepancies.',
          title: 'Pending payments',
          loading: 'Loading pending payments...',
          emptyTitle: 'No pending payments',
          emptyDescription: 'All your payments are up to date.',
          info: {
            message_one: 'You have {{count}} pending payment.',
            message_other: 'You have {{count}} pending payments.',
            instruction: 'Tap one to pay with card (bank transfer).',
          },
          driverFallback: 'Driver',
          paymentMethod: 'Card (required)',
          status: {
            pendingConfirmation: 'Waiting for confirmation',
            pending: 'Pending payment',
          },
          actionPay: 'Pay →',
          route: {
            originFallback: 'Origin',
            destinationFallback: 'Destination',
          },
          alerts: {
            loadError: 'We could not load the pending payments.',
            refreshSuccessTitle: 'Information updated',
            refreshSuccessMessage: 'Pending payments synchronized.',
          },
          date: {
            justNow: 'Just now',
            minutes: '{{count}} min ago',
            hours: '{{count}} h ago',
            yesterday: 'Yesterday',
            days: '{{count}} days ago',
          },
        },
        cashPayment: {
          loading: 'Loading payment information...',
          header: {
            title: 'Cash payment',
            subtitle: 'Confirm that you have paid the driver in cash.',
          },
          detail: {
            amount: 'Amount:',
            time: 'Time:',
            method: 'Method:',
            methodValueCash: 'Cash',
            codeLabel: 'Confirmation code',
          },
          waiting: {
            title: '⏳ Waiting for confirmation',
            description: 'The driver must confirm they received your payment.',
          },
          support: {
            title: 'Question about my cash payment',
            label: 'Need help with this payment?',
            description: 'Open a chat with support and review the status of your payment in minutes.',
          },
          buttons: {
            confirm: 'Confirm cash payment',
            processing: 'Processing...',
          },
          alerts: {
            methodChangedTitle: 'Payment method changed',
            methodChangedMessage: 'The payment method switched to card. You will be redirected to pay by card.',
            paymentConfirmedTitle: 'Payment confirmed',
            paymentConfirmedMessage: 'The payment was confirmed by both parties.',
            confirmationStoredTitle: 'Confirmation registered',
            confirmationStoredMessage: 'Waiting for the driver to confirm they received the payment.',
            paymentCancelledTitle: 'Payment reported',
            paymentCancelledMessage: 'The driver reported an issue with this payment. You can still rate the trip.',
            loginRequired: 'You must be logged in to confirm the payment.',
            identityError: 'We could not verify your identity. Please try again.',
            confirmError: 'We could not confirm the payment. Please try again.',
          },
          biometricPrompt: 'Confirm your identity to register the {{amount}} payment.',
        },
        rideHistory: {
          filters: {
            all: 'All',
            completed: 'Completed',
            canceled: 'Canceled',
          },
          empty: {
            title: 'No rides',
            subtitle: {
              all: 'You do not have rides in your history yet.',
              completed: 'You do not have completed rides yet.',
              canceled: 'You do not have canceled rides yet.',
            },
          },
          labels: {
            noDate: 'No date',
            distance: 'Distance',
            total: 'Total',
            method: 'Method',
            status: 'Status',
            commission: 'Commission',
            tip: 'Tip',
            net: 'Net',
            driver: 'Driver:',
            paymentMissing: 'No payment data',
            paymentMethodMissing: 'Not provided',
            unknownAddress: 'Unknown location',
            originFallback: 'Origin',
            destinationFallback: 'Unknown destination',
          },
          statuses: {
            requested: 'Requested',
            accepted: 'Accepted',
            started: 'In progress',
            completed: 'Completed',
            canceled: 'Cancelled',
            other: '{{status}}',
          },
          paymentStatus: {
            paid: 'Paid',
            pending: 'Pending',
            other: '{{status}}',
          },
          distanceValue: '{{value}} km',
        },
        home: {
          requestRide: 'Request ride',
          loading: {
            preparing: 'Preparing your experience...',
            savingLocation: 'Saving location...',
            obtainingLocation: 'Getting location...',
          },
          map: {
            loadingAddress: 'Loading location…',
            searchingAddress: 'Searching address…',
            recenter: 'Center map on my location',
          },
          locationStatus: {
            locked: 'Location selected. Tap the pin to move the map and choose a new spot.',
            dragging: 'Move the map and release or tap the pin to save.',
            unlocked: 'Tap the pin to lock its position.',
            saving: 'Saving new location…',
            savingLabel: 'Saving location…',
          },
          alerts: {
            regionUnavailableTitle: 'Region not available',
            regionUnavailableMessage:
              'For now you cannot request rides because you are outside the active coverage area.',
            regionUnavailableGeneral:
              'Service is currently available only within the active coverage areas (currently Managua).',
            locationSavedTitle: 'Location updated',
            locationSavedMessage: 'Your current location was saved successfully.',
            locationSaveError: 'We could not save your location. Please try again.',
            locationUpdateError: 'We could not refresh your location. Please try again.',
          },
          errors: {
            locationAccessTitle: 'We could not access your location',
            locationAccessDescription:
              'Check your location permissions and make sure GPS is enabled.',
            retry: 'Try again',
          },
          pendingAction: {
            paymentSingle: 'Pending payment',
            paymentMultiple: '{{count}} pending payments',
          },
          activeRide: {
            requested: 'Looking for a driver',
            confirm: 'Confirm your ride',
            driverOnRoute: 'Driver on the way',
            inProgress: 'Ride in progress',
            pendingPayment: 'Pending payment',
            default: 'Active ride',
          },
          scheduledRide: {
            imminentTitle: 'Scheduled ride starting soon',
            imminentTitleDriver: 'Your scheduled driver is ready',
            notice: 'Ride scheduled today at {{time}} · {{remaining}}',
            inMinutes: 'in {{minutes}} min',
            inHours: 'in {{hours}} h',
            inHoursMinutes: 'in {{hours}} h {{minutes}} min',
            reminderTitle: 'Your scheduled ride is starting soon',
            reminderBody: 'Your ride is in 30 minutes. Open the app to confirm it.',
          },
          region: {
            checking: 'Checking coverage area...',
            availableNamed: 'Service available in {{area}}',
            availableGeneric: 'Service available in your current area',
            unavailableFallback: 'Service is currently available only within the active coverage areas.',
          },
          profile: {
            fallbackName: 'User',
          },
        },
        recurringRides: {
          addNew: 'Save trip',
          addHint: 'Save a frequent route to request it with one tap',
          manage: 'Manage',
          title: 'Saved trips',
          formTitleNew: 'New recurring trip',
          formTitleEdit: 'Edit recurring trip',
          nameLabel: 'Trip name',
          namePlaceholder: 'e.g. Home → Work',
          routeInfo: '{{distance}} km · ~{{duration}} min',
          routeCalculating: 'Calculating route…',
          save: 'Save trip',
          saved: 'Trip saved',
          saveError: 'Could not save the trip. Please try again.',
          limitReached: 'You can save up to {{max}} trips.',
          delete: 'Delete',
          deleteConfirmTitle: 'Delete trip?',
          deleteConfirmBody: '"{{title}}" will be removed from your saved trips.',
          deleted: 'Trip deleted',
          deleteError: 'Could not delete the trip.',
          emptyTitle: 'No saved trips yet',
          emptyBody: 'Save your frequent routes and request them with one tap.',
          createFirst: 'Create my first trip',
          edit: 'Edit',
          request: 'Request',
          stopsCount_one: '{{count}} stop',
          stopsCount_other: '{{count}} stops',
          passengersLabel: 'Passengers',
          commentLabel: 'Comment',
          commentPlaceholder: 'Trip details...',
          vehicleSection: 'Vehicle',
          paymentSection: 'Payment method',
          incompleteRoute: 'Set the origin and destination to save the trip.',
          mapPickHint: 'Tap the map to set the point.',
          cash: 'Cash',
          card: 'Card',
        },
        homeOffers: {
          title: 'Nearby offers',
          loading: 'Loading offers...',
          empty: 'No interested drivers yet…',
          searching: 'Searching for drivers',
          count_one: '{{count}} offer',
          count_other: '{{count}} offers',
          emptyHint: 'Keep this screen open, drivers near you will appear here.',
          searchingLong: 'Taking longer than usual — you can keep waiting or cancel and try again later.',
          hint: {
            selectNearest: 'Tap the nearest vehicle on the map or pick one of your offers.',
            selected: 'Driver selected — confirm your ride below.',
          },
          cancelConfirmTitle: 'Cancel search?',
          cancelConfirmBody: 'If drivers already sent offers, you will lose them.',
          cancelConfirmBodyEmpty: 'Your request will be removed and nearby drivers will stop seeing it.',
          cancelConfirmYes: 'Yes, cancel',
          cancelConfirmNo: 'Keep searching',
          list: {
            etaFallback: 'Estimated time',
            etaMinutes: '{{count}} min',
            arrivalFallback: 'Arrival time',
            arrivalLabel: 'Arrives: {{arrival}} - {{eta}}',
            ratingPrefix: '⭐ {{rating}}',
            offerCaption: 'offer',
            priceLabel: 'Price:',
            clientPriceLabel: 'Your price:',
            driverPriceLabel: "Driver's suggestion:",
            driverPricePending: 'Pending',
            clientPriceMissing: 'N/A',
            acceptedPrimary: 'Driver confirmed',
            acceptedSecondary: 'Driver confirmed',
            initialFallback: 'D',
          },
          a11y: {
            messageDriver: 'Message driver',
            seeReviews: 'See driver reviews',
          },
          negotiation: {
            pill: 'Negotiate',
            status: {
              clientSuggested: 'Waiting for your response',
              driverOffered: 'Waiting for your response',
              driverAccepted: 'Driver accepted your offer',
              clientAccepted: 'You accepted the driver price',
            },
          },
          primaryAction: {
            select: 'Select',
            confirmDriver: 'Confirm driver',
            confirmDriverPrice: 'Select and confirm the driver price',
            confirmClientPrice: 'Select and confirm your price',
            confirmEstimate: 'Select and confirm estimated price',
          },
          buttons: {
            cancelSearch: 'Cancel search',
            seeDriverReviews: 'See reviews',
          },
          assignedDriver: {
            badge: 'Assigned driver',
            confirmedBadge: 'Driver confirmed',
            pickupAt: 'Pickup {{time}}',
          },
          reviews: {
            complimentsTitle: 'Compliments',
            complimentsEmpty: 'No compliments yet',
            topReviewsTitle: 'Top reviews',
            empty: 'No reviews yet for this driver.',
            anonymous: 'Passenger',
            fallbackDate: 'recently',
            fallbackReviewOne: 'Very comfortable and clean vehicle ride.',
            fallbackReviewTwo: 'Excellent trip, highly recommended driver.',
            stats: {
              rides: 'Rides',
              years: 'Years on Rundi',
              rating: 'Rating',
            },
            relative: {
              today: 'Today',
              oneDay: '1 day ago',
              days: '{{count}} days ago',
              oneWeek: '1 week ago',
              twoWeeks: '2 weeks ago',
              weeks: '{{count}} weeks ago',
            },
            compliments: {
              punctuality: 'Punctuality',
              cleanliness: 'Vehicle cleanliness',
              communication: 'Communication',
              driving: 'Driving quality',
              safety: 'Safety',
              friendliness: 'Friendliness',
              defaultLabel: 'Great service',
            },
          },
          alerts: {
            confirmSuccessTitle: 'Driver confirmed',
            confirmSuccessMessage: 'You can now track their live location.',
            confirmError: 'We could not confirm the driver. Try again.',
            cancelSuccessTitle: 'Search cancelled',
            cancelSuccessMessage: 'Returning to your home screen.',
            cancelError: 'Could not cancel the search.',
            acceptOfferError: 'Could not accept the offer.',
            counterOfferError: 'Could not send the counteroffer.',
            confirmFromModalError: 'Could not confirm the driver.',
          },
          cancelReason: 'Cancelled by the client.',
          extraStopLabel: 'Stop {{index}}',
        },
      rideConfirmation: {
        alerts: {
          cancelRideTitle: 'Cancel Ride',
          cancelRideMessage: 'If you go back, your ride will be automatically cancelled. Are you sure?',
          cancelRideConfirm: 'Cancel Ride',
          cancelRideStay: 'Stay',
          cancelRideError: 'Could not cancel the ride. Try again.',
          cancelRideSuccessTitle: 'Ride cancelled',
          cancelRideSuccessMessage: 'Your ride has been successfully cancelled',
          confirmCancelTitle: 'Cancel ride',
          confirmCancelMessage: 'Are you sure you want to cancel this ride?',
          confirmCancelYes: 'Yes, cancel',
          confirmCancelNo: 'No',
          confirmDriverError: 'Could not confirm the driver',
          confirmDriverSuccessTitle: 'Driver confirmed',
          confirmDriverSuccessMessage: 'You have confirmed the ride with {name}. You can now see their location in real time.',
          rejectDriverTitle: 'Reject driver',
          rejectDriverMessage: 'Are you sure you want to reject {name}? The ride will be available again for other drivers.',
          rejectDriverSuccessTitle: 'Driver rejected',
          rejectDriverSuccessMessage: 'The ride is available again for other drivers.',
          rejectDriverError: 'Could not reject the driver',
          mustSignInToConfirm: 'You must sign in to confirm the driver',
          mustSignInToReject: 'You must sign in to reject the driver',
          counterOfferSentTitle: 'Counteroffer sent',
          counterOfferSentMessage: 'Your counteroffer of C${price} has been sent to the driver.',
          counterOfferError: 'Could not send the counteroffer',
        },
        status: {
          searchingDriver: 'Searching for driver...',
          rideConfirmed: 'Ride confirmed',
        },
        offers: {
          interestedDriver: 'interested driver',
          interestedDrivers: 'interested drivers',
          reviewOffers: 'Review the offers and choose the one that suits you best',
          driverFound: '🎉 Driver found!',
        },
        eta: {
          estimatedArrival: 'Estimated time of arrival',
        },
        details: {
          rideDetails: 'Ride Details',
          origin: 'Origin',
          destination: 'Destination',
          stop: 'Stop',
          notSpecified: 'Not specified',
          distance: 'Distance',
          duration: 'Duration',
          price: 'Price',
          notes: 'Notes:',
        },
        actions: {
          acceptDriver: '✅ Accept Driver',
          rejectDriver: '❌ Reject',
          viewMapOnly: '🗺️ View Map Only',
          callSupport: '📞 Call Support',
          canceling: 'Canceling...',
          cancelRide: 'Cancel Ride',
        },
        footer: {
          notificationTip: '💡 You will receive a notification when a driver accepts your ride',
          chatTip: '💬 You can chat with the driver once they accept the ride',
        },
      },
      },
      settings: {
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
      },
      driver: {
        home: {
          loading: {
            initializing: 'Preparing your driver dashboard...',
            locating: 'Getting your location...',
          },
          errors: {
            location: 'We could not get the location',
            retry: 'Try again',
          },
          alerts: {
            penaltiesTitle: 'Pending commissions',
            penaltiesAutoDisabled:
              'Your availability was disabled because you exceeded C${{limit}} in pending commissions. Pay them before reconnecting.',
            penaltiesBlockActivation:
              'You have C${{amount}} pending. You must be under C${{limit}} to activate availability.',
            rechargeRequiredTitle: 'Insufficient funds',
            rechargeRequiredBody:
              'Your current wallet balance is C${{amount}}. Recharge funds to continue accepting rides.',
            availabilityUpdateFailed: 'We could not update your status.',
          },
          voice: {
            ready: 'Voice assistant ready. I will notify you about nearby rides and important changes.',
            availabilityOn: 'Availability enabled. Waiting for new rides.',
            availabilityOff: 'Availability disabled.',
            nearbyRideDistance: '{{distance}} kilometers',
            nearbyRideDistanceFallback: 'a nearby distance',
            nearbyRide: 'Nearby ride at {{distance}}. Net price {{price}} córdobas.',
            activeRide: 'You have an active ride with {{client}}. Destination {{destination}}.',
            clientFallback: 'the client',
            destinationFallback: 'the assigned destination',
          },
          pendingAction: {
            paymentTitle: 'Pending payment',
            paymentSingleSubtitle: 'Confirm the pending payment',
            paymentMultipleSubtitle: '{{count}} pending payments',
            negotiationTitle: 'Waiting for client confirmation',
            negotiationSubtitle: 'The client is reviewing your offer',
            genericSubtitle: 'Review this pending action',
          },
          activeRideStatus: {
            accepted: {
              title: 'Ride accepted',
              subtitle: 'Open the ride with {{client}}',
            },
            driverOnRoute: {
              title: 'Heading to client',
              subtitle: 'Go to {{client}}',
            },
            driverArrived: {
              title: 'Client waiting',
              subtitle: 'Confirm pickup for {{client}}',
            },
            inProgress: {
              title: 'Ride in progress',
              subtitle: '{{destination}}',
            },
            offerMade: {
              title: 'Offer made',
              subtitle: 'Waiting for client confirmation',
            },
          },
          banners: {
            activeRideTitle: 'Ongoing ride',
            penaltiesTitle: 'Pending commissions',
            penaltiesSubtitle: '{{count}} for C${{amount}}',
            rechargeTitle: 'Insufficient wallet balance',
            rechargeSubtitle: 'Current balance: C${{amount}}. Recharge to keep driving.',
            paymentsTitle: 'Pending payments',
            paymentsSubtitleSingle: '1 payment to confirm',
            paymentsSubtitleOther: '{{count}} payments to confirm',
          },
          header: {
            profileFallback: 'Driver',
          },
          stats: {
            totalToday: 'Total today',
          },
          cta: {
            viewRequests: 'View requests',
          },
          status: {
            online: 'Online',
            offline: 'Offline',
          },
          designated: {
            activeLabel: 'Designated',
          },
          ride: {
            clientFallback: 'Client',
            originFallback: 'Origin',
            destinationFallback: 'Destination',
          },
          menu: {
            title: 'Quick menu',
            earnings: 'View detailed earnings',
            commissions: 'Recharge funds',
            history: 'Ride history',
            paymentMethods: 'Payment methods',
            settings: 'Settings',
            help: 'Help',
            logout: 'Log out',
          },
          buttons: {
            retry: 'Try again',
          },
        },
        profile: {
          loading: {
            message: 'Loading profile...',
          },
          header: {
            title: 'My profile',
            edit: 'Edit profile',
            memberId: 'ID: {{id}}',
            nameFallback: 'Driver',
            initialFallback: 'D',
          },
          accountStatus: {
            label: 'Account',
            active: 'Active account',
            pending: 'Pending account',
            suspended: 'Suspended account',
            rejected: 'Rejected account',
            other: 'Account {{status}}',
          },
          stats: {
            walletTitle: 'Wallet',
            walletCta: 'Top-ups, bonuses, and more',
            totalEarnings: 'Total earnings',
            todaysEarnings: 'Earnings today',
            totalRides: 'Completed rides',
            todaysRides: 'Rides today',
            rating: 'Rating',
          },
          vehicles: {
            title: 'My vehicles',
            selectedLabel: 'Selected vehicle',
            pendingLabel: 'Under administrative review',
            empty: 'No vehicles registered',
            addButton: 'Add vehicle',
            verify: 'Verify',
            view: 'View',
            switch: 'Switch',
            selected: 'Selected',
            unavailable: 'Unavailable',
          },
          documents: {
            title: 'Driver documents',
            licenseName: 'Driver license',
            expires: 'Expires: {{date}}',
            types: {
              license: 'Driver license',
              registration: 'Vehicle registration',
              insurance: 'Vehicle insurance',
              default: 'Document',
            },
            status: {
              verified: '✅ Verified',
              rejected: '❌ Rejected',
              suspended: '⚠️ Suspended',
              pending: '⏱ Pending review',
              complete: '✅ Complete (under review)',
              missing: '❌ Pending',
            },
            button: {
              view: 'View',
              details: 'View details',
              fix: 'Fix',
              submit: 'Submit for review',
              complete: 'Complete',
            },
          },
          designated: {
            title: 'Designated driver',
            heroTitle: 'Expand your opportunities',
            heroDescription:
              'Become a designated driver and access premium rides where the client provides the vehicle. Earn more with luxury trips.',
            benefits: {
              rides: '✓ Designated driver rides',
              higherFare: '✓ Higher fare per trip',
              premiumClients: '✓ Premium clients',
              keepRegular: '✓ Keep your regular rides',
            },
            statusLabel: {
              pending: 'No request sent',
              requested: 'Request under review',
              approved: 'Designated driver active',
              verified: 'Designated driver active',
              rejected: 'Request rejected',
              revoked: 'Role revoked',
              unknown: 'Unknown status',
            },
            statusHelper: {
              pending: 'Send your request to access premium rides.',
              requested: 'Our team will review your information within 24 hours.',
              approved: 'Enjoy the benefits of the program.',
              verified: 'Enjoy the benefits of the program.',
              rejected: 'Review your documents or contact support for more info.',
              revoked: 'Your access was revoked. Contact support for more info.',
              default: 'Update your data to access the program.',
            },
            button: {
              default: 'Request access',
              pending: 'Request sent',
              approved: 'Designated driver active',
              rejected: 'Request rejected',
            },
            alerts: {
              pendingTitle: 'Pending request',
              pendingBody: 'You already have a pending request. Our team will review it within 24 hours.',
              approvedTitle: 'Already approved',
              approvedBody: 'Your account is already part of the designated driver program.',
              rejectedTitle: 'Request rejected',
              rejectedBody: 'Your request was rejected. Check your documents or contact us if you need help.',
              confirmTitle: 'Request designated driver access',
              confirmBody:
                'Do you want to request access to the designated driver program?\n\nRequirements:\n• 4x4 or SUV vehicle\n• Valid license\n• Verified documents\n• Minimum 4.8-star rating',
              confirmCancel: 'Cancel',
              confirmSubmit: 'Request',
              errorTitle: 'Error',
              errorBody: 'We could not send the request. Try again.',
            },
            helper: {
              pending: 'Send your request to access premium rides.',
              requested: 'Our team will review your information within 24 hours.',
              approved: 'Enjoy the program benefits.',
              verified: 'Enjoy the program benefits.',
              rejected: 'Check your documents or contact support for more info.',
              revoked: 'Your access was revoked. Contact support for more info.',
              default: 'Update your data to access the program.',
            },
          },
          mode: {
            title: 'Usage mode',
            description: 'Switch between client and driver views with your same account.',
            switchToClient: 'Use as client',
            switchToDriver: 'Use as driver',
            alerts: {
              unavailableTitle: 'Not available',
              unavailableBody:
                'Your account is not configured as a driver yet. Complete your driver registration and wait for approval.',
              loadingTitle: 'Loading information',
              loadingBody: 'We are loading your driver account status. Try again in a few seconds.',
              cannotEnableTitle: 'Cannot enable driver mode',
              requirementsBody: 'Complete your information to activate driver mode.',
              close: 'Close',
              viewDocuments: 'View documents',
              viewVehicles: 'View vehicles',
              errorTitle: 'Error',
              errorBody: 'We could not change the mode. Try again.',
              reasons: {
                account: '• Your driver account is not active yet.',
                documents: '• Your driver documents are pending or were rejected.',
                vehicle: '• You do not have any approved active vehicle.',
              },
            },
          },
          overlay: {
            title: 'Advanced notifications',
            subtitle: 'Floating bubble with nearby requests',
            description:
              'Shows a card above other apps when there is a nearby ride. Ideal if you use other navigation apps.',
            hintAndroidGranted: 'Permission active.',
            hintAndroidMissing: 'Open Settings → Apps → Rundi → Display over other apps.',
            hintIos: 'Uses Live Activities (Dynamic Island).',
            hintIosGranted: 'Live Activities active.',
            hintIosMissing: 'Open Settings → Rundi → Live Activities.',
            alerts: {
              notAvailableTitle: 'Not available',
              notAvailableBody: 'The overlay feature is only available on Android.',
              enableTitle: 'Enable the permission',
              enableBody: 'Open the “Display over other apps” screen and enable it for Rundi.',
              enableTitleIos: 'Enable Live Activities',
              enableBodyIos: 'Open Settings → Rundi → Live Activities and turn them on.',
              disableTitle: 'Disable the permission',
              disableBody: 'Open the “Display over other apps” screen and turn it off for Rundi.',
              permissionMissingTitle: 'Permission not granted',
              permissionMissingBody:
                'We could not detect the permission. Try again from the settings screen.',
              permissionMissingBodyIos:
                'We could not detect Live Activities access. Try again from Settings → Rundi.',
              permissionStillOnTitle: 'Permission still active',
              permissionStillOnBody: 'The permission is still active. Turn it off manually in Settings.',
              errorTitle: 'Error',
              errorBody: 'We could not update the preference. Try again.',
            },
          },
          voice: {
            title: 'Voice assistant',
            cardTitle: 'Spoken prompts',
            subtitle:
              'Receive alerts for new rides, reminders when you reach the client, and payment alerts without looking at the screen.',
            benefits: {
              rides: '• Automatic announcements for nearby rides',
              arrivals: '• Reminders when you arrive at the pickup point',
              payments: '• Alerts when a cash payment is pending confirmation',
            },
            footer: 'You can disable it anytime. We recommend keeping it on for hands-free driving.',
          },
          insurance: {
            title: 'Insurance information',
            company: 'Company',
            number: 'Policy number',
            expiry: 'Expiration',
            photo: 'Policy photo',
          },
          options: {
            viewEarnings: 'View detailed earnings',
            rideHistory: 'Ride history',
            paymentMethods: 'Payment methods',
            settings: 'Settings',
            help: 'Help',
          },
          modal: {
            title: 'Add new vehicle',
            labels: {
              basicInfo: 'Basic information',
              plate: 'Plate *',
              brand: 'Brand *',
              model: 'Model *',
              year: 'Year *',
              color: 'Color *',
              type: 'Type',
              specs: 'Technical specifications',
              engine: 'Engine',
              chassis: 'Chassis',
              vin: 'VIN',
              cylinders: 'Cylinders',
              passengers: 'Passengers',
              fuelType: 'Fuel type',
              tonnage: 'Tonnage',
              classification: 'Classification',
              vehicleClass: 'Vehicle class',
              serviceType: 'Service type',
              lien: 'Lien',
              documents: 'Registration documents',
              emissionDate: 'Issue date',
              registrationNumber: 'Registration number',
              registrationExpiry: 'Registration expiry',
              registrationFront: 'Front registration photo',
              registrationBack: 'Rear registration photo',
              insurance: 'Insurance',
              insuranceNumber: 'Insurance number',
              insuranceCompany: 'Insurance company',
              insuranceStart: 'Insurance start',
              insuranceExpiry: 'Insurance expiry',
              insurancePhoto: 'Insurance policy photo',
              photos: 'Vehicle photos',
              vehiclePhoto: 'Vehicle photo',
            },
            placeholders: {
              plate: 'ABC-123',
              brand: 'Toyota',
              model: 'Corolla',
              year: '{{year}}',
              color: 'White',
              type: 'Sedan',
              engine: '2.0L',
              chassis: 'ABC123456',
              vin: 'VIN123456789',
              cylinders: '4',
              passengers: '5',
              fuelType: 'Gasoline',
              tonnage: '2.50',
              vehicleClass: 'PRIVATE',
              serviceType: 'PRIVATE',
              lien: 'NONE',
              registrationNumber: 'B2301230',
              emissionDate: 'YYYY-MM-DD',
              registrationExpiry: 'YYYY-MM-DD',
              insuranceNumber: 'RCO30201102',
              insuranceCompany: 'BAC',
              insuranceStart: 'YYYY-MM-DD',
              insuranceExpiry: 'YYYY-MM-DD',
            },
            buttons: {
              cancel: 'Cancel',
              submit: 'Add vehicle',
            },
          },
          alerts: {
            permissions: {
              galleryTitle: 'Permission denied',
              galleryBody: 'We need access to your gallery to upload photos.',
            },
            upload: {
              successTitle: 'Success',
              successBody: 'Profile photo updated successfully.',
              errorTitle: 'Error',
              errorBody: 'We could not upload the photo. Try again.',
            },
            vehicles: {
              formErrorTitle: 'Error',
              formErrorBody: 'Please complete all required fields.',
              addSuccessTitle: 'Success',
              addSuccessBody: 'Vehicle added successfully.',
              addErrorTitle: 'Error',
              switchErrorTitle: 'Error',
              notFoundTitle: 'Error',
              notFoundBody: 'Vehicle not found.',
              notApprovedTitle: 'Vehicle not authorized',
              notApprovedBody: 'This vehicle has not been approved by the admin team yet.',
              incompleteTitle: 'Incomplete vehicle',
              incompleteBody:
                'You cannot switch to this vehicle because:\n\n{{reason}}\n\nComplete the information in the verification screen.',
              viewDocuments: 'Complete information',
              switchErrorBody: 'We could not switch the vehicle. Try again.',
              genericFormError: 'Error adding vehicle.',
              issues: {
                basicInfo: 'Incomplete basic information',
                registration: 'Incomplete registration data',
                insurance: 'Incomplete insurance data',
                vehiclePhoto: 'Vehicle photo missing',
              },
            },
          },
          buttons: {
            retry: 'Retry',
          },
         },
         available: {
          header: {
              title: 'Available rides',
              count_one: '{{count}} ride available',
              count_other: '{{count}} rides available',
          },
          fundsBanner: {
              title: 'Insufficient balance',
              body: 'Your wallet has C${{amount}}. Tap to recharge.',
          },
          empty: {
              hint: 'Pull down to refresh anytime',
          },
          offline: {
              title: "You're offline",
              message: 'Go online to see ride requests near you.',
              action: 'Go online',
              activating: 'Going online…',
          },
          voice: {
              ridesAvailable: 'You have {{count}} rides available.',
          },
          sections: {
              designatedTitle: 'Designated driver rides',
              designatedSubtitle: 'Visible only when you enable the designated driver mode.',
              scheduledTitle: 'Your scheduled rides',
              scheduledSubtitle: 'They activate automatically when the scheduled time arrives.',
          },
          alerts: {
              cardRequiredTitle: 'Card required',
              cardRequiredBody: 'To accept rides paid with card you need to register at least one card. Add a card before continuing.',
              cardRequiredConfirm: 'Go to payment methods',
              cardRequiredCancel: 'Cancel',
              activeRideTitle: 'You already have an active ride',
              activeRideBody: 'Finish your current ride before accepting a new one.',
              penaltiesTitle: 'Pending commissions',
              penaltiesBody: 'You have C${{amount}} in pending commissions. Pay them to accept rides.',
              rechargeRequiredTitle: 'Insufficient funds',
              rechargeRequiredBody: 'Your wallet has C${{amount}} available. Recharge to accept rides.',
              offerSentTitle: 'Offer sent',
              offerAcceptedBody: 'You accepted the ride for C${{amount}}. Waiting for the client’s confirmation...',
              offerGenericBody: 'We notified the client. Waiting for confirmation...',
              errorSendOffer: 'We could not send the offer.',
              errorAcceptRide: 'We could not accept the ride.',
              assignSuccessTitle: '✅ Ride assigned',
              assignSuccessBody: 'You assigned yourself to the scheduled ride. Confirm it when the system requests it.',
              assignError: 'We could not assign the scheduled ride.',
              scheduledConfirmedTitle: 'Ride confirmed',
              scheduledConfirmedBody: 'You confirmed the scheduled ride. Be at the pickup location at the scheduled time.',
              scheduledConfirmError: 'We could not confirm the scheduled ride.',
          },
          rideCard: {
              clientFallback: 'Client',
            initialFallback: 'CL',
              origin: 'Origin: {{address}}',
              destination: 'Destination: {{address}}',
              stops: 'Stops: {{count}}',
              price: 'Price: C${{amount}}',
              distanceToOrigin: '{{distance}} km to pickup',
              calculating: 'Calculating...',
              etaToOrigin: '~{{minutes}} min to arrive',
              viewVehicle: 'View vehicle',
              view: 'Details',
              distanceShort: '{{distance}} km away',
              etaShort: '~{{minutes}} min pickup',
              tripDistance: 'Trip {{distance}} km',
              tripWithDuration: 'Trip {{distance}} km · ~{{minutes}} min',
              stops_one: '{{count}} stop',
              stops_other: '{{count}} stops',
              paymentCash: 'Cash',
              paymentCard: 'Card',
              vehicleAuto: 'Car',
              vehicleMoto: 'Moto',
              designatedTag: 'Designated',
              scheduledToday: 'Today · {{time}}',
              scheduledTomorrow: 'Tomorrow · {{time}}',
              scheduledDate: '{{date}} · {{time}}',
              scheduledWaiting: 'Waiting for the scheduled time',
              scheduledConfirmed: 'Confirmed',
              scheduledAwaitingConfirm: 'Confirm your ride',
              scheduledClientConfirmed: 'Client confirmed · confirm your ride',
              scheduledTimeReached: "It's ride time",
              confirmScheduled: 'Confirm ride',
            placeholders: {
                originAddress: 'Origin',
                destinationAddress: 'Destination',
            },
          },
          modal: {
              close: 'Close',
          },
          assignModal: {
            title: 'Claim scheduled ride',
            subtitle: 'Enter the code the client shared with you',
            placeholder: 'Eg: K7M2NP',
            cancel: 'Cancel',
            confirm: 'Claim',
            assigning: 'Claiming...',
            assignProgrammedButton: 'Claim scheduled ride with code',
          },
        },
          ridePreview: {
            voice: {
              summary: 'Net fare {{price}} córdobas.',
              summaryWithDistance: 'Net fare {{price}} córdobas. Total distance {{distance}} km.',
              clientOffer: 'Client offered {{amount}} córdobas.',
            },
            alerts: {
              canceledTitle: 'Ride canceled',
              canceledBody: 'The client canceled the request.',
              assignedTitle: 'Ride assigned to another driver',
              assignedBody: 'The client assigned the trip to another driver.',
              unavailableTitle: 'Ride unavailable',
              unavailableBody: 'The client confirmed another driver for this trip.',
              routeErrorTitle: 'Incomplete route',
              routeErrorBody: 'We could not calculate the entire route. Showing an approximate path.',
              infoTitle: 'Info',
              noPhone: 'Client phone number unavailable.',
              callError: 'We could not start the call.',
              missingUser: 'We could not retrieve your information.',
              invalidPriceTitle: 'Invalid price',
              invalidPriceBody: 'Enter a valid amount greater than zero.',
              counterOfferError: 'We could not send the counteroffer.',
              canceledOtherReason: 'The client canceled the request.',
              activeRideTitle: 'You already have an active ride',
              activeRideBody: 'Finish your current ride before accepting a new one.',
              cardRequiredTitle: 'Card required',
              cardRequiredBody:
                'To accept card rides you need to register at least one bank card. Add a card before continuing.',
              cardRequiredConfirm: 'Go to payment methods',
              cardRequiredCancel: 'Cancel',
              offerSentTitle: 'Offer sent',
              offerAcceptedBody: 'You accepted the ride for {{amount}}. Waiting for the client confirmation...',
              offerNotifiedBody: 'We notified the client. Waiting for confirmation...',
              acceptRideError: 'We could not accept the ride.',
            },
            loader: {
              calculatingRoute: 'Calculating route...',
            },
            negotiation: {
              status: {
                client_suggested: 'Waiting for your response',
                driver_offered: 'Waiting for the client',
                driver_accepted: 'You accepted the client price',
                client_accepted: 'The client accepted your offer',
                defaultClient: 'Waiting for your response',
                defaultDriver: 'Waiting for the client',
              },
              driverOfferTitle: 'You just proposed {{amount}}',
              clientOfferTitle: 'The client proposed {{amount}}',
              estimatedLabel: 'Estimated price',
              clientOfferLabel: 'Client offer',
              suggestionsLabel: 'Suggested prices',
              customOfferButton: 'Make an offer',
              yourOffer: 'Your offer',
              customLabel: 'Enter your custom offer',
              placeholderExample: 'Eg. 95',
              send: 'Send',
              finalLabel: 'Estimated final price',
            },
            nearby: {
              title: 'Nearby request',
              subtitle: '{{distance}} • {{price}} • {{origin}}',
              distanceFallback: 'Nearby',
              priceFallback: 'Price pending',
              originFallback: 'Nearby origin',
              distanceMeters: '{{distance}} m',
              distanceKilometers: '{{distance}} km',
              view: 'View',
            },
            labels: {
              estimatedPrice: 'Estimated price: {{amount}}',
              notAvailable: 'N/A',
              clientFallback: 'Client',
              originFallback: 'Origin',
              destinationFallback: 'Destination',
              currency: 'C${{amount}}',
              clientNote: 'Note: {{note}}',
              tripDistance: '{{value}} km',
              tripDuration: '~{{value}} min',
              paymentCash: 'Cash',
              paymentCard: 'Card',
            },
            accessibility: {
              messageClient: 'Message the client',
              callClient: 'Call the client',
              vehiclePhoto: 'View client vehicle photo',
              toggleDetails: 'Show or hide ride details',
            },
            rideCard: {
              clientFallback: 'Client',
              initialFallback: 'CL',
              origin: 'Origin: {{address}}',
              destination: 'Destination: {{address}}',
              stops: 'Stops: {{count}}',
              price: 'Price: {{amount}}',
              distanceToOrigin: '{{distance}} km to pickup',
              calculating: 'Calculating...',
              etaToOrigin: '~{{minutes}} min to arrive',
              viewVehicle: 'View vehicle',
              view: 'Details',
              placeholders: {
                originAddress: 'Origin',
                destinationAddress: 'Destination',
              },
            },
            buttons: {
              accept: 'Accept',
              reject: 'Reject',
              viewVehiclePhoto: 'View photo',
            },
            modal: {
              close: 'Close',
            },
          },
        activeRide: {
          labels: {
            driverFallback: 'Driver',
            clientFallback: 'Client',
            initialFallback: 'C',
            fare: 'Fare: {{amount}}',
            currency: 'C${{amount}}',
            notAvailable: 'N/A',
            originFallback: 'Origin',
            destinationFallback: 'Destination',
            stopLabel: 'Stop {{index}}',
            estimatedTitle: 'Estimate',
            estimatedMinutes: '{{minutes}} min',
            estimatedDistance: '{{distance}} km',
            pickupLabel: 'Pickup',
            destinationLabel: 'Destination',
            paymentCash: 'Cash',
            paymentCard: 'Card',
          },
          status: {
            pending_confirm: 'Waiting for confirmation',
            accepted: 'Ride accepted',
            driver_on_route: 'Heading to pickup',
            driver_arrived: 'Client waiting',
            in_progress: 'Ride in progress',
            pending_payment: 'Pending payment',
            completed: 'Ride completed',
            canceled: 'Ride canceled',
            default: 'Active ride',
          },
          loader: {
            loadingDetails: 'Loading ride details...',
            waitingData: 'Waiting for ride data...',
          },
          evidence: {
            title: 'Vehicle check before starting',
            subtitle: "Take photos of the client's insurance, circulation card, and four seats.",
            photos: {
              insurance: 'Insurance document',
              registration: 'Circulation document',
              frontDriverSeat: 'Front driver seat',
              frontPassengerSeat: 'Front passenger seat',
              rearLeftSeat: 'Rear left seat',
              rearRightSeat: 'Rear right seat',
            },
            captured: 'Photo ready',
            required: 'Required',
            take: 'Take photo',
            retake: 'Retake',
            takePhoto: 'Take photo: {{photo}}',
            retakePhoto: 'Retake photo: {{photo}}',
            attestation: 'I checked the insurance and circulation documents and confirm they are current.',
            submit: 'Upload 6 photos and confirm',
            uploadProgress: 'Uploading photo {{current}} of {{total}}...',
            close: 'Close',
            cancelIfExpired: "Can't confirm the documents are current? Cancel this ride.",
            permissionTitle: 'Camera permission required',
            permissionMessage: 'Allow camera access to capture the six required photos.',
            cameraError: 'Could not take the photo. Try again.',
            requiredPhoto: 'Capture all six required photos.',
            uploadError: 'Could not upload and save the inspection. Try again.',
          },
          alerts: {
            goOnRouteError: 'We could not mark you on the way.',
            startRideError: 'We could not start the ride.',
            completeRideError: 'We could not complete the ride.',
            cancelRideError: 'We could not cancel the ride.',
            cancelRideTitle: 'Cancel ride',
            cancelRideMessage: 'Are you sure you want to cancel this ride?',
            cancelRideConfirm: 'Cancel ride',
            cancelRideKeep: 'Keep ride',
            canceledTitle: 'Ride canceled',
            canceledByDriver: 'The ride has been canceled.',
            canceledByClient: 'The client canceled the ride.',
            rideNotFound: 'Ride not found.',
            canceledByDriverMessage: 'The ride has been canceled.',
            canceledByClientMessage: 'The client canceled the ride.',
          },
          buttons: {
            navigate: 'Navigate',
            goOnRoute: 'Head to pickup',
            goOnRoutePending: 'Marking...',
            startRide: 'Start ride',
            startRidePending: 'Starting...',
            completeRide: 'Complete ride',
            completeRidePending: 'Completing...',
            cancelRide: 'Cancel ride',
          },
          cta: {
            goOnRoute: 'Head to pickup',
            goOnRoutePending: 'Marking...',
            startRide: 'Start ride',
            startRidePending: 'Starting...',
            completeRide: 'Complete ride',
            completeRidePending: 'Completing...',
            markArrived: 'I arrived at pickup',
            markArrivedPending: 'Marking arrival...',
            completeEvidence: 'Take the six photos',
            completeEvidencePending: 'Opening photo capture...',
          },
          voice: {
            origin: 'Pickup {{origin}}',
            destination: 'Destination {{destination}}',
            netFare: 'Net fare {{amount}} córdobas',
            totalDistance: 'Total distance {{distance}} km',
            originFallback: 'the assigned pickup',
            destinationFallback: 'the final destination',
            messagePrefix: 'Client message: {{message}}',
            coords: '{{lat}} by {{lng}}',
          },
          navigation: {
            title: 'Navigate with GPS',
            subtitle: 'Choose your preferred navigation app',
            googleMaps: '🗺️ Google Maps',
            waze: '🚗 Waze',
            cancel: 'Cancel',
            button: 'Navigate',
          },
          accessibility: {
            muteVoice: 'Mute voice',
            resumeVoice: 'Resume voice',
            openChat: 'Open chat with client',
            callClient: 'Call client',
            togglePanel: 'Show or hide ride details',
            navigate: 'Open navigation options',
          },
          notifications: {
            newMessageTitle: 'New client message',
          },
          support: {
            title: 'I need help with this trip',
            label: 'Contact support',
            description: 'Open a support chat to report issues with the client, payments, or the app.',
          },
        },
       earnings: {
        labels: {
          currency: 'C${{amount}}',
          percent: '{{value}}',
        },
        header: {
          title: 'Earnings',
        },
        section: {
          balance: 'Balance',
          stats: 'Statistics',
          rides: 'Trip history',
        },
        period: {
          today: 'Today',
          week: 'Week',
          month: 'Month',
        },
        summary: {
          totalGross: 'Gross total',
          commission: 'Commission',
          net: 'Net',
        },
        nav: {
          commissions: 'Recharge funds',
          history: 'History',
        },
        commission: {
          title: '💰 Commission breakdown',
          cashLabel: 'Cash',
          cardLabel: 'Card/Bank',
          normalTrips: '{{count}} regular rides ({{rate}})',
          designatedTrips: '{{count}} designated rides ({{rate}})',
          subtotalCash: 'Cash subtotal:',
          subtotalCard: 'Card subtotal:',
          totalLabel: 'Total commissions:',
        },
        stats: {
          ridesToday: 'Rides today',
          totalRides: 'Total historical rides',
          totalTime: 'Total time',
          avgEarnings: 'Average fare',
          totalNet: 'Historical total',
          totalDistance: 'Total distance',
          minutes: '{{value}} min',
          kilometers: '{{value}} km',
          placeholder: '--',
        },
        rides: {
          title: '📋 Trip history',
          empty: 'No trips in this period',
          status: {
            paid: 'Paid',
            pending: 'Pending',
          },
          origin: '📍 {{value}}',
          destination: '🎯 {{value}}',
          distance: '📏 {{value}} km',
          duration: '⏱️ {{value}} min',
          fare: 'Fare:',
          commission: 'Commission:',
          net: 'Your earnings:',
          unknownLocation: 'Unknown location',
        },
      },
        rechargeFunds: {
          header: {
            title: 'Recharge funds',
          },
          loading: 'Loading summary...',
          summary: {
            title: 'Wallet summary',
            currentBalanceLabel: 'Available balance',
            totalRechargedLabel: 'Total recharged',
            totalDeductedLabel: 'Total deducted',
            hint: 'Keep your wallet balance above C$0.00 to continue accepting rides.',
          },
          methods: {
            title: 'Choose how to recharge',
            cardTitle: 'Saved card',
            cardDescription: 'Use one of your saved cards to register this recharge.',
            cardEmpty: 'You do not have saved cards yet. Add one to recharge with card.',
            cardManageLink: 'Go to payment methods →',
            bankTitle: 'Bank transfer',
            bankDescription: 'Record a bank transfer recharge with its reference.',
          },
          info: {
            title: 'Recharge method',
          },
          input: {
            amountLabel: 'Recharge amount',
            amountPlaceholder: 'Ex. 150',
            referenceLabel: 'Transfer reference (optional)',
            placeholder: 'Ex. #FT-12345678',
          },
          button: {
            pay: 'Recharge {{amount}}',
          },
          alerts: {
            invalidAmountTitle: 'Invalid amount',
            invalidAmountMessage: 'Enter a valid amount greater than zero.',
            selectCardTitle: 'Select a card',
            selectCardMessage: 'Choose a card to recharge with card.',
            biometricPrompt: 'Confirm your identity to recharge {{amount}}',
            biometricErrorTitle: 'Error',
            biometricErrorMessage: 'We could not confirm your identity. Try again.',
            paymentSuccessTitle: 'Recharge recorded',
            paymentSuccessMessage: 'A recharge of {{amount}} was registered. New balance: {{balance}}.',
            paymentSuccessButton: 'OK',
            paymentErrorTitle: 'Error',
            paymentErrorMessage: 'We could not register the recharge.',
          },
          cards: {
            defaultBadge: ' (Default)',
          },
          navigation: {
            goToPaymentMethods: 'Go to payment methods →',
          },
          support: {
            title: 'Help with my wallet',
            label: 'Issues recharging funds?',
            description: 'Open a support chat to review wallet recharges, references, or saved cards.',
          },
          history: {
            title: 'Recharge history',
            totalLabel: '{{count}} total',
            empty: 'No recharges yet.',
            sourceLabel: 'Source: {{source}}',
            defaultSource: 'manual',
            defaultStatus: 'confirmed',
            previous: 'Previous',
            next: 'Next',
            page: 'Page {{current}}/{{total}}',
          },
          invoice: {
            title: 'Recharge receipt',
            close: 'Close',
            empty: 'No movement selected',
            amount: 'Amount',
            fields: {
              movementId: 'Movement ID',
              driverId: 'Driver ID',
              createdAt: 'Created at',
              type: 'Type',
              source: 'Source',
              balanceBefore: 'Balance before',
              balanceAfter: 'Balance after',
              rideId: 'Ride ID',
              externalReference: 'External reference',
              externalTransaction: 'External transaction',
              metadata: 'Metadata',
            },
          },
        },
        paymentConfirmation: {
          loading: 'Loading payment details...',
          header: {
            cashTitle: 'Cash payment',
            cardTitle: 'Card payment',
            cashSubtitle: '{{name}} must pay in cash',
            cardSubtitle: '{{name}} must pay by card',
          },
          breakdown: {
            title: 'Payment breakdown',
            fare: 'Trip fare',
            tip: 'Tip',
            total: 'Total to receive',
            methodLabel: 'Method:',
            methodCash: 'Cash',
            methodCard: 'Card',
          },
          cashStatus: {
            confirmedTitle: 'Client confirmed the payment',
            confirmedSubtitle: 'You can confirm that you received the cash',
            waitingTitle: 'Waiting for client confirmation',
            waitingSubtitle: 'The client must confirm the cash payment first.',
          },
          instructions: {
            title: 'Instructions',
            text:
              '1. Wait for the client to confirm the payment\n2. Verify they hand you the exact amount\n3. Count the cash carefully\n4. Confirm only if you received the total amount',
          },
          cardStatus: {
            processing: 'Processing card payment...',
            pending: 'Waiting for confirmation...',
            verifying: 'Verifying payment...',
            description: 'The payment will be confirmed automatically when the client finishes the process.',
            infoMessage: 'Do not close this screen. We will notify you once the payment is confirmed.',
          },
          buttons: {
            confirmCash: 'Confirm – I received the payment',
            switchToCard: 'Switch to card',
            switchToCash: 'Switch to cash',
            reportIssue: 'Report an issue',
            generateCode: 'Generate confirmation code',
          },
          methodBadge: {
            label: 'Method: {{value}}',
            cash: 'Cash',
            card: 'Card',
          },
          switchDisabled: {
            title: 'Cannot change payment method',
            subtitle: 'The client already confirmed the payment',
          },
          codeLabel: 'Confirmation code: {{code}}',
          support: {
            title: 'Help with payment confirmation',
            label: 'Issues with this charge?',
            description: 'Open a support chat to clarify charges, confirmation codes, or method changes.',
          },
          alerts: {
            waitTitle: 'Wait',
            waitMessage: 'The client must confirm the cash payment first.',
            cardRequiredTitle: 'Card required',
            cardRequiredMessage:
              'To receive card payments you need to register at least one bank card. You can add it in Payment Methods.',
            cardRequiredAction: 'Go to payment methods',
            paymentCompletedTitle: 'Payment completed!',
            paymentCompletedMessage: 'The payment was confirmed successfully.',
            cashConfirmedTitle: 'Payment confirmed!',
            cashConfirmedMessage: 'The cash payment was confirmed by both parties.',
            methodChangeTitle: 'Switch to {{method}}',
            methodChangeMessage: 'Do you want to change the payment method to {{methodLower}}?',
            methodChangeSuccessTitle: 'Method updated',
            methodChangeSuccessMessage: 'The payment method was changed to {{methodLower}}. The client will be notified.',
            cancelSuccessTitle: 'Payment canceled',
            cancelSuccessMessage: 'The issue was reported. Support will review the case.',
            genericError: 'We could not complete the action. Try again.',
            reportTitle: 'Report an issue',
            reportMessage: 'What happened with the payment?',
            reportOptions: {
              noPay: 'Client did not pay',
              wrongAmount: 'Wrong amount',
              cardIssue: 'Card issue',
              other: 'Other problem',
              cancel: 'Cancel',
            },
            codeRequiredTitle: 'Code required',
            codeRequiredMessage:
              'You must enter the client code correctly before confirming.',
            codeSuccessTitle: 'Code verified',
            codeSuccessMessage: 'The code is correct. You can now confirm the payment.',
            codeErrorMessage: 'Incorrect code',
          },
          methodNames: {
            cash: 'Cash',
            card: 'Card',
            cashLower: 'cash',
            cardLower: 'card',
          },
        },
        confirmCashPayment: {
          loading: 'Checking payment status...',
          header: {
            title: 'Confirm cash payment',
            subtitle: '{{name}} must pay you in cash',
          },
          breakdown: {
            title: 'Payment breakdown',
            fare: 'Trip fare',
            tip: 'Tip',
            total: 'Total to receive',
          },
          status: {
            verifying: 'Verifying payment status...',
            confirmedTitle: 'Client confirmed the payment',
            confirmedSubtitle: 'You can confirm that you received the cash',
            waitingTitle: 'Waiting for client confirmation',
            waitingSubtitle: 'The client must confirm the cash payment first.',
          },
          instructions: {
            title: 'Instructions',
            text:
              '1. Wait for the client to confirm the payment\n2. Verify they hand you the exact amount\n3. Count the cash carefully\n4. Confirm only if you received the full amount',
          },
          warning: {
            text: 'If the client does not pay or there is an issue, tap “Report an issue” before confirming.',
          },
          buttons: {
            confirm: 'Confirm – I received the payment',
            switchToCard: 'Switch to card payment',
            report: 'Report an issue',
            useSms: 'Use SMS verification',
            verifySms: 'Verify code',
          },
          sms: {
            placeholder: 'Enter 6-digit code',
            attemptsWarning: 'Wrong code. Attempts left: {{attempts}}',
            tooManyAttempts: 'Too many attempts. Try again in 5 minutes.',
            invalidLength: 'Enter the 6-digit code',
            sentTitle: 'SMS sent',
            sentMessage: 'Check your phone for the verification code.',
          },
          alerts: {
            waitTitle: 'Hold on',
            waitMessage: 'The client must confirm the cash payment first.',
            biometricPrompt: 'Authenticate to confirm the payment of C${{amount}}',
            biometricErrorTitle: 'Authentication failed',
            biometricErrorMessage: 'We could not verify your identity. Try again.',
            successTitle: 'Payment confirmed!',
            successMessage: 'The cash payment was confirmed successfully.',
            reportTitle: 'Report an issue',
            reportMessage: 'What happened with the payment?',
            reportOptions: {
              noPay: 'Client did not pay',
              wrongAmount: 'Wrong amount',
              other: 'Other issue',
              cancel: 'Cancel',
            },
            reportSuccessTitle: 'Payment canceled',
            reportSuccessMessage: 'The issue was reported. Support will review the case.',
            switchTitle: 'Switch to card payment',
            switchMessage: 'Does the client have no cash? You can switch the payment method to card.',
            switchSuccessTitle: 'Method updated',
            switchSuccessMessage: 'The payment method was changed to card. The client will be notified.',
            genericError: 'We could not complete the action. Try again.',
            smsError: 'We could not send the SMS code.',
            smsVerifyError: 'We could not verify the code.',
          },
        },
        documentInspection: {
          header: {
            title: 'Driver documents',
            subtitle:
              "Please complete your driver's license information and upload the front and back photos.",
          },
          licenseSection: {
            title: 'License information',
            numberLabel: 'License number *',
            numberPlaceholder: 'Ex: B21332434',
            expiryLabel: 'Expiration date (YYYY-MM-DD) *',
            expiryPlaceholder: 'Ex: 2030-02-12',
          },
          photosSection: {
            title: 'License photos',
            frontTitle: '1. License front',
            backTitle: '2. License back',
            takePhoto: 'Take photo',
            retakePhoto: 'Retake photo',
            chooseFromGallery: 'Gallery',
          },
          notice: {
            text:
              '⚠️ Ensure the photos are clear and legible. Our team will verify these documents.',
          },
          loading: {
            uploading: 'Uploading documents... {{progress}}%',
          },
          verified: {
            title: 'Documents verified ✅',
            subtitle: 'If you need to update your information, contact support.',
          },
          buttons: {
            save: 'Save documents',
            missingData: 'Complete all data and photos',
          },
          alerts: {
            permissionTitle: 'Permission required',
            permissionMessage: 'We need camera access to take photos of your documents.',
            galleryPermissionMessage:
              'We need gallery access to select photos of your documents.',
            cameraErrorTitle: 'Error',
            cameraErrorMessage: 'We could not take the photo.',
            galleryErrorMessage: 'We could not select the photo.',
            missingDataTitle: 'Error',
            missingDataMessage: 'Please complete all fields and photos to continue.',
            successTitle: 'Success',
            successMessage: 'Driver documents updated successfully.',
            successButton: 'OK',
            uploadErrorTitle: 'Error',
            uploadErrorMessage: 'We could not upload the documents. Please try again.',
          },
        },
        driverPendingApproval: {
          header: {
            pendingTitle: 'Your account is under review',
            suspendedTitle: 'Account suspended',
            rejectedTitle: 'Account rejected',
            pendingDescription:
              'We are verifying your documents and vehicle. This process can take between 24 and 48 hours.',
            blockedDescription:
              'Your account cannot be used right now. Please contact support to review your case.',
          },
          status: {
            accountLabel: 'Account status',
            documentsLabel: 'Documents',
            vehicleLabel: 'Vehicles',
            accountValues: {
              active: 'Active',
              pending: 'Pending',
              suspended: 'Suspended',
              rejected: 'Rejected',
            },
            documentsValues: {
              verified: 'Verified',
              pending: 'Pending',
              suspended: 'Suspended',
              rejected: 'Rejected',
            },
            vehicleValues: {
              active: 'At least one active vehicle',
              none: 'No approved active vehicle',
            },
          },
          supportBasic: {
            title: 'You need support assistance',
            description: 'Contact our team to review the status of your account and documents.',
            button: 'Call support',
            chat: {
              title: 'Help with my account approval',
              label: 'Need help with your verification?',
              description: 'Chat with support to accelerate document review or resolve account blocks.',
            },
          },
          info: {
            text: 'We will notify you when your account is ready to start receiving rides.',
          },
          buttons: {
            refresh: 'Reload to update',
            viewProfile: 'View my profile',
            logout: 'Log out',
          },
          support: {
           supportChatTitle: 'Help with my account approval',
           supportChatLabel: 'Need help with your verification?',
           supportChatDescription: 'Chat with support to accelerate document review or resolve account blocks.',
          },
        },
        vehicleInspection: {
          header: {
            title: 'Vehicle inspection',
            subtitle:
              'Before starting the trip with {{name}}, document the current condition of the vehicle with the required photos.',
            clientFallback: 'the client',
          },
          steps: {
            frontTitle: '1. Front photo of the vehicle',
            rearTitle: '2. Rear photo of the vehicle',
            interiorFrontTitle: '3. Front interior photo',
            interiorRearTitle: '4. Rear interior photo',
            takePhoto: '📷 Take photo',
            retakePhoto: 'Retake photo',
          },
          notice: {
            text:
              '⚠️ These photos document the vehicle condition before the trip and protect both the client and the driver.',
          },
          loading: {
            uploading: 'Uploading photos... {{progress}}%',
          },
          buttons: {
            complete: 'Finish inspection and start trip',
            incomplete: 'Complete all photos to continue',
          },
          alerts: {
            permissionTitle: 'Permissions required',
            permissionMessage: 'Camera access is needed to take the vehicle photos.',
            cameraErrorTitle: 'Error',
            cameraErrorMessage: 'We could not take the photo.',
            missingDataTitle: 'Error',
            missingDataMessage: 'Photos or required data are missing to continue.',
            successTitle: 'Success',
            successMessage: 'Vehicle inspection completed. You can now start the trip.',
            successButton: 'Start trip',
            uploadErrorTitle: 'Error',
            uploadErrorMessage: 'We could not upload the photos. Please try again.',
          },
        },
        VehicleVerificationScreen: {
          header: {
            title: 'Vehicle verification',
            subtitle: 'Complete the information and upload your vehicle photos to be able to take trips.',
          },
          form: {
            title: 'Registration information',
            registrationNumberLabel: 'Registration number *',
            registrationNumberPlaceholder: 'Ex: B2301230',
            registrationExpiryLabel: 'Registration expiration (YYYY-MM-DD) *',
            registrationExpiryPlaceholder: 'Ex: 2029-02-14',
            insuranceNumberLabel: 'Insurance policy number *',
            insuranceNumberPlaceholder: 'Ex: RCO30201102',
            insuranceCompanyLabel: 'Insurance company *',
            insuranceCompanyPlaceholder: 'Select your insurance company',
            insuranceExpiryLabel: 'Insurance expiration (YYYY-MM-DD) *',
            insuranceExpiryPlaceholder: 'Ex: 2030-02-12',
          },
          periodic: {
            title: 'Periodic documents (optional)',
            subtitle:
              'Required to operate: technical inspection (ITM), emissions certificate, municipal road tax and revisado sticker. Fill them in if you already have them.',
            inspectionName: 'Technical inspection (ITM)',
            emissionsName: 'Emissions certificate',
            inspectionDateLabel: 'ITM inspection date (YYYY-MM-DD)',
            inspectionDatePlaceholder: 'Ex: 2025-11-05',
            inspectionValidUntilLabel: 'ITM valid until (YYYY-MM-DD)',
            inspectionValidUntilPlaceholder: 'Ex: 2026-11-05',
            emissionsTestedAtLabel: 'Emissions test date (YYYY-MM-DD)',
            emissionsTestedAtPlaceholder: 'Ex: 2025-11-05',
            emissionsValidUntilLabel: 'Emissions valid until (YYYY-MM-DD)',
            emissionsValidUntilPlaceholder: 'Ex: 2026-11-05',
            roadTaxPaidAtLabel: 'Road tax payment date (YYYY-MM-DD)',
            roadTaxPaidAtPlaceholder: 'Ex: 2026-01-15',
            revisadoValidUntilLabel: 'Revisado sticker valid until (YYYY-MM-DD)',
            revisadoValidUntilPlaceholder: 'Ex: 2026-12-31',
            photoInspection: 'ITM certificate photo (optional)',
            photoEmissions: 'Emissions certificate photo (optional)',
            photoRoadTax: 'Road tax receipt photo (optional)',
            photoRevisado: 'Revisado sticker photo (optional)',
          },
          photos: {
            title: 'Vehicle photos',
            vehicleTitle: '1. Vehicle overview photo',
            registrationFrontTitle: '2. Registration – front',
            registrationBackTitle: '3. Registration – back',
            insuranceTitle: '4. Insurance policy photo',
            takePhoto: 'Take photo',
            retakePhoto: 'Retake photo',
            chooseFromGallery: 'Gallery',
          },
          notice: {
            text:
              '⚠️ Make sure every photo is clear and readable. Our team will review these documents.',
          },
          loading: {
            verifying: 'Verifying vehicle... {{progress}}%',
          },
          buttons: {
            submit: 'Verify vehicle',
            incomplete: 'Complete all information and photos',
          },
          alerts: {
            permissionTitle: 'Permissions required',
            permissionMessage: 'Camera access is needed to take photos of your vehicle.',
            galleryPermissionMessage:
              'We need gallery access to select photos of your vehicle.',
            cameraErrorTitle: 'Error',
            cameraErrorMessage: 'We could not take the photo.',
            galleryErrorMessage: 'We could not select the photo.',
            missingDataTitle: 'Error',
            missingDataMessage: 'Photos or required data are missing to continue.',
            partialDocsMessage: 'These documents need both dates to be registered:',
            successTitle: 'Success',
            successMessage: 'Vehicle verified successfully. You can now take trips.',
            successButton: 'OK',
            uploadErrorTitle: 'Error',
            uploadErrorMessage: 'We could not upload the data. Please try again.',
          },
        },
        WaitingClientConfirmation: {
          pending: {
            title: 'Waiting for confirmation',
            subtitle: 'The client is reviewing your offer',
            statusBadge: 'Offer sent to the client',
            expiresLabel: 'Your offer expires in',
            tripDetails: 'Trip details',
            originLabel: 'Origin',
            destinationLabel: 'Final destination',
            stopLabel: 'Stop {{index}}',
            stopFallback: 'Additional stop',
            fareLabel: 'Agreed fare',
          },
          tips: {
            title: 'While you wait',
            tipVehicle: 'Keep your vehicle ready',
            tipGps: 'Verify your GPS location',
            tipAlternateDriver: 'The client might pick another driver',
          },
          buttons: {
            cancelOffer: 'Cancel offer',
          },
          accepted: {
            title: 'Client chose you!',
            subtitle: 'Preparing trip...',
          },
          alerts: {
            rideCanceledTitle: 'Ride canceled',
            rideCanceledMessage: 'The client canceled the ride.',
            rideMissingTitle: 'Ride canceled',
            rideMissingMessage: 'The client canceled the ride request.',
            offerRejectedTitle: 'Offer rejected',
            offerRejectedMessage: 'The client chose another driver. You can look for other rides.',
            offerRejectedMeTitle: 'Offer rejected',
            offerRejectedMeMessage: 'The client rejected your offer. You can look for other rides.',
            cancelOfferTitle: 'Cancel offer',
            cancelOfferMessage:
              'Are you sure you want to cancel your offer? The ride will be available to other drivers.',
            cancelOfferNo: 'No',
            cancelOfferYes: 'Yes, cancel',
            cancelErrorTitle: 'Error',
            cancelErrorMessage: 'We could not cancel the offer.',
            offerExpiredTitle: 'Offer expired',
            offerExpiredMessage:
              'The client did not respond in time. Your offer was withdrawn and the ride is available to other drivers.',
          },
        },
      },
      shared: {
        chat: {
          status: {
            online: 'Online',
            offline: 'Offline',
            connecting: 'Connecting…',
          },
          quickMessages: [
            '👍 Ok',
            '⏱️ Arriving in 5 min',
            '📍 I have arrived',
            '🚗 On my way',
            '✅ Perfect',
            '❓ Where are you?',
          ],
          empty: {
            message: 'Start the conversation with {{name}}',
          },
          typing: '{{name}} is typing...',
          dates: {
            today: 'Today',
            yesterday: 'Yesterday',
          },
          scrollToBottom: 'Go to latest messages',
          input: {
            placeholder: 'Write a message...',
            send: 'Send message',
          },
          alerts: {
            noPhoneTitle: 'Phone unavailable',
            noPhoneMessage: 'No phone number is associated with this contact.',
            callTitle: 'Call',
            callMessage: 'Do you want to call {{name}}?\n{{phone}}',
            cancel: 'Cancel',
            callButton: 'Call',
            deviceErrorTitle: 'Cannot call',
            cannotCallDevice: 'Your device cannot make this call.',
            callFailedTitle: 'Call failed',
            callFailedMessage: 'We could not start the call. Please try again.',
          },
        },
        rating: {
          header: {
            titleDriver: 'How was your passenger?',
            titleClient: 'How was your trip?',
            subtitle: 'Your feedback helps us improve the service',
          },
          ratingText: {
            five: 'Excellent! 🎉',
            four: 'Very good 👍',
            three: 'Good 👌',
            two: 'Fair 😐',
            one: 'Bad 😞',
          },
          sections: {
            quickComments: 'Quick comments:',
            categories: 'Rate by categories:',
            additionalComment: 'Additional comment (optional):',
          },
          categories: {
            punctuality: {
              driver: 'Passenger punctuality',
              client: 'Driver punctuality',
            },
            cleanliness: {
              driver: 'Cleanliness and order',
              client: 'Vehicle cleanliness',
            },
            communication: {
              driver: 'Communication',
              client: 'Communication',
            },
            driving: {
              driver: 'Respect during the ride',
              client: 'Driving quality',
            },
            safety: {
              driver: 'Safety',
              client: 'Safety',
            },
            friendliness: {
              driver: 'Friendliness',
              client: 'Friendliness',
            },
          },
          quickComments: {
            driver: [
              'Excellent passenger',
              'Very punctual',
              'Friendly and respectful',
              'Great attitude',
            ],
            client: [
              'Excellent driver',
              'Very professional',
              'Safe driving',
              'Clean vehicle',
              'Arrived on time',
            ],
          },
          input: {
            commentPlaceholder: 'Tell us about your experience...',
          },
          buttons: {
            submit: 'Send rating',
            skip: 'Skip for now',
          },
          alerts: {
            missingRating: 'Please select a rating',
            successTitle: 'Thank you!',
            successMessage: 'Your rating has been submitted successfully',
            submitError: 'Could not submit your rating',
          },
        },
        rideTracking: {
          loading: {
            connectingDriver: 'Connecting with the driver...',
            fetchingRoute: 'Updating route...',
            syncingRide: 'Syncing ride status...',
          },
          alerts: {
            cannotCancelTitle: 'Cannot cancel',
            cannotCancelMessage: 'This ride cannot be canceled right now.',
            cancelRideTitle: 'Cancel ride',
            cancelRideMessage: 'Are you sure you want to cancel this ride?',
            cancelRideReason: 'Canceled by the client',
            cancelRideSuccessTitle: 'Ride canceled',
            cancelRideSuccessMessage: 'Your ride was canceled.',
            cancelRideError: 'We could not cancel the ride.',
            rideCanceledTitle: 'Ride canceled',
            rideCanceledByDriver: 'Your driver canceled this ride.',
            rideUnavailable: 'This ride is no longer available.',
          },
          status: {
            accepted: 'Driver on the way',
            driver_on_route: 'Driver on the way',
            driver_arrived: 'Driver arrived',
            in_progress: 'In ride',
            pending_payment: 'Payment pending',
            completed: 'Completed',
            canceled: 'Canceled',
            default: 'Status',
          },
          eta: {
            pendingPayment: 'Trip finished — pending payment',
            completed: 'Trip completed',
            canceled: 'Trip canceled',
            arrivesAt: 'Arrives at {{time}}',
            driverOnTheWay: 'Driver on the way',
            calculating: 'Calculating...',
            tripData: 'Trip info: {{summary}}',
          },
          labels: {
            tripSummary: '{{duration}} · {{distance}}',
            distanceValue: '{{value}} km',
            distanceFallback: '-- km',
            durationValue: '{{value}} min',
            durationFallback: '-- min',
            driverUnknown: 'Driver',
            driverInitialFallback: 'D',
            vehiclePlateFallback: 'N/A',
            pickupLabel: 'Pickup',
            pickupFallback: 'My location',
            stopLabel: 'Stop {{index}}',
            destinationLabel: 'Final destination',
            destinationFallback: 'Destination',
            routeOriginFallback: 'Origin',
            routeDestinationFallback: 'Destination',
            shareTitle: 'Share trip',
            shareMessage:
              'I am on a trip with {{driver}} ({{vehicleBrand}} {{vehicleModel}} - {{vehicleColor}}) - Plate: {{plate}}\nPickup: {{pickup}}\nTrack my trip live: {{url}}',
            shareError: 'Could not share the trip location.',
            paymentCash: 'Cash',
            paymentCard: 'Card',
          },
          accessibility: {
            openChat: 'Open chat with the driver',
            expandPanel: 'Show trip details',
            collapsePanel: 'Hide trip details',
          },
          support: {
            title: 'Help with my ongoing trip',
            label: 'Need help with this trip?',
            description: 'Open the support chat to report incidents, delays, or issues with the driver.',
          },
          designatedNotice: {
            title: 'Before the ride starts',
            body: 'Your driver will upload photos of the insurance, circulation card, and four seats, then confirm that both documents are current.',
            dismiss: 'Dismiss notice',
          },
          buttons: {
            goToPayment: 'Go to payment',
            shareLocation: 'Share location',
            cancel: 'Cancel ride',
            continue: 'Continue trip',
            confirmCancel: 'Cancel ride',
          },
        },
        notifications: {
          channels: {
            default: 'Nearby rides',
            activeRide: 'Active ride',
          },
          quickReturn: {
            title: 'Active ride',
            body: 'Tap to return to the ride',
          },
          formats: {
            priceCordoba: 'C${{amount}}',
            distanceKm: '{{value}} km',
          },
          newRide: {
            title: '🚗 New ride available',
            body: '{{distance}} • {{price}} • {{origin}}',
            originFallback: 'Selected location',
          },
          rideAccepted: {
            title: '✅ Ride accepted',
            body: 'Driver {{driverName}} accepted your ride',
            driverFallback: 'Driver',
          },
          rideStarted: {
            title: '🚗 Ride started',
            body: 'Your driver started the trip',
          },
          rideCompleted: {
            title: '✅ Ride completed',
            body: 'Trip finished. Rate your experience!',
          },
          rideCanceled: {
            title: 'Ride canceled',
            body: 'The ride was canceled.',
          },
          generic: {
            defaultTitle: 'New notification',
            defaultBody: 'You have a new notification.',
          },
          live: {
            statuses: {
              driver_assigned: {
                title: 'Driver confirmed',
                subtitle: 'We are preparing your ride',
              },
              driver_on_route: {
                title: 'Driver on the way',
                subtitle: 'Heading to your pickup point',
              },
              arrived_pickup: {
                title: 'Driver arrived',
                subtitle: 'Meet them at the pickup point',
              },
              trip_in_progress: {
                title: 'Trip in progress',
                subtitle: 'Heading to your destination',
              },
              completed: {
                title: 'Trip completed',
                subtitle: 'Review and rate your experience',
              },
              canceled: {
                title: 'Trip canceled',
                subtitle: 'The request was canceled',
              },
            },
            metrics: {
              minutes: '{{count}} min',
              etaLabel: 'ETA {{value}}',
              distance: '{{value}} km',
                },
              },
            },
            backgroundTracking: {
              foregroundService: {
                title: 'Location tracking active',
                body: 'Your location is being shared',
              },
              driver: {
                title: 'Driver available',
                body: 'Sharing your location to receive nearby rides.',
              },
              client: {
                title: 'Ride under monitoring',
                body: 'Your ride is still active and we are monitoring your location.',
          },
        },
        auth: {
          errors: {
            notAuthenticated: 'User not authenticated.',
            emailRequired: 'Email is required.',
            passwordMin: 'Password must be at least 6 characters.',
            phoneFormatInvalidExample: 'Invalid phone format. Use {{example}}.',
            phoneFormatInvalidInternational:
              'Invalid phone format. Use an international number (+Country code and number).',
            verificationStartFailed: 'We could not start the phone verification. Please try again.',
            verificationMissing: 'We could not find an active verification. Please request a new code.',
            verificationNotFound: 'We could not find an active verification request. Please request a new code.',
            codeSixDigits: 'The code must be 6 digits.',
            codeInvalid: 'The code you entered is not valid. Check the SMS and try again.',
            codeMismatch: 'The code you entered does not match the SMS. Verify it and try again.',
            codeExpired: 'The code has expired. Tap “Resend code” to get a new one.',
            tooManyAttempts: 'You have made too many attempts. Wait a few minutes before trying again.',
            networkIssue:
              'We could not complete the request because of a network issue. Check your connection and try again.',
            smsSendGeneric: 'We could not send the SMS code. Please try again.',
            smsInvalidPhone: 'The phone number is not valid. Use the international format (+Country code and number).',
            smsTooManyRequests: 'You requested too many codes in a short time. Wait a few minutes before trying again.',
            smsQuotaExceeded: 'The SMS sending quota was reached for now. Try again later.',
            smsNetworkError: 'We could not connect to send the SMS. Check your connection and try again.',
            confirmGenericFailure: 'We could not confirm the code. Please try again.',
          },
        },
        searchRide: {
          defaults: {
            locationFallback: 'Selected location',
            origin: 'Origin point',
            destination: 'Destination',
            currentLocation: 'Current location',
            myLocation: 'My location',
            serviceFallback: 'Service',
          },
          alerts: {
            unavailableZoneTitle: 'Service temporarily unavailable',
            unavailableZoneMessage: 'This location is currently outside our service coverage.',
            selectValidPointTitle: 'Select a valid point',
            selectValidPointMessage: 'You must choose an exact location.',
            selectValidOriginMessage: 'You need to choose the exact origin point.',
            selectValidDestinationMessage: 'You need to choose the exact destination.',
            selectValidStopMessage: 'You need to choose the exact location of the stop.',
            destinationPromptTitle: 'Select your destination',
            destinationPromptMessage: 'You can now pick your final destination via search or the map.',
            vehiclePhotoRequired: 'Please provide a photo of your vehicle to request a designated driver.',
            vehiclePhotoUploadError: 'Vehicle photo upload failed. Please try again.',
            vehiclePhotoProcessTitle: 'Processing photo',
            vehiclePhotoProcess: 'We are processing your photo. Please wait before confirming.',
            loginRequired: 'Please sign in to request a ride.',
            photoLoginRequired: 'Please sign in to upload your vehicle photo.',
            destinationRequired: 'Tap the map to select your destination.',
            invalidAmount: 'Enter a valid amount.',
            priceCalculationFailed: 'Could not calculate the route.',
            locationUnavailableTitle: 'Location unavailable',
            locationUnavailableMessage: 'Enable your location or try again later.',
            serviceValidationFailed: 'We could not validate the selected zone. Check your connection and try again.',
            photoPermissionsTitle: 'Permissions needed',
            photoPermissionsMessage: 'Camera access is required.',
            photoOptionsTitle: 'Vehicle photo',
            photoOptionsMessage: 'Choose an option',
            photoOptionsCamera: 'Take photo',
            photoOptionsGallery: 'Gallery',
            photoOptionsCancel: 'Cancel',
            photoSelectedTitle: 'Photo selected',
            photoSelectedMessage: 'It will upload when you confirm your ride.',
            photoUploadedTitle: 'Photo uploaded',
            photoUploadedMessage: 'Your vehicle has been registered.',
            photoUploadFailed: 'Vehicle photo upload failed. Please try again.',
            photoCaptureFailed: 'We could not capture the photo. Please try again.',
            locationFetchFailed: 'We could not get the selected location. Try another search.',
            biometricRequiredTitle: 'Fingerprint required',
            biometricRequiredMessage: 'Fingerprint authentication is required for this service.',
            biometricUnavailableTitle: 'Biometrics unavailable',
            biometricUnavailableMessage:
              'Your device has no biometric authentication configured. We will continue with a manual record.',
            biometricGenericError: 'Fingerprint verification failed. Please try again.',
            identityRequired: 'You must confirm your identity with your fingerprint.',
            biometricFallbackLabel: 'Enter passcode',
            requestError: 'Could not submit your ride request.',
            motoSelectedTitle: 'Motorcycle selected',
            designatedDriverMotoTitle: 'Designated driver on motorcycle',
            singlePassengerMessage: 'Motorcycles can only carry 1 passenger.',
          },
          mapSelection: {
            defaultTitle: 'Select a location',
            originTitle: 'Set the origin',
            originMessage: 'Move the map to your starting point.',
            destinationTitle: 'Select your destination',
            destinationMessage: 'Move the map to your final destination.',
            newStopTitle: 'New stop',
            newStopMessage: 'Tap the map to add stop {{index}}.',
            editStopTitle: 'Edit stop',
            editStopMessage: 'Tap the map to update stop {{index}}.',
          },
          labels: {
            selectingLocation: 'Select a location',
            setOrigin: 'Set origin',
            setDestination: 'Choose destination',
            newStop: 'New stop',
            editStop: 'Edit stop {{index}}',
            extraStopHint: 'Tap the map to add stop {{index}}.',
            selectOrigin: 'Choose your exact origin.',
            selectDestination: 'Choose your exact destination.',
            selectStop: 'Choose the exact location of the stop.',
            searchPlaceholder: 'Search for places',
            useCurrentLocation: 'Use current location',
            favorites: 'Favorites',
            recent: 'Recent',
            noResults: 'No matches found.',
            searching: 'Searching...',
            passengers: 'Passengers',
            passengersCount_one: '{{count}} passenger',
            passengersCount_other: '{{count}} passengers',
            paymentMethod: 'Payment method',
            priceSuggestion: 'Suggested price',
            pricePlaceholder: 'C$0.00',
            comment: 'Comment',
            commentPlaceholder: 'Trip details...',
            designatedDriverPhoto: 'Vehicle photo',
            addVehiclePhoto: 'Add photo',
            changeVehiclePhoto: 'Change photo',
            removeVehiclePhoto: 'Remove photo',
            confirmRequest: 'Confirm request',
            confirmRequestDisabled: 'Add destination and route',
            sendingRequest: 'Sending request…',
            driversAvailableTitle: 'Drivers available',
            driversAvailableDescription: 'We found drivers nearby',
            driversUnavailableTitle: 'No drivers nearby',
            driversUnavailableDescription: 'We will notify you when new drivers are available.',
            searchingAddress: 'Looking up address…',
            originPlaceholder: 'Select the origin',
            destinationPlaceholder: 'Select your destination',
            stopLabel: 'Stop {{index}}',
            inlineAddStop: 'Add extra destination',
            calculating: 'Calculating…',
            priceApproximation: '~C${{value}}',
            etaValue: '~{{minutes}} min',
            etaUnavailable: 'No ETA',
            viewOptions: 'View options',
          },
          vehicle: {
            motoLabel: 'Motorcycle',
            motoSubtitle: 'Agile and affordable trips',
            autoLabel: 'Car',
            autoSubtitle: 'Comfortable rides for up to 4 people',
            designatedLabel: 'Designated driver',
            designatedSubtitle: 'We drive you home in your car',
            recommendedBadge: 'Recommended',
            recommendationLabel: 'Recommended fare',
            modeLabel: 'Designated driver for:',
            modeAuto: 'Car',
            modeMoto: 'Motorcycle',
            selectOption: 'Select {{label}}',
            designatedMotoShortNotice: 'This distance is too short for motorcycle service.',
          },
          photo: {
            hint: 'Vehicle photo (required for designated driver):',
            buttonDefault: 'Take/Select photo',
            buttonChange: 'Change photo',
            buttonProcessing: 'Processing…',
          },
          notes: {
            designatedDriver: 'Designated driver: the client wants you to drive their vehicle.',
          },
          summary: {
            title: 'Summary and Price',
            distance: 'Distance',
            duration: 'Time',
            estimate: 'Estimate',
            calculatingRoute: 'Calculating route…',
            featuresLabel: 'Applied features',
            features: {
              night: 'Night',
              designatedDriverMotoDiscount: 'Designated driver moto adjustment',
            },
            surgeLabel: 'Pricing',
            highDemand: 'High demand',
          },
          payment: {
            cash: 'Cash',
            card: 'Card',
          },
          availability: {
            checking: 'Looking for drivers nearby…',
            low: 'Few or no drivers nearby right now',
            ok: 'Drivers available',
            unknown: 'Availability unknown',
          },
          search: {
            selectionOriginTitle: 'Origin',
            selectionDestinationTitle: 'Final destination',
            selectionNewStopTitle: 'New stop ({{current}}/{{max}})',
            selectionEditStopTitle: 'Edit stop {{index}}',
            selectionGenericTitle: 'Location',
            descriptionOrigin: 'Type an address or use your current location.',
            descriptionDestination: 'Search an address or pick it on the map.',
            descriptionExtra: 'You can search or pick the intermediate stop on the map.',
            descriptionGeneric: 'Search or pick a location on the map.',
            inputLabel: 'Search location',
            placeholderOrigin: 'Search origin…',
            placeholderDestination: 'Search destination…',
            placeholderDestinationReference: 'Ex: Conchita Palacios',
            placeholderStop: 'Search stop…',
            placeholderGeneric: 'Search location…',
            close: 'Close',
            useCurrentLocation: 'Use my location',
            pickOnMap: 'Select on map',
            destinationGuidanceTitle: 'Reference destination?',
            destinationGuidanceBody:
              'If you write a local reference, finish by selecting a result or using the map to pin the exact point.',
            destinationGuidanceStep1: '1) Write an exact location',
            destinationGuidanceStep2: '2) Pin exact point',
            destinationConfirmed: 'Destination confirmed on map',
            loading: 'Searching locations…',
            error: 'We could not search for locations.',
          },
          cta: {
            primary: 'Confirm and request ride',
            primaryScheduled: 'Confirm and schedule ride',
            loading: 'Sending request…',
            submittingOverlay: 'Sending your request…',
          },
          accessibility: {
            back: 'Go back',
            addExtraStop: 'Add extra destination',
            payCash: 'Pay in cash',
            payCard: 'Pay with card',
            togglePanel: 'Show or hide ride options',
          },
          scheduling: {
              openButton: 'Schedule ride',
              clearButton: 'Clear schedule',
              scheduledLabel: 'Scheduled for {{date}}',
              successTitle: 'Ride scheduled',
              successMessage: 'Your ride has been scheduled for {{date}}.',
              successMessageWithId: 'Your ride has been scheduled for {{date}}. Ride ID: {{id}}',
              shareMessage: 'I have scheduled a Rundi ride for {{date}}. Ride ID: {{id}}',
              successMessageWithCode: 'Your ride has been scheduled for {{date}}. Share this code with your driver: {{code}}',
              shareMessageWithCode: 'I scheduled a Rundi ride for {{date}}. Enter code {{code}} in the app to claim it as my driver.',
              activeRideTitle: 'You already have an active ride',
              activeRideBody: 'You can only have one ride at a time. Do you want to cancel the current ride and request a new one?',
              activeRideCancelButton: 'Cancel current',
              activeRideKeepButton: 'View current ride',
              invalidRange: 'Choose a time between 30 minutes and 10 days from now.',
              modalTitle: 'Schedule ride',
              dateLabel: 'Date',
              timeLabel: 'Time',
              modalCancel: 'Cancel',
              modalConfirm: 'Confirm',
              conflictTitle: 'You already have a scheduled ride',
              conflictBodyScheduled:
                'You already have a ride scheduled for {{date}} that conflicts with this one. If you continue, we will cancel the existing scheduled ride and create this new scheduled ride.',
              conflictBodyImmediate:
                'You already have a ride scheduled for {{date}} that conflicts with this request. If you continue, we will cancel the existing scheduled ride and create this new immediate ride.',
              conflictReplaceButton: 'Replace old ride',
              conflictKeepButton: 'Keep existing ride',
            },
        },
        profile: {
          loading: {
            logout: 'Signing out...',
            vehicle: 'Loading vehicle information...',
          },
          messages: {
            noUser: 'No authenticated user',
          },
          header: {
            title: 'Profile',
            edit: 'Edit profile',
            userId: 'User ID: {{id}}',
            role: {
              client: 'Client',
              driver: 'Driver',
            },
          },
          mode: {
            titleDriver: 'Usage mode',
            titleClient: 'Drive with Rundi',
            descriptionDriver: 'Switch to the driver view to receive rides.',
            descriptionClient: 'Register as a driver and start receiving rides.',
            buttonDriver: 'Use as driver',
            buttonClient: 'I want to drive',
            switching: 'Switching...',
          },
          alerts: {
            buildTitle: 'Build the app',
            buildMessage:
              'Push notifications only work on a development or production build. Use “npx expo run:android” or “npx expo run:ios”.',
            disableTitle: 'Disable notifications',
            disableMessage:
              'To turn off push notifications you must open the system settings and revoke the app permissions.',
            upgradeNotAvailableTitle: 'Not available',
            upgradeNotAvailableMessage: 'Only client accounts can start driver registration from here.',
            smsErrorTitle: 'Error',
            smsErrorMessage: 'Could not send the SMS code. Please try again.',
            driverModeBlockedTitle: 'You cannot use driver mode',
            driverModeReasons: {
              accountInactive: '• Your driver account is not active yet.',
              documentsPending: '• Your driver documents are pending or were rejected.',
              vehicleMissing: '• You do not have an approved active vehicle.',
            },
            driverModeFooter: 'Review your documents and vehicles to complete the approval.',
            driverModeError: 'We could not switch to driver mode. Please try again.',
            logoutTitle: 'Sign out',
            logoutMessage: 'Are you sure you want to sign out?',
            logoutConfirm: 'Sign out',
            logoutCancel: 'Cancel',
          },
          vehicle: {
            title: 'Vehicle information',
            successTitle: 'Verified driver',
            successText: 'Your information has been verified. You can now receive rides.',
            warningTitle: 'Incomplete information',
            warningText: 'Important vehicle information is missing. Complete the following:',
            missingPhotoCar: '📷 Vehicle photo (front)',
            missingPhotoMoto: '📷 Vehicle photo (side)',
            missingRegistration: '📄 Registration photo',
            missingInsurance: '🛡️ Insurance photo',
            completeButton: 'Complete now',
            emptyTitle: 'No vehicle information',
            emptyText: 'No vehicle data was found. Please register your vehicle to receive rides.',
            refresh: 'Refresh',
            register: 'Register vehicle',
            infoLabels: {
              brand: 'Brand',
              model: 'Model',
              year: 'Year',
              color: 'Color',
              plate: 'Plate',
              type: 'Type',
            },
            typeLabels: {
              sedan: 'Sedan',
              suv: 'SUV',
              van: 'Van',
              moto: 'Motorcycle',
              other: '{{type}}',
            },
          },
          config: {
            title: 'Settings',
            theme: 'Theme',
            notifications: 'Push notifications',
            traffic: 'Map traffic',
            sounds: 'App sounds',
            advanced: 'Advanced settings',
            rideHistory: 'Ride history',
            payments: 'Payment methods',
            help: 'Help',
            themeOptions: {
              light: 'Light',
              dark: 'Dark',
              auto: 'Auto',
            },
          },
          buttons: {
            logout: 'Sign out',
          },
          appInfo: {
            version: 'Rundi Beta- 1.8',
            copyright: '© 2025 All rights reserved',
          },
         support: {
          title: 'My support reports',
         },
        },
        preflight: {
          title: 'Preparing your experience',
          subtitle: {
            default: 'We are verifying that everything is ready.',
            completed: 'All set! Redirecting…',
            error: 'Something went wrong.',
          },
          checks: {
            starting: 'Starting checks…',
            auth: 'Verifying session',
            driverBiometric: 'Identity verification',
            notifications: 'Checking notifications',
            foregroundLocation: 'Checking location',
            backgroundLocation: 'Checking background location',
            overlay: 'Checking overlay permissions',
            activity: 'Checking activity permission',
            region: 'Checking service area',
            pendingPayments: 'Looking for pending payments',
            rechargeFunds: 'Checking wallet balance',
            activeRide: 'Looking for active rides',
            generic: '{{check}}',
          },
          biometric: {
            prompt: 'Confirm your identity to continue as driver.',
            pinFallback: 'Use PIN',
            error: 'We could not verify your identity.',
            maxAttempts: 'We could not verify identity after {{max}} attempts.',
            required: 'You need to verify identity to continue in driver mode.',
            deviceSecurityRequired:
              'Set up a screen lock (PIN, pattern, password, fingerprint, or Face ID) in your device settings to continue.',
            modal: {
              title: 'Identity verification',
              scanning: 'Scanning biometrics…',
              pinFallback: 'Biometric scan unavailable. Continue with your device PIN.',
              appleSignIn: 'Verifying your identity with Apple ID…',
              success: 'Identity verified successfully.',
              retry: 'Verification failed. Retrying…',
              attempt: 'Attempt {{current}} of {{max}}',
            },
          },
          progress: {
            completedLabel: 'Verification completed',
          },
          actionsSummary: {
            title: 'Detected pending actions:',
            more: '+{{count}} more',
          },
          buttons: {
            retry: 'Retry',
            continueAsClient: 'Continue as client',
            useAsClient: 'Use as client',
          },
          alerts: {
            switchToClientError: 'We could not switch to client mode. Please try again.',
            cannotContinueTitle: 'Cannot continue',
            cannotContinueMessage: 'Complete the required checks before using the app.',
            termsSaveError: 'We could not save your acceptance of the terms. Check your connection and try again.',
          },
          terms: {
            accept: 'Accept and continue',
          },
          errors: {
            checkFailed: 'Error in {{label}}. Please verify and try again.',
            unexpected: 'Unexpected error: {{message}}',
            generic: 'Please try again',
          },
          regionFallback: {
            available: 'Service available in Managua (default configuration).',
            unavailable: 'Service is currently only available within the active areas (currently Managua).',
          },
           programmedRide: {
            checkLabel: 'Scheduled rides',
            actionTitle: 'Confirm scheduled ride',
            actionSubtitle: 'Scheduled for {{date}}',
            confirmButton: 'Confirm now',
            promptTitle: 'Confirm your scheduled ride',
            promptBody: 'Your scheduled ride for {{date}} is about to start. Confirm to continue.',
            promptBodyNoDate: 'Your scheduled ride is about to start. Confirm to continue.',
            driverPromptTitle: 'Confirm your assigned ride',
            driverPromptBody: 'You have a programmed ride for {{date}}. Confirm to reserve it.',
            driverPromptBodyNoDate: 'You have a programmed ride ready. Confirm to reserve it.',
            notifClientTitle: 'Confirm your scheduled ride',
            notifClientBody: 'Your ride is about to start. Tap to confirm.',
            notifDriverTitle: 'Confirm your assigned ride',
            notifDriverBody: 'The client confirmed. Tap to reserve the ride.',
            timeLabelToday: 'Today · {{time}}',
            timeLabelTomorrow: 'Tomorrow · {{time}}',
            timeLabelDate: '{{date}} · {{time}}',
            toastFallbackBody: 'Your ride is still waiting for confirmation.',
            notNowButton: 'Not now',
            followUpTitleDriverAssigned: 'Driver on the way',
            followUpTitleAwaitingDriver: 'Confirm your ride',
            driverFollowUpTitle: 'Programmed ride ready',
            claimCodeLabel: 'Share this code with your driver',
          },
        },
        permissions: {
          explanation: {
            title: 'Permissions we use and why',
            subtitle: 'We only request what is necessary to keep your trips safe and reliable.',
          },
          items: {
            location: {
              title: ' Location at all times',
              descriptionDriver:
                'We use your location to show the map, calculate routes and ETAs, and find nearby trips. As a driver we also need it in the background to detect nearby trips, keep an active ride updated even if the app is not in the foreground, and for safety features.',
              descriptionClient:
                'We use your location to show the map, calculate routes and ETAs, and find nearby trips. As a client we mainly use it while the app is active to find nearby drivers and share your location during the trip.',
            },
            overlay: {
              title: ' Appear on top of other apps (drivers only)',
              description:
                'This permission lets us show a floating bubble when you are available or have an active trip, even if you switch to another app. You can quickly return to the ride and keep tracking without losing information.',
              noteAndroid:
                'On Android this permission is called “Appear on top of other apps” or “Display over other apps”.',
            },
            notifications: {
              title: ' Notifications',
              intro: 'We use notifications to let you know when:',
              bulletTrip: 'A trip is created, accepted, or updated.',
              bulletDriverArrived: 'Your driver arrives or the trip status changes.',
              bulletDriverNew: 'There are new trips available near your location.',
              bulletAccount: 'There are important messages about your account or safety.',
            },
            activity: {
              title: ' Physical activity / activity recognition',
              description:
                'Some Android devices use the physical activity permission together with location to improve motion detection and save battery while trips are tracked. We never use this data for health purposes; only to make tracking more stable.',
            },
          },
          gate: {
            spinner: 'Checking location permissions…',
            uploadsGate: 'Finish uploading your documents',
            services: {
              title: 'Turn on location services',
              description:
                'Please enable the system location services. Without them we cannot share your location in the foreground or background.',
              primary: 'Open settings',
              secondary: 'I already enabled it, retry',
            },
            foreground: {
              title: 'Location permission required',
              description:
                'We need access to your location while you use the app to assign rides and show the correct map information.',
              primary: 'Allow location',
              primarySettings: 'Open system settings',
              secondary: 'Retry',
            },
            background: {
              title: 'Enable background location',
              description:
                'When the app is in the background we keep sharing your location to notify you of nearby rides and continue any in-progress trip.',
              primary: 'Allow in background',
              secondary: 'I already enabled it, retry',
            },
          },
        },
        payment: {
          loading: 'Loading...',
          header: {
            titleDefault: 'Trip Payment',
            titlePending: 'Pending Payment',
            subtitleDefault: 'Complete your payment securely',
            subtitlePending: 'Your trip has ended. Please complete the payment to continue.',
          },
          summary: {
            title: 'Trip summary',
            origin: 'Origin',
            destination: 'Destination',
            distance: 'Distance',
            service: 'Service',
            features: 'Features',
            nightFeature: 'Night',
            designatedMotoAdjustment: 'Designated driver moto discount',
            surge: 'Pricing',
            highDemand: 'High demand',
            notAvailable: 'N/A',
          },
          cost: {
            title: 'Cost breakdown',
            fare: 'Trip fare',
            tip: 'Tip',
            total: 'Total to pay',
          },
          tip: {
            title: 'Would you like to add a tip?',
            customLabel: 'Or enter a custom amount:',
            placeholder: 'C$0.00',
          },
          paymentMethod: {
            title: 'Payment method',
            cardTitle: 'Credit/Debit card',
            cardSubtitle: 'Select your bank below',
            cashTitle: 'Cash',
            cashSubtitle: 'Pay your driver',
            cashUnavailable: 'Not available for pending payments',
          },
          savedCards: {
            title: 'Your cards',
            manageLink: 'Manage →',
            defaultBadge: 'Default',
            newCardTitle: 'New card',
            newCardSubtitle: 'Add a payment method',
          },
          banks: {
            title: 'Choose your bank',
            selectLabel: 'Select your bank:',
          },
          buttons: {
            payCard: 'Pay with card',
            payCardPending: 'Pay now',
            payCash: 'Confirm cash payment',
          },
          security: {
            message: 'Your information is protected with bank-level encryption.',
          },
          alerts: {
            missingCardNumber: 'Enter the card number.',
            missingCardHolder: 'Enter the cardholder name.',
            invalidExpiry: 'Enter the expiration date in MM/YY or MM/YYYY format.',
            invalidCVV: 'Enter a valid CVV (3 or 4 digits).',
            missingBank: 'Select a bank.',
            saveCardSuccessTitle: 'Card saved',
            saveCardSuccessMessage: 'Your {{brand}} card **** {{last4}} has been saved successfully.',
            saveCardError: 'We could not save the card.',
            changeMethodError: 'We could not change the payment method.',
            cardSuccessTitle: 'Payment completed',
            cardSuccessMessage: 'Your payment of C${{amount}} was processed successfully.',
            cardError: 'We could not process the payment.',
            cashInfoTitle: 'Cash payment',
            cashInfoMessage: 'Please pay C${{amount}} in cash to your driver. They will confirm receipt.',
          },
          biometric: {
            prompt: 'Confirm your identity to pay C${{amount}}',
            error: 'We could not confirm your identity. Try again.',
          },
          currencyAmount: 'C${{amount}}',
         support: {
          supportPendingTitle: 'I have questions about my pending payment',
          supportTitle: 'Help with my trip payment',
          supportLabel: 'Need help with this payment?',
          supportDescription: 'Open a chat with support to review charges, refunds, or card issues.',
        },
        },
       rideHistory: {
          filters: {
            all: 'All',
            completed: 'Completed',
            canceled: 'Canceled',
          },
          status: {
            completed: 'Completed',
            canceled: 'Canceled',
            inProgress: 'In progress',
            requested: 'Requested',
            accepted: 'Accepted',
            default: '{{status}}',
          },
          nav: {
            commissions: 'Recharge funds',
            history: 'History',
          },
          labels: {
            noDate: 'No date',
            originFallback: 'Origin',
            destinationFallback: 'Destination',
            unknownLocation: 'Unknown location',
            distance: 'Distance',
            priceFinal: 'Final price',
            priceEstimated: 'Est. price',
            type: 'Type',
            typeDesignated: 'DD',
            typeMoto: 'Moto',
            typeAuto: 'Auto',
            passengers: 'Passengers',
            client: 'Client:',
            driver: 'Driver:',
            yourRating: 'Your rating:',
          },
          actions: {
            rateRide: 'Rate ride',
          },
          empty: {
            title: 'No rides',
            subtitleAll: 'You do not have rides in your history yet.',
            subtitleCompleted: 'You do not have completed rides yet.',
            subtitleCanceled: 'You do not have canceled rides yet.',
          },
          errors: {
            loadRide: 'Error loading ride',
            idLabel: 'ID: {{id}}',
          },
        },
        rideDetail: {
          alert: {
            title: 'Error',
            message: 'We could not load the ride details.',
          },
          loading: 'Loading details...',
          header: {
            title: 'Ride details',
            rideId: 'ID: {{id}}',
          },
          status: {
            completed: 'Completed',
            canceled: 'Canceled',
            inProgress: 'In progress',
            accepted: 'Accepted',
            requested: 'Requested',
            default: '{{status}}',
          },
          paymentStatus: {
            completed: 'Paid',
            pending: 'Pending',
            failed: 'Failed',
            noData: 'No payment data',
            default: '{{status}}',
          },
          labels: {
            notAvailable: 'N/A',
            currency: 'C${{amount}}',
            durationHoursMinutes: '{{hours}}h {{minutes}}m',
            durationMinutes: '{{minutes}}m',
            distanceKilometers: '{{value}} km',
          },
          sections: {
            route: {
              title: 'Route',
              origin: 'Origin',
              destination: 'Destination',
              stop: 'Stop {{index}}',
            },
            info: {
              title: 'Trip information',
              distance: 'Distance',
              duration: 'Duration',
              finalPrice: 'Final price',
              passengers: 'Passengers',
              notesLabel: 'Notes',
            },
            person: {
              clientTitle: 'Client',
              driverTitle: 'Driver',
              clientFallback: 'User',
              driverFallback: 'Driver',
              license: 'License: {{value}}',
              missingClient: 'Client information unavailable',
              missingDriver: 'Driver information unavailable',
            },
            vehicle: {
              title: 'Vehicle',
              registration: 'Registration: {{value}}',
            },
            timeline: {
              title: 'Timeline',
              requested: 'Requested',
              accepted: 'Accepted',
              started: 'Started',
              completed: 'Completed',
              canceled: 'Canceled',
              cancelReason: 'Reason: {{reason}}',
            },
            payment: {
              title: 'Payment information',
              calculated: 'Calculated price',
              clientSuggested: 'Client offer',
              driverOffered: 'Driver counteroffer',
              finalAgreed: 'Final agreed price',
              status: 'Payment status',
              noPayment: 'No payment data',
              commission: 'Commission ({{rate}}%)',
              tip: 'Tip',
              driverPayout: 'Driver payout',
            },
          },
          actions: {
            retry: 'Retry',
          },
          errors: {
            notFound: 'Ride not found',
          },
        },
        help: {
          header: {
            title: 'Help center',
            subtitle: 'Find answers and contact support',
          },
          contact: {
            title: 'Quick contact',
            call: 'Call',
            whatsapp: 'WhatsApp',
            email: 'Email',
            whatsappMessage: 'Hi, I need help with Rundi',
            emailSubject: 'Rundi support request',
            emailBody: 'Hi Rundi team, I need help with...',
          },
          sections: {
            faq: 'Frequently asked questions',
            info: 'Information',
          },
          faqs: {
            requestRide: {
              question: 'How do I request a ride?',
              answer: 'Enter your destination on the main screen, confirm the map pin, and tap “Confirm ride”. A nearby driver will accept your request.',
            },
            pricing: {
              question: 'How does pricing work?',
              answer: 'The base rate is C$50 plus a per-kilometer formula. The price per kilometer varies depending on the service. Commissions are charged depending on the service requested.',
            },
            designatedDriver: {
              question: 'What is a designated driver?',
              answer: 'A designated driver drives your own vehicle for you—ideal if you cannot drive. They arrive on a motorcycle and drive your car back home.',
            },
            cancelRide: {
              question: 'How do I cancel a ride?',
              answer: 'You can cancel from the confirmation screen before the driver arrives. After 5 minutes, a cancellation fee may apply.',
            },
            rateRide: {
              question: 'How do I rate my ride?',
              answer: 'When the trip ends you will receive a prompt to rate it, and you can also rate from the ride history screen.',
            },
            paymentMethods: {
              question: 'Which payment methods do you accept?',
              answer: 'We accept credit/debit cards and cash. Manage your payment methods from your profile.',
            },
            becomeDriver: {
              question: 'How do I become a driver?',
              answer: 'Register as a driver, upload your documents (license, registration, insurance), and wait for approval. We will email you when you are active.',
            },
            shareRide: {
              question: 'Can I share my ride?',
              answer: 'Yes. During the trip you can share a live tracking link with family or friends so they can follow your location.',
            },
            comission: {
              question: 'How do commissions work?',
              answer: 'Commissions vary depending on the service requested. They are applied automatically when the trip ends. In a regular trip, 15% of the trip earnings are charged; in designated driving, 25% is charged; and in motorcycle trips, 7% is charged.',
            }
          },
          info: {
            website: {
              label: 'Website',
              value: 'rundiapp.com',
            },
            email: {
              label: 'Email',
              value: ' soporte@gruporzc.com',
            },
            phone: {
              label: 'Phone',
              value: '+505 1234-5678',
            },
            schedule: {
              label: 'Support hours',
              value: '24/7 · Always available',
            },
          },
        },
        account: {
          header: {
            title: 'Edit profile',
            discardTitle: 'Discard changes',
            discardMessage: 'If you leave now you may lose unsaved changes. Do you want to go back?',
            discardCancel: 'Cancel',
            discardExit: 'Leave',
          },
          profile: {
            avatarTitle: 'Profile photo',
            avatarMessage: 'Profile photo upload will be available soon.',
            nameLabel: 'Full name',
            namePlaceholder: 'e.g. Ana Perez',
            birthLabel: 'Date of birth',
            birthPlaceholder: 'DD/MM/YYYY',
            emailLabel: 'Email',
            emailPlaceholder: 'name@example.com',
            phoneLabel: 'Phone',
            phonePlaceholder: 'Tap to add your number',
            saveButton: 'Save changes',
          },
          providers: {
            title: 'Linked providers',
            google: 'Google',
            password: 'Email/Password',
            phone: 'Phone',
            none: 'Not linked',
          },
          alerts: {
            accountLoadError: 'We could not load your profile.',
            providersLoadError: 'We could not load your authentication settings.',
            emailRequired: 'Enter a valid email.',
            passwordRequired: 'Enter a password.',
            passwordMismatch: 'Passwords must match.',
            linkEmailSuccessTitle: 'Email linked',
            linkEmailSuccessMessage: 'Your account now supports email and password login.',
            linkEmailError: 'We could not link the email. Try again.',
            googleEmailMissing: 'Your Google account does not include an email.',
            createPasswordSuccessTitle: 'Password created',
            createPasswordSuccessMessage: 'You can now sign in with email and password.',
            createPasswordError: 'We could not create the password. Try again.',
            profileUpdatedTitle: 'Profile updated',
            profileUpdatedMessage: 'Your information was saved successfully.',
            profileUpdateError: 'We could not update your profile. Try again.',
          },
          cards: {
            addPassword: {
              title: 'Add password',
              description: 'Create a password to sign in when Google is unavailable.',
              newPlaceholder: 'New password',
              confirmPlaceholder: 'Confirm password',
              button: 'Save password',
            },
            linkEmail: {
              title: 'Add email & password',
              description: 'Link an email and password so you can sign in without your phone.',
              emailPlaceholder: 'Email',
              passwordPlaceholder: 'Password',
              confirmPlaceholder: 'Confirm password',
              button: 'Save credentials',
            },
          },
          phone: {
            removedTitle: 'Phone removed',
            removedMessage: 'Your number was removed from your profile.',
            duplicateError: 'This number is already linked to another account.',
            availabilityError: 'We could not validate this number. Try again later.',
            updatedTitle: 'Phone updated',
            updatedMessage: 'Your number was saved successfully.',
            codeSentTitle: 'Code sent',
            codeSentMessage: 'We sent you an SMS to verify your number.',
            startVerificationError: 'We could not start the verification. Try again.',
            loading: 'Preparing phone verification...',
          },
        },
        paymentMethods: {
          alerts: {
            loadError: 'We could not load your payment methods.',
            defaultSuccessTitle: '✅ Success',
            defaultSuccessMessage: 'Default payment method updated.',
            defaultError: 'We could not update the default payment method.',
            deleteTitle: 'Remove card',
            deleteMessage: 'Are you sure you want to delete this card?',
            deleteSuccessTitle: '✅ Success',
            deleteSuccessMessage: 'Card removed.',
            deleteError: 'We could not delete the card.',
            deleteConfirm: 'Delete',
            deleteCancel: 'Cancel',
          },
          loading: 'Loading payment methods...',
          header: {
            title: 'Payment methods',
            subtitle: 'Manage how you pay for your rides',
          },
          cash: {
            title: 'Cash',
            subtitle: 'Pay your driver',
          },
          cards: {
            expires: 'Expires {{month}}/{{year}}',
            defaultBadge: 'Default',
            actions: {
              use: 'Use',
            },
          },
          buttons: {
            addCard: 'Add card',
          },
          security: {
            message: 'Your data is protected with bank-level encryption.',
          },
        },
        savedCards: {
          alerts: {
            loadError: 'We could not load your saved cards.',
            deleteTitle: 'Delete card',
            deleteMessage: 'Are you sure you want to remove this card?',
            deleteSuccessTitle: '✅ Success',
            deleteSuccessMessage: 'Card removed.',
            deleteError: 'We could not delete the card.',
            deleteConfirm: 'Delete',
            deleteCancel: 'Cancel',
            defaultSuccessTitle: '✅ Success',
            defaultSuccessMessage: 'Default card updated.',
            defaultError: 'We could not update the default card.',
          },
          loading: 'Loading cards...',
          header: {
            title: 'My cards',
          },
          cards: {
            provider: {
              stripe: 'International',
              visanet: 'Local (Visanet)',
              fallback: '{{provider}}',
            },
            defaultBadge: 'Default',
            expires: 'Expires: {{month}}/{{year}}',
            actions: {
              setDefault: '⭐ Set as default',
              delete: '🗑️ Delete',
            },
          },
          empty: {
            title: 'No saved cards',
            description: 'Add a card to pay faster on your next rides.',
          },
          buttons: {
            addCard: '+ Add card',
          },
          security: {
            message: 'Your cards are protected with bank-level encryption. We never store your CVV.',
          },
        },
        addCards: {
         support: {
            title: 'Help adding my card',
            label: 'Problems saving your card?',
            description: 'Open a support chat to validate bank details or resolve system declines.',
          },
          header: {
            title: 'Add card',
          },
          form: {
            title: 'New card',
            cardNumber: 'Card number',
            expiry: 'MM/YY',
            cvv: 'CVV',
            cardHolder: 'Name on card',
            bankSelector: 'Select your bank:',
            checkbox: 'Set as default payment method',
            cancel: 'Cancel',
            save: 'Save',
            saving: 'Saving...',
          },
          alerts: {
            errorTitle: 'Error',
            incomplete: 'Please complete all fields.',
            invalidNumber: 'Invalid card number.',
            invalidExpiry: 'Invalid expiration date.',
            invalidCvv: 'Invalid CVV.',
            successTitle: '✅ Card added',
            successMessage: 'Your card has been saved securely.',
            successButton: 'OK',
            genericError: 'We could not add the card.',
          },
          security: {
            message: 'Your data is protected with bank-level encryption.',
          },
        },
        completeVehicleInfo: {
          loading: 'Loading information...',
          header: {
            title: 'Complete your information',
            subtitle: 'Fill in your personal and vehicle details. Fields marked with * are required.',
          },
          sections: {
            personal: '👤 Personal information',
            vehicle: 'Vehicle information',
            technical: '🔧 Technical details',
            documents: '📄 Documents',
            license: '🪪 Driver license',
            registration: '📄 Registration card',
            insurance: '🛡️ Insurance policy',
            vehiclePhotos: '🚗 Vehicle photo',
          },
          fields: {
            licenseNumber: {
              label: 'License number *',
              placeholder: 'Ex: B21332434',
            },
            licenseExpiry: {
              label: 'License expiration date',
              placeholder: 'YYYY-MM-DD',
            },
            department: {
              label: 'Department',
              placeholder: 'Ex: Managua',
            },
            municipality: {
              label: 'Municipality',
              placeholder: 'Ex: Managua',
            },
            plate: {
              label: 'Plate *',
              placeholder: 'Ex: M 323023',
            },
            brand: {
              label: 'Brand',
              placeholder: 'Ex: Toyota',
            },
            model: {
              label: 'Model',
              placeholder: 'Ex: Prado',
            },
            year: {
              label: 'Year',
              placeholder: 'Ex: 2021',
            },
            color: {
              label: 'Color',
              placeholder: 'Ex: Black',
            },
            vehicleType: {
              label: 'Vehicle type',
              placeholder: 'Ex: SUV, sedan, pickup',
            },
            fourByFour: {
              label: 'Is it 4x4?',
            },
            motor: {
              label: 'Engine number',
              placeholder: 'Ex: 1GR-FE',
            },
            chasis: {
              label: 'Chassis number',
              placeholder: 'Chassis number',
            },
            vin: {
              label: 'VIN',
              placeholder: 'VIN number',
            },
            cylinders: {
              label: 'Cylinders',
              placeholder: 'Ex: 6',
            },
            passengers: {
              label: 'Passengers',
              placeholder: 'Ex: 5',
            },
            fuelType: {
              label: 'Fuel type',
              placeholder: 'Ex: Gasoline, Diesel',
            },
            tonnage: {
              label: 'Tonnage',
              placeholder: 'Ex: 2.5',
            },
            vehicleClass: {
              label: 'Vehicle class',
              placeholder: 'Ex: PRIVATE',
            },
            serviceType: {
              label: 'Service type',
              placeholder: 'Ex: PRIVATE',
            },
            lien: {
              label: 'Lien',
              placeholder: 'Ex: NONE',
            },
            registrationNumber: {
              label: 'Registration number',
              placeholder: 'Ex: B2301230',
            },
            registrationExpiry: {
              label: 'Registration expiration',
              placeholder: 'YYYY-MM-DD',
            },
            insuranceNumber: {
              label: 'Insurance policy number',
              placeholder: 'Ex: RCO30201102',
            },
            insuranceCompany: {
              label: 'Insurance company',
              placeholder: 'Ex: BAC',
            },
            insuranceExpiry: {
              label: 'Insurance expiration',
              placeholder: 'YYYY-MM-DD',
            },
            insuranceStartDate: {
              label: 'Insurance start date',
              placeholder: 'YYYY-MM-DD',
            },
          },
          completion: {
            badge: 'Complete',
            optional: 'Optional',
            summary: '{{completed}} of {{total}} sections completed',
            allDone: 'All done!',
          },
          photos: {
            frontLabel: 'Front',
            backLabel: 'Back',
            uploadFront: 'Upload front',
            uploadBack: 'Upload back',
            uploadPolicy: 'Upload policy',
            uploadVehicle: 'Upload vehicle photo',
          },
          buttons: {
            save: 'Save information',
            saveAllComplete: 'Save information!',
            incompleteWarning: 'Complete all required fields to continue',
          },
          messages: {
            switchYes: 'Yes',
            switchNo: 'No',
          },
          alerts: {
            loadErrorTitle: 'Error',
            loadErrorMessage: 'We could not load your information.',
            saveSuccessTitle: 'Success',
            saveSuccessMessage: 'Your information was saved successfully.',
            saveErrorTitle: 'Error',
            saveErrorMessage: 'We could not save your information. Please try again.',
            confirmButton: 'OK',
          },
          defaults: {
            noLien: 'NONE',
          },
        },
       deleteAccount: {
         header: {
          title: 'Delete Account',
           roles: {
            driver: 'Driver',
            client: 'Client',
            default: 'User',
           },
         },
         warning: {
          title: '⚠️ Irreversible action',
          intro: 'When you delete your account, the following data will be permanently removed:',
          bullets: {
            profile: '• Your profile and personal information',
            rideHistory: '• Ride history',
            vehicles: '• Registered vehicles (if you are a driver)',
            ratings: '• Ratings and reviews',
            paymentMethods: '• Saved payment methods',
            notifications: '• Notifications and messages',
            locations: '• Locations and tracking',
            dataStores: '• All data stored in Firebase and Supabase',
          },
         },
         form: {
          title: 'Confirm credentials',
          emailPlaceholder: 'Email',
          passwordPlaceholder: 'Password',
         },
         confirmation: {
          checkbox:
            'I understand this action is irreversible and all my data will be permanently deleted',
         },
         buttons: {
          delete: 'Delete account permanently',
          deleting: 'Deleting account...',
          cancel: 'Cancel',
         },
         alerts: {
          confirmRequiredTitle: 'Confirmation required',
          confirmRequiredMessage:
            'Confirm that you understand the consequences by checking the verification box.',
          missingFieldsTitle: 'Incomplete fields',
          missingFieldsMessage: 'Enter your email and password to confirm the deletion.',
          confirmDeleteTitle: 'Delete account permanently',
          confirmDeleteMessage:
            'This action cannot be undone. All your data will be permanently deleted.\n\nAre you sure you want to continue?',
          confirmDeleteCancel: 'Cancel',
          confirmDeleteConfirm: 'Delete account',
          successTitle: 'Account deleted',
          successOk: 'OK',
          genericErrorTitle: 'Error',
          deleteErrorMessage: 'An error occurred while deleting the account.',
         },
       },
       supportcomplaint: {
        title: 'My reports',
        subtitle: 'Review and continue your conversations with support.',
        createCta: 'Create new report',
        emptyTitle: 'No reports yet',
        emptyDescription: 'When you open a report, it will appear in this list.',
        status: {
          open: 'Open',
          in_progress: 'In review',
          resolved: 'Resolved',
          rejected: 'Rejected',
        },
        tickets: {
          loading: 'Loading your support cases...',
          emptyTitle: 'No reports yet',
          emptyDescription: 'When you open a report, it will appear in this list.',
          newReport: 'Create new report',
          title: 'My reports',
          subtitle: 'Review and continue your conversations with support.',
          createCta: 'Create new report',
          category: 'Type',
          createdAt: 'Created on',
          resolution: 'Resolution',
          delete: 'Delete',
          deleting: 'Deleting...',
          deleteConfirmTitle: 'Delete report',
          deleteConfirmMessage:
            'The conversation will be archived and the chat will be removed. This cannot be undone. Do you want to continue?',
          deleteConfirmButton: 'Delete',
          deleteCancelButton: 'Cancel',
          deleteSuccess: 'Report deleted successfully.',
          deleteError: 'We could not delete the report. Try again later.',
        },
       },
       supportCall: {
        title: 'Support call',
        subtitle: 'Complete control of the session',
        emptyState: {
          title: 'No active case',
          subtitle: 'Create or open a case in support chat to manage calls.',
          back: 'Back',
        },
        labels: {
          case: 'Case',
          operator: 'Operator',
          operatorPending: 'Pending assignment',
          callId: 'Call ID',
          callIdPending: 'Not generated yet',
          room: 'Room',
          roomPending: 'No active room',
          livekit: 'LiveKit',
          noRoomToken: 'No room token yet. Request or accept the call first.',
          stateConnecting: 'Connecting...',
          stateConnected: 'Connected',
          stateDisconnected: 'Disconnected',
        },
        actions: {
          call: 'Call',
          accept: 'Accept',
          reject: 'Reject',
          hangup: 'Hang up',
          requestCall: 'Request call',
          joinRoom: 'Join room',
          muteMic: 'Mute microphone',
          unmuteMic: 'Enable microphone',
          speakerOn: 'Speaker on',
          speakerOff: 'Speaker off',
        },
      },
       supportChat: {
        title: 'Customer support',
        subtitle: 'Tell us what is happening and our team will help you through this chat.',
        rideTagLabel: 'Related ride',
        fallbackUserName: 'User',
        call: {
          ringing: 'You are being called, accept to connect with the operator.',
          status: 'Status',
          caseLabel: 'Case',
          operatorLabel: 'Operator',
          actions: {
            accept: 'Accept',
            reject: 'Reject',
            hangup: 'Hang up',
          },
          info: {
            room: 'Room',
            stateConnecting: 'Connecting...',
            stateConnected: 'Connected',
            stateDisconnected: 'Disconnected',
            tokenReceived: 'Token obtained and LiveKit connection started on the client.',
          },
          requestTitle: 'Call requested',
          requestBody: 'We notified support to call you. You will get an alert when they start the call.',
          requestMessage: 'The client requested a support call.',
        },
        caseHeader: {
          createdLabel: 'Case created',
          hint: 'We will notify you in this chat about updates.',
        },
        categories: {
          title: 'Issue type',
          service: 'Service / ride',
          driver: 'Driver',
          payment: 'Payments and charges',
          app: 'App issues',
          other: 'Other',
        },
        priorities: {
          title: 'Priority',
          low: 'Low',
          normal: 'Normal',
          high: 'High',
          urgent: 'Urgent',
        },
        form: {
          problemTitleLabel: 'Title of the problem *',
          problemTitlePlaceholder: 'Describe the problem briefly',
          descriptionLabel: 'Description (optional)',
          descriptionPlaceholder: 'Add more context, screenshots, or details here',
          createdLabel: 'Case created',
          hint: 'You can keep writing in this chat to stay in touch with customer support.',
        },
         errors: {
          missingTitle: 'Please enter a brief title for your problem.',
          initializeService: 'We could not initialize the support service. Check your connection.',
          invalidResponse: 'We could not create the case. Try again later.',
          genericCreate: 'Something went wrong while creating the case. Please try again.',
        },
        actions: {
          creatingCase: 'Creating case...',
          createCase: 'Create case and start chat',
        },
        emptyState: {
          text: 'Your case has been created. Send your first message so support has more context.',
        },
        chatInput: {
          placeholder: 'Type a message for support',
        },
       },
      },
    },
   },
   es: {
    translation: {
      common: {
        actions: {
          accept: 'Aceptar',
          cancel: 'Cancelar',
          save: 'Guardar',
          continue: 'Continuar',
          back: 'Atrás',
          close: 'Cerrar',
          confirm: 'Confirmar',
          delete: 'Eliminar',
          edit: 'Editar',
          next: 'Siguiente',
          previous: 'Anterior',
          search: 'Buscar',
          submit: 'Enviar',
          tryAgain: 'Intentar de nuevo',
          start: 'Iniciar',
          stop: 'Detener',
          yes: 'Sí',
          no: 'No',
        },
        datePicker: {
          selectYear: 'Selecciona el año',
        },
        mapPins: {
          origin: 'Origen',
          destination: 'Destino',
          extraStop: 'Parada {{index}}',
        },
        components: {
          camera: {
            unavailableTitle: 'Cámara no disponible',
            unavailableMessage:
              'Este dispositivo no tiene cámara disponible. Puedes elegir una foto de la galería.',
            useGallery: 'Usar galería',
          },
          termsModal: {
            title: 'Términos y condiciones',
            version: 'Versión {{version}}',
            selectorLabel: 'Seleccionar documento',
            body: 'Al usar esta aplicación, aceptas nuestros términos y condiciones.',
            documents: {
              general: {
                label: 'Términos generales',
                version: 'Versión {{version}}',
                body:
                  'PLATAFORMA DE MOVILIDAD RUNDI\n' +
                  'Fecha de vigencia: 24/03/26\n\n' +
                  'I. DEFINICIONES\n' +
                  'Para efectos de estos Términos y Condiciones, se entenderá por:\n' +
                  '• "Rundi" / "Plataforma" / "Nosotros": GrupoRZC, persona natural con RUC 0010205740009M, propietaria de la aplicación móvil denominada "Rundi", que actúa como intermediario tecnológico entre Usuarios y Conductores.\n' +
                  '• "Conductor" / "Usted": Persona natural que se registra en la Plataforma para ofrecer servicios de transporte a Usuarios.\n' +
                  '• "Usuario": Persona que solicita servicios de transporte a través de la Plataforma.\n' +
                  '• "Servicios": Los servicios de transporte terrestre de pasajeros que el Conductor ofrece a los Usuarios.\n' +
                  '• "Comisión": El monto que el Conductor paga a Rundi por el uso de la Plataforma por cada viaje completado.\n' +
                  '• "Tarifa del Viaje": El precio acordado directamente entre el Usuario y el Conductor por los Servicios de transporte.\n\n' +
                  'II. NATURALEZA DE LA RELACIÓN\n' +
                  '2.1. Rundi es una aplicación tecnológica. Rundi no proporciona servicios de transporte. Nuestra función es conectar a Usuarios que necesitan transporte con Conductores independientes que ofrecen dichos servicios.\n' +
                  '2.2. Relación independiente. La relación entre Rundi y el Conductor es de naturaleza mercantil independiente. Nada en estos Términos crea una relación de empleo, sociedad, franquicia, o agencia entre Rundi y el Conductor.\n' +
                  '2.3. Autonomía del Conductor. Usted, como Conductor:\n' +
                  '• Es libre de aceptar o rechazar cualquier solicitud de viaje.\n' +
                  '• Fija el precio de sus Servicios mediante negociación directa con el Usuario.\n' +
                  '• Establece su propio horario de trabajo.\n' +
                  '• Utiliza su propio vehículo y asume los costos operativos del mismo.\n\n' +
                  'III. REGISTRO Y REQUISITOS DEL CONDUCTOR\n' +
                  '3.1. Requisitos de afiliación. Para registrarse como Conductor en la Plataforma, debe cumplir con los siguientes requisitos:\n' +
                  'Requisito\tDescripción\n' +
                  'Edad\tSer mayor de 18 años.\n' +
                  'Licencia de conducir\tPoseer licencia de conducir vigente (categoría 3,1,2 o superior).\n' +
                  'Vehículo\tSer propietario o tener autorización legal para operar un vehículo en buen estado mecánico y con seguro vigente.\n' +
                  'Documentación\tPresentar: copia de cédula de identidad, licencia de conducir, tarjeta de circulación, seguro del vehículo, récord de policía limpio.\n' +
                  'Verificación\tSometerse al proceso de verificación documental y de identidad que Rundi establezca.\n' +
                  '3.2. Actualización de información. El Conductor se obliga a mantener actualizada su información y documentación en la Plataforma.\n' +
                  '3.3. Verificación de antecedentes. Rundi se reserva el derecho de realizar verificaciones de antecedentes policiales y de conducción de los solicitantes.\n\n' +
                  'IV. COMISIONES Y MÉTODOS DE PAGO\n' +
                  '4.1. Estructura de comisiones. Por el uso de la Plataforma, Rundi cobrará al Conductor una comisión por cada viaje completado.\n' +
                  'Concepto\tDetalle\n' +
                  'Comisión por viaje\t15% viajes carro, 7,5% viajes motos, 25% conductor designado carro, 12,5% conductor designado moto\n' +
                  'Forma de cobro\tSaldo en cuenta Rundi, tarjeta de crédito/débito, o puntos de recarga autorizados\n' +
                  'Momento del cargo\tAl finalizar el viaje o cuando el Conductor confirma la llegada al punto de origen\n' +
                  '4.2. Modificación de comisiones. Rundi se reserva el derecho de modificar el porcentaje de comisión. Cualquier cambio será notificado al Conductor con al menos 7 días de antelación a través de la Plataforma. El uso continuado de la Plataforma después de la modificación constituirá aceptación de la nueva comisión.\n' +
                  '4.3. Recargas de saldo. El Conductor podrá recargar saldo en su cuenta Rundi a través de:\n' +
                  '• Tarjetas de crédito o débito\n' +
                  '• Transferencias bancarias\n' +
                  '• Puntos de recarga autorizados (Super Express, AM PM, entre otros)\n' +
                  '4.4. Saldo negativo. Si el saldo en cuenta del Conductor es insuficiente para cubrir la comisión, su acceso a la Plataforma será restringido hasta que regularice su situación. Los saldos negativos deberán ser pagados dentro de los 2 días siguientes a la notificación.\n' +
                  '4.5. Devoluciones. En caso de cancelación del viaje por parte del Usuario antes del inicio, la comisión no será cargada. Si el cargo ya fue realizado, será reembolsado en un plazo máximo de 3 días.\n\n' +
                  'V. FACTURACIÓN Y OBLIGACIONES FISCALES\n' +
                  '5.1. Facturación de comisiones. Rundi emitirá factura electrónica por el monto de las comisiones cobradas al Conductor. La factura desglosará el IVA correspondiente (15%) conforme a la Ley de Concertación Tributaria de Nicaragua.\n' +
                  '5.2. Responsabilidad fiscal del Conductor. EL CONDUCTOR ES EL ÚNICO RESPONSABLE ANTE LAS AUTORIDADES TRIBUTARIAS POR LOS INGRESOS OBTENIDOS DE SUS SERVICIOS DE TRANSPORTE.\n' +
                  'Rundi no retiene ni paga impuestos en nombre del Conductor. El Conductor reconoce que:\n' +
                  '• Los pagos que recibe de los Usuarios constituyen rentas gravadas por la Ley 822.\n' +
                  '• Es su obligación inscribirse en la Dirección General de Ingresos (DGI) si sus ingresos superan los límites establecidos por la ley.\n' +
                  '• Debe cumplir con todas las obligaciones tributarias municipales y nacionales aplicables a su actividad económica.\n' +
                  '5.3. Aviso legal. Rundi recomienda al Conductor consultar sobre sus obligaciones fiscales. La falta de cumplimiento de dichas obligaciones es responsabilidad exclusiva del Conductor.\n\n' +
                  'VI. OPERACIÓN DEL SERVICIO\n' +
                  '6.1. Proceso del viaje. El proceso de cada viaje será el siguiente:\n' +
                  'Paso\tDescripción\n' +
                  '1\tEl Usuario publica su solicitud de viaje y ofrece un precio.\n' +
                  '2\tEl Conductor visualiza la solicitud y puede aceptar, contraofertar o rechazar.\n' +
                  '3\tSi hay acuerdo, se forma un contrato directo entre Usuario y Conductor.\n' +
                  '4\tEl Conductor se dirige al punto de recogida.\n' +
                  '5\tAl llegar, confirma su presencia a través de la app.\n' +
                  '6\tRealiza el servicio de transporte.\n' +
                  '7\tAl finalizar, la comisión se carga al Conductor.\n' +
                  '6.2. Prohibiciones. El Conductor no podrá:\n' +
                  '• Solicitar pagos adicionales fuera de la tarifa acordada en la Plataforma.\n' +
                  '• Permitir que terceros utilicen su cuenta o realicen viajes en su nombre.\n' +
                  '• Prestar servicios bajo los efectos de alcohol, drogas o fatiga.\n' +
                  '• Discriminar a Usuarios por cualquier motivo.\n\n' +
                  'VII. SEGURIDAD Y RESPONSABILIDAD\n' +
                  '7.1. Seguridad de la Plataforma. Rundi implementa medidas de seguridad razonables, incluyendo:\n' +
                  '• Verificación documental de Conductores.\n' +
                  '• Botón de pánico (SOS) para emergencias.\n' +
                  '• Compartición de datos de viaje con contactos de confianza.\n' +
                  '7.2. Limitación de responsabilidad. Rundi NO es responsable por:\n' +
                  '• Daños, accidentes o incidentes ocurridos durante la prestación de los Servicios.\n' +
                  '• Incumplimientos del Conductor respecto de sus obligaciones legales.\n' +
                  '7.3. Seguro. El Conductor debe mantener su vehículo asegurado conforme a la ley nicaragüense (seguro obligatorio de accidentes de tránsito - SOAT, y seguro voluntario si lo desea).\n\n' +
                  'VIII. SUSPENSIÓN Y TERMINACIÓN\n' +
                  '8.1. Causales de suspensión. Rundi podrá suspender temporalmente la cuenta del Conductor en caso de:\n' +
                  '• Bajo desempeño o altas tasas de cancelación.\n' +
                  '• Quejas de Usuarios debidamente verificadas.\n' +
                  '• Incumplimiento de cualquiera de estas disposiciones.\n' +
                  '• Saldo negativo no regularizado.\n' +
                  '8.2. Terminación definitiva. La cuenta será terminada definitivamente por:\n' +
                  '• Uso fraudulento de la Plataforma.\n' +
                  '• Suplantación de identidad.\n' +
                  '• Conductas que pongan en riesgo la seguridad de Usuarios.\n' +
                  '• Incumplimiento grave de la ley nicaragüense.\n\n' +
                  'IX. DISPOSICIONES FINALES\n' +
                  '9.1. Modificaciones. Rundi podrá modificar estos Términos en cualquier momento. Las modificaciones serán notificadas a través de la Plataforma y se considerarán aceptadas si el Conductor continúa usando la app después de 7 días de la notificación.\n' +
                  '9.2. Ley aplicable. Estos Términos se rigen por las leyes de la República de Nicaragua. Cualquier controversia será sometida a los tribunales competentes de la ciudad de Managua.\n' +
                  '9.3. Contacto. Para consultas, el Conductor puede contactar a Rundi a través de:\n' +
                  '• Correo electrónico: support@gruporzc.com\n' +
                  '• Soporte en la aplicación\n\n' +
                  '________________________________________\n' +
                  'DECLARACIÓN DEL CONDUCTOR\n' +
                  'Al registrarme en la Plataforma Rundi, declaro que:\n' +
                  '1. He leído y comprendido estos Términos y Condiciones.\n' +
                  '2. Acepto pagar las comisiones establecidas por el uso de la Plataforma.\n' +
                  '3. Reconozco que soy un contratista independiente y no un empleado de Rundi.\n' +
                  '4. Asumo la responsabilidad exclusiva de cumplir con mis obligaciones fiscales ante la DGI y las Alcaldías.\n' +
                  '5. Me comprometo a prestar mis servicios de transporte cumpliendo con todas las leyes aplicables.\n' +
                  '________________________________________\n' +
                  'Recomendaciones adicionales\n' +
                  '1. Mecanismo de cobro de comisiones: Al igual que inDrive en Nicaragua, puede utilizar el sistema de recargas prepago. Los conductores depositan saldo en puntos autorizados (Super Express, AM PM, etc.) o mediante transferencia bancaria, y usted descuenta la comisión de ese saldo.\n' +
                  '2. Aviso visible en la app: Agregue un mensaje claro en la pantalla de registro de conductores que indique su responsabilidad fiscal. Por ejemplo:\n' +
                  '"Rundi es una plataforma tecnológica que facilita la conexión entre Usuarios y Conductores independientes. Usted, como Conductor, es responsable de cumplir con sus obligaciones tributarias (DGI y Alcaldías) por los ingresos obtenidos a través de sus servicios de transporte."\n' +
                  '3. Documentación del modelo ante la DGI: Cuando presente su declaración de impuestos, asegúrese de que sus ingresos declarados correspondan exclusivamente a las comisiones cobradas a los conductores, no al valor total de los viajes. Guarde los reportes de viajes generados por la app como respaldo.',
              },
              users: {
                label: 'Términos para usuarios',
                version: 'Versión {{version}}',
                body:
                  'PLATAFORMA DE MOVILIDAD RUNDI\n' +
                  'Fecha de vigencia: 24/03/2026\n\n' +
                  'I. DEFINICIONES\n' +
                  '• “Rundi” / “Plataforma” / “Nosotros”: GrupoRZC, persona natural con 0010205740009M, propietaria de la aplicación móvil “Rundi”, que actúa como intermediario tecnológico entre Usuarios y Conductores (movilidad normal) o Conductores Designados.\n' +
                  '• “Usuario”: Persona que solicita servicios a través de la Plataforma, ya sea de movilidad normal o de conductor designado.\n' +
                  '• “Conductor”: Persona natural que utiliza su propio vehículo para prestar servicios de transporte a Usuarios a través de la Plataforma (servicio de movilidad normal).\n' +
                  '• “Conductor Designado”: Persona natural afiliada a Rundi que, a solicitud del Usuario, conduce el vehículo particular del Usuario para trasladarlo a su destino (servicio de conductor designado).\n' +
                  '• “Servicio”: Cualquiera de los servicios ofrecidos por la Plataforma, según sea seleccionado por el Usuario.\n' +
                  '• “Comisión”: El monto que el Conductor o Conductor Designado paga a Rundi por el uso de la Plataforma por cada servicio completado.\n\n' +
                  'II. NATURALEZA DE LA PLATAFORMA\n' +
                  '2.1. Rundi es una plataforma de tecnología que conecta a Usuarios con Conductores o Conductores Designados independientes. No prestamos servicios de transporte ni de conducción. Nuestra única función es facilitar la conexión entre las partes.\n' +
                  '2.2. Los Conductores y Conductores Designados son contratistas independientes, no empleados de Rundi. Cada uno es el único responsable de la prestación de sus servicios.\n\n' +
                  'III. SERVICIOS OFRECIDOS\n' +
                  '3.1. Servicio de movilidad standar (Rundi Móvil):\n' +
                  'El Usuario solicita un viaje y es trasladado por un Conductor que utiliza su propio vehículo. La tarifa se acuerda directamente entre el Usuario y el Conductor a través de la Plataforma. Rundi cobra una comisión al Conductor por el uso de la aplicación.\n' +
                  '3.2. Servicio de conductor designado (Rundi Designado):\n' +
                  'El Usuario solicita que un Conductor Designado se desplace al lugar donde se encuentra el vehículo del Usuario, realice una inspección, y luego conduzca dicho vehículo hasta el destino indicado por el Usuario. El servicio está pensado para Usuarios que por razones de salud, fatiga o consumo de alcohol no pueden conducir.\n\n' +
                  'IV. PROCESO DEL SERVICIO DE CONDUCTOR DESIGNADO\n' +
                  '4.1. Solicitud:\n' +
                  'El Usuario selecciona la opción “Rundi Designado” en la aplicación, indica su ubicación y el destino al que desea ser trasladado.\n' +
                  '4.2. Llegada del Conductor Designado:\n' +
                  'El Conductor Designado acude al lugar indicado en su propio vehículo (medio de traslado) y se presenta ante el Usuario.\n' +
                  '4.3. Inspección del vehículo del Usuario:\n' +
                  'Antes de iniciar la conducción, el Conductor Designado realizará una inspección visual del vehículo del Usuario, con la presencia de éste, y documentará el estado del mismo mediante:\n' +
                  '• Fotografías del exterior e interior del vehículo (neumáticos, carrocería, parabrisas, tablero, asientos, etc.).\n' +
                  '• Acta de inspección que será generada en la aplicación y firmada digitalmente por ambas partes (el Usuario acepta las condiciones en la app).\n' +
                  '4.4. Traslado:\n' +
                  'Una vez finalizada la inspección y obtenida la aceptación del Usuario, el Conductor Designado conduce el vehículo del Usuario hasta el destino acordado.\n' +
                  '4.5. Finalización:\n' +
                  'Al llegar al destino, el Conductor Designado estaciona el vehículo en el lugar indicado por el Usuario, entrega las llaves y finaliza el servicio.\n' +
                  '4.6. Comisión:\n' +
                  'Rundi cobra al Conductor Designado una comisión por el servicio, cuyo porcentaje se establece en los términos aplicables a los conductores designados.\n\n' +
                  'V. RESPONSABILIDADES DEL USUARIO\n' +
                  '5.1. En ambos servicios:\n' +
                  '• El Usuario debe proporcionar información veraz sobre su ubicación y destino.\n' +
                  '• El Usuario se obliga a tratar con respeto a los Conductores y Conductores Designados.\n' +
                  '• El Usuario es responsable de cumplir con las leyes de tránsito cuando sea aplicable.\n' +
                  '5.2. En el servicio de conductor designado:\n' +
                  '• El Usuario declara y garantiza que es el propietario o tiene autorización legal para que un tercero conduzca el vehículo que pondrá a disposición del Conductor Designado.\n' +
                  '• El Usuario es responsable de que el vehículo se encuentre en condiciones mecánicas y legales para circular (revisión técnica, seguro obligatorio, tarjeta de circulación, etc.).\n' +
                  '• El Usuario acepta que el Conductor Designado realice la inspección y que, si durante la inspección se detectan condiciones inseguras (neumáticos lisos, luces defectuosas, fallas mecánicas evidentes, etc.), el Conductor Designado podrá rechazar el servicio sin responsabilidad para Rundi.\n' +
                  '• El Usuario asume que cualquier daño preexistente al vehículo que no haya sido documentado en la inspección inicial no será atribuible al Conductor Designado.\n\n' +
                  'VI. RESPONSABILIDADES DEL CONDUCTOR / CONDUCTOR DESIGNADO\n' +
                  'Las responsabilidades específicas de cada tipo de prestador se encuentran en los documentos de Términos y Condiciones correspondientes. En todo caso, Rundi no será responsable por:\n' +
                  '• La calidad, seguridad o cumplimiento de la normativa de tránsito por parte de los Conductores o Conductores Designados.\n' +
                  '• Daños, accidentes, multas o cualquier incidente ocurrido durante la prestación de los servicios.\n\n' +
                  'VII. PAGOS Y COMISIONES\n' +
                  '7.1. El pago del servicio se realiza directamente entre el Usuario y el Conductor / Conductor Designado, según lo acordado en la aplicación (efectivo, transferencia, etc.). Rundi no recibe ni maneja los pagos entre Usuarios y prestadores.\n' +
                  '7.2. El Conductor o Conductor Designado paga a Rundi una comisión por cada servicio completado, conforme a la estructura de comisiones vigente.\n' +
                  '7.3. En el servicio de conductor designado, el Usuario no paga comisión a Rundi; la comisión es pagada por el Conductor Designado con cargo a sus ingresos.\n\n' +
                  'VIII. LIMITACIÓN DE RESPONSABILIDAD DE RUNDI\n' +
                  '8.1. Rundi actúa únicamente como intermediario tecnológico. En consecuencia, no asumimos responsabilidad alguna por:\n' +
                  '• Accidentes de tránsito, daños a vehículos o lesiones personales ocurridas durante el servicio.\n' +
                  '• Incumplimiento de obligaciones fiscales, laborales o de seguridad social por parte de los Conductores o Conductores Designados.\n' +
                  '• Robos, hurtos o daños a pertenencias dentro del vehículo.\n' +
                  '• Multas de tránsito impuestas durante la conducción.\n' +
                  '8.2. En el servicio de conductor designado, el Usuario acepta que Rundi no es responsable por daños preexistentes al vehículo no documentados en la inspección inicial, ni por daños ocurridos durante la conducción, salvo que se demuestre dolo o negligencia grave del Conductor Designado mediante sentencia judicial firme.\n\n' +
                  'IX. DATOS PERSONALES Y PRIVACIDAD\n' +
                  '9.1. Rundi recopila y trata los datos personales de los Usuarios conforme a nuestra Política de Privacidad, disponible en la aplicación.\n' +
                  '9.2. En el servicio de conductor designado, el Usuario consiente que se tomen fotografías del vehículo y se generen actas que serán almacenadas en nuestros sistemas.\n\n' +
                  'X. MODIFICACIONES Y ACEPTACIÓN\n' +
                  '10.1. Rundi podrá modificar estos Términos en cualquier momento. Las modificaciones serán notificadas a través de la aplicación y se considerarán aceptadas si el Usuario continúa usando la Plataforma después de 7 días de la notificación.\n' +
                  '10.2. El registro y uso de la aplicación implica la aceptación íntegra de estos Términos y Condiciones.\n\n' +
                  'XI. LEY APLICABLE Y JURISDICCIÓN\n' +
                  'Estos Términos se rigen por las leyes de la República de Nicaragua. Cualquier controversia será sometida a los tribunales competentes de la ciudad de Managua.',
              },
              designated_driver: {
                label: 'Términos para conductor designado',
                version: 'Versión {{version}}',
                body:
                  'SERVICIO RUNDI DESIGNADO\n' +
                  'Fecha de vigencia: 24/03/2026\n\n' +
                  'I. DEFINICIONES\n' +
                  '• “Rundi” / “Plataforma” / “Nosotros”: GrupoRZC, persona natural con RUC 0010205740009M, propietaria de la aplicación móvil “Rundi”.\n' +
                  '• “Conductor Designado” / “Usted”: Persona natural que se registra en la Plataforma para prestar el servicio de conducción de vehículos de Usuarios.\n' +
                  '• “Usuario”: Persona que solicita el servicio de conductor designado a través de la aplicación.\n' +
                  '• “Vehículo del Usuario”: El automóvil particular que el Usuario pone a disposición para ser conducido por el Conductor Designado.\n' +
                  '• “Inspección”: Proceso de verificación visual y documental del estado del vehículo del Usuario, realizado por el Conductor Designado antes de iniciar la conducción.\n\n' +
                  'II. NATURALEZA DE LA RELACIÓN\n' +
                  '2.1. El Conductor Designado es un contratista independiente, no un empleado de Rundi. Usted decide libremente si acepta o rechaza solicitudes, establece su horario y utiliza su propio medio de traslado (vehículo propio) para desplazarse al punto de encuentro.\n' +
                  '2.2. Rundi no es responsable por la prestación del servicio de conducción, la cual es de exclusiva responsabilidad del Conductor Designado.\n\n' +
                  'III. REQUISITOS PARA SER CONDUCTOR DESIGNADO\n' +
                  'Para registrarse como Conductor Designado en Rundi, debe cumplir con:\n\n' +
                  'Requisito | Descripción\n' +
                  'Edad | Ser mayor de 21 años.\n' +
                  'Licencia | Poseer licencia de conducir vigente categoría 1,2,3 (o superior) con al menos 3 años de antigüedad.\n' +
                  'Documentación | Copia de cédula de identidad, licencia de conducir, récord de policía limpio (actualizado).\n' +
                  'Vehículo propio | Contar con un vehículo propio en buen estado (para trasladarse al lugar del Usuario).\n' +
                  'Seguro | El vehículo propio debe tener seguro obligatorio (SOA) al día.\n' +
                  'Curso | Aprobar el curso de inducción que Rundi imparta sobre procedimientos de inspección y conducción defensiva.\n\n' +
                  'IV. PROCESO DEL SERVICIO\n' +
                  '4.1. Aceptación:\n' +
                  'Al recibir una solicitud, el Conductor Designado puede aceptarla o rechazarla. Una vez aceptada, debe dirigirse al lugar indicado por el Usuario.\n' +
                  '4.2. Inspección obligatoria:\n' +
                  'Antes de iniciar la conducción del vehículo del Usuario, el Conductor Designado debe realizar la inspección conforme al procedimiento establecido por Rundi:\n' +
                  '• Tomar fotografías claras de:\n' +
                  'o Placas del vehículo.\n' +
                  'o Cuatro neumáticos (incluyendo dibujo y presión aparente).\n' +
                  'o Parabrisas y espejos.\n' +
                  'o Carrocería (frente, laterales, parte trasera).\n' +
                  'o Tablero (registro de kilometraje, testigos).\n' +
                  'o Interior (asientos, espejos, volante).\n' +
                  '• Llenar el acta de inspección en la aplicación, marcando cualquier novedad o daño preexistente.\n' +
                  '• Mostrar el acta al Usuario para su conformidad. El Usuario debe firmar digitalmente en la aplicación.\n' +
                  '4.3. Negativa a prestar el servicio:\n' +
                  'El Conductor Designado podrá rechazar el servicio sin penalización si:\n' +
                  '• El Usuario se niega a la inspección.\n' +
                  '• El vehículo presenta condiciones inseguras (neumáticos lisos, luces apagadas, fallas mecánicas evidentes, falta de seguro obligatorio, etc.).\n' +
                  '• El Usuario o el vehículo se encuentran bajo los efectos de alcohol o drogas (en cuyo caso deberá notificar a Rundi).\n' +
                  '4.4. Conducción:\n' +
                  'Una vez finalizada la inspección y obtenida la aceptación, el Conductor Designado conduce el vehículo del Usuario hasta el destino indicado, respetando las normas de tránsito.\n' +
                  '4.5. Entrega:\n' +
                  'Al llegar al destino, debe estacionar el vehículo en un lugar seguro y entregar las llaves al Usuario. Finalizar el servicio en la aplicación.\n\n' +
                  'V. COMISIONES Y FACTURACIÓN\n' +
                  '5.1. Estructura de comisiones:\n' +
                  'Por cada servicio completado, Rundi cobra al Conductor Designado una comisión del [25 ]% sobre el valor acordado con el Usuario. La comisión se carga al saldo que el Conductor Designado mantiene en la aplicación.\n' +
                  '5.2. Formas de pago de comisiones:\n' +
                  'El Conductor Designado debe mantener saldo suficiente mediante recargas en puntos autorizados (Super Express, AM PM, etc.) o transferencia bancaria. Si el saldo es insuficiente, la cuenta será suspendida hasta regularizarse.\n' +
                  '5.3. Facturación:\n' +
                  'Rundi emitirá factura electrónica por las comisiones cobradas, con el desglose del IVA (15%). El Conductor Designado es el único responsable de cumplir con sus obligaciones fiscales ante la DGI y la Alcaldía por los ingresos obtenidos.\n\n' +
                  'VI. OBLIGACIONES DEL CONDUCTOR DESIGNADO\n' +
                  '6.1. Conducir con prudencia y respetar todas las leyes de tránsito.\n' +
                  '6.2. No consumir alcohol, drogas ni ninguna sustancia que afecte sus capacidades durante el período en que esté disponible en la aplicación.\n' +
                  '6.3. Mantener su vehículo propio en condiciones mecánicas y legales.\n' +
                  '6.4. Realizar la inspección con diligencia y veracidad. Cualquier omisión dolosa de daños preexistentes será causa de terminación inmediata.\n' +
                  '6.5. Informar a Rundi de inmediato si ocurre un accidente o incidente durante el servicio.\n' +
                  '6.6. Tratar al Usuario con respeto y profesionalismo.\n\n' +
                  'VII. LIMITACIÓN DE RESPONSABILIDAD\n' +
                  '7.1. Rundi no es responsable por daños al vehículo del Usuario que ocurran durante la conducción. El Conductor Designado es directamente responsable ante el Usuario y ante las autoridades.\n' +
                  '7.2. Rundi recomienda al Conductor Designado contratar un seguro de responsabilidad civil que cubra eventuales daños a vehículos de terceros (los seguros tradicionales del vehículo del Usuario pueden no cubrir la conducción por un tercero; es responsabilidad del Conductor Designado verificar su cobertura).\n' +
                  '7.3. En caso de un accidente de tránsito, el Conductor Designado deberá seguir el procedimiento establecido por la ley nicaragüense (tomar datos, solicitar presencia de la Policía de Tránsito, etc.) y notificar a Rundi dentro de las 24 horas.\n\n' +
                  'VIII. SUSPENSIÓN Y TERMINACIÓN\n' +
                  '8.1. Rundi podrá suspender o terminar la cuenta del Conductor Designado por:\n' +
                  '• Incumplimiento del procedimiento de inspección.\n' +
                  '• Quejas de Usuarios sobre conducción riesgosa o comportamiento inapropiado.\n' +
                  '• Fraude documental.\n' +
                  '• No mantener saldo suficiente para pagar comisiones.\n' +
                  '• Conducir bajo influencia de alcohol o drogas (terminación inmediata).\n\n' +
                  'IX. DISPOSICIONES FINALES\n' +
                  '9.1. Rundi podrá modificar estos Términos previa notificación a través de la aplicación. El uso continuado después de 7 días constituye aceptación.\n' +
                  '9.2. Estos Términos se rigen por las leyes de Nicaragua. Cualquier controversia será sometida a los tribunales de Managua.\n' +
                  '________________________________________\n' +
                  'DECLARACIÓN DEL CONDUCTOR DESIGNADO\n' +
                  'Al registrarme como Conductor Designado en Rundi, declaro que:\n' +
                  '• He leído y comprendido estos Términos.\n' +
                  '• Acepto realizar la inspección y documentación fotográfica conforme al procedimiento.\n' +
                  '• Reconozco mi condición de contratista independiente.\n' +
                  '• Asumo la responsabilidad total por mi actuación al conducir los vehículos de los Usuarios.',
              },
            },
            checkboxLabel: 'He leído y acepto los términos y condiciones.',
            acceptButton: 'Aceptar',
            saving: 'Guardando...',
            close: 'Cerrar',
          },
          availableRideCard: {
            originFallback: 'Origen desconocido',
            destinationFallback: 'Destino desconocido',
            priceLabel: 'Precio sugerido:',
            priceValue: 'C${{amount}}',
            distanceValue: '{{value}} km',
            distanceUnknown: 'N/D',
          },
          button: {
            loading: 'Cargando...',
          },
          cancelRideDialog: {
            title: '⚠️ Cancelar viaje',
            progress: 'Progreso: {{value}}%',
            requiresReasonMessage:
              'Este viaje está {{progress}}% completado. Proporciona un motivo para cancelarlo.',
            confirmMessage: '¿Seguro que deseas cancelar este viaje?',
            reasonLabel: 'Motivo de cancelación *',
            reasonPlaceholder: 'Ingresa el motivo (mínimo 10 caracteres)',
            charCount: '{{count}}/200 caracteres',
            suggestionsTitle: 'Motivos sugeridos:',
            suggestions: {
              personalEmergency: 'Emergencia personal',
              vehicleIssue: 'Problema con el vehículo',
              changeOfPlans: 'Cambio de planes',
              wrongRoute: 'Ruta incorrecta',
              longDelay: 'Demora excesiva',
            },
            actions: {
              keepRide: 'Mantener viaje',
              confirmCancel: 'Sí, cancelar',
            },
            alerts: {
              reasonRequiredTitle: 'Motivo requerido',
              reasonRequiredMessage: 'Proporciona un motivo con al menos 10 caracteres para cancelar este viaje.',
              errorTitle: 'Error',
              errorMessage: 'No pudimos cancelar el viaje. Intenta de nuevo.',
            },
          },
          emergencyButton: {
            modalTitle: 'Emergencia',
            modalSubtitle: 'Elige el servicio de emergencia que necesitas',
            options: {
              police: {
                title: 'Policía',
                description: 'Emergencias policiales, robos, accidentes',
                number: '118',
              },
              ambulance: {
                title: 'Ambulancia',
                description: 'Emergencias médicas, accidentes, lesiones',
                number: '102',
              },
            },
            cancelLabel: 'Cancelar',
            alerts: {
              callingTitle: 'Emergencia',
              callingMessage: 'Llamando a {{name}} ({{number}})\n\nLa llamada ha sido registrada.',
              cannotCall: 'No pudimos iniciar la llamada telefónica.',
              errorTitle: 'Error',
              errorMessage: 'No pudimos completar la llamada de emergencia.',
            },
          },
          emptyRideList: {
            defaultTitle: 'No hay viajes disponibles ahora',
            defaultDescription: 'Los nuevos viajes aparecerán aquí automáticamente.',
          },
          emptyState: {
            noRides: {
              title: 'Sin viajes disponibles',
              message: 'Cuando haya nuevos viajes, aparecerán aquí.',
              action: 'Actualizar',
            },
            noHistory: {
              title: 'Sin historial de viajes',
              message: 'Los viajes completados aparecerán aquí.',
              action: 'Solicitar viaje',
            },
            noNotifications: {
              title: 'Sin notificaciones',
              message: 'Te avisaremos cuando haya algo nuevo.',
            },
            noSearchResults: {
              title: 'Sin resultados',
              message: 'No encontramos resultados para “{{term}}”.',
              genericMessage: 'Intenta con otra búsqueda.',
            },
            noDrivers: {
              title: 'No hay conductores disponibles',
              message: 'Vuelve a intentarlo en un momento.',
            },
            noConnection: {
              title: 'Sin conexión',
              message: 'Revisa tu conexión a internet e inténtalo de nuevo.',
              action: 'Reintentar',
            },
          },
          etaDisplay: {
            loading: 'Calculando...',
            etaLabel: 'Llegada estimada',
            distanceLabel: '{{value}} km restantes',
            realtime: 'Actualización en tiempo real • Última actualización: {{value}}',
            errors: {
              generic: 'Error al calcular la ETA',
              calculating: 'Calculando...',
            },
            updateTimes: {
              now: 'justo ahora',
              seconds: 'hace {{count}} s',
              minutes: 'hace {{count}} min',
            },
          },
          imagePicker: {
            alerts: {
              permissionsTitle: 'Permisos requeridos',
              permissionsMessage: 'Se necesitan permisos de cámara y galería para continuar.',
              selectTitle: 'Seleccionar imagen',
              selectMessage: 'Elige una opción',
              cameraOption: 'Tomar foto',
              galleryOption: 'Galería',
              cancelOption: 'Cancelar',
              errorTitle: 'Error',
              selectError: 'No pudimos seleccionar la imagen.',
            },
            placeholder: 'Toma o selecciona una foto',
            changeButton: 'Cambiar foto',
          },
          insuranceCompany: {
            selectTitle: 'Compañía de seguro',
            otherOption: 'Otra aseguradora',
          },
          imagePickerButton: {
            alerts: {
              pickTitle: 'Seleccionar imagen',
              pickMessage: 'Elige una opción',
              cameraOption: 'Cámara',
              galleryOption: 'Galería',
              cancelOption: 'Cancelar',
              permissionTitle: 'Permisos',
              permissionMessage: 'Se necesita permiso de cámara para continuar.',
              permissionGalleryMessage: 'Se necesita permiso de galería para continuar.',
              takePhotoError: 'No pudimos tomar la foto.',
              pickError: 'No pudimos seleccionar la imagen.',
              uploadSuccessTitle: 'Éxito',
              uploadSuccessMessage: 'Imagen subida con éxito.',
              uploadErrorTitle: 'Error',
              uploadErrorMessage: 'No pudimos subir la imagen.',
            },
            placeholder: {
              label: 'Toca para seleccionar',
            },
            loadingLabel: 'Cargando…',
          },
          loadingOverlay: {
            defaultMessage: 'Cargando…',
            progressValue: '{{value}}%',
          },
          phoneNumberModal: {
            title: 'Número telefónico',
            subtitle: 'Selecciona tu país e ingresa los dígitos.',
            previewLabel: 'Número actual',
            areaLabel: 'Código de área',
            actions: {
              useNumber: 'Usar este número',
              clearNumber: 'Eliminar número',
            },
            alerts: {
              invalidTitle: 'Teléfono inválido',
              invalidMessage: 'Ingresa un número telefónico internacional válido.',
            },
          },
          photoUploadField: {
            alerts: {
              permissionDeniedTitle: 'Permiso denegado',
              galleryPermission: 'Necesitamos acceso a tu galería.',
              cameraPermission: 'Necesitamos acceso a tu cámara.',
              errorTitle: 'Error',
              selectError: 'No pudimos seleccionar la imagen.',
              captureError: 'No pudimos tomar la foto.',
            },
            options: {
              title: 'Agregar foto',
              message: 'Elige cómo agregar la foto',
              cancel: 'Cancelar',
              gallery: 'Galería',
              camera: 'Cámara',
            },
            buttons: {
              change: 'Cambiar foto',
              add: 'Agregar foto',
            },
          },
          supportChatShortcut: {
            defaultLabel: '¿Necesitas ayuda?',
            defaultDescription: 'Abre el chat de soporte y recibe ayuda personalizada en minutos.',
          },
          deviationAlert: {
            title: {
              warning: 'Posible desviación',
              danger: 'Desviación mayor',
            },
            message: 'El conductor está a {{distance}} de la ruta esperada.',
            distanceLabel: 'Distancia al origen:',
          },
          documentImageViewer: {
            buttons: {
              viewDocument: 'Ver documento',
              front: 'Frente',
              back: 'Reverso',
              close: 'Cerrar',
            },
          },
          driverOfferCard: {
            defaults: {
              driver: 'Conductor',
              vehicle: 'Vehículo',
              vehicleUnknown: 'N/D',
              plateLabel: 'Placa:',
            },
            savings: {
              save: 'Ahorras C${{amount}}',
              extra: 'C${{amount}} más',
              match: 'Precio estimado',
            },
            distance: '📍 Distancia al origen:',
            negotiation: {
              title: '📊 Rango de negociación:',
              min: 'Mínimo',
              max: 'Máximo',
            },
            price: {
              acceptedLabel: '✅ Aceptó tu precio',
              offerLabel: '💰 Ofrece:',
              acceptRide: '🚀 Aceptar e iniciar viaje',
              viewOffer: '💬 Ver oferta y negociar',
              quickAccept: '✅ Aceptar C${{amount}}',
              pending: '⏳ Esperando confirmación',
            },
            biometric: {
              title: 'Verifica tu identidad',
              subtitle: 'Se requiere confirmación biométrica para aceptar este viaje.',
              fingerprint: '👆 Usar huella',
              faceId: '👤 Usar Face ID',
              cancel: 'Cancelar',
              errorTitle: 'Error',
              errorMessage: 'La autenticación biométrica falló.',
            },
          },
          priceNegotiationModal: {
            header: {
              title: 'Negociación de precio',
            },
            driverInfo: {
              label: 'Conductor: {{name}}',
              rating: '{{value}}',
            },
            summary: {
              estimatedLabel: 'Precio estimado:',
              clientLabel: 'Tu precio sugerido:',
              driverLabel: 'El conductor ofrece:',
            },
            state: {
              accepted: {
                title: '¡El conductor aceptó tu precio!',
                subtitle: 'Precio final: C${{amount}}',
                button: 'Aceptar e iniciar viaje',
              },
              counterOffer: {
                title: 'El conductor propone: C${{amount}}',
                subtitle: 'Puedes aceptar la oferta o enviar una contraoferta.',
              },
              waiting: {
                message: 'Esperando la respuesta del conductor...',
              },
            },
            counterOffer: {
              label: 'O envía una contraoferta:',
              rangeHint: 'Rango permitido:',
              minLabel: 'Mínimo',
              maxLabel: 'Máximo',
              placeholder: 'Ej: {{value}}',
              send: 'Enviar',
            },
            actions: {
              acceptOffer: 'Aceptar C${{amount}}',
            },
            alerts: {
              invalidInput: 'Ingresa un precio válido.',
              minPrice: 'El precio mínimo es C${{amount}}.',
              maxPrice: 'El precio máximo es C${{amount}}.',
            },
          },
          rideProgressIndicator: {
            client: {
              freeCancel: '✅ Cancela ahora y no se te cobrará.',
              cashPenalty:
                '⚠️ Si cancelas ahora debes pagar C${{amount}} en efectivo al conductor ({{percent}}% del viaje).',
              cardPenalty: '⚠️ Si cancelas ahora cargaremos {{percent}}% del viaje (C${{amount}}).',
            },
            driver: {
              freeCancel: 'Puedes cancelar sin penalización.',
              cashPenalty: 'Si cancelas ahora se aplicará una penalización (deducida de tus ganancias).',
              cardPenalty: 'Si cancelas ahora se aplicará una penalización (comisión del viaje).',
            },
            stats: '{{value}}%',
          },
          routeHistory: {
            loading: 'Cargando historial de ruta...',
            empty: 'No hay datos de ruta disponibles.',
            errors: {
              load: 'No pudimos cargar el historial de ruta.',
            },
            title: '📊 Estadísticas del viaje',
            stats: {
              points: 'Puntos registrados',
              distance: 'Distancia total',
              duration: 'Duración',
              avgSpeed: 'Velocidad promedio',
              maxSpeed: 'Velocidad máxima',
            },
            duration: {
              short: '{{value}} min',
              long: '{{hours}}h {{minutes}}min',
            },
            timeline: {
              title: '🕐 Línea de tiempo',
              noSpeed: 'Sin velocidad',
              more: '... y {{count}} puntos más',
            },
          },
         },
          statuses: {
            pending: 'Pendiente',
            active: 'Activo',
            completed: 'Completado',
            cancelled: 'Cancelado',
            inProgress: 'En progreso',
            scheduled: 'Programado',
            offline: 'Desconectado',
            online: 'En línea',
            error: 'Error',
          },
          labels: {
            email: 'Correo electrónico',
            phone: 'Teléfono',
            password: 'Contraseña',
            language: 'Idioma',
            theme: 'Tema',
            notifications: 'Notificaciones',
            profile: 'Perfil',
            vehicle: 'Vehículo',
            driver: 'Conductor',
            passenger: 'Pasajero',
            map: 'Mapa',
            settings: 'Configuración',
            home: 'Inicio',
            help: 'Ayuda',
          },
          messages: {
            genericError: 'Algo salió mal. Inténtalo de nuevo.',
            networkError: 'Error de red. Verifica tu conexión.',
            offline: 'Parece que estás sin conexión.',
            confirmExit: '¿Seguro que deseas salir?',
            confirmDelete: '¿Seguro que deseas eliminar esto?',
            loading: 'Cargando...',
          },
          roles: {
            driver: 'Conductor',
            client: 'Cliente',
            designated_driver: 'Conductor designado',
            admin: 'Administrador',
            default: 'Usuario',
          },
          ride: {
            pickup: 'Recogida',
            dropoff: 'Destino',
            eta: 'ETA',
            distance: 'Distancia',
            price: 'Precio',
            payment: 'Pago',
            driver: 'Conductor',
            rider: 'Cliente',
            seat: 'Asiento',
          },
          payment: {
            loading: 'Cargando...',
            header: {
              titleDefault: 'Pago del viaje',
              titlePending: 'Pago pendiente',
              subtitleDefault: 'Completa tu pago de forma segura',
              subtitlePending: 'Tu viaje terminó. Completa el pago para continuar.',
            },
            summary: {
              title: 'Resumen del viaje',
              origin: 'Origen',
              destination: 'Destino',
              distance: 'Distancia',
              notAvailable: 'N/D',
            },
            cost: {
              title: 'Detalle de costos',
              fare: 'Tarifa del viaje',
              tip: 'Propina',
              total: 'Total a pagar',
            },
            tip: {
              title: '¿Quieres agregar una propina?',
              customLabel: 'O ingresa un monto personalizado:',
              placeholder: 'C$0.00',
            },
            paymentMethod: {
              title: 'Método de pago',
              cardTitle: 'Tarjeta de crédito/débito',
              cardSubtitle: 'Selecciona tu banco abajo',
              cashTitle: 'Efectivo',
              cashSubtitle: 'Paga a tu conductor',
              cashUnavailable: 'No disponible para pagos pendientes',
            },
            savedCards: {
              title: 'Tus tarjetas',
              manageLink: 'Administrar →',
              defaultBadge: 'Predeterminada',
              newCardTitle: 'Nueva tarjeta',
              newCardSubtitle: 'Agrega un método de pago',
            },
            banks: {
              title: 'Elige tu banco',
              selectLabel: 'Selecciona tu banco:',
            },
            buttons: {
              payCard: 'Pagar con tarjeta',
              payCardPending: 'Pagar ahora',
              payCash: 'Confirmar pago en efectivo',
            },
            security: {
              message: 'Tu información está protegida con cifrado de nivel bancario.',
            },
            alerts: {
              missingCardNumber: 'Ingresa el número de tarjeta.',
              missingCardHolder: 'Ingresa el nombre del titular.',
              invalidExpiry: 'Ingresa la fecha de expiración en formato MM/AA o MM/AAAA.',
              invalidCVV: 'Ingresa un CVV válido (3 o 4 dígitos).',
              missingBank: 'Selecciona un banco.',
              saveCardSuccessTitle: 'Tarjeta guardada',
              saveCardSuccessMessage: 'Tu tarjeta {{brand}} **** {{last4}} se guardó correctamente.',
              saveCardError: 'No pudimos guardar la tarjeta.',
              changeMethodError: 'No pudimos cambiar el método de pago.',
              cardSuccessTitle: 'Pago completado',
              cardSuccessMessage: 'Tu pago de C${{amount}} se procesó correctamente.',
              cardError: 'No pudimos procesar el pago.',
              cashInfoTitle: 'Pago en efectivo',
              cashInfoMessage: 'Por favor paga C${{amount}} en efectivo a tu conductor. Él confirmará la recepción.',
            },
            biometric: {
              prompt: 'Confirma tu identidad para pagar C${{amount}}',
              error: 'No pudimos confirmar tu identidad. Intenta de nuevo.',
            },
            currencyAmount: 'C${{amount}}',
          },
          backgroundTracking: {
            foregroundService: {
              title: 'Seguimiento de ubicación activo',
              body: 'Tu ubicación se está compartiendo.',
            },
            driver: {
              title: 'Conductor disponible',
              body: 'Compartiendo tu ubicación para recibir viajes cercanos.',
            },
            client: {
              title: 'Viaje bajo monitoreo',
              body: 'Tu viaje sigue activo y estamos monitoreando tu ubicación.',
            },
          },
          auth: {
            errors: {
              notAuthenticated: 'Usuario no autenticado.',
              emailRequired: 'El correo electrónico es obligatorio.',
              passwordMin: 'La contraseña debe tener al menos 6 caracteres.',
              phoneFormatInvalidExample: 'Formato de teléfono inválido. Usa {{example}}.',
              phoneFormatInvalidInternational:
                'Formato de teléfono inválido. Usa un número internacional (+Código de país y número).',
              verificationStartFailed: 'No pudimos iniciar la verificación telefónica. Intenta nuevamente.',
              verificationMissing: 'No encontramos una verificación activa. Solicita un nuevo código.',
              verificationNotFound: 'No encontramos una solicitud de verificación activa. Solicita un nuevo código.',
              codeSixDigits: 'El código debe tener 6 dígitos.',
              codeInvalid: 'El código que ingresaste no es válido. Revisa el SMS e inténtalo otra vez.',
              codeMismatch: 'El código ingresado no coincide con el SMS. Verifícalo e inténtalo nuevamente.',
              codeExpired: 'El código expiró. Toca “Reenviar código” para obtener uno nuevo.',
              tooManyAttempts: 'Has realizado demasiados intentos. Espera unos minutos antes de intentarlo nuevamente.',
              networkIssue:
                'No pudimos completar la solicitud por un problema de red. Verifica tu conexión e intenta de nuevo.',
              smsSendGeneric: 'No pudimos enviar el código SMS. Intenta de nuevo.',
              smsInvalidPhone: 'El número de teléfono no es válido. Usa el formato internacional (+Código y número).',
              smsTooManyRequests: 'Solicitaste demasiados códigos en poco tiempo. Espera unos minutos antes de intentar.',
              smsQuotaExceeded: 'Se alcanzó la cuota de envío de SMS por ahora. Inténtalo más tarde.',
              smsNetworkError: 'No pudimos conectarnos para enviar el SMS. Verifica tu conexión e intenta de nuevo.',
              confirmGenericFailure: 'No pudimos confirmar el código. Intenta nuevamente.',
            },
          },
          searchRide: {
            defaults: {
              locationFallback: 'Ubicación seleccionada',
              origin: 'Punto de origen',
              destination: 'Destino',
              currentLocation: 'Ubicación actual',
              myLocation: 'Mi ubicación',
              serviceFallback: 'Servicio',
            },
            alerts: {
              unavailableZoneTitle: 'Servicio temporalmente indisponible',
              unavailableZoneMessage: 'Esta ubicación está fuera de nuestra cobertura por ahora.',
              selectValidPointTitle: 'Selecciona un punto válido',
              selectValidPointMessage: 'Debes escoger una ubicación exacta.',
              selectValidOriginMessage: 'Debes escoger el punto exacto de origen.',
              selectValidDestinationMessage: 'Debes escoger el destino exacto.',
              selectValidStopMessage: 'Debes escoger la ubicación exacta de la parada.',
              destinationPromptTitle: 'Selecciona tu destino',
              destinationPromptMessage: 'Ahora puedes elegir tu destino final mediante búsqueda o en el mapa.',
              vehiclePhotoRequired: 'Debes proporcionar una foto de tu vehículo para solicitar un conductor designado.',
              vehiclePhotoUploadError: 'La carga de la foto del vehículo falló. Intenta nuevamente.',
              vehiclePhotoProcessTitle: 'Procesando foto',
              vehiclePhotoProcess: 'Estamos procesando tu foto. Espera antes de confirmar.',
              loginRequired: 'Inicia sesión para solicitar un viaje.',
              photoLoginRequired: 'Inicia sesión para subir la foto de tu vehículo.',
              destinationRequired: 'Toca el mapa para seleccionar tu destino.',
              invalidAmount: 'Ingresa un monto válido.',
              priceCalculationFailed: 'No pudimos calcular la ruta.',
              locationUnavailableTitle: 'Ubicación no disponible',
              locationUnavailableMessage: 'Activa tu ubicación o inténtalo más tarde.',
              serviceValidationFailed: 'No pudimos validar la zona seleccionada. Revisa tu conexión e intenta de nuevo.',
              photoPermissionsTitle: 'Permisos necesarios',
              photoPermissionsMessage: 'Se requiere acceso a la cámara.',
              photoOptionsTitle: 'Foto del vehículo',
              photoOptionsMessage: 'Elige una opción',
              photoOptionsCamera: 'Tomar foto',
              photoOptionsGallery: 'Galería',
              photoOptionsCancel: 'Cancelar',
              photoSelectedTitle: 'Foto seleccionada',
              photoSelectedMessage: 'Se cargará cuando confirmes tu viaje.',
              photoUploadedTitle: 'Foto cargada',
              photoUploadedMessage: 'Tu vehículo ha sido registrado.',
              photoUploadFailed: 'La carga de la foto del vehículo falló. Intenta nuevamente.',
              photoCaptureFailed: 'No pudimos capturar la foto. Intenta nuevamente.',
              locationFetchFailed: 'No pudimos obtener la ubicación seleccionada. Prueba otra búsqueda.',
              biometricRequiredTitle: 'Huella requerida',
              biometricRequiredMessage: 'Se requiere autenticación con huella para este servicio.',
              biometricUnavailableTitle: 'Biometría no disponible',
              biometricUnavailableMessage: 'Tu dispositivo no tiene biometría configurada. Continuaremos con un registro manual.',
              biometricGenericError: 'La verificación de huella falló. Intenta nuevamente.',
              identityRequired: 'Debes confirmar tu identidad con tu huella.',
              biometricFallbackLabel: 'Ingresar código',
              requestError: 'No pudimos enviar tu solicitud de viaje.',
              motoSelectedTitle: 'Motocicleta seleccionada',
              designatedDriverMotoTitle: 'Conductor designado en moto',
              singlePassengerMessage: 'Las motocicletas solo pueden llevar 1 pasajero.',
            },
            mapSelection: {
              defaultTitle: 'Selecciona una ubicación',
              originTitle: 'Define el origen',
              originMessage: 'Mueve el mapa hasta tu punto de partida.',
              destinationTitle: 'Selecciona tu destino',
              destinationMessage: 'Mueve el mapa hasta tu destino final.',
              newStopTitle: 'Nueva parada',
              newStopMessage: 'Toca el mapa para agregar la parada {{index}}.',
              editStopTitle: 'Editar parada',
              editStopMessage: 'Toca el mapa para actualizar la parada {{index}}.',
            },
            labels: {
              selectingLocation: 'Selecciona una ubicación',
              setOrigin: 'Definir origen',
              setDestination: 'Elegir destino',
              newStop: 'Nueva parada',
              editStop: 'Editar parada {{index}}',
              extraStopHint: 'Toca el mapa para agregar la parada {{index}}.',
              selectOrigin: 'Elige tu origen exacto.',
              selectDestination: 'Elige tu destino exacto.',
              selectStop: 'Elige la ubicación exacta de la parada.',
              searchPlaceholder: 'Buscar lugares',
              useCurrentLocation: 'Usar ubicación actual',
              favorites: 'Favoritos',
              recent: 'Recientes',
              noResults: 'No se encontraron coincidencias.',
              searching: 'Buscando...',
              passengers: 'Pasajeros',
              paymentMethod: 'Método de pago',
              priceSuggestion: 'Precio sugerido',
              pricePlaceholder: 'C$0.00',
              comment: 'Comentario',
              commentPlaceholder: 'Detalles del viaje...',
              designatedDriverPhoto: 'Foto del vehículo',
              addVehiclePhoto: 'Agregar foto',
              changeVehiclePhoto: 'Cambiar foto',
              removeVehiclePhoto: 'Eliminar foto',
              confirmRequest: 'Confirmar solicitud',
              confirmRequestDisabled: 'Agrega destino y ruta',
              sendingRequest: 'Enviando solicitud…',
              driversAvailableTitle: 'Conductores disponibles',
              driversAvailableDescription: 'Encontramos conductores cercanos',
              driversUnavailableTitle: 'Sin conductores cerca',
              driversUnavailableDescription: 'Te avisaremos cuando haya nuevos conductores disponibles.',
              searchingAddress: 'Buscando dirección…',
              originPlaceholder: 'Selecciona el origen',
              destinationPlaceholder: 'Selecciona tu destino',
              stopLabel: 'Parada {{index}}',
              inlineAddStop: 'Agregar destino extra',
              calculating: 'Calculando…',
              priceApproximation: '~C${{value}}',
              etaValue: '~{{minutes}} min',
              etaUnavailable: 'Sin ETA',
            },
            vehicle: {
              motoLabel: 'Motocicleta',
              motoSubtitle: 'Viajes ágiles y económicos',
              autoLabel: 'Auto',
              autoSubtitle: 'Viajes cómodos para hasta 4 personas',
              designatedLabel: 'Conductor designado',
              designatedSubtitle: 'Conducimos tu auto por ti',
              recommendedBadge: 'Recomendado',
              recommendationLabel: 'Tarifa recomendada',
              modeLabel: 'Conductor designado para:',
              modeAuto: 'Auto',
              modeMoto: 'Motocicleta',
            },
            photo: {
              hint: 'Foto del vehículo (requerida para conductor designado):',
              buttonDefault: 'Tomar/Seleccionar foto',
              buttonChange: 'Cambiar foto',
              buttonProcessing: 'Procesando…',
            },
            summary: {
              title: 'Resumen y precio',
              distance: 'Distancia',
              duration: 'Tiempo',
              estimate: 'Estimado',
              calculatingRoute: 'Calculando ruta…',
            },
            payment: {
              cash: 'Efectivo',
              card: 'Tarjeta',
            },
            availability: {
              checking: 'Buscando conductores cercanos…',
              low: 'Hay pocos o ningún conductor cerca en este momento',
              ok: 'Conductores disponibles',
              unknown: 'Disponibilidad desconocida',
            },
            search: {
              selectionOriginTitle: 'Origen',
              selectionDestinationTitle: 'Destino final',
              selectionNewStopTitle: 'Nueva parada ({{current}}/{{max}})',
              selectionEditStopTitle: 'Editar parada {{index}}',
              selectionGenericTitle: 'Ubicación',
              descriptionOrigin: 'Escribe una dirección o usa tu ubicación actual.',
              descriptionDestination: 'Busca una dirección o selecciónala en el mapa.',
              descriptionExtra: 'Puedes buscar o seleccionar la parada intermedia en el mapa.',
              descriptionGeneric: 'Busca o selecciona una ubicación en el mapa.',
              inputLabel: 'Buscar ubicación',
              placeholderOrigin: 'Buscar origen…',
              placeholderDestination: 'Buscar destino…',
              placeholderDestinationReference: 'Ej: Conchita Palacios',
              placeholderStop: 'Buscar parada…',
              placeholderGeneric: 'Buscar ubicación…',
              close: 'Cerrar',
              useCurrentLocation: 'Usar mi ubicación',
              pickOnMap: 'Seleccionar en el mapa',
              destinationGuidanceTitle: '¿Destino por referencia?',
              destinationGuidanceBody:
                'Si escribes una referencia local, termina seleccionando un resultado o usando el mapa para fijar el punto exacto.',
              destinationGuidanceStep1: '1) Escribe un lugar exacto',
              destinationGuidanceStep2: '2) Fija punto exacto',
              destinationConfirmed: 'Destino confirmado en mapa',
              loading: 'Buscando ubicaciones…',
              error: 'No pudimos buscar ubicaciones.',
            },
            cta: {
              primary: 'Confirmar y solicitar viaje',
              loading: 'Enviando solicitud…',
              submittingOverlay: 'Enviando tu solicitud…',
            },
            accessibility: {
              back: 'Regresar',
              addExtraStop: 'Agregar destino extra',
              payCash: 'Pagar en efectivo',
              payCard: 'Pagar con tarjeta',
            },
          },
         services: {
          biometricService: {
            prompts: {
              reason: 'Confirma tu identidad',
              fallbackLabel: 'Usar PIN',
            },
            errors: {
              notSupported: 'Este dispositivo no soporta biometría.',
              notEnrolled: 'No hay datos biométricos registrados en este dispositivo.',
              authFailed: 'Falló la autenticación biométrica.',
              unknown: 'Error desconocido.',
              appleNotAvailable: 'Iniciar sesión con Apple no está disponible en este dispositivo.',
              appleNoToken: 'Iniciar sesión con Apple no devolvió un token de identidad.',
              appleCanceled: 'Se canceló el inicio de sesión con Apple.',
            },
            modal: {
              title: 'Verificación de identidad',
              scanning: 'Escaneando biometría…',
              pinFallback: 'Escaneo biométrico no disponible. Continúa con el PIN del dispositivo.',
              appleSignIn: 'Verificando tu identidad con Apple ID…',
              success: 'Identidad verificada correctamente.',
              retry: 'Falló la verificación. Reintentando…',
            },
          },
          
          auth: {
            accountLinkingService: {
              errors: {
                notAuthenticated: 'Necesitas iniciar sesión para continuar.',
                smsRequiresNative: 'La verificación por SMS requiere un build nativo de desarrollo o producción.',
                sendCodeFailed: 'No pudimos iniciar la verificación telefónica. Intenta de nuevo.',
                missingVerificationId: 'No pudimos iniciar la verificación telefónica. Intenta de nuevo.',
                noActiveVerification: 'No se encontró una verificación activa. Solicita un nuevo código.',
                smsNotAvailableExpoGo: 'La verificación por SMS no está disponible en Expo Go.',
                nativeAccessFailed: 'No pudimos acceder a Firebase nativo. Usa un build de desarrollo.',
              },
              validation: {
                emailRequired: 'El correo electrónico es obligatorio.',
                passwordLength: 'La contraseña debe tener al menos 6 caracteres.',
                phoneFormat: 'Ingresa un teléfono válido como +505 XXXX XXXX.',
                codeLength: 'El código debe tener 6 dígitos.',
              },
            },
            firebaseAuthService: {
              errors: {
                registerInvalid: 'No pudimos completar tu registro.',
                userProfileNotFound: 'Perfil de usuario no encontrado.',
                profileNotFound: 'Perfil no encontrado.',
                availabilityFailed: 'No pudimos validar la disponibilidad de la cuenta. Intenta más tarde.',
                invalidIdToken: 'idToken inválido para generar la sesión compartida.',
                customTokenMissing: 'La respuesta del servidor no incluyó un token personalizado válido.',
                sessionSyncFailed: 'No pudimos sincronizar la sesión con el backend. Intenta más tarde.',
              },
            },
            googleAuthService: {
              errors: {
                registerFailed: 'No pudimos completar tu registro con Google.',
                emailMissing: 'No pudimos obtener el correo de tu cuenta de Google.',
                loginFailed: 'No pudimos iniciar sesión con Google.',
                profileNotFound: 'Perfil no encontrado.',
              },
            },
            localAuthService: {
              errors: {
                registerFailed: 'No pudimos registrar tu cuenta.',
                loginFailed: 'No pudimos iniciar sesión.',
                logoutFailed: 'No pudimos cerrar sesión. Intenta de nuevo.',
              },
            },
            phoneAuthService: {
              errors: {
                invalidPhoneFormat: 'Ingresa un número internacional válido (+código y número).',
                smsSendFailed: 'No pudimos enviar el código SMS. Intenta nuevamente.',
                invalidPhoneNumber: 'El número de teléfono no es válido. Verifica el formato internacional.',
                smsTooManyRequests: 'Solicitaste demasiados códigos. Espera antes de intentarlo de nuevo.',
                smsQuotaExceeded: 'Se alcanzó la cuota de envío de SMS. Intenta más tarde.',
                smsNetworkError: 'No pudimos conectarnos para enviar el SMS. Revisa tu conexión.',
                noActiveVerification: 'No hay verificación activa. Solicita un nuevo código.',
                codeLength: 'Ingresa el código de 6 dígitos de tu SMS.',
                confirmFailed: 'No pudimos verificar el código. Intenta nuevamente.',
                invalidVerificationCode: 'El código no coincide con el SMS. Revísalo e intenta nuevamente.',
                codeExpired: 'El código ha expirado. Toca “Reenviar código” para obtener uno nuevo.',
                confirmTooManyRequests: 'Intentaste demasiadas veces. Espera antes de volver a intentar.',
                confirmNetworkError: 'No pudimos verificar el código por un problema de red. Revisa tu conexión.',
                smsRequiresBuild: 'La verificación por SMS solo está disponible en builds de desarrollo/producción.',
                nativeFirebaseUnavailable: 'Firebase Auth nativo no está disponible. Usa un build de desarrollo.',
              },
            },
          },
          notificationService: {
            channels: {
              default: 'Notificaciones de Rundi',
              activeRide: 'Viaje activo',
            },
            quickReturnActiveRide: {
              title: 'Vuelve a tu viaje activo',
              body: 'Toca para regresar a los detalles del viaje en curso.',
            },
            newRide: {
              title: 'Nuevo viaje disponible',
              body: 'Viaje desde {{origin}} · {{distance}} · {{price}}',
              originFallback: 'Origen no disponible',
            },
            rideAccepted: {
              title: 'Tu viaje fue aceptado',
              body: '{{driverName}} va en camino.',
              driverFallback: 'Conductor',
            },
            rideStarted: {
              title: 'Tu viaje ha iniciado',
              body: 'Disfruta el recorrido.',
            },
            rideCompleted: {
              title: 'Viaje completado',
              body: 'Gracias por usar Rundi.',
            },
            rideCanceled: {
              title: 'Viaje cancelado',
              body: 'El viaje fue cancelado.',
            },
            formats: {
              priceCordoba: 'C${{amount}}',
              distanceKm: '{{value}} km de distancia',
            },
          },
          alertService: {
            titles: {
              error: 'Error',
              important: 'Importante',
              permissionsRequired: 'Se requieren permisos',
            },
            messages: {
              locationPermissionRequired: 'Se necesita acceso a tu ubicación para usar esta función.',
              locationAccessFailed: 'No pudimos acceder a tu ubicación.',
            },
            buttons: {
              cancel: 'Cancelar',
              confirm: 'Confirmar',
              navigate: 'Navegar',
              understood: 'Entendido',
              goToSettings: 'Ir a Configuración',
            },
          },
          backgroundLocationService: {
            foregroundService: {
              title: 'Seguimiento de ubicación activo',
              body: 'Tu ubicación se está compartiendo.',
            },
            driverStatus: {
              title: 'Conductor disponible',
              body: 'Compartiendo tu ubicación para recibir viajes cercanos.',
            },
            clientStatus: {
              title: 'Viaje bajo monitoreo',
              body: 'Tu viaje está activo y estamos monitoreando tu ubicación.',
            },
          },
          cardsService: {
            errors: {
              addFailed: 'No pudimos agregar la tarjeta.',
              addGeneric: 'Ocurrió un error al agregar la tarjeta.',
              defaultFailed: 'No pudimos establecer la tarjeta predeterminada.',
              defaultGeneric: 'Ocurrió un error al establecer la tarjeta predeterminada.',
              deleteFailed: 'No pudimos eliminar la tarjeta.',
              deleteGeneric: 'Ocurrió un error al eliminar la tarjeta.',
            },
          },
          driversService: {
            errors: {
              availabilityLimit:
                'No puedes conectarte: tienes 10 o más comisiones pendientes. Págalas desde “Pagar comisiones”.',
              notAuthenticated: 'Usuario no autenticado. Inicia sesión.',
              updateFailed: 'No pudimos actualizar el estado del conductor.',
              profileFetchFailed: 'No pudimos cargar el perfil del conductor.',
              profileUpdateFailed: 'No pudimos actualizar el perfil del conductor.',
            },
          },
          earningsService: {
            errors: {
              statsFailed: 'No pudimos cargar tus estadísticas de ganancias.',
              earningsByDayFailed: 'No pudimos cargar las ganancias por día.',
              pendingCashFailed: 'No pudimos cargar tus viajes en efectivo pendientes.',
              createRechargeFailed: 'No pudimos crear la recarga de efectivo.',
              rechargesFailed: 'No pudimos cargar tu historial de recargas.',
            },
          },
          inspectionsService: {
            errors: {
              saveFailed: 'No pudimos guardar la inspección.',
              requiredEvidenceMissing: 'Toma las seis fotos y confirma que los documentos están vigentes.',
              missingData: 'No se devolvieron datos después de guardar la inspección.',
              fetchFailed: 'No pudimos cargar la inspección.',
              listFailed: 'No pudimos cargar la lista de inspecciones.',
            },
          },
          locationTrackingService: {
            errors: {
              savePoint: 'No pudimos guardar el punto de ubicación.',
              saveBatch: 'No pudimos guardar el lote de ubicaciones.',
              routeFailed: 'No pudimos calcular la ruta.',
              routeUnavailable: 'El cálculo de ruta no está disponible ahora.',
              reverseGeocodeFailed: 'No pudimos obtener la dirección.',
              reverseGeocodeUnavailable: 'La búsqueda de direcciones no está disponible ahora.',
              geocodeFailed: 'No pudimos obtener las coordenadas.',
              geocodeUnavailable: 'La búsqueda de coordenadas no está disponible ahora.',
              placesSearchFailed: 'No pudimos buscar lugares cercanos.',
              placesSearchUnavailable: 'La búsqueda no está disponible ahora.',
              distanceFailed: 'No pudimos calcular la distancia.',
              distanceUnavailable: 'El cálculo de distancia no está disponible ahora.',
              deleteRideLocations: 'No pudimos eliminar las ubicaciones del viaje.',
              routeSaveFailed: 'No pudimos guardar la ruta del viaje.',
              updateWaypointFailed: 'No pudimos actualizar el punto intermedio.',
              deleteWaypointFailed: 'No pudimos eliminar el punto intermedio.',
              reorderWaypointsFailed: 'No pudimos reordenar los puntos intermedios.',
            },
          },
          paymentsService: {
            errors: {
              rideIdRequired: 'Se requiere el ID del viaje.',
              amountPositive: 'El monto debe ser mayor que 0.',
              invalidResponse: 'Respuesta del servidor inválida.',
              createFailed: 'No pudimos crear la intención de pago.',
            },
          },
          phoneLoginService: {
            messages: {
              codeSent: 'Enviamos un código a tu número telefónico.',
              codeResent: 'El código de verificación se reenvió.',
            },
            
          },
          priceNegotiationService: {
            errors: {
              invalidNumber: 'El precio debe ser un número válido.',
              minPrice: 'El precio mínimo permitido es C${{value}}.',
              maxPrice: 'El precio máximo permitido es C${{value}}.',
              negotiateFailed: 'No pudimos negociar el precio.',
              notAuthenticated: 'Usuario no autenticado. Vuelve a iniciar sesión.',
              acceptClientPriceFailed: 'No pudimos aceptar el precio del cliente.',
              acceptDriverOfferFailed: 'No pudimos aceptar la oferta del conductor.',
              acceptCounterOfferFailed: 'No pudimos aceptar la contraoferta.',
              rejectCounterOfferFailed: 'No pudimos rechazar la contraoferta.',
              sendOfferFailed: 'No pudimos enviar la oferta.',
            },
          },
          registrationService: {
            errors: {
              requiredNameRole: 'El nombre y el rol son obligatorios.',
              invalidMethod: 'Método de registro inválido.',
              emailPasswordRequired: 'El correo y la contraseña son obligatorios para este método.',
              phoneVerificationRequired: 'Se requiere un número verificado para el registro por SMS.',
              driverDataRequired: 'Se requieren los datos del conductor y del vehículo.',
              googleTokenMissing: 'Falta el token de Google para completar el registro.',
              googleAuthFailed: 'No pudimos autenticarnos con Google.',
              invalidServerResponse: 'Respuesta del servidor inválida.',
              createUserFailed: 'No pudimos crear el usuario.',
              completeDriverFailed: 'No pudimos completar el registro de conductor.',
              upgradePhoneVerification: 'Debes verificar tu teléfono antes de completar el registro de conductor.',
              upgradePreconditionFailed: 'No pudimos actualizar tu cuenta. Revisa tu información e intenta de nuevo.',
              upgradeFailed: 'No pudimos actualizar tu cuenta a conductor. Intenta más tarde.',
            },
            validation: {
              emailInvalid: 'Ingresa un correo válido.',
              nameTooShort: 'El nombre debe tener al menos 2 caracteres.',
              phoneFormat: 'El teléfono debe tener el formato +505 XXXX XXXX.',
              roleInvalid: 'Selecciona un rol válido.',
              passwordLength: 'La contraseña debe tener al menos 6 caracteres.',
              licenseInvalid: 'Ingresa un número de licencia válido.',
              plateInvalid: 'Ingresa una placa válida.',
              brandRequired: 'La marca del vehículo es obligatoria.',
              modelRequired: 'El modelo del vehículo es obligatorio.',
              yearInvalid: 'Ingresa un año de vehículo válido.',
              colorRequired: 'El color del vehículo es obligatorio.',
              typeInvalid: 'Selecciona un tipo de vehículo válido.',
            },
          },
          ridesService: {
            errors: {
              clientIdRequired: 'Se requiere el ID del cliente.',
              locationsRequired: 'Se requieren origen y destino.',
              estimatedPricePositive: 'El precio estimado debe ser mayor que 0.',
              scheduledAtRequired: 'Es requerido colocar hora para agendar.',
              invalidServerResponse: 'Respuesta del servidor inválida.',
              rideDetailsFailed: 'No pudimos cargar los detalles del viaje.',
              driverOnRouteFailed: 'No pudimos actualizar el estado del viaje a “en camino”.',
              driverArrivedFailed: 'No pudimos registrar tu llegada.',
              unsupportedStatus: 'Estado de viaje no soportado: {{status}}.',
            },
          },
          servicesService: {
            messages: {
              defaultName: 'Servicio',
            },
            errors: {
              fetchFailed: 'No pudimos cargar los servicios.',
            },
          },
          supabaseStorage: {
            errors: {
              missingUri: 'Se requiere la URI de la imagen.',
              uploadFailed: 'No pudimos subir la imagen.',
              deleteFailed: 'No pudimos eliminar la imagen.',
            },
          },
          trackingService: {
            errors: {
              subscribeFailed: 'No pudimos suscribirnos al viaje.',
            },
          },
          uploadService: {
            errors: {
              processImage: 'No pudimos procesar la imagen.',
              processImages: 'No pudimos procesar las imágenes.',
            },
          },
          userManagementService: {
            errors: {
              notAuthenticated: 'No se encontró un usuario autenticado.',
              wrongPassword: 'Contraseña incorrecta. Revisa tus credenciales.',
              userNotFound: 'Usuario no encontrado.',
              tooManyRequests: 'Demasiados intentos. Intenta más tarde.',
              deleteAccountFailed: 'No pudimos eliminar tu cuenta. Intenta más tarde.',
              deleteDataFailed: 'No pudimos eliminar los datos del usuario.',
              emailMismatch: 'Ingresa el mismo correo con el que iniciaste sesión.',
            },
          },
          vehiclesService: {
            errors: {
              notAuthenticated: 'Usuario no autenticado.',
              addVehicleFailed: 'No pudimos agregar el vehículo.',
              switchVehicleFailed: 'No pudimos cambiar el vehículo.',
              updateVehicleFailed: 'No pudimos actualizar el vehículo.',
              vehicleIdRequired: 'Se requiere el ID del vehículo.',
            },
          },
          fcm: {
            rideRequested: {
              title: 'Viaje solicitado',
              body: 'Estamos buscando un conductor para ti.',
            },
            proximityRide: {
              title: 'Viaje cercano',
              body: 'Hay un nuevo viaje disponible cerca de ti.',
            },
            fallback: {
              title: 'Nueva notificación',
              body: 'Tienes una nueva actualización en Rundi.',
            },
            alerts: {
              authErrorTitle: 'No autenticado',
              authErrorMessage: 'Inicia sesión para continuar.',
              testSuccessTitle: 'Éxito',
              testSuccessMessage: 'Notificación de prueba enviada.',
              testErrorTitle: 'Error',
              testErrorMessage: 'No pudimos enviar la notificación.',
            },
          },
         },
       },
       authScreens: {
          landing: {
            title: 'Bienvenido',
            subtitle: 'Tu viaje empieza aquí',
            login: 'Iniciar sesión',
            register: 'Crear cuenta',
          },
          login: {
            title: 'Bienvenido',
            subtitle: 'Inicia sesión para continuar',
            tabs: {
              email: 'Correo',
              phone: 'Teléfono',
            },
            fields: {
              emailLabel: 'Correo electrónico',
              emailPlaceholder: 'tu@email.com',
              passwordLabel: 'Contraseña',
              passwordPlaceholder: '••••••••',
              phoneLabel: 'Número telefónico',
              phoneHelper: 'Recibirás un código SMS para verificar tu identidad.',
            },
            buttons: {
              loginEmail: {
                idle: 'Iniciar sesión',
                loading: 'Iniciando...',
              },
              loginPhone: {
                idle: 'Enviar código SMS',
                loading: 'Enviando...',
              },
              register: '¿No tienes cuenta? Regístrate',
            },
            divider: 'O',
            alerts: {
              emailRequired: 'Ingresa tu correo.',
              passwordRequired: 'Ingresa tu contraseña para continuar.',
              genericError: 'No pudimos iniciar sesión. Intenta de nuevo.',
              invalidCredentials: 'El correo o la contraseña son incorrectos. Revisa e intenta nuevamente.',
              tooManyAttempts: 'Demasiados intentos fallidos. Espera unos minutos antes de intentar de nuevo.',
              phoneInvalid: 'Ingresa un teléfono válido en formato internacional (+Código de país).',
              smsError: 'No pudimos solicitar el código SMS.',
            },
          },
          emailVerification: {
            title: 'Verificación por correo',
            subtitle: 'Ingresa el código largo del enlace que Firebase envió a:',
            label: 'Código',
            codePlaceholder: 'Toca aquí para pegar tu código',
            attemptsRemaining: 'Intentos restantes: {{remaining}} / {{max}}',
            verifyButton: 'Verificar',
            resendIn: 'Reenviar en {{seconds}}s',
            resendButton: 'Reenviar código',
            verifyByLinkButton: 'Ya verifiqué mi correo',
            cancel: 'Cancelar registro',
            cancelConfirm: '¿Quieres cancelar el registro y volver al inicio?',
            linkVerificationHint: 'Abre el enlace de verificación que llegó a tu correo. Luego vuelve aquí y toca el botón para continuar.',
            alerts: {
              codeSentTitle: 'Código enviado',
              codeSentMessage: 'Revisa tu correo {{email}} y abre del enlace. Si no lo ves, revisa tu carpeta de spam.',
              errorTitle: 'Error',
              resendError: 'No se pudo reenviar el código de verificación.',
              codeRequiredTitle: 'Código requerido',
              codeRequiredMessage: 'Ingresa el código largo recibido por correo.',
              tooManyAttemptsTitle: 'Demasiados intentos',
              tooManyAttemptsMessage: 'Has alcanzado el máximo de intentos. Reenvía un nuevo código.',
              noSessionError: 'No se encontró sesión activa para registrar la verificación.',
              verifiedTitle: 'Correo verificado',
              verifiedMessage: 'Tu correo fue verificado correctamente.',
              verificationErrorTitle: 'Error de verificación',
              verificationErrorMessage: 'No se pudo verificar el código.',
              notVerifiedYet: 'Tu correo aún no está verificado. Abre el enlace de tu correo e intenta nuevamente.',
            },
          },
          onboarding: {
            slides: {
              first: {
                title: 'Viaja fácilmente',
                subtitle: 'Exactamente como quieres',
              },
              second: {
                title: 'Llega a nuevos lugares',
                subtitle: 'Hasta cualquier destino',
              },
              third: {
                title: 'Conecta con Rundi',
                subtitle: 'Encuentra el viaje de tus sueños',
              },
            },
          },
          driverData: {
            headerTitle: 'Información del conductor',
            headerSubtitle: 'Completa tu información de licencia y vehículo',
            tabs: {
              license: 'Licencia',
              vehicle: 'Vehículo',
            },
            photos: {
              sectionTitle: 'Fotos',
              profileTitle: 'Foto de perfil *',
              licenseFrontTitle: 'Licencia de conducir (frente) *',
              licenseBackTitle: 'Licencia de conducir (reverso) *',
              insuranceTitle: 'Foto del seguro *',
              registrationFrontTitle: 'Circulación – frente *',
              registrationBackTitle: 'Circulación – reverso *',
              takePhoto: 'Tomar foto',
              retakePhoto: 'Volver a tomar',
            },
            ocr: {
              hint: 'Toma la foto de frente, con buena luz y sin reflejos del laminado. Llena el encuadre y que el texto pequeño se lea claro — así llenamos los campos por ti.',
              reading: 'Leyendo documento…',
              detected: 'Autocompletamos: {{fields}}. Verifica los datos.',
              notDetected: 'No pudimos leer datos de la foto — retómala más cerca y nítida, o completa los campos manualmente.',
              expandFields: 'Ver o editar campos',
              collapseFields: 'Ocultar campos',
              fields: {
                licenseNumber: 'número de licencia',
                licenseExpiry: 'vencimiento de licencia',
                plate: 'placa',
                brand: 'marca',
                model: 'modelo',
                year: 'año',
                color: 'color',
                type: 'tipo de vehículo',
                passengers: 'pasajeros',
                registrationNumber: 'número de circulación',
                registrationExpiry: 'vencimiento de circulación',
                insuranceNumber: 'número de póliza',
                insuranceCompany: 'aseguradora',
                insuranceExpiry: 'vencimiento del seguro',
              },
            },
            license: {
              sectionTitle: 'Información de la licencia',
              licenseNumberLabel: 'Número de licencia *',
              licenseNumberPlaceholder: 'Ej: 123456789',
              expiryLabel: 'Expiración (AAAA-MM-DD) *',
              expiryPlaceholder: 'Ej: 2030-12-31',
              departmentLabel: 'Departamento *',
              departmentPlaceholder: 'Selecciona departamento',
              municipalityLabel: 'Municipio *',
              municipalityPlaceholder: 'Selecciona municipio',
              info: '💡 Asegúrate de que tu licencia esté vigente y no vencida.',
            },
            vehicle: {
              sectionTitle: 'Información del vehículo',
              plateLabel: 'Placa *',
              platePlaceholder: 'Ej: ABC-123',
              brandLabel: 'Marca *',
              brandPlaceholder: 'Ej: Toyota',
              modelLabel: 'Modelo *',
              modelPlaceholder: 'Ej: Corolla',
              yearLabel: 'Año *',
              yearPlaceholder: 'Ej: 2020',
              colorLabel: 'Color *',
              colorPlaceholder: 'Ej: Blanco',
              typeLabel: 'Tipo de vehículo *',
              registrationNumberLabel: 'Número de circulación',
              registrationNumberPlaceholder: 'Ej: B2301230',
              registrationExpiryLabel: 'Vencimiento de la circulación (AAAA-MM-DD)',
              registrationExpiryPlaceholder: 'Ej: 2029-02-14',
              insuranceNumberLabel: 'Número de póliza',
              insuranceNumberPlaceholder: 'Ej: RCO30201102',
              insuranceCompanyLabel: 'Compañía de seguro',
              insuranceCompanyPlaceholder: 'Selecciona tu aseguradora',
              insuranceExpiryLabel: 'Vencimiento del seguro (AAAA-MM-DD)',
              insuranceExpiryPlaceholder: 'Ej: 2030-02-12',
              periodicSectionTitle: 'Documentos periódicos (opcional — requeridos para operar)',
              inspectionDateLabel: 'Fecha de inspección ITM (AAAA-MM-DD)',
              inspectionDatePlaceholder: 'Ej: 2025-11-05',
              inspectionValidUntilLabel: 'ITM vigente hasta (AAAA-MM-DD)',
              inspectionValidUntilPlaceholder: 'Ej: 2026-11-05',
              emissionsTestedAtLabel: 'Fecha de prueba de emisiones (AAAA-MM-DD)',
              emissionsTestedAtPlaceholder: 'Ej: 2025-11-05',
              emissionsValidUntilLabel: 'Emisiones vigentes hasta (AAAA-MM-DD)',
              emissionsValidUntilPlaceholder: 'Ej: 2026-11-05',
              roadTaxPaidAtLabel: 'Fecha de pago del rodamiento (AAAA-MM-DD)',
              roadTaxPaidAtPlaceholder: 'Ej: 2026-01-15',
              revisadoValidUntilLabel: 'Calcomanía de revisado vigente hasta (AAAA-MM-DD)',
              revisadoValidUntilPlaceholder: 'Ej: 2026-12-31',
              typeOptions: {
                sedan: 'Sedán',
                suv: 'SUV',
                van: 'Van',
                moto: 'Motocicleta',
              },
              passengersLabel: 'Capacidad de pasajeros',
              passengersPlaceholder: 'Ej: 4',
              info: '💡 Asegúrate de que todos los datos coincidan con la circulación del vehículo.',
            },
            alerts: {
              errorTitle: 'Error',
              incomplete: 'Completa todos los campos obligatorios.',
              saveFailed: 'No pudimos guardar la información.',
            },
            buttons: {
              back: 'Regresar',
              continue: 'Continuar',
              saving: 'Guardando...',
            },
            progress: 'Paso {{current}} de {{total}}',
          },
          driverPhone: {
            title: 'Tu número telefónico',
            subtitle: 'Confirma tu código de país e ingresa tu número para continuar.',
            info: {
              name: 'Nombre',
              email: 'Correo',
            },
            field: {
              label: 'Número telefónico',
              helper: 'Usaremos este número para enviarte un código SMS de verificación.',
            },
            alerts: {
              errorTitle: 'Error',
              invalidPhone: 'Ingresa un número válido con prefijo internacional (ej., +505).',
              phoneExistsTitle: 'Teléfono ya registrado',
              phoneExistsMessage:
                'Este número ya está vinculado a otra cuenta. Usa otro número o inicia sesión con esa cuenta.',
              sendFailed: 'No pudimos enviar el código SMS. Intenta nuevamente.',
            },
          },
          googlePhone: {
            title: 'Necesitamos tu número',
            subtitle: 'Ingresa tu número telefónico para verificarlo y finalizar el registro.',
            labels: {
              name: 'Nombre',
              email: 'Correo',
              phone: 'Teléfono',
              placeholder: 'Tu número',
            },
            buttons: {
              send: 'Enviar código',
              cancel: 'Cancelar',
            },
            alerts: {
              errorTitle: 'Error',
              invalidPhone: 'Ingresa un número telefónico válido.',
              successTitle: 'Código enviado',
              successMessage: 'Enviamos un código a {{phone}}.',
              sendFailed: 'No pudimos enviar el código SMS.',
            },
          },
          phoneVerificationLogin: {
            title: 'Verifica tu número',
            subtitle: 'Enviamos un código SMS a:',
            editLabel: 'Editar número (opcional)',
            formatHint: 'Formato: {{dialCode}} XXXX XXXX',
            codeSectionLabel: 'Código de verificación (6 dígitos)',
            codePlaceholder: '000000',
            attemptsLabel: 'Intentos restantes: {{remaining}}/{{max}}',
            verifyButton: 'Verificar código',
            resend: {
              question: '¿No recibiste el código?',
              timer: 'Reenviar en {{seconds}}s',
              button: 'Reenviar código',
            },
            info: {
              title: '💡 Información',
              codeValidity: '• El código es válido por 10 minutos',
              attempts: '• Tienes {{max}} intentos para ingresar el código',
              checkNumber: '• Asegúrate de que el número sea correcto',
            },
            backButton: '← Volver',
            alerts: {
              codeIncompleteTitle: 'Código incompleto',
              codeIncompleteMessage: 'Ingresa un código de 6 dígitos para continuar.',
              tooManyAttemptsTitle: 'Demasiados intentos',
              tooManyAttemptsMessage:
                'Por seguridad bloqueamos temporalmente la verificación. Toca “Reenviar código” para intentarlo de nuevo.',
              invalidPhoneTitle: 'Número inválido',
              invalidPhoneMessage: 'Ingresa un número válido antes de reenviar el código.',
              resendSuccessTitle: 'Código enviado',
              resendSuccessMessage: 'Enviamos un nuevo código a {{phone}}.',
              resendErrorTitle: 'Error',
              resendErrorMessage: 'No pudimos reenviar el código.',
              verificationErrorTitle: 'No pudimos verificar el código',
              sessionActiveMessage:
                'No puedes iniciar sesión porque tu cuenta está activa en otro dispositivo. Cierra sesión en el otro teléfono para continuar.',
              genericError: 'Revisa el SMS y asegúrate de ingresar el código más reciente que recibiste.',
              permissionsError:
                'No pudimos cargar tu perfil por un problema de permisos, pero el código SMS podría seguir siendo válido. Intenta más tarde o inicia sesión con correo.',
              successTitle: 'Éxito',
              successMessage: 'Sesión iniciada correctamente.',
            },
          },
          phoneVerification: {
            title: 'Verifica tu número',
            subtitles: {
              register: 'Ingresa el código que recibiste para continuar con el registro.',
              addPhone: 'Ingresa el código para confirmar tu nuevo número.',
            },
            codeLabel: 'Código de verificación',
            codePlaceholder: '000000',
            attemptsLabel: 'Intentos restantes: {{remaining}}/{{max}}',
            verifyButton: 'Verificar código',
            resend: {
              question: '¿No recibiste el código?',
              timer: 'Reenviar en {{seconds}}s',
              button: 'Reenviar código',
            },
            info: {
              title: 'Recordatorio',
              codeValidity: '• El código expira en 10 minutos.',
              attempts: '• Tienes {{max}} intentos antes de que se bloquee el proceso.',
              checkNumber: '• Asegúrate de que el número mostrado sea correcto.',
            },
            alerts: {
              saveErrorTitle: 'Error',
              saveErrorMessage: 'No pudimos continuar con el registro.',
              codeIncompleteTitle: 'Código incompleto',
              codeIncompleteMessage: 'Ingresa un código de 6 dígitos para continuar.',
              tooManyAttemptsTitle: 'Demasiados intentos',
              tooManyAttemptsMessage:
                'Por seguridad bloqueamos temporalmente la verificación. Toca “Reenviar código” para intentarlo de nuevo.',
              addPhoneSuccessTitle: 'Teléfono verificado',
              addPhoneSuccessMessage: 'Tu número se vinculó correctamente.',
              addPhoneErrorTitle: 'No pudimos vincular tu teléfono',
              addPhoneErrorMessage: 'Revisa el SMS y asegúrate de ingresar el código más reciente.',
              phoneExistsTitle: 'Teléfono ya registrado',
              phoneExistsMessage:
                'Este número ya está vinculado a otra cuenta. Usa otro número o inicia sesión con esa cuenta.',
              verificationSuccessTitle: 'Teléfono verificado',
              verificationSuccessMessage: 'Continuemos con tu registro.',
              verificationErrorTitle: 'No pudimos verificar el código',
              verificationErrorMessage:
                'Revisa el SMS y asegúrate de ingresar el código más reciente que recibiste.',
              resendSuccessTitle: 'Código enviado',
              resendSuccessMessage: 'Enviamos un nuevo código a {{phone}}.',
              resendErrorTitle: 'Error',
              resendErrorMessage: 'No pudimos reenviar el código.',
            },
            backButton: '',
          },
          registerConfirm: {
            header: {
              title: 'Confirmar registro',
              subtitle: 'Revisa tu información antes de continuar',
            },
            sections: {
              basic: 'Información básica',
              license: 'Detalles de la licencia',
              vehicle: 'Detalles del vehículo',
              photos: 'Fotos',
              vehiclePhotos: 'Fotos del vehículo',
              importantInfo: 'Información importante',
            },
            photos: {
              hint: 'Estas fotos fueron tomadas correctamente y se subirán cuando confirmes.',
              profile: 'Foto de perfil',
              licenseFront: 'Licencia (frente)',
              licenseBack: 'Licencia (reverso)',
              insurance: 'Póliza / seguro',
              vehicle: 'Foto del vehículo',
              registrationFront: 'Circulación (frente)',
              registrationBack: 'Circulación (reverso)',
            },
            infoBox: {
              line1: '• Al confirmar, aceptas nuestros Términos del Servicio.',
              line2: '• Nuestro equipo revisará tu cuenta.',
              line3: '• Los conductores son verificados en 24-48 horas.',
            },
            data: {
              name: 'Nombre',
              email: 'Correo',
              phone: 'Teléfono',
              role: 'Rol',
              roleLabel: {
                driver: 'Conductor',
                client: 'Cliente',
              },
              authMethod: 'Autenticación',
              authMethodLabel: {
                google: 'Google',
                emailPassword: 'Correo/Contraseña',
                phone: 'Teléfono',
              },
              phoneVerified: 'Teléfono verificado',
              phoneVerifiedYes: 'Sí',
              phoneVerifiedNo: 'No',
              licenseNumber: 'Número de licencia',
              expiration: 'Expiración',
              department: 'Departamento',
              municipality: 'Municipio',
              plate: 'Placa',
              brand: 'Marca',
              model: 'Modelo',
              year: 'Año',
              color: 'Color',
              type: 'Tipo',
              typeLabel: {
                sedan: 'Sedán',
                suv: 'SUV',
                van: 'Van',
                moto: 'Motocicleta',
              },
              passengers: 'Pasajeros',
            },
            buttons: {
              back: 'Regresar',
              confirm: 'Confirmar y registrar',
            },
            progress: 'Paso {{current}} de {{total}}',
            alerts: {
              phoneNotVerifiedTitle: 'Error',
              phoneNotVerifiedMessage: 'Tu número telefónico no ha sido verificado.',
              missingDriverDataTitle: 'Error',
              missingDriverDataMessage: 'Faltan datos del conductor o del vehículo para completar la actualización.',
              upgradeSuccessTitle: 'Información enviada',
              upgradeSuccessMessage:
                'Recibimos tu información de conductor. Revisaremos tus documentos y te avisaremos cuando tu cuenta esté lista.',
              registerSuccessTitle: '¡Bienvenido!',
              registerSuccessMessageDriver: 'Cuenta creada correctamente para conductor.',
              registerSuccessMessageClient: 'Cuenta creada correctamente para cliente.',
              genericErrorTitle: 'Error',
              genericErrorMessage: 'No pudimos crear el usuario.',
            },
          },
          register: {
            header: {
              title: 'Crear cuenta',
              subtitle: 'Elige cómo deseas registrarte',
            },
            methods: {
              email: 'Correo y contraseña',
              phone: 'Solo teléfono',
            },
            fields: {
              nameLabel: 'Nombre completo',
              namePlaceholder: 'Tu nombre',
              emailLabel: 'Correo electrónico',
              emailPlaceholder: 'tu@email.com',
              emailHelperRequired: 'Usaremos este correo para tu cuenta.',
              emailHelperOptional: 'Opcional, puedes agregarlo ahora o después.',
              phoneLabel: 'Teléfono',
              phonePlaceholder: 'Toca para agregar tu número',
              phoneHelperRequired: 'Obligatorio para contactarte.',
              phoneHelperOptional: 'Opcional, puedes agregarlo o editarlo después.',
              passwordLabel: 'Contraseña',
              passwordPlaceholder: 'Mínimo 6 caracteres',
              confirmPasswordLabel: 'Confirmar contraseña',
              confirmPasswordPlaceholder: 'Repite tu contraseña',
            },
            statusMessages: {
              passwordMatch: 'Las contraseñas coinciden',
              passwordMismatch: 'Las contraseñas no coinciden',
            },
            buttons: {
              continueEmail: 'Continuar con correo',
              phoneNext: 'Continuar',
            },
            footer: 'Paso 1 de 4 · Verificaremos tu teléfono antes de elegir el rol.',
            alerts: {
              genericTitle: 'Error',
              confirmPasswordMissing: 'Confirma tu contraseña para continuar.',
              passwordsMismatch: 'Las contraseñas deben coincidir.',
              incompleteEmailForm: 'Completa nombre, correo y una contraseña válida.',
              emailExists: 'Ya existe una cuenta con este correo.',
              phoneExists: 'Ya existe una cuenta con este número.',
              phoneInvalidName: 'Ingresa tu nombre antes de continuar.',
              phoneInvalidNumber: 'Ingresa tu nombre y un número válido en formato internacional (+Código).',
              registerEmailError: 'No pudimos iniciar el registro.',
              registerPhoneError: 'No pudimos continuar con el registro.',
            },
          },
          registrationCheckpoint: {
            title: 'Reanuda tu registro',
            subtitle: 'Encontramos un registro pendiente para {{name}}. Te quedaste en:',
            info: 'Puedes continuar donde lo dejaste o empezar desde cero.',
            buttons: {
              continue: 'Continuar registro',
              startOver: 'Empezar de nuevo',
            },
            startOverConfirm: {
              title: '¿Empezar de nuevo?',
              message:
                'Se eliminará la cuenta creada y todos los datos de este registro. Esta acción no se puede deshacer.',
              confirm: 'Sí, empezar de nuevo',
              cancel: 'Cancelar',
            },
            stepLabels: {
              default: 'Información básica',
              register: {
                default: 'Fundamentos del registro',
                google: 'Selección de rol con Google',
                phone: 'Selección de rol con teléfono',
              },
              emailVerification: 'Verificación de correo',
              googlePhone: 'Agregar teléfono para cuenta Google',
              driverPhone: 'Teléfono del conductor',
              phoneVerification: {
                default: 'Verificación telefónica',
                driver: 'Verificación telefónica para conductor',
              },
              driverData: 'Datos de licencia y vehículo',
              roleSelection: 'Selección de rol',
              registerConfirm: 'Confirmación final del registro',
            },
          },
          roleSelection: {
            header: {
              title: 'Elige tu rol',
              subtitle: 'Decide cómo quieres usar Rundi. Puedes registrarte como cliente o conductor.',
            },
            section: {
              title: 'Tu información',
              nameLabel: 'Nombre',
              emailLabel: 'Correo',
              phoneLabel: 'Teléfono',
              methodLabel: 'Método',
            },
            methodLabels: {
              email: 'Correo y contraseña',
              phone: 'Teléfono (SMS)',
              google: 'Google',
            },
            buttons: {
              client: 'Quiero ser cliente',
              driver: 'Quiero ser conductor',
            },
            options: {
              client: {
                title: 'Cliente',
                description: 'Pide viajes cuando los necesites.',
              },
              driver: {
                title: 'Conductor',
                description: 'Genera ingresos con tu vehículo.',
              },
            },
            alerts: {
              successTitle: 'Registro completo',
              successMessage: '¡Bienvenido a Rundi!',
              errorTitle: 'Error',
              missingName: 'Necesitamos tu nombre completo para continuar.',
              missingEmailPassword: 'El correo y la contraseña son obligatorios para este método.',
              missingVerifiedPhone: 'No encontramos un teléfono verificado.',
              networkError: 'No pudimos conectar con el servidor. Revisa tu conexión.',
              genericError: 'No pudimos completar el registro. Intenta nuevamente.',
              smsSendError: 'No pudimos enviar el código SMS. Intenta en un momento.',
              driverFlowError: 'No pudimos continuar con el registro de conductor.',
            },
          },
          googlesinginbutton: {
            login: 'Iniciando sesión...',
            logincontinue: 'Continuar con Google',
            register: 'Registrando...',
            registercontinue: 'Continuar con Google',
          },
          
        },
        client: {
          pendingPayments: {
           supportTitle: 'Ayuda con mis pagos pendientes',
           supportLabel: '¿Necesitas ayuda con un pago pendiente?',
           supportDescription: 'Abre un chat con soporte para revisar cargos, recibos o cualquier discrepancia.',
            title: 'Pagos pendientes',
            loading: 'Cargando pagos pendientes...',
            emptyTitle: 'Sin pagos pendientes',
            emptyDescription: 'Todos tus pagos están al día.',
            info: {
              message_one: 'Tienes {{count}} pago pendiente.',
              message_other: 'Tienes {{count}} pagos pendientes.',
              instruction: 'Toca uno para pagar con tarjeta (transferencia bancaria).',
            },
            driverFallback: 'Conductor',
            paymentMethod: 'Tarjeta (obligatorio)',
            status: {
              pendingConfirmation: 'Esperando confirmación',
              pending: 'Pago pendiente',
            },
            actionPay: 'Pagar →',
            route: {
              originFallback: 'Origen',
              destinationFallback: 'Destino',
            },
            alerts: {
              loadError: 'No pudimos cargar los pagos pendientes.',
              refreshSuccessTitle: 'Información actualizada',
              refreshSuccessMessage: 'Pagos pendientes sincronizados.',
            },
            date: {
              justNow: 'Justo ahora',
              minutes: 'Hace {{count}} min',
              hours: 'Hace {{count}} h',
              yesterday: 'Ayer',
              days: 'Hace {{count}} días',
            },
          },
          
          cashPayment: {
            loading: 'Cargando información del pago...',
            header: {
              title: 'Pago en efectivo',
              subtitle: 'Confirma que pagaste al conductor en efectivo.',
            },
            detail: {
              amount: 'Monto:',
              time: 'Hora:',
              method: 'Método:',
              methodValueCash: 'Efectivo',
              codeLabel: 'Código de confirmación',
            },
            waiting: {
              title: '⏳ Esperando confirmación',
              description: 'El conductor debe confirmar que recibió tu pago.',
            },
            support: {
              title: 'Consulta sobre mi pago en efectivo',
              label: '¿Necesitas ayuda con este pago?',
              description: 'Abre un chat con soporte y revisa el estado de tu cobro en minutos.',
            },
            buttons: {
              confirm: 'Confirmar pago en efectivo',
              processing: 'Procesando...',
            },
            alerts: {
              methodChangedTitle: 'Método de pago cambiado',
              methodChangedMessage: 'El método de pago cambió a tarjeta. Serás redirigido para pagar con tarjeta.',
              paymentConfirmedTitle: 'Pago confirmado',
              paymentConfirmedMessage: 'Ambas partes confirmaron el pago.',
              confirmationStoredTitle: 'Confirmación registrada',
              confirmationStoredMessage: 'Esperando a que el conductor confirme que recibió el pago.',
              paymentCancelledTitle: 'Pago reportado',
              paymentCancelledMessage: 'El conductor reportó un problema con este pago. Aún puedes calificar el viaje.',
              loginRequired: 'Debes iniciar sesión para confirmar el pago.',
              identityError: 'No pudimos verificar tu identidad. Intenta de nuevo.',
              confirmError: 'No pudimos confirmar el pago. Intenta nuevamente.',
            },
            biometricPrompt: 'Confirma tu identidad para registrar el pago de {{amount}}.',
          },
          rideHistory: {
            filters: {
              all: 'Todos',
              completed: 'Completados',
              canceled: 'Cancelados',
            },
            empty: {
              title: 'Sin viajes',
              subtitle: {
                all: 'Aún no tienes viajes en tu historial.',
                completed: 'Aún no tienes viajes completados.',
                canceled: 'Aún no tienes viajes cancelados.',
              },
            },
            labels: {
              noDate: 'Sin fecha',
              distance: 'Distancia',
              total: 'Total',
              method: 'Método',
              status: 'Estado',
              commission: 'Comisión',
              tip: 'Propina',
              net: 'Neto',
              driver: 'Conductor:',
              paymentMissing: 'Sin datos de pago',
              paymentMethodMissing: 'No proporcionado',
              unknownAddress: 'Ubicación desconocida',
              originFallback: 'Origen',
              destinationFallback: 'Destino desconocido',
            },
            statuses: {
              requested: 'Solicitado',
              accepted: 'Aceptado',
              started: 'En progreso',
              completed: 'Completado',
              canceled: 'Cancelado',
              other: '{{status}}',
            },
            paymentStatus: {
              paid: 'Pagado',
              pending: 'Pendiente',
              other: '{{status}}',
            },
            distanceValue: '{{value}} km',
          },
          home: {
            requestRide: 'Solicitar viaje',
            loading: {
              preparing: 'Preparando tu experiencia...',
              savingLocation: 'Guardando ubicación...',
              obtainingLocation: 'Obteniendo ubicación...',
            },
            map: {
              loadingAddress: 'Cargando ubicación…',
              searchingAddress: 'Buscando dirección…',
              recenter: 'Centrar mapa en mi ubicación',
            },
            locationStatus: {
              locked: 'Ubicación fijada. Toca el pin para mover el mapa y elegir un nuevo punto.',
              dragging: 'Mueve el mapa y suelta o toca el pin para guardar.',
              unlocked: 'Toca el pin para fijar la ubicación.',
              saving: 'Guardando nueva ubicación…',
              savingLabel: 'Guardando ubicación…',
            },
            alerts: {
              regionUnavailableTitle: 'Región no disponible',
              regionUnavailableMessage:
                'Por ahora no puedes solicitar viajes porque estás fuera del área de cobertura activa.',
              regionUnavailableGeneral:
                'El servicio está disponible únicamente en las áreas activas (actualmente Managua).',
              locationSavedTitle: 'Ubicación actualizada',
              locationSavedMessage: 'Se guardó tu ubicación actual.',
              locationSaveError: 'No pudimos guardar tu ubicación. Intenta nuevamente.',
              locationUpdateError: 'No pudimos actualizar tu ubicación. Intenta nuevamente.',
            },
            errors: {
              locationAccessTitle: 'No pudimos acceder a tu ubicación',
              locationAccessDescription:
                'Revisa los permisos de ubicación y asegúrate de que el GPS esté activado.',
              retry: 'Intentar de nuevo',
            },
            pendingAction: {
              paymentSingle: 'Pago pendiente',
              paymentMultiple: '{{count}} pagos pendientes',
            },
            activeRide: {
              requested: 'Buscando un conductor',
              confirm: 'Confirma tu viaje',
              driverOnRoute: 'Conductor en camino',
              inProgress: 'Viaje en progreso',
              pendingPayment: 'Pago pendiente',
              default: 'Viaje activo',
            },
            scheduledRide: {
              imminentTitle: 'Viaje programado por iniciar',
              imminentTitleDriver: 'Tu conductor programado está listo',
              notice: 'Viaje programado hoy a las {{time}} · {{remaining}}',
              inMinutes: 'en {{minutes}} min',
              inHours: 'en {{hours}} h',
              inHoursMinutes: 'en {{hours}} h {{minutes}} min',
              reminderTitle: 'Tu viaje programado está por iniciar',
              reminderBody: 'Tu viaje es en 30 minutos. Ábrelo para confirmarlo.',
            },
            region: {
              checking: 'Verificando área de cobertura...',
              availableNamed: 'Servicio disponible en {{area}}',
              availableGeneric: 'Servicio disponible en tu área actual',
              unavailableFallback: 'El servicio solo está disponible dentro de las áreas activas.',
            },
            profile: {
              fallbackName: 'Usuario',
            },
          },
          recurringRides: {
            addNew: 'Guardar viaje',
            addHint: 'Guarda una ruta frecuente para pedirla con un toque',
            manage: 'Gestionar',
            title: 'Viajes guardados',
            formTitleNew: 'Nuevo viaje recurrente',
            formTitleEdit: 'Editar viaje recurrente',
            nameLabel: 'Nombre del viaje',
            namePlaceholder: 'Ej. Casa → Trabajo',
            routeInfo: '{{distance}} km · ~{{duration}} min',
            routeCalculating: 'Calculando ruta…',
            save: 'Guardar viaje',
            saved: 'Viaje guardado',
            saveError: 'No se pudo guardar el viaje. Intenta de nuevo.',
            limitReached: 'Puedes guardar hasta {{max}} viajes.',
            delete: 'Eliminar',
            deleteConfirmTitle: '¿Eliminar viaje?',
            deleteConfirmBody: '"{{title}}" se quitará de tus viajes guardados.',
            deleted: 'Viaje eliminado',
            deleteError: 'No se pudo eliminar el viaje.',
            emptyTitle: 'Aún no tienes viajes guardados',
            emptyBody: 'Guarda tus rutas frecuentes y solicítalas con un toque.',
            createFirst: 'Crear mi primer viaje',
            edit: 'Editar',
            request: 'Solicitar',
            stopsCount_one: '{{count}} parada',
            stopsCount_other: '{{count}} paradas',
            passengersLabel: 'Pasajeros',
            commentLabel: 'Comentario',
            commentPlaceholder: 'Detalles del viaje...',
            vehicleSection: 'Vehículo',
            paymentSection: 'Método de pago',
            incompleteRoute: 'Define el origen y el destino para guardar el viaje.',
            mapPickHint: 'Toca el mapa para fijar el punto.',
            cash: 'Efectivo',
            card: 'Tarjeta',
          },
          homeOffers: {
            title: 'Ofertas cercanas',
            loading: 'Cargando ofertas...',
            empty: 'No hay conductores interesados aún…',
            searching: 'Buscando conductores',
            count_one: '{{count}} oferta',
            count_other: '{{count}} ofertas',
            emptyHint: 'Mantén la pantalla abierta, los conductores cercanos aparecerán aquí.',
            searchingLong: 'Está tardando más de lo normal — puedes seguir esperando o cancelar e intentarlo después.',
            hint: {
              selectNearest: 'Toca el vehículo más cercano en el mapa o elige una de tus ofertas.',
              selected: 'Conductor seleccionado — confirma tu viaje abajo.',
            },
            cancelConfirmTitle: '¿Cancelar la búsqueda?',
            cancelConfirmBody: 'Si ya hay conductores interesados, perderás sus ofertas.',
            cancelConfirmBodyEmpty: 'Tu solicitud se eliminará y los conductores cercanos dejarán de verla.',
            cancelConfirmYes: 'Sí, cancelar',
            cancelConfirmNo: 'Seguir buscando',
            list: {
              etaFallback: 'Tiempo estimado',
              etaMinutes: '{{count}} min',
              arrivalFallback: 'Hora de llegada',
              arrivalLabel: 'Llega: {{arrival}} - {{eta}}',
              ratingPrefix: '⭐ {{rating}}',
              offerCaption: 'oferta',
              priceLabel: 'Precio:',
              clientPriceLabel: 'Tu precio:',
              driverPriceLabel: 'Sugerencia del conductor:',
              driverPricePending: 'Pendiente',
              clientPriceMissing: 'N/D',
              acceptedPrimary: 'Conductor confirmado',
              acceptedSecondary: 'Conductor confirmado',
              initialFallback: 'C',
            },
            a11y: {
              messageDriver: 'Enviar mensaje al conductor',
              seeReviews: 'Ver reseñas del conductor',
            },
            negotiation: {
              pill: 'Negociar',
              status: {
                clientSuggested: 'Esperando tu respuesta',
                driverOffered: 'Esperando tu respuesta',
                driverAccepted: 'El conductor aceptó tu oferta',
                clientAccepted: 'Aceptaste el precio del conductor',
              },
            },
            primaryAction: {
              select: 'Seleccionar',
              confirmDriver: 'Confirmar conductor',
              confirmDriverPrice: 'Seleccionar y confirmar precio del conductor',
              confirmClientPrice: 'Seleccionar y confirmar tu precio',
              confirmEstimate: 'Seleccionar y confirmar precio estimado',
            },
            buttons: {
              cancelSearch: 'Cancelar búsqueda',
              seeDriverReviews: 'Ver reseñas',
            },
            assignedDriver: {
              badge: 'Conductor asignado',
              confirmedBadge: 'Conductor confirmado',
              pickupAt: 'Recogida {{time}}',
            },
            reviews: {
              complimentsTitle: 'Cumplidos',
              complimentsEmpty: 'Sin cumplidos aún',
              topReviewsTitle: 'Mejores reseñas',
              empty: 'Este conductor aún no tiene reseñas.',
              anonymous: 'Pasajero',
              fallbackDate: 'recientemente',
              fallbackReviewOne: 'Moto muy cómoda y limpia.',
              fallbackReviewTwo: 'Excelente viaje, conductor muy recomendado.',
              stats: {
                rides: 'Viajes',
                years: 'Años en Rundi',
                rating: 'Calificación',
              },
              relative: {
                today: 'Hoy',
                oneDay: 'Hace 1 día',
                days: 'Hace {{count}} días',
                oneWeek: 'Hace 1 semana',
                twoWeeks: 'Hace 2 semanas',
                weeks: 'Hace {{count}} semanas',
              },
              compliments: {
                punctuality: 'Puntualidad',
                cleanliness: 'Limpieza del vehículo',
                communication: 'Comunicación',
                driving: 'Calidad de conducción',
                safety: 'Seguridad',
                friendliness: 'Amabilidad',
                defaultLabel: 'Buen servicio',
              },
            },
            alerts: {
              confirmSuccessTitle: 'Conductor confirmado',
              confirmSuccessMessage: 'Ahora puedes seguir su ubicación en tiempo real.',
              confirmError: 'No pudimos confirmar al conductor. Intenta de nuevo.',
              cancelSuccessTitle: 'Búsqueda cancelada',
              cancelSuccessMessage: 'Regresando a tu pantalla principal.',
              cancelError: 'No pudimos cancelar la búsqueda.',
              acceptOfferError: 'No pudimos aceptar la oferta.',
              counterOfferError: 'No pudimos enviar la contraoferta.',
              confirmFromModalError: 'No pudimos confirmar al conductor.',
            },
            cancelReason: 'Cancelado por el cliente.',
            extraStopLabel: 'Parada {{index}}',
          },
          rideConfirmation: {
            alerts: {
              cancelRideTitle: 'Cancelar viaje',
              cancelRideMessage: 'Si regresas, tu viaje se cancelará automáticamente. ¿Seguro?',
              cancelRideConfirm: 'Cancelar viaje',
              cancelRideStay: 'Quedarme',
              cancelRideError: 'No pudimos cancelar el viaje. Intenta de nuevo.',
              cancelRideSuccessTitle: 'Viaje cancelado',
              cancelRideSuccessMessage: 'Tu viaje se canceló correctamente.',
              confirmCancelTitle: 'Cancelar viaje',
              confirmCancelMessage: '¿Seguro que deseas cancelar este viaje?',
              confirmCancelYes: 'Sí, cancelar',
              confirmCancelNo: 'No',
              confirmDriverError: 'No pudimos confirmar al conductor.',
              confirmDriverSuccessTitle: 'Conductor confirmado',
              confirmDriverSuccessMessage:
                'Confirmaste el viaje con {name}. Ahora puedes ver su ubicación en tiempo real.',
              rejectDriverTitle: 'Rechazar conductor',
              rejectDriverMessage:
                '¿Seguro que deseas rechazar a {name}? El viaje volverá a estar disponible para otros conductores.',
              rejectDriverSuccessTitle: 'Conductor rechazado',
              rejectDriverSuccessMessage: 'El viaje está disponible nuevamente para otros conductores.',
              rejectDriverError: 'No pudimos rechazar al conductor.',
              mustSignInToConfirm: 'Debes iniciar sesión para confirmar al conductor.',
              mustSignInToReject: 'Debes iniciar sesión para rechazar al conductor.',
              counterOfferSentTitle: 'Contraoferta enviada',
              counterOfferSentMessage: 'Tu contraoferta de C${price} fue enviada al conductor.',
              counterOfferError: 'No pudimos enviar la contraoferta.',
            },
            status: {
              searchingDriver: 'Buscando conductor...',
              rideConfirmed: 'Viaje confirmado',
            },
            offers: {
              interestedDriver: 'conductor interesado',
              interestedDrivers: 'conductores interesados',
              reviewOffers: 'Revisa las ofertas y elige la que más te convenga',
              driverFound: '¡Conductor encontrado!',
            },
            eta: {
              estimatedArrival: 'Tiempo estimado de llegada',
            },
            details: {
              rideDetails: 'Detalles del viaje',
              origin: 'Origen',
              destination: 'Destino',
              stop: 'Parada',
              notSpecified: 'No especificado',
              distance: 'Distancia',
              duration: 'Duración',
              price: 'Precio',
              notes: 'Notas:',
            },
            actions: {
              acceptDriver: '✅ Aceptar conductor',
              rejectDriver: '❌ Rechazar',
              viewMapOnly: '🗺️ Ver solo mapa',
              callSupport: '📞 Llamar a soporte',
              canceling: 'Cancelando...',
              cancelRide: 'Cancelar viaje',
            },
            footer: {
              notificationTip: '💡 Recibirás una notificación cuando un conductor acepte tu viaje.',
              chatTip: '💬 Podrás chatear con el conductor una vez acepte el viaje.',
            },
          },
        },
        settings: {
          title: 'Configuración',
          loading: { logout: 'Cerrando sesión...' },
          roles: {
            driver: 'Conductor',
            client: 'Cliente',
            designated_driver: 'Conductor designado',
            admin: 'Administrador',
            default: 'Usuario',
          },
          sections: {
            account: 'Cuenta',
            privacy: 'Privacidad y seguridad',
            about: 'Acerca de',
            language: 'Idioma',
          },
          account: {
            title: 'Mi cuenta',
            description: 'Administra correo, contraseña y teléfono',
            upgradeTitle: 'Quiero conducir',
            upgradeDescription: 'Completa tu información y documentos para ofrecer viajes en Rundi.',
            deleteTitle: 'Eliminar mi cuenta',
            deleteDescription: 'Flujo guiado para solicitar la eliminación',
          },
          privacy: {
            policy: 'Política de privacidad',
            terms: 'Términos y Condiciones',
          },
          about: {
            version: 'Versión',
            versionValue: 'Beta- 1.8',
            domain: 'Dominio',
            domainValue: 'rundiapp.com',
            licenses: 'Licencias de código abierto',
          },
          language: {
            title: 'Idioma de la app',
            description: 'Elige tu idioma preferido.',
            deviceDefault: 'Idioma del dispositivo: {{language}}',
            options: {
              en: 'Inglés',
              es: 'Español',
              zh: 'Chino',
            },
          },
          alerts: {
            buildTitle: 'Compila la app',
            buildMessage:
              'Las notificaciones push solo funcionan en un build de desarrollo o producción. Usa “npx expo run:android” o “npx expo run:ios”.',
            disableTitle: 'Desactivar notificaciones',
            disableMessage:
              'Para desactivar las notificaciones push, abre los ajustes del sistema y revoca los permisos de la app.',
            notAvailableTitle: 'No disponible',
            notAvailableMessage: 'Solo cuentas de cliente pueden iniciar el registro de conductor aquí.',
            smsErrorTitle: 'Error',
            smsErrorMessage: 'No pudimos enviar el código SMS. Intenta nuevamente.',
            genericError: 'Algo salió mal. Intenta de nuevo.',
          },
          actions: {
            logout: 'Cerrar sesión',
            logoutTitle: 'Cerrar sesión',
            logoutMessage: '¿Seguro que quieres cerrar sesión?',
            cancel: 'Cancelar',
            confirm: 'Cerrar sesión',
            accept: 'Aceptar',
          },
        },
        driver: {
          home: {
            loading: {
              initializing: 'Preparando tu panel de conductor...',
              locating: 'Obteniendo tu ubicación...',
            },
            errors: {
              location: 'No pudimos obtener la ubicación',
              retry: 'Intentar de nuevo',
            },
            alerts: {
              penaltiesTitle: 'Comisiones pendientes',
              penaltiesAutoDisabled:
                'Tu disponibilidad se desactivó porque superaste C${{limit}} en comisiones pendientes. Paga antes de reconectarte.',
              penaltiesBlockActivation:
                'Tienes C${{amount}} pendientes. Debes estar por debajo de C${{limit}} para activar la disponibilidad.',
              rechargeRequiredTitle: 'Fondos insuficientes',
              rechargeRequiredBody:
                'Tu saldo actual en la billetera es C${{amount}}. Recarga fondos para seguir aceptando viajes.',
              availabilityUpdateFailed: 'No pudimos actualizar tu estado.',
            },
            voice: {
              ready: 'Asistente de voz listo. Te avisaré sobre viajes cercanos y cambios importantes.',
              availabilityOn: 'Disponibilidad activada. Esperando nuevos viajes.',
              availabilityOff: 'Disponibilidad desactivada.',
              nearbyRideDistance: '{{distance}} kilómetros',
              nearbyRideDistanceFallback: 'una distancia cercana',
              nearbyRide: 'Viaje cercano a {{distance}}. Tarifa neta {{price}} córdobas.',
              activeRide: 'Tienes un viaje activo con {{client}}. Destino {{destination}}.',
              clientFallback: 'el cliente',
              destinationFallback: 'el destino asignado',
            },
            pendingAction: {
              paymentTitle: 'Pago pendiente',
              paymentSingleSubtitle: 'Confirma el pago pendiente',
              paymentMultipleSubtitle: '{{count}} pagos pendientes',
              negotiationTitle: 'Esperando confirmación del cliente',
              negotiationSubtitle: 'El cliente está revisando tu oferta',
              genericSubtitle: 'Revisa esta acción pendiente',
            },
            activeRideStatus: {
              accepted: {
                title: 'Viaje aceptado',
                subtitle: 'Abre el viaje con {{client}}',
              },
              driverOnRoute: {
                title: 'Camino al cliente',
                subtitle: 'Dirígete a {{client}}',
              },
              driverArrived: {
                title: 'Cliente esperando',
                subtitle: 'Confirma la recogida de {{client}}',
              },
              inProgress: {
                title: 'Viaje en progreso',
                subtitle: '{{destination}}',
              },
              offerMade: {
                title: 'Oferta enviada',
                subtitle: 'Esperando confirmación del cliente',
              },
            },
            banners: {
              activeRideTitle: 'Viaje en curso',
              penaltiesTitle: 'Comisiones pendientes',
              penaltiesSubtitle: '{{count}} por C${{amount}}',
              rechargeTitle: 'Saldo insuficiente en billetera',
              rechargeSubtitle: 'Saldo actual: C${{amount}}. Recarga para seguir conduciendo.',
              paymentsTitle: 'Pagos pendientes',
              paymentsSubtitleSingle: '1 pago por confirmar',
              paymentsSubtitleOther: '{{count}} pagos por confirmar',
            },
            header: {
              profileFallback: 'Conductor',
            },
            stats: {
              totalToday: 'Total hoy',
            },
            cta: {
              viewRequests: 'Ver solicitudes',
            },
            status: {
              online: 'En línea',
              offline: 'Desconectado',
            },
            designated: {
              activeLabel: 'Designado',
            },
            ride: {
              clientFallback: 'Cliente',
              originFallback: 'Origen',
              destinationFallback: 'Destino',
            },
            menu: {
              title: 'Menú rápido',
              earnings: 'Ver ganancias detalladas',
              commissions: 'Recargar fondos',
              history: 'Historial de viajes',
              paymentMethods: 'Métodos de pago',
              settings: 'Configuración',
              help: 'Ayuda',
              logout: 'Cerrar sesión',
            },
            buttons: {
              retry: 'Intentar de nuevo',
            },
          },
          profile: {
            loading: {
              message: 'Cargando perfil...',
            },
            header: {
              title: 'Mi perfil',
              edit: 'Editar perfil',
              memberId: 'ID: {{id}}',
              nameFallback: 'Conductor',
              initialFallback: 'C',
            },
            accountStatus: {
              label: 'Cuenta',
              active: 'Cuenta activa',
              pending: 'Cuenta pendiente',
              suspended: 'Cuenta suspendida',
              rejected: 'Cuenta rechazada',
              other: 'Cuenta {{status}}',
            },
            stats: {
              walletTitle: 'Billetera',
              walletCta: 'Recargas, bonos y más',
              totalEarnings: 'Ganancias totales',
              todaysEarnings: 'Ganancias de hoy',
              totalRides: 'Viajes completados',
              todaysRides: 'Viajes de hoy',
              rating: 'Calificación',
            },
            vehicles: {
              title: 'Mis vehículos',
              selectedLabel: 'Vehículo seleccionado',
              pendingLabel: 'En revisión administrativa',
              empty: 'No hay vehículos registrados',
              addButton: 'Agregar vehículo',
              verify: 'Verificar',
              view: 'Ver',
              switch: 'Cambiar',
              selected: 'Seleccionado',
              unavailable: 'No disponible',
            },
            documents: {
              title: 'Documentos del conductor',
              licenseName: 'Licencia de conducir',
              expires: 'Expira: {{date}}',
              types: {
                license: 'Licencia de conducir',
                registration: 'Circulación del vehículo',
                insurance: 'Seguro vehicular',
                default: 'Documento',
              },
              status: {
                verified: 'Verificado',
                rejected: 'Rechazado',
                suspended: 'Suspendido',
                pending: 'En revisión',
                complete: 'Completo (en revisión)',
                missing: 'Pendiente',
              },
              button: {
                view: 'Ver',
                details: 'Ver detalles',
                fix: 'Corregir',
                submit: 'Enviar a revisión',
                complete: 'Completar',
              },
            },
            designated: {
              title: 'Conductor designado',
              heroTitle: 'Amplía tus oportunidades',
              heroDescription:
                'Conviértete en conductor designado y accede a viajes premium donde el cliente provee el vehículo. Gana más con trayectos de lujo.',
              benefits: {
                rides: '✓ Viajes de conductor designado',
                higherFare: '✓ Tarifa más alta por viaje',
                premiumClients: '✓ Clientes premium',
                keepRegular: '✓ Mantén tus viajes regulares',
              },
              statusLabel: {
                pending: 'Sin solicitud',
                requested: 'Solicitud en revisión',
                approved: 'Conductor designado activo',
                verified: 'Conductor designado activo',
                rejected: 'Solicitud rechazada',
                revoked: 'Rol revocado',
                unknown: 'Estado desconocido',
              },
              statusHelper: {
                pending: 'Envía tu solicitud para acceder a viajes premium.',
                requested: 'Nuestro equipo revisará tu información en 24 horas.',
                approved: 'Disfruta los beneficios del programa.',
                verified: 'Disfruta los beneficios del programa.',
                rejected: 'Revisa tus documentos o contáctanos para más información.',
                revoked: 'Tu acceso fue revocado. Contacta soporte para más detalles.',
                default: 'Actualiza tus datos para acceder al programa.',
              },
              button: {
                default: 'Solicitar acceso',
                pending: 'Solicitud enviada',
                approved: 'Conductor designado activo',
                rejected: 'Solicitud rechazada',
              },
              alerts: {
                pendingTitle: 'Solicitud pendiente',
                pendingBody: 'Ya tienes una solicitud en curso. Nuestro equipo la revisará en 24 horas.',
                approvedTitle: 'Ya aprobado',
                approvedBody: 'Tu cuenta ya forma parte del programa de conductor designado.',
                rejectedTitle: 'Solicitud rechazada',
                rejectedBody: 'Tu solicitud fue rechazada. Revisa tus documentos o contáctanos si necesitas ayuda.',
                confirmTitle: 'Solicitar acceso a conductor designado',
                confirmBody:
                  '¿Quieres solicitar acceso al programa de conductor designado?\n\nRequisitos:\n• Vehículo 4x4 o SUV\n• Licencia vigente\n• Documentos verificados\n• Calificación mínima 4.8',
                confirmCancel: 'Cancelar',
                confirmSubmit: 'Solicitar',
                errorTitle: 'Error',
                errorBody: 'No pudimos enviar la solicitud. Intenta de nuevo.',
              },
              helper: {
                pending: 'Envía tu solicitud para acceder a viajes premium.',
                requested: 'Nuestro equipo revisará tu información en 24 horas.',
                approved: 'Disfruta los beneficios del programa.',
                verified: 'Disfruta los beneficios del programa.',
                rejected: 'Revisa tus documentos o contáctanos para más información.',
                revoked: 'Tu acceso fue revocado. Contacta soporte para más detalles.',
                default: 'Actualiza tus datos para acceder al programa.',
              },
            },
            mode: {
              title: 'Modo de uso',
              description: 'Cambia entre vista de cliente y conductor con la misma cuenta.',
              switchToClient: 'Usar como cliente',
              switchToDriver: 'Usar como conductor',
              alerts: {
                unavailableTitle: 'No disponible',
                unavailableBody:
                  'Tu cuenta aún no está configurada como conductor. Completa el registro y espera la aprobación.',
                loadingTitle: 'Cargando información',
                loadingBody: 'Estamos cargando el estado de tu cuenta de conductor. Intenta nuevamente en unos segundos.',
                cannotEnableTitle: 'No se puede activar modo conductor',
                requirementsBody: 'Completa tu información para activar el modo conductor.',
                close: 'Cerrar',
                viewDocuments: 'Ver documentos',
                viewVehicles: 'Ver vehículos',
                errorTitle: 'Error',
                errorBody: 'No pudimos cambiar el modo. Intenta nuevamente.',
                reasons: {
                  account: '• Tu cuenta de conductor aún no está activa.',
                  documents: '• Tus documentos de conductor están pendientes o fueron rechazados.',
                  vehicle: '• No tienes un vehículo aprobado activo.',
                },
              },
            },
            overlay: {
              title: 'Notificaciones avanzadas',
              subtitle: 'Burbuja flotante con solicitudes cercanas',
              description:
                'Muestra una tarjeta sobre otras apps cuando hay un viaje cercano. Ideal si usas otras apps de navegación.',
              hintAndroidGranted: 'Permiso activo.',
              hintAndroidMissing: 'Abre Configuración → Apps → Rundi → Mostrar sobre otras apps.',
              hintIos: 'Usa Actividades en vivo (Dynamic Island).',
              hintIosGranted: 'Actividades en vivo activas.',
              hintIosMissing: 'Abre Ajustes → Rundi → Actividades en vivo.',
              alerts: {
                notAvailableTitle: 'No disponible',
                notAvailableBody: 'La función flotante solo está disponible en Android.',
                enableTitle: 'Activa el permiso',
                enableBody: 'Abre la pantalla “Mostrar sobre otras apps” y actívala para Rundi.',
                enableTitleIos: 'Activa las Actividades en vivo',
                enableBodyIos: 'Abre Ajustes → Rundi → Actividades en vivo y actívalas.',
                disableTitle: 'Desactiva el permiso',
                disableBody: 'Abre la pantalla “Mostrar sobre otras apps” y desactívala para Rundi.',
                permissionMissingTitle: 'Permiso no concedido',
                permissionMissingBody: 'No detectamos el permiso. Intenta nuevamente desde la pantalla de ajustes.',
                permissionMissingBodyIos: 'No detectamos el acceso a Actividades en vivo. Intenta nuevamente desde Ajustes → Rundi.',
                permissionStillOnTitle: 'El permiso sigue activo',
                permissionStillOnBody: 'El permiso sigue activo. Desactívalo manualmente en Ajustes.',
                errorTitle: 'Error',
                errorBody: 'No pudimos actualizar la preferencia. Intenta nuevamente.',
              },
            },
            voice: {
              title: 'Asistente de voz',
              cardTitle: 'Indicaciones habladas',
              subtitle:
                'Recibe alertas de nuevos viajes, recordatorios al llegar al cliente y avisos de pagos en efectivo pendientes sin mirar la pantalla.',
              benefits: {
                rides: '• Anuncios automáticos de viajes cercanos',
                arrivals: '• Recordatorios cuando llegas al punto de recogida',
                payments: '• Alertas cuando un pago en efectivo está pendiente de confirmación',
              },
              footer: 'Puedes desactivarlo en cualquier momento. Recomendamos mantenerlo activo para manejar manos libres.',
            },
            insurance: {
              title: 'Información del seguro',
              company: 'Compañía',
              number: 'Número de póliza',
              expiry: 'Vencimiento',
              photo: 'Foto de la póliza',
            },
            options: {
              viewEarnings: 'Ver ganancias detalladas',
              rideHistory: 'Historial de viajes',
              paymentMethods: 'Métodos de pago',
              settings: 'Configuración',
              help: 'Ayuda',
            },
            modal: {
              title: 'Agregar nuevo vehículo',
              labels: {
                basicInfo: 'Información básica',
                plate: 'Placa *',
                brand: 'Marca *',
                model: 'Modelo *',
                year: 'Año *',
                color: 'Color *',
                type: 'Tipo',
                specs: 'Especificaciones técnicas',
                engine: 'Motor',
                chassis: 'Chasis',
                vin: 'VIN',
                cylinders: 'Cilindros',
                passengers: 'Pasajeros',
                fuelType: 'Tipo de combustible',
                tonnage: 'Tonelaje',
                classification: 'Clasificación',
                vehicleClass: 'Clase del vehículo',
                serviceType: 'Tipo de servicio',
                lien: 'Gravamen',
                documents: 'Documentos de circulación',
                emissionDate: 'Fecha de emisión',
                registrationNumber: 'Número de registro',
                registrationExpiry: 'Vencimiento del registro',
                registrationFront: 'Foto frontal de la circulación',
                registrationBack: 'Foto trasera de la circulación',
                insurance: 'Seguro',
                insuranceNumber: 'Número de póliza',
                insuranceCompany: 'Compañía de seguro',
                insuranceStart: 'Inicio del seguro',
                insuranceExpiry: 'Vencimiento del seguro',
                insurancePhoto: 'Foto de la póliza de seguro',
                photos: 'Fotos del vehículo',
                vehiclePhoto: 'Foto del vehículo',
              },
              placeholders: {
                plate: 'ABC-123',
                brand: 'Toyota',
                model: 'Corolla',
                year: '{{year}}',
                color: 'Blanco',
                type: 'Sedán',
                engine: '2.0L',
                chassis: 'ABC123456',
                vin: 'VIN123456789',
                cylinders: '4',
                passengers: '5',
                fuelType: 'Gasolina',
                tonnage: '2.50',
                vehicleClass: 'PRIVADO',
                serviceType: 'PRIVADO',
                lien: 'NINGUNO',
                registrationNumber: 'B2301230',
                emissionDate: 'AAAA-MM-DD',
                registrationExpiry: 'AAAA-MM-DD',
                insuranceNumber: 'RCO30201102',
                insuranceCompany: 'BAC',
                insuranceStart: 'AAAA-MM-DD',
                insuranceExpiry: 'AAAA-MM-DD',
              },
              buttons: {
                cancel: 'Cancelar',
                submit: 'Agregar vehículo',
              },
            },
            alerts: {
              permissions: {
                galleryTitle: 'Permiso denegado',
                galleryBody: 'Necesitamos acceso a tu galería para subir fotos.',
              },
              upload: {
                successTitle: 'Éxito',
                successBody: 'Foto de perfil actualizada correctamente.',
                errorTitle: 'Error',
                errorBody: 'No pudimos subir la foto. Intenta de nuevo.',
              },
              vehicles: {
                formErrorTitle: 'Error',
                formErrorBody: 'Completa todos los campos obligatorios.',
                addSuccessTitle: 'Éxito',
                addSuccessBody: 'Vehículo agregado correctamente.',
                addErrorTitle: 'Error',
                switchErrorTitle: 'Error',
                notFoundTitle: 'Error',
                notFoundBody: 'Vehículo no encontrado.',
                notApprovedTitle: 'Vehículo no autorizado',
                notApprovedBody: 'Este vehículo aún no ha sido aprobado por el equipo administrativo.',
                incompleteTitle: 'Vehículo incompleto',
                incompleteBody:
                  'No puedes cambiar a este vehículo porque:\n\n{{reason}}\n\nCompleta la información en la pantalla de verificación.',
                viewDocuments: 'Completar información',
                switchErrorBody: 'No pudimos cambiar el vehículo. Intenta nuevamente.',
                genericFormError: 'Error al agregar el vehículo.',
                issues: {
                  basicInfo: 'Información básica incompleta',
                  registration: 'Datos de circulación incompletos',
                  insurance: 'Datos de seguro incompletos',
                  vehiclePhoto: 'Falta la foto del vehículo',
                },
              },
            },
            buttons: {
              retry: 'Intentar de nuevo',
            },
          },
         available: {
          header: {
            title: 'Viajes disponibles',
            count_one: '{{count}} viaje disponible',
            count_other: '{{count}} viajes disponibles',
          },
          fundsBanner: {
            title: 'Fondos insuficientes',
            body: 'Tu billetera tiene C${{amount}}. Toca para recargar.',
          },
          empty: {
            hint: 'Desliza hacia abajo para actualizar',
          },
          offline: {
            title: 'Estás desconectado',
            message: 'Activa tu disponibilidad para ver las solicitudes de viaje cercanas.',
            action: 'Activarme',
            activating: 'Activando…',
          },
          voice: {
            ridesAvailable: 'Tienes {{count}} viajes disponibles.',
          },
          sections: {
            designatedTitle: 'Viajes de conductor designado',
            designatedSubtitle: 'Solo se muestran cuando activas el modo designado.',
            scheduledTitle: 'Tus viajes programados',
            scheduledSubtitle: 'Se activan automáticamente cuando llega la hora programada.',
          },
          alerts: {
            cardRequiredTitle: 'Tarjeta requerida',
            cardRequiredBody:
              'Para aceptar viajes pagados con tarjeta necesitas registrar al menos una tarjeta. Agrégala antes de continuar.',
            cardRequiredConfirm: 'Ir a métodos de pago',
            cardRequiredCancel: 'Cancelar',
            activeRideTitle: 'Ya tienes un viaje activo',
            activeRideBody: 'Termina tu viaje actual antes de aceptar uno nuevo.',
            penaltiesTitle: 'Comisiones pendientes',
            penaltiesBody: 'Tienes C${{amount}} en comisiones pendientes. Págales para aceptar viajes.',
            rechargeRequiredTitle: 'Fondos insuficientes',
            rechargeRequiredBody: 'Tu billetera tiene C${{amount}} disponibles. Recarga para aceptar viajes.',
            offerSentTitle: 'Oferta enviada',
            offerAcceptedBody: 'Aceptaste el viaje por C${{amount}}. Esperando la confirmación del cliente...',
            offerGenericBody: 'Notificamos al cliente. Esperando confirmación...',
            errorSendOffer: 'No pudimos enviar la oferta.',
            errorAcceptRide: 'No pudimos aceptar el viaje.',
            assignSuccessTitle: 'Viaje asignado',
            assignSuccessBody: 'Asignaste un viaje programado. Confirmalo cuando se te notifique.',
            assignError: 'No podemos agendar tu viaje.',
            scheduledConfirmedTitle: 'Viaje confirmado',
            scheduledConfirmedBody: 'Confirmaste el viaje programado. Preséntate en el punto de recogida a la hora indicada.',
            scheduledConfirmError: 'No pudimos confirmar el viaje programado.',
          },
          rideCard: {
            clientFallback: 'Cliente',
            initialFallback: 'CL',
            origin: 'Origen: {{address}}',
            destination: 'Destino: {{address}}',
            stops: 'Paradas: {{count}}',
            price: 'Precio: C${{amount}}',
            distanceToOrigin: '{{distance}} km al punto de recogida',
            calculating: 'Calculando...',
            etaToOrigin: '~{{minutes}} min para llegar',
            viewVehicle: 'Ver vehículo',
            view: 'Detalles',
            distanceShort: 'A {{distance}} km',
            etaShort: '~{{minutes}} min',
            tripDistance: 'Viaje {{distance}} km',
            tripWithDuration: 'Viaje {{distance}} km · ~{{minutes}} min',
            stops_one: '{{count}} parada',
            stops_other: '{{count}} paradas',
            paymentCash: 'Efectivo',
            paymentCard: 'Tarjeta',
            vehicleAuto: 'Auto',
            vehicleMoto: 'Moto',
            designatedTag: 'Designado',
            scheduledToday: 'Hoy · {{time}}',
            scheduledTomorrow: 'Mañana · {{time}}',
            scheduledDate: '{{date}} · {{time}}',
            scheduledWaiting: 'Esperando la hora del viaje',
            scheduledConfirmed: 'Confirmado',
            scheduledAwaitingConfirm: 'Confirma tu viaje',
            scheduledClientConfirmed: 'Cliente confirmó · confirma tu viaje',
            scheduledTimeReached: 'Es la hora del viaje',
            confirmScheduled: 'Confirmar viaje',
            placeholders: {
              originAddress: 'Origen',
              destinationAddress: 'Destino',
            },
          },
          modal: {
            close: 'Cerrar',
          },
           assignModal: {
            title: 'Reclama un viaje programado',
            subtitle: 'Ingresa el código que te compartió el cliente',
            placeholder: 'Ej: K7M2NP',
            cancel: 'Cancelar',
            confirm: 'Reclamar',
            assigning: 'Reclamando...',
            assignProgrammedButton: 'Reclamar viaje programado con código',
            assignSuccessTitle: '✅ Viaje asignado',
            assignSuccessBody: 'Asignaste un viaje programado. Confirmalo cuando se te notifique.',
            assignError: 'No podemos agendar tu viaje.',
          },
        },
        ridePreview: {
          voice: {
            summary: 'Tarifa neta {{price}} córdobas.',
            summaryWithDistance: 'Tarifa neta {{price}} córdobas. Distancia total {{distance}} km.',
            clientOffer: 'El cliente ofreció {{amount}} córdobas.',
          },
          alerts: {
            canceledTitle: 'Viaje cancelado',
            canceledBody: 'El cliente canceló la solicitud.',
            assignedTitle: 'Viaje asignado a otro conductor',
            assignedBody: 'El cliente asignó el viaje a otro conductor.',
            unavailableTitle: 'Viaje no disponible',
            unavailableBody: 'El cliente confirmó a otro conductor para este viaje.',
            routeErrorTitle: 'Ruta incompleta',
            routeErrorBody: 'No pudimos calcular toda la ruta. Mostramos un recorrido aproximado.',
            infoTitle: 'Información',
            noPhone: 'Teléfono del cliente no disponible.',
            callError: 'No pudimos iniciar la llamada.',
            missingUser: 'No pudimos obtener tu información.',
            invalidPriceTitle: 'Precio inválido',
            invalidPriceBody: 'Ingresa un monto válido mayor a cero.',
            counterOfferError: 'No pudimos enviar la contraoferta.',
            canceledOtherReason: 'El cliente canceló la solicitud.',
            activeRideTitle: 'Ya tienes un viaje activo',
            activeRideBody: 'Termina tu viaje actual antes de aceptar uno nuevo.',
            cardRequiredTitle: 'Tarjeta requerida',
            cardRequiredBody:
              'Para aceptar viajes pagados con tarjeta necesitas registrar al menos una tarjeta bancaria. Agrégala antes de continuar.',
            cardRequiredConfirm: 'Ir a métodos de pago',
            cardRequiredCancel: 'Cancelar',
            offerSentTitle: 'Oferta enviada',
            offerAcceptedBody: 'Aceptaste el viaje por {{amount}}. Esperando la confirmación del cliente...',
            offerNotifiedBody: 'Notificamos al cliente. Esperando confirmación...',
            acceptRideError: 'No pudimos aceptar el viaje.',
          },
          loader: {
            calculatingRoute: 'Calculando ruta...',
          },
          negotiation: {
            status: {
              client_suggested: 'Esperando tu respuesta',
              driver_offered: 'Esperando al cliente',
              driver_accepted: 'Aceptaste el precio del cliente',
              client_accepted: 'El cliente aceptó tu oferta',
              defaultClient: 'Esperando tu respuesta',
              defaultDriver: 'Esperando al cliente',
            },
            driverOfferTitle: 'Acabas de proponer {{amount}}',
            clientOfferTitle: 'El cliente propuso {{amount}}',
            estimatedLabel: 'Precio estimado',
            clientOfferLabel: 'Oferta del cliente',
            suggestionsLabel: 'Precios sugeridos',
            customOfferButton: 'Hacer una oferta',
            yourOffer: 'Tu oferta',
            customLabel: 'Ingresa tu oferta personalizada',
            placeholderExample: 'Ej. 95',
            send: 'Enviar',
            finalLabel: 'Precio final estimado',
          },
          nearby: {
            title: 'Solicitud cercana',
            subtitle: '{{distance}} • {{price}} • {{origin}}',
            distanceFallback: 'Cercano',
            priceFallback: 'Precio pendiente',
            originFallback: 'Origen cercano',
            distanceMeters: '{{distance}} m',
            distanceKilometers: '{{distance}} km',
            view: 'Ver',
          },
          labels: {
            estimatedPrice: 'Precio estimado: {{amount}}',
            notAvailable: 'N/D',
            clientFallback: 'Cliente',
            originFallback: 'Origen',
            destinationFallback: 'Destino',
            currency: 'C${{amount}}',
            clientNote: 'Nota: {{note}}',
            tripDistance: '{{value}} km',
            tripDuration: '~{{value}} min',
            paymentCash: 'Efectivo',
            paymentCard: 'Tarjeta',
          },
          accessibility: {
            messageClient: 'Enviar mensaje al cliente',
            callClient: 'Llamar al cliente',
            vehiclePhoto: 'Ver foto del vehículo del cliente',
            toggleDetails: 'Mostrar u ocultar detalles del viaje',
          },
          rideCard: {
            clientFallback: 'Cliente',
            initialFallback: 'CL',
            origin: 'Origen: {{address}}',
            destination: 'Destino: {{address}}',
            stops: 'Paradas: {{count}}',
            price: 'Precio: {{amount}}',
            distanceToOrigin: '{{distance}} km al punto de recogida',
            calculating: 'Calculando...',
            etaToOrigin: '~{{minutes}} min para llegar',
            viewVehicle: 'Ver vehículo',
            view: 'Detalles',
            placeholders: {
              originAddress: 'Origen',
              destinationAddress: 'Destino',
            },
          },
          buttons: {
            accept: 'Aceptar',
            reject: 'Rechazar',
            viewVehiclePhoto: 'Ver foto',
          },
          modal: {
            close: 'Cerrar',
          },
        },
       activeRide: {
       labels: {
       driverFallback: 'Conductor',
       clientFallback: 'Cliente',
       initialFallback: 'C',
       fare: 'Tarifa: {{amount}}',
       currency: 'C${{amount}}',
       notAvailable: 'N/D',
       originFallback: 'Origen',
       destinationFallback: 'Destino',
       stopLabel: 'Parada {{index}}',
       estimatedTitle: 'Estimado',
       estimatedMinutes: '{{minutes}} min',
       estimatedDistance: '{{distance}} km',
       pickupLabel: 'Recogida',
       destinationLabel: 'Destino',
       paymentCash: 'Efectivo',
       paymentCard: 'Tarjeta',
       },
       status: {
       pending_confirm: 'Esperando confirmación',
       accepted: 'Viaje aceptado',
       driver_on_route: 'Camino al punto de recogida',
       driver_arrived: 'Cliente esperando',
       in_progress: 'Viaje en progreso',
       pending_payment: 'Pago pendiente',
       completed: 'Viaje completado',
       canceled: 'Viaje cancelado',
       default: 'Viaje activo',
       },
       loader: {
         loadingDetails: 'Cargando detalles del viaje...',
         waitingData: 'Esperando datos del viaje...',
       },
       evidence: {
         title: 'Revisión antes de iniciar',
         subtitle: 'Toma fotos del seguro, la circulación y los cuatro asientos del vehículo del cliente.',
         photos: {
           insurance: 'Documento del seguro',
           registration: 'Tarjeta de circulación',
           frontDriverSeat: 'Asiento delantero del conductor',
           frontPassengerSeat: 'Asiento delantero del pasajero',
           rearLeftSeat: 'Asiento trasero izquierdo',
           rearRightSeat: 'Asiento trasero derecho',
         },
         captured: 'Foto lista',
         required: 'Obligatoria',
         take: 'Tomar foto',
         retake: 'Repetir',
         takePhoto: 'Tomar foto: {{photo}}',
         retakePhoto: 'Repetir foto: {{photo}}',
         attestation: 'Revisé el seguro y la circulación y confirmo que ambos documentos están vigentes.',
         submit: 'Subir 6 fotos y confirmar',
         uploadProgress: 'Subiendo foto {{current}} de {{total}}...',
         close: 'Cerrar',
         cancelIfExpired: '¿No puedes confirmar que están vigentes? Cancela el viaje.',
         permissionTitle: 'Se requiere permiso de cámara',
         permissionMessage: 'Permite el acceso a la cámara para tomar las seis fotos requeridas.',
         cameraError: 'No se pudo tomar la foto. Intenta nuevamente.',
         requiredPhoto: 'Toma las seis fotos requeridas.',
         uploadError: 'No se pudieron subir y guardar las fotos. Intenta nuevamente.',
       },
       alerts: {
         goOnRouteError: 'No pudimos marcarte en camino.',
         arriveError: 'No pudimos registrar tu llegada.',
         startRideError: 'No pudimos iniciar el viaje.',
         completeRideError: 'No pudimos completar el viaje.',
         cancelRideError: 'No pudimos cancelar el viaje.',
         cancelRideTitle: 'Cancelar viaje',
         cancelRideMessage: '¿Seguro que quieres cancelar este viaje?',
         cancelRideConfirm: 'Cancelar viaje',
         cancelRideKeep: 'Mantener viaje',
         canceledTitle: 'Viaje cancelado',
         canceledByDriver: 'El viaje fue cancelado.',
         canceledByClient: 'El cliente canceló el viaje.',
         rideNotFound: 'Viaje no encontrado.',
         canceledByDriverMessage: 'El viaje fue cancelado.',
         canceledByClientMessage: 'El cliente canceló el viaje.',
       },
        buttons: {
        navigate: 'Navegar',
        goOnRoute: 'Dirigirse al punto de recogida',
        goOnRoutePending: 'Marcando...',
        startRide: 'Iniciar viaje',
        startRidePending: 'Iniciando...',
        completeRide: 'Completar viaje',
        completeRidePending: 'Completando...',
        cancelRide: 'Cancelar viaje',
  },
  cta: {
    goOnRoute: 'Dirigirse al punto de recogida',
    goOnRoutePending: 'Marcando...',
    startRide: 'Iniciar viaje',
    startRidePending: 'Iniciando...',
    completeRide: 'Completar viaje',
    completeRidePending: 'Completando...',
    markArrived: 'Ya llegué al punto de recogida',
    markArrivedPending: 'Registrando llegada...',
    completeEvidence: 'Tomar las seis fotos',
    completeEvidencePending: 'Abriendo captura de fotos...',
  },
  voice: {
    origin: 'Recogida {{origin}}',
    destination: 'Destino {{destination}}',
    netFare: 'Tarifa neta {{amount}} córdobas',
    totalDistance: 'Distancia total {{distance}} km',
    originFallback: 'el punto de recogida asignado',
    destinationFallback: 'el destino final',
    messagePrefix: 'Mensaje del cliente: {{message}}',
    coords: '{{lat}} por {{lng}}',
  },
  navigation: {
    title: 'Navegar con GPS',
    subtitle: 'Elige tu app de navegación preferida',
    googleMaps: '🗺️ Google Maps',
    waze: '🚗 Waze',
    cancel: 'Cancelar',
    button: 'Navegar',
     },
       accessibility: {
        muteVoice: 'Silenciar voz',
        resumeVoice: 'Reactivar voz',
        openChat: 'Abrir chat con el cliente',
        callClient: 'Llamar al cliente',
        togglePanel: 'Mostrar u ocultar detalles del viaje',
        navigate: 'Abrir opciones de navegación',
     },
      notifications: {
      newMessageTitle: 'Nuevo mensaje del cliente',
     },
     support: {
          title: 'Necesito ayuda con este viaje',
          label: 'Contactar soporte',
          description: 'Abre un chat con soporte para reportar problemas con el cliente, pagos o la app.',
        },
    },    
           earnings: {
          labels: {
            currency: 'C${{amount}}',
            percent: '{{value}}',
          },
          header: {
            title: 'Ganancias',
          },
          section: {
            balance: 'Saldo',
            stats: 'Estadísticas',
            rides: 'Historial de viajes',
          },
          period: {
            today: 'Hoy',
            week: 'Semana',
            month: 'Mes',
          },
          summary: {
            totalGross: 'Total bruto',
            commission: 'Comisión',
            net: 'Neto',
          },
          nav: {
            commissions: 'Recargar fondos',
            history: 'Historial',
          },
          commission: {
            title: '💰 Detalle de comisiones',
            cashLabel: 'Efectivo',
            cardLabel: 'Tarjeta/Banco',
            normalTrips: '{{count}} viajes regulares ({{rate}})',
            designatedTrips: '{{count}} viajes designados ({{rate}})',
            subtotalCash: 'Subtotal efectivo:',
            subtotalCard: 'Subtotal tarjeta/banco:',
            totalLabel: 'Total comisiones:',
          },
          stats: {
            ridesToday: 'Viajes hoy',
            totalRides: 'Viajes históricos',
            totalTime: 'Tiempo total',
            avgEarnings: 'Tarifa promedio',
            totalNet: 'Total histórico',
            totalDistance: 'Distancia total',
            minutes: '{{value}} min',
            kilometers: '{{value}} km',
            placeholder: '--',
          },
          rides: {
            title: 'Historial de viajes',
            empty: 'No hay viajes en este periodo',
            status: {
              paid: 'Pagado',
              pending: 'Pendiente',
            },
            origin: '📍 {{value}}',
            destination: '{{value}}',
            distance: '{{value}} km',
            duration: '{{value}} min',
            fare: 'Tarifa:',
            commission: 'Comisión:',
            net: 'Tus ganancias:',
            unknownLocation: 'Ubicación desconocida',
          },
        },
        rechargeFunds: {
          header: {
            title: 'Recargar fondos',
          },
          loading: 'Cargando resumen...',
          summary: {
            title: 'Resumen de billetera',
            currentBalanceLabel: 'Saldo disponible',
            totalRechargedLabel: 'Total recargado',
            totalDeductedLabel: 'Total deducido',
            hint: 'Mantén tu saldo por encima de C$0.00 para seguir aceptando viajes.',
          },
          methods: {
            title: 'Elige cómo recargar',
            cardTitle: 'Tarjeta guardada',
            cardDescription: 'Usa una de tus tarjetas guardadas para registrar la recarga.',
            cardEmpty: 'Aún no tienes tarjetas guardadas. Agrega una para recargar con tarjeta.',
            cardManageLink: 'Ir a métodos de pago →',
            bankTitle: 'Transferencia bancaria',
            bankDescription: 'Registra una recarga por transferencia bancaria con su referencia.',
          },
          info: {
            title: 'Método de recarga',
          },
          input: {
            amountLabel: 'Monto a recargar',
            amountPlaceholder: 'Ej. 150',
            referenceLabel: 'Referencia de la transferencia (opcional)',
            placeholder: 'Ej. #FT-12345678',
          },
          button: {
            pay: 'Recargar {{amount}}',
          },
          alerts: {
            invalidAmountTitle: 'Monto inválido',
            invalidAmountMessage: 'Ingresa un monto válido mayor a cero.',
            selectCardTitle: 'Selecciona una tarjeta',
            selectCardMessage: 'Elige una tarjeta para recargar con tarjeta.',
            biometricPrompt: 'Confirma tu identidad para recargar {{amount}}',
            biometricErrorTitle: 'Error',
            biometricErrorMessage: 'No pudimos confirmar tu identidad. Intenta de nuevo.',
            paymentSuccessTitle: 'Recarga registrada',
            paymentSuccessMessage: 'Se registró una recarga de {{amount}}. Nuevo saldo: {{balance}}.',
            paymentSuccessButton: 'OK',
            paymentErrorTitle: 'Error',
            paymentErrorMessage: 'No pudimos registrar la recarga.',
          },
          cards: {
            defaultBadge: ' (Predeterminada)',
          },
          navigation: {
            goToPaymentMethods: 'Ir a métodos de pago →',
          },
          support: {
            title: 'Ayuda con mi billetera',
            label: '¿Problemas para recargar fondos?',
            description: 'Abre un chat con soporte para revisar recargas, referencias o tarjetas guardadas.',
          },
          history: {
            title: 'Historial de recargas',
            totalLabel: '{{count}} total',
            empty: 'Aún no hay recargas.',
            sourceLabel: 'Origen: {{source}}',
            defaultSource: 'manual',
            defaultStatus: 'confirmada',
            previous: 'Anterior',
            next: 'Siguiente',
            page: 'Página {{current}}/{{total}}',
          },
          invoice: {
            title: 'Comprobante de recarga',
            close: 'Cerrar',
            empty: 'No hay movimiento seleccionado',
            amount: 'Monto',
            fields: {
              movementId: 'ID del movimiento',
              driverId: 'ID del conductor',
              createdAt: 'Fecha de creación',
              type: 'Tipo',
              source: 'Origen',
              balanceBefore: 'Saldo anterior',
              balanceAfter: 'Saldo posterior',
              rideId: 'ID del viaje',
              externalReference: 'Referencia externa',
              externalTransaction: 'Transacción externa',
              metadata: 'Metadatos',
            },
          },
        },
        paymentConfirmation: {
          loading: 'Cargando información del pago...',
          header: {
            cashTitle: 'Pago en efectivo',
            cardTitle: 'Pago con tarjeta',
            cashSubtitle: '{{name}} debe pagar en efectivo',
            cardSubtitle: '{{name}} debe pagar con tarjeta',
          },
          breakdown: {
            title: 'Desglose del pago',
            fare: 'Tarifa del viaje',
            tip: 'Propina',
            total: 'Total a recibir',
            methodLabel: 'Método:',
            methodCash: 'Efectivo',
            methodCard: 'Tarjeta',
          },
          cashStatus: {
            confirmedTitle: 'El cliente confirmó el pago',
            confirmedSubtitle: 'Puedes confirmar que recibiste el efectivo',
            waitingTitle: 'Esperando confirmación del cliente',
            waitingSubtitle: 'El cliente debe confirmar el pago en efectivo primero.',
          },
          instructions: {
            title: 'Instrucciones',
            text:
              '1. Espera a que el cliente confirme el pago\n2. Verifica que te entregue el monto exacto\n3. Cuenta el efectivo con cuidado\n4. Confirma solo si recibiste el monto total',
          },
          cardStatus: {
            processing: 'Procesando pago con tarjeta...',
            pending: 'Esperando confirmación...',
            verifying: 'Verificando pago...',
            description: 'El pago se confirmará automáticamente cuando el cliente finalice el proceso.',
            infoMessage: 'No cierres esta pantalla. Te avisaremos cuando el pago se confirme.',
          },
          buttons: {
            confirmCash: 'Confirmar – Recibí el pago',
            switchToCard: 'Cambiar a tarjeta',
            switchToCash: 'Cambiar a efectivo',
            reportIssue: 'Reportar un problema',
            generateCode: 'Generar código de confirmación',
          },
          methodBadge: {
            label: 'Método: {{value}}',
            cash: 'Efectivo',
            card: 'Tarjeta',
          },
          switchDisabled: {
            title: 'No se puede cambiar el método de pago',
            subtitle: 'El cliente ya confirmó el pago',
          },
          codeLabel: 'Código de confirmación: {{code}}',
          support: {
            title: 'Ayuda con la confirmación de pago',
            label: '¿Problemas con este cobro?',
            description: 'Abre un chat con soporte para aclarar cobros, códigos o cambios de método.',
          },
          alerts: {
            waitTitle: 'Espera',
            waitMessage: 'El cliente debe confirmar primero el pago en efectivo.',
            cardRequiredTitle: 'Tarjeta requerida',
            cardRequiredMessage:
              'Para recibir pagos con tarjeta debes registrar al menos una tarjeta bancaria. Puedes agregarla en Métodos de pago.',
            cardRequiredAction: 'Ir a métodos de pago',
            paymentCompletedTitle: '¡Pago completado!',
            paymentCompletedMessage: 'El pago se confirmó correctamente.',
            cashConfirmedTitle: '¡Pago confirmado!',
            cashConfirmedMessage: 'El pago en efectivo fue confirmado por ambas partes.',
            methodChangeTitle: 'Cambiar a {{method}}',
            methodChangeMessage: '¿Quieres cambiar el método de pago a {{methodLower}}?',
            methodChangeSuccessTitle: 'Método actualizado',
            methodChangeSuccessMessage: 'El método de pago cambió a {{methodLower}}. El cliente será notificado.',
            cancelSuccessTitle: 'Pago cancelado',
            cancelSuccessMessage: 'Se reportó el problema. Soporte revisará el caso.',
            genericError: 'No pudimos completar la acción. Intenta de nuevo.',
            reportTitle: 'Reportar un problema',
            reportMessage: '¿Qué pasó con el pago?',
            reportOptions: {
              noPay: 'El cliente no pagó',
              wrongAmount: 'Monto incorrecto',
              cardIssue: 'Problema con la tarjeta',
              other: 'Otro problema',
              cancel: 'Cancelar',
            },
            codeRequiredTitle: 'Código requerido',
            codeRequiredMessage: 'Debes ingresar el código del cliente correctamente antes de confirmar.',
            codeSuccessTitle: 'Código verificado',
            codeSuccessMessage: 'El código es correcto. Ya puedes confirmar el pago.',
            codeErrorMessage: 'Código incorrecto',
          },
          methodNames: {
            cash: 'Efectivo',
            card: 'Tarjeta',
            cashLower: 'efectivo',
            cardLower: 'tarjeta',
          },
        },
        confirmCashPayment: {
          loading: 'Verificando estado del pago...',
          header: {
            title: 'Confirmar pago en efectivo',
            subtitle: '{{name}} debe pagarte en efectivo',
          },
          breakdown: {
            title: 'Desglose del pago',
            fare: 'Tarifa del viaje',
            tip: 'Propina',
            total: 'Total a recibir',
          },
          status: {
            verifying: 'Verificando estado del pago...',
            confirmedTitle: 'El cliente confirmó el pago',
            confirmedSubtitle: 'Puedes confirmar que recibiste el efectivo',
            waitingTitle: 'Esperando confirmación del cliente',
            waitingSubtitle: 'El cliente debe confirmar el pago en efectivo primero.',
          },
          instructions: {
            title: '📋 Instrucciones',
            text:
              '1. Espera a que el cliente confirme el pago\n2. Verifica que te entregue el monto exacto\n3. Cuenta el efectivo con cuidado\n4. Confirma solo si recibiste el monto completo',
          },
          warning: {
            text: 'Si el cliente no paga o hay un problema, toca “Reportar un problema” antes de confirmar.',
          },
          buttons: {
            confirm: '✓ Confirmar – Recibí el pago',
            switchToCard: '💳 Cambiar a pago con tarjeta',
            report: '⚠️ Reportar un problema',
            useSms: 'Usar verificación por SMS',
            verifySms: 'Verificar código',
          },
          sms: {
            placeholder: 'Ingresa el código de 6 dígitos',
            attemptsWarning: 'Código incorrecto. Intentos restantes: {{attempts}}',
            tooManyAttempts: 'Demasiados intentos. Intenta en 5 minutos.',
            invalidLength: 'Ingresa el código de 6 dígitos',
            sentTitle: 'SMS enviado',
            sentMessage: 'Revisa tu teléfono para el código de verificación.',
          },
          alerts: {
            waitTitle: 'Espera',
            waitMessage: 'El cliente debe confirmar el pago en efectivo primero.',
            biometricPrompt: 'Autentícate para confirmar el pago de C${{amount}}',
            biometricErrorTitle: 'Autenticación fallida',
            biometricErrorMessage: 'No pudimos verificar tu identidad. Intenta de nuevo.',
            successTitle: '¡Pago confirmado!',
            successMessage: 'El pago en efectivo se confirmó correctamente.',
            reportTitle: 'Reportar un problema',
            reportMessage: '¿Qué ocurrió con el pago?',
            reportOptions: {
              noPay: 'El cliente no pagó',
              wrongAmount: 'Monto incorrecto',
              other: 'Otro problema',
              cancel: 'Cancelar',
            },
            reportSuccessTitle: 'Pago cancelado',
            reportSuccessMessage: 'Se reportó el problema. Soporte revisará el caso.',
            switchTitle: 'Cambiar a pago con tarjeta',
            switchMessage: '¿El cliente no tiene efectivo? Puedes cambiar el método a tarjeta.',
            switchSuccessTitle: 'Método actualizado',
            switchSuccessMessage: 'El método de pago cambió a tarjeta. El cliente será notificado.',
            genericError: 'No pudimos completar la acción. Intenta de nuevo.',
            smsError: 'No pudimos enviar el código SMS.',
            smsVerifyError: 'No pudimos verificar el código.',
          },
        },
        documentInspection: {
          header: {
            title: 'Documentos del conductor',
            subtitle:
              'Completa la información de tu licencia y sube las fotos frontal y trasera.',
          },
          licenseSection: {
            title: 'Información de la licencia',
            numberLabel: 'Número de licencia *',
            numberPlaceholder: 'Ej: B21332434',
            expiryLabel: 'Fecha de vencimiento (YYYY-MM-DD) *',
            expiryPlaceholder: 'Ej: 2030-02-12',
          },
          photosSection: {
            title: 'Fotos de la licencia',
            frontTitle: '1. Frente de la licencia',
            backTitle: '2. Reverso de la licencia',
            takePhoto: 'Tomar foto',
            retakePhoto: 'Repetir foto',
            chooseFromGallery: 'Galería',
          },
          notice: {
            text: '⚠️ Asegúrate de que las fotos sean claras y legibles. Nuestro equipo verificará estos documentos.',
          },
          loading: {
            uploading: 'Subiendo documentos... {{progress}}%',
          },
          verified: {
            title: 'Documentos verificados ✅',
            subtitle: 'Si necesitas actualizar tu información, contacta soporte.',
          },
          buttons: {
            save: 'Guardar documentos',
            missingData: 'Completa todos los datos y fotos',
          },
          alerts: {
            permissionTitle: 'Permiso requerido',
            permissionMessage: 'Necesitamos acceso a la cámara para tomar fotos de tus documentos.',
            galleryPermissionMessage:
              'Necesitamos acceso a tu galería para seleccionar las fotos de tus documentos.',
            cameraErrorTitle: 'Error',
            cameraErrorMessage: 'No pudimos tomar la foto.',
            galleryErrorMessage: 'No pudimos seleccionar la foto.',
            missingDataTitle: 'Error',
            missingDataMessage: 'Completa todos los campos y fotos para continuar.',
            successTitle: 'Éxito',
            successMessage: 'Documentos del conductor actualizados correctamente.',
            successButton: 'OK',
            uploadErrorTitle: 'Error',
            uploadErrorMessage: 'No pudimos subir los documentos. Intenta nuevamente.',
          },
        },
        driverPendingApproval: {
          header: {
            pendingTitle: 'Tu cuenta está en revisión',
            suspendedTitle: 'Cuenta suspendida',
            rejectedTitle: 'Cuenta rechazada',
            pendingDescription:
              'Estamos verificando tus documentos y vehículo. Este proceso puede tardar entre 24 y 48 horas.',
            blockedDescription:
              'Tu cuenta no puede usarse en este momento. Contacta soporte para revisar tu caso.',
          },
          status: {
            accountLabel: 'Estado de la cuenta',
            documentsLabel: 'Documentos',
            vehicleLabel: 'Vehículos',
            accountValues: {
              active: 'Activa',
              pending: 'Pendiente',
              suspended: 'Suspendida',
              rejected: 'Rechazada',
            },
            documentsValues: {
              verified: 'Verificados',
              pending: 'Pendientes',
              suspended: 'Suspendidos',
              rejected: 'Rechazados',
            },
            vehicleValues: {
              active: 'Al menos un vehículo activo',
              none: 'Sin vehículo aprobado activo',
            },
          },
          supportBasic: {
            title: 'Necesitas asistencia de soporte',
            description: 'Contacta a nuestro equipo para revisar el estado de tu cuenta y documentos.',
            button: 'Llamar a soporte',
          },
          info: {
            text: 'Te avisaremos cuando tu cuenta esté lista para recibir viajes.',
          },
          buttons: {
            refresh: 'Recargar para actualizar',
            viewProfile: 'Ver mi perfil',
            logout: 'Cerrar sesión',
          },
          support: {
            title: 'Ayuda con la aprobación de mi cuenta',
            label: '¿Necesitas ayuda con tu verificación?',
            description: 'Chatea con soporte para acelerar la revisión de documentos o resolver bloqueos.',
            supportChatTitle: 'Ayuda con la aprobación de mi cuenta',
            supportChatLabel: '¿Necesitas ayuda con tu verificación?',
            supportChatDescription: 'Chatea con soporte para acelerar la revisión de documentos o resolver bloqueos.',
          },
        },
        vehicleInspection: {
          header: {
            title: 'Inspección del vehículo',
            subtitle:
              'Antes de iniciar el viaje con {{name}}, documenta el estado actual del vehículo con las fotos requeridas.',
            clientFallback: 'el cliente',
          },
          steps: {
            frontTitle: '1. Foto frontal del vehículo',
            rearTitle: '2. Foto trasera del vehículo',
            interiorFrontTitle: '3. Foto interior frontal',
            interiorRearTitle: '4. Foto interior trasera',
            takePhoto: 'Tomar foto',
            retakePhoto: 'Repetir foto',
          },
          notice: {
            text:
              '⚠️ Estas fotos documentan el estado del vehículo antes del viaje y protegen tanto al cliente como al conductor.',
          },
          loading: {
            uploading: 'Subiendo fotos... {{progress}}%',
          },
          buttons: {
            complete: 'Finalizar inspección e iniciar viaje',
            incomplete: 'Completa todas las fotos para continuar',
          },
          alerts: {
            permissionTitle: 'Permisos requeridos',
            permissionMessage: 'Necesitamos acceso a la cámara para tomar las fotos del vehículo.',
            cameraErrorTitle: 'Error',
            cameraErrorMessage: 'No pudimos tomar la foto.',
            missingDataTitle: 'Error',
            missingDataMessage: 'Faltan fotos o datos requeridos para continuar.',
            successTitle: 'Éxito',
            successMessage: 'Inspección del vehículo completa. Ya puedes iniciar el viaje.',
            successButton: 'Iniciar viaje',
            uploadErrorTitle: 'Error',
            uploadErrorMessage: 'No pudimos subir las fotos. Intenta nuevamente.',
          },
        },
        VehicleVerificationScreen: {
          header: {
            title: 'Verificación del vehículo',
            subtitle: 'Completa la información y sube las fotos de tu vehículo para poder tomar viajes.',
          },
          form: {
            title: 'Información de circulación',
            registrationNumberLabel: 'Número de circulación *',
            registrationNumberPlaceholder: 'Ej: B2301230',
            registrationExpiryLabel: 'Vencimiento de la circulación (YYYY-MM-DD) *',
            registrationExpiryPlaceholder: 'Ej: 2029-02-14',
            insuranceNumberLabel: 'Número de póliza *',
            insuranceNumberPlaceholder: 'Ej: RCO30201102',
            insuranceCompanyLabel: 'Compañía de seguro *',
            insuranceCompanyPlaceholder: 'Selecciona tu aseguradora',
            insuranceExpiryLabel: 'Vencimiento del seguro (YYYY-MM-DD) *',
            insuranceExpiryPlaceholder: 'Ej: 2030-02-12',
          },
          photos: {
            title: 'Fotos del vehículo',
            vehicleTitle: '1. Foto general del vehículo',
            registrationFrontTitle: '2. Circulación – frente',
            registrationBackTitle: '3. Circulación – reverso',
            insuranceTitle: '4. Foto de la póliza de seguro',
            takePhoto: 'Tomar foto',
            retakePhoto: 'Repetir foto',
            chooseFromGallery: 'Galería',
          },
          notice: {
            text: '⚠️ Asegúrate de que cada foto sea clara y legible. Nuestro equipo revisará estos documentos.',
          },
          loading: {
            verifying: 'Verificando vehículo... {{progress}}%',
          },
          buttons: {
            submit: 'Verificar vehículo',
            incomplete: 'Completa toda la información y fotos',
          },
          alerts: {
            permissionTitle: 'Permisos requeridos',
            permissionMessage: 'Necesitamos acceso a la cámara para tomar fotos de tu vehículo.',
            galleryPermissionMessage:
              'Necesitamos acceso a tu galería para seleccionar las fotos de tu vehículo.',
            cameraErrorTitle: 'Error',
            cameraErrorMessage: 'No pudimos tomar la foto.',
            galleryErrorMessage: 'No pudimos seleccionar la foto.',
            missingDataTitle: 'Error',
            missingDataMessage: 'Faltan fotos o datos requeridos para continuar.',
            partialDocsMessage: 'Estos documentos necesitan ambas fechas para registrarse:',
            successTitle: 'Éxito',
            successMessage: 'Vehículo verificado correctamente. Ya puedes tomar viajes.',
            successButton: 'OK',
            uploadErrorTitle: 'Error',
            uploadErrorMessage: 'No pudimos subir la información. Intenta nuevamente.',
          },
        },
        WaitingClientConfirmation: {
          pending: {
            title: 'Esperando confirmación',
            subtitle: 'El cliente está revisando tu oferta',
            statusBadge: 'Oferta enviada al cliente',
            expiresLabel: 'Tu oferta expira en',
            tripDetails: 'Detalles del viaje',
            originLabel: 'Origen',
            destinationLabel: 'Destino final',
            stopLabel: 'Parada {{index}}',
            stopFallback: 'Parada adicional',
            fareLabel: 'Tarifa acordada',
          },
          tips: {
            title: 'Mientras esperas',
            tipVehicle: 'Mantén tu vehículo listo',
            tipGps: 'Verifica tu ubicación GPS',
            tipAlternateDriver: 'El cliente podría escoger a otro conductor',
          },
          buttons: {
            cancelOffer: 'Cancelar oferta',
          },
          accepted: {
            title: '¡El cliente te eligió!',
            subtitle: 'Preparando viaje...',
          },
          alerts: {
            rideCanceledTitle: 'Viaje cancelado',
            rideCanceledMessage: 'El cliente canceló el viaje.',
            rideMissingTitle: 'Viaje cancelado',
            rideMissingMessage: 'El cliente canceló la solicitud.',
            offerRejectedTitle: 'Oferta rechazada',
            offerRejectedMessage: 'El cliente eligió otro conductor. Puedes buscar más viajes.',
            offerRejectedMeTitle: 'Oferta rechazada',
            offerRejectedMeMessage: 'El cliente rechazó tu oferta. Puedes buscar más viajes.',
            cancelOfferTitle: 'Cancelar oferta',
            cancelOfferMessage:
              '¿Seguro que quieres cancelar tu oferta? El viaje quedará disponible para otros conductores.',
            cancelOfferNo: 'No',
            cancelOfferYes: 'Sí, cancelar',
            cancelErrorTitle: 'Error',
            cancelErrorMessage: 'No pudimos cancelar la oferta.',
            offerExpiredTitle: 'Oferta expirada',
            offerExpiredMessage:
              'El cliente no respondió a tiempo. Tu oferta fue retirada y el viaje quedó disponible para otros conductores.',
          },
        },
       },
       shared: {
          chat: {
            status: {
              online: 'En línea',
              offline: 'Desconectado',
              connecting: 'Conectando…',
            },
            quickMessages: [
              '👍 Ok',
              '⏱️ Llego en 5 min',
              '📍 Ya llegué',
              '🚗 En camino',
              '✅ Perfecto',
              '❓ ¿Dónde estás?',
            ],
            empty: {
              message: 'Inicia la conversación con {{name}}',
            },
            typing: '{{name}} está escribiendo...',
            dates: {
              today: 'Hoy',
              yesterday: 'Ayer',
            },
            scrollToBottom: 'Ir a los mensajes recientes',
            input: {
              placeholder: 'Escribe un mensaje...',
              send: 'Enviar mensaje',
            },
            alerts: {
              noPhoneTitle: 'Teléfono no disponible',
              noPhoneMessage: 'No hay un número de teléfono asociado a este contacto.',
              callTitle: 'Llamar',
              callMessage: '¿Quieres llamar a {{name}}?\n{{phone}}',
              cancel: 'Cancelar',
              callButton: 'Llamar',
              deviceErrorTitle: 'No se puede llamar',
              cannotCallDevice: 'Tu dispositivo no puede realizar esta llamada.',
              callFailedTitle: 'Llamada fallida',
              callFailedMessage: 'No pudimos iniciar la llamada. Intenta de nuevo.',
            },
          },
          rating: {
            header: {
              titleDriver: '¿Cómo fue tu pasajero?',
              titleClient: '¿Cómo fue tu viaje?',
              subtitle: 'Tu opinión nos ayuda a mejorar el servicio',
            },
            ratingText: {
              five: '¡Excelente! 🎉',
              four: 'Muy bueno 👍',
              three: 'Bueno 👌',
              two: 'Regular 😐',
              one: 'Malo 😞',
            },
            sections: {
              quickComments: 'Comentarios rápidos:',
              categories: 'Califica por categorías:',
              additionalComment: 'Comentario adicional (opcional):',
            },
            categories: {
              punctuality: {
                driver: 'Puntualidad del pasajero',
                client: 'Puntualidad del conductor',
              },
              cleanliness: {
                driver: 'Limpieza y orden',
                client: 'Limpieza del vehículo',
              },
              communication: {
                driver: 'Comunicación',
                client: 'Comunicación',
              },
              driving: {
                driver: 'Respeto durante el viaje',
                client: 'Conducción',
              },
              safety: {
                driver: 'Seguridad',
                client: 'Seguridad',
              },
              friendliness: {
                driver: 'Amabilidad',
                client: 'Amabilidad',
              },
            },
            quickComments: {
              driver: [
                'Excelente pasajero',
                'Muy puntual',
                'Amable y respetuoso',
                'Buen trato',
              ],
              client: [
                'Excelente conductor',
                'Muy profesional',
                'Manejo seguro',
                'Vehículo limpio',
                'Llegó a tiempo',
              ],
            },
            input: {
              commentPlaceholder: 'Escribe tu experiencia...',
            },
            buttons: {
              submit: 'Enviar calificación',
              skip: 'Omitir por ahora',
            },
            alerts: {
              missingRating: 'Por favor selecciona una calificación',
              successTitle: '¡Gracias!',
              successMessage: 'Tu calificación ha sido enviada exitosamente',
              submitError: 'No se pudo enviar la calificación',
            },
          },
          rideTracking: {
            loading: {
              connectingDriver: 'Conectando con el conductor...',
              fetchingRoute: 'Actualizando ruta...',
              syncingRide: 'Sincronizando estado del viaje...',
            },
            alerts: {
              cannotCancelTitle: 'No se puede cancelar',
              cannotCancelMessage: 'Este viaje no puede cancelarse en este momento.',
              cancelRideTitle: 'Cancelar viaje',
              cancelRideMessage: '¿Seguro que quieres cancelar este viaje?',
              cancelRideReason: 'Cancelado por el cliente',
              cancelRideSuccessTitle: 'Viaje cancelado',
              cancelRideSuccessMessage: 'Tu viaje fue cancelado.',
              cancelRideError: 'No pudimos cancelar el viaje.',
              rideCanceledTitle: 'Viaje cancelado',
              rideCanceledByDriver: 'El conductor canceló este viaje.',
              rideUnavailable: 'Este viaje ya no está disponible.',
            },
            status: {
              accepted: 'Conductor en camino',
              driver_on_route: 'Conductor en camino',
              driver_arrived: 'Conductor llegó',
              in_progress: 'En viaje',
              pending_payment: 'Pago pendiente',
              completed: 'Completado',
              canceled: 'Cancelado',
              default: 'Estado',
            },
            eta: {
              pendingPayment: 'Viaje finalizado — pago pendiente',
              completed: 'Viaje completado',
              canceled: 'Viaje cancelado',
              arrivesAt: 'Llega a las {{time}}',
              driverOnTheWay: 'Conductor en camino',
              calculating: 'Calculando...',
              tripData: 'Datos del viaje: {{summary}}',
            },
            labels: {
              tripSummary: '{{duration}} · {{distance}}',
              distanceValue: '{{value}} km',
              distanceFallback: '-- km',
              durationValue: '{{value}} min',
              durationFallback: '-- min',
              driverUnknown: 'Conductor',
              driverInitialFallback: 'C',
              vehiclePlateFallback: 'N/D',
              pickupLabel: 'Recogida',
              pickupFallback: 'Mi ubicación',
              stopLabel: 'Parada {{index}}',
              destinationLabel: 'Destino final',
              destinationFallback: 'Destino',
              routeOriginFallback: 'Origen',
              routeDestinationFallback: 'Destino',
              shareTitle: 'Compartir viaje',
              shareMessage:
                'Voy en un viaje con {{driver}} ({{vehicleBrand}} {{vehicleModel}} - {{vehicleColor}}) - Placa: {{plate}}\nRecogida: {{pickup}}\nSigue mi viaje en vivo: {{url}}',
              shareError: 'No se pudo compartir la ubicación del viaje.',
              paymentCash: 'Efectivo',
              paymentCard: 'Tarjeta',
            },
            accessibility: {
              openChat: 'Abrir chat con el conductor',
              expandPanel: 'Ver detalles del viaje',
              collapsePanel: 'Ocultar detalles del viaje',
            },
           support: {
            title: 'Ayuda con mi viaje en curso',
            label: '¿Necesitas ayuda con este viaje?',
            description: 'Abre el chat con soporte para reportar cualquier problema en tu viaje.',
          },
          designatedNotice: {
            title: 'Antes de iniciar el viaje',
            body: 'El conductor tomará fotos del seguro, la circulación y los cuatro asientos, y confirmará que ambos documentos están vigentes antes de iniciar.',
            dismiss: 'Cerrar aviso',
          },
            buttons: {
              goToPayment: 'Ir al pago',
              shareLocation: 'Compartir ubicación',
              cancel: 'Cancelar viaje',
              continue: 'Continuar viaje',
              confirmCancel: 'Cancelar viaje',
            },
          },
          notifications: {
            channels: {
              default: 'Viajes cercanos',
              activeRide: 'Viaje activo',
            },
            quickReturn: {
              title: 'Viaje activo',
              body: 'Toca para volver al viaje',
            },
            formats: {
              priceCordoba: 'C${{amount}}',
              distanceKm: '{{value}} km',
            },
            newRide: {
              title: '🚗 Nuevo viaje disponible',
              body: '{{distance}} • {{price}} • {{origin}}',
              originFallback: 'Ubicación seleccionada',
            },
            rideAccepted: {
              title: '✅ Viaje aceptado',
              body: 'El conductor {{driverName}} aceptó tu viaje',
              driverFallback: 'Conductor',
            },
            rideStarted: {
              title: '🚗 Viaje iniciado',
              body: 'Tu conductor comenzó el viaje',
            },
            rideCompleted: {
              title: '✅ Viaje completado',
              body: 'Viaje finalizado. ¡Califica tu experiencia!',
            },
            rideCanceled: {
              title: 'Viaje cancelado',
              body: 'El viaje fue cancelado.',
            },
            generic: {
              defaultTitle: 'Nueva notificación',
              defaultBody: 'Tienes una nueva notificación.',
            },
            live: {
              statuses: {
                driver_assigned: {
                  title: 'Conductor confirmado',
                  subtitle: 'Estamos preparando tu viaje',
                },
                driver_on_route: {
                  title: 'Conductor en camino',
                  subtitle: 'Dirigiéndose a tu punto de recogida',
                },
                arrived_pickup: {
                  title: 'Conductor llegó',
                  subtitle: 'Encuéntralo en el punto de recogida',
                },
                trip_in_progress: {
                  title: 'Viaje en progreso',
                  subtitle: 'Rumbo a tu destino',
                },
                completed: {
                  title: 'Viaje completado',
                  subtitle: 'Revisa y califica tu experiencia',
                },
                canceled: {
                  title: 'Viaje cancelado',
                  subtitle: 'La solicitud fue cancelada',
                },
              },
              metrics: {
                minutes: '{{count}} min',
                etaLabel: 'ETA {{value}}',
                distance: '{{value}} km',
              },
            },
          },
          backgroundTracking: {
            foregroundService: {
              title: 'Seguimiento de ubicación activo',
              body: 'Tu ubicación se está compartiendo',
            },
            driver: {
              title: 'Conductor disponible',
              body: 'Compartiendo tu ubicación para recibir viajes cercanos.',
            },
            client: {
              title: 'Viaje en monitoreo',
              body: 'Tu viaje sigue activo y estamos monitoreando tu ubicación.',
            },
          },
         auth: {
          errors: {
            notAuthenticated: 'Usuario no autenticado.',
            emailRequired: 'El correo es obligatorio.',
            passwordMin: 'La contraseña debe tener al menos 6 caracteres.',
            phoneFormatInvalidExample: 'Formato de teléfono inválido. Usa {{example}}.',
            phoneFormatInvalidInternational:
              'Formato de teléfono inválido. Usa un número internacional (+código de país y número).',
            verificationStartFailed: 'No pudimos iniciar la verificación. Intenta nuevamente.',
            verificationMissing: 'No encontramos una verificación activa. Solicita un nuevo código.',
            verificationNotFound: 'No encontramos una solicitud de verificación activa. Solicita un nuevo código.',
            codeSixDigits: 'El código debe tener 6 dígitos.',
            codeInvalid: 'El código ingresado no es válido. Revisa el SMS e intenta de nuevo.',
            codeMismatch: 'El código no coincide con el SMS. Revísalo e intenta de nuevo.',
            codeExpired: 'El código expiró. Toca “Reenviar código” para obtener uno nuevo.',
            tooManyAttempts: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.',
            networkIssue:
              'No pudimos completar la solicitud por un problema de red. Revisa tu conexión e intenta nuevamente.',
            smsSendGeneric: 'No pudimos enviar el código SMS. Intenta nuevamente.',
            smsInvalidPhone: 'El número no es válido. Usa el formato internacional (+código y número).',
            smsTooManyRequests: 'Solicitaste demasiados códigos en poco tiempo. Espera antes de intentar otra vez.',
            smsQuotaExceeded: 'Se alcanzó la cuota de SMS por ahora. Intenta más tarde.',
            smsNetworkError: 'No pudimos conectarnos para enviar el SMS. Revisa tu conexión e intenta otra vez.',
            confirmGenericFailure: 'No pudimos confirmar el código. Intenta nuevamente.',
          },
         support: {
          supportPendingTitle: 'Tengo dudas sobre mis pagos pendientes',
          supportTitle: 'Ayudame con el pago de mi viaje',
          supportLabel: '¿Necesitas ayuda con este pago?',
          supportDescription: 'Abre el chat para resolver cualquier problema con nuestro soporte',
        },
        },
        searchRide: {
          defaults: {
            locationFallback: 'Ubicación seleccionada',
            origin: 'Punto de origen',
            destination: 'Destino',
            currentLocation: 'Ubicación actual',
            myLocation: 'Mi ubicación',
            serviceFallback: 'Servicio',
          },
          alerts: {
            unavailableZoneTitle: 'Servicio temporalmente no disponible',
            unavailableZoneMessage: 'Esta ubicación está fuera de nuestra cobertura.',
            selectValidPointTitle: 'Selecciona un punto válido',
            selectValidPointMessage: 'Debes elegir una ubicación exacta.',
            selectValidOriginMessage: 'Debes elegir el punto de origen exacto.',
            selectValidDestinationMessage: 'Debes elegir el destino exacto.',
            selectValidStopMessage: 'Debes elegir la ubicación exacta de la parada.',
            destinationPromptTitle: 'Selecciona tu destino',
            destinationPromptMessage: 'Ahora puedes elegir tu destino final buscando o usando el mapa.',
            vehiclePhotoRequired: 'Debes proporcionar una foto de tu vehículo para solicitar un conductor designado.',
            vehiclePhotoUploadError: 'Falló la carga de la foto del vehículo. Intenta de nuevo.',
            vehiclePhotoProcessTitle: 'Procesando foto',
            vehiclePhotoProcess: 'Estamos procesando tu foto. Espera antes de confirmar.',
            loginRequired: 'Inicia sesión para solicitar un viaje.',
            photoLoginRequired: 'Inicia sesión para subir la foto de tu vehículo.',
            destinationRequired: 'Toca el mapa para seleccionar tu destino.',
            invalidAmount: 'Ingresa un monto válido.',
            priceCalculationFailed: 'No pudimos calcular la ruta.',
            locationUnavailableTitle: 'Ubicación no disponible',
            locationUnavailableMessage: 'Activa tu ubicación o intenta más tarde.',
            serviceValidationFailed: 'No pudimos validar la zona seleccionada. Revisa tu conexión e intenta nuevamente.',
            photoPermissionsTitle: 'Necesitamos permisos',
            photoPermissionsMessage: 'Se requiere acceso a la cámara.',
            photoOptionsTitle: 'Foto del vehículo',
            photoOptionsMessage: 'Elige una opción',
            photoOptionsCamera: 'Tomar foto',
            photoOptionsGallery: 'Galería',
            photoOptionsCancel: 'Cancelar',
            photoSelectedTitle: 'Foto seleccionada',
            photoSelectedMessage: 'Se subirá cuando confirmes tu viaje.',
            photoUploadedTitle: 'Foto subida',
            photoUploadedMessage: 'Tu vehículo ha sido registrado.',
            photoUploadFailed: 'Falló la carga de la foto del vehículo. Intenta de nuevo.',
            photoCaptureFailed: 'No pudimos tomar la foto. Intenta nuevamente.',
            locationFetchFailed: 'No pudimos obtener la ubicación seleccionada. Prueba otra búsqueda.',
            biometricRequiredTitle: 'Se requiere huella',
            biometricRequiredMessage: 'Esta función requiere autenticación con huella.',
            biometricUnavailableTitle: 'Biometría no disponible',
            biometricUnavailableMessage:
              'Tu dispositivo no tiene biometría configurada. Continuaremos con un registro manual.',
            biometricGenericError: 'Falló la verificación de huella. Intenta de nuevo.',
            identityRequired: 'Debes confirmar tu identidad con tu huella.',
            biometricFallbackLabel: 'Ingresar código',
            requestError: 'No pudimos enviar tu solicitud de viaje.',
            motoSelectedTitle: 'Motocicleta seleccionada',
            designatedDriverMotoTitle: 'Conductor designado en motocicleta',
            singlePassengerMessage: 'Las motocicletas solo admiten 1 pasajero.',
          },
          mapSelection: {
            defaultTitle: 'Selecciona una ubicación',
            originTitle: 'Configura el origen',
            originMessage: 'Mueve el mapa a tu punto de partida.',
            destinationTitle: 'Selecciona tu destino',
            destinationMessage: 'Mueve el mapa a tu destino final.',
            newStopTitle: 'Nueva parada',
            newStopMessage: 'Toca el mapa para agregar la parada {{index}}.',
            editStopTitle: 'Editar parada',
            editStopMessage: 'Toca el mapa para actualizar la parada {{index}}.',
          },
          labels: {
            selectingLocation: 'Selecciona una ubicación',
            setOrigin: 'Definir origen',
            setDestination: 'Elegir destino',
            newStop: 'Nueva parada',
            editStop: 'Editar parada {{index}}',
            extraStopHint: 'Toca el mapa para agregar la parada {{index}}.',
            selectOrigin: 'Elige tu origen exacto.',
            selectDestination: 'Elige tu destino exacto.',
            selectStop: 'Elige la ubicación exacta de la parada.',
            searchPlaceholder: 'Buscar lugares',
            useCurrentLocation: 'Usar ubicación actual',
            favorites: 'Favoritos',
            recent: 'Recientes',
            noResults: 'Sin coincidencias.',
            searching: 'Buscando...',
            passengers: 'Pasajeros',
            passengersCount_one: '{{count}} pasajero',
            passengersCount_other: '{{count}} pasajeros',
            paymentMethod: 'Método de pago',
            priceSuggestion: 'Precio sugerido',
            pricePlaceholder: 'C$0.00',
            comment: 'Comentario',
            commentPlaceholder: 'Detalles del viaje...',
            designatedDriverPhoto: 'Foto del vehículo',
            addVehiclePhoto: 'Agregar foto',
            changeVehiclePhoto: 'Cambiar foto',
            removeVehiclePhoto: 'Eliminar foto',
            confirmRequest: 'Confirmar solicitud',
            confirmRequestDisabled: 'Agrega destino y ruta',
            sendingRequest: 'Enviando solicitud…',
            driversAvailableTitle: 'Conductores disponibles',
            driversAvailableDescription: 'Encontramos conductores cerca',
            driversUnavailableTitle: 'No hay conductores cerca',
            driversUnavailableDescription: 'Te avisaremos cuando haya conductores disponibles.',
            searchingAddress: 'Buscando dirección…',
            originPlaceholder: 'Selecciona el origen',
            destinationPlaceholder: 'Selecciona el destino',
            stopLabel: 'Parada {{index}}',
            inlineAddStop: 'Agregar destino extra',
            calculating: 'Calculando…',
            priceApproximation: '~C${{value}}',
            etaValue: '~{{minutes}} min',
            etaUnavailable: 'Sin ETA',
            viewOptions: 'Ver opciones',
          },
          vehicle: {
            motoLabel: 'Motocicleta',
            motoSubtitle: 'Viajes ágiles y económicos',
            autoLabel: 'Auto',
            autoSubtitle: 'Viajes cómodos para hasta 4 personas',
            designatedLabel: 'Conductor designado',
            designatedSubtitle: 'Te llevamos en tu propio vehículo',
            recommendedBadge: 'Recomendado',
            recommendationLabel: 'Tarifa recomendada',
            modeLabel: 'Conductor designado para:',
            modeAuto: 'Auto',
            modeMoto: 'Motocicleta',
            designatedMotoShortNotice: 'La distancia es muy corta para solicitar este servicio en motocicleta.',
          },
          photo: {
            hint: 'Foto del vehículo (obligatoria para conductor designado):',
            buttonDefault: 'Tomar/Seleccionar foto',
            buttonChange: 'Cambiar foto',
            buttonProcessing: 'Procesando…',
          },
          notes: {
            designatedDriver: 'Conductor designado: el cliente solicita que conduzcas su vehículo.',
          },
          summary: {
            title: 'Resumen y precio',
            distance: 'Distancia',
            duration: 'Tiempo',
            estimate: 'Estimación',
            calculatingRoute: 'Calculando ruta…',
            featuresLabel: 'Ajustes aplicados',
            features: {
              night: 'Nocturno',
              designatedDriverMotoDiscount: 'Ajuste conductor designado moto',
            },
            surgeLabel: 'Tarifa dinámica',
            highDemand: 'Alta demanda',
          },
          payment: {
            cash: 'Efectivo',
            card: 'Tarjeta',
          },
          availability: {
            checking: 'Buscando conductores cercanos…',
            low: 'Pocos o ningún conductor cercano en este momento',
            ok: 'Conductores disponibles',
            unknown: 'Disponibilidad desconocida',
          },
          search: {
            selectionOriginTitle: 'Origen',
            selectionDestinationTitle: 'Destino final',
            selectionNewStopTitle: 'Nueva parada ({{current}}/{{max}})',
            selectionEditStopTitle: 'Editar parada {{index}}',
            selectionGenericTitle: 'Ubicación',
            descriptionOrigin: 'Escribe una dirección o usa tu ubicación actual.',
            descriptionDestination: 'Busca una dirección o selecciónala en el mapa.',
            descriptionExtra: 'Busca o coloca en el mapa la parada intermedia.',
            descriptionGeneric: 'Busca o selecciona una ubicación en el mapa.',
            inputLabel: 'Buscar ubicación',
            placeholderOrigin: 'Buscar origen…',
            placeholderDestination: 'Buscar destino…',
            placeholderDestinationReference: 'Ej: Conchita Palacios',
            placeholderStop: 'Buscar parada…',
            placeholderGeneric: 'Buscar ubicación…',
            close: 'Cerrar',
            useCurrentLocation: 'Usar mi ubicación',
            pickOnMap: 'Seleccionar en el mapa',
            destinationGuidanceTitle: '¿Destino por referencia?',
            destinationGuidanceBody:
              'Si escribes una referencia local, termina seleccionando un resultado o usando el mapa para fijar el punto exacto.',
            destinationGuidanceStep1: '1) Escribe un lugar exacto',
            destinationGuidanceStep2: '2) Fija punto exacto',
            destinationConfirmed: 'Destino confirmado en mapa',
            loading: 'Buscando ubicaciones…',
            error: 'No pudimos buscar ubicaciones.',
          },
          cta: {
            primary: 'Confirmar y solicitar viaje',
            primaryScheduled: 'Confirmar y agendar viaje',
            loading: 'Enviando solicitud…',
            submittingOverlay: 'Enviando tu solicitud…',
          },
          accessibility: {
            back: 'Regresar',
            addExtraStop: 'Agregar destino extra',
            payCash: 'Pagar en efectivo',
            payCard: 'Pagar con tarjeta',
            togglePanel: 'Mostrar u ocultar opciones del viaje',
          },
            scheduling: {
              openButton: 'Agendar viaje',
              clearButton: 'Limpiar',
              scheduledLabel: 'Agendalo {{date}}',
              successTitle: 'Viaje agendado',
              successMessage: 'Tu viaje esta agendado para {{date}}.',
              successMessageWithId: 'Tu viaje está agendado para {{date}}. ID del viaje: {{id}}',
              shareMessage: 'Agendé un viaje con Rundi para {{date}}. ID del viaje: {{id}}',
              successMessageWithCode: 'Tu viaje está agendado para {{date}}. Comparte este código con tu conductor: {{code}}',
              shareMessageWithCode: 'Agendé un viaje con Rundi para {{date}}. Ingresa el código {{code}} en la app para asignarte como mi conductor.',
              activeRideTitle: 'Ya tienes un viaje activo',
              activeRideBody: 'Solo puedes tener un viaje a la vez. ¿Quieres cancelar el viaje actual y solicitar uno nuevo?',
              activeRideCancelButton: 'Cancelar actual',
              activeRideKeepButton: 'Ver viaje actual',
              invalidRange: 'Escoge una hora entre 30 minutos y 10 días a partir de hoy.',
              modalTitle: 'Agendar viaje',
              dateLabel: 'Fecha',
              timeLabel: 'Hora',
              modalCancel: 'Cancelar',
              modalConfirm: 'Confirmar',
              conflictTitle: 'Ya tienes un viaje agendado',
              conflictBodyScheduled:
                'Ya tienes un viaje agendado para {{date}} que se cruza con este. Si continúas, cancelaremos el viaje agendado existente y crearemos este nuevo viaje agendado.',
              conflictBodyImmediate:
                'Ya tienes un viaje agendado para {{date}} que se cruza con esta solicitud. Si continúas, cancelaremos el viaje agendado existente y crearemos este nuevo viaje inmediato.',
              conflictReplaceButton: 'Reemplazar viaje anterior',
              conflictKeepButton: 'Mantener viaje actual',
            },
        },
        profile: {
          loading: {
            logout: 'Cerrando sesión...',
            vehicle: 'Cargando información del vehículo...',
          },
          messages: {
            noUser: 'No hay un usuario autenticado',
          },
          header: {
            title: 'Perfil',
            edit: 'Editar perfil',
            userId: 'ID de usuario: {{id}}',
            role: {
              client: 'Cliente',
              driver: 'Conductor',
            },
          },
          mode: {
            titleDriver: 'Modo de uso',
            titleClient: 'Conduce con Rundi',
            descriptionDriver: 'Cambia a la vista de conductor para recibir viajes.',
            descriptionClient: 'Regístrate como conductor y comienza a recibir viajes.',
            buttonDriver: 'Usar como conductor',
            buttonClient: 'Quiero conducir',
            switching: 'Cambiando...',
          },
          alerts: {
            buildTitle: 'Compila la app',
            buildMessage:
              'Las notificaciones push solo funcionan en un build de desarrollo o producción. Usa “npx expo run:android” o “npx expo run:ios”.',
            disableTitle: 'Desactivar notificaciones',
            disableMessage:
              'Para desactivar las notificaciones push, abre los ajustes del sistema y revoca los permisos de la app.',
            upgradeNotAvailableTitle: 'No disponible',
            upgradeNotAvailableMessage: 'Solo cuentas de cliente pueden iniciar el registro de conductor aquí.',
            smsErrorTitle: 'Error',
            smsErrorMessage: 'No pudimos enviar el código SMS. Intenta nuevamente.',
            driverModeBlockedTitle: 'No puedes usar el modo conductor',
            driverModeReasons: {
              accountInactive: '• Tu cuenta de conductor aún no está activa.',
              documentsPending: '• Tus documentos de conductor están pendientes o fueron rechazados.',
              vehicleMissing: '• No tienes un vehículo aprobado activo.',
            },
            driverModeFooter: 'Revisa tus documentos y vehículos para completar la aprobación.',
            driverModeError: 'No pudimos cambiar al modo conductor. Intenta nuevamente.',
            logoutTitle: 'Cerrar sesión',
            logoutMessage: '¿Seguro que quieres cerrar sesión?',
            logoutConfirm: 'Cerrar sesión',
            logoutCancel: 'Cancelar',
          },
          vehicle: {
            title: 'Información del vehículo',
            successTitle: 'Conductor verificado',
            successText: 'Tu información fue verificada. Ya puedes recibir viajes.',
            warningTitle: 'Información incompleta',
            warningText: 'Falta información importante del vehículo. Completa lo siguiente:',
            missingPhotoCar: '📷 Foto del vehículo (frontal)',
            missingPhotoMoto: '📷 Foto de la moto (lateral)',
            missingRegistration: '📄 Foto de la circulación',
            missingInsurance: '🛡️ Foto del seguro',
            completeButton: 'Completar ahora',
            emptyTitle: 'Sin información del vehículo',
            emptyText: 'No encontramos datos de tu vehículo. Regístralo para recibir viajes.',
            refresh: 'Actualizar',
            register: 'Registrar vehículo',
            infoLabels: {
              brand: 'Marca',
              model: 'Modelo',
              year: 'Año',
              color: 'Color',
              plate: 'Placa',
              type: 'Tipo',
            },
            typeLabels: {
              sedan: 'Sedán',
              suv: 'SUV',
              van: 'Van',
              moto: 'Motocicleta',
              other: '{{type}}',
            },
          },
          config: {
            title: 'Configuración',
            theme: 'Tema',
            notifications: 'Notificaciones push',
            traffic: 'Tráfico en el mapa',
            sounds: 'Sonidos de la app',
            advanced: 'Configuraciones avanzadas',
            rideHistory: 'Historial de viajes',
            payments: 'Métodos de pago',
            help: 'Ayuda',
            themeOptions: {
              light: 'Claro',
              dark: 'Oscuro',
              auto: 'Automático',
            },
          },
          buttons: {
            logout: 'Cerrar sesión',
          },
          appInfo: {
            version: 'Rundi Beta- 1.8',
            copyright: '© 2025 Todos los derechos reservados',
          },
         support: {
          title: 'Mis reportes de soporte',
         },
        },
        preflight: {
          title: 'Preparando tu experiencia',
          subtitle: {
            default: 'Estamos verificando que todo esté listo.',
            completed: '¡Todo listo! Redirigiendo…',
            error: 'Algo salió mal.',
          },
          checks: {
            starting: 'Iniciando verificaciones…',
            auth: 'Verificando sesión',
            driverBiometric: 'Verificación de identidad',
            notifications: 'Comprobando notificaciones',
            foregroundLocation: 'Verificando ubicación',
            backgroundLocation: 'Verificando ubicación en segundo plano',
            overlay: 'Revisando permisos de superposición',
            activity: 'Revisando permiso de actividad',
            region: 'Comprobando zona de servicio',
            pendingPayments: 'Buscando pagos pendientes',
            rechargeFunds: 'Verificando saldo de billetera',
            activeRide: 'Buscando viajes activos',
            generic: '{{check}}',
          },
          biometric: {
            prompt: 'Confirma tu identidad para continuar como conductor.',
            pinFallback: 'Usar PIN',
            error: 'No se pudo validar tu identidad.',
            maxAttempts: 'No se pudo validar identidad después de {{max}} intentos.',
            required: 'Necesitas validar identidad para continuar en modo conductor.',
            deviceSecurityRequired:
              'Configura un bloqueo de pantalla (PIN, patrón, contraseña, huella o Face ID) en los ajustes del dispositivo para continuar.',
            modal: {
              title: 'Verificación de identidad',
              scanning: 'Escaneando biometría…',
              pinFallback: 'Escaneo biométrico no disponible. Continúa con el PIN del dispositivo.',
              appleSignIn: 'Verificando tu identidad con Apple ID…',
              success: 'Identidad verificada correctamente.',
              retry: 'Falló la verificación. Reintentando…',
              attempt: 'Intento {{current}} de {{max}}',
            },
          },
          progress: {
            completedLabel: 'Verificación completada',
          },
          actionsSummary: {
            title: 'Acciones pendientes detectadas:',
            more: '+{{count}} más',
          },
          buttons: {
            retry: 'Reintentar',
            continueAsClient: 'Continuar como cliente',
            useAsClient: 'Usar como cliente',
          },
          alerts: {
            switchToClientError: 'No pudimos cambiar al modo cliente. Intenta nuevamente.',
            cannotContinueTitle: 'No puedes continuar',
            cannotContinueMessage: 'Completa las verificaciones necesarias antes de usar la app.',
            termsSaveError: 'No pudimos guardar tu aceptación de los términos. Revisa tu conexión e intenta nuevamente.',
          },
          terms: {
            accept: 'Aceptar y continuar',
          },
          errors: {
            checkFailed: 'Error en {{label}}. Verifica e intenta de nuevo.',
            unexpected: 'Error inesperado: {{message}}',
            generic: 'Intenta nuevamente',
          },
          regionFallback: {
            available: 'Servicio disponible en Managua (configuración por defecto).',
            unavailable: 'El servicio solo está disponible dentro de las áreas activas (actualmente Managua).',
          },
           programmedRide: {
            checkLabel: 'Viajes agendados',
            actionTitle: 'Confirmar viajes agendados',
            actionSubtitle: 'Agendado para {{date}}',
            confirmButton: 'Confirmar ahora',
            promptTitle: 'Confirma tu viaje agendado',
            promptBody: 'Tu viaje agendado para {{date}} está por comenzar. Confirma para continuar.',
            promptBodyNoDate: 'Tu viaje agendado está por comenzar. Confirma para continuar.',
            driverPromptTitle: 'Confirma tu viaje asignado',
            driverPromptBody: 'Tienes un viaje agendado para {{date}}. Confirma para reservarlo.',
            driverPromptBodyNoDate: 'Tienes un viaje agendado listo. Confirma para reservarlo.',
            notifClientTitle: 'Confirma tu viaje programado',
            notifClientBody: 'Tu viaje está por comenzar. Toca para confirmar.',
            notifDriverTitle: 'Confirma tu viaje asignado',
            notifDriverBody: 'El cliente confirmó. Toca para reservar el viaje.',
            timeLabelToday: 'Hoy · {{time}}',
            timeLabelTomorrow: 'Mañana · {{time}}',
            timeLabelDate: '{{date}} · {{time}}',
            toastFallbackBody: 'Tu viaje sigue esperando confirmación.',
            notNowButton: 'Ahora no',
            followUpTitleDriverAssigned: 'Conductor en camino',
            followUpTitleAwaitingDriver: 'Confirma tu viaje',
            driverFollowUpTitle: 'Viaje agendado listo',
            claimCodeLabel: 'Comparte este código con tu conductor',
          },
        },
        permissions: {
          explanation: {
            title: 'Permisos que usamos y por qué',
            subtitle: 'Solo pedimos lo necesario para mantener tus viajes seguros y confiables.',
          },
          items: {
            location: {
              title: ' Ubicación en todo momento',
              descriptionDriver:
                'Usamos tu ubicación para mostrar el mapa, calcular rutas y ETAs, y encontrar viajes cercanos. Como conductor también la necesitamos en segundo plano para detectar viajes, mantener actualizado un viaje activo aunque la app esté en segundo plano y para funciones de seguridad.',
              descriptionClient:
                'Usamos tu ubicación para mostrar el mapa, calcular rutas y ETAs, y encontrar viajes cercanos. Como cliente la usamos principalmente mientras la app está activa para encontrar conductores y compartir tu ubicación durante el viaje.',
            },
            overlay: {
              title: ' Mostrar sobre otras apps (solo conductores)',
              description:
                'Este permiso nos permite mostrar una burbuja flotante cuando estás disponible o tienes un viaje activo, incluso si cambias a otra app. Puedes volver rápido al viaje y seguir monitoreando sin perder información.',
              noteAndroid:
                'En Android este permiso se llama “Mostrar sobre otras apps” o “Appear on top of other apps”.',
            },
            notifications: {
              title: ' Notificaciones',
              intro: 'Usamos las notificaciones para avisarte cuando:',
              bulletTrip: 'Se crea, acepta o cancela un viaje',
              bulletPayment: 'Hay pagos pendientes o comisiones',
              bulletStatus: 'Tu viaje cambia de estado o hay alertas importantes',
            },
            activity: {
              title: ' Actividad física / sensor motion',
              descriptionDriver:
                'En algunos dispositivos Android se requiere para optimizar el seguimiento de conducción y detectar movimiento durante el viaje.',
              descriptionClient:
                'Nos ayuda a reducir consumo de batería y detectar cuando el viaje está en movimiento.',
            },
          },
          buttons: {
            continue: 'Continuar',
          },
          alerts: {
            title: 'Permisos necesarios',
            message: 'Otorga los permisos solicitados desde ajustes si los denegaste anteriormente.',
          },
          locationPrompts: {
            foreground: {
              title: 'Permiso de ubicación necesario',
              description:
                'Necesitamos acceso a tu ubicación mientras usas la app para asignar viajes y mostrar la información correcta en el mapa.',
              primary: 'Permitir ubicación',
              primarySettings: 'Abrir ajustes del sistema',
              secondary: 'Reintentar',
            },
            background: {
              title: 'Activa la ubicación en segundo plano',
              description:
                'Cuando la app está en segundo plano seguimos compartiendo tu ubicación para avisarte de viajes cercanos y continuar cualquier viaje en progreso.',
              primary: 'Permitir en segundo plano',
              secondary: 'Ya lo activé, reintentar',
            },
          },
           gate: {
            spinner: 'Verificando permisos de ubicación…',
            uploadsGate: 'Finaliza la subida de tus documentos',
            services: {
              title: 'Activa los servicios de ubicación',
              description:
                'Por favor, activa los servicios de ubicación del sistema. Sin ellos no podemos compartir tu ubicación en primer plano o en segundo plano.',
              primary: 'Abrir ajustes',
              secondary: 'Ya lo activé, reintentar',
            },
            foreground: {
              title: 'Permiso de ubicación necesario',
              description:
                'Necesitamos acceso a tu ubicación mientras usas la app para asignar viajes y mostrar la información correcta en el mapa.',
              primary: 'Permitir ubicación',
              primarySettings: 'Abrir ajustes del sistema',
              secondary: 'Reintentar',
            },
            background: {
              title: 'Activa la ubicación en segundo plano',
              description:
                'Cuando la app está en segundo plano seguimos compartiendo tu ubicación para avisarte de viajes cercanos y continuar cualquier viaje en progreso.',
              primary: 'Permitir en segundo plano',
              secondary: 'Ya lo activé, reintentar',
            },
          },
        },
         payment: {
          loading: 'Cargando...',
          header: {
            titleDefault: 'Pago del viaje',
            titlePending: 'Pago pendiente',
            subtitleDefault: 'Completa tu pago de forma segura',
            subtitlePending: 'Tu viaje terminó. Completa el pago para continuar.',
          },
          summary: {
            title: 'Resumen del viaje',
            origin: 'Origen',
            destination: 'Destino',
            distance: 'Distancia',
            service: 'Servicio',
            features: 'Ajustes',
            nightFeature: 'Nocturno',
            designatedMotoAdjustment: 'Descuento conductor designado moto',
            surge: 'Tarifa dinámica',
            highDemand: 'Alta demanda',
            notAvailable: 'N/D',
          },
          cost: {
            title: 'Detalle de costos',
            fare: 'Tarifa del viaje',
            tip: 'Propina',
            total: 'Total a pagar',
          },
          tip: {
            title: '¿Deseas agregar una propina?',
            customLabel: 'O ingresa un monto personalizado:',
            placeholder: 'C$0.00',
          },
          paymentMethod: {
            title: 'Método de pago',
            cardTitle: 'Tarjeta de crédito/débito',
            cardSubtitle: 'Selecciona tu banco abajo',
            cashTitle: 'Efectivo',
            cashSubtitle: 'Paga a tu conductor',
            cashUnavailable: 'No disponible para pagos pendientes',
          },
          savedCards: {
            title: 'Tus tarjetas',
            manageLink: 'Administrar →',
            defaultBadge: 'Predeterminada',
            newCardTitle: 'Nueva tarjeta',
            newCardSubtitle: 'Agrega un método de pago',
          },
          banks: {
            title: 'Elige tu banco',
            selectLabel: 'Selecciona tu banco:',
          },
          buttons: {
            payCard: 'Pagar con tarjeta',
            payCardPending: 'Pagar ahora',
            payCash: 'Confirmar pago en efectivo',
          },
          security: {
            message: 'Tu información está protegida con cifrado de nivel bancario.',
          },
          alerts: {
            missingCardNumber: 'Ingresa el número de tarjeta.',
            missingCardHolder: 'Ingresa el nombre del titular.',
            invalidExpiry: 'Ingresa la fecha de expiración en formato MM/AA o MM/AAAA.',
            invalidCVV: 'Ingresa un CVV válido (3 o 4 dígitos).',
            missingBank: 'Selecciona un banco.',
            saveCardSuccessTitle: 'Tarjeta guardada',
            saveCardSuccessMessage: 'Tu tarjeta {{brand}} **** {{last4}} se guardó correctamente.',
            saveCardError: 'No pudimos guardar la tarjeta.',
            changeMethodError: 'No pudimos cambiar el método de pago.',
            cardSuccessTitle: 'Pago completado',
            cardSuccessMessage: 'Tu pago de C${{amount}} se procesó con éxito.',
            cardError: 'No pudimos procesar el pago.',
            cashInfoTitle: 'Pago en efectivo',
            cashInfoMessage: 'Paga C${{amount}} en efectivo a tu conductor. Él confirmará la recepción.',
          },
          biometric: {
            prompt: 'Confirma tu identidad para pagar C${{amount}}',
            error: 'No pudimos confirmar tu identidad. Intenta de nuevo.',
          },
          currencyAmount: 'C${{amount}}',
        },
        rideHistory: {
          filters: {
            all: 'Todos',
            completed: 'Completados',
            canceled: 'Cancelados',
          },
          status: {
            completed: 'Completado',
            canceled: 'Cancelado',
            inProgress: 'En progreso',
            requested: 'Solicitado',
            accepted: 'Aceptado',
            default: '{{status}}',
          },
          nav: {
            commissions: 'Recargar fondos',
            history: 'Historial',
          },
          labels: {
            noDate: 'Sin fecha',
            originFallback: 'Origen',
            destinationFallback: 'Destino',
            unknownLocation: 'Ubicación desconocida',
            distance: 'Distancia',
            priceFinal: 'Precio final',
            priceEstimated: 'Precio estimado',
            type: 'Tipo',
            typeDesignated: '🚗 CD',
            typeMoto: '🏍️ Moto',
            typeAuto: '🚕 Auto',
            passengers: 'Pasajeros',
            client: 'Cliente:',
            driver: 'Conductor:',
            yourRating: 'Tu calificación:',
          },
          actions: {
            rateRide: '⭐ Calificar viaje',
          },
          empty: {
            title: 'Sin viajes',
            subtitleAll: 'Aún no tienes viajes en tu historial.',
            subtitleCompleted: 'Aún no tienes viajes completados.',
            subtitleCanceled: 'Aún no tienes viajes cancelados.',
          },
          errors: {
            loadRide: 'Error al cargar el viaje',
            idLabel: 'ID: {{id}}',
          },
        },
        rideDetail: {
          alert: {
            title: 'Error',
            message: 'No pudimos cargar los detalles del viaje.',
          },
          loading: 'Cargando detalles...',
          header: {
            title: 'Detalles del viaje',
            rideId: 'ID: {{id}}',
          },
          status: {
            completed: 'Completado',
            canceled: 'Cancelado',
            inProgress: 'En progreso',
            accepted: 'Aceptado',
            requested: 'Solicitado',
            default: '{{status}}',
          },
          paymentStatus: {
            completed: 'Pagado',
            pending: 'Pendiente',
            failed: 'Fallido',
            noData: 'Sin datos de pago',
            default: '{{status}}',
          },
          labels: {
            notAvailable: 'N/D',
            currency: 'C${{amount}}',
            durationHoursMinutes: '{{hours}}h {{minutes}}m',
            durationMinutes: '{{minutes}}m',
            distanceKilometers: '{{value}} km',
          },
          sections: {
            route: {
              title: 'Ruta',
              origin: 'Origen',
              destination: 'Destino',
              stop: 'Parada {{index}}',
            },
            info: {
              title: 'Información del viaje',
              distance: 'Distancia',
              duration: 'Duración',
              finalPrice: 'Precio final',
              passengers: 'Pasajeros',
              notesLabel: 'Notas',
            },
            person: {
              clientTitle: 'Cliente',
              driverTitle: 'Conductor',
              clientFallback: 'Usuario',
              driverFallback: 'Conductor',
              license: 'Licencia: {{value}}',
              missingClient: 'Información del cliente no disponible',
              missingDriver: 'Información del conductor no disponible',
            },
            vehicle: {
              title: 'Vehículo',
              registration: 'Circulación: {{value}}',
            },
            timeline: {
              title: 'Cronología',
              requested: 'Solicitado',
              accepted: 'Aceptado',
              started: 'Iniciado',
              completed: 'Completado',
              canceled: 'Cancelado',
              cancelReason: 'Motivo: {{reason}}',
            },
            payment: {
              title: 'Información de pago',
              calculated: 'Precio calculado',
              clientSuggested: 'Oferta del cliente',
              driverOffered: 'Contraoferta del conductor',
              finalAgreed: 'Precio final acordado',
              status: 'Estado del pago',
              noPayment: 'Sin datos de pago',
              commission: 'Comisión ({{rate}}%)',
              tip: 'Propina',
              driverPayout: 'Pago al conductor',
            },
          },
          actions: {
            retry: 'Reintentar',
          },
          errors: {
            notFound: 'Viaje no encontrado',
          },
        },
        help: {
          header: {
            title: 'Centro de ayuda',
            subtitle: 'Encuentra respuestas y contacta soporte',
          },
          contact: {
            title: 'Contacto rápido',
            call: 'Llamar',
            whatsapp: 'WhatsApp',
            email: 'Correo',
            whatsappMessage: 'Hola, necesito ayuda con Rundi',
            emailSubject: 'Solicitud de soporte Rundi',
            emailBody: 'Hola equipo de Rundi, necesito ayuda con...',
          },
          sections: {
            faq: 'Preguntas frecuentes',
            info: 'Información',
          },
          faqs: {
            requestRide: {
              question: '¿Cómo solicito un viaje?',
              answer:
                'Ingresa tu destino en la pantalla principal, confirma el pin en el mapa y toca “Confirmar viaje”. Un conductor cercano aceptará tu solicitud.',
            },
            pricing: {
              question: '¿Cómo funcionan las tarifas?',
              answer:
                'La tarifa base es de C$50 + una formula por kilómetro. Dependiendo del servicio, el precio por kilometro cambia. Se cobra comisiones en dependencias del servicio solicitado.',
            },
            designatedDriver: {
              question: '¿Qué es un conductor designado?',
              answer:
                'Un conductor designado maneja tu propio vehículo por ti — ideal si no puedes conducir. Llega en motocicleta y lleva tu auto de regreso a casa.',
            },
            cancelRide: {
              question: '¿Cómo cancelo un viaje?',
              answer:
                'Puedes cancelar desde la pantalla de confirmación antes de que llegue el conductor. Después de 5 minutos puede aplicarse una tarifa de cancelación.',
            },
            rateRide: {
              question: '¿Cómo califico mi viaje?',
              answer:
                'Al finalizar el viaje recibirás un aviso para calificarlo y también puedes hacerlo desde el historial de viajes.',
            },
            paymentMethods: {
              question: '¿Qué métodos de pago aceptan?',
              answer:
                'Aceptamos tarjetas de crédito/débito y efectivo. Administra tus métodos de pago desde tu perfil.',
            },
            becomeDriver: {
              question: '¿Cómo me convierto en conductor?',
              answer:
                'Regístrate como conductor, sube tus documentos (licencia, circulación, seguro) y espera la aprobación. Te avisaremos por correo cuando estés activo.',
            },
            shareRide: {
              question: '¿Puedo compartir mi viaje?',
              answer:
                'Sí. Durante el viaje puedes compartir un enlace de seguimiento en vivo con tu familia o amigos para que sigan tu ubicación.',
            },
            comission: {
              question: '¿Cómo funcionan las comisiones?',
              answer:'Las comisiones varían según el servicio solicitado. Se aplican automáticamente al finalizar el viaje. En un viaje regular se cobra el 15% de las ganancias del viaje, en conducción designada se cobra el 25% y en viajes de motocicleta se cobra el 7%.',
            },
          },
          info: {
            website: { label: 'Sitio web', value: 'rundiapp.com' },
            email: { label: 'Correo', value: ' soporte@gruporzc.com' },
            phone: { label: 'Teléfono', value: '+505 1234-5678' },
            schedule: { label: 'Horario de soporte', value: '24/7 · Siempre disponible' },
          },
        },
        account: {
          header: {
            title: 'Editar perfil',
            discardTitle: 'Descartar cambios',
            discardMessage: 'Si sales ahora podrías perder cambios no guardados. ¿Deseas salir?',
            discardCancel: 'Cancelar',
            discardExit: 'Salir',
          },
          profile: {
            avatarTitle: 'Foto de perfil',
            avatarMessage: 'La carga de foto de perfil estará disponible pronto.',
            nameLabel: 'Nombre completo',
            namePlaceholder: 'Ej. Ana Pérez',
            birthLabel: 'Fecha de nacimiento',
            birthPlaceholder: 'DD/MM/AAAA',
            emailLabel: 'Correo electrónico',
            emailPlaceholder: 'nombre@ejemplo.com',
            phoneLabel: 'Teléfono',
            phonePlaceholder: 'Toca para agregar tu número',
            saveButton: 'Guardar cambios',
          },
          providers: {
            title: 'Proveedores vinculados',
            google: 'Google',
            password: 'Correo/Contraseña',
            phone: 'Teléfono',
            none: 'No vinculado',
          },
          alerts: {
            accountLoadError: 'No pudimos cargar tu perfil.',
            providersLoadError: 'No pudimos cargar tu configuración de autenticación.',
            emailRequired: 'Ingresa un correo válido.',
            passwordRequired: 'Ingresa una contraseña.',
            passwordMismatch: 'Las contraseñas deben coincidir.',
            linkEmailSuccessTitle: 'Correo vinculado',
            linkEmailSuccessMessage: 'Tu cuenta ahora permite inicio de sesión con correo y contraseña.',
            linkEmailError: 'No pudimos vincular el correo. Intenta nuevamente.',
            googleEmailMissing: 'Tu cuenta de Google no tiene correo asociado.',
            createPasswordSuccessTitle: 'Contraseña creada',
            createPasswordSuccessMessage: 'Ya puedes iniciar sesión con correo y contraseña.',
            createPasswordError: 'No pudimos crear la contraseña. Intenta nuevamente.',
            profileUpdatedTitle: 'Perfil actualizado',
            profileUpdatedMessage: 'Tu información se guardó correctamente.',
            profileUpdateError: 'No pudimos actualizar tu perfil. Intenta nuevamente.',
          },
          cards: {
            addPassword: {
              title: 'Agregar contraseña',
              description: 'Crea una contraseña para iniciar sesión cuando Google no esté disponible.',
              newPlaceholder: 'Nueva contraseña',
              confirmPlaceholder: 'Confirmar contraseña',
              button: 'Guardar contraseña',
            },
            linkEmail: {
              title: 'Agregar correo y contraseña',
              description: 'Vincula un correo y contraseña para iniciar sesión sin tu teléfono.',
              emailPlaceholder: 'Correo',
              passwordPlaceholder: 'Contraseña',
              confirmPlaceholder: 'Confirmar contraseña',
              button: 'Guardar credenciales',
            },
          },
          phone: {
            removedTitle: 'Teléfono eliminado',
            removedMessage: 'Tu número se eliminó del perfil.',
            duplicateError: 'Este número ya está vinculado a otra cuenta.',
            availabilityError: 'No pudimos validar este número. Intenta de nuevo más tarde.',
            updatedTitle: 'Teléfono actualizado',
            updatedMessage: 'Tu número se guardó correctamente.',
            codeSentTitle: 'Código enviado',
            codeSentMessage: 'Te enviamos un SMS para verificar tu número.',
            startVerificationError: 'No pudimos iniciar la verificación. Intenta de nuevo.',
            loading: 'Preparando verificación telefónica...',
          },
        },
         paymentMethods: {
          alerts: {
            loadError: 'No pudimos cargar tus métodos de pago.',
            defaultSuccessTitle: '✅ Éxito',
            defaultSuccessMessage: 'Método de pago predeterminado actualizado.',
            defaultError: 'No pudimos actualizar el método de pago predeterminado.',
            deleteTitle: 'Eliminar tarjeta',
            deleteMessage: '¿Seguro que quieres eliminar esta tarjeta?',
            deleteSuccessTitle: '✅ Éxito',
            deleteSuccessMessage: 'Tarjeta eliminada.',
            deleteError: 'No pudimos eliminar la tarjeta.',
            deleteConfirm: 'Eliminar',
            deleteCancel: 'Cancelar',
          },
          loading: 'Cargando métodos de pago...',
          header: {
            title: 'Métodos de pago',
            subtitle: 'Administra cómo pagas tus viajes',
          },
          cash: {
            title: 'Efectivo',
            subtitle: 'Paga a tu conductor',
          },
          cards: {
            expires: 'Vence {{month}}/{{year}}',
            defaultBadge: 'Predeterminada',
            actions: {
              use: 'Usar',
            },
          },
          buttons: {
            addCard: 'Agregar tarjeta',
          },
          security: {
            message: 'Tus datos están protegidos con cifrado de nivel bancario.',
          },
        },
        savedCards: {
          alerts: {
            loadError: 'No pudimos cargar tus tarjetas guardadas.',
            deleteTitle: 'Eliminar tarjeta',
            deleteMessage: '¿Seguro que quieres eliminar esta tarjeta?',
            deleteSuccessTitle: '✅ Éxito',
            deleteSuccessMessage: 'Tarjeta eliminada.',
            deleteError: 'No pudimos eliminar la tarjeta.',
            deleteConfirm: 'Eliminar',
            deleteCancel: 'Cancelar',
            defaultSuccessTitle: '✅ Éxito',
            defaultSuccessMessage: 'Tarjeta predeterminada actualizada.',
            defaultError: 'No pudimos actualizar la tarjeta predeterminada.',
          },
          loading: 'Cargando tarjetas...',
          header: {
            title: 'Mis tarjetas',
          },
          cards: {
            provider: {
              stripe: 'Internacional',
              visanet: 'Local (Visanet)',
              fallback: '{{provider}}',
            },
            defaultBadge: 'Predeterminada',
            expires: 'Vence: {{month}}/{{year}}',
            actions: {
              setDefault: '⭐ Establecer como predeterminada',
              delete: '🗑️ Eliminar',
            },
          },
          empty: {
            title: 'Sin tarjetas guardadas',
            description: 'Agrega una tarjeta para pagar más rápido en tus próximos viajes.',
          },
          buttons: {
            addCard: '+ Agregar tarjeta',
          },
          security: {
            message: 'Tus tarjetas están protegidas con cifrado de nivel bancario. Nunca almacenamos tu CVV.',
          },
        },
        addCards: {
          support: {
            title: 'Ayuda para agregar mi tarjeta',
            label: '¿Problemas guardando tu tarjeta?',
            description: 'Abre un chat con soporte para validar datos bancarios o resolver rechazos del sistema.',
          },
          header: {
            title: 'Agregar tarjeta',
          },
          form: {
            title: 'Nueva tarjeta',
            cardNumber: 'Número de tarjeta',
            expiry: 'MM/AA',
            cvv: 'CVV',
            cardHolder: 'Nombre en la tarjeta',
            bankSelector: 'Selecciona tu banco:',
            checkbox: 'Establecer como método de pago predeterminado',
            cancel: 'Cancelar',
            save: 'Guardar',
            saving: 'Guardando...',
          },
          alerts: {
            errorTitle: 'Error',
            incomplete: 'Completa todos los campos.',
            invalidNumber: 'Número de tarjeta inválido.',
            invalidExpiry: 'Fecha de expiración inválida.',
            invalidCvv: 'CVV inválido.',
            successTitle: '✅ Tarjeta agregada',
            successMessage: 'Tu tarjeta se guardó de forma segura.',
            successButton: 'OK',
            genericError: 'No pudimos agregar la tarjeta.',
          },
          security: {
            message: 'Tus datos están protegidos con cifrado de nivel bancario.',
          },
        },
         completeVehicleInfo: {
          loading: 'Cargando información...',
          header: {
            title: 'Completa tu información',
            subtitle: 'Llena tus datos personales y del vehículo. Los campos con * son obligatorios.',
          },
          sections: {
            personal: '👤 Información personal',
            vehicle: '🚗 Información del vehículo',
            technical: '🔧 Detalles técnicos',
            documents: '📄 Documentos',
            license: '🪪 Licencia de conducir',
            registration: '📄 Tarjeta de circulación',
            insurance: '🛡️ Póliza de seguro',
            vehiclePhotos: '🚗 Foto del vehículo',
          },
          fields: {
            licenseNumber: { label: 'Número de licencia *', placeholder: 'Ej: B21332434' },
            licenseExpiry: { label: 'Fecha de expiración de la licencia', placeholder: 'AAAA-MM-DD' },
            department: { label: 'Departamento', placeholder: 'Ej: Managua' },
            municipality: { label: 'Municipio', placeholder: 'Ej: Managua' },
            plate: { label: 'Placa *', placeholder: 'Ej: M 323023' },
            brand: { label: 'Marca', placeholder: 'Ej: Toyota' },
            model: { label: 'Modelo', placeholder: 'Ej: Prado' },
            year: { label: 'Año', placeholder: 'Ej: 2021' },
            color: { label: 'Color', placeholder: 'Ej: Negro' },
            vehicleType: { label: 'Tipo de vehículo', placeholder: 'Ej: SUV, sedán, pickup' },
            fourByFour: { label: '¿Es 4x4?' },
            motor: { label: 'Número de motor', placeholder: 'Ej: 1GR-FE' },
            chasis: { label: 'Número de chasis', placeholder: 'Número de chasis' },
            vin: { label: 'VIN', placeholder: 'Número VIN' },
            cylinders: { label: 'Cilindros', placeholder: 'Ej: 6' },
            passengers: { label: 'Pasajeros', placeholder: 'Ej: 5' },
            fuelType: { label: 'Tipo de combustible', placeholder: 'Ej: Gasolina, Diésel' },
            tonnage: { label: 'Tonelaje', placeholder: 'Ej: 2.5' },
            vehicleClass: { label: 'Clase del vehículo', placeholder: 'Ej: PRIVADO' },
            serviceType: { label: 'Tipo de servicio', placeholder: 'Ej: PRIVADO' },
            lien: { label: 'Gravamen', placeholder: 'Ej: NINGUNO' },
            registrationNumber: { label: 'Número de circulación', placeholder: 'Ej: B2301230' },
            registrationExpiry: { label: 'Vencimiento de la circulación', placeholder: 'AAAA-MM-DD' },
            insuranceNumber: { label: 'Número de póliza', placeholder: 'Ej: RCO30201102' },
            insuranceCompany: { label: 'Compañía aseguradora', placeholder: 'Ej: BAC' },
            insuranceExpiry: { label: 'Vencimiento del seguro', placeholder: 'AAAA-MM-DD' },
            insuranceStartDate: { label: 'Inicio del seguro', placeholder: 'AAAA-MM-DD' },
          },
          completion: {
            badge: 'Completo',
            optional: 'Opcional',
            summary: '{{completed}} de {{total}} secciones completadas',
            allDone: '¡Todo listo!',
          },
          photos: {
            frontLabel: 'Frente',
            backLabel: 'Reverso',
            uploadFront: 'Subir frente',
            uploadBack: 'Subir reverso',
            uploadPolicy: 'Subir póliza',
            uploadVehicle: 'Subir foto del vehículo',
          },
          buttons: {
            save: 'Guardar información',
            saveAllComplete: '¡Guardar información!',
            incompleteWarning: 'Completa todos los campos obligatorios para continuar',
          },
          messages: {
            switchYes: 'Sí',
            switchNo: 'No',
          },
          alerts: {
            loadErrorTitle: 'Error',
            loadErrorMessage: 'No pudimos cargar tu información.',
            saveSuccessTitle: 'Éxito',
            saveSuccessMessage: 'Tu información se guardó correctamente.',
            saveErrorTitle: 'Error',
            saveErrorMessage: 'No pudimos guardar tu información. Intenta nuevamente.',
            confirmButton: 'OK',
          },
          defaults: {
            noLien: 'NINGUNO',
          },
        },
         deleteAccount: {
          header: {
            title: 'Eliminar cuenta',
            roles: {
              driver: 'Conductor',
              client: 'Cliente',
              default: 'Usuario',
            },
          },
          warning: {
            title: '⚠️ Acción irreversible',
            intro: 'Al eliminar tu cuenta, se borrará permanentemente:',
            bullets: {
              profile: '• Tu perfil e información personal',
              rideHistory: '• Historial de viajes',
              vehicles: '• Vehículos registrados (si eres conductor)',
              ratings: '• Calificaciones y reseñas',
              paymentMethods: '• Métodos de pago guardados',
              notifications: '• Notificaciones y mensajes',
              locations: '• Ubicaciones y rastreo',
              dataStores: '• Todos los datos almacenados en Firebase y Supabase',
            },
          },
          form: {
            title: 'Confirma tus credenciales',
            emailPlaceholder: 'Correo electrónico',
            passwordPlaceholder: 'Contraseña',
          },
          confirmation: {
            checkbox:
              'Entiendo que esta acción es irreversible y todos mis datos se eliminarán permanentemente',
          },
          buttons: {
            delete: 'Eliminar cuenta de forma permanente',
            deleting: 'Eliminando cuenta...',
            cancel: 'Cancelar',
          },
          alerts: {
            confirmRequiredTitle: 'Confirmación requerida',
            confirmRequiredMessage:
              'Marca la casilla de verificación para confirmar que entiendes las consecuencias.',
            missingFieldsTitle: 'Campos incompletos',
            missingFieldsMessage: 'Ingresa tu correo y contraseña para confirmar la eliminación.',
            confirmDeleteTitle: 'Eliminar cuenta permanentemente',
            confirmDeleteMessage:
              'Esta acción no se puede deshacer. Todos tus datos se eliminarán permanentemente.\n\n¿Seguro que deseas continuar?',
            confirmDeleteCancel: 'Cancelar',
            confirmDeleteConfirm: 'Eliminar cuenta',
            successTitle: 'Cuenta eliminada',
            successOk: 'OK',
            genericErrorTitle: 'Error',
            deleteErrorMessage: 'Ocurrió un error al eliminar la cuenta.',
          },
        },
       supportcomplaint: {
        title: 'Mis reportes',
        subtitle: 'Revisa y continúa tus conversaciones con soporte.',
        createCta: 'Crear nuevo reporte',
        emptyTitle: 'Sin reportes aún',
        emptyDescription: 'Cuando abras un reporte aparecerá en este listado.',
        status: {
          open: 'Abierto',
          in_progress: 'En revisión',
          resolved: 'Resuelto',
          rejected: 'Rechazado',
        },
        tickets: {
          loading: 'Cargando tus casos de soporte...',
          emptyTitle: 'Sin reportes aún',
          emptyDescription: 'Cuando abras un reporte aparecerá en este listado.',
          newReport: 'Crear nuevo reporte',
          title: 'Mis reportes',
          subtitle: 'Revisa y continúa tus conversaciones con soporte.',
          createCta: 'Crear nuevo reporte',
          category: 'Tipo',
          createdAt: 'Creado en',
          resolution: 'Resolución',
          delete: 'Eliminar',
          deleting: 'Eliminando...',
          deleteConfirmTitle: 'Eliminar reporte',
          deleteConfirmMessage:
            'Todas las conversaciones serán archivadas y el chat será eliminado. Esta acción no se puede deshacer. ¿Deseas continuar?',
          deleteConfirmButton: 'Eliminar',
          deleteCancelButton: 'Cancelar',
          deleteSuccess: 'Reporte eliminado correctamente.',
          deleteError: 'No pudimos eliminar el reporte. Intenta más tarde.',
        },
        },
       supportCall: {
        title: 'Llamada de soporte',
        subtitle: 'Control completo de la sesión',
        emptyState: {
          title: 'Sin caso activo',
          subtitle: 'Crea o abre un caso en el chat de soporte para gestionar llamadas.',
          back: 'Volver',
        },
        labels: {
          case: 'Caso',
          operator: 'Operador',
          operatorPending: 'Pendiente de asignación',
          callId: 'Call ID',
          callIdPending: 'Aún no generado',
          room: 'Sala',
          roomPending: 'Sin sala activa',
          livekit: 'LiveKit',
          noRoomToken: 'Aún no hay token de sala. Solicita o acepta la llamada primero.',
          stateConnecting: 'Conectando...',
          stateConnected: 'Conectado',
          stateDisconnected: 'Desconectado',
        },
        actions: {
          call: 'Llamar',
          accept: 'Aceptar',
          reject: 'Rechazar',
          hangup: 'Colgar',
          requestCall: 'Solicitar llamada',
          joinRoom: 'Unirse a la sala',
          muteMic: 'Silenciar micrófono',
          unmuteMic: 'Activar micrófono',
          speakerOn: 'Altavoz encendido',
          speakerOff: 'Altavoz apagado',
        },
      },
       supportChat: {
        title: 'Soporte',
            subtitle: 'Cuentanos qué sucede y nuestro equipo te ayudará a resolverlo.',
            rideTagLabel: 'Viaje relacionado',
            fallbackUserName: 'Usuario',
            call: {
              ringing: 'Te están llamando, acepta para conectar con el operador.',
              status: 'Estado',
              caseLabel: 'Caso',
              operatorLabel: 'Operador',
              actions: {
                accept: 'Aceptar',
                reject: 'Rechazar',
                hangup: 'Colgar',
                },
             info: {
              room: 'Room',
              stateConnecting: 'Conectando...',
              stateConnected: 'Conectado',
              stateDisconnected: 'Desconectado',
              tokenReceived: 'Token obtenido y conexión LiveKit iniciada en el cliente.',
              },
             requestTitle: 'Llamada solicitada',
             requestBody: 'Notificamos a soporte que deseas una llamada. Te notificarán cuando inicien la llamada.',
             requestMessage: 'El cliente solicitó una llamada de soporte.',
            },
            categories: {
              title: 'Tipo de problema',
              service: 'Servicio / viaje',
              driver: 'Conductor',
              payment: 'Pagos y cargos',
              app: 'Problemas de la app',
              other: 'Otro',
            },
            priorities: {
              title: 'Prioridad',
              low: 'Baja',
              normal: 'Normal',
              high: 'Alta',
              urgent: 'Urgente',
            },
            form: {
              problemTitleLabel: 'Título del problema',
              problemTitlePlaceholder: 'Ej: Problema con el cargo en mi último viaje',
              descriptionLabel: 'Describe lo que sucedió',
              descriptionPlaceholder: 'Incluye detalles que ayuden al soporte a entender y resolver tu caso.',
            },
            errors: {
              missingTitle: 'Por favor, ingresa un breve título para tu problema.',
              initializeService: 'No podemos inciar el soporte. Revisa tu conexión a internet y vuelve a intentarlo.',
              invalidResponse: 'No pudimos crear el caso. Intenta más tarde.',
              genericCreate: 'Algo salió mal al crear el caso. Por favor, intenta nuevamente.',
            },
            actions: {
              creatingCase: 'Creando caso...',
              createCase: 'Crear caso y comenzar chat',
            },
            caseHeader: {
              createdLabel: 'Caso creado',
              hint: 'Puedes continuar escribiendo en este chat para mantenerse en contacto con el soporte.',
            },
            emptyState: {
              text: 'Tu caso ha sido creado. Envía tu primer mensaje para que el soporte tenga más contexto.',
            },
            chatInput: {
              placeholder: 'Escribe un mensaje para soporte',
            },
          },
        },
      },
}, 
zh: {
translation: {


    },
  },
};

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    compatibilityJSON: 'v4',
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
} else {
  Object.entries(resources).forEach(([lang, data]) => {
    i18n.addResourceBundle(lang, 'translation', data.translation, true, true);
  });
}

export type SupportedLanguage = keyof typeof resources;

export const supportedLanguages: SupportedLanguage[] = ['en', 'es', 'zh'];

export default i18n;
