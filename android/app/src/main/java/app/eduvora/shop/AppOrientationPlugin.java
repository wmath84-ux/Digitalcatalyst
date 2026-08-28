package app.eduvora.shop;

import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Hard-rule orientation plugin:
 * - lockPortrait: Forces portrait everywhere except course player (hard lock).
 * - unlock: Allows FULL_SENSOR rotation ONLY inside course player.
 *
 * This is used together with @capacitor/screen-orientation plugin.
 * The screen-orientation plugin's unlock() maps to UNSPECIFIED which respects
 * system auto-rotate setting. We want course player to rotate even if auto-rotate
 * is OFF (like YouTube), so we use FULL_SENSOR here.
 */
@CapacitorPlugin(name = "AppOrientation")
public class AppOrientationPlugin extends Plugin {

    @PluginMethod
    public void lockPortrait(PluginCall call) {
        try {
            if (getActivity() != null) {
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
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
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } else if ("landscape".equals(orientation)) {
                    getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
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
