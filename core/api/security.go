// @soleil-clems: SecurityHeaders - HTTP security headers middleware
package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"os"
	"strings"
)

type cspNonceKeyType struct{}

var CSPNonceKey = cspNonceKeyType{}

func generateNonce() string {
	b := make([]byte, 16)
	rand.Read(b)
	return base64.StdEncoding.EncodeToString(b)
}

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

		// Generate per-request nonce for inline script (API prefix injection)
		nonce := generateNonce()
		ctx := context.WithValue(r.Context(), CSPNonceKey, nonce)
		r = r.WithContext(ctx)

		// Content Security Policy with nonce for inline scripts
		w.Header().Set("Content-Security-Policy",
			"default-src 'self'; script-src 'self' 'nonce-"+nonce+"'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'")

		if strings.Contains(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Pragma", "no-cache")
		}

		next.ServeHTTP(w, r)
	})
}
