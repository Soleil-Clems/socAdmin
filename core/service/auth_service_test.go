package service

import (
	"os"
	"testing"

	"github.com/soleilouisol/socAdmin/core/auth"
)

func tempAuthRepo(t *testing.T) *auth.Repository {
	t.Helper()
	f, err := os.CreateTemp("", "socadmin-authsvc-*.db")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	t.Cleanup(func() { os.Remove(f.Name()) })

	repo, err := auth.NewRepository(f.Name())
	if err != nil {
		t.Fatal(err)
	}

	secret, err := repo.GetOrCreateJWTSecret()
	if err != nil {
		t.Fatal(err)
	}
	auth.InitJWTSecret(secret)

	return repo
}

func TestAuthService_Register_FirstUserIsAdmin(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, err := svc.Register("first@test.com", "StrongPass1!")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if result.User.Role != auth.RoleAdmin {
		t.Errorf("first user role = %q, want admin", result.User.Role)
	}
	if result.Tokens.AccessToken == "" || result.Tokens.RefreshToken == "" {
		t.Error("tokens should not be empty")
	}
}

func TestAuthService_Register_SecondUserIsReadonly(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("first@test.com", "StrongPass1!")
	result, err := svc.Register("second@test.com", "StrongPass2!")
	if err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	if result.User.Role != auth.RoleReadonly {
		t.Errorf("second user role = %q, want readonly", result.User.Role)
	}
}

func TestAuthService_Register_DuplicateEmail(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("dup@test.com", "StrongPass1!")
	_, err := svc.Register("dup@test.com", "StrongPass2!")
	if err == nil {
		t.Error("should reject duplicate email")
	}
}

func TestAuthService_Login_Success(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("user@test.com", "StrongPass1!")
	tokens, user, err := svc.Login("user@test.com", "StrongPass1!", "127.0.0.1")
	if err != nil {
		t.Fatalf("Login() error = %v", err)
	}
	if user.Email != "user@test.com" {
		t.Errorf("email = %q", user.Email)
	}
	if tokens.AccessToken == "" {
		t.Error("access token should not be empty")
	}
}

func TestAuthService_Login_WrongPassword(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("user@test.com", "StrongPass1!")
	_, _, err := svc.Login("user@test.com", "WrongPass1!", "127.0.0.1")
	if err == nil {
		t.Error("should reject wrong password")
	}
}

func TestAuthService_Login_NonExistentUser(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	_, _, err := svc.Login("nobody@test.com", "StrongPass1!", "127.0.0.1")
	if err == nil {
		t.Error("should reject non-existent user")
	}
}

func TestAuthService_Login_RateLimited(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("user@test.com", "StrongPass1!")

	for i := 0; i < 5; i++ {
		svc.Login("user@test.com", "WrongPass!", "10.0.0.1")
	}

	_, _, err := svc.Login("user@test.com", "StrongPass1!", "10.0.0.1")
	if err == nil {
		t.Error("should be rate limited after 5 failed attempts")
	}
}

func TestAuthService_Login_RateLimitPerIP(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("user@test.com", "StrongPass1!")

	for i := 0; i < 5; i++ {
		svc.Login("user@test.com", "WrongPass!", "10.0.0.1")
	}

	tokens, _, err := svc.Login("user@test.com", "StrongPass1!", "10.0.0.2")
	if err != nil {
		t.Fatalf("different IP should not be rate limited: %v", err)
	}
	if tokens.AccessToken == "" {
		t.Error("should return valid tokens")
	}
}

func TestAuthService_RefreshToken(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("user@test.com", "StrongPass1!")
	newTokens, err := svc.RefreshToken(result.Tokens.RefreshToken)
	if err != nil {
		t.Fatalf("RefreshToken() error = %v", err)
	}
	if newTokens.AccessToken == "" {
		t.Error("new access token should not be empty")
	}
}

func TestAuthService_RefreshToken_ReuseDetection(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("user@test.com", "StrongPass1!")
	oldRefresh := result.Tokens.RefreshToken

	svc.RefreshToken(oldRefresh)
	_, err := svc.RefreshToken(oldRefresh)
	if err == nil {
		t.Error("reusing old refresh token should fail")
	}
}

func TestAuthService_UpdateUserRole(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	svc.Register("admin@test.com", "StrongPass1!")
	result, _ := svc.Register("user@test.com", "StrongPass2!")

	err := svc.UpdateUserRole(result.User.ID, auth.RoleAdmin)
	if err != nil {
		t.Fatalf("UpdateUserRole() error = %v", err)
	}
}

func TestAuthService_UpdateUserRole_InvalidRole(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("admin@test.com", "StrongPass1!")
	err := svc.UpdateUserRole(result.User.ID, "superadmin")
	if err == nil {
		t.Error("should reject invalid role")
	}
}

func TestAuthService_UpdateUserRole_CannotDemoteLastAdmin(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("admin@test.com", "StrongPass1!")
	err := svc.UpdateUserRole(result.User.ID, auth.RoleReadonly)
	if err == nil {
		t.Error("should not allow demoting last admin")
	}
}

func TestAuthService_DeleteUser_CannotDeleteLastAdmin(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("admin@test.com", "StrongPass1!")
	err := svc.DeleteUser(result.User.ID)
	if err == nil {
		t.Error("should not allow deleting last admin")
	}
}

func TestAuthService_ChangePassword(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("user@test.com", "StrongPass1!")
	err := svc.ChangePassword(result.User.ID, "StrongPass1!", "NewStrong2!")
	if err != nil {
		t.Fatalf("ChangePassword() error = %v", err)
	}

	_, _, err = svc.Login("user@test.com", "NewStrong2!", "127.0.0.1")
	if err != nil {
		t.Fatalf("Login with new password should work: %v", err)
	}
}

func TestAuthService_ChangePassword_WrongCurrent(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("user@test.com", "StrongPass1!")
	err := svc.ChangePassword(result.User.ID, "WrongPass1!", "NewStrong2!")
	if err == nil {
		t.Error("should reject wrong current password")
	}
}

func TestAuthService_ChangePassword_SamePassword(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("user@test.com", "StrongPass1!")
	err := svc.ChangePassword(result.User.ID, "StrongPass1!", "StrongPass1!")
	if err == nil {
		t.Error("should reject same password")
	}
}

func TestAuthService_GetUser(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	result, _ := svc.Register("user@test.com", "StrongPass1!")
	user, err := svc.GetUser(result.User.ID)
	if err != nil {
		t.Fatalf("GetUser() error = %v", err)
	}
	if user.Email != "user@test.com" {
		t.Errorf("email = %q", user.Email)
	}
}

func TestAuthService_GetUser_NotFound(t *testing.T) {
	repo := tempAuthRepo(t)
	svc := NewAuthService(repo)

	_, err := svc.GetUser(999)
	if err == nil {
		t.Error("should return error for non-existent user")
	}
}
