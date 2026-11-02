package rides

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestWakeOutboxIsBoundedAndBestEffort(t *testing.T) {
	h := NewHandler(nil)
	called := false
	h.SetConsumerWakeup(func(ctx context.Context) error {
		called = true
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > time.Second {
			t.Error("wake-up must have a bounded deadline")
		}
		return errors.New("queue unavailable")
	})
	h.wakeOutbox(context.Background(), "ride")
	if !called {
		t.Fatal("wake-up was not attempted")
	}
}
