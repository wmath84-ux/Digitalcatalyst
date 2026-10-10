import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/profile-glass.css";
import SubscriptionPage from "../../../src/subscription/App";
import AppShell from "../../../src/components/AppShell";
import CheckoutApp from "../../../src/components/checkout/CheckoutApp";
import { CheckoutProvider } from "../../../src/checkout/CheckoutContext";
import StudyLibraryPage from "../../../src/personal-library/StudyLibraryPage";
import { buildCheckoutSessionRecord, writeToSessionStorage } from "../../../utils/checkoutSession";
import { selectionForFixture } from "./api";
const params = new URLSearchParams(location.search);
const target = params.get("page") || "subscription";
history.replaceState(
  null,
  "",
  `${location.pathname}${location.search}${
    target === "checkout" ? "#/checkout" : target === "study" ? "#/study-library" : "#/subscription"
  }`
);
if (target === "checkout" && !params.has("empty"))
  writeToSessionStorage(
    buildCheckoutSessionRecord({
      selection: selectionForFixture(),
      buyer: {
        uid: "fixture",
        name: "Ananya Sharma",
        email: "a.very.long.learner.email.address.for.layout@example.test",
        mobile: "9876543210",
        tokenVerified: true,
        emailVerified: true,
      },
      returnRoute: { hash: "#/source" },
      quote: null,
    })
  );
const record = (value: string) => {
  document.querySelector("output")!.textContent = value;
};
// External Razorpay boundary: allow browser tests to drive its real callbacks.
class FixtureRazorpay {
  options: any;
  events: Record<string, (event: unknown) => void> = {};
  opened = false;
  constructor(options: any) {
    this.options = options;
    (window as any).fixtureRazorpay = this;
  }
  on(event: string, callback: (event: unknown) => void) {
    this.events[event] = callback;
  }
  open() {
    this.opened = true;
  }
  close() {
    this.opened = false;
    this.options.modal.ondismiss();
  }
}
(window as any).Razorpay = FixtureRazorpay;
function Fixture() {
  const [page, setPage] = useState(target);
  useEffect(() => {
    const handler = () => {
      record(location.hash);
      if (location.hash === "#/checkout") setPage("checkout");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const content =
    page === "study" ? (
      <StudyLibraryPage />
    ) : page === "checkout" ? (
      <CheckoutProvider>
        <CheckoutApp />
      </CheckoutProvider>
    ) : (
      <SubscriptionPage
        cartCount={1}
        purchasesBadge={2}
        onNavigateToCart={() => record("cart")}
        onNavigateToSubscription={() => record("subscription")}
        onNavigateToNotifications={() => record("notifications")}
        onNavigateFooter={(tab) => record(tab)}
      />
    );
  return (
    <>
      <output style={{ position: "fixed", bottom: 0, pointerEvents: "none", zIndex: 1000 }} />
      {params.has("shell") ? <AppShell>{content}</AppShell> : content}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
