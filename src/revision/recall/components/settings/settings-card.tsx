export function SettingsCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface px-5 py-4 recall-dark:border-outline-variant recall-dark:bg-surface">
      <h3 className="text-sm font-bold text-text-primary recall-dark:text-text-primary mb-1">{title}</h3>
      {description && <p className="text-xs text-on-surface-variant recall-dark:text-on-surface-variant mb-3">{description}</p>}
      {children}
    </div>
  );
}
