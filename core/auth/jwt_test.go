package auth

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func init() {
	InitJWTSecret([]byte("test-secret-key-for-unit-tests-32b!"))
}

func TestGenerateAndValidateAccessToken(t *testing.T) {
	user := &User{ID: 42, Email: "test@example.com", Role: RoleAdmin}

	token, err := GenerateAccessToken(user)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}
	if token == "" {
		t.Fatal("GenerateAccessToken() returned empty token")
	}

	claims, err := ValidateAccessToken(token)
	if err != nil {
		t.Fatalf("ValidateAccessToken() error = %v", err)
	}
	if claims.UserID != 42 {
		t.Errorf("UserID = %d, want 42", claims.UserID)
	}
	if claims.Email != "test@example.com" {
		t.Errorf("Email = %q, want %q", claims.Email, "test@example.com")
	}
	if claims.Role != RoleAdmin {
		t.Errorf("Role = %q, want %q", claims.Role, RoleAdmin)
	}
}

func TestValidateAccessToken_Expired(t *testing.T) {
	user := &User{ID: 1, Email: "a@b.com", Role: RoleReadonly}

	claims := Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now().Add(-2 * time.Hour)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString(jwtSecret)

	_, err := ValidateAccessToken(signed)
	if err == nil {
		t.Error("ValidateAccessToken() should reject expired token")
	}
}

func TestValidateAccessToken_InvalidSignature(t *testing.T) {
	_, err := ValidateAccessToken("header.payload.badsignature")
	if err == nil {
		t.Error("ValidateAccessToken() should reject token with bad signature")
	}
}

func TestValidateAccessToken_GarbageInput(t *testing.T) {
	_, err := ValidateAccessToken("not-a-jwt")
	if err == nil {
		t.Error("ValidateAccessToken() should reject garbage input")
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	t1, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken() error = %v", err)
	}
	if len(t1) != 64 {
		t.Errorf("refresh token length = %d, want 64 hex chars", len(t1))
	}

	t2, _ := GenerateRefreshToken()
	if t1 == t2 {
		t.Error("two refresh tokens should not be identical")
	}
}

func TestGenerateAccessToken_DifferentUsers(t *testing.T) {
	u1 := &User{ID: 1, Email: "a@b.com", Role: RoleAdmin}
	u2 := &User{ID: 2, Email: "c@d.com", Role: RoleReadonly}

	tok1, _ := GenerateAccessToken(u1)
	tok2, _ := GenerateAccessToken(u2)

	if tok1 == tok2 {
		t.Error("tokens for different users should differ")
	}
}
