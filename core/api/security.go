package api

import (
	"net/http"
	"os"
)

// SecurityHeaders adds HTTP security headers to all responses
func SecurityHeaders(next http.Handler) http.Handler {
	tlsEnabled := os.Getenv("TLS_CERT") != "" && os.Getenv("TLS_KEY") != ""

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// HSTS — only when TLS is enabled
		if tlsEnabled {
			w.Header().Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}

		// Prevent clickjacking
		w.Header().Set("X-Frame-Options", "DENY")

		// Prevent MIME-type sniffing
		w.Header().Set("X-Content-Type-Options", "nosniff")

		// XSS protection (legacy browsers)
		w.Header().Set("X-XSS-Protection", "1; mode=block")

		// Referrer policy — don't leak URLs
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Permissions policy — restrict browser features
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// Content Security Policy
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'")

		// Prevent caching of API responses
		if len(r.URL.Path) > 4 && r.URL.Path[:5] == "/api/" {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
		}

		next.ServeHTTP(w, r)
	})
}
