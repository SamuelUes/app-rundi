# Unknown Login Account → Registration Design

## Goal

When a user attempts to sign in with an email/password or phone number that has
no Rundi account, offer a clear path into `RegisterScreen`. Do not silently
create a Rundi profile or an email/password identity during a failed login.

## User flows

### Email and password

1. The user submits email and password from `LoginScreen`.
2. If Firebase specifically reports that the account does not exist, show a
   confirmation alert explaining that the email is not registered and offering
   registration.
3. On acceptance, navigate to `RegisterNew` with the email prefilled. The
   registration screen remains responsible for collecting the user's name,
   explicitly selecting the email/password method, and creating the account.
4. On dismissal, remain on login. Invalid password, network, disabled-account,
   throttling, and other failures retain their existing error behavior.

### SMS

1. The user requests and confirms an SMS code from the phone login flow.
2. Firebase may create its phone-auth identity as part of successful phone
   verification. The app then checks whether a Rundi profile exists.
3. If the profile is absent, show the same registration confirmation.
4. On acceptance, navigate to `RegisterNew` with the verified phone and
   verification state/context, reusing the current Firebase identity rather
   than creating a second one. Registration collects the remaining required
   information and creates the Rundi profile.
5. On dismissal, do not continue into registration or create a Rundi profile.
   Handle the Firebase-authenticated but profile-less state safely so it cannot
   be mistaken for a completed login on a later app launch.

## Boundaries and requirements

- Only a definitive “user not found” signal triggers the offer. Do not infer
  account absence from generic errors, invalid credentials, or connectivity
  failures.
- Preserve existing registration checkpoint behavior and method/provider
  contracts.
- Do not pass a password from the failed login attempt into navigation or
  temporary registration storage. The user must opt into email registration
  and enter the password in the registration flow.
- For SMS, preserve proof of phone verification without logging OTPs or
  manufacturing a second Firebase identity.
- Keep existing Google authentication behavior unchanged.
- Keep all user-facing copy localized in English and Spanish.

## Implementation boundaries

- `LoginScreen` handles the email failure classification, confirmation, and
  prefilled email navigation.
- `PhoneVerificationLoginScreen` handles the missing Rundi profile after
  successful phone verification and confirmation before registration.
- `RegisterScreen` accepts optional prefill/verification navigation data while
  maintaining its current default phone-first experience.
- Existing auth and registration services remain the source of truth for
  Firebase identity and Rundi profile creation; no new backend endpoint is
  introduced.

## Validation

- TypeScript check: `cd RundiApp && npx tsc --noEmit`.
- Verify only the definitive email user-not-found error triggers the offer.
- Verify unknown-phone SMS flow retains the verified phone and reaches
  registration without duplicate identity creation.
- Verify dismissing either offer does not create a Rundi profile.
- Verify existing-account email/SMS login, invalid credentials, and registration
  checkpoint flows remain unchanged.
