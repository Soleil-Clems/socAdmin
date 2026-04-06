package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	appMenu := menu.NewMenu()

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
	fileMenu.AddSeparator()
	fileMenu.AddText("Quit", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		app.StopServer()
	})

	err := wails.Run(&options.App{
		Title:     "socAdmin Manager",
		Width:     820,
		Height:    580,
		MinWidth:  700,
		MinHeight: 500,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:             appMenu,
		BackgroundColour: &options.RGBA{R: 15, G: 15, B: 20, A: 1},
		OnStartup:        app.startup,
		OnShutdown:       app.shutdown,
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
				Title:   "socAdmin Manager",
				Message: "Database administration made simple.\nVersion 1.0.0",
			},
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
