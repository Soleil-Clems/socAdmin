// @soleil-clems: Manager - Desktop app entrypoint (Wails)
package main

import (
	"context"
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	initTray(app)

	appMenu := menu.NewMenu()

	quitHandler := func(_ *menu.CallbackData) {
		wailsRuntime.WindowHide(app.ctx)
		hideFromDock()
	}

	appNameMenu := appMenu.AddSubmenu("Soca Manager")
	appNameMenu.AddText("About Soca Manager", nil, nil)
	appNameMenu.AddSeparator()
	appNameMenu.AddText("Quit Soca Manager", keys.CmdOrCtrl("q"), quitHandler)

	fileMenu := appMenu.AddSubmenu("File")
	fileMenu.AddText("Start Server", keys.CmdOrCtrl("s"), func(_ *menu.CallbackData) {
		app.StartServer()
	})
	fileMenu.AddText("Stop Server", keys.CmdOrCtrl("x"), func(_ *menu.CallbackData) {
		app.StopServer()
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("Open in Browser", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		app.OpenBrowser()
	})

	err := wails.Run(&options.App{
		Title:     "Soca Manager",
		Width:     820,
		Height:    580,
		MinWidth:  700,
		MinHeight: 500,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:              appMenu,
		HideWindowOnClose: true,
		BackgroundColour:  &options.RGBA{R: 15, G: 15, B: 20, A: 1},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			startTrayOnMainThread()
		},
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			if forceQuit {
				return false
			}
			wailsRuntime.WindowHide(ctx)
			hideFromDock()
			return true
		},
		OnShutdown: func(ctx context.Context) {
			cleanupTray()
			app.shutdown(ctx)
		},
		Bind: []interface{}{
			app,
		},
		Mac: &mac.Options{
			TitleBar: &mac.TitleBar{
				TitlebarAppearsTransparent: true,
				HideTitle:                 true,
				FullSizeContent:           true,
			},
			About: &mac.AboutInfo{
				Title:   "Soca Manager",
				Message: "Database administration made simple.\nVersion 1.0.0",
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Linux: &linux.Options{
			ProgramName: "Soca Manager",
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
