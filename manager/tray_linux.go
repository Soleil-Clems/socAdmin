// @soleil-clems: Manager - System tray for Linux
//go:build linux

package main

import (
	"os"
	"path/filepath"

	"github.com/energye/systray"
)

const (
	trayShow    = 0
	trayStart   = 1
	trayStop    = 2
	trayBrowser = 3
	trayQuit    = 4
)

var (
	mStart *systray.MenuItem
	mStop  *systray.MenuItem
)

var trayEnd func()

func initTray(app *App) {
	trayApp = app

	home, _ := os.UserHomeDir()
	iconDir := filepath.Join(home, ".socadmin", "icons", "hicolor", "256x256", "apps")
	os.MkdirAll(iconDir, 0755)
	os.WriteFile(filepath.Join(iconDir, "soca-manager.png"), trayIconPNG, 0644)

	themePath := filepath.Join(home, ".socadmin", "icons")
	systray.SetIconName("soca-manager")
	systray.SetIconThemePath(themePath)
}

func startTrayOnMainThread() {
	start, end := systray.RunWithExternalLoop(func() {
		systray.SetIcon(trayIconBytes)
		systray.SetTooltip("Soca Manager")

		mShowItem := systray.AddMenuItem("Show Window", "")
		mShowItem.Click(func() { handleTrayClick(trayShow) })

		systray.AddSeparator()

		mStart = systray.AddMenuItem("Start Server", "")
		mStart.Click(func() { handleTrayClick(trayStart) })

		mStop = systray.AddMenuItem("Stop Server", "")
		mStop.Click(func() { handleTrayClick(trayStop) })

		systray.AddSeparator()

		mBrowserItem := systray.AddMenuItem("Open in Browser", "")
		mBrowserItem.Click(func() { handleTrayClick(trayBrowser) })

		systray.AddSeparator()

		mQuitItem := systray.AddMenuItem("Quit", "")
		mQuitItem.Click(func() { handleTrayClick(trayQuit) })
	}, func() {})

	trayEnd = end
	start()
}

func hideFromDock() {}
func showInDock()   {}

func cleanupTray() {
	if trayEnd != nil {
		trayEnd()
	}
}

func updateTrayServerState(running bool) {
	if mStart == nil || mStop == nil {
		return
	}
	if running {
		mStart.Disable()
		mStop.Enable()
		systray.SetTooltip("Soca Manager — Server running")
	} else {
		mStart.Enable()
		mStop.Disable()
		systray.SetTooltip("Soca Manager")
	}
}
