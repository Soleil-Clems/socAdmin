package auth

import (
	"os"
	"testing"
	"time"
)

func tempRepo(t *testing.T) *Repository {
	t.Helper()
	f, err := os.CreateTemp("", "socadmin-test-*.db")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	repo, err := NewRepository(f.Name())
	if err != nil {
		t.Fatalf("NewRepository() error = %v", err)
	}
	return repo
}

func TestRepository_CreateAndFindUser(t *testing.T) {
	repo := tempRepo(t)

	user, err := repo.CreateUser("alice@test.com", "hashed", RoleAdmin)
	if err != nil {
		t.Fatalf("CreateUser() error = %v", err)
	}
	if user.ID == 0 {
		t.Error("user ID should be non-zero")
	}
	if user.Email != "alice@test.com" {
		t.Errorf("email = %q, want alice@test.com", user.Email)
	}
	if user.Role != RoleAdmin {
		t.Errorf("role = %q, want admin", user.Role)
	}

	found, err := repo.FindByEmail("alice@test.com")
	if err != nil {
		t.Fatalf("FindByEmail() error = %v", err)
	}
	if found.ID != user.ID {
		t.Error("FindByEmail returned different user")
	}

	byID, err := repo.FindByID(user.ID)
	if err != nil {
		t.Fatalf("FindByID() error = %v", err)
	}
	if byID.Email != "alice@test.com" {
		t.Error("FindByID returned wrong email")
	}
}

func TestRepository_FindByEmail_NotFound(t *testing.T) {
	repo := tempRepo(t)
	user, err := repo.FindByEmail("nobody@test.com")
	if err != nil {
		t.Fatalf("FindByEmail() error = %v", err)
	}
	if user != nil {
		t.Error("should return nil for non-existent user")
	}
}

func TestRepository_DuplicateEmail(t *testing.T) {
	repo := tempRepo(t)
	repo.CreateUser("alice@test.com", "hash1", RoleAdmin)
	_, err := repo.CreateUser("alice@test.com", "hash2", RoleReadonly)
	if err == nil {
		t.Error("should reject duplicate email")
	}
}

