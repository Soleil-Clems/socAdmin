// @soleil-clems: Auth - Role-based access control (admin/readonly)
package auth

import (
	"encoding/json"
	"net/http"
)

// RequireAdmin returns a middleware that blocks non-admin users.
func RequireAdmin(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(ClaimsKey).(*Claims)
		if !ok || claims == nil || claims.Role != RoleAdmin {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "admin access required"})
			return
		}
		next(w, r)
	}
}
