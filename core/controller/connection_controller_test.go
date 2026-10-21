package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/service"
)

func setupConnectionController(t *testing.T) (*ConnectionController, int64, func()) {
	t.Helper()
	auth.InitJWTSecret([]byte("test-secret-key-for-unit-tests-32b!"))

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	repo, err := auth.NewRepository(dbPath)
	if err != nil {
		t.Fatalf("NewRepository: %v", err)
	}

	// Create a user so foreign key constraint is satisfied
	authSvc := service.NewAuthService(repo)
	result, err := authSvc.Register("conn@test.com", "StrongPass123!")
	if err != nil {
		t.Fatalf("Register: %v", err)
	}
	userID := result.User.ID

	dbService := service.NewDatabaseService()
	encKey := []byte("0123456789abcdef0123456789abcdef") // 32 bytes for AES-256
	ctrl := NewConnectionController(repo, dbService, encKey)
	return ctrl, userID, func() {}
}

func TestSaveConnection_Success(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	body := `{"name":"local-mysql","type":"mysql","host":"127.0.0.1","port":3306,"user":"root","password":"secret"}`
	req := httptest.NewRequest("POST", "/api/connections", bytes.NewBufferString(body))
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.SaveConnection(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want 201, body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "saved" {
		t.Errorf("status = %v, want saved", resp["status"])
	}
}

func TestSaveConnection_MissingFields(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	tests := []struct {
		name string
		body string
	}{
		{"missing name", `{"name":"","type":"mysql","host":"127.0.0.1","port":3306,"user":"root","password":"x"}`},
		{"missing host", `{"name":"test","type":"mysql","host":"","port":3306,"user":"root","password":"x"}`},
		{"missing user", `{"name":"test","type":"mysql","host":"127.0.0.1","port":3306,"user":"","password":"x"}`},
		{"missing type", `{"name":"test","type":"","host":"127.0.0.1","port":3306,"user":"root","password":"x"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("POST", "/api/connections", bytes.NewBufferString(tt.body))
			req = withClaims(req, userID, auth.RoleAdmin)
			w := httptest.NewRecorder()
			ctrl.SaveConnection(w, req)
			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want 400", w.Code)
			}
		})
	}
}

func TestSaveConnection_InvalidJSON(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/connections", bytes.NewBufferString("not json"))
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.SaveConnection(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestListConnections_Empty(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/api/connections", nil)
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ListConnections(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp []interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp) != 0 {
		t.Errorf("expected empty list, got %d items", len(resp))
	}
}

func TestListConnections_NoPasswordLeak(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	// Save a connection
	saveBody := `{"name":"test-conn","type":"mysql","host":"127.0.0.1","port":3306,"user":"root","password":"supersecret"}`
	saveReq := httptest.NewRequest("POST", "/api/connections", bytes.NewBufferString(saveBody))
	saveReq = withClaims(saveReq, userID, auth.RoleAdmin)
	saveW := httptest.NewRecorder()
	ctrl.SaveConnection(saveW, saveReq)

	// List connections
	listReq := httptest.NewRequest("GET", "/api/connections", nil)
	listReq = withClaims(listReq, userID, auth.RoleAdmin)
	listW := httptest.NewRecorder()
	ctrl.ListConnections(listW, listReq)

	body := listW.Body.String()
	if containsStr(body, "supersecret") {
		t.Error("password should not be in list response")
	}
	if containsStr(body, "password") {
		t.Error("password field should not appear in list response")
	}
}

func TestDeleteConnection_InvalidID(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	req := httptest.NewRequest("DELETE", "/api/connections/abc", nil)
	req.SetPathValue("id", "abc")
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.DeleteConnection(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestUseSavedConnection_InvalidID(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/connections/xyz/use", nil)
	req.SetPathValue("id", "xyz")
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.UseSavedConnection(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestUseSavedConnection_NotFound(t *testing.T) {
	ctrl, userID, cleanup := setupConnectionController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/connections/99999/use", nil)
	req.SetPathValue("id", "99999")
	req = withClaims(req, userID, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.UseSavedConnection(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", w.Code)
	}
}
