import { useApp } from "../context/AppContext";

interface MentionTextProps {
  text: string;
  className?: string;
  onMentionClick?: (username: string) => void;
  onTagClick?: (tag: string) => void;
}

export default function MentionText({ text, className, onMentionClick, onTagClick }: MentionTextProps) {
  const { state } = useApp();
  const parts = text.split(/(\@[a-zA-Z0-9_.]+|#[a-zA-Z0-9_]+)/g);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.startsWith("@")) {
          const uname = part.slice(1);
          const exists = Object.values(state.users).some((u) => u.username === uname);
          if (exists) {
            return (
              <span
                key={i}
                onClick={(e) => {
                  e.stopPropagation();
                  onMentionClick?.(uname);
                }}
                className="font-semibold text-sky-600 hover:underline cursor-pointer"
              >
                {part}
              </span>
            );
          }
        }
        if (part.startsWith("#")) {
          return (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                onTagClick?.(part.slice(1));
              }}
              className="font-semibold text-indigo-600 hover:underline cursor-pointer"
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
