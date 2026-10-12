/** Light-only appearance indicator; no dark-mode action is exposed. */
export function ThemeModeToggle({ className = "" }: { className?: string }) {
  return <span className={className} data-theme-mode="light">Light appearance</span>;
}
export default ThemeModeToggle;
