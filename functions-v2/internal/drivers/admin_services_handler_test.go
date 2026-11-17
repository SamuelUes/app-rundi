package drivers

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/rundi/functions-v2/internal/middleware"
)

func TestAdminDriverServiceActionsRejectOperator(t *testing.T) {
	handler := NewHandler(nil)
	request := httptest.NewRequest("GET", "/v1/admin/drivers/id/services", nil)
	request = request.WithContext(context.WithValue(request.Context(), middleware.CtxRole, "operator"))
	response := httptest.NewRecorder()

	handler.listDriverServices(response, request)
	if response.Code != 403 {
		t.Fatalf("status = %d, want 403", response.Code)
	}
}
