#!/usr/bin/env bash
# scripts/print-sha1.sh
#
# Prints every SHA-1 fingerprint that must be registered in Firebase for
# native Google Sign-In to work. Run it on the machine that holds your
# keystore(s), then paste the results into:
#
#   Firebase Console -> Project settings -> Your apps
#   -> Android app (app.eduvora.shop) -> Add fingerprint
#
# Usage:
#   bash scripts/print-sha1.sh                        # debug key only
#   bash scripts/print-sha1.sh path/to/release.jks    # debug + release key
#
# After adding them, RE-DOWNLOAD google-services.json and run:
#   npm run verify:google-signin

set -uo pipefail

grab() { grep -E "SHA1:" | head -1 | sed 's/.*SHA1: *//'; }

echo "=============================================="
echo " SHA-1 fingerprints for app.eduvora.shop"
echo "=============================================="
echo

# ── 1. Debug key — signs every `assembleDebug` / `cap run android` build ──
DEBUG_KS="${ANDROID_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
echo "1) DEBUG key  ($DEBUG_KS)"
if [ -f "$DEBUG_KS" ]; then
  FP=$(keytool -list -v -keystore "$DEBUG_KS" \
        -alias androiddebugkey -storepass android -keypass android 2>/dev/null | grab)
  if [ -n "$FP" ]; then echo "   $FP"; else echo "   (could not read - is keytool on PATH?)"; fi
else
  echo "   not found. It is created the first time you build a debug APK."
  echo "   If you only install release/Play builds, you can skip this one."
fi
echo

# ── 2. Release key — signs the AAB uploaded to Play ──────────────────────
RELEASE_KS="${1:-}"
echo "2) RELEASE key (your upload keystore)"
if [ -n "$RELEASE_KS" ] && [ -f "$RELEASE_KS" ]; then
  echo "   Reading $RELEASE_KS - you will be asked for the store password."
  FP=$(keytool -list -v -keystore "$RELEASE_KS" 2>/dev/null | grab)
  if [ -n "$FP" ]; then echo "   $FP"; else echo "   (wrong password, or no key in this store)"; fi
else
  echo "   Pass the path to run it, e.g."
  echo "     bash scripts/print-sha1.sh ~/keys/release.jks"
  echo
  echo "   This is the SAME keystore your KEYSTORE_BASE64 GitHub secret holds."
  echo "   To read it straight from the secret's contents:"
  echo "     echo \"<paste base64>\" | base64 --decode > /tmp/release.jks"
  echo "     bash scripts/print-sha1.sh /tmp/release.jks && rm /tmp/release.jks"
fi
echo

# ── 3. Play App Signing key — the one END USERS actually get ─────────────
cat <<'EOF'
3) PLAY APP SIGNING key  <-- the one most people forget
   If the app is distributed through Google Play, Google RE-SIGNS your
   upload with its own key, so the certificate on a user's phone is NOT
   your release key. Copy that SHA-1 from:

     Play Console -> your app -> Release -> Setup -> App signing
     -> "App signing key certificate" -> SHA-1 certificate fingerprint

   Without it, Google Sign-In works on a sideloaded APK and fails with
   ApiException: 10 for everyone who installed from the Play Store.

==============================================
 Next steps
==============================================
 1. Add EVERY fingerprint above in Firebase Console
    -> Project settings -> Your apps -> Android app (app.eduvora.shop)
 2. Re-download google-services.json (it must now contain
    "client_type": 1 entries) and replace the copy in this repo.
 3. Update the GOOGLE_SERVICES_JSON_BASE64 GitHub secret too:
      base64 -w0 google-services.json     # Linux
      base64 -i google-services.json      # macOS
 4. Verify:  npm run verify:google-signin
EOF
