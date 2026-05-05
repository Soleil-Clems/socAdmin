// @soleil-clems: Manager - System tray shared code
package main

import (
	_ "embed"
	"runtime"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed tray_icon.png
var trayIconPNG []byte

//go:embed tray_icon.ico
var trayIconICO []byte

var trayIconBytes []byte

func init() {
	if runtime.GOOS == "windows" {
		trayIconBytes = trayIconICO
	} else {
		trayIconBytes = trayIconPNG
	}
}

var trayApp *App
var forceQuit bool

func handleTrayClick(itemID int) {
	if trayApp == nil || trayApp.ctx == nil {
		return
	}
	switch itemID {
	case trayShow:
		showInDock()
		wailsRuntime.WindowShow(trayApp.ctx)
	case trayStart:
		go trayApp.StartServer()
	case trayStop:
		go trayApp.StopServer()
	case trayBrowser:
		trayApp.OpenBrowser()
	case trayQuit:
		forceQuit = true
		cleanupTray()
		go trayApp.StopServer()
		wailsRuntime.Quit(trayApp.ctx)
	}
}
