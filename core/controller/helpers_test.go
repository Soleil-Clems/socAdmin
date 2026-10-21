package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/soleilouisol/socAdmin/core/auth"
)

func TestRequestUserID_WithClaims(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	claims := &auth.Claims{UserID: 42, Email: "test@test.com", Role: auth.RoleAdmin}
	ctx := context.WithValue(req.Context(), auth.ClaimsKey, claims)
	req = req.WithContext(ctx)

	if id := requestUserID(req); id != 42 {
		t.Errorf("requestUserID() = %d, want 42", id)
	}
}

func TestRequestUserID_NoClaims(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)

	if id := requestUserID(req); id != 0 {
		t.Errorf("requestUserID() = %d, want 0", id)
	}
}

func TestRequestIP(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "192.168.1.1:12345"

	ip := requestIP(req)
	if ip == "" {
		t.Error("requestIP() returned empty string")
	}
}

func TestValidatePathIdent_Valid(t *testing.T) {
	w := httptest.NewRecorder()
	if !validatePathIdent(w, "my_table", "table") {
		t.Error("validatePathIdent() should accept valid identifier")
	}
	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestValidatePathIdent_Invalid(t *testing.T) {
	w := httptest.NewRecorder()
	if validatePathIdent(w, "DROP TABLE;--", "table") {
		t.Error("validatePathIdent() should reject SQL injection")
	}
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestJsonResponse(t *testing.T) {
	w := httptest.NewRecorder()
	jsonResponse(w, http.StatusOK, map[string]string{"key": "value"})

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	ct := w.Header().Get("Content-Type")
	if ct != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", ct)
	}
	body := w.Body.String()
	if body == "" {
		t.Error("body is empty")
	}
}

func TestJsonError(t *testing.T) {
	w := httptest.NewRecorder()
	jsonError(w, http.StatusBadRequest, "something went wrong")

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
	body := w.Body.String()
	if !contains(body, "something went wrong") {
		t.Errorf("body should contain error message, got %q", body)
	}
}

func TestSanitizeErrorMessage(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"no path", "connection refused", "connection refused"},
		{"unix path", "open /home/user/file.db: permission denied", "open [path]: permission denied"},
		{"windows path", "open C:\\Users\\test: denied", "open [path]:\\Users\\test: denied"},
		{"tmp path", "failed /tmp/socadmin.db: locked", "failed [path]: locked"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeErrorMessage(tt.input)
			if got != tt.want {
				t.Errorf("sanitizeErrorMessage(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsStr(s, sub))
}

func containsStr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
