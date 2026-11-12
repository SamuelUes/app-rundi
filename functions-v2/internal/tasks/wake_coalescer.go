package tasks

import "sync"

type wakeCoalescer struct {
	mu      sync.Mutex
	window  int64
	active  bool
	success bool
}

func (c *wakeCoalescer) Do(window int64, wake func() error) error {
	c.mu.Lock()
	if c.window == window && (c.active || c.success) {
		c.mu.Unlock()
		return nil
	}
	c.window, c.active, c.success = window, true, false
	c.mu.Unlock()

	err := wake()
	c.mu.Lock()
	if c.window == window {
		c.active = false
		c.success = err == nil
	}
	c.mu.Unlock()
	return err
}
