import { useEffect, useMemo, useState, type AnchorHTMLAttributes, type ReactNode } from "react";

export const toAdminHash = (href: string) => href.startsWith("#") ? href : `#${href}`;

export function AdminLink({ href, children, ...props }: { href: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return <a {...props} href={toAdminHash(href)}>{children}</a>;
}

const currentPath = () => {
  const value = window.location.hash.slice(1) || "/admin";
  return value.split("?")[0] || "/admin";
};

export function useAdminPathname() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => { const update = () => setPath(currentPath()); window.addEventListener("hashchange", update); return () => window.removeEventListener("hashchange", update); }, []);
  return path;
}

export function useAdminRouter() {
  return useMemo(() => ({
    push: (href: string) => { window.location.hash = toAdminHash(href); },
    replace: (href: string) => { window.location.replace(toAdminHash(href)); },
    back: () => window.history.back(),
  }), []);
}

export function useAdminSearchParams() {
  const path = useAdminPathname();
  const [, setVersion] = useState(0);
  useEffect(() => { const update = () => setVersion((value) => value + 1); window.addEventListener("hashchange", update); return () => window.removeEventListener("hashchange", update); }, []);
  return useMemo(() => new URLSearchParams(window.location.hash.split("?")[1] || ""), [path, window.location.hash]);
}
