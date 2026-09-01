/**
 * `[digitalcatalyst]` shim for the shadcn registry convention.
 *
 * The vendored website-glass files import `cn` from `@/lib/utils` (that is the
 * path the shadcn CLI writes into `components.json`), while this repo's helper
 * has always lived at `@/utils/cn`. Rather than edit every vendored file — and
 * so keep `npx shadcn add` re-runnable — we re-export from the canonical path.
 *
 * Any future shadcn-installed primitive resolves here too.
 */
export { cn } from "@/utils/cn";
