// Reglas de compliance — port exacto de rules/*.ts + evaluator.ts de v1.
// Núcleo puro sin IO: facts + context → reasons → {allowed, status}.
package compliance

import (
	"fmt"
	"strings"
)

const RulesVersion = "1.0.0"

// ---------- helpers (ruleUtils.ts) ----------

func reason(ctx *RuleContext, code, message string, status ReasonStatus, details map[string]any) Reason {
	cfg := resolveRuleConfig(code, ctx.Rules)
	return Reason{
		Code: code, Severity: cfg.Severity, Blocking: cfg.Blocking,
		Status: status, Message: message, Source: cfg.LegalBasis, Details: details,
	}
}

func passReason(code, message string, details map[string]any) Reason {
	return Reason{Code: code, Severity: SevInfo, Blocking: false, Status: StatusPass, Message: message, Details: details}
}

// docStatusReason — rejected → DOCUMENT_REJECTED; pending/in_review/
// requires_review → DOCUMENT_PENDING_VERIFICATION; nil si verified.
func docStatusReason(ctx *RuleContext, doc docFactsBase, kind string) *Reason {
	switch doc.Status {
	case "rejected":
		r := reason(ctx, "DOCUMENT_REJECTED", kind+" rechazado en revisión", StatusFail,
			map[string]any{"documentKind": kind, "documentId": doc.ID})
		return &r
	case "pending", "in_review", "requires_review":
		r := reason(ctx, "DOCUMENT_PENDING_VERIFICATION", kind+" pendiente de verificación manual", StatusReview,
			map[string]any{"documentKind": kind, "documentId": doc.ID, "documentStatus": doc.Status})
		return &r
	}
	return nil
}

// isGrandfatheredForMissingDoc — params de la regla missing:
// enforce_from → antes de esa fecha no bloquea; grandfathered_before →
// vehículos anteriores a la fecha no bloquean (flota preexistente).
func isGrandfatheredForMissingDoc(ctx *RuleContext, missingCode string, vehicleCreatedAt *string) bool {
	cfg := resolveRuleConfig(missingCode, ctx.Rules)
	if v, ok := cfg.Params["enforce_from"].(string); ok {
		if ef := toDateOnly(v); ef != "" && compareDates(ctx.Today, ef) < 0 {
			return true
		}
	}
	if v, ok := cfg.Params["grandfathered_before"].(string); ok {
		gb := toDateOnly(v)
		created := toDateOnly(vehicleCreatedAt)
		if gb != "" && created != "" && compareDates(created, gb) < 0 {
			return true
		}
	}
	return false
}

func eq(a, b *string) *bool {
	if a == nil || b == nil {
		return nil
	}
	na := strings.ToLower(strings.TrimSpace(*a))
	nb := strings.ToLower(strings.TrimSpace(*b))
	if na == "" || nb == "" {
		return nil
	}
	r := na == nb
	return &r
}

