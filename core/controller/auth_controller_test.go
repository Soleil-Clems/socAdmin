package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/service"
)

func setupAuthController(t *testing.T) (*AuthController, *service.AuthService, func()) {
	t.Helper()
	auth.InitJWTSecret([]byte("test-secret-key-for-unit-tests-32b!"))

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	repo, err := auth.NewRepository(dbPath)
	if err != nil {
		t.Fatalf("NewRepository: %v", err)
	}

	authSvc := service.NewAuthService(repo)
	ctrl := NewAuthController(authSvc)
	return ctrl, authSvc, func() { os.Remove(dbPath) }
}

func withClaims(r *http.Request, userID int64, role string) *http.Request {
	claims := &auth.Claims{UserID: userID, Email: "test@test.com", Role: role}
	ctx := context.WithValue(r.Context(), auth.ClaimsKey, claims)
	return r.WithContext(ctx)
}

func TestRegister_Success(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"user@example.com","password":"StrongPass123!"}`
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	ctrl.Register(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201, body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["email"] != "user@example.com" {
		t.Errorf("email = %v, want user@example.com", resp["email"])
	}

	cookies := w.Result().Cookies()
	foundAccess, foundRefresh := false, false
	for _, c := range cookies {
		if c.Name == "access_token" && c.Value != "" {
			foundAccess = true
		}
		if c.Name == "refresh_token" && c.Value != "" {
			foundRefresh = true
		}
	}
	if !foundAccess {
		t.Error("missing access_token cookie")
	}
	if !foundRefresh {
		t.Error("missing refresh_token cookie")
	}
}

func TestRegister_MissingFields(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	tests := []struct {
		name string
		body string
	}{
		{"empty email", `{"email":"","password":"StrongPass123!"}`},
		{"empty password", `{"email":"user@test.com","password":""}`},
		{"both empty", `{"email":"","password":""}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(tt.body))
			w := httptest.NewRecorder()
			ctrl.Register(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", w.Code)
			}
		})
	}
}

func TestRegister_WeakPassword(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"user@test.com","password":"123"}`
	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	ctrl.Register(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestRegister_DuplicateEmail(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"dup@test.com","password":"StrongPass123!"}`

	req1 := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	w1 := httptest.NewRecorder()
	ctrl.Register(w1, req1)
	if w1.Code != http.StatusCreated {
		t.Fatalf("first register failed: %d", w1.Code)
	}

	req2 := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(body))
	w2 := httptest.NewRecorder()
	ctrl.Register(w2, req2)
	if w2.Code != http.StatusConflict {
		t.Errorf("status = %d, want 409", w2.Code)
	}
}

