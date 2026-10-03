package app.eduvora.shop;

import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
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
 * Native plugin to manage system status bar styling and keep it strictly
 * synchronized with system light/dark theme.
 */
@CapacitorPlugin(name = "AppStatusBar")
public class AppStatusBarPlugin extends Plugin {

    @PluginMethod
    public void setTheme(PluginCall call) {
        String theme = call.getString("theme", "auto");
        String colorStr = call.getString("color");
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                boolean isNight;
                if ("dark".equalsIgnoreCase(theme)) {
                    isNight = true;
                } else if ("light".equalsIgnoreCase(theme)) {
                    isNight = false;
                } else {
                    int nightModeFlags = activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
                    isNight = (nightModeFlags == Configuration.UI_MODE_NIGHT_YES);
                }

                int color;
                if (colorStr != null && !colorStr.trim().isEmpty()) {
                    color = Color.parseColor(colorStr.trim());
                } else {
                    color = isNight ? 0xFF000000 : 0xFFFFFFFF;
                }

                boolean darkIcons = !isNight;
                applyStatusBar(activity, color, darkIcons);

                JSObject res = new JSObject();
                res.put("theme", isNight ? "dark" : "light");
                res.put("color", isNight ? "#000000" : "#ffffff");
                res.put("darkIcons", darkIcons);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Failed to set theme: " + e.getMessage());
            }
        });
    }

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
                boolean darkIcons;
                if (darkIconsParam != null) {
                    darkIcons = darkIconsParam;
                } else {
                    // Dark background -> light icons (darkIcons=false); light background -> dark icons (darkIcons=true)
                    double luminance = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
                    darkIcons = luminance > 0.5;
                }

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

        int nightModeFlags = activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        boolean isNight = (nightModeFlags == Configuration.UI_MODE_NIGHT_YES);

        JSObject res = new JSObject();
        res.put("theme", isNight ? "dark" : "light");
        res.put("color", isNight ? "#000000" : "#ffffff");
        res.put("darkIcons", !isNight);
        call.resolve(res);
    }

    @PluginMethod
    public void syncWithSystem(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity unavailable");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                int nightModeFlags = activity.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
                boolean isNight = (nightModeFlags == Configuration.UI_MODE_NIGHT_YES);
                int color = isNight ? 0xFF000000 : 0xFFFFFFFF;
                boolean darkIcons = !isNight;
                applyStatusBar(activity, color, darkIcons);

                JSObject res = new JSObject();
                res.put("theme", isNight ? "dark" : "light");
                res.put("color", isNight ? "#000000" : "#ffffff");
                res.put("darkIcons", darkIcons);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Sync failed: " + e.getMessage());
            }
        });
    }

    public static void applyStatusBar(Activity activity, int color, boolean darkIcons) {
        if (activity == null) return;
        if (AppFullscreenPlugin.isImmersiveActive()) {
            return;
        }
        try {
            Window window = activity.getWindow();
            if (window == null) return;
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(color);

            View decorView = window.getDecorView();
            if (decorView != null) {
                WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, decorView);
                if (insetsController != null) {
                    insetsController.setAppearanceLightStatusBars(darkIcons);
                }
            }
        } catch (Exception ignored) {}
    }
}
