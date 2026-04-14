package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

type contextKey string

const ClaimsKey contextKey = "claims"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			jsonErr(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			jsonErr(w, http.StatusUnauthorized, "invalid authorization header")
			return
		}

		claims, err := ValidateAccessToken(parts[1])
		if err != nil {
			jsonErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AuthFromQueryParam wraps a handler to authenticate via "token" query
// parameter instead of the Authorization header. This is required for SSE
// endpoints because the EventSource API does not support custom headers.
// Admin-only.
func AuthFromQueryParam(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("token")
		if token == "" {
			jsonErr(w, http.StatusUnauthorized, "missing token parameter")
			return
		}

		claims, err := ValidateAccessToken(token)
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
