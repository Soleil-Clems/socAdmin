// @soleil-clems: Manager - System tray macOS (pure CGO, no third-party lib)
package main

/*
#cgo darwin CFLAGS: -x objective-c -fobjc-arc
#cgo darwin LDFLAGS: -framework Cocoa

#import <Cocoa/Cocoa.h>

extern void goTrayMenuClicked(int itemID);

@interface SocaTrayDelegate : NSObject
@end

@implementation SocaTrayDelegate
- (void)menuClicked:(id)sender {
	NSMenuItem *item = (NSMenuItem *)sender;
	goTrayMenuClicked((int)item.tag);
}
@end

static NSStatusItem *_statusItem = nil;
static NSMenu *_trayMenu = nil;
static SocaTrayDelegate *_delegate = nil;
static const void *_iconData = NULL;
static int _iconLen = 0;

void socaStoreTrayIcon(const void *data, int len) {
	_iconData = malloc(len);
	memcpy((void *)_iconData, data, len);
	_iconLen = len;
}

void socaCreateTrayOnMain() {
	dispatch_async(dispatch_get_main_queue(), ^{
		_statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];

		NSData *data = [NSData dataWithBytes:_iconData length:_iconLen];
		NSImage *image = [[NSImage alloc] initWithData:data];
		[image setSize:NSMakeSize(18, 18)];
		[image setTemplate:YES];
		_statusItem.button.image = image;
		_statusItem.button.toolTip = @"Soca Manager";

		_delegate = [[SocaTrayDelegate alloc] init];
		_trayMenu = [[NSMenu alloc] init];

		NSMenuItem *item;

		item = [[NSMenuItem alloc] initWithTitle:@"Show Window" action:@selector(menuClicked:) keyEquivalent:@""];
		item.tag = 0; item.target = _delegate;
		[_trayMenu addItem:item];

		[_trayMenu addItem:[NSMenuItem separatorItem]];

		item = [[NSMenuItem alloc] initWithTitle:@"Start Server" action:@selector(menuClicked:) keyEquivalent:@""];
		item.tag = 1; item.target = _delegate;
		[_trayMenu addItem:item];

		item = [[NSMenuItem alloc] initWithTitle:@"Stop Server" action:@selector(menuClicked:) keyEquivalent:@""];
		item.tag = 2; item.target = _delegate;
		[_trayMenu addItem:item];

		[_trayMenu addItem:[NSMenuItem separatorItem]];

		item = [[NSMenuItem alloc] initWithTitle:@"Open in Browser" action:@selector(menuClicked:) keyEquivalent:@""];
		item.tag = 3; item.target = _delegate;
		[_trayMenu addItem:item];

		[_trayMenu addItem:[NSMenuItem separatorItem]];

		item = [[NSMenuItem alloc] initWithTitle:@"Quit" action:@selector(menuClicked:) keyEquivalent:@""];
		item.tag = 4; item.target = _delegate;
		[_trayMenu addItem:item];

		_statusItem.menu = _trayMenu;
	});
}

void socaSetItemEnabled(int tag, int enabled) {
	dispatch_async(dispatch_get_main_queue(), ^{
		for (NSMenuItem *item in _trayMenu.itemArray) {
			if (item.tag == tag) {
				item.enabled = enabled ? YES : NO;
				break;
			}
		}
	});
}

void socaSetTooltip(const char *tip) {
	NSString *str = [NSString stringWithUTF8String:tip];
	dispatch_async(dispatch_get_main_queue(), ^{
		if (_statusItem) {
			_statusItem.button.toolTip = str;
		}
	});
}

void socaRemoveTray() {
	dispatch_async(dispatch_get_main_queue(), ^{
		if (_statusItem) {
			[[NSStatusBar systemStatusBar] removeStatusItem:_statusItem];
			_statusItem = nil;
		}
		if (_iconData) {
			free((void *)_iconData);
			_iconData = NULL;
		}
	});
}
*/
import "C"
import "unsafe"

const (
	trayShow    = 0
	trayStart   = 1
	trayStop    = 2
	trayBrowser = 3
	trayQuit    = 4
)

func initTray(app *App) {
	trayApp = app
	C.socaStoreTrayIcon(unsafe.Pointer(&trayIconBytes[0]), C.int(len(trayIconBytes)))
}

func startTrayOnMainThread() {
	C.socaCreateTrayOnMain()
}

func cleanupTray() {
	C.socaRemoveTray()
}

func updateTrayServerState(running bool) {
	if running {
		C.socaSetItemEnabled(C.int(trayStart), 0)
		C.socaSetItemEnabled(C.int(trayStop), 1)
		C.socaSetTooltip(C.CString("Soca Manager — Server running"))
	} else {
		C.socaSetItemEnabled(C.int(trayStart), 1)
		C.socaSetItemEnabled(C.int(trayStop), 0)
		C.socaSetTooltip(C.CString("Soca Manager"))
	}
}
