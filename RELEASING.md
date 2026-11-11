# Releasing BookShelf

BookShelf ships as an APK you sideload; there is no Play listing. Publishing is a tag push.

---

## The signing key

> **Already installed a build you signed yourself?** Use that same keystore
> below instead of making a new one, or the phone will refuse the update.

An Android APK must be signed to install, and every later version must be
signed by **the same key**, or the phone refuses the upgrade. Losing the key
means every install has to be uninstalled and reinstalled from scratch, which
wipes its catalog. Make it once and keep it somewhere you will still have it in
five years.

This makes the key with OpenSSL, as a PKCS#12 file that Gradle and Android's
signing tools read directly (no Java needed). It works the same in Termux on
Android (`pkg install openssl`) as on a computer:

```bash
openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -noenc \
  -keyout bookshelf.key -out bookshelf.crt -subj "/CN=BookShelf"
openssl pkcs12 -export -inkey bookshelf.key -in bookshelf.crt -name bookshelf -out bookshelf.p12
rm bookshelf.key bookshelf.crt
```

The second command asks for a password twice. Keep it: in a PKCS#12 file it is
both the keystore password and the key password. `-name bookshelf` is the key alias.
`*.p12`, `*.jks`, `*.keystore` and `keystore.properties` are in `.gitignore`; do
not take them out.

(`keytool -genkeypair -keystore bookshelf.jks -alias bookshelf -keyalg RSA -keysize 4096
-validity 10000` makes an equivalent key if you have a JDK.)

---

## Building in CI (the usual path)

Add four repository secrets under **Settings → Secrets and variables → Actions**:

| Secret              | What goes in it                                             |
| ------------------- | ----------------------------------------------------------- |
| `KEYSTORE_BASE64`   | `base64 -w0 bookshelf.p12`, the whole keystore on one line  |
| `KEYSTORE_PASSWORD` | the keystore password                                       |
| `KEY_ALIAS`         | `bookshelf`, the `-name` (or `-alias`) you used             |
| `KEY_PASSWORD`      | the key password (for a `.p12`, the same as the keystore's) |

Then tag and push:

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` runs the checks, builds the page and the release
APK around it, signs it, uploads it as a build artifact, and opens a **draft**
GitHub release with the APK attached. Write the notes and press publish.

You can also start on GitHub instead: **Releases → Draft a new release**, type a
new `vX.Y.Z` tag under _Choose a tag_, write the notes, and press **Publish
release**. Publishing creates the tag and runs the same workflow, which adds the
APK to that release a few minutes later and leaves your notes alone. Saving it as
a draft starts nothing (GitHub runs no workflows for drafts), so publish it. If the
signing secrets are missing, the run fails rather than attach an unsigned APK to a
published release.

If any of the four secrets is missing, the workflow still finishes. It warns,
naming the missing ones, and names the file `bookshelf-<version>-unsigned.apk` so an
unsigned build cannot be mistaken for one you can install.

---

## Building on your own machine

Copy `android/keystore.properties.example` to `android/keystore.properties`
(never committed) and fill it in. `storeFile` is relative to `android/`; an
absolute path works too. Then:

```bash
npm ci
npm run check
npm version --no-git-tag-version 1.0.0   # matches the APK; leave it uncommitted
npm run sync
cd android && ./gradlew -PbookShelfVersion=1.0.0 assembleRelease
# app/build/outputs/apk/release/app-release.apk
```

Without a keystore the release build still runs, but the APK is unsigned and no
phone will install it.

---

## Version numbers

Both come from the tag; there is nothing in the source to bump.

- `versionName` is what a person reads, in Android's app info. A `v1.2.3` tag builds `1.2.3`.
- `versionCode` is what Android compares, and it must rise with every release.
  It is major × 10 000 + minor × 100 + patch, so `1.2.3` is `10203`, which keeps
  rising while minor and patch stay under 100.

Tags must be `vMAJOR.MINOR.PATCH`. Anything else, and any build without a tag,
builds as `0.0.0` with a warning. A local build without `-PbookShelfVersion` is `0.5.0`, the last version shipped by hand.
