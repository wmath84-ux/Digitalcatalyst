import {
  resolveSubscribeCta,
  type SubscriptionSelectionState,
} from "../../../utils/subscriptionOwnership";

interface Props {
  totalPaise: number;
  loading: boolean;
  disabled?: boolean;
  onSubscribe: () => void;
  ownershipState?: SubscriptionSelectionState | null;
}

/** One checkout action. Ownership/renewal rules remain shared with the server. */
export default function SubscribeBar({
  totalPaise,
  loading,
  disabled,
  onSubscribe,
  ownershipState = null,
}: Props) {
  const cta = resolveSubscribeCta({
    state: ownershipState,
    loading,
    hasPlan: !disabled,
    freeSelection: totalPaise <= 0,
  });
  return (
    <div
      data-subscription-subscribe-bar
      data-subscription-owned={cta.owned ? "true" : "false"}
      className="dc-subscription-checkout-action"
    >
      <button
        type="button"
        data-subscription-cta
        className="dc-subscription-primary"
        onClick={onSubscribe}
        disabled={Boolean(loading || disabled || cta.disabled)}
        aria-busy={loading}
      >
        {loading ? "Opening checkout…" : cta.disabled ? cta.label : "Continue to checkout"}
      </button>
      {ownershipState?.blocked && ownershipState.reason ? (
        <p data-subscription-owned-note className="dc-subscription-note">
          {ownershipState.reason}
        </p>
      ) : null}
    </div>
  );
}
