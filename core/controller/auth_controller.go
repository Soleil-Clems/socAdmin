package controller

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/logger"
	"github.com/soleilouisol/socAdmin/core/service"
)

type AuthController struct {
	authService *service.AuthService
}

func NewAuthController(authService *service.AuthService) *AuthController {
	return &AuthController{authService: authService}
}

type RegisterRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (c *AuthController) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		jsonError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	if len(req.Password) < 8 {
		jsonError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	user, err := c.authService.Register(req.Email, req.Password)
	if err != nil {
		logger.AuthFail("register", requestIP(r))
		jsonError(w, http.StatusConflict, err.Error())
		return
	}

	logger.Auth("register", user.ID, requestIP(r))
	jsonResponse(w, http.StatusCreated, user)
}

func (c *AuthController) Login(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Email == "" || req.Password == "" {
		jsonError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	tokens, err := c.authService.Login(req.Email, req.Password)
	if err != nil {
		logger.AuthFail("login", requestIP(r))
		jsonError(w, http.StatusUnauthorized, err.Error())
		return
	}

	logger.Auth("login", 0, requestIP(r))
	jsonResponse(w, http.StatusOK, tokens)
}

func (c *AuthController) Refresh(w http.ResponseWriter, r *http.Request) {
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.RefreshToken == "" {
		jsonError(w, http.StatusBadRequest, "refresh_token is required")
		return
	}

	tokens, err := c.authService.RefreshToken(req.RefreshToken)
	if err != nil {
		jsonError(w, http.StatusUnauthorized, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, tokens)
}

func (c *AuthController) Me(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(auth.ClaimsKey).(*auth.Claims)

	user, err := c.authService.GetUser(claims.UserID)
	if err != nil {
		jsonError(w, http.StatusNotFound, err.Error())
		return
	}

	jsonResponse(w, http.StatusOK, user)
}

// ListAppUsers returns every registered socAdmin user (admin only).
func (c *AuthController) ListAppUsers(w http.ResponseWriter, r *http.Request) {
	users, err := c.authService.ListUsers()
	if err != nil {
		jsonError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if users == nil {
		users = []auth.User{}
	}
	jsonResponse(w, http.StatusOK, users)
}

type updateRoleRequest struct {
	Role string `json:"role"`
}

// UpdateAppUserRole changes a user's role (admin only).
func (c *AuthController) UpdateAppUserRole(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var req updateRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := c.authService.UpdateUserRole(id, req.Role); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	logger.Admin(requestUserID(r), requestIP(r), "user_role_update", strconv.FormatInt(id, 10)+"->"+req.Role)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}

// DeleteAppUser removes a user (admin only).
func (c *AuthController) DeleteAppUser(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		jsonError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	callerID := requestUserID(r)
	if callerID == id {
		jsonError(w, http.StatusBadRequest, "cannot delete your own account")
		return
	}

	if err := c.authService.DeleteUser(id); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	logger.Admin(callerID, requestIP(r), "user_delete", strconv.FormatInt(id, 10))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "ok"})
}
