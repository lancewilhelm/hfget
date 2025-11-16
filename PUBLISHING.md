# Publishing Guide

This guide explains how to publish `hfget` to various package managers.

## Prerequisites

1. Build the project:
   ```bash
   npm run build
   ```

2. Test the built version locally:
   ```bash
   npm link
   hfget --help
   ```

## Publishing to npm

### Initial Setup

1. Create an npm account at https://www.npmjs.com/signup

2. Login via CLI:
   ```bash
   npm login
   ```

3. Update `package.json` with your details:
   - `author`: Your name and email
   - `repository.url`: Your GitHub repository URL
   - `homepage`: Project homepage (usually GitHub repo)
   - `bugs.url`: Issues URL

### Publishing

1. Update version number:
   ```bash
   npm version patch  # 0.0.2 -> 0.0.3
   npm version minor  # 0.0.2 -> 0.1.0
   npm version major  # 0.0.2 -> 1.0.0
   ```

2. Publish to npm:
   ```bash
   npm publish
   ```

3. Users can now install with:
   ```bash
   npm install -g hfget
   ```

## Publishing to Homebrew (macOS/Linux)

Homebrew requires a GitHub release with a tarball.

### Steps

1. Create a GitHub release:
   - Tag: `v0.0.2`
   - Include release notes
   - GitHub will auto-generate source tarball

2. Get the tarball URL and SHA256:
   ```bash
   curl -L https://github.com/yourusername/hfget/archive/v0.0.2.tar.gz | shasum -a 256
   ```

3. Create a Homebrew formula (file: `hfget.rb`):
   ```ruby
   class Hfget < Formula
     desc "CLI tool for downloading models from HuggingFace"
     homepage "https://github.com/yourusername/hfget"
     url "https://github.com/yourusername/hfget/archive/v0.0.2.tar.gz"
     sha256 "YOUR_SHA256_HERE"
     license "MIT"

     depends_on "node"

     def install
       system "npm", "install", *std_npm_args
       bin.install_symlink Dir["#{libexec}/bin/*"]
     end

     test do
       system "#{bin}/hfget", "--version"
     end
   end
   ```

4. Submit to Homebrew:
   - Fork https://github.com/Homebrew/homebrew-core
   - Add your formula to `Formula/h/hfget.rb`
   - Submit a pull request

5. Or create your own tap:
   ```bash
   # Create a repo: homebrew-tap
   # Add the formula to Formula/hfget.rb
   # Users install with:
   brew tap yourusername/tap
   brew install hfget
   ```

## Publishing to AUR (Arch Linux)

### Steps

1. Create a PKGBUILD file:
   ```bash
   # Maintainer: Your Name <your.email@example.com>
   pkgname=hfget
   pkgver=0.0.2
   pkgrel=1
   pkgdesc="CLI tool for downloading models from HuggingFace"
   arch=('any')
   url="https://github.com/yourusername/hfget"
   license=('MIT')
   depends=('nodejs')
   makedepends=('npm')
   source=("$pkgname-$pkgver.tar.gz::https://github.com/yourusername/hfget/archive/v$pkgver.tar.gz")
   sha256sums=('YOUR_SHA256_HERE')

   package() {
     cd "$srcdir/$pkgname-$pkgver"
     npm install --production --cache "$srcdir/npm-cache"
     install -dm755 "$pkgdir/usr/lib/$pkgname"
     cp -r * "$pkgdir/usr/lib/$pkgname"
     install -dm755 "$pkgdir/usr/bin"
     ln -s "/usr/lib/$pkgname/dist/cli.js" "$pkgdir/usr/bin/hfget"
   }
   ```

2. Test locally:
   ```bash
   makepkg -si
   ```

3. Publish to AUR:
   - Create AUR account: https://aur.archlinux.org/register
   - Clone the AUR repo:
     ```bash
     git clone ssh://aur@aur.archlinux.org/hfget.git
     ```
   - Add PKGBUILD and .SRCINFO:
     ```bash
     cd hfget
     cp /path/to/PKGBUILD .
     makepkg --printsrcinfo > .SRCINFO
     git add PKGBUILD .SRCINFO
     git commit -m "Initial commit: hfget 0.0.2"
     git push
     ```

4. Users install with:
   ```bash
   yay -S hfget
   # or
   paru -S hfget
   ```

## Publishing to apt (Debian/Ubuntu)

This is more complex and requires maintaining a PPA or debian repository.

### Option 1: PPA (Ubuntu)

1. Create Launchpad account
2. Set up PPA
3. Create debian packaging files
4. Build and upload package

**Detailed guide:** https://help.launchpad.net/Packaging/PPA

### Option 2: Use a third-party service

Use services like:
- **Packagecloud.io** - Hosts apt/yum repositories
- **Gemfury** - Private/public package hosting

## Recommended Publishing Strategy

**Phase 1 - Easy Start:**
1. Publish to npm (everyone with Node.js can use it)
2. Create GitHub releases with binaries

**Phase 2 - Package Managers:**
3. Create your own Homebrew tap (easy to maintain)
4. Publish to AUR (Arch users love AUR)

**Phase 3 - Official Repos:**
5. Submit to Homebrew core (for wider reach)
6. Consider apt/yum if user base grows

## Quick Checklist Before Publishing

- [ ] Update version in package.json
- [ ] Update CHANGELOG or release notes
- [ ] Run `npm run build` successfully
- [ ] Test locally with `npm link`
- [ ] All dependencies in package.json
- [ ] README is up to date
- [ ] LICENSE file exists
- [ ] Git tag matches version
- [ ] Commit and push all changes

## Version Bumping Strategy

- **Patch** (0.0.x): Bug fixes, minor tweaks
- **Minor** (0.x.0): New features, non-breaking changes
- **Major** (x.0.0): Breaking changes, major rewrites

## Post-Publishing

1. Announce on:
   - GitHub Discussions/Releases
   - Reddit (r/commandline, r/programming)
   - HackerNews
   - Twitter/Mastodon

2. Monitor:
   - GitHub issues
   - npm download stats
   - User feedback

3. Maintain:
   - Keep dependencies updated
   - Fix reported bugs
   - Add requested features