import type { ChatMessage } from "../types";
import { SparkleIcon } from "./icons";
import { cn } from "../utils/cn";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={cn(
        "flex w-full gap-2.5 animate-fade-in-up",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {!isUser && (
        <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <SparkleIcon width={13} height={13} className="text-white" />
        </div>
      )}
      <div className={cn("flex flex-col max-w-[78%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-4 py-2.5 text-[14.5px] leading-relaxed whitespace-pre-wrap break-words shadow-sm",
            isUser
              ? "bg-gradient-to-br from-indigo-500 to-blue-500 text-white rounded-2xl rounded-br-md"
              : "bg-zinc-100 dark:bg-white/[0.07] text-zinc-800 dark:text-zinc-100 rounded-2xl rounded-bl-md"
          )}
        >
          {message.content}
        </div>
        <span className="text-[10.5px] text-zinc-400 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
}
