package security

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
)

// IPWhitelist manages allowed IP addresses.
// When no IPs are configured, all traffic is allowed.
// When at least one IP is configured, only those IPs can access the server.
type IPWhitelist struct {
	mu      sync.RWMutex
	enabled bool
	allowed map[string]bool // normalized IP → true
}

func NewIPWhitelist() *IPWhitelist {
	return &IPWhitelist{
		allowed: make(map[string]bool),
	}
}

func (w *IPWhitelist) IsEnabled() bool {
	w.mu.RLock()
	defer w.mu.RUnlock()
	return w.enabled
}

func (w *IPWhitelist) SetEnabled(enabled bool) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.enabled = enabled
}

func (w *IPWhitelist) AddIP(ip string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.allowed[NormalizeIP(ip)] = true
}

func (w *IPWhitelist) RemoveIP(ip string) {
	w.mu.Lock()
	defer w.mu.Unlock()
	delete(w.allowed, NormalizeIP(ip))
}

func (w *IPWhitelist) ListIPs() []string {
	w.mu.RLock()
	defer w.mu.RUnlock()
	ips := make([]string, 0, len(w.allowed))
	for ip := range w.allowed {
		ips = append(ips, ip)
	}
	return ips
}

func (w *IPWhitelist) IsAllowed(remoteAddr string) bool {
	w.mu.RLock()
	defer w.mu.RUnlock()

	if !w.enabled || len(w.allowed) == 0 {
		return true
	}

	ip := ExtractIP(remoteAddr)
	return w.allowed[NormalizeIP(ip)]
}

// Middleware blocks requests from non-whitelisted IPs
func (w *IPWhitelist) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
		if !w.IsAllowed(ClientIP(r)) {
			rw.Header().Set("Content-Type", "application/json")
			rw.WriteHeader(http.StatusForbidden)
			json.NewEncoder(rw).Encode(map[string]string{"error": "IP not allowed"})
			return
		}
		next.ServeHTTP(rw, r)
	})
}

// trustedProxies is the set of IPs allowed to set X-Forwarded-For/X-Real-IP.
// Populated from the TRUSTED_PROXY env var (comma-separated IPs/CIDRs).
// If empty, proxy headers are NEVER trusted — only r.RemoteAddr is used.
var (
	trustedProxyCIDRs []*net.IPNet
	trustedProxyIPs   map[string]bool
	trustedProxyOnce  sync.Once
)

func initTrustedProxies() {
	trustedProxyIPs = make(map[string]bool)
	raw := os.Getenv("TRUSTED_PROXY")
	if raw == "" {
		return
	}
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if _, cidr, err := net.ParseCIDR(entry); err == nil {
			trustedProxyCIDRs = append(trustedProxyCIDRs, cidr)
		} else if ip := net.ParseIP(entry); ip != nil {
			trustedProxyIPs[ip.String()] = true
		}
	}
}

func isProxyTrusted(remoteAddr string) bool {
	trustedProxyOnce.Do(initTrustedProxies)
	if len(trustedProxyIPs) == 0 && len(trustedProxyCIDRs) == 0 {
		return false
	}
	ip := net.ParseIP(ExtractIP(remoteAddr))
	if ip == nil {
		return false
	}
	if trustedProxyIPs[ip.String()] {
		return true
	}
	for _, cidr := range trustedProxyCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// ClientIP extracts the real client IP. Proxy headers (X-Forwarded-For,
// X-Real-IP) are only trusted when the direct connection comes from an
// IP listed in the TRUSTED_PROXY env var. Otherwise, only r.RemoteAddr
// is used — this prevents attackers from spoofing their IP.
func ClientIP(r *http.Request) string {
	if isProxyTrusted(r.RemoteAddr) {
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			parts := strings.SplitN(xff, ",", 2)
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
		if xri := r.Header.Get("X-Real-IP"); xri != "" {
			return strings.TrimSpace(xri)
		}
	}

	return r.RemoteAddr
}

// ClientIPNormalized returns the normalized client IP for use by controllers
func ClientIPNormalized(r *http.Request) string {
	return NormalizeIP(ClientIP(r))
}

func ExtractIP(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}

func NormalizeIP(ip string) string {
	ip = ExtractIP(ip)
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ip
	}
	if v4 := parsed.To4(); v4 != nil {
		return v4.String()
	}
	return parsed.String()
}