func str(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

// ---------- licenseRules.ts ----------

func evaluateLicense(f *Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	lic := f.License
	if lic == nil {
		return append(reasons, reason(ctx, "LICENSE_MISSING", "No hay licencia de conducir registrada", StatusFail, nil))
	}
	if sr := docStatusReason(ctx, lic.docFactsBase, "Licencia de conducir"); sr != nil {
		reasons = append(reasons, *sr)
	}
	if rep := str(lic.ReportedStatus); rep == "suspended" || rep == "canceled" {
		word := "suspendida"
		if rep == "canceled" {
			word = "cancelada"
		}
		reasons = append(reasons, reason(ctx, "LICENSE_REPORTED_SUSPENDED",
			fmt.Sprintf("Licencia reportada como %s por la autoridad", word), StatusFail, nil))
	}

	issue := toDateOnly(lic.IssueDate)
	expiry := toDateOnly(lic.ExpiryDate)
	if issue != "" && expiry != "" && compareDates(issue, expiry) > 0 {
		reasons = append(reasons, reason(ctx, "LICENSE_INVALID_DATE_RANGE",
			fmt.Sprintf("Fecha de emisión (%s) posterior a vencimiento (%s)", issue, expiry), StatusFail,
			map[string]any{"issueDate": issue, "expiryDate": expiry}))
	} else {
		if isNotYetValid(issue, ctx.Today) {
			reasons = append(reasons, reason(ctx, "LICENSE_NOT_YET_VALID",
				fmt.Sprintf("Licencia con emisión futura (%s)", issue), StatusFail,
				map[string]any{"issueDate": issue}))
		}
		if expiry == "" {
			reasons = append(reasons, reason(ctx, "DOCUMENT_DATA_INCOMPLETE",
				"Licencia sin fecha de vencimiento legible", StatusReview,
				map[string]any{"documentKind": "license"}))
		} else if isExpired(expiry, ctx.Today) {
			reasons = append(reasons, reason(ctx, "LICENSE_EXPIRED",
				fmt.Sprintf("Licencia vencida el %s", expiry), StatusFail,
				map[string]any{"expiryDate": expiry}))
		} else {
			wd := cfgWarningDays(resolveRuleConfig("LICENSE_EXPIRING_SOON", ctx.Rules))
			if isExpiringSoon(expiry, ctx.Today, wd) {
				d := daysUntil(expiry, ctx.Today)
				reasons = append(reasons, reason(ctx, "LICENSE_EXPIRING_SOON",
					fmt.Sprintf("Licencia vence el %s (en %d días)", expiry, d), StatusWarning,
					map[string]any{"expiryDate": expiry, "daysUntil": d}))
			} else {
				reasons = append(reasons, passReason("LICENSE_VALID",
					fmt.Sprintf("Licencia vigente hasta %s", expiry),
					map[string]any{"expiryDate": expiry}))
			}
		}
	}
	if lic.LicenseType == "ordinaria" {
		reasons = append(reasons, reason(ctx, "LICENSE_TYPE_ORDINARY_FOR_PAID_WORK",
			"Licencia ordinaria para trabajo remunerado (revisar si se exigirá profesional)", StatusWarning,
			map[string]any{"licenseType": lic.LicenseType}))
	}
	return reasons
}

// ---------- circulationRules.ts ----------

func evaluateCirculation(f *Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	card := f.Circulation
	if card == nil {
		return append(reasons, reason(ctx, "CIRCULATION_CARD_MISSING", "Sin licencia de circulación registrada", StatusFail, nil))
	}
	if sr := docStatusReason(ctx, card.docFactsBase, "Licencia de circulación"); sr != nil {
		reasons = append(reasons, *sr)
	}
	if v := f.Vehicle; v != nil {
		var mismatches []string
		checks := [][3]string{
			{"plate", str(card.DeclaredPlate), v.Plate},
			{"vin", str(card.DeclaredVin), str(v.Vin)},
			{"chasis", str(card.DeclaredChasis), str(v.Chasis)},
			{"motor", str(card.DeclaredMotor), str(v.Motor)},
		}
		for _, c := range checks {
			if e := eq(&c[1], &c[2]); e != nil && !*e {
				mismatches = append(mismatches, fmt.Sprintf("%s: tarjeta=\"%s\" vs vehículo=\"%s\"", c[0], c[1], c[2]))
			}
		}
		if len(mismatches) > 0 {
			reasons = append(reasons, reason(ctx, "CIRCULATION_DATA_MISMATCH",
				"Datos de la tarjeta de circulación no coinciden con el vehículo: "+strings.Join(mismatches, "; "),
				StatusReview, map[string]any{"mismatches": mismatches}))
		} else {
			reasons = append(reasons, passReason("CIRCULATION_VALID", "Datos de circulación consistentes con el vehículo", nil))
		}
	}
	return reasons
}

// ---------- insuranceRules.ts ----------

func evaluateInsurance(f *Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	pol := f.RcInsurance
	if pol == nil {
		return append(reasons, reason(ctx, "INSURANCE_MISSING",
			"Sin póliza de responsabilidad civil obligatoria vigente", StatusFail, nil))
	}
	if sr := docStatusReason(ctx, pol.docFactsBase, "Póliza de seguro RC"); sr != nil {
		reasons = append(reasons, *sr)
	}
	from := toDateOnly(pol.EffectiveFrom)
	until := toDateOnly(pol.EffectiveUntil)
	if from != "" && until != "" && compareDates(from, until) > 0 {
		reasons = append(reasons, reason(ctx, "INSURANCE_INVALID_DATE_RANGE",
			fmt.Sprintf("Inicio de vigencia (%s) posterior a fin (%s)", from, until), StatusFail,
			map[string]any{"effectiveFrom": from, "effectiveUntil": until}))
	} else {
		if isNotYetValid(from, ctx.Today) {
			reasons = append(reasons, reason(ctx, "INSURANCE_NOT_YET_ACTIVE",
				fmt.Sprintf("Póliza inicia vigencia el %s", from), StatusFail,
				map[string]any{"effectiveFrom": from}))
		}
		if until == "" {
			reasons = append(reasons, reason(ctx, "DOCUMENT_DATA_INCOMPLETE",
				"Póliza sin fecha de fin de vigencia legible", StatusReview,
				map[string]any{"documentKind": "insurance"}))
		} else if isExpired(until, ctx.Today) {
			reasons = append(reasons, reason(ctx, "INSURANCE_EXPIRED",
				fmt.Sprintf("Póliza vencida el %s", until), StatusFail,
				map[string]any{"effectiveUntil": until}))
		} else {
			wd := cfgWarningDays(resolveRuleConfig("INSURANCE_EXPIRING_SOON", ctx.Rules))
			if isExpiringSoon(until, ctx.Today, wd) {
				d := daysUntil(until, ctx.Today)
				reasons = append(reasons, reason(ctx, "INSURANCE_EXPIRING_SOON",
					fmt.Sprintf("Póliza vence el %s (en %d días)", until, d), StatusWarning,
					map[string]any{"effectiveUntil": until, "daysUntil": d}))
			} else {
				reasons = append(reasons, passReason("INSURANCE_VALID",
					fmt.Sprintf("Póliza RC vigente hasta %s", until),
					map[string]any{"effectiveUntil": until}))
			}
		}
	}
	if v := f.Vehicle; v != nil {
		var mismatches []string
		checks := [][3]string{
			{"plate", str(pol.InsuredPlate), v.Plate},
			{"vin", str(pol.InsuredVin), str(v.Vin)},
			{"motor", str(pol.InsuredMotor), str(v.Motor)},
			{"chasis", str(pol.InsuredChasis), str(v.Chasis)},
		}
		for _, c := range checks {
			if e := eq(&c[1], &c[2]); e != nil && !*e {
				mismatches = append(mismatches, fmt.Sprintf("%s: póliza=\"%s\" vs vehículo=\"%s\"", c[0], c[1], c[2]))
			}
		}
		if len(mismatches) > 0 {
			reasons = append(reasons, reason(ctx, "INSURANCE_VEHICLE_MISMATCH",
				"La póliza describe un vehículo distinto: "+strings.Join(mismatches, "; "),
				StatusReview, map[string]any{"mismatches": mismatches}))
		}
	}
	if len(f.Duplicates.PolicyVehicleIDs) > 0 {
		reasons = append(reasons, reason(ctx, "INSURANCE_POLICY_DUPLICATE",
			"Misma póliza registrada en otros vehículos: "+strings.Join(f.Duplicates.PolicyVehicleIDs, ", "),
			StatusReview, map[string]any{"otherVehicleIds": f.Duplicates.PolicyVehicleIDs}))
	}
	if !f.HasPassengerCoverage {
		reasons = append(reasons, reason(ctx, "INSURANCE_PASSENGER_COVERAGE_MISSING",
			"No se identificó cobertura de pasajeros para un vehículo de servicio de pasajeros", StatusReview, nil))
	}
	return reasons
}

// ---------- periodicRules.ts (inspection/emissions/revisado) ----------

type periodicSpec struct {
	kind, displayName, missingCode, expiredCode, failedCode, expiringSoonCode, validCode string
}

var (
	inspectionSpec = periodicSpec{"inspection", "Inspección técnico-mecánica", "INSPECTION_MISSING", "INSPECTION_EXPIRED", "INSPECTION_FAILED", "INSPECTION_EXPIRING_SOON", "INSPECTION_VALID"}
	emissionsSpec  = periodicSpec{"emissions", "Certificado de emisiones de gases", "EMISSIONS_MISSING", "EMISSIONS_EXPIRED", "EMISSIONS_FAILED", "EMISSIONS_EXPIRING_SOON", "EMISSIONS_VALID"}
	revisadoSpec   = periodicSpec{"revisado", "Calcomanía de revisado", "REVISADO_MISSING", "INVALID_DATE_RANGE", "", "REQUIRES_MANUAL_REVIEW", "REVISADO_VALID"}
)

// isVehicleExemptAsNew — exención 2 años (circulación.issuedAt →
// vehicle.emissionDate → vehicle.year). Param: vehicle_age_exemption_years.
func isVehicleExemptAsNew(f *Facts, ctx *RuleContext) bool {
	cfg := resolveRuleConfig("INSPECTION_MISSING", ctx.Rules)
	years := 2
	if v, ok := cfg.Params["vehicle_age_exemption_years"].(float64); ok && v > 0 {
		years = int(v)
	}
	currentYear := yearOf(ctx.Today)
	base := ""
	if f.Circulation != nil {
		base = toDateOnly(f.Circulation.IssuedAt)
	}
	if base == "" && f.Vehicle != nil {
		base = toDateOnly(f.Vehicle.EmissionDate)
	}
	if base != "" {
		return yearOf(base)+years >= currentYear
	}
	if f.Vehicle != nil && f.Vehicle.Year != nil {
		return *f.Vehicle.Year+years >= currentYear
	}
	return false
}

func evaluatePeriodic(spec periodicSpec, doc *PeriodicFacts, f *Facts, ctx *RuleContext, exemptionApplies bool) []Reason {
	var reasons []Reason
	if doc == nil {
		if isGrandfatheredForMissingDoc(ctx, spec.missingCode, vehCreatedAt(f)) {
			reasons = append(reasons, reason(ctx, "LEGACY_DOCUMENT_MISSING",
				spec.displayName+" pendiente de carga (vehículo registrado antes del sistema de compliance)",
				StatusReview, map[string]any{"documentKind": spec.kind, "missingCode": spec.missingCode}))
		} else if exemptionApplies {
			reasons = append(reasons, reason(ctx, "REQUIRES_MANUAL_REVIEW",
				spec.displayName+": vehículo posiblemente exento por nuevo (<2 años); verificar",
				StatusReview, map[string]any{"documentKind": spec.kind, "exemption": "new_vehicle"}))
		} else {
			reasons = append(reasons, reason(ctx, spec.missingCode, spec.displayName+" no registrada", StatusFail, nil))
		}
		return reasons
	}
	if sr := docStatusReason(ctx, doc.docFactsBase, spec.displayName); sr != nil {
		reasons = append(reasons, *sr)
	}
	if spec.failedCode != "" && doc.Result != nil && *doc.Result != "approved" {
		reasons = append(reasons, reason(ctx, spec.failedCode,
			fmt.Sprintf("%s con resultado \"%s\"", spec.displayName, *doc.Result), StatusFail,
			map[string]any{"result": *doc.Result}))
	}
	until := toDateOnly(doc.ValidUntil)
	if until == "" {
		reasons = append(reasons, reason(ctx, "DOCUMENT_DATA_INCOMPLETE",
			spec.displayName+" sin fecha de vencimiento legible", StatusReview,
			map[string]any{"documentKind": spec.kind}))
	} else if isExpired(until, ctx.Today) {
		reasons = append(reasons, reason(ctx, spec.expiredCode,
			fmt.Sprintf("%s vencida el %s", spec.displayName, until), StatusFail,
			map[string]any{"validUntil": until}))
	} else {
		wd := cfgWarningDays(resolveRuleConfig(spec.expiringSoonCode, ctx.Rules))
		if isExpiringSoon(until, ctx.Today, wd) {
			d := daysUntil(until, ctx.Today)
			reasons = append(reasons, reason(ctx, spec.expiringSoonCode,
				fmt.Sprintf("%s vence el %s (en %d días)", spec.displayName, until, d), StatusWarning,
				map[string]any{"validUntil": until, "daysUntil": d}))
		} else {
			reasons = append(reasons, passReason(spec.validCode,
				fmt.Sprintf("%s vigente hasta %s", spec.displayName, until),
				map[string]any{"validUntil": until}))
		}
	}
	return reasons
}

func vehCreatedAt(f *Facts) *string {
	if f.Vehicle == nil {
		return nil
	}
	return f.Vehicle.CreatedAt
}

// ---------- roadTaxRules.ts ----------

func evaluateRoadTax(f *Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	tax := f.RoadTax
	currentYear := yearOf(ctx.Today)
	if tax == nil {
		if isGrandfatheredForMissingDoc(ctx, "ROAD_TAX_MISSING", vehCreatedAt(f)) {
			reasons = append(reasons, reason(ctx, "LEGACY_DOCUMENT_MISSING",
				fmt.Sprintf("Rodamiento %d pendiente de carga (vehículo registrado antes del sistema de compliance)", currentYear),
				StatusReview, map[string]any{"documentKind": "road_tax", "missingCode": "ROAD_TAX_MISSING", "taxYear": currentYear}))
		} else if isWithinTaxGracePeriod(ctx.Today) {
			reasons = append(reasons, reason(ctx, "ROAD_TAX_GRACE_PERIOD",
				fmt.Sprintf("Sin rodamiento %d registrado (período de pago: primer trimestre)", currentYear),
				StatusWarning, map[string]any{"taxYear": currentYear}))
		} else {
			reasons = append(reasons, reason(ctx, "ROAD_TAX_MISSING",
				fmt.Sprintf("Sin impuesto de rodamiento %d registrado", currentYear), StatusFail,
				map[string]any{"taxYear": currentYear}))
		}
		return reasons
	}
	if sr := docStatusReason(ctx, tax.docFactsBase, fmt.Sprintf("Rodamiento %d", tax.TaxYear)); sr != nil {
		reasons = append(reasons, *sr)
	}
	if tax.Exempt {
		if tax.Status == "verified" {
			reasons = append(reasons, passReason("ROAD_TAX_VALID",
				fmt.Sprintf("Exención de rodamiento %d verificada", tax.TaxYear), nil))
		} else {
			reasons = append(reasons, reason(ctx, "ROAD_TAX_EXEMPT_UNVERIFIED",
				fmt.Sprintf("Exención de rodamiento %d declarada sin verificar", tax.TaxYear), StatusReview,
				map[string]any{"taxYear": tax.TaxYear, "exemptReason": tax.ExemptReason}))
		}
		return reasons
	}
	if tax.Status == "verified" {
		reasons = append(reasons, passReason("ROAD_TAX_VALID",
			fmt.Sprintf("Rodamiento %d pagado y verificado", tax.TaxYear),
			map[string]any{"taxYear": tax.TaxYear}))
	}
	return reasons
}

// ---------- identifierRules.ts ----------

func evaluateIdentifiers(f *Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	if len(f.Duplicates.LicenseNumberDriverIDs) > 0 {
		reasons = append(reasons, reason(ctx, "DUPLICATE_LICENSE",
			fmt.Sprintf("Número de licencia también registrado por otros conductores (%d)", len(f.Duplicates.LicenseNumberDriverIDs)),
			StatusReview, map[string]any{"otherDriverIds": f.Duplicates.LicenseNumberDriverIDs}))
	}
	if len(f.Duplicates.PlateVehicleIDs) > 0 {
		reasons = append(reasons, reason(ctx, "DUPLICATE_PLATE",
			"Placa registrada en otro(s) vehículo(s) vigente(s)", StatusFail,
			map[string]any{"otherVehicleIds": f.Duplicates.PlateVehicleIDs}))
	}
	if len(f.Duplicates.VinVehicleIDs) > 0 {
		reasons = append(reasons, reason(ctx, "DUPLICATE_VIN",
			"VIN/chasis/motor duplicado en otro(s) vehículo(s)", StatusReview,
			map[string]any{"otherVehicleIds": f.Duplicates.VinVehicleIDs}))
	}
	if f.Vehicle != nil {
		st := strings.ToUpper(strings.TrimSpace(str(f.Vehicle.ServiceType)))
		if st != "" && st != "PUBLICO" && st != "PÚBLICO" && st != "TAXI" {
			reasons = append(reasons, reason(ctx, "SERVICE_TYPE_NOT_PUBLIC",
				fmt.Sprintf("Servicio registral del vehículo es \"%s\" (operando servicio de pasajeros)", str(f.Vehicle.ServiceType)),
				StatusReview, map[string]any{"serviceType": str(f.Vehicle.ServiceType)}))
		}
	}
	return reasons
}

// ---------- categoryRules.ts ----------

func findCategoryRule(ctx *RuleContext, vehicleType, serviceCode string) *CategoryRuleRow {
	vt := strings.ToLower(vehicleType)
	sc := strings.ToLower(serviceCode)
	for i := range ctx.CategoryRules {
		r := &ctx.CategoryRules[i]
		if strings.ToLower(r.VehicleType) == vt && strings.ToLower(r.ServiceCode) == sc {
			return r
		}
	}
	for i := range ctx.CategoryRules {
		r := &ctx.CategoryRules[i]
		if strings.ToLower(r.VehicleType) == vt && r.ServiceCode == "*" {
			return r
		}
	}
	for i := range ctx.CategoryRules {
		r := &ctx.CategoryRules[i]
		if r.VehicleType == "*" && r.ServiceCode == "*" {
			return r
		}
	}
	return nil
}

func evaluateLicenseCategory(f *Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	v := f.Vehicle
	lic := f.License
	if v == nil || lic == nil {
		return reasons
	}
	vehicleType := strings.ToLower(str(v.Type))
	if vehicleType == "" {
		vehicleType = "auto"
	}
	serviceCode := "*"
	if f.ServiceCode != nil && *f.ServiceCode != "" {
		serviceCode = strings.ToLower(*f.ServiceCode)
	}
	rule := findCategoryRule(ctx, vehicleType, serviceCode)
	if rule == nil {
		return append(reasons, reason(ctx, "LICENSE_CATEGORY_UNVERIFIED",
			fmt.Sprintf("Sin regla de compatibilidad para tipo de vehículo \"%s\"", vehicleType), StatusReview,
			map[string]any{"vehicleType": vehicleType, "serviceCode": serviceCode}))
	}
	required := rule.RequiredCategories
	if len(required) == 0 {
		return append(reasons, reason(ctx, "LICENSE_CATEGORY_UNVERIFIED",
			fmt.Sprintf("Compatibilidad categoría↔vehículo \"%s\" no confirmada por fuente oficial", vehicleType),
			StatusReview, map[string]any{"vehicleType": vehicleType, "serviceCode": serviceCode}))
	}
	held := map[string]bool{}
	for _, c := range lic.Categories {
		held[strings.ToLower(c)] = true
	}
	if len(held) == 0 {
		return append(reasons, reason(ctx, "LICENSE_CATEGORY_UNVERIFIED",
			fmt.Sprintf("Licencia sin categorías declaradas; no se puede confirmar compatibilidad con \"%s\"", vehicleType),
			StatusReview, map[string]any{"vehicleType": vehicleType, "requiredCategories": required}))
	}
	ok := false
	for _, req := range required {
		if held[strings.ToLower(req)] {
			ok = true
			break
		}
	}
	if ok {
		return append(reasons, passReason("LICENSE_CATEGORY_COMPATIBLE",
			fmt.Sprintf("Categoría de licencia compatible con \"%s\"", vehicleType),
			map[string]any{"requiredCategories": required, "heldCategories": lic.Categories}))
	}
	details := map[string]any{"vehicleType": vehicleType, "requiredCategories": required, "heldCategories": lic.Categories}
	if rule.ConfirmedBySource && rule.Severity == "BLOCKING" {
		reasons = append(reasons, reason(ctx, "LICENSE_CATEGORY_MISMATCH",
			fmt.Sprintf("Categorías de licencia [%s] no habilitan \"%s\" (requiere: %s)",
				strings.Join(lic.Categories, ", "), vehicleType, strings.Join(required, ", ")),
			StatusFail, details))
	} else {
		reasons = append(reasons, reason(ctx, "LICENSE_CATEGORY_UNVERIFIED",
			fmt.Sprintf("Compatibilidad categoría↔\"%s\" sin confirmar por fuente oficial (requerido: %s)",
				vehicleType, strings.Join(required, ", ")),
			StatusReview, details))
	}
	return reasons
}

// ---------- evaluator.ts ----------

// EvaluateFacts — núcleo puro (mismo orden y early-returns que v1).
func EvaluateFacts(f Facts, ctx *RuleContext) []Reason {
	var reasons []Reason
	if f.VehicleRequested && f.Vehicle == nil {
		reasons = append(reasons, reason(ctx, "VEHICLE_NOT_FOUND", "Vehículo no encontrado", StatusFail, nil))
	}
	if f.Driver == nil {
		return append(reasons, reason(ctx, "DRIVER_NOT_FOUND", "Conductor no encontrado", StatusFail, nil))
	}
	accountStatus := strings.ToLower(str(f.Driver.AccountStatus))
	if accountStatus == "" {
		accountStatus = "pending"
	}
	if accountStatus == "suspended" {
		reasons = append(reasons, reason(ctx, "DRIVER_ACCOUNT_SUSPENDED", "Cuenta del conductor suspendida", StatusFail, nil))
	} else if accountStatus != "active" {
		reasons = append(reasons, reason(ctx, "DRIVER_ACCOUNT_NOT_ACTIVE",
			fmt.Sprintf("Cuenta del conductor en estado \"%s\"", accountStatus), StatusFail, nil))
	}
	reasons = append(reasons, evaluateLicense(&f, ctx)...)
	if f.Vehicle != nil {
		if !f.Vehicle.IsActive {
			reasons = append(reasons, reason(ctx, "VEHICLE_NOT_ACTIVE",
				"Vehículo no aprobado/activado por el equipo administrativo", StatusFail, nil))
		}
		if f.Vehicle.DriverID != f.Driver.ID {
			reasons = append(reasons, reason(ctx, "VEHICLE_DRIVER_MISMATCH",
				"El vehículo no pertenece a este conductor", StatusFail,
				map[string]any{"vehicleDriverId": f.Vehicle.DriverID, "driverId": f.Driver.ID}))
		}
		reasons = append(reasons, evaluateCirculation(&f, ctx)...)
		reasons = append(reasons, evaluateInsurance(&f, ctx)...)
		reasons = append(reasons, evaluatePeriodic(inspectionSpec, f.Inspection, &f, ctx, isVehicleExemptAsNew(&f, ctx))...)
		reasons = append(reasons, evaluatePeriodic(emissionsSpec, f.Emissions, &f, ctx, isVehicleExemptAsNew(&f, ctx))...)
		reasons = append(reasons, evaluateRoadTax(&f, ctx)...)
		var revisadoDoc *PeriodicFacts
		if f.Revisado != nil {
			revisadoDoc = &PeriodicFacts{
				docFactsBase: f.Revisado.docFactsBase,
				ValidUntil:   f.Revisado.ValidUntil,
			}
		}
		reasons = append(reasons, evaluatePeriodic(revisadoSpec, revisadoDoc, &f, ctx, false)...)
	}
	reasons = append(reasons, evaluateIdentifiers(&f, ctx)...)
	reasons = append(reasons, evaluateLicenseCategory(&f, ctx)...)
	return reasons
}

// SummarizeEvaluation — mismo árbol de decisión que v1.
func SummarizeEvaluation(reasons []Reason, scope string) (bool, string) {
	blocking, suspended, hasReview, hasWarning, hasExpired := false, false, false, false, false
	for _, r := range reasons {
		if r.Blocking && r.Status != StatusPass {
			blocking = true
		}
		if r.Code == "DRIVER_ACCOUNT_SUSPENDED" {
			suspended = true
		}
		if r.Severity == SevReview && r.Status != StatusPass {
			hasReview = true
		}
		if r.Severity == SevWarning && r.Status != StatusPass {
			hasWarning = true
		}
		if strings.HasSuffix(r.Code, "_EXPIRED") {
			hasExpired = true
		}
	}
	switch {
	case suspended:
		return false, "suspended"
	case blocking:
		if scope == "vehicle" && hasExpired {
			return false, "expired_documents"
		}
		return false, "non_compliant"
	case hasReview:
		if scope == "vehicle" {
			return true, "pending_verification"
		}
		return true, "under_review"
	case hasWarning:
		return true, "expiring"
	default:
		if scope == "vehicle" {
			return true, "active"
		}
		return true, "verified"
	}
}
