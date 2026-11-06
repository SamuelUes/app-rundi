package compliance

import (
	"reflect"
	"testing"
)

func TestSignalKeysForFacts(t *testing.T) {
	str := func(s string) *string { return &s }
	for _, tt := range []struct {
		name     string
		driverID string
		facts    *Facts
		want     []signalKey
	}{
		{
			"driver only",
			"d-1",
			&Facts{},
			[]signalKey{{"rules", "global"}, {"driver", "d-1"}},
		},
		{
			"license and empty vehicle fields",
			"d-1",
			&Facts{
				License: &LicenseFacts{LicenseNumber: str("L-99")},
				Vehicle: &VehicleFacts{ID: "v-1", Plate: "M123"},
			},
			[]signalKey{
				{"rules", "global"}, {"driver", "d-1"}, {"license", "L-99"},
				{"vehicle", "v-1"}, {"plate", "m123"},
			},
		},
		{
			"full vehicle facts in deterministic order",
			"d-1",
			&Facts{
				License: &LicenseFacts{LicenseNumber: str("L-99")},
				Vehicle: &VehicleFacts{ID: "v-1", Plate: "AbC", Vin: str("V1"), Chasis: str("C1"), Motor: str("M1")},
				RcInsurance: &InsuranceFacts{
					PolicyNumber: str("P-7"),
				},
			},
			[]signalKey{
				{"rules", "global"}, {"driver", "d-1"}, {"license", "L-99"},
				{"vehicle", "v-1"}, {"plate", "abc"},
				{"vin", "V1"}, {"chasis", "C1"}, {"motor", "M1"}, {"policy", "P-7"},
			},
		},
		{
			"no vehicle no license",
			"d-2",
			&Facts{VehicleRequested: true},
			[]signalKey{{"rules", "global"}, {"driver", "d-2"}},
		},
		{
			"empty plate keeps a key that fails closed",
			"d-3",
			&Facts{Vehicle: &VehicleFacts{ID: "v-3", Plate: ""}},
			[]signalKey{{"rules", "global"}, {"driver", "d-3"}, {"vehicle", "v-3"}, {"plate", ""}},
		},
		{
			"nil facts",
			"d-4",
			nil,
			[]signalKey{{"rules", "global"}, {"driver", "d-4"}},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			got := signalKeysForFacts(tt.driverID, tt.facts)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("keys=%v want=%v", got, tt.want)
			}
		})
	}
}
