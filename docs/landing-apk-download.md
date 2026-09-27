# Landing page Android APK download

The **Install APK** buttons in the landing hero and lower CTA download the raw,
release-signed APK from the public GitHub Release asset:

https://github.com/wmath84-ux/Digitalcatalyst/releases/download/android-apk/app-release.apk

`.github/workflows/android-build.yml` still builds a debug APK for PR checks and
uploads the AAB as an Actions artifact. After a successful build on **main**
(or a manual workflow run on main), it also builds and verifies a signed
`app-release.apk` and creates or updates the `android-apk` release asset. The
landing URL stays the same between builds and does not require a GitHub login
or expire like an Actions artifact. The workflow needs the existing
`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, and `KEY_PASSWORD` secrets,
plus permission to write repository contents. Builds without a valid signing
key must not overwrite the last published APK.

CI sets `ANDROID_VERSION_CODE` to the workflow run number for main releases so
newer APKs can replace older ones signed with the same keystore. Local builds
still default to version code 1. Android may ask users to allow installation
from their browser/download manager; the APK is for Android devices only.

**First activation:** the new release asset will become available after this
workflow change lands on main and its Android build succeeds. Until then the
URL returns 404. To check publication, open the URL above or run
`gh release view android-apk --json assets`.
