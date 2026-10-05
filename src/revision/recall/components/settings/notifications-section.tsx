import { Bell, BellOff } from "lucide-react";
import { useTranslation } from "../../shims/i18n";
import { toast } from "../../shims/toast";
import { SettingsCard } from "./settings-card";
import { useRecallStore } from "../../stores/recall-store";
import { sendTestNotification } from "../../services/notifications";

export function NotificationsSection(): JSX.Element {
  const { t } = useTranslation();
  const settings = useRecallStore((state) => state.settings);
  const updateSettings = useRecallStore((state) => state.updateSettings);

  return (
    <SettingsCard title={t("settings.notifications")}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => void updateSettings({ notificationsEnabled: !settings.notificationsEnabled })}
          className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
            settings.notificationsEnabled
              ? "bg-surface-container text-text-primary recall-dark:bg-surface-container recall-dark:text-text-primary"
              : "text-on-surface-variant hover:bg-background recall-dark:hover:bg-surface-container/50"
          }`}
        >
          {settings.notificationsEnabled ? <><Bell className="h-4 w-4" /> {t("settings.enabled")}</> : <><BellOff className="h-4 w-4" /> {t("settings.disabled")}</>}
        </button>
        {settings.notificationsEnabled && (
          <button
            className="rounded-md px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-background recall-dark:hover:bg-surface-container/50"
            onClick={async () => {
              const ok = await sendTestNotification();
              if (ok) toast.success(t("settings.testNotificationSent"));
              else toast.error(t("settings.notificationsUnavailable"));
            }}
          >
            {t("settings.test")}
          </button>
        )}
      </div>
    </SettingsCard>
  );
}
