// @soleil-clems: Embed - SPA frontend embedding & serving
package main

import (
	"embed"
	"io/fs"
	"net/http"
	"strings"
)

//go:embed all:frontend/dist
var frontendFS embed.FS

// FrontendHandler serves the embedded React SPA.
// It injects the API prefix into index.html so the frontend knows the secret URL.
func FrontendHandler(apiPrefix string) http.Handler {
	dist, _ := fs.Sub(frontendFS, "frontend/dist")
	fileServer := http.FileServer(http.FS(dist))

	// Read index.html once and inject the API prefix
	indexBytes, _ := fs.ReadFile(dist, "index.html")
	indexHTML := strings.Replace(
		string(indexBytes),
		"</head>",
		`<script>window.__SOCADMIN_API_PREFIX__="`+apiPrefix+`";</script></head>`,
		1,
	)

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

		// SPA fallback: serve modified index.html with injected prefix
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(indexHTML))
	})
}
