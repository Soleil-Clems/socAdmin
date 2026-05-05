// @soleil-clems: Manager - CGO callback for macOS tray
package main

import "C"

//export goTrayMenuClicked
func goTrayMenuClicked(itemID C.int) {
	handleTrayClick(int(itemID))
}
