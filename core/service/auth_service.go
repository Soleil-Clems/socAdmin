package service

import (
	"fmt"
	"time"

	"github.com/soleilouisol/socAdmin/core/auth"
	"golang.org/x/crypto/bcrypt"
)

const maxLoginAttempts = 5
const rateLimitWindow = 15 * time.Minute

var bcryptCost = 12

type AuthService struct {
	repo *auth.Repository
}

func NewAuthService(repo *auth.Repository) *AuthService {
	return &AuthService{repo: repo}
}

type RegisterResult struct {
	User   *auth.User
	Tokens *auth.TokenPair
}

func (s *AuthService) Register(email, password string) (*RegisterResult, error) {
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("email already registered")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcryptCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// First user ever registered becomes admin
	role := auth.RoleReadonly
	count, err := s.repo.UserCount()
	if err == nil && count == 0 {
		role = auth.RoleAdmin
	}

	user, err := s.repo.CreateUser(email, string(hashed), role)
	if err != nil {
		return nil, err
	}

	tokens, err := s.generateTokenPair(user)
	if err != nil {
		return nil, err
	}

	return &RegisterResult{User: user, Tokens: tokens}, nil
}

func (s *AuthService) Login(email, password, clientIP string) (*auth.TokenPair, *auth.User, error) {
	// Rate limiting by (email, IP) — prevents targeted lockout from a different IP
	count, err := s.repo.CountRecentAttempts(email, clientIP, time.Now().UTC().Add(-rateLimitWindow))
	if err != nil {
		return nil, nil, err
	}
	if count >= maxLoginAttempts {
		return nil, nil, fmt.Errorf("too many login attempts, try again later")
	}

	s.repo.RecordLoginAttempt(email, clientIP)

	// Constant-time: always run bcrypt even if user doesn't exist,
	// so an attacker can't distinguish "unknown email" from "wrong password"
	// by measuring response time.
	dummyHash := []byte("$2a$12$000000000000000000000uGqDGzRXMiZqFOeAaagWQTCdSvaaDOq6")

	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, nil, err
	}
	if user == nil {
		bcrypt.CompareHashAndPassword(dummyHash, []byte(password))
		return nil, nil, fmt.Errorf("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, nil, fmt.Errorf("invalid email or password")
	}

	// Login réussi, on clear les tentatives
	s.repo.ClearLoginAttempts(email, clientIP)

	tokens, err := s.generateTokenPair(user)
	if err != nil {
		return nil, nil, err
	}
	return tokens, user, nil
}

func (s *AuthService) RefreshToken(refreshToken string) (*auth.TokenPair, error) {
	userID, err := s.repo.FindRefreshToken(refreshToken)
	if err != nil {
		return nil, err
	}

	// Revoke (soft-delete) the old token so reuse can be detected
	s.repo.RevokeRefreshToken(refreshToken)

	user, err := s.repo.FindByID(userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("user not found")
	}

	return s.generateTokenPair(user)
}

func (s *AuthService) RevokeRefreshToken(token string) {
	s.repo.RevokeRefreshToken(token)
}

func (s *AuthService) ListUsers() ([]auth.User, error) {
	return s.repo.ListUsers()
}

func (s *AuthService) UpdateUserRole(id int64, role string) error {
	if role != auth.RoleAdmin && role != auth.RoleReadonly {
		return fmt.Errorf("invalid role: %s", role)
	}
	// Prevent removing the last admin
	if role != auth.RoleAdmin {
		users, err := s.repo.ListUsers()
		if err != nil {
			return err
		}
		admins := 0
		var targetIsAdmin bool
		for _, u := range users {
			if u.Role == auth.RoleAdmin {
				admins++
				if u.ID == id {
					targetIsAdmin = true
				}
			}
		}
		if targetIsAdmin && admins <= 1 {
			return fmt.Errorf("cannot demote the last admin")
		}
	}
	return s.repo.UpdateUserRole(id, role)
}

func (s *AuthService) DeleteUser(id int64) error {
	users, err := s.repo.ListUsers()
	if err != nil {
		return err
	}
	admins := 0
	var targetIsAdmin bool
	for _, u := range users {
		if u.Role == auth.RoleAdmin {
			admins++
			if u.ID == id {
				targetIsAdmin = true
			}
		}
	}
	if targetIsAdmin && admins <= 1 {
		return fmt.Errorf("cannot delete the last admin")
	}
	return s.repo.DeleteUser(id)
}

// ChangePassword verifies the user's current password, hashes the new one,
// updates it, and revokes all refresh tokens (forces re-login on other devices).
func (s *AuthService) ChangePassword(userID int64, currentPassword, newPassword string) error {
	if err := auth.ValidatePassword(newPassword); err != nil {
		return err
	}

	user, err := s.repo.FindByID(userID)
	if err != nil {
		return err
	}
	if user == nil {
		return fmt.Errorf("user not found")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(currentPassword)); err != nil {
		return fmt.Errorf("current password is incorrect")
	}

	if currentPassword == newPassword {
		return fmt.Errorf("new password must be different from current password")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcryptCost)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}

	if err := s.repo.UpdatePassword(userID, string(hashed)); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}

	// Best-effort: revoke other refresh tokens
	s.repo.RevokeAllRefreshTokens(userID)
	return nil
}

func (s *AuthService) GetUser(userID int64) (*auth.User, error) {
	user, err := s.repo.FindByID(userID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("user not found")
	}
	return user, nil
}

func (s *AuthService) generateTokenPair(user *auth.User) (*auth.TokenPair, error) {
	accessToken, err := auth.GenerateAccessToken(user)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token: %w", err)
	}

	refreshToken, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token: %w", err)
	}

	expiresAt := time.Now().Add(auth.RefreshTokenDuration)
	if err := s.repo.SaveRefreshToken(user.ID, refreshToken, expiresAt); err != nil {
		return nil, fmt.Errorf("failed to save refresh token: %w", err)
	}

	return &auth.TokenPair{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	}, nil
}
