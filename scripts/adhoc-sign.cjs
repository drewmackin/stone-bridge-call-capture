// electron-builder afterPack hook: give the app its OWN ad-hoc code signature.
//
// Without an Apple Developer ID, electron-builder skips signing and ships Electron's
// stock linker-signed executable unchanged. That binary's cdhash is identical in every
// unsigned Electron 31.7.7 app — including real malware — and Apple has revoked it, so
// macOS says "contains malware" and moves the app to the Trash.
//
// Re-signing ad-hoc binds our Info.plist (com.stonebridge.callcapture) and seals the
// bundle's resources, which yields a cdhash unique to this app. Hardened runtime stays
// OFF (see electron-builder.yml) so the mic keeps using the normal TCC prompt; macOS
// will ask for mic permission once after each rebuild (ad-hoc grants are per-cdhash).
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
}
