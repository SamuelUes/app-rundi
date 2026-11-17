package programmed

import "testing"

func TestFloatFieldPreservesPrecision(t *testing.T) {
	for _, tc := range []struct {
		input any
		want  float64
	}{
		{12.14567, 12.14567},
		{-86.24731, -86.24731},
		{int64(10), 10},
	} {
		got, ok := floatField(tc.input)
		if !ok || got != tc.want {
			t.Fatalf("floatField(%v) = %v, %v; want %v", tc.input, got, ok, tc.want)
		}
	}
}
