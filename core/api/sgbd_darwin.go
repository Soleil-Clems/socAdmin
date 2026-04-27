package api

func sgbdSearchPaths() []string {
	return []string{
		// MAMP
		"/Applications/MAMP/Library/bin/mysql80/bin",
		"/Applications/MAMP/Library/bin/mysql57/bin",
		"/Applications/MAMP/Library/bin",
		// Homebrew (arm64)
		"/opt/homebrew/bin",
		"/opt/homebrew/opt/mysql/bin",
		"/opt/homebrew/opt/postgresql@17/bin",
		"/opt/homebrew/opt/postgresql@16/bin",
		"/opt/homebrew/opt/postgresql@15/bin",
		"/opt/homebrew/opt/postgresql/bin",
		"/opt/homebrew/opt/mongodb-community/bin",
		// Homebrew (Intel)
		"/usr/local/bin",
		"/usr/local/opt/mysql/bin",
		"/usr/local/opt/postgresql/bin",
		"/usr/local/opt/mongodb-community/bin",
	}
}
