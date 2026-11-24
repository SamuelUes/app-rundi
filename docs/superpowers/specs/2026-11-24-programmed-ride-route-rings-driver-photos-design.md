# Programmed ride route markers and driver photos

## Goal

Improve route clarity in programmed-ride invitation prompts and show driver profile photos in client driver-search results.

## Scope and behavior

- In `ProgrammedRidePromptOverlay`, render route markers as hollow rings instead of Material icons: blue for origin, gold for each extra stop, and red for destination. Keep the route labels and addresses; render extra stops when present in prompt data.
- In `ProgrammedRidesScreen`, show each searched driver candidate's profile photo beside their name and rating. Use the existing person icon as a fallback when no usable photo URL is returned.
- Extend the programmed-driver candidate response with the driver's profile photo URL, selecting it from the existing user profile data. Keep search eligibility, ordering, and invitation behavior unchanged.

## Implementation boundaries

- Update the invitation-detail route presentation in the overlay, its data mapping, and styles.
- Update the candidate API type and backend candidate query/response to carry a nullable photo URL.
- Render the result avatar using the app's existing image component/pattern, with a graceful fallback.
- No new endpoints, photo uploads, profile-data access from the client, or changes to existing programmed-ride cards outside the search result rows.

## Verification

- Run frontend TypeScript validation in `RundiApp`.
- Run focused Go tests for `functions-v2/internal/programmed` and Go validation/build as appropriate.
- Confirm candidates with and without a photo render correctly, and route stops retain the specified ring colors.
