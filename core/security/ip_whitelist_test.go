package security

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestIPWhitelist_DisabledAllowsAll(t *testing.T) {
	wl := NewIPWhitelist()
	if !wl.IsAllowed("1.2.3.4:1234") {
		t.Error("disabled whitelist should allow all")
	}
}

func TestIPWhitelist_EnabledNoIPs(t *testing.T) {
	wl := NewIPWhitelist()
	wl.SetEnabled(true)
	if !wl.IsAllowed("1.2.3.4:1234") {
		t.Error("enabled but empty whitelist should allow all")
	}
}

func TestIPWhitelist_EnabledWithIPs(t *testing.T) {
	wl := NewIPWhitelist()
	wl.SetEnabled(true)
	wl.AddIP("10.0.0.1")

	if !wl.IsAllowed("10.0.0.1:5555") {
		t.Error("whitelisted IP should be allowed")
	}
	if wl.IsAllowed("10.0.0.2:5555") {
		t.Error("non-whitelisted IP should be blocked")
	}
}

func TestIPWhitelist_RemoveIP(t *testing.T) {
	wl := NewIPWhitelist()
	wl.SetEnabled(true)
	wl.AddIP("10.0.0.1")
	wl.RemoveIP("10.0.0.1")

	if !wl.IsAllowed("10.0.0.1:5555") {
		t.Error("after removing all IPs, all should be allowed")
	}
}

func TestIPWhitelist_ListIPs(t *testing.T) {
	wl := NewIPWhitelist()
	wl.AddIP("1.2.3.4")
	wl.AddIP("5.6.7.8")

	ips := wl.ListIPs()
	if len(ips) != 2 {
		t.Errorf("ListIPs() len = %d, want 2", len(ips))
	}
}

func TestIPWhitelist_Middleware_Blocked(t *testing.T) {
	wl := NewIPWhitelist()
	wl.SetEnabled(true)
	wl.AddIP("10.0.0.1")

	handler := wl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "99.99.99.99:1234"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
}

func TestIPWhitelist_Middleware_Allowed(t *testing.T) {
	wl := NewIPWhitelist()
	wl.SetEnabled(true)
	wl.AddIP("127.0.0.1")

	handler := wl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "127.0.0.1:1234"
	rec := httptest.NewRecorder()

	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}

func TestExtractIP(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"127.0.0.1:8080", "127.0.0.1"},
		{"[::1]:8080", "::1"},
		{"10.0.0.1", "10.0.0.1"},
		{"", ""},
	}
	for _, tt := range tests {
		got := ExtractIP(tt.input)
		if got != tt.want {
			t.Errorf("ExtractIP(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestNormalizeIP(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"127.0.0.1:8080", "127.0.0.1"},
		{"::ffff:127.0.0.1", "127.0.0.1"},
		{"::1", "::1"},
		{"192.168.1.1", "192.168.1.1"},
	}
	for _, tt := range tests {
		got := NormalizeIP(tt.input)
		if got != tt.want {
			t.Errorf("NormalizeIP(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
