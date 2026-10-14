// src/revision/components/RevisionGlassButton.tsx
//
// Revision's GlassButton. The shared glass surface hard-codes `text-white`,
// so on the light Revision theme the label and any icon on a glass button
// were white-on-white. Here the surface inherits the colour of the button
// instead: the theme text colour by default, or whatever colour a call site
// sets on the button itself (e.g. an accent colour). The shared component is
// left unchanged, so Home and the other apps keep their look.

import type { ComponentProps } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof GlassButton>;

export function RevisionGlassButton({ className, ...props }: Props) {
  return (
    <GlassButton
      {...props}
      className={cn("text-foreground [&>span>div]:[color:inherit]", className)}
    />
  );
}

export { RevisionGlassButton as GlassButton };
