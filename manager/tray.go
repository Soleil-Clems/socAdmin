// @soleil-clems: Manager - System tray shared code
package main

import (
	_ "embed"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed tray_icon.png
var trayIconBytes []byte

var trayApp *App

func handleTrayClick(itemID int) {
	if trayApp == nil || trayApp.ctx == nil {
		return
	}
	switch itemID {
	case trayShow:
		wailsRuntime.WindowShow(trayApp.ctx)
	case trayStart:
		go trayApp.StartServer()
	case trayStop:
		go trayApp.StopServer()
	case trayBrowser:
		trayApp.OpenBrowser()
	case trayQuit:
		go trayApp.StopServer()
		wailsRuntime.Quit(trayApp.ctx)
	}
}
