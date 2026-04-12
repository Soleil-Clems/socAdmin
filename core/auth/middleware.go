package auth

import (
	"context"
	"net/http"
	"strings"
)

type contextKey string

const ClaimsKey contextKey = "claims"

func AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if header == "" {
			http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, `{"error":"invalid authorization header"}`, http.StatusUnauthorized)
			return
		}

		claims, err := ValidateAccessToken(parts[1])
		if err != nil {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
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
			http.Error(w, `{"error":"missing token parameter"}`, http.StatusUnauthorized)
			return
		}

		claims, err := ValidateAccessToken(token)
		if err != nil {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		if claims.Role != "admin" {
			http.Error(w, `{"error":"admin only"}`, http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), ClaimsKey, claims)
		handler(w, r.WithContext(ctx))
	}
}
