package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/logger"
	"github.com/soleilouisol/socAdmin/core/security"
)

type SecurityController struct {
	repo      *auth.Repository
	whitelist *security.IPWhitelist
}

func NewSecurityController(repo *auth.Repository, whitelist *security.IPWhitelist) *SecurityController {
	return &SecurityController{repo: repo, whitelist: whitelist}
}

// GetWhitelist returns the current whitelist config
func (c *SecurityController) GetWhitelist(w http.ResponseWriter, r *http.Request) {
	ips := c.whitelist.ListIPs()
	if ips == nil {
		ips = []string{}
	}
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"enabled":   c.whitelist.IsEnabled(),
		"ips":       ips,
		"client_ip": security.ClientIPNormalized(r),
	})
}

type WhitelistToggleRequest struct {
	Enabled bool `json:"enabled"`
}

// ToggleWhitelist enables or disables the whitelist.
// When enabling, the client's own IP is automatically added to prevent self-lockout.
func (c *SecurityController) ToggleWhitelist(w http.ResponseWriter, r *http.Request) {
	var req WhitelistToggleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Auto-add current client IP when enabling to prevent self-lockout
	if req.Enabled {
		clientIP := security.ClientIPNormalized(r)
		c.whitelist.AddIP(clientIP)
		_ = c.repo.AddWhitelistedIP(clientIP)
	}

	c.whitelist.SetEnabled(req.Enabled)
	if err := c.repo.SetIPWhitelistEnabled(req.Enabled); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to save setting")
		return
	}

	logger.Security(requestUserID(r), requestIP(r), "whitelist_toggle", fmt.Sprintf("enabled=%v", req.Enabled))

	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"enabled":    req.Enabled,
		"client_ip":  security.ClientIPNormalized(r),
		"auto_added": req.Enabled,
	})
}

type AddIPRequest struct {
	IP string `json:"ip"`
}

// AddIP adds an IP to the whitelist
func (c *SecurityController) AddIP(w http.ResponseWriter, r *http.Request) {
	var req AddIPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.IP == "" {
		jsonError(w, http.StatusBadRequest, "ip is required")
		return
	}

	c.whitelist.AddIP(req.IP)
	if err := c.repo.AddWhitelistedIP(req.IP); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to save IP")
		return
	}

	logger.Security(requestUserID(r), requestIP(r), "whitelist_add_ip", req.IP)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "added", "ip": req.IP})
}

// RemoveIP removes an IP from the whitelist
func (c *SecurityController) RemoveIP(w http.ResponseWriter, r *http.Request) {
	var req AddIPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.IP == "" {
		jsonError(w, http.StatusBadRequest, "ip is required")
		return
	}

	c.whitelist.RemoveIP(req.IP)
	if err := c.repo.RemoveWhitelistedIP(req.IP); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to remove IP")
		return
	}

	logger.Security(requestUserID(r), requestIP(r), "whitelist_remove_ip", req.IP)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "removed", "ip": req.IP})
}

type BulkAddIPsRequest struct {
	IPs []string `json:"ips"`
}

// BulkAddIPs adds multiple IPs at once
func (c *SecurityController) BulkAddIPs(w http.ResponseWriter, r *http.Request) {
	var req BulkAddIPsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.IPs) == 0 {
		jsonError(w, http.StatusBadRequest, "ips array is required")
		return
	}

	added := 0
	for _, ip := range req.IPs {
		ip = strings.TrimSpace(ip)
		if ip == "" || strings.HasPrefix(ip, "#") {
			continue // skip empty lines and comments
		}
		c.whitelist.AddIP(ip)
		if err := c.repo.AddWhitelistedIP(ip); err == nil {
			added++
		}
	}

	logger.Security(requestUserID(r), requestIP(r), "whitelist_bulk_add", fmt.Sprintf("%d IPs", added))
	jsonResponse(w, http.StatusOK, map[string]interface{}{
		"status": "added",
		"count":  added,
	})
}

// ExportWhitelist returns all whitelisted IPs as plain text (one per line)
func (c *SecurityController) ExportWhitelist(w http.ResponseWriter, r *http.Request) {
	ips := c.whitelist.ListIPs()
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=whitelist.txt")
	for _, ip := range ips {
		w.Write([]byte(ip + "\n"))
	}
}
