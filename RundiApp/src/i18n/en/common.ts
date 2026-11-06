/**
 * Namespace `common` del locale `en`.
 * Extraído desde `src/i18n/index.ts` (`en.translation.common`).
 */
const common = {
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
            updatingPrice: 'Updating fare',
            priceUnavailable: 'Fare unavailable',
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
              noDeviceSecurity: 'This device has no security method configured.',
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
         firebaseStorage: {
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
      };

export default common;
