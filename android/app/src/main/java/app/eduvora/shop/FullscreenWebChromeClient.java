package app.eduvora.shop;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.widget.FrameLayout;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * The WebChromeClient that makes HTML5 fullscreen work inside the APK.
 *
 * <p>Android WebView only honours {@code element.requestFullscreen()} when the
 * host app overrides {@code onShowCustomView()} / {@code onHideCustomView()};
 * Capacitor's stock {@code BridgeWebChromeClient} implements the first one as
 * {@code callback.onCustomViewHidden()} — an immediate "no" — so EVERY element
 * fullscreen request in the app used to fail: the Sanctuary's Fullscreen row,
 * the Course Player's media "Fullscreen" action, and YouTube / <video>
 * fullscreen inside lesson iframes.</p>
 *
 * <p>This subclass keeps every other Capacitor behaviour (dialogs, permissions,
 * file chooser, geolocation) — it is the stock client plus a real custom-view
 * host:</p>
 *
 * <ul>
 *   <li>{@code onShowCustomView} — puts the WebView's fullscreen view in a
 *       black full-bleed container above the app, and hides the system bars.</li>
 *   <li>{@code onHideCustomView} — removes the container and restores the bars
 *       to whatever the app-level fullscreen flag says.</li>
 * </ul>
 */
public class FullscreenWebChromeClient extends BridgeWebChromeClient {

    private final Activity activity;
    private View customView;
    private FrameLayout container;
    private CustomViewCallback viewCallback;

    public FullscreenWebChromeClient(Bridge bridge, Activity activity) {
        super(bridge);
        this.activity = activity;
    }

    @Override
    public void onShowCustomView(View view, CustomViewCallback callback) {
        // A second request while one view is already showing can only be
        // answered with "no"; the current view stays.
        if (customView != null) {
            callback.onCustomViewHidden();
            return;
        }
        ViewGroup decor = decorView();
        if (decor == null || view == null) {
            callback.onCustomViewHidden();
            return;
        }

        customView = view;
        viewCallback = callback;

        container = new FrameLayout(activity);
        container.setBackgroundColor(Color.BLACK);
        container.addView(
            view,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        decor.addView(
            container,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        // Fullscreen video / element = no system bars while it plays.
        AppFullscreenPlugin.setCustomViewActive(activity, true);
    }

    @Override
    public void onHideCustomView() {
        // The page left fullscreen on its own (the user tapped Exit fullscreen
        // / document.exitFullscreen()): just tear the container down. The page
        // already knows, so the callback must NOT be fired back at it.
        removeCustomView();
    }

    /**
     * Leave fullscreen because the APP asked to (the system back gesture while a
     * video is fullscreen). Returns true when a custom view was showing, so the
     * Activity can swallow the back press instead of closing the app.
     *
     * <p>The callback IS fired here: it is how the WebView is told that the
     * custom view was hidden from outside the page, which makes it fire
     * {@code fullscreenchange} and clear {@code document.fullscreenElement} —
     * so the app's Fullscreen / Hide-status-bar labels stay honest.</p>
     */
    public boolean hideCustomView() {
        if (customView == null) return false;
        CustomViewCallback callback = viewCallback;
        removeCustomView();
        if (callback != null) {
            try {
                callback.onCustomViewHidden();
            } catch (Exception ignored) {
                // Already torn down by the page — nothing left to notify.
            }
        }
        return true;
    }

    /** True while a WebChromeClient custom view owns the screen. */
    public boolean hasCustomView() {
        return customView != null;
    }

    private void removeCustomView() {
        if (customView == null) {
            return;
        }
        ViewGroup decor = decorView();
        if (container != null) {
            container.removeView(customView);
            if (decor != null) {
                decor.removeView(container);
            }
            container = null;
        }
        customView = null;
        viewCallback = null;
        // The custom view is gone: fall back to whatever the APP-level
        // fullscreen flag says — the learner may already have had the immersive
        // bars on before opening the video.
        AppFullscreenPlugin.setCustomViewActive(activity, false);
    }

    private ViewGroup decorView() {
        if (activity == null || activity.getWindow() == null) return null;
        View decor = activity.getWindow().getDecorView();
        return decor instanceof ViewGroup ? (ViewGroup) decor : null;
    }
}
