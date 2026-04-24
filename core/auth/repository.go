// @soleil-clems: Auth - SQLite user repository & token storage
package auth

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type Repository struct {
	db *sql.DB
}

func NewRepository(dbPath string) (*Repository, error) {
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on&_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}

	// Add role column if missing (for existing databases)
	db.Exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'readonly'")
	// First user ever created should be admin
	db.Exec("UPDATE users SET role = 'admin' WHERE id = (SELECT MIN(id) FROM users) AND role = 'readonly'")
	// Add ip column to login_attempts (migration for existing DBs)
	db.Exec("ALTER TABLE login_attempts ADD COLUMN ip TEXT NOT NULL DEFAULT ''")
	// Add revoked_at column to refresh_tokens (migration for existing DBs)
	db.Exec("ALTER TABLE refresh_tokens ADD COLUMN revoked_at DATETIME")

	return &Repository{db: db}, nil
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS refresh_tokens (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token TEXT UNIQUE NOT NULL,
			expires_at DATETIME NOT NULL,
			revoked_at DATETIME,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);

		CREATE TABLE IF NOT EXISTS login_attempts (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email TEXT NOT NULL,
			ip TEXT NOT NULL DEFAULT '',
			attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);

		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		-- Add role column if missing (migration for existing DBs)
		-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, handled below

		CREATE TABLE IF NOT EXISTS ip_whitelist (
			ip TEXT PRIMARY KEY
		);

		CREATE TABLE IF NOT EXISTS saved_connections (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			name TEXT NOT NULL,
			db_type TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER NOT NULL,
			db_user TEXT NOT NULL,
			password_enc TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);
	`)
	return err
}

// GetOrCreateJWTSecret returns the JWT secret from DB, generating one on first run.
func (r *Repository) GetOrCreateJWTSecret() ([]byte, error) {
	var secret string
	err := r.db.QueryRow("SELECT value FROM settings WHERE key = 'jwt_secret'").Scan(&secret)
	if err == nil {
		return hex.DecodeString(secret)
	}

	// Generate a new 32-byte random secret
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return nil, fmt.Errorf("failed to generate JWT secret: %w", err)
	}
	secret = hex.EncodeToString(bytes)

	_, err = r.db.Exec("INSERT INTO settings (key, value) VALUES ('jwt_secret', ?)", secret)
	if err != nil {
		return nil, fmt.Errorf("failed to save JWT secret: %w", err)
	}

	return bytes, nil
}

// GetOrCreateEncryptionKey returns the AES-256 key from DB, generating one on first run.
func (r *Repository) GetOrCreateEncryptionKey() ([]byte, error) {
	var secret string
	err := r.db.QueryRow("SELECT value FROM settings WHERE key = 'encryption_key'").Scan(&secret)
	if err == nil {
		return hex.DecodeString(secret)
	}

	// Generate a new 32-byte random key
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return nil, fmt.Errorf("failed to generate encryption key: %w", err)
	}
	secret = hex.EncodeToString(bytes)

	_, err = r.db.Exec("INSERT INTO settings (key, value) VALUES ('encryption_key', ?)", secret)
	if err != nil {
		return nil, fmt.Errorf("failed to save encryption key: %w", err)
	}

	return bytes, nil
}

// GetOrCreateAPIPrefix returns a random URL prefix, generating one on first run.
// This makes the API URL non-guessable (e.g. /a3f7b2c1/api/ instead of /api/).
func (r *Repository) GetOrCreateAPIPrefix() (string, error) {
	var prefix string
	err := r.db.QueryRow("SELECT value FROM settings WHERE key = 'api_prefix'").Scan(&prefix)
	if err == nil {
		return prefix, nil
	}

	// Generate a random 8-char hex prefix
	bytes := make([]byte, 4)
	if _, err := rand.Read(bytes); err != nil {
		return "", fmt.Errorf("failed to generate API prefix: %w", err)
	}
	prefix = hex.EncodeToString(bytes)

	_, err = r.db.Exec("INSERT INTO settings (key, value) VALUES ('api_prefix', ?)", prefix)
	if err != nil {
		return "", fmt.Errorf("failed to save API prefix: %w", err)
	}

	return prefix, nil
}

// CleanExpiredTokens removes expired refresh tokens
func (r *Repository) CleanExpiredTokens() error {
	// Delete expired tokens and tokens revoked more than 7 days ago
	_, err := r.db.Exec("DELETE FROM refresh_tokens WHERE expires_at <= CURRENT_TIMESTAMP OR (revoked_at IS NOT NULL AND revoked_at <= datetime('now', '-7 days'))")
	return err
}

func (r *Repository) CreateUser(email, hashedPassword, role string) (*User, error) {
	result, err := r.db.Exec("INSERT INTO users (email, password, role) VALUES (?, ?, ?)", email, hashedPassword, role)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	id, _ := result.LastInsertId()
	return &User{
		ID:        id,
		Email:     email,
		Role:      role,
		CreatedAt: time.Now(),
	}, nil
}

// UserCount returns the total number of registered users.
func (r *Repository) UserCount() (int, error) {
	var count int
	err := r.db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	return count, err
}

// ListUsers returns every registered app user, ordered by id.
func (r *Repository) ListUsers() ([]User, error) {
	rows, err := r.db.Query("SELECT id, email, role, created_at FROM users ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, nil
}

// UpdateUserRole updates the role of a given user.
func (r *Repository) UpdateUserRole(id int64, role string) error {
	_, err := r.db.Exec("UPDATE users SET role = ? WHERE id = ?", role, id)
	return err
}

// DeleteUser removes a user and their refresh tokens.
func (r *Repository) DeleteUser(id int64) error {
	if _, err := r.db.Exec("DELETE FROM refresh_tokens WHERE user_id = ?", id); err != nil {
		return err
	}
	_, err := r.db.Exec("DELETE FROM users WHERE id = ?", id)
	return err
}

// UpdatePassword updates a user's bcrypt password hash.
func (r *Repository) UpdatePassword(userID int64, hashedPassword string) error {
	_, err := r.db.Exec("UPDATE users SET password = ? WHERE id = ?", hashedPassword, userID)
	return err
}

// RevokeAllRefreshTokens deletes every refresh token for a given user.
// Called after a password change so other devices are forced to re-login.
func (r *Repository) RevokeAllRefreshTokens(userID int64) error {
	_, err := r.db.Exec("DELETE FROM refresh_tokens WHERE user_id = ?", userID)
	return err
}

func (r *Repository) FindByEmail(email string) (*User, error) {
	var user User
	err := r.db.QueryRow(
		"SELECT id, email, password, role, created_at FROM users WHERE email = ?", email,
	).Scan(&user.ID, &user.Email, &user.Password, &user.Role, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) FindByID(id int64) (*User, error) {
	var user User
	err := r.db.QueryRow(
		"SELECT id, email, password, role, created_at FROM users WHERE id = ?", id,
	).Scan(&user.ID, &user.Email, &user.Password, &user.Role, &user.CreatedAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *Repository) SaveRefreshToken(userID int64, token string, expiresAt time.Time) error {
	_, err := r.db.Exec(
		"INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
		userID, token, expiresAt,
	)
	return err
}

// FindRefreshToken returns the user ID for a valid, non-revoked token.
// If the token was already revoked (reuse detected), it revokes ALL tokens
// for that user and returns an error — this is a sign of token theft.
func (r *Repository) FindRefreshToken(token string) (int64, error) {
	var userID int64
	var revokedAt sql.NullTime
	err := r.db.QueryRow(
		"SELECT user_id, revoked_at FROM refresh_tokens WHERE token = ? AND expires_at > CURRENT_TIMESTAMP",
		token,
	).Scan(&userID, &revokedAt)

	if err == sql.ErrNoRows {
		return 0, fmt.Errorf("invalid or expired refresh token")
	}
	if err != nil {
		return 0, err
	}

	// Reuse detection: if token was already revoked, someone stole it.
	// Revoke ALL tokens for this user as a precaution.
	if revokedAt.Valid {
		r.RevokeAllRefreshTokens(userID)
		return 0, fmt.Errorf("refresh token reuse detected — all sessions revoked")
	}

	return userID, nil
}

// RevokeRefreshToken marks a token as revoked (soft-delete) instead of deleting it,
// so reuse can be detected later.
func (r *Repository) RevokeRefreshToken(token string) error {
	_, err := r.db.Exec("UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE token = ?", token)
	return err
}

// DeleteRefreshToken hard-deletes a token (used for cleanup).
func (r *Repository) DeleteRefreshToken(token string) error {
	_, err := r.db.Exec("DELETE FROM refresh_tokens WHERE token = ?", token)
	return err
}

func (r *Repository) RecordLoginAttempt(email, ip string) error {
	_, err := r.db.Exec("INSERT INTO login_attempts (email, ip) VALUES (?, ?)", email, ip)
	return err
}

// CountRecentAttempts counts by (email, IP) pair — prevents an attacker from
// locking out a victim by spamming login from a different IP.
func (r *Repository) CountRecentAttempts(email, ip string, since time.Time) (int, error) {
	var count int
	err := r.db.QueryRow(
		"SELECT COUNT(*) FROM login_attempts WHERE email = ? AND ip = ? AND attempted_at > ?",
		email, ip, since,
	).Scan(&count)
	return count, err
}

func (r *Repository) ClearLoginAttempts(email, ip string) error {
	_, err := r.db.Exec("DELETE FROM login_attempts WHERE email = ? AND ip = ?", email, ip)
	return err
}

// ── IP Whitelist persistence ───────────────────────────────────

func (r *Repository) GetIPWhitelistEnabled() bool {
	var val string
	err := r.db.QueryRow("SELECT value FROM settings WHERE key = 'ip_whitelist_enabled'").Scan(&val)
	return err == nil && val == "1"
}

func (r *Repository) SetIPWhitelistEnabled(enabled bool) error {
	val := "0"
	if enabled {
		val = "1"
	}
	_, err := r.db.Exec("INSERT OR REPLACE INTO settings (key, value) VALUES ('ip_whitelist_enabled', ?)", val)
	return err
}

func (r *Repository) GetWhitelistedIPs() ([]string, error) {
	rows, err := r.db.Query("SELECT ip FROM ip_whitelist ORDER BY ip")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ips []string
	for rows.Next() {
		var ip string
		if err := rows.Scan(&ip); err != nil {
			return nil, err
		}
		ips = append(ips, ip)
	}
	return ips, nil
}

func (r *Repository) AddWhitelistedIP(ip string) error {
	_, err := r.db.Exec("INSERT OR IGNORE INTO ip_whitelist (ip) VALUES (?)", ip)
	return err
}

func (r *Repository) RemoveWhitelistedIP(ip string) error {
	_, err := r.db.Exec("DELETE FROM ip_whitelist WHERE ip = ?", ip)
	return err
}

// ── Saved Connections ─────────────────────────────────────────

type SavedConnection struct {
	ID          int64  `json:"id"`
	UserID      int64  `json:"user_id"`
	Name        string `json:"name"`
	DbType      string `json:"db_type"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	DbUser      string `json:"db_user"`
	PasswordEnc string `json:"-"` // never exposed in JSON
}

