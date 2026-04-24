// @soleil-clems: CSRF - Double-submit cookie protection
package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

const (
	csrfCookieName = "socadmin_csrf"
	csrfHeaderName = "X-CSRF-Token"
)

// CSRFProtection implements the double-submit cookie pattern.
// A random token is set as a cookie. For state-changing requests (POST/PUT/DELETE),
// the client must send the same token in the X-CSRF-Token header.
// GET/HEAD/OPTIONS requests are exempt.
// apiPrefix is the dynamic random prefix used in routes (e.g. "a1b2c3d4").
func CSRFProtection(apiPrefix string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return csrfHandler(next, apiPrefix)
	}
}

// secureCookies returns true when cookies should have the Secure flag.
// True when behind TLS directly (r.TLS != nil), OR when SECURE_COOKIES=true
// env var is set (for reverse proxy setups where Go sees plain HTTP).
func secureCookies(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	return strings.EqualFold(os.Getenv("SECURE_COOKIES"), "true")
}

func csrfHandler(next http.Handler, apiPrefix string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Ensure CSRF cookie exists
		cookie, err := r.Cookie(csrfCookieName)
		if err != nil || cookie.Value == "" {
			token := generateCSRFToken()
			http.SetCookie(w, &http.Cookie{
				Name:     csrfCookieName,
				Value:    token,
				Path:     "/",
				HttpOnly: false, // JS must read this
				SameSite: http.SameSiteStrictMode,
				Secure:   secureCookies(r),
			})
			cookie = &http.Cookie{Value: token}
		}

		// Safe methods — no CSRF check needed
		if r.Method == "GET" || r.Method == "HEAD" || r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		// For auth endpoints (login/register/refresh), skip CSRF since they use credentials
		if isAuthEndpoint(r.URL.Path, apiPrefix) {
			next.ServeHTTP(w, r)
			return
		}

		// State-changing request — validate token
		headerToken := r.Header.Get(csrfHeaderName)
		if headerToken == "" || subtle.ConstantTimeCompare([]byte(headerToken), []byte(cookie.Value)) != 1 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "CSRF token missing or invalid"})
			return
		}

		next.ServeHTTP(w, r)
	})
}

func isAuthEndpoint(path, apiPrefix string) bool {
	base := "/" + apiPrefix + "/api/auth/"
	return path == base+"login" ||
		path == base+"register" ||
		path == base+"refresh"
}

func generateCSRFToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}
