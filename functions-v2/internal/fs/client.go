// Package fs — cliente Firestore y paths canónicos de las 4 raíces lógicas.
// Convención aprobada (2026-10-31): raíz literal prefijada en el nombre de
// colección. UNA sola database; estas son colecciones de primer nivel.
package fs

import (
	"context"

	"cloud.google.com/go/firestore"

	"github.com/rundi/functions-v2/internal/config"
)

// Raíces/colecciones canónicas (database-v2/firestore/firestore.rules).
const (
	ColUsers         = "DATA-MAIN_users"
	ColDrivers       = "DATA-MAIN_drivers"
	ColVehicles      = "DATA-MAIN_vehicles"
	ColServiceAreas  = "DATA-MAIN_service_areas"
	ColPayments      = "DATA-MAIN_payments"
	ColServices      = "DATA-MAIN_services"
	ColFeatures      = "DATA-MAIN_features"
	ColPricing       = "DATA-MAIN_pricing"
	ColAppConfig     = "DATA-MAIN_app_config"
	ColNotifications = "DATA-MAIN_notifications"

	ColUserSessions   = "REALTIME_user_sessions"
	ColPresence       = "REALTIME_presence"
	ColDriversLive    = "REALTIME_drivers_live"
	ColTripsLive      = "REALTIME_trips_live"
	ColDriverOffers   = "REALTIME_driver_offers"
	ColDriverPublic   = "REALTIME_driver_public_profiles"
	ColPaymentsLive   = "REALTIME_payments_live"
	ColCalls          = "REALTIME_calls"
	ColChats          = "REALTIME_chats"
	ColProgrammed     = "REALTIME_programmed_rides"
	ColDriverCrews    = "REALTIME_driver_crews"
	ColCrewMembership = "REALTIME_driver_crew_membership"
	ColCrewInvites    = "REALTIME_driver_crew_invites"
	ColArrivalPhotos  = "REALTIME_designated_arrival_photos"

	ColAdminSettings    = "SAAS_admin_settings"
	ColOperatorSettings = "SAAS_operator_settings"
	ColDashboards       = "SAAS_dashboards"
	ColReports          = "SAAS_reports"
	ColSystemConfig     = "SAAS_system_config"

	ColPendingEvents    = "SYSTEM_pending_events"
	ColProcessedEvents  = "SYSTEM_processed_events"
	ColProjectionStatus = "SYSTEM_projection_status"
)

func NewClient(ctx context.Context, cfg *config.Config) (*firestore.Client, error) {
	if cfg.FirestoreDatabaseID != "" {
		return firestore.NewClientWithDatabase(ctx, cfg.ProjectID, cfg.FirestoreDatabaseID)
	}
	return firestore.NewClient(ctx, cfg.ProjectID)
}
