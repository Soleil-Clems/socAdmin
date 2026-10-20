// @soleil-clems: Middleware - Request body size limit (OOM protection)
package api

import (
	"net/http"
)

// MaxBodySize returns middleware that limits request body size.
// Handlers that need a higher limit (e.g. file imports) can call
// http.MaxBytesReader themselves to override this default.
func MaxBodySize(maxBytes int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Body != nil {
				r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
			}
			next.ServeHTTP(w, r)
		})
	}
}
