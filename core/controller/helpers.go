// @soleil-clems: Controller - Shared helpers (auth extraction, validation)
package controller

import (
	"net/http"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/connector"
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

// validatePathIdent validates a path parameter as a safe SQL identifier.
// Returns true if valid, writes a 400 error and returns false otherwise.
func validatePathIdent(w http.ResponseWriter, name, label string) bool {
	if err := connector.ValidateIdentifier(name); err != nil {
		jsonError(w, http.StatusBadRequest, label+": "+err.Error())
		return false
	}
	return true
}
