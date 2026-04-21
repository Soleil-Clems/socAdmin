package service

import "testing"

func TestToInt64(t *testing.T) {
	tests := []struct {
		name  string
		input interface{}
		want  int64
	}{
		{"int64", int64(42), 42},
		{"float64", float64(3.14), 3},
		{"int", int(7), 7},
		{"string", "100", 100},
		{"nil", nil, 0},
		{"bool", true, 0},
		{"empty string", "", 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := toInt64(tt.input)
			if got != tt.want {
				t.Errorf("toInt64(%v) = %d, want %d", tt.input, got, tt.want)
			}
		})
	}
}

func TestFormatBytes(t *testing.T) {
	tests := []struct {
		input int64
		want  string
	}{
		{0, "0 B"},
		{500, "500 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1048576, "1.0 MB"},
		{1073741824, "1.0 GB"},
	}
	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := formatBytes(tt.input)
			if got != tt.want {
				t.Errorf("formatBytes(%d) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestEscapeLike(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"hello", "hello"},
		{"100%", `100\%`},
		{"user_name", `user\_name`},
		{`back\slash`, `back\\slash`},
		{"it's", "it''s"},
		{`%_\'`, `\%\_\\''`},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := escapeLike(tt.input)
			if got != tt.want {
				t.Errorf("escapeLike(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestContainsCI(t *testing.T) {
	tests := []struct {
		s, substr string
		want      bool
	}{
		{"Hello World", "hello", true},
		{"Hello World", "WORLD", true},
		{"Hello World", "xyz", false},
		{"", "", true},
		{"abc", "", true},
		{"", "abc", false},
	}
	for _, tt := range tests {
		got := containsCI(tt.s, tt.substr)
		if got != tt.want {
			t.Errorf("containsCI(%q, %q) = %v, want %v", tt.s, tt.substr, got, tt.want)
		}
	}
}

func TestDatabaseService_NotConnected(t *testing.T) {
	svc := NewDatabaseService()

	if svc.IsConnected() {
		t.Error("new service should not be connected")
	}
	if svc.GetType() != "" {
		t.Error("type should be empty")
	}
	if svc.GetConnectionInfo() != nil {
		t.Error("connection info should be nil")
	}

	_, err := svc.ListDatabases()
	if err == nil {
		t.Error("ListDatabases should fail when not connected")
	}
	_, err = svc.ListTables("test")
	if err == nil {
		t.Error("ListTables should fail when not connected")
	}
	_, err = svc.ExecuteQuery("test", "SELECT 1")
	if err == nil {
		t.Error("ExecuteQuery should fail when not connected")
	}
	err = svc.CreateDatabase("test")
	if err == nil {
		t.Error("CreateDatabase should fail when not connected")
	}
	err = svc.DropDatabase("test")
	if err == nil {
		t.Error("DropDatabase should fail when not connected")
	}
}

func TestDatabaseService_ConnectUnsupportedType(t *testing.T) {
	svc := NewDatabaseService()
	err := svc.Connect("localhost", 3306, "root", "", "redis")
	if err == nil {
		t.Error("should reject unsupported database type")
	}
}

func TestDatabaseService_Preconfigured(t *testing.T) {
	svc := NewDatabaseService()

	configs := []PreconfiguredDB{
		{Type: "mysql", Host: "db", Port: 3306, User: "root"},
		{Type: "postgresql", Host: "pg", Port: 5432, User: "postgres"},
	}
	svc.SetPreconfigured(configs)

	got := svc.ListPreconfigured()
	if len(got) != 2 {
		t.Errorf("len = %d, want 2", len(got))
	}
	if got[0].Host != "db" {
		t.Errorf("host = %q, want db", got[0].Host)
	}
}

func TestDatabaseService_Disconnect_WhenNotConnected(t *testing.T) {
	svc := NewDatabaseService()
	err := svc.Disconnect()
	if err != nil {
		t.Errorf("Disconnect() on unconnected service should not error: %v", err)
	}
}
