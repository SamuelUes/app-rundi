package tasks

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
)

func TestWakeCoalescerConcurrentAndRetry(t *testing.T) {
	var c wakeCoalescer
	var calls atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_ = c.Do(10, func() error {
			calls.Add(1)
			close(started)
			<-release
			return errors.New("failed")
		})
	}()
	<-started
	if err := c.Do(10, func() error { calls.Add(1); return nil }); err != nil {
		t.Fatal(err)
	}
	close(release)
	wg.Wait()
	if err := c.Do(10, func() error { calls.Add(1); return nil }); err != nil {
		t.Fatal(err)
	}
	if err := c.Do(10, func() error { calls.Add(1); return nil }); err != nil {
		t.Fatal(err)
	}
	if err := c.Do(11, func() error { calls.Add(1); return nil }); err != nil {
		t.Fatal(err)
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("calls=%d, want 3", got)
	}
}
