package app.eduvora.shop;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom orientation plugin for hard-rule portrait lock
        registerPlugin(AppOrientationPlugin.class);
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
}
