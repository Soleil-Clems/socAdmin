package backup

func searchPaths() []string {
	return []string{
		"/usr/bin",
		"/usr/sbin",
		"/usr/lib/postgresql/17/bin",
		"/usr/lib/postgresql/16/bin",
		"/usr/lib/postgresql/15/bin",
		"/usr/lib/postgresql/14/bin",
		"/usr/lib/mysql/bin",
		"/usr/local/bin",
		"/snap/bin",
	}
}
