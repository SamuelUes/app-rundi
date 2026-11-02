// Tests de paridad del motor puro — mismos casos/expectativas que v1
// (rules/*.ts + evaluator.ts). ctx.Today inyectado → deterministas.
package compliance

import "testing"

const today = "2025-06-15" // fecha fija del ctx en todos los tests

func ctx() *RuleContext {
	return &RuleContext{Today: today, Rules: map[string]RuleConfig{}}
}

func activeDriver() *DriverFacts {
	st := "active"
	return &DriverFacts{ID: "d-1", UserID: "u-1", AccountStatus: &st}
}

func validVehicle() *VehicleFacts {
	vt := "auto"
	y := 2020
	return &VehicleFacts{
		ID: "v-1", DriverID: "d-1", Plate: "M123456", Type: &vt,
		Year: &y, IsActive: true,
	}
}

func validLicense() *LicenseFacts {
	exp := "2026-12-31"
	return &LicenseFacts{
		docFactsBase: docFactsBase{ID: "lic-1", Status: "verified"},
		LicenseType:  "ordinaria",
		Categories:   []string{"B"},
		ExpiryDate:   &exp,
	}
}

func codes(reasons []Reason) []string {
	out := []string{}
	for _, r := range reasons {
		out = append(out, r.Code)
	}
	return out
}

func has(reasons []Reason, code string) bool {
	for _, r := range reasons {
		if r.Code == code {
			return true
		}
	}
	return false
}

func summarize(reasons []Reason, scope string) (bool, string) {
	return SummarizeEvaluation(reasons, scope)
}

// ---------- ciclo de vida del conductor ----------

func TestDriverNotFound(t *testing.T) {
	rs := EvaluateFacts(Facts{Driver: nil}, ctx())
	if !has(rs, "DRIVER_NOT_FOUND") {
		t.Fatalf("esperaba DRIVER_NOT_FOUND, got %v", codes(rs))
	}
	if ok, st := summarize(rs, "driver"); ok || st != "non_compliant" {
		t.Fatalf("expected blocked/non_compliant, got %v/%s", ok, st)
	}
}

func TestSuspendedDriver(t *testing.T) {
	st := "suspended"
	rs := EvaluateFacts(Facts{Driver: &DriverFacts{ID: "d", AccountStatus: &st}, License: validLicense()}, ctx())
	if !has(rs, "DRIVER_ACCOUNT_SUSPENDED") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, st := summarize(rs, "driver"); ok || st != "suspended" {
		t.Fatalf("expected suspended, got %v/%s", ok, st)
	}
}

func TestPendingDriver(t *testing.T) {
	st := "pending"
	rs := EvaluateFacts(Facts{Driver: &DriverFacts{ID: "d", AccountStatus: &st}, License: validLicense()}, ctx())
	if !has(rs, "DRIVER_ACCOUNT_NOT_ACTIVE") {
		t.Fatalf("got %v", codes(rs))
	}
}

// ---------- licencia ----------

func TestLicenseMissing(t *testing.T) {
	rs := EvaluateFacts(Facts{Driver: activeDriver()}, ctx())
	if !has(rs, "LICENSE_MISSING") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, _ := summarize(rs, "driver"); ok {
		t.Fatal("expected blocked")
	}
}

func TestLicenseExpired(t *testing.T) {
	exp := "2025-01-01"
	lic := validLicense()
	lic.ExpiryDate = &exp
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: lic}, ctx())
	if !has(rs, "LICENSE_EXPIRED") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestLicenseExpiringSoon(t *testing.T) {
	exp := "2025-07-01" // 16 días → dentro de warningDays=30
	lic := validLicense()
	lic.ExpiryDate = &exp
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: lic}, ctx())
	if !has(rs, "LICENSE_EXPIRING_SOON") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, st := summarize(rs, "driver"); !ok || st != "expiring" {
		t.Fatalf("expected allowed/expiring, got %v/%s", ok, st)
	}
}

func TestLicenseOrdinariaWarning(t *testing.T) {
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense()}, ctx())
	if !has(rs, "LICENSE_TYPE_ORDINARY_FOR_PAID_WORK") {
		t.Fatalf("got %v", codes(rs))
	}
	// ordinaria solo advierte: sigue permitido si todo lo demás pasa
	if ok, st := summarize(rs, "driver"); !ok || st != "verified" && st != "expiring" {
		t.Fatalf("expected allowed, got %v/%s", ok, st)
	}
}

