package logger

import (
	"bytes"
	"log"
	"strings"
	"testing"
	"time"
)

func captureLog(fn func()) string {
	var buf bytes.Buffer
	old := std
	std = log.New(&buf, "", 0)
	defer func() { std = old }()
	fn()
	return buf.String()
}

func TestAuth(t *testing.T) {
	out := captureLog(func() {
		Auth("login", 42, "10.0.0.1")
	})
	for _, want := range []string{"[AUTH]", "action=login", "user_id=42", "ip=10.0.0.1"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestAuthFail(t *testing.T) {
	out := captureLog(func() {
		AuthFail("login", "10.0.0.2")
	})
	for _, want := range []string{"[AUTH]", "status=failed", "ip=10.0.0.2"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestConnect(t *testing.T) {
	out := captureLog(func() {
		Connect(1, "10.0.0.1", "mysql", "db.example.com", 3306, true)
	})
	for _, want := range []string{"[CONNECT]", "type=mysql", "target=db.example.com:3306", "status=ok"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestConnect_Failed(t *testing.T) {
	out := captureLog(func() {
		Connect(1, "10.0.0.1", "mysql", "db.example.com", 3306, false)
	})
	if !strings.Contains(out, "status=failed") {
		t.Errorf("output should contain status=failed: %s", out)
	}
}

func TestQuery(t *testing.T) {
	out := captureLog(func() {
		Query(1, "10.0.0.1", "mydb", 50*time.Millisecond, 10, false)
	})
	for _, want := range []string{"[QUERY]", "db=mydb", "rows=10", "status=ok"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestQuery_Error(t *testing.T) {
	out := captureLog(func() {
		Query(1, "10.0.0.1", "mydb", 100*time.Millisecond, 0, true)
	})
	if !strings.Contains(out, "status=error") {
		t.Errorf("output should contain status=error: %s", out)
	}
}

func TestExport(t *testing.T) {
	out := captureLog(func() {
		Export(1, "10.0.0.1", "mydb", "users", "csv")
	})
	for _, want := range []string{"[EXPORT]", "target=mydb.users", "format=csv"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestExport_DatabaseLevel(t *testing.T) {
	out := captureLog(func() {
		Export(1, "10.0.0.1", "mydb", "", "sql")
	})
	if !strings.Contains(out, "target=mydb") {
		t.Errorf("output missing target=mydb: %s", out)
	}
	if strings.Contains(out, "target=mydb.") {
		t.Errorf("database-level export should not have dot: %s", out)
	}
}

func TestImport(t *testing.T) {
	out := captureLog(func() {
		Import(1, "10.0.0.1", "mydb", "users", "json", 500)
	})
	for _, want := range []string{"[IMPORT]", "target=mydb.users", "format=json", "rows=500"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestAdmin(t *testing.T) {
	out := captureLog(func() {
		Admin(1, "10.0.0.1", "drop_database", "testdb")
	})
	for _, want := range []string{"[ADMIN]", "action=drop_database", "target=testdb"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestSecurity(t *testing.T) {
	out := captureLog(func() {
		Security(1, "10.0.0.1", "whitelist_add", "10.0.0.5")
	})
	for _, want := range []string{"[SECURITY]", "action=whitelist_add", "detail=10.0.0.5"} {
		if !strings.Contains(out, want) {
			t.Errorf("output missing %q: %s", want, out)
		}
	}
}

func TestTimestamp_Format(t *testing.T) {
	ts := timestamp()
	if len(ts) != 20 {
		t.Errorf("timestamp length = %d, want 20 (ISO 8601 UTC)", len(ts))
	}
	if !strings.HasSuffix(ts, "Z") {
		t.Errorf("timestamp should end with Z (UTC): %s", ts)
	}
}
