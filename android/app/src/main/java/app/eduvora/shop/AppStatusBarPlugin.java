package app.eduvora.shop;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native system-bar control for the Eduvora shell.
 *
 * <p>The web layer is the only writer of the bar colours: {@code setSystemBars}
 * is called by {@code src/utils/systemBars.ts} with the colours sampled from the
 * page on screen, plus the icon appearance for each bar. The last state is kept
 * here so that a resume or a configuration change re-applies what the page last
 * asked for, instead of overwriting it with a system-theme default.
 *
 * <p>Android 15+ (targetSdk 35) forces edge-to-edge: the window bar colours are
 * ignored there, and the bar area shows the WebView's own top/bottom background,
 * which is the same colour the web layer samples. Icon appearance is honoured on
 * every API level that has the flag (AndroidX compat handles the older ones).
 */
@CapacitorPlugin(name = "AppStatusBar")
public class AppStatusBarPlugin extends Plugin {

    /** Last state the web layer (or the system-theme default) asked for. */
    private static boolean hasState = false;
    private static int statusColorState = 0xFFFFFFFF;
    private static boolean statusDarkIconsState = true;
    private static int navigationColorState = 0xFFFFFFFF;
    private static boolean navigationDarkIconsState = true;

    /**
     * Sets both bars in one call, so the status and navigation bars never show
     * a half-updated pair. Options: {@code status}, {@code navigation} as
     * {@code #rrggbb}; {@code statusDarkIcons}, {@code navigationDarkIcons}.
     */
    @PluginMethod
    public void setSystemBars(PluginCall call) {
        String statusStr = call.getString("status");
        String navigationStr = call.getString("navigation");
        Boolean statusDark = call.getBoolean("statusDarkIcons");
        Boolean navigationDark = call.getBoolean("navigationDarkIcons");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }
        if (statusStr == null || navigationStr == null) {
            call.reject("status and navigation colours are required");
            return;
        }
        final int statusColor;
        final int navigationColor;
        try {
            statusColor = Color.parseColor(statusStr.trim());
            navigationColor = Color.parseColor(navigationStr.trim());
        } catch (IllegalArgumentException e) {
            call.reject("Invalid colour: " + e.getMessage());
            return;
        }
        final boolean statusDarkIcons = statusDark != null ? statusDark : isLight(statusColor);
        final boolean navigationDarkIcons = navigationDark != null ? navigationDark : isLight(navigationColor);

        activity.runOnUiThread(() -> {
            try {
                applySystemBars(activity, statusColor, statusDarkIcons, navigationColor, navigationDarkIcons);
                JSObject res = new JSObject();
                res.put("status", statusStr);
                res.put("navigation", navigationStr);
                res.put("statusDarkIcons", statusDarkIcons);
                res.put("navigationDarkIcons", navigationDarkIcons);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Failed to set system bars: " + e.getMessage());
            }
        });
    }

    /** Legacy: colour of the status bar only. Kept for older web bundles. */
    @PluginMethod
    public void setColor(PluginCall call) {
        String colorStr = call.getString("color");
        Boolean darkIconsParam = call.getBoolean("darkIcons");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }
        if (colorStr == null || colorStr.trim().isEmpty()) {
            call.reject("Color is required");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                int color = Color.parseColor(colorStr.trim());
                boolean darkIcons = darkIconsParam != null ? darkIconsParam : isLight(color);
                applyStatusBar(activity, color, darkIcons);
                JSObject res = new JSObject();
                res.put("color", colorStr);
                res.put("darkIcons", darkIcons);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Invalid color: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getTheme(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }
        boolean isNight = isSystemNight(activity);
        JSObject res = new JSObject();
        res.put("theme", isNight ? "dark" : "light");
        res.put("color", isNight ? "#000000" : "#ffffff");
        res.put("darkIcons", !isNight);
        call.resolve(res);
    }

    // ── Shared, static helpers (used by MainActivity too) ─────────────────

    /** Light colour (luminance above the midpoint) → the icons must be dark. */
    static boolean isLight(int color) {
        double luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
        return luminance > 0.5;
    }

    static boolean isSystemNight(Activity activity) {
        int nightModeFlags = activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return nightModeFlags == Configuration.UI_MODE_NIGHT_YES;
    }

    /** Status bar only (legacy path). The navigation bar keeps its last state. */
    public static void applyStatusBar(Activity activity, int color, boolean darkIcons) {
        applySystemBars(activity, color, darkIcons, navigationColorState, navigationDarkIconsState);
    }

    /**
     * Apply both bars and remember them. While the app-level immersive mode is on
     * the bars belong to it; the state is kept and re-applied when it ends.
     */
    public static void applySystemBars(Activity activity, int statusColor, boolean statusDarkIcons,
                                       int navigationColor, boolean navigationDarkIcons) {
        if (activity == null) return;
        statusColorState = statusColor;
        statusDarkIconsState = statusDarkIcons;
        navigationColorState = navigationColor;
        navigationDarkIconsState = navigationDarkIcons;
        hasState = true;
        if (AppFullscreenPlugin.isImmersiveActive()) return;
        try {
            Window window = activity.getWindow();
            if (window == null) return;
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(statusColor);
            window.setNavigationBarColor(navigationColor);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Without this the system adds a translucent scrim and the colour
                // the page asked for is not the colour the learner sees.
                window.setStatusBarContrastEnforced(false);
                window.setNavigationBarContrastEnforced(false);
            }
            View decorView = window.getDecorView();
            if (decorView != null) {
                WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, decorView);
                if (insetsController != null) {
                    insetsController.setAppearanceLightStatusBars(statusDarkIcons);
                    insetsController.setAppearanceLightNavigationBars(navigationDarkIcons);
                }
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Re-apply the last requested state (resume, rotation, dark/light switch while
     * the page has not yet reported). Before any page has reported, fall back to
     * the system theme so the first frame is never a surprise.
     */
    public static void reapplyLast(Activity activity) {
        if (activity == null) return;
        if (hasState) {
            applySystemBars(activity, statusColorState, statusDarkIconsState, navigationColorState, navigationDarkIconsState);
            return;
        }
        boolean isNight = isSystemNight(activity);
        int color = isNight ? 0xFF000000 : 0xFFFFFFFF;
        applySystemBars(activity, color, !isNight, color, !isNight);
        hasState = false;
    }
}
