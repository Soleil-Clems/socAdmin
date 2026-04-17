package main

import (
	"bufio"
	"fmt"
	"os"
	"os/user"
	"strings"

	"github.com/soleilouisol/socAdmin/core/auth"
	"github.com/soleilouisol/socAdmin/core/logger"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/term"
)

// runPasswordReset is the CLI password-reset flow.
// Locks down via filesystem perms — anyone who can run the binary AND read
// socadmin.db is already a de-facto admin. Asks for explicit confirmation
// to avoid scripted abuse, and writes an audit log line.
func runPasswordReset(repo *auth.Repository, email string) error {
	user, err := repo.FindByEmail(email)
	if err != nil {
		return fmt.Errorf("database error: %w", err)
	}
	if user == nil {
		return fmt.Errorf("You don't have any permissions for %q", email)
	}

	fmt.Printf("About to reset password for: %s (id=%d, role=%s)\n", user.Email, user.ID, user.Role)
	fmt.Printf("Type \"RESET %s\" to confirm: ", user.Email)
	reader := bufio.NewReader(os.Stdin)
	confirmation, _ := reader.ReadString('\n')
	confirmation = strings.TrimSpace(confirmation)
	expected := "RESET " + user.Email
	if confirmation != expected {
		return fmt.Errorf("confirmation mismatch, aborted")
	}

	fmt.Print("New password: ")
	pass1, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("failed to read password: %w", err)
	}
	if err := auth.ValidatePassword(string(pass1)); err != nil {
		return err
	}

	fmt.Print("Confirm new password: ")
	pass2, err := term.ReadPassword(int(os.Stdin.Fd()))
	fmt.Println()
	if err != nil {
		return fmt.Errorf("failed to read confirmation: %w", err)
	}
	if string(pass1) != string(pass2) {
		return fmt.Errorf("passwords do not match")
	}

	hashed, err := bcrypt.GenerateFromPassword(pass1, 12)
	if err != nil {
		return fmt.Errorf("failed to hash password: %w", err)
	}
	if err := repo.UpdatePassword(user.ID, string(hashed)); err != nil {
		return fmt.Errorf("failed to update password: %w", err)
	}
	repo.RevokeAllRefreshTokens(user.ID)

	osUser := "unknown"
	if u, err := osUserName(); err == nil {
		osUser = u
	}
	logger.Auth(fmt.Sprintf("password_reset_cli os_user=%s", osUser), user.ID, "cli")

	fmt.Printf("Password updated for %s. All refresh tokens revoked.\n", user.Email)
	return nil
}

func osUserName() (string, error) {
	u, err := user.Current()
	if err != nil {
		return "", err
	}
	return u.Username, nil
}
