import { useState } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { GlassButton } from "../../components/ui/glass-button";
import type { ShowcaseCard } from "../data/showcase";

const SWIPE_THRESHOLD = 90;
const VELOCITY_THRESHOLD = 400;

function getPositionStyle(pos: number) {
  return {
    scale: 1 - pos * 0.06,
    y: pos * 16,
    zIndex: 10 - pos,
    opacity: pos >= 3 ? 0 : 1,
  };
}

interface TopCardProps {
  card: ShowcaseCard;
  onSwipe: (direction: "left" | "right") => void;
  activeIndex: number;
  total: number;
}

function TopCard({ card, onSwipe, activeIndex, total }: TopCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-14, 0, 14]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const nopeOpacity = useTransform(x, [-120, -20], [1, 0]);

  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > VELOCITY_THRESHOLD) {
      onSwipe("right");
    } else if (
      info.offset.x < -SWIPE_THRESHOLD ||
      info.velocity.x < -VELOCITY_THRESHOLD
    ) {
      onSwipe("left");
    }
  };

  return (
    <motion.div
      className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      style={{ x, rotate, zIndex: 20 }}
      drag="x"
      dragElastic={0.7}
      dragConstraints={{ left: 0, right: 0 }}
      whileTap={{ scale: 1.02 }}
      onDragEnd={handleDragEnd}
      exit={{ opacity: 0 }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[28px] shadow-2xl shadow-black/40 ring-1 ring-white/10">
        <img
          src={card.image}
          alt={card.title}
          className="h-full w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/20" />

        <motion.div
          style={{ opacity: likeOpacity }}
          className="absolute right-5 top-6 rotate-6 rounded-lg border-2 border-emerald-400 px-3 py-1 text-sm font-extrabold uppercase tracking-widest text-emerald-400"
        >
          Yes!
        </motion.div>
        <motion.div
          style={{ opacity: nopeOpacity }}
          className="absolute left-5 top-6 -rotate-6 rounded-lg border-2 border-rose-400 px-3 py-1 text-sm font-extrabold uppercase tracking-widest text-rose-400"
        >
          Skip
        </motion.div>

        <div className="absolute inset-x-0 bottom-0 p-5">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--dc-chrome-glass)] px-3 py-1 [backdrop-filter:var(--dc-chrome-glass-blur)]">
            <Sparkles className="h-3 w-3 text-amber-300" />
            <span className="text-[11px] font-bold tracking-wider text-white">
              {card.eyebrow}
            </span>
          </div>
          <h3 className="text-2xl font-extrabold leading-tight text-white drop-shadow-sm">
            {card.title}
          </h3>
          <p className="mt-1 text-sm leading-snug text-white/80">
            {card.subtitle}
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex ? "w-6 bg-white" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function StackedCards({ cards }: { cards: ShowcaseCard[] }) {
  const [deck, setDeck] = useState(cards);
  const [exitDirection, setExitDirection] = useState<"left" | "right">("right");
  const [activeIndex, setActiveIndex] = useState(0);

  const rotate = (direction: "left" | "right") => {
    setExitDirection(direction);
    setDeck((prev) => [...prev.slice(1), prev[0]]);
    setActiveIndex((prev) => (prev + 1) % cards.length);
  };

  const visible = deck.slice(0, 3);

  return (
    <div className="overflow-x-clip px-5 pt-5">
      <div className="relative h-[300px] w-full">
        <AnimatePresence initial={false} custom={exitDirection}>
          {visible.map((card, pos) => {
            const style = getPositionStyle(pos);
            if (pos === 0) {
              return (
                <motion.div
                  key={card.id}
                  className="absolute inset-0"
                  initial={getPositionStyle(3)}
                  animate={style}
                  exit={{
                    x: exitDirection === "right" ? 420 : -420,
                    rotate: exitDirection === "right" ? 25 : -25,
                    opacity: 0,
                    transition: { duration: 0.32, ease: "easeIn" },
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 24 }}
                >
                  <TopCard
                    card={card}
                    onSwipe={rotate}
                    activeIndex={activeIndex}
                    total={cards.length}
                  />
                </motion.div>
              );
            }
            return (
              <motion.div
                key={card.id}
                className="absolute inset-0"
                initial={getPositionStyle(3)}
                animate={style}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 260, damping: 24 }}
              >
                <div className="h-full w-full overflow-hidden rounded-[28px] shadow-xl shadow-black/30 ring-1 ring-white/10">
                  <img
                    src={card.image}
                    alt=""
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute inset-0 bg-black/30" />
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <GlassButton
          onClick={() => rotate("left")}
          aria-label="Previous card"
          className="[&_.size-12]:size-11"
        >
          <ChevronLeft className="h-5 w-5" />
        </GlassButton>
        <span className="text-xs font-medium text-white/55">
          Swipe the cards to explore
        </span>
        <GlassButton
          onClick={() => rotate("right")}
          aria-label="Next card"
          className="[&_.size-12]:size-11"
        >
          <ChevronRight className="h-5 w-5" />
        </GlassButton>
      </div>
    </div>
  );
}
