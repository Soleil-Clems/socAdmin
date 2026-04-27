package auth

import "testing"

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		name    string
		pass    string
		wantErr bool
	}{
		{"valid", "Abcdef123!@", false},
		{"too short", "Ab1!abcde", true},
		{"exactly 10 chars valid", "Abcdef123!", false},
		{"no uppercase", "abcdef123!", true},
		{"no lowercase", "ABCDEF123!", true},
		{"no digit", "Abcdefghi!", true},
		{"no special", "Abcdefg123", true},
		{"empty", "", true},
		{"spaces count as length but not special", "Abcdef123 ", true},
		{"unicode special char", "Abcdef123€", false},
		{"long valid", "Abcdef123!xxxxxxxxxxxxxxxxxxxxxxxx", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePassword(tt.pass)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidatePassword(%q) error = %v, wantErr %v", tt.pass, err, tt.wantErr)
			}
		})
	}
}
