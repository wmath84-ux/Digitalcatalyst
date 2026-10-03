package app.eduvora.shop;

import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Orientation helpers shared by the app shell and the Course Player:
 * - lockPortrait: Keeps phones in portrait outside the Course Player; tablets
 *   remain free to rotate.
 * - unlock: Allows FULL_SENSOR rotation in the Course Player even when the
 *   system auto-rotate setting is off.
 *
 * This complements @capacitor/screen-orientation. Its unlock() can respect the
 * system auto-rotate setting; FULL_SENSOR preserves the Course Player's video
 * lesson behavior on phones with auto-rotate disabled.
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
    public void orientation(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("type", "portrait-primary");
        call.resolve(ret);
    }
}
