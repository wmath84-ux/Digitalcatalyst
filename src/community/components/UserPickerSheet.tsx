import { useMemo, useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENT_USER_ID } from "../data/seed";
import Avatar from "./Avatar";

interface UserPickerSheetProps {
  onSelect: (userId: string) => void;
  onClose: () => void;
  title?: string;
}

export default function UserPickerSheet({ onSelect, onClose, title = "Select User" }: UserPickerSheetProps) {
  const { state } = useApp();
  const [query, setQuery] = useState("");

  const users = useMemo(() => {
    const q = query.toLowerCase().trim();
    return Object.values(state.users)
      .filter((u) => u.id !== CURRENT_USER_ID)
      .filter((u) => !q || u.username.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q));
  }, [state.users, query]);

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex max-h-[75%] min-h-[50%] flex-col rounded-t-3xl bg-white shadow-2xl animate-[slideUp_0.25s_ease-out]">
        <div className="flex items-center justify-center pt-2.5">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 text-lg leading-none">✕</button>
        </div>

        <div className="px-4 py-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search users..."
            className="w-full rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-300"
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {users.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No users found</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => onSelect(u.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 hover:bg-slate-50 transition"
                >
                  <Avatar user={u} size="md" />
                  <div className="text-left">
                    <p className="text-[13.5px] font-semibold text-slate-900">
                      {u.displayName} {u.verified && <span className="text-xs">✅</span>}
                    </p>
                    <p className="text-[12px] text-slate-400">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
