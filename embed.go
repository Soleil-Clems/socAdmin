// @soleil-clems: Embed - SPA frontend embedding & serving
package main

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"

	"github.com/soleilouisol/socAdmin/core/api"
)

//go:embed all:frontend/dist
var frontendFS embed.FS

// FrontendHandler serves the embedded React SPA.
// It injects the API prefix into index.html so the frontend knows the secret URL.
// The inline script uses a CSP nonce generated per request by SecurityHeaders.
func FrontendHandler(apiPrefix string) http.Handler {
	dist, _ := fs.Sub(frontendFS, "frontend/dist")
	fileServer := http.FileServer(http.FS(dist))

	indexBytes, _ := fs.ReadFile(dist, "index.html")
	indexTemplate := string(indexBytes)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Try to serve static files directly (JS, CSS, images, etc.)
		if path != "/" {
			cleanPath := strings.TrimPrefix(path, "/")
			if f, err := dist.Open(cleanPath); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// Get CSP nonce from context (set by SecurityHeaders middleware)
		nonce, _ := r.Context().Value(api.CSPNonceKey).(string)

		// SPA fallback: inject API prefix with nonce
		html := strings.Replace(
			indexTemplate,
			"</head>",
			`<script nonce="`+nonce+`">window.__SOCADMIN_API_PREFIX__="`+apiPrefix+`";</script></head>`,
			1,
		)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	})
}
