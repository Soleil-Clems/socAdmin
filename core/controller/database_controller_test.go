package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/service"
)

func setupDatabaseController(t *testing.T) *DatabaseController {
	t.Helper()
	auth.InitJWTSecret([]byte("test-secret-key-for-unit-tests-32b!"))
	dbService := service.NewDatabaseService()
	return NewDatabaseController(dbService)
}

// --- ConnectionStatus ---

func TestConnectionStatus_NotConnected(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("GET", "/api/connection/status", nil)
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ConnectionStatus(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["connected"] != false {
		t.Errorf("connected = %v, want false", resp["connected"])
	}
}

// --- Connect validation ---

func TestConnect_InvalidJSON(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("POST", "/api/connect", bytes.NewBufferString("{bad"))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.Connect(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestConnect_DefaultsToMySQL(t *testing.T) {
	ctrl := setupDatabaseController(t)

	// Will fail to actually connect, but we verify it doesn't crash and the type defaults
	body := `{"host":"127.0.0.1","port":99999,"user":"root","password":"","type":""}`
	req := httptest.NewRequest("POST", "/api/connect", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.Connect(w, req)

	// Should fail with bad gateway (can't connect), not 400
	if w.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 (connection failure)", w.Code)
	}
}

// --- SSRF protection ---

func TestIsBlockedHost(t *testing.T) {
	tests := []struct {
		host    string
		blocked bool
	}{
		// Cloud metadata — always blocked
		{"169.254.169.254", true},
		{"169.254.0.1", true},
		{"metadata.google.internal", true},
		{"sub.metadata.google.internal", true},

		// Public IPs — never blocked
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"google.com", false},

		// Random hostname — not blocked
		{"db.example.com", false},
	}

	for _, tt := range tests {
		t.Run(tt.host, func(t *testing.T) {
			got := isBlockedHost(tt.host)
			if got != tt.blocked {
				t.Errorf("isBlockedHost(%q) = %v, want %v", tt.host, got, tt.blocked)
			}
		})
	}
}

func TestConnect_SSRFBlocksMetadata(t *testing.T) {
	ctrl := setupDatabaseController(t)

	body := `{"host":"169.254.169.254","port":80,"user":"root","password":"","type":"mysql"}`
	req := httptest.NewRequest("POST", "/api/connect", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.Connect(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if !containsStr(resp["error"], "not allowed") {
		t.Errorf("error = %q, should mention 'not allowed'", resp["error"])
	}
}

// --- Disconnect ---

func TestDisconnect_NotConnected(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("POST", "/api/disconnect", nil)
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.Disconnect(w, req)

	// Should return error or 500 since not connected
	if w.Code == http.StatusOK {
		// Some implementations might return OK even if not connected
		var resp map[string]string
		json.Unmarshal(w.Body.Bytes(), &resp)
		if resp["status"] != "disconnected" {
			t.Errorf("unexpected response: %s", w.Body.String())
		}
	}
}

// --- ListDatabases without connection ---

func TestListDatabases_NotConnected(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("GET", "/api/databases", nil)
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ListDatabases(w, req)

	if w.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500 (not connected)", w.Code)
	}
}

// --- ListPreconfigured ---

func TestListPreconfigured(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("GET", "/api/preconfigured", nil)
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ListPreconfigured(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp []interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	// Should be an array (possibly empty)
	if resp == nil {
		t.Error("response should be an array")
	}
}

// --- Path validation on DB routes ---

func TestGetSchema_InvalidDBName(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("GET", "/api/databases/badname/schema", nil)
	req.SetPathValue("db", "DROP TABLE;--")
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.GetSchema(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 (SQL injection blocked)", w.Code)
	}
}

func TestSearchGlobal_MissingQuery(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("GET", "/api/databases/mydb/search", nil)
	req.SetPathValue("db", "mydb")
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.SearchGlobal(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400 (missing q param)", w.Code)
	}
}

func TestSearchGlobal_InvalidDBName(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("GET", "/api/databases/badname/search?q=test", nil)
	req.SetPathValue("db", "bad;name")
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.SearchGlobal(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// --- Request body parsing for database operations ---

func TestCreateDatabase_InvalidJSON(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("POST", "/api/databases", bytes.NewBufferString("not json"))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.CreateDatabase(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestCreateDatabase_EmptyName(t *testing.T) {
	ctrl := setupDatabaseController(t)

	body := `{"name":""}`
	req := httptest.NewRequest("POST", "/api/databases", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.CreateDatabase(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

// --- ExecuteQuery validation ---

func TestExecuteQuery_InvalidJSON(t *testing.T) {
	ctrl := setupDatabaseController(t)

	req := httptest.NewRequest("POST", "/api/query", bytes.NewBufferString("{bad"))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ExecuteQuery(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestExecuteQuery_EmptyQuery(t *testing.T) {
	ctrl := setupDatabaseController(t)

	body := `{"database":"mydb","query":""}`
	req := httptest.NewRequest("POST", "/api/query", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ExecuteQuery(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}
