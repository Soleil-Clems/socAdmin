package main

import (
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

	appMenu := menu.NewMenu()

	quitHandler := func(_ *menu.CallbackData) {
		go app.StopServer()
		wailsRuntime.Quit(app.ctx)
	}

	appNameMenu := appMenu.AddSubmenu("socAdmin Manager")
	appNameMenu.AddText("About socAdmin Manager", nil, nil)
	appNameMenu.AddSeparator()
	appNameMenu.AddText("Quit socAdmin Manager", keys.CmdOrCtrl("q"), quitHandler)

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
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
		Linux: &linux.Options{
			ProgramName: "socAdmin Manager",
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
