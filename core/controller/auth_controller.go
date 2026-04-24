// @soleil-clems: Controller - Auth HTTP handlers (login, register, refresh)
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

// setAuthCookies writes HttpOnly cookies for access and refresh tokens.
func setAuthCookies(w http.ResponseWriter, tokens *auth.TokenPair) {
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    tokens.AccessToken,
		Path:     "/",
		MaxAge:   int(auth.AccessTokenDuration.Seconds()),
		HttpOnly: true,
		Secure:   false, // set to true when behind TLS reverse proxy
		SameSite: http.SameSiteStrictMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    tokens.RefreshToken,
		Path:     "/",
		MaxAge:   int(auth.RefreshTokenDuration.Seconds()),
		HttpOnly: true,
		Secure:   false,
		SameSite: http.SameSiteStrictMode,
	})
}

// clearAuthCookies expires both auth cookies.
func clearAuthCookies(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "access_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
	http.SetCookie(w, &http.Cookie{
		Name:     "refresh_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
	})
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

	if err := auth.ValidatePassword(req.Password); err != nil {
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, err := c.authService.Register(req.Email, req.Password)
	if err != nil {
		logger.AuthFail("register", requestIP(r))
		jsonError(w, http.StatusConflict, err.Error())
		return
	}

	setAuthCookies(w, result.Tokens)
	logger.Auth("register", result.User.ID, requestIP(r))
	jsonResponse(w, http.StatusCreated, map[string]interface{}{
		"id":    result.User.ID,
		"email": result.User.Email,
		"role":  result.User.Role,
	})
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

	tokens, user, err := c.authService.Login(req.Email, req.Password, requestIP(r))
	if err != nil {
		logger.AuthFail("login", requestIP(r))
		jsonError(w, http.StatusUnauthorized, err.Error())
		return
	}

	setAuthCookies(w, tokens)
	logger.Auth("login", user.ID, requestIP(r))
	jsonResponse(w, http.StatusOK, map[string]string{"role": user.Role})
}

func (c *AuthController) Refresh(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("refresh_token")
	if err != nil || cookie.Value == "" {
		jsonError(w, http.StatusUnauthorized, "missing refresh token")
		return
	}

	tokens, err := c.authService.RefreshToken(cookie.Value)
	if err != nil {
		clearAuthCookies(w)
		jsonError(w, http.StatusUnauthorized, err.Error())
		return
	}

	setAuthCookies(w, tokens)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "refreshed"})
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

// Logout revokes the caller's refresh token so it can no longer be used.
func (c *AuthController) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie("refresh_token"); err == nil && cookie.Value != "" {
		c.authService.RevokeRefreshToken(cookie.Value)
	}
	clearAuthCookies(w)
	jsonResponse(w, http.StatusOK, map[string]string{"status": "logged out"})
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangePassword lets the authenticated user change their own password.
// Revokes all refresh tokens on success, forcing re-login.
func (c *AuthController) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := r.Context().Value(auth.ClaimsKey).(*auth.Claims)

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.CurrentPassword == "" || req.NewPassword == "" {
		jsonError(w, http.StatusBadRequest, "current_password and new_password are required")
		return
	}

	if err := c.authService.ChangePassword(claims.UserID, req.CurrentPassword, req.NewPassword); err != nil {
		logger.AuthFail("password_change", requestIP(r))
		jsonError(w, http.StatusBadRequest, err.Error())
		return
	}

	logger.Auth("password_change", claims.UserID, requestIP(r))
	jsonResponse(w, http.StatusOK, map[string]string{"status": "password updated"})
}
