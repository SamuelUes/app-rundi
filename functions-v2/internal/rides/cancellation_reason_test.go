package rides

import (
	"slices"
	"testing"
)

func TestCancellationReasonCodes(t *testing.T) {
	for _, reason := range []string{"wait_too_long", "price_too_high", "plans_changed", "wrong_details", "other", "skipped"} {
		if codes := cancellationReasonCodes(reason); !slices.Equal(codes, []string{reason}) {
			t.Errorf("expected %q to parse as [%q], got %v", reason, reason, codes)
		}
	}
	for _, reason := range []string{"", "cancelled", "OTHER", "not_a_code"} {
		if codes := cancellationReasonCodes(reason); len(codes) != 0 {
			t.Errorf("unexpected codes %v for %q", codes, reason)
		}
	}
	if codes := cancellationReasonCodes("wait_too_long,price_too_high"); !slices.Equal(codes, []string{"wait_too_long", "price_too_high"}) {
		t.Errorf("multi-select list not parsed: %v", codes)
	}
	if codes := cancellationReasonCodes("other, wrong_details"); !slices.Equal(codes, []string{"other", "wrong_details"}) {
		t.Errorf("trimmed multi-select not parsed: %v", codes)
	}
	if codes := cancellationReasonCodes("wait_too_long,wait_too_long"); !slices.Equal(codes, []string{"wait_too_long"}) {
		t.Errorf("duplicates not removed: %v", codes)
	}
	if codes := cancellationReasonCodes("bogus_code,other"); !slices.Equal(codes, []string{"other"}) {
		t.Errorf("invalid codes not filtered: %v", codes)
	}
}
