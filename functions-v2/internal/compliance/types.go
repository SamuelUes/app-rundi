// Tipos del motor de compliance (port de types.ts).
package compliance

type Severity string

const (
	SevBlocking Severity = "BLOCKING"
	SevWarning  Severity = "WARNING"
	SevReview   Severity = "REQUIRES_REVIEW"
	SevInfo     Severity = "INFO"
)

type ReasonStatus string

const (
	StatusPass    ReasonStatus = "pass"
	StatusFail    ReasonStatus = "fail"
	StatusWarning ReasonStatus = "warning"
	StatusReview  ReasonStatus = "review"
)

type Reason struct {
	Code     string         `json:"code"`
	Severity Severity       `json:"severity"`
	Blocking bool           `json:"blocking"`
	Status   ReasonStatus   `json:"status"`
	Message  string         `json:"message"`
	Source   *string        `json:"source"`
	Details  map[string]any `json:"details,omitempty"`
}

type Evaluation struct {
	Allowed      bool     `json:"allowed"`
	Status       string   `json:"status"`
	Reasons      []Reason `json:"reasons"`
	EvaluatedAt  string   `json:"evaluatedAt"`
	RulesVersion string   `json:"rulesVersion"`
	DriverID     *string  `json:"driverId,omitempty"`
	VehicleID    *string  `json:"vehicleId,omitempty"`
	ServiceCode  *string  `json:"serviceCode,omitempty"`
}

type RuleConfig struct {
	Code        string         `json:"code"`
	Severity    Severity       `json:"severity"`
	Blocking    bool           `json:"blocking"`
	Enabled     bool           `json:"enabled"`
	WarningDays *int           `json:"warningDays,omitempty"`
	LegalBasis  *string        `json:"legalBasis,omitempty"`
	Params      map[string]any `json:"params"`
}

type CategoryRuleRow struct {
	VehicleType        string
	ServiceCode        string
	RequiredCategories []string
	Severity           string
	ConfirmedBySource  bool
}

type RuleContext struct {
	Today         string
	Rules         map[string]RuleConfig
	CategoryRules []CategoryRuleRow
}

// ---------- facts ----------

type docFactsBase struct {
	ID     string
	Status string
}

type DriverFacts struct {
	ID              string
	UserID          string
	AccountStatus   *string
	DocumentsStatus *string
}

type VehicleFacts struct {
	ID           string
	DriverID     string
	Plate        string
	Type         *string
	ServiceType  *string
	VehicleClass *string
	Vin          *string
	Chasis       *string
	Motor        *string
	Year         *int
	EmissionDate *string
	IsActive     bool
	CreatedAt    *string
}

type LicenseFacts struct {
	docFactsBase
	LicenseNumber  *string
	LicenseType    string
	Categories     []string
	IssueDate      *string
	ExpiryDate     *string
	ReportedStatus *string
}

type CirculationFacts struct {
	docFactsBase
	CardNumber          *string
	IssuedAt            *string
	DeclaredValidUntil  *string
	DeclaredPlate       *string
	DeclaredVin         *string
	DeclaredChasis      *string
	DeclaredMotor       *string
	DeclaredServiceType *string
}

type InsuranceFacts struct {
	docFactsBase
	PolicyNumber   *string
	InsurerCode    *string
	CoverageType   string
	EffectiveFrom  *string
	EffectiveUntil *string
	InsuredPlate   *string
	InsuredVin     *string
	InsuredMotor   *string
	InsuredChasis  *string
}

type PeriodicFacts struct {
	docFactsBase
	At         *string // inspected_at | tested_at
	Result     *string
	ValidUntil *string
}

type RoadTaxFacts struct {
	docFactsBase
	TaxYear      int
	PaidAt       *string
	Exempt       bool
	ExemptReason *string
}

type RevisadoFacts struct {
	docFactsBase
	StickerYear *int
	IssuedAt    *string
	ValidUntil  *string
}

type DuplicateFacts struct {
	LicenseNumberDriverIDs []string
	PlateVehicleIDs        []string
	VinVehicleIDs          []string
	PolicyVehicleIDs       []string
}

type Facts struct {
	Driver               *DriverFacts
	Vehicle              *VehicleFacts // nil + vehicleRequested → VEHICLE_NOT_FOUND
	VehicleRequested     bool
	License              *LicenseFacts
	Circulation          *CirculationFacts
	RcInsurance          *InsuranceFacts
	HasPassengerCoverage bool
	Inspection           *PeriodicFacts
	Emissions            *PeriodicFacts
	RoadTax              *RoadTaxFacts
	Revisado             *RevisadoFacts
	Duplicates           DuplicateFacts
	ServiceCode          *string
}
