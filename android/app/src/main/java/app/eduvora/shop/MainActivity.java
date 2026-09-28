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
        // HARD RULE: Default to portrait for all screens except course player.
        // The JS layer (appOrientation.ts) will unlock to FULL_SENSOR when
        // the course player mounts and re-lock to portrait when it unmounts.
        // This ensures mobile users with auto-rotate ON still stay in portrait
        // everywhere else, and users with auto-rotate OFF never see rotation
        // outside the course player.
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } catch (Exception ignored) {}

        installFullscreenWebChromeClient();
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
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        } catch (Exception ignored) {}
    }

    /** Force landscape for the 3D Sanctuary — auto-rotate ON or OFF. */
    public void lockLandscapeForSanctuary() {
        try {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        } catch (Exception ignored) {}
    }
}
