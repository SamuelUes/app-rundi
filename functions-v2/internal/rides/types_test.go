package rides

import "testing"

// Máquina de estados — contratos derivados del CHECK de rides + RTDB v1.
func TestCanTransition(t *testing.T) {
	cases := []struct {
		from, to RideStatus
		want     bool
	}{
		{StatusRequested, StatusDriverOffered, true},
		{StatusRequested, StatusAccepted, true},
		{StatusRequested, StatusCanceled, true},
		{StatusDriverOffered, StatusAccepted, true},
		{StatusAccepted, StatusDriverOnRoute, true},
		{StatusDriverOnRoute, StatusDriverArrived, true},
		{StatusDriverArrived, StatusInProgress, true},
		{StatusInProgress, StatusPendingPayment, true},
		{StatusInProgress, StatusCompleted, true},
		{StatusPendingPayment, StatusCompleted, true},
		{StatusPendingPayment, StatusRatingDone, true},
		// Inválidas / estados terminales
		{StatusCompleted, StatusInProgress, false},
		{StatusCanceled, StatusAccepted, false},
		{StatusCompleted, StatusCanceled, false},
		{StatusRequested, StatusInProgress, false},
		{StatusAccepted, StatusRequested, false},
		{StatusRatingDone, StatusCompleted, false},
	}
	for _, c := range cases {
		if got := CanTransition(c.from, c.to); got != c.want {
			t.Errorf("CanTransition(%s→%s)=%v want %v", c.from, c.to, got, c.want)
		}
	}
}

// Terminales no tienen salidas.
func TestTerminalStatesHaveNoTransitions(t *testing.T) {
	for _, s := range []RideStatus{StatusCompleted, StatusCanceled, StatusRatingDone, StatusRatingSkipped} {
		if len(transitions[s]) != 0 {
			t.Errorf("estado terminal %s tiene transiciones: %v", s, transitions[s])
		}
	}
}
