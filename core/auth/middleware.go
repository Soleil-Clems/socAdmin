// @soleil-clems: Auth - Authentication middleware
package auth

import (
	"context"
	"fmt"
	"net/http"
)

type contextKey string

const ClaimsKey contextKey = "claims"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("access_token")
		if err != nil || cookie.Value == "" {
			jsonErr(w, http.StatusUnauthorized, "missing authentication")
			return
		}

		claims, err := ValidateAccessToken(cookie.Value)
		if err != nil {
			jsonErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AuthFromCookie wraps a handler to authenticate via the access_token cookie.
// Used for SSE endpoints where the EventSource API cannot set custom headers
// but the browser sends cookies automatically. Admin-only.
func AuthFromCookie(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("access_token")
		if err != nil || cookie.Value == "" {
			jsonErr(w, http.StatusUnauthorized, "missing authentication")
			return
		}

		claims, err := ValidateAccessToken(cookie.Value)
		if err != nil {
			jsonErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		if claims.Role != "admin" {
			jsonErr(w, http.StatusForbidden, "admin only")
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		handler(w, r.WithContext(ctx))
	}
}

// jsonErr writes a JSON error response with the correct Content-Type.
func jsonErr(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	fmt.Fprintf(w, `{"error":%q}`, msg)
}
