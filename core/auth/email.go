// @soleil-clems: Auth - Email validation
package auth

import (
	"fmt"
	"net/mail"
	"strings"
)

func ValidateEmail(email string) error {
	if strings.TrimSpace(email) == "" {
		return fmt.Errorf("email is required")
	}
	addr, err := mail.ParseAddress(email)
	if err != nil {
		return fmt.Errorf("invalid email format")
	}
	if addr.Address != email {
		return fmt.Errorf("invalid email format")
	}
	parts := strings.SplitN(addr.Address, "@", 2)
	if len(parts) != 2 || !strings.Contains(parts[1], ".") {
		return fmt.Errorf("invalid email format")
	}
	return nil
}
