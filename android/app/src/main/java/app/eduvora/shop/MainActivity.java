package app.eduvora.shop;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** The installed fullscreen client (null until onCreate wires it in). */
    private FullscreenWebChromeClient fullscreenClient;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom plugins for the hard orientation/rotation rules and
        // for immersive fullscreen (see AppFullscreenPlugin — the APK's
        // "Fullscreen" buttons used to be dead because Android WebView refuses
        // HTML5 fullscreen unless the host provides both halves of the
        // WebChromeClient custom-view contract).
        registerPlugin(AppOrientationPlugin.class);
        registerPlugin(AppFullscreenPlugin.class);
        super.onCreate(savedInstanceState);
        // HARD RULE (PHONES ONLY): Default to portrait for all screens except
        // the course player. The JS layer (appOrientation.ts) unlocks to
        // FULL_SENSOR when the course player mounts and re-locks to portrait
        // when it unmounts. This keeps phone users with auto-rotate ON in
        // portrait everywhere else, and users with auto-rotate OFF never see
        // rotation outside the course player.
        //
        // TABLETS ARE NEVER PORTRAIT-LOCKED. The old code force-locked EVERY
        // device to portrait here, which overrode the manifest's `fullSensor`
        // and left tablets pinned to portrait — they would not open rotated
        // even when physically held in landscape, and in Samsung DeX / Android
        // desktop mode the app was squeezed into a narrow portrait window so
        // the desktop side panel (which needs a wide/landscape viewport) never
        // appeared. `smallestScreenWidthDp >= 600` is Android's canonical
        // tablet (sw600dp) check: it is derived from the physical display, so
        // it stays correct inside a resizable DeX window. On tablets we use
        // FULL_SENSOR so the app follows the physical orientation even when the
        // system auto-rotate lock is ON (matching the user's expectation that a
        // tablet held in landscape opens in landscape).
        try {
            if (isTabletDevice()) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
            } else {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            }
        } catch (Exception ignored) {}

        installFullscreenWebChromeClient();
    }

    /**
     * True when this device is a tablet (or larger), using Android's canonical
     * sw600dp rule. `smallestScreenWidthDp` is the shortest dimension of the
     * available screen in density-independent pixels and is computed from the
     * physical display, so it does not shrink when the app runs in a small
     * Samsung DeX / freeform window. Phones report < 600; 7"+ tablets report
     * >= 600.
     */
    private boolean isTabletDevice() {
        try {
            return getResources().getConfiguration().smallestScreenWidthDp >= 600;
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * Swap in the fullscreen-capable WebChromeClient.
     *
     * Capacitor's stock client answers every {@code requestFullscreen()} with an
     * immediate "no", which is why the Sanctuary's Fullscreen button (and every
     * video fullscreen in the app) did nothing inside the APK. The subclass
     * keeps all other Capacitor behaviour and hosts the custom view properly.
     * Runs AFTER {@code super.onCreate()} because that is where the Bridge —
     * and therefore the WebView — is created.
     */
    private void installFullscreenWebChromeClient() {
        try {
            Bridge bridge = getBridge();
            if (bridge == null) return;
            WebView webView = bridge.getWebView();
            if (webView == null) return;
            FullscreenWebChromeClient client = new FullscreenWebChromeClient(bridge, this);
            webView.setWebChromeClient(client);
            fullscreenClient = client;
        } catch (Exception ignored) {
            // Any failure keeps Capacitor's stock client: the app still works,
            // only HTML5 fullscreen stays unavailable.
        }
    }

    /**
     * Back out of a fullscreen video / element before anything else.
     *
     * <p>Without this, the system back gesture while a lesson video is
     * fullscreen would leave the app instead of leaving fullscreen. The client
     * tells the WebView (see {@link FullscreenWebChromeClient#hideCustomView()}),
     * so the page's own state — and every Fullscreen label in the app — follows.</p>
     *
     * <p>{@code onBackPressed()} is the legacy entry point and still the one in
     * effect here: the manifest does not opt into
     * {@code android:enableOnBackInvokedCallback}.</p>
     */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        FullscreenWebChromeClient client = fullscreenClient;
        if (client != null && client.hideCustomView()) return;
        super.onBackPressed();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Coming back from the background, Android may have restored the system
        // bars; re-assert the app-level fullscreen flag.
        AppFullscreenPlugin.reapply(this);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // A notification shade pull or a permission dialog brings the bars
        // back even in sticky immersive mode — re-hide them on the way in.
        if (hasFocus) {
            AppFullscreenPlugin.reapply(this);
        }
    }

    /**
     * Called from the custom AppOrientation plugin (and fallback JS bridge)
     * to allow rotation inside the course player.
     * Uses FULL_SENSOR so rotation works even if system auto-rotate is OFF,
     * matching typical video-player behavior.
     */
    public void unlockOrientationForCoursePlayer() {
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
        } catch (Exception ignored) {}
    }

    public void lockPortraitForApp() {
        // Tablets are never portrait-locked (see onCreate): a re-lock request
        // from the JS layer (e.g. after leaving the course player) must leave a
        // tablet free to rotate, so we restore FULL_SENSOR instead of forcing
        // portrait on tablet-sized screens.
        try {
            if (isTabletDevice()) {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
            } else {
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            }
        } catch (Exception ignored) {}
    }

    /** Force landscape for the 3D Sanctuary — auto-rotate ON or OFF. */
    public void lockLandscapeForSanctuary() {
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } catch (Exception ignored) {}
    }
}
