package service

import (
	"fmt"
	"time"

	"github.com/soleilouisol/socAdmin/core/auth"
	"golang.org/x/crypto/bcrypt"
)

const maxLoginAttempts = 5
const rateLimitWindow = 15 * time.Minute

type AuthService struct {
	repo *auth.Repository
}

func NewAuthService(repo *auth.Repository) *AuthService {
	return &AuthService{repo: repo}
}

func (s *AuthService) Register(email, password string) (*auth.User, error) {
	existing, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("email already registered")
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("failed to hash password: %w", err)
	}

	// First user ever registered becomes admin
	role := auth.RoleReadonly
	count, err := s.repo.UserCount()
	if err == nil && count == 0 {
		role = auth.RoleAdmin
	}

	return s.repo.CreateUser(email, string(hashed), role)
}

func (s *AuthService) Login(email, password string) (*auth.TokenPair, error) {
	// Rate limiting
	count, err := s.repo.CountRecentAttempts(email, time.Now().Add(-rateLimitWindow))
	if err != nil {
		return nil, err
	}
	if count >= maxLoginAttempts {
		return nil, fmt.Errorf("too many login attempts, try again later")
	}

	s.repo.RecordLoginAttempt(email)

	user, err := s.repo.FindByEmail(email)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("invalid email or password")
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(password)); err != nil {
		return nil, fmt.Errorf("invalid email or password")
	}

	// Login réussi, on clear les tentatives
	s.repo.ClearLoginAttempts(email)

	return s.generateTokenPair(user)
}

func (s *AuthService) RefreshToken(refreshToken string) (*auth.TokenPair, error) {
	userID, err := s.repo.FindRefreshToken(refreshToken)
	if err != nil {
		return nil, err
	}

	// Supprimer l'ancien refresh token (rotation)
	s.repo.DeleteRefreshToken(refreshToken)

	user, err := s.repo.FindByID(userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("user not found")
	}

	return s.generateTokenPair(user)
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
