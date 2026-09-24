// Which OS the renderer is on — for OS-specific wording and the title-bar
// layout (macOS traffic lights on the left; Windows controls on the right).
export const isWindows = /Windows/i.test(navigator.userAgent)
export const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent)

/** Tag <html> so CSS can adapt the title bar per OS. */
export function tagPlatform(): void {
  document.documentElement.classList.add(isMac ? 'platform-mac' : isWindows ? 'platform-win' : 'platform-linux')
}