func TestLicenseReportedSuspended(t *testing.T) {
	rep := "suspended"
	lic := validLicense()
	lic.ReportedStatus = &rep
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: lic}, ctx())
	if !has(rs, "LICENSE_REPORTED_SUSPENDED") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestLicensePendingVerification(t *testing.T) {
	lic := validLicense()
	lic.Status = "pending"
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: lic}, ctx())
	if !has(rs, "DOCUMENT_PENDING_VERIFICATION") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, st := summarize(rs, "driver"); !ok || st != "under_review" {
		t.Fatalf("expected under_review, got %v/%s", ok, st)
	}
}

func TestLicenseRejected(t *testing.T) {
	lic := validLicense()
	lic.Status = "rejected"
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: lic}, ctx())
	if !has(rs, "DOCUMENT_REJECTED") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, _ := summarize(rs, "driver"); ok {
		t.Fatal("expected blocked")
	}
}

// ---------- vehículo ----------

func TestVehicleNotFound(t *testing.T) {
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		VehicleRequested: true}, ctx())
	if !has(rs, "VEHICLE_NOT_FOUND") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestVehicleNotActive(t *testing.T) {
	v := validVehicle()
	v.IsActive = false
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(), Vehicle: v,
		VehicleRequested: true}, ctx())
	if !has(rs, "VEHICLE_NOT_ACTIVE") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestVehicleDriverMismatch(t *testing.T) {
	v := validVehicle()
	v.DriverID = "other-driver"
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(), Vehicle: v,
		VehicleRequested: true}, ctx())
	if !has(rs, "VEHICLE_DRIVER_MISMATCH") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestAllDocsMissingBlocks(t *testing.T) {
	// Sin documentos del vehículo: circulación + seguro + ITM + emisiones +
	// rodamiento faltan → varios blocking; revisado solo review.
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true}, ctx())
	for _, want := range []string{"CIRCULATION_CARD_MISSING", "INSURANCE_MISSING", "INSPECTION_MISSING", "EMISSIONS_MISSING", "ROAD_TAX_MISSING", "REVISADO_MISSING"} {
		if !has(rs, want) {
			t.Fatalf("falta %s en %v", want, codes(rs))
		}
	}
	if ok, st := summarize(rs, "vehicle"); ok || st != "non_compliant" {
		t.Fatalf("expected non_compliant, got %v/%s", ok, st)
	}
}

// ---------- grandfathering / exenciones ----------

func TestGrandfatheredMissingDocs(t *testing.T) {
	c := ctx()
	c.Rules = map[string]RuleConfig{
		"CIRCULATION_CARD_MISSING": {Code: "CIRCULATION_CARD_MISSING", Severity: SevBlocking,
			Blocking: true, Enabled: true, Params: map[string]any{"grandfathered_before": "2026-01-01"}},
		"INSURANCE_MISSING": {Code: "INSURANCE_MISSING", Severity: SevBlocking,
			Blocking: true, Enabled: true, Params: map[string]any{"grandfathered_before": "2026-01-01"}},
		"INSPECTION_MISSING": {Code: "INSPECTION_MISSING", Severity: SevBlocking,
			Blocking: true, Enabled: true, Params: map[string]any{"grandfathered_before": "2026-01-01"}},
		"EMISSIONS_MISSING": {Code: "EMISSIONS_MISSING", Severity: SevBlocking,
			Blocking: true, Enabled: true, Params: map[string]any{"grandfathered_before": "2026-01-01"}},
		"ROAD_TAX_MISSING": {Code: "ROAD_TAX_MISSING", Severity: SevBlocking,
			Blocking: true, Enabled: true, Params: map[string]any{"grandfathered_before": "2026-01-01"}},
	}
	created := "2024-01-01"
	v := validVehicle()
	v.CreatedAt = &created
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: v, VehicleRequested: true}, c)
	if !has(rs, "LEGACY_DOCUMENT_MISSING") {
		t.Fatalf("esperaba LEGACY_DOCUMENT_MISSING, got %v", codes(rs))
	}
	// En v1 el grandfathering SOLO aplica a periódicos + rodamiento;
	// circulación y seguro siguen bloqueando aunque el vehículo sea antiguo.
	for _, want := range []string{"CIRCULATION_CARD_MISSING", "INSURANCE_MISSING"} {
		if !has(rs, want) {
			t.Fatalf("%s debe seguir bloqueando (sin grandfathering), got %v", want, codes(rs))
		}
	}
	for _, covered := range []string{"INSPECTION_MISSING", "EMISSIONS_MISSING", "ROAD_TAX_MISSING"} {
		if has(rs, covered) {
			t.Fatalf("%s no debió emitirse (grandfathered), got %v", covered, codes(rs))
		}
	}
}

