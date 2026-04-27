package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCSRF_SetsCookieOnFirstRequest(t *testing.T) {
	handler := CSRFProtection("testprefix")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	found := false
	for _, c := range rec.Result().Cookies() {
		if c.Name == csrfCookieName {
			found = true
			if c.Value == "" {
				t.Error("CSRF cookie should not be empty")
			}
			if c.HttpOnly {
				t.Error("CSRF cookie must be readable by JS (HttpOnly=false)")
			}
		}
	}
	if !found {
		t.Error("CSRF cookie should be set on first request")
	}
}

func TestCSRF_GETSkipsValidation(t *testing.T) {
	handler := CSRFProtection("testprefix")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/some/path", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "token123"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("GET should skip CSRF check, got %d", rec.Code)
	}
}

func TestCSRF_POSTWithoutToken_Returns403(t *testing.T) {
	handler := CSRFProtection("testprefix")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/some/path", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "token123"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("POST without CSRF header should be 403, got %d", rec.Code)
	}
}

func TestCSRF_POSTWithWrongToken_Returns403(t *testing.T) {
	handler := CSRFProtection("testprefix")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/some/path", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "token123"})
	req.Header.Set(csrfHeaderName, "wrong-token")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("POST with wrong CSRF token should be 403, got %d", rec.Code)
	}
}

func TestCSRF_POSTWithMatchingToken_Passes(t *testing.T) {
	handler := CSRFProtection("testprefix")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("POST", "/some/path", nil)
	req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "token123"})
	req.Header.Set(csrfHeaderName, "token123")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("POST with matching CSRF token should pass, got %d", rec.Code)
	}
}

func TestCSRF_AuthEndpointsSkipCheck(t *testing.T) {
	handler := CSRFProtection("abc123")(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	endpoints := []string{
		"/abc123/api/auth/login",
		"/abc123/api/auth/register",
		"/abc123/api/auth/refresh",
	}

	for _, ep := range endpoints {
		req := httptest.NewRequest("POST", ep, nil)
		req.AddCookie(&http.Cookie{Name: csrfCookieName, Value: "token123"})
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Errorf("auth endpoint %s should skip CSRF, got %d", ep, rec.Code)
		}
	}
}

func TestIsAuthEndpoint(t *testing.T) {
	tests := []struct {
		path   string
		prefix string
		want   bool
	}{
		{"/abc/api/auth/login", "abc", true},
		{"/abc/api/auth/register", "abc", true},
		{"/abc/api/auth/refresh", "abc", true},
		{"/abc/api/auth/logout", "abc", false},
		{"/abc/api/databases", "abc", false},
		{"/other/api/auth/login", "abc", false},
	}
	for _, tt := range tests {
		got := isAuthEndpoint(tt.path, tt.prefix)
		if got != tt.want {
			t.Errorf("isAuthEndpoint(%q, %q) = %v, want %v", tt.path, tt.prefix, got, tt.want)
		}
	}
}

func TestGenerateCSRFToken_Unique(t *testing.T) {
	t1 := generateCSRFToken()
	t2 := generateCSRFToken()
	if t1 == t2 {
		t.Error("CSRF tokens should be unique")
	}
	if len(t1) != 64 {
		t.Errorf("CSRF token length = %d, want 64 hex chars", len(t1))
	}
}
