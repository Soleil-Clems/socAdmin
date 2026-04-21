package security

import (
	"crypto/rand"
	"testing"
)

func testKey() []byte {
	key := make([]byte, 32)
	rand.Read(key)
	return key
}

func TestEncryptDecrypt(t *testing.T) {
	key := testKey()
	plaintext := "my-secret-db-password"

	encrypted, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt() error = %v", err)
	}
	if encrypted == plaintext {
		t.Error("ciphertext should differ from plaintext")
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if decrypted != plaintext {
		t.Errorf("Decrypt() = %q, want %q", decrypted, plaintext)
	}
}

func TestEncryptDecrypt_EmptyString(t *testing.T) {
	key := testKey()
	encrypted, err := Encrypt("", key)
	if err != nil {
		t.Fatalf("Encrypt('') error = %v", err)
	}
	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if decrypted != "" {
		t.Errorf("got %q, want empty", decrypted)
	}
}

func TestEncryptDecrypt_LongString(t *testing.T) {
	key := testKey()
	long := ""
	for i := 0; i < 1000; i++ {
		long += "abcdefghij"
	}
	encrypted, _ := Encrypt(long, key)
	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt() error = %v", err)
	}
	if decrypted != long {
		t.Error("round-trip failed for long string")
	}
}

func TestEncrypt_WrongKeySize(t *testing.T) {
	_, err := Encrypt("test", []byte("short"))
	if err == nil {
		t.Error("Encrypt() should reject key != 32 bytes")
	}
}

func TestDecrypt_WrongKeySize(t *testing.T) {
	_, err := Decrypt("dGVzdA==", []byte("short"))
	if err == nil {
		t.Error("Decrypt() should reject key != 32 bytes")
	}
}

func TestDecrypt_WrongKey(t *testing.T) {
	key1 := testKey()
	key2 := testKey()

	encrypted, _ := Encrypt("secret", key1)
	_, err := Decrypt(encrypted, key2)
	if err == nil {
		t.Error("Decrypt() should fail with wrong key")
	}
}

func TestDecrypt_InvalidBase64(t *testing.T) {
	key := testKey()
	_, err := Decrypt("not-valid-base64!!!", key)
	if err == nil {
		t.Error("Decrypt() should fail on invalid base64")
	}
}

func TestDecrypt_TruncatedCiphertext(t *testing.T) {
	key := testKey()
	_, err := Decrypt("YQ==", key)
	if err == nil {
		t.Error("Decrypt() should fail on truncated ciphertext")
	}
}

func TestEncrypt_UniqueNonce(t *testing.T) {
	key := testKey()
	e1, _ := Encrypt("same", key)
	e2, _ := Encrypt("same", key)
	if e1 == e2 {
		t.Error("encrypting same plaintext twice should produce different ciphertext (unique nonce)")
	}
}
