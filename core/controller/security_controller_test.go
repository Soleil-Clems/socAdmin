package controller

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/security"
)

func setupSecurityController(t *testing.T) (*SecurityController, func()) {
	t.Helper()

	dir := t.TempDir()
	dbPath := filepath.Join(dir, "test.db")
	repo, err := auth.NewRepository(dbPath)
	if err != nil {
		t.Fatalf("NewRepository: %v", err)
	}

	whitelist := security.NewIPWhitelist()
	ctrl := NewSecurityController(repo, whitelist)
	return ctrl, func() {}
}

func TestGetWhitelist(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	req := httptest.NewRequest("GET", "/api/security/whitelist", nil)
	req.RemoteAddr = "10.0.0.1:1234"
	w := httptest.NewRecorder()
	ctrl.GetWhitelist(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["enabled"] != false {
		t.Errorf("enabled = %v, want false", resp["enabled"])
	}
	ips, ok := resp["ips"].([]interface{})
	if !ok {
		t.Fatal("ips should be an array")
	}
	if len(ips) != 0 {
		t.Errorf("ips length = %d, want 0", len(ips))
	}
}

func TestToggleWhitelist_Enable(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	body := `{"enabled":true}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/toggle", bytes.NewBufferString(body))
	req.RemoteAddr = "10.0.0.1:1234"
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ToggleWhitelist(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200, body: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["enabled"] != true {
		t.Errorf("enabled = %v, want true", resp["enabled"])
	}
	if resp["auto_added"] != true {
		t.Error("client IP should be auto-added when enabling")
	}
}

func TestToggleWhitelist_InvalidJSON(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	req := httptest.NewRequest("POST", "/api/security/whitelist/toggle", bytes.NewBufferString("bad"))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.ToggleWhitelist(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestAddIP_Success(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	body := `{"ip":"192.168.1.100"}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/add", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.AddIP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]string
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["ip"] != "192.168.1.100" {
		t.Errorf("ip = %q, want 192.168.1.100", resp["ip"])
	}
}

func TestAddIP_MissingIP(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	body := `{"ip":""}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/add", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.AddIP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestRemoveIP_Success(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	// Add first
	ctrl.whitelist.AddIP("10.0.0.5")

	body := `{"ip":"10.0.0.5"}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/remove", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.RemoveIP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
}

func TestRemoveIP_MissingIP(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	body := `{"ip":""}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/remove", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.RemoveIP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestBulkAddIPs_Success(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	body := `{"ips":["1.1.1.1","2.2.2.2","# comment","","3.3.3.3"]}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/bulk", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.BulkAddIPs(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	count := resp["count"].(float64)
	if count != 3 {
		t.Errorf("count = %v, want 3 (skips comment and empty)", count)
	}
}

func TestBulkAddIPs_EmptyArray(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	body := `{"ips":[]}`
	req := httptest.NewRequest("POST", "/api/security/whitelist/bulk", bytes.NewBufferString(body))
	req = withClaims(req, 1, auth.RoleAdmin)
	w := httptest.NewRecorder()
	ctrl.BulkAddIPs(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", w.Code)
	}
}

func TestExportWhitelist(t *testing.T) {
	ctrl, cleanup := setupSecurityController(t)
	defer cleanup()

	ctrl.whitelist.AddIP("10.0.0.1")
	ctrl.whitelist.AddIP("10.0.0.2")

	req := httptest.NewRequest("GET", "/api/security/whitelist/export", nil)
	w := httptest.NewRecorder()
	ctrl.ExportWhitelist(w, req)

	ct := w.Header().Get("Content-Type")
	if ct != "text/plain; charset=utf-8" {
		t.Errorf("Content-Type = %q, want text/plain", ct)
	}

	disp := w.Header().Get("Content-Disposition")
	if disp != "attachment; filename=whitelist.txt" {
		t.Errorf("Content-Disposition = %q", disp)
	}

	body := w.Body.String()
	if !containsStr(body, "10.0.0.1") || !containsStr(body, "10.0.0.2") {
		t.Errorf("body should contain both IPs, got %q", body)
	}
}
