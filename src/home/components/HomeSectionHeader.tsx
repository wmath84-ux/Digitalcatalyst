import type { ReactNode } from "react";

interface HomeSectionHeaderProps {
  title: string;
  id?: string;
  trailing?: ReactNode;
}

/** Consistent title/action alignment for the Home learning sections. */
export default function HomeSectionHeader({ title, id, trailing }: HomeSectionHeaderProps) {
  return (
    <div className="dc-home-section-heading">
      <h2 id={id} className="dc-scene-ink text-base font-bold text-white md:text-lg">{title}</h2>
      {trailing ? <div className="dc-home-section-trailing">{trailing}</div> : null}
    </div>
  );
}
