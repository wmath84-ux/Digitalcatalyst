package app.eduvora.shop;

import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hard-rule orientation plugin:
 * - lockPortrait: Forces portrait everywhere except course player / sanctuary.
 * - lockLandscape: Forces landscape for the 3D Sanctuary even if auto-rotate
 *   is OFF (PUBG / BGMI style — SENSOR_LANDSCAPE).
 * - unlock: Allows FULL_SENSOR rotation ONLY inside the course player.
 *
 * This is used together with @capacitor/screen-orientation plugin.
 * The screen-orientation plugin's unlock() maps to UNSPECIFIED which respects
 * system auto-rotate setting. We want course player to rotate even if auto-rotate
 * is OFF (like YouTube), so we use FULL_SENSOR here.
 */
@CapacitorPlugin(name = "AppOrientation")
public class AppOrientationPlugin extends Plugin {

    /**
     * True on tablet-sized screens (Android's canonical sw600dp rule).
     * Tablets are never portrait-locked, so portrait requests are downgraded to
     * FULL_SENSOR for them (they keep rotating freely).
     */
    private boolean isTabletDevice() {
        try {
            return getContext().getResources().getConfiguration().smallestScreenWidthDp >= 600;
        } catch (Exception ignored) {
            return false;
        }
    }

    @PluginMethod
    public void lockPortrait(PluginCall call) {
        try {
            if (getActivity() != null) {
                // Never portrait-lock a tablet — let it keep following the sensor.
                if (isTabletDevice()) {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                } else {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                }
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void lockLandscape(PluginCall call) {
        try {
            if (getActivity() != null) {
                // SENSOR_LANDSCAPE: the activity OPENS already rotated, even
                // when the user has system auto-rotate OFF — same contract as
                // PUBG / BGMI. Either landscape direction is allowed.
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        try {
            if (getActivity() != null) {
                // FULL_SENSOR = allow rotation based on sensor even if auto-rotate OFF
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void lock(PluginCall call) {
        String orientation = call.getString("orientation", "portrait");
        try {
            if (getActivity() != null) {
                if ("portrait".equals(orientation)) {
                    // Tablets ignore portrait locks and keep rotating.
                    if (isTabletDevice()) {
                        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                    } else {
                        getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                    }
                } else if ("landscape".equals(orientation)) {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                } else {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                }
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void orientation(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("type", "portrait-primary");
        call.resolve(ret);
    }
}
