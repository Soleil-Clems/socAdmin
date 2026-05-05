package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiter_AllowsUnderLimit(t *testing.T) {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    5,
		window:   time.Minute,
	}

	for i := 0; i < 5; i++ {
		if !rl.IsAllowed("10.0.0.1") {
			t.Errorf("request %d should be allowed", i+1)
		}
	}
}

func TestRateLimiter_BlocksOverLimit(t *testing.T) {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    3,
		window:   time.Minute,
	}

	for i := 0; i < 3; i++ {
		rl.IsAllowed("10.0.0.1")
	}

	if rl.IsAllowed("10.0.0.1") {
		t.Error("4th request should be blocked")
	}
}

func TestRateLimiter_DifferentIPs(t *testing.T) {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    2,
		window:   time.Minute,
	}

	rl.IsAllowed("10.0.0.1")
	rl.IsAllowed("10.0.0.1")

	if !rl.IsAllowed("10.0.0.2") {
		t.Error("different IP should have its own counter")
	}
}

func TestRateLimiter_WindowExpiry(t *testing.T) {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    2,
		window:   50 * time.Millisecond,
	}

	rl.IsAllowed("10.0.0.1")
	rl.IsAllowed("10.0.0.1")

	if rl.IsAllowed("10.0.0.1") {
		t.Error("should be blocked before window expires")
	}

	time.Sleep(60 * time.Millisecond)

	if !rl.IsAllowed("10.0.0.1") {
		t.Error("should be allowed after window expires")
	}
}

func TestRateLimiter_Cleanup(t *testing.T) {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    5,
		window:   10 * time.Millisecond,
	}

	rl.IsAllowed("10.0.0.1")
	rl.IsAllowed("10.0.0.2")

	time.Sleep(20 * time.Millisecond)
	rl.cleanup()

	rl.mu.Lock()
	count := len(rl.requests)
	rl.mu.Unlock()

	if count != 0 {
		t.Errorf("cleanup should remove expired entries, got %d", count)
	}
}

func TestRateLimiter_Middleware_Returns429(t *testing.T) {
	rl := &RateLimiter{
		requests: make(map[string][]time.Time),
		limit:    1,
		window:   time.Minute,
	}

	handler := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// First request — allowed
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("first request: status = %d, want 200", rec.Code)
	}

	// Second request — blocked
	rec = httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("second request: status = %d, want 429", rec.Code)
	}
	if rec.Header().Get("Retry-After") == "" {
		t.Error("429 response should include Retry-After header")
	}
}
