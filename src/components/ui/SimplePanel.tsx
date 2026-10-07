import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import "./simple-panel.css";

/** The Profile layout's quiet frame: one border, no glass engine/layers.
 * contentClassName keeps existing layout wrappers without changing behaviour. */
export function SimplePanel({ className, contentClassName, children, ...props }: ComponentProps<"div"> & { contentClassName?: string }) {
  return <div {...props} className={cn("dc-simple-panel", className)}>
    <div className={cn("min-w-0", contentClassName)}>{children}</div>
  </div>;
}