func TestNewVehicleExemption(t *testing.T) {
	// Vehículo nuevo (<2 años): ITM/emisiones faltan → manual review, no blocking.
	y := 2024
	v := validVehicle()
	v.Year = &y
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: v, VehicleRequested: true}, ctx())
	if has(rs, "INSPECTION_MISSING") || has(rs, "EMISSIONS_MISSING") {
		t.Fatalf("nuevo no debió recibir *_MISSING: %v", codes(rs))
	}
	if !has(rs, "REQUIRES_MANUAL_REVIEW") {
		t.Fatalf("esperaba REQUIRES_MANUAL_REVIEW, got %v", codes(rs))
	}
}

// ---------- rodamiento ----------

func TestRoadTaxGracePeriod(t *testing.T) {
	c := ctx()
	c.Today = "2025-03-15" // dentro del primer trimestre
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true}, c)
	if !has(rs, "ROAD_TAX_GRACE_PERIOD") {
		t.Fatalf("got %v", codes(rs))
	}
	if has(rs, "ROAD_TAX_MISSING") {
		t.Fatal("en grace period no debe emitir ROAD_TAX_MISSING")
	}
}

func TestRoadTaxVerified(t *testing.T) {
	rt := &RoadTaxFacts{docFactsBase: docFactsBase{ID: "t", Status: "verified"}, TaxYear: 2025}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true, RoadTax: rt}, ctx())
	if !has(rs, "ROAD_TAX_VALID") {
		t.Fatalf("got %v", codes(rs))
	}
	if has(rs, "ROAD_TAX_MISSING") {
		t.Fatal("con rodamiento verificado no debe faltar")
	}
}

func TestRoadTaxExemptUnverified(t *testing.T) {
	rt := &RoadTaxFacts{docFactsBase: docFactsBase{ID: "t", Status: "pending"},
		TaxYear: 2025, Exempt: true}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true, RoadTax: rt}, ctx())
	if !has(rs, "ROAD_TAX_EXEMPT_UNVERIFIED") {
		t.Fatalf("got %v", codes(rs))
	}
}

// ---------- periódicos ----------

func TestInspectionFailed(t *testing.T) {
	res := "rejected"
	until := "2026-01-01"
	ins := &PeriodicFacts{docFactsBase: docFactsBase{ID: "i", Status: "verified"},
		Result: &res, ValidUntil: &until}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true, Inspection: ins}, ctx())
	if !has(rs, "INSPECTION_FAILED") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestInspectionExpired(t *testing.T) {
	until := "2025-01-01"
	ins := &PeriodicFacts{docFactsBase: docFactsBase{ID: "i", Status: "verified"},
		ValidUntil: &until}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true, Inspection: ins}, ctx())
	if !has(rs, "INSPECTION_EXPIRED") {
		t.Fatalf("got %v", codes(rs))
	}
	// scope vehicle + expired docs → expired_documents
	if ok, st := summarize(rs, "vehicle"); ok || st != "expired_documents" {
		t.Fatalf("expected expired_documents, got %v/%s", ok, st)
	}
}

// ---------- seguro ----------

func TestInsuranceMismatchAndNoPassenger(t *testing.T) {
	plate := "ZZZ999"
	until := "2026-01-01"
	ins := &InsuranceFacts{docFactsBase: docFactsBase{ID: "p", Status: "verified"},
		InsuredPlate: &plate, EffectiveUntil: &until, CoverageType: "rc_obligatorio"}
	// Circulación/ITM/emisiones/rodamiento también faltan (bloquean), así que
	// filtramos solo las razones de seguro para el summarize.
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true, RcInsurance: ins}, ctx())
	if !has(rs, "INSURANCE_VEHICLE_MISMATCH") {
		t.Fatalf("got %v", codes(rs))
	}
	if !has(rs, "INSURANCE_PASSENGER_COVERAGE_MISSING") {
		t.Fatalf("got %v", codes(rs))
	}
	var insReasons []Reason
	for _, r := range rs {
		if r.Code == "INSURANCE_VEHICLE_MISMATCH" || r.Code == "INSURANCE_PASSENGER_COVERAGE_MISSING" {
			insReasons = append(insReasons, r)
		}
	}
	// ambas son REVIEW → permitido pero pending_verification
	if ok, st := summarize(insReasons, "vehicle"); !ok || st != "pending_verification" {
		t.Fatalf("expected pending_verification, got %v/%s", ok, st)
	}
}

