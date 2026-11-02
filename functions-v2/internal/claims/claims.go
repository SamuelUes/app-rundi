// Package claims — sincroniza los custom claims de Firebase Auth con el rol
// autoritativo (Firestore DATA-MAIN_users.role / public.users.role).
//
// Las reglas de Firestore y RequireRole leen request.auth.token.role e
// isDriver; sin este sync ningún usuario tiene claims (los tokens nuevos
// vienen vacíos) y todo el surface de driver/staff queda denegado.
package claims

import (
	"context"
	"log/slog"

	firebase "firebase.google.com/go/v4"
)

// Ensure fija {role, isDriver} preservando claims ajenos; solo escribe cuando
// difieren (idempotente). Es best-effort: loguea y no corta el flujo — el
// rol queda igualmente persistido en Firestore/SQL y el próximo bootstrap
// reintenta el sync.
func Ensure(ctx context.Context, app *firebase.App, uid, role string) {
	if app == nil || uid == "" || role == "" {
		return
	}
	client, err := app.Auth(ctx)
	if err != nil {
		slog.WarnContext(ctx, "claims.auth_client", "uid", uid, "err", err)
		return
	}
	rec, err := client.GetUser(ctx, uid)
	if err != nil {
		slog.WarnContext(ctx, "claims.get_user", "uid", uid, "err", err)
		return
	}
	isDriver := role == "driver" || role == "designated_driver"
	if rec.CustomClaims != nil {
		curRole, _ := rec.CustomClaims["role"].(string)
		curDrv, _ := rec.CustomClaims["isDriver"].(bool)
		if curRole == role && curDrv == isDriver {
			return
		}
	}
	m := map[string]any{}
	for k, v := range rec.CustomClaims {
		m[k] = v
	}
	m["role"] = role
	if isDriver {
		m["isDriver"] = true
	} else {
		delete(m, "isDriver")
	}
	if err := client.SetCustomUserClaims(ctx, uid, m); err != nil {
		slog.WarnContext(ctx, "claims.set", "uid", uid, "role", role, "err", err)
		return
	}
	slog.InfoContext(ctx, "claims.synced", "uid", uid, "role", role)
}
