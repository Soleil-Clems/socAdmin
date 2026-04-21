package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthMiddleware_NoCookie_Returns401(t *testing.T) {
	handler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestAuthMiddleware_EmptyCookie_Returns401(t *testing.T) {
	handler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: ""})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestAuthMiddleware_InvalidToken_Returns401(t *testing.T) {
	InitJWTSecret([]byte("test-secret-key-for-middleware-00"))

	handler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: "invalid-token"})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rec.Code)
	}
}

func TestAuthMiddleware_ValidToken_Passes(t *testing.T) {
	InitJWTSecret([]byte("test-secret-key-for-middleware-00"))

	user := &User{ID: 1, Email: "test@test.com", Role: RoleAdmin}
	token, err := GenerateAccessToken(user)
	if err != nil {
		t.Fatal(err)
	}

	var gotClaims *Claims
	handler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotClaims = r.Context().Value(ClaimsKey).(*Claims)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
	if gotClaims == nil || gotClaims.UserID != 1 {
		t.Error("claims should be set in context with correct user ID")
	}
}

func TestAuthFromCookie_NonAdmin_Returns403(t *testing.T) {
	InitJWTSecret([]byte("test-secret-key-for-middleware-00"))

	user := &User{ID: 2, Email: "reader@test.com", Role: RoleReadonly}
	token, _ := GenerateAccessToken(user)

	handler := AuthFromCookie(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for non-admin", rec.Code)
	}
}

func TestAuthFromCookie_Admin_Passes(t *testing.T) {
	InitJWTSecret([]byte("test-secret-key-for-middleware-00"))

	user := &User{ID: 1, Email: "admin@test.com", Role: RoleAdmin}
	token, _ := GenerateAccessToken(user)

	handler := AuthFromCookie(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/", nil)
	req.AddCookie(&http.Cookie{Name: "access_token", Value: token})
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 for admin", rec.Code)
	}
}

func TestRequireAdmin_NoClaimsInContext_Returns403(t *testing.T) {
	handler := RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest("GET", "/", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
}

func TestRequireAdmin_ReadonlyUser_Returns403(t *testing.T) {
	handler := RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	claims := &Claims{UserID: 2, Role: RoleReadonly}
	ctx := context.WithValue(context.Background(), ClaimsKey, claims)
	req := httptest.NewRequest("GET", "/", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403 for readonly", rec.Code)
	}
}

func TestRequireAdmin_AdminUser_Passes(t *testing.T) {
	handler := RequireAdmin(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	claims := &Claims{UserID: 1, Role: RoleAdmin}
	ctx := context.WithValue(context.Background(), ClaimsKey, claims)
	req := httptest.NewRequest("GET", "/", nil).WithContext(ctx)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200 for admin", rec.Code)
	}
}
