// DEFAULT_RULES — idénticas al seed de compliance_rules (migration.sql §10)
// y a codes.ts de v1. La DB puede sobreescribir; un código desconocido NUNCA
// es blocking (no inventar requisitos → REQUIRES_REVIEW seguro).
package compliance

type defaultRule struct {
	severity    Severity
	blocking    bool
	warningDays *int
	legalBasis  string
}

func i(v int) *int { return &v }

var defaultRules = map[string]defaultRule{
	"DRIVER_NOT_FOUND":                     {SevBlocking, true, nil, "RUNDI_POLICY"},
	"DRIVER_ACCOUNT_NOT_ACTIVE":            {SevBlocking, true, nil, "RUNDI_POLICY"},
	"DRIVER_ACCOUNT_SUSPENDED":             {SevBlocking, true, nil, "RUNDI_POLICY"},
	"VEHICLE_NOT_FOUND":                    {SevBlocking, true, nil, "RUNDI_POLICY"},
	"VEHICLE_NOT_ACTIVE":                   {SevBlocking, true, nil, "RUNDI_POLICY"},
	"VEHICLE_DRIVER_MISMATCH":              {SevBlocking, true, nil, "RUNDI_POLICY"},
	"LICENSE_MISSING":                      {SevBlocking, true, nil, "Ley 431 Art. 133.5"},
	"LICENSE_EXPIRED":                      {SevBlocking, true, nil, "Ley 431 Art. 140"},
	"LICENSE_EXPIRING_SOON":                {SevWarning, false, i(30), "RUNDI_POLICY"},
	"LICENSE_NOT_YET_VALID":                {SevBlocking, true, nil, "Integridad de fechas"},
	"LICENSE_INVALID_DATE_RANGE":           {SevBlocking, true, nil, "Integridad de fechas"},
	"LICENSE_TYPE_ORDINARY_FOR_PAID_WORK":  {SevWarning, false, nil, "REQUIRES_MANUAL_LEGAL_REVIEW"},
	"LICENSE_REPORTED_SUSPENDED":           {SevBlocking, true, nil, "Ley 431 Art. 143"},
	"LICENSE_CATEGORY_MISMATCH":            {SevBlocking, true, nil, "Ley 431 Art. 21/140"},
	"LICENSE_CATEGORY_UNVERIFIED":          {SevReview, false, nil, "REQUIRES_MANUAL_LEGAL_REVIEW"},
	"DOCUMENT_PENDING_VERIFICATION":        {SevReview, false, nil, "RUNDI_POLICY"},
	"DOCUMENT_REJECTED":                    {SevBlocking, true, nil, "RUNDI_POLICY"},
	"DOCUMENT_DATA_INCOMPLETE":             {SevReview, false, nil, "REQUIRES_MANUAL_LEGAL_REVIEW"},
	"INVALID_DATE_RANGE":                   {SevBlocking, true, nil, "Integridad de fechas"},
	"CIRCULATION_CARD_MISSING":             {SevBlocking, true, nil, "Ley 431 Arts. 3.25/133.5"},
	"CIRCULATION_DATA_MISMATCH":            {SevReview, false, nil, "Ley 431 Arts. 63.5/164"},
	"SERVICE_TYPE_NOT_PUBLIC":              {SevReview, false, nil, "REQUIRES_MANUAL_LEGAL_REVIEW"},
	"INSURANCE_MISSING":                    {SevBlocking, true, nil, "Ley 431 Arts. 63/133.4"},
	"INSURANCE_EXPIRED":                    {SevBlocking, true, nil, "Ley 431 Art. 68"},
	"INSURANCE_EXPIRING_SOON":              {SevWarning, false, i(30), "RUNDI_POLICY"},
	"INSURANCE_NOT_YET_ACTIVE":             {SevBlocking, true, nil, "Ley 431 Art. 68"},
	"INSURANCE_INVALID_DATE_RANGE":         {SevBlocking, true, nil, "Integridad de fechas"},
	"INSURANCE_VEHICLE_MISMATCH":           {SevReview, false, nil, "Ley 431 Art. 63.5"},
	"INSURANCE_PASSENGER_COVERAGE_MISSING": {SevReview, false, nil, "Ley 431 Art. 69.II.4"},
	"INSURANCE_POLICY_DUPLICATE":           {SevReview, false, nil, "Integridad interna"},
	"INSPECTION_MISSING":                   {SevBlocking, true, nil, "PN trámite revisado; exención 2 años nuevos"},
	"INSPECTION_EXPIRED":                   {SevBlocking, true, nil, "PN trámite revisado"},
	"INSPECTION_FAILED":                    {SevBlocking, true, nil, "PN trámite revisado"},
	"INSPECTION_EXPIRING_SOON":             {SevWarning, false, i(30), "RUNDI_POLICY"},
	"EMISSIONS_MISSING":                    {SevBlocking, true, nil, "Ley 431 Arts. 60-62; exención 2 años nuevos"},
	"EMISSIONS_EXPIRED":                    {SevBlocking, true, nil, "Ley 431 Art. 62"},
	"EMISSIONS_FAILED":                     {SevBlocking, true, nil, "Ley 431 Arts. 60-62"},
	"EMISSIONS_EXPIRING_SOON":              {SevWarning, false, i(30), "RUNDI_POLICY"},
	"ROAD_TAX_MISSING":                     {SevBlocking, true, nil, "Ley 431 Arts. 11-12"},
	"ROAD_TAX_GRACE_PERIOD":                {SevWarning, false, nil, "Ley 431 Art. 11"},
	"ROAD_TAX_EXEMPT_UNVERIFIED":           {SevReview, false, nil, "Ley 431 Art. 11"},
	"REVISADO_MISSING":                     {SevReview, false, nil, "PN trámite revisado; Ley 431 Art. 133.3"},
	"LEGACY_DOCUMENT_MISSING":              {SevReview, false, nil, "RUNDI_POLICY (transición: vehículos/conductores preexistentes)"},
	"IDENTIFIER_MISMATCH":                  {SevReview, false, nil, "Ley 431 Arts. 63.5/164"},
	"DUPLICATE_LICENSE":                    {SevReview, false, nil, "Integridad interna"},
	"DUPLICATE_PLATE":                      {SevBlocking, true, nil, "Integridad interna"},
	"DUPLICATE_VIN":                        {SevReview, false, nil, "Integridad interna"},
	"FOREIGN_PLATE_PUBLIC_SERVICE":         {SevBlocking, true, nil, "Ley 431 Art. 134"},
	"PUBLIC_TRANSPORT_CONCESSION_MISSING":  {SevReview, false, nil, "REQUIRES_MANUAL_LEGAL_REVIEW"},
	"REQUIRES_MANUAL_REVIEW":               {SevReview, false, nil, "REQUIRES_MANUAL_LEGAL_REVIEW"},
}

// resolveRuleConfig — fila DB si existe y enabled; si no default; si no
// REQUIRES_REVIEW seguro (port de resolveRuleConfig de codes.ts).
func resolveRuleConfig(code string, dbRules map[string]RuleConfig) RuleConfig {
	if db, ok := dbRules[code]; ok && db.Enabled {
		return db
	}
	if def, ok := defaultRules[code]; ok {
		lb := def.legalBasis
		return RuleConfig{
			Code: code, Severity: def.severity, Blocking: def.blocking,
			Enabled: true, WarningDays: def.warningDays, LegalBasis: &lb,
			Params: map[string]any{},
		}
	}
	lb := "REQUIRES_MANUAL_LEGAL_REVIEW"
	return RuleConfig{
		Code: code, Severity: SevReview, Blocking: false, Enabled: true,
		LegalBasis: &lb, Params: map[string]any{},
	}
}

func cfgWarningDays(cfg RuleConfig) int {
	if cfg.WarningDays != nil {
		return *cfg.WarningDays
	}
	return 30
}
