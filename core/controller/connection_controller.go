// @soleil-clems: Controller - Saved connections (AES-256 encrypted credentials)
package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/logger"
	"github.com/soleilouisol/socAdmin/core/security"
	"github.com/soleilouisol/socAdmin/core/service"
)

type ConnectionController struct {
	repo      *auth.Repository
	dbService *service.DatabaseService
	encKey    []byte // AES-256 key (32 bytes)
}

func NewConnectionController(repo *auth.Repository, dbService *service.DatabaseService, encKey []byte) *ConnectionController {
	return &ConnectionController{repo: repo, dbService: dbService, encKey: encKey}
}

type SaveConnectionRequest struct {
	Name     string `json:"name"`
	DbType   string `json:"type"`
	Host     string `json:"host"`
	Port     int    `json:"port"`
	User     string `json:"user"`
	Password string `json:"password"`
}

// SaveConnection saves an encrypted connection for the authenticated user
func (c *ConnectionController) SaveConnection(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(auth.ClaimsKey).(*auth.Claims)

	var req SaveConnectionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.Host == "" || req.User == "" || req.DbType == "" {
		jsonError(w, http.StatusBadRequest, "name, host, user, and type are required")
		return
	}

	// Encrypt password with AES-256-GCM
	passwordEnc, err := security.Encrypt(req.Password, c.encKey)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to encrypt credentials")
		return
	}

	id, err := c.repo.SaveConnection(claims.UserID, req.Name, req.DbType, req.Host, req.Port, req.User, passwordEnc)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to save connection")
		return
	}

	jsonResponse(w, http.StatusCreated, map[string]interface{}{"id": id, "status": "saved"})
}

// ListConnections returns all saved connections for the authenticated user (passwords excluded)
func (c *ConnectionController) ListConnections(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(auth.ClaimsKey).(*auth.Claims)

	conns, err := c.repo.ListConnections(claims.UserID)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to list connections")
		return
	}

	// Return without passwords
	type connResponse struct {
		ID     int64  `json:"id"`
		Name   string `json:"name"`
		DbType string `json:"type"`
		Host   string `json:"host"`
		Port   int    `json:"port"`
		User   string `json:"user"`
	}

	result := make([]connResponse, 0, len(conns))
	for _, conn := range conns {
		result = append(result, connResponse{
			ID: conn.ID, Name: conn.Name, DbType: conn.DbType,
			Host: conn.Host, Port: conn.Port, User: conn.DbUser,
		})
	}

	jsonResponse(w, http.StatusOK, result)
}

// UseSavedConnection decrypts and connects using a saved connection
func (c *ConnectionController) UseSavedConnection(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(auth.ClaimsKey).(*auth.Claims)

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid connection id")
		return
	}

	conn, err := c.repo.GetConnection(id, claims.UserID)
	if err != nil {
		jsonError(w, http.StatusNotFound, "connection not found")
		return
	}

	// Decrypt password
	password, err := security.Decrypt(conn.PasswordEnc, c.encKey)
	if err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to decrypt credentials")
		return
	}

	// Connect
	if err := c.dbService.Connect(conn.Host, conn.Port, conn.DbUser, password, conn.DbType); err != nil {
		logger.Connect(claims.UserID, requestIP(r), conn.DbType, conn.Host, conn.Port, false)
		jsonError(w, http.StatusBadGateway, err.Error())
		return
	}

	logger.Connect(claims.UserID, requestIP(r), conn.DbType, conn.Host, conn.Port, true)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "connected", "type": conn.DbType})
}

// DeleteConnection removes a saved connection
func (c *ConnectionController) DeleteConnection(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(auth.ClaimsKey).(*auth.Claims)

	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid connection id")
		return
	}

	if err := c.repo.DeleteConnection(id, claims.UserID); err != nil {
		jsonError(w, http.StatusInternalServerError, "failed to delete connection")
		return
	}

	logger.Security(claims.UserID, requestIP(r), "delete_saved_connection", fmt.Sprintf("id=%d", id))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "deleted"})
}
