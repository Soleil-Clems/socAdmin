package controller

import (
	"net/http"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/security"
)

// requestUserID extracts the authenticated user ID from the request context.
func requestUserID(r *http.Request) int64 {
	claims, ok := r.Context().Value(auth.ClaimsKey).(*auth.Claims)
	if !ok || claims == nil {
		return 0
	}
	return claims.UserID
}

// requestIP extracts the normalized client IP from the request.
func requestIP(r *http.Request) string {
	return security.ClientIPNormalized(r)
}
