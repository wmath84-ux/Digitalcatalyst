import { Check, X } from "lucide-react";

// P1-2: Alag card design — below existing Summary Card, not replacing it.
// Sab kuch exactly vahi color from mobile_pricing_page.html
// Glass: rgba(255,255,255,0.1) blur16 radius28 border rgba(255,255,255,0.3)
// Badge: rgba(255,255,255,0.2) blur12, etc. — copied verbatim.

export default function PricingGlassCard() {
  return (
    <div
      className="relative mt-4"
      style={{
        background: "rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: 28,
        border: "1px solid rgba(255, 255, 255, 0.3)",
        padding: "28px 24px",
        boxShadow: "0 4px 24px -1px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255,255,255,0.4)",
      }}
      data-pricing-glass-card
    >
      {/* Badge 15% off — exact mobile_pricing_page.html .card-badge */}
      <div
        style={{
          background: "rgba(255, 255, 255, 0.2)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.4)",
          borderTop: "none",
          borderRight: "none",
          borderBottomLeftRadius: 20,
          borderTopRightRadius: 26,
          padding: "8px 16px",
          position: "absolute",
          top: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          fontWeight: 500,
          color: "white",
          zIndex: 10,
        }}
      >
        15% off
        <div style={{ width: 6, height: 6, borderRadius: 9999, background: "white", marginLeft: 4 }} />
      </div>

      <div className="relative z-10 flex flex-col">
        <h2 className="mb-6 text-2xl font-medium text-white/90">Talent Pro</h2>

        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-4xl font-light text-white/50 line-through decoration-1">₹29</span>
          <span className="text-6xl font-bold tracking-tighter text-white">₹19</span>
          <div className="ml-1 flex flex-col text-sm">
            <span className="font-medium text-white">/ month (INR)</span>
            <span className="mt-1 text-xs text-white/70">₹228 billed yearly</span>
          </div>
        </div>

        <p className="mb-6 pr-8 text-sm font-light leading-relaxed text-white/80">
          A comprehensive solution for growing teams, offering enhanced features to streamline HR processes
        </p>

        <div
          style={{
            borderTop: "1.5px dashed rgba(255, 255, 255, 0.25)",
            margin: "24px 0",
            width: "100%",
          }}
        />

        <ul className="mb-8 flex-grow space-y-4">
          {[
            "Access to core HR features",
            "Employee record management",
            "Basic reporting tools",
            "Manage up to 10 team members",
            "Track employee attendance",
            "Assign and monitor tasks",
          ].map((label) => (
            <li key={label} className="flex items-start gap-4">
              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <Check style={{ color: "rgba(255, 255, 255, 0.9)" }} size={10} strokeWidth={3} />
              </div>
              <span className="pt-0.5 text-[15px] font-light leading-snug text-white/95">{label}</span>
            </li>
          ))}

          {["Email support", "Simple onboarding process", "Designed user-focused interfaces"].map((label) => (
            <li key={label} className="flex items-start gap-4 pt-0">
              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.15)",
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <X style={{ color: "rgba(255, 255, 255, 0.4)" }} size={10} strokeWidth={3} />
              </div>
              <span className="pt-0.5 text-[15px] font-light leading-snug text-white/50">{label}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          style={{
            width: "100%",
            background: "rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.4)",
            color: "white",
            padding: "16px 0",
            borderRadius: 20,
            fontSize: 18,
            fontWeight: 500,
          }}
          className="transition-all duration-300 hover:bg-white/30"
        >
          Subscribe
        </button>
      </div>
    </div>
  );
}