func (r *Repository) SaveConnection(userID int64, name, dbType, host string, port int, dbUser, passwordEnc string) (int64, error) {
	result, err := r.db.Exec(
		"INSERT INTO saved_connections (user_id, name, db_type, host, port, db_user, password_enc) VALUES (?, ?, ?, ?, ?, ?, ?)",
		userID, name, dbType, host, port, dbUser, passwordEnc,
	)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}

func (r *Repository) ListConnections(userID int64) ([]SavedConnection, error) {
	rows, err := r.db.Query(
		"SELECT id, user_id, name, db_type, host, port, db_user, password_enc FROM saved_connections WHERE user_id = ? ORDER BY name",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conns []SavedConnection
	for rows.Next() {
		var c SavedConnection
		if err := rows.Scan(&c.ID, &c.UserID, &c.Name, &c.DbType, &c.Host, &c.Port, &c.DbUser, &c.PasswordEnc); err != nil {
			return nil, err
		}
		conns = append(conns, c)
	}
	return conns, nil
}

func (r *Repository) GetConnection(id, userID int64) (*SavedConnection, error) {
	var c SavedConnection
	err := r.db.QueryRow(
		"SELECT id, user_id, name, db_type, host, port, db_user, password_enc FROM saved_connections WHERE id = ? AND user_id = ?",
		id, userID,
	).Scan(&c.ID, &c.UserID, &c.Name, &c.DbType, &c.Host, &c.Port, &c.DbUser, &c.PasswordEnc)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *Repository) DeleteConnection(id, userID int64) error {
	_, err := r.db.Exec("DELETE FROM saved_connections WHERE id = ? AND user_id = ?", id, userID)
	return err
}