func TestRegister_InvalidJSON(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString("{invalid"))
	w := httptest.NewRecorder()
	ctrl.Register(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestLogin_Success(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	// Register first
	regBody := `{"email":"login@test.com","password":"StrongPass123!"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regW := httptest.NewRecorder()
	ctrl.Register(regW, regReq)

	// Login
	body := `{"email":"login@test.com","password":"StrongPass123!"}`
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	ctrl.Login(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200, body: %s", w.Code, w.Body.String())
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["role"] == "" {
		t.Error("response should contain role")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	regBody := `{"email":"wrong@test.com","password":"StrongPass123!"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regW := httptest.NewRecorder()
	ctrl.Register(regW, regReq)

	body := `{"email":"wrong@test.com","password":"WrongPassword456!"}`
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	ctrl.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestLogin_NonexistentUser(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"nobody@test.com","password":"StrongPass123!"}`
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	ctrl.Login(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestLogin_MissingFields(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"","password":""}`
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewBufferString(body))
	w := httptest.NewRecorder()
	ctrl.Login(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestRefresh_MissingCookie(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	w := httptest.NewRecorder()
	ctrl.Refresh(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestRefresh_InvalidToken(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "invalid-token"})
	w := httptest.NewRecorder()
	ctrl.Refresh(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestRefresh_ValidToken(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	// Register to get tokens
	regBody := `{"email":"refresh@test.com","password":"StrongPass123!"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regW := httptest.NewRecorder()
	ctrl.Register(regW, regReq)

	var refreshToken string
	for _, c := range regW.Result().Cookies() {
		if c.Name == "refresh_token" {
			refreshToken = c.Value
		}
	}
	if refreshToken == "" {
		t.Fatal("no refresh_token from register")
	}

	req := httptest.NewRequest("POST", "/api/auth/refresh", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: refreshToken})
	w := httptest.NewRecorder()
	ctrl.Refresh(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200, body: %s", w.Code, w.Body.String())
	}
}

func TestMe(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	// Register first
	regBody := `{"email":"me@test.com","password":"StrongPass123!"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regW := httptest.NewRecorder()
	ctrl.Register(regW, regReq)

	var regResp map[string]interface{}
	json.Unmarshal(regW.Body.Bytes(), &regResp)
	userID := int64(regResp["id"].(float64))

	req := httptest.NewRequest("GET", "/api/auth/me", nil)
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.Me(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestLogout(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: "refresh_token", Value: "some-token"})
	w := httptest.NewRecorder()
	ctrl.Logout(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	for _, c := range w.Result().Cookies() {
		if c.Name == "access_token" && c.MaxAge != -1 {
			t.Error("access_token cookie should be expired")
		}
		if c.Name == "refresh_token" && c.MaxAge != -1 {
			t.Error("refresh_token cookie should be expired")
		}
	}
}

func TestListAppUsers(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	// Register a user
	regBody := `{"email":"list@test.com","password":"StrongPass123!"}`
	regReq := httptest.NewRequest("POST", "/api/auth/register", bytes.NewBufferString(regBody))
	regW := httptest.NewRecorder()
	ctrl.Register(regW, regReq)

	req := httptest.NewRequest("GET", "/api/users", nil)
	w := httptest.NewRecorder()
	ctrl.ListAppUsers(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var users []interface{}
	json.Unmarshal(w.Body.Bytes(), &users)
	if len(users) == 0 {
		t.Error("expected at least one user")
	}
}

func TestUpdateAppUserRole_InvalidID(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"role":"admin"}`
	req := httptest.NewRequest("PUT", "/api/users/abc/role", bytes.NewBufferString(body))
	req.SetPathValue("id", "abc")
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.UpdateAppUserRole(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestDeleteAppUser_CannotDeleteSelf(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("DELETE", "/api/users/42", nil)
	req.SetPathValue("id", "42")
	req = withClaims(req, 42, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.DeleteAppUser(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestDeleteAppUser_InvalidID(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("DELETE", "/api/users/xyz", nil)
	req.SetPathValue("id", "xyz")
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.DeleteAppUser(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestCreateAppUser_Success(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"new@test.com","password":"StrongPass123!","role":"readonly"}`
	req := httptest.NewRequest("POST", "/api/users/app", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.CreateAppUser(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201, body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["email"] != "new@test.com" {
		t.Errorf("email = %v, want new@test.com", resp["email"])
	}
	if resp["role"] != "readonly" {
		t.Errorf("role = %v, want readonly", resp["role"])
	}
}

func TestCreateAppUser_InvalidRole(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"bad@test.com","password":"StrongPass123!","role":"superadmin"}`
	req := httptest.NewRequest("POST", "/api/users/app", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.CreateAppUser(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestCreateAppUser_MissingFields(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"email":"","password":""}`
	req := httptest.NewRequest("POST", "/api/users/app", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.CreateAppUser(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestChangePassword_MissingFields(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	body := `{"current_password":"","new_password":""}`
	req := httptest.NewRequest("POST", "/api/auth/password", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ChangePassword(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestChangePassword_InvalidJSON(t *testing.T) {
	ctrl, _, cleanup := setupAuthController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/auth/password", bytes.NewBufferString("not json"))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ChangePassword(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestIsSecureRequest(t *testing.T) {
	t.Run("plain HTTP", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		if isSecureRequest(req) {
			t.Error("plain HTTP should not be secure")
		}
	})

	t.Run("with SECURE_COOKIES env", func(t *testing.T) {
		os.Setenv("SECURE_COOKIES", "true")
		defer os.Unsetenv("SECURE_COOKIES")

		req := httptest.NewRequest("GET", "/", nil)
		if !isSecureRequest(req) {
			t.Error("should be secure with SECURE_COOKIES=true")
		}
	})
}