func TestRepository_UserCount(t *testing.T) {
	repo := tempRepo(t)

	count, _ := repo.UserCount()
	if count != 0 {
		t.Errorf("initial count = %d, want 0", count)
	}

	repo.CreateUser("a@b.com", "h", RoleAdmin)
	repo.CreateUser("c@d.com", "h", RoleReadonly)

	count, _ = repo.UserCount()
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

func TestRepository_ListUsers(t *testing.T) {
	repo := tempRepo(t)
	repo.CreateUser("a@b.com", "h", RoleAdmin)
	repo.CreateUser("c@d.com", "h", RoleReadonly)

	users, err := repo.ListUsers()
	if err != nil {
		t.Fatalf("ListUsers() error = %v", err)
	}
	if len(users) != 2 {
		t.Errorf("len = %d, want 2", len(users))
	}
}

func TestRepository_UpdateUserRole(t *testing.T) {
	repo := tempRepo(t)
	user, _ := repo.CreateUser("a@b.com", "h", RoleReadonly)

	err := repo.UpdateUserRole(user.ID, RoleAdmin)
	if err != nil {
		t.Fatalf("UpdateUserRole() error = %v", err)
	}

	updated, _ := repo.FindByID(user.ID)
	if updated.Role != RoleAdmin {
		t.Errorf("role = %q, want admin", updated.Role)
	}
}

func TestRepository_DeleteUser(t *testing.T) {
	repo := tempRepo(t)
	user, _ := repo.CreateUser("a@b.com", "h", RoleAdmin)

	err := repo.DeleteUser(user.ID)
	if err != nil {
		t.Fatalf("DeleteUser() error = %v", err)
	}

	count, _ := repo.UserCount()
	if count != 0 {
		t.Errorf("count after delete = %d, want 0", count)
	}
}

func TestRepository_RefreshToken(t *testing.T) {
	repo := tempRepo(t)
	user, _ := repo.CreateUser("a@b.com", "h", RoleAdmin)

	token := "test-refresh-token-abc123"
	err := repo.SaveRefreshToken(user.ID, token, time.Now().Add(time.Hour))
	if err != nil {
		t.Fatalf("SaveRefreshToken() error = %v", err)
	}

	userID, err := repo.FindRefreshToken(token)
	if err != nil {
		t.Fatalf("FindRefreshToken() error = %v", err)
	}
	if userID != user.ID {
		t.Errorf("userID = %d, want %d", userID, user.ID)
	}

	err = repo.DeleteRefreshToken(token)
	if err != nil {
		t.Fatalf("DeleteRefreshToken() error = %v", err)
	}

	_, err = repo.FindRefreshToken(token)
	if err == nil {
		t.Error("should not find deleted token")
	}
}

func TestRepository_LoginAttempts(t *testing.T) {
	repo := tempRepo(t)

	repo.RecordLoginAttempt("a@b.com", "10.0.0.1")
	repo.RecordLoginAttempt("a@b.com", "10.0.0.1")
	repo.RecordLoginAttempt("a@b.com", "10.0.0.1")

	count, err := repo.CountRecentAttempts("a@b.com", "10.0.0.1", time.Now().UTC().Add(-time.Hour))
	if err != nil {
		t.Fatalf("CountRecentAttempts() error = %v", err)
	}
	if count != 3 {
		t.Errorf("count = %d, want 3", count)
	}

	repo.ClearLoginAttempts("a@b.com", "10.0.0.1")
	count, _ = repo.CountRecentAttempts("a@b.com", "10.0.0.1", time.Now().UTC().Add(-time.Hour))
	if count != 0 {
		t.Errorf("count after clear = %d, want 0", count)
	}
}

func TestRepository_GetOrCreateJWTSecret(t *testing.T) {
	repo := tempRepo(t)

	s1, err := repo.GetOrCreateJWTSecret()
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if len(s1) == 0 {
		t.Error("secret should not be empty")
	}

	s2, _ := repo.GetOrCreateJWTSecret()
	if string(s1) != string(s2) {
		t.Error("second call should return same secret")
	}
}

func TestRepository_GetOrCreateAPIPrefix(t *testing.T) {
	repo := tempRepo(t)

	p1, err := repo.GetOrCreateAPIPrefix()
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if p1 == "" {
		t.Error("prefix should not be empty")
	}

	p2, _ := repo.GetOrCreateAPIPrefix()
	if p1 != p2 {
		t.Error("second call should return same prefix")
	}
}

func TestRepository_IPWhitelist(t *testing.T) {
	repo := tempRepo(t)

	repo.AddWhitelistedIP("10.0.0.1")
	repo.AddWhitelistedIP("10.0.0.2")

	ips, err := repo.GetWhitelistedIPs()
	if err != nil {
		t.Fatalf("error = %v", err)
	}
	if len(ips) != 2 {
		t.Errorf("len = %d, want 2", len(ips))
	}

	repo.RemoveWhitelistedIP("10.0.0.1")
	ips, _ = repo.GetWhitelistedIPs()
	if len(ips) != 1 {
		t.Errorf("len after remove = %d, want 1", len(ips))
	}
}

func TestRepository_SavedConnections(t *testing.T) {
	repo := tempRepo(t)
	user, _ := repo.CreateUser("a@b.com", "h", RoleAdmin)

	id, err := repo.SaveConnection(user.ID, "prod-mysql", "mysql", "db.example.com", 3306, "root", "encrypted-pass")
	if err != nil {
		t.Fatalf("SaveConnection() error = %v", err)
	}
	if id == 0 {
		t.Error("connection ID should be non-zero")
	}

	conns, err := repo.ListConnections(user.ID)
	if err != nil {
		t.Fatalf("ListConnections() error = %v", err)
	}
	if len(conns) != 1 {
		t.Fatalf("len = %d, want 1", len(conns))
	}
	if conns[0].Name != "prod-mysql" {
		t.Errorf("name = %q, want prod-mysql", conns[0].Name)
	}

	conn, err := repo.GetConnection(id, user.ID)
	if err != nil {
		t.Fatalf("GetConnection() error = %v", err)
	}
	if conn.Host != "db.example.com" {
		t.Errorf("host = %q, want db.example.com", conn.Host)
	}

	err = repo.DeleteConnection(id, user.ID)
	if err != nil {
		t.Fatalf("DeleteConnection() error = %v", err)
	}

	conns, _ = repo.ListConnections(user.ID)
	if len(conns) != 0 {
		t.Errorf("len after delete = %d, want 0", len(conns))
	}
}
