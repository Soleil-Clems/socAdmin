package backup

import "testing"

func TestFormatFor_MySQL(t *testing.T) {
	f := FormatFor("mysql")
	if f.Extension != ".sql" {
		t.Errorf("extension = %q, want .sql", f.Extension)
	}
	if f.ContentType != "application/sql" {
		t.Errorf("content type = %q, want application/sql", f.ContentType)
	}
}

func TestFormatFor_PostgreSQL(t *testing.T) {
	f := FormatFor("postgresql")
	if f.Extension != ".sql" {
		t.Errorf("extension = %q, want .sql", f.Extension)
	}
}

func TestFormatFor_MongoDB(t *testing.T) {
	f := FormatFor("mongodb")
	if f.Extension != ".archive" {
		t.Errorf("extension = %q, want .archive", f.Extension)
	}
	if f.ContentType != "application/octet-stream" {
		t.Errorf("content type = %q, want application/octet-stream", f.ContentType)
	}
}

func TestFormatFor_Unknown(t *testing.T) {
	f := FormatFor("redis")
	if f.Extension != ".sql" {
		t.Errorf("unknown type should default to .sql, got %q", f.Extension)
	}
}

func TestCheckBinaries(t *testing.T) {
	result := CheckBinaries()
	for _, key := range []string{"mysql", "postgresql", "mongodb"} {
		if _, ok := result[key]; !ok {
			t.Errorf("CheckBinaries() missing key %q", key)
		}
	}
}

func TestLimitedBuffer_UnderLimit(t *testing.T) {
	buf := &limitedBuffer{max: 100}
	n, err := buf.Write([]byte("hello"))
	if err != nil || n != 5 {
		t.Errorf("Write() = %d, %v", n, err)
	}
	if buf.String() != "hello" {
		t.Errorf("got %q", buf.String())
	}
}

func TestLimitedBuffer_OverLimit(t *testing.T) {
	buf := &limitedBuffer{max: 5}
	n, err := buf.Write([]byte("hello world"))
	if err != nil {
		t.Fatal(err)
	}
	if n != 11 {
		t.Errorf("Write should report full len written, got %d", n)
	}
	if buf.String() != "hello" {
		t.Errorf("got %q, want truncated to 5 bytes", buf.String())
	}
}

func TestLimitedBuffer_MultipleWrites(t *testing.T) {
	buf := &limitedBuffer{max: 8}
	buf.Write([]byte("hello"))
	buf.Write([]byte(" world"))
	if buf.String() != "hello wo" {
		t.Errorf("got %q, want 'hello wo'", buf.String())
	}
}

func TestLimitedBuffer_AtCapacity_DropsAll(t *testing.T) {
	buf := &limitedBuffer{max: 3}
	buf.Write([]byte("abc"))
	n, _ := buf.Write([]byte("def"))
	if n != 3 {
		t.Errorf("Write after full should still report len, got %d", n)
	}
	if buf.String() != "abc" {
		t.Errorf("got %q", buf.String())
	}
}