// ---------- duplicados ----------

func TestDuplicatePlateBlocks(t *testing.T) {
	f := Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true}
	f.Duplicates.PlateVehicleIDs = []string{"v-9"}
	rs := EvaluateFacts(f, ctx())
	if !has(rs, "DUPLICATE_PLATE") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, _ := summarize(rs, "pair"); ok {
		t.Fatal("placa duplicada debe bloquear")
	}
}

func TestDuplicateLicenseReview(t *testing.T) {
	f := Facts{Driver: activeDriver(), License: validLicense()}
	f.Duplicates.LicenseNumberDriverIDs = []string{"d-9"}
	rs := EvaluateFacts(f, ctx())
	if !has(rs, "DUPLICATE_LICENSE") {
		t.Fatalf("got %v", codes(rs))
	}
	if ok, st := summarize(rs, "driver"); !ok || st != "under_review" {
		t.Fatalf("expected under_review, got %v/%s", ok, st)
	}
}

// ---------- categorías ----------

func TestCategoryMismatchConfirmedBlocks(t *testing.T) {
	c := ctx()
	c.CategoryRules = []CategoryRuleRow{{
		VehicleType: "auto", ServiceCode: "*",
		RequiredCategories: []string{"C"}, Severity: "BLOCKING", ConfirmedBySource: true,
	}}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(), // tiene B
		Vehicle: validVehicle(), VehicleRequested: true}, c)
	if !has(rs, "LICENSE_CATEGORY_MISMATCH") {
		t.Fatalf("got %v", codes(rs))
	}
}

func TestCategoryMismatchUnconfirmedReviews(t *testing.T) {
	c := ctx()
	c.CategoryRules = []CategoryRuleRow{{
		VehicleType: "auto", ServiceCode: "*",
		RequiredCategories: []string{"C"}, Severity: "BLOCKING", ConfirmedBySource: false,
	}}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true}, c)
	if !has(rs, "LICENSE_CATEGORY_UNVERIFIED") || has(rs, "LICENSE_CATEGORY_MISMATCH") {
		t.Fatalf("unconfirmed debe ser review, got %v", codes(rs))
	}
}

func TestCategoryCompatible(t *testing.T) {
	c := ctx()
	c.CategoryRules = []CategoryRuleRow{{
		VehicleType: "auto", ServiceCode: "*",
		RequiredCategories: []string{"B"}, Severity: "BLOCKING", ConfirmedBySource: true,
	}}
	rs := EvaluateFacts(Facts{Driver: activeDriver(), License: validLicense(),
		Vehicle: validVehicle(), VehicleRequested: true}, c)
	if !has(rs, "LICENSE_CATEGORY_COMPATIBLE") {
		t.Fatalf("got %v", codes(rs))
	}
}

// ---------- reglas dinámicas ----------

func TestDisabledRuleFallsBackToDefault(t *testing.T) {
	c := ctx()
	// La DB deshabilita LICENSE_MISSING → resolveRuleConfig debe usar el default
	// (sigue bloqueando, igual que v1: "código desconocido/deshabilitado no
	// inventa severidad nueva").
	c.Rules = map[string]RuleConfig{
		"LICENSE_MISSING": {Code: "LICENSE_MISSING", Severity: SevInfo, Enabled: false, Params: map[string]any{}},
	}
	rs := EvaluateFacts(Facts{Driver: activeDriver()}, c)
	for _, r := range rs {
		if r.Code == "LICENSE_MISSING" {
			if !r.Blocking || r.Severity != SevBlocking {
				t.Fatalf("regla deshabilitada debió caer al default blocking, got %+v", r)
			}
		}
	}
}

func TestDbRuleOverride(t *testing.T) {
	c := ctx()
	// Admin subió LICENSE_MISSING a REQUIRES_REVIEW no-blocking en DB.
	c.Rules = map[string]RuleConfig{
		"LICENSE_MISSING": {Code: "LICENSE_MISSING", Severity: SevReview,
			Blocking: false, Enabled: true, Params: map[string]any{}},
	}
	rs := EvaluateFacts(Facts{Driver: activeDriver()}, c)
	for _, r := range rs {
		if r.Code == "LICENSE_MISSING" && (r.Blocking || r.Severity != SevReview) {
			t.Fatalf("override DB no aplicado, got %+v", r)
		}
	}
}
