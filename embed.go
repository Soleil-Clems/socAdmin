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
// API routes (/api/) are NOT handled here — they must be registered separately.
func FrontendHandler() http.Handler {
	dist, _ := fs.Sub(frontendFS, "frontend/dist")
	fileServer := http.FileServer(http.FS(dist))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// Let /api/ routes pass through (should never reach here if mux is set up correctly)
		if strings.HasPrefix(path, "/api/") {
			http.NotFound(w, r)
			return
		}

		// Try to serve the file directly (JS, CSS, images, etc.)
		if path != "/" {
			cleanPath := strings.TrimPrefix(path, "/")
			if f, err := dist.Open(cleanPath); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		// SPA fallback: serve index.html for all other routes
		r.URL.Path = "/"
		fileServer.ServeHTTP(w, r)
	})
}
