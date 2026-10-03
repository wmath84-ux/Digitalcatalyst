package app.eduvora.shop;

import android.app.Activity;
import android.view.View;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Fullscreen for the Android shell — the layer that finally makes the
 * Sanctuary's Fullscreen button work inside the APK.
 *
 * <p>Android WebView refuses to honour an HTML5 {@code requestFullscreen()} call
 * unless the host Activity implements
 * {@link android.webkit.WebChromeClient#onShowCustomView(android.view.View,
 * android.webkit.WebChromeClient.CustomViewCallback)}, and Capacitor's stock
 * {@code BridgeWebChromeClient} answers every request with an immediate
 * {@code callback.onCustomViewHidden()} — i.e. "this WebView does not support
 * fullscreen". The page therefore only ever saw a rejected promise and the
 * button looked dead on phones and tablets alike.</p>
 *
 * <p>This plugin hides/shows the system bars directly with
 * {@link WindowInsetsControllerCompat} (immersive sticky), which is the only
 * mechanism a WebView-hosted page can rely on:</p>
 *
 * <ul>
 *   <li>{@code enter()} — hide status + navigation bars, transient-by-swipe</li>
 *   <li>{@code exit()} — bring both bars back</li>
 *   <li>{@code isActive()} — the live app-level flag</li>
 * </ul>
 *
 * <p>The Activity re-asserts the flag whenever it regains focus or resumes
 * (see {@link MainActivity}), and also while a WebChromeClient custom view is
 * on screen ({@link FullscreenWebChromeClient}). The static flag is what keeps
 * the state honest across a rotation or an Activity recreation.</p>
 */
@CapacitorPlugin(name = "AppFullscreen")
public class AppFullscreenPlugin extends Plugin {

    /**
     * App-level immersive flag. Static on purpose: it has to survive an
     * Activity recreation (rotation, "don't keep activities") so the bars stay
     * hidden while the learner is still in the same screen.
     */
    private static boolean immersive = false;

    /**
     * True while a {@link FullscreenWebChromeClient} custom view (video /
     * element fullscreen from the page) is on screen. The bars must stay
     * hidden for that too, and the app-level flag alone cannot say so.
     */
    private static boolean customViewFullscreen = false;

    public static boolean isImmersiveActive() {
        return immersive || customViewFullscreen;
    }

    @PluginMethod
    public void enter(PluginCall call) {
        immersive = true;
        apply(getActivity(), true);
        JSObject result = new JSObject();
        result.put("active", true);
        call.resolve(result);
    }

    @PluginMethod
    public void exit(PluginCall call) {
        immersive = false;
        apply(getActivity(), false);
        JSObject result = new JSObject();
        result.put("active", false);
        call.resolve(result);
    }

    @PluginMethod
    public void isActive(PluginCall call) {
        JSObject result = new JSObject();
        result.put("active", immersive || customViewFullscreen);
        call.resolve(result);
    }

    /** Re-assert the current state (focus regain, resume, …). */
    static void reapply(Activity activity) {
        apply(activity, immersive || customViewFullscreen);
    }

    /**
     * A WebChromeClient custom view took / released the screen. The app-level
     * flag is left alone — leaving the video restores exactly what the learner
     * had before opening it.
     */
    static void setCustomViewActive(Activity activity, boolean active) {
        customViewFullscreen = active;
        apply(activity, immersive || customViewFullscreen);
    }

    private static void apply(Activity activity, boolean active) {
        if (activity == null) return;
        try {
            Window window = activity.getWindow();
            if (window == null) return;
            View decor = window.getDecorView();
            if (decor == null) return;
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, decor);
            if (controller == null) return;
            // Sticky immersive: a swipe reveals the bars for a moment, then they
            // slide away again — the PUBG / video-player behaviour.
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            if (active) {
                controller.hide(WindowInsetsCompat.Type.systemBars());
            } else {
                controller.show(WindowInsetsCompat.Type.systemBars());
            }
        } catch (Exception ignored) {
            // A device/theme that refuses the request must never crash the app.
        }
    }
}
