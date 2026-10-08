import { useState, type FormEvent } from "react";
import { ArrowRight, MessageSquare, Send } from "lucide-react";
import { GlassCard } from "../../components/ui/GlassCard";
import Modal from "../../components/ui/Modal";
import { createUserQuery } from "../../utils/userQueries";

const MAX_FEEDBACK_LENGTH = 500;

interface FeedbackSectionProps {
  canSubmit: boolean;
  onSignIn: () => void;
}

export default function FeedbackSection({ canSubmit, onSignIn }: FeedbackSectionProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const openComposer = () => {
    setError("");
    setSent(false);
    setOpen(true);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError("");
    try {
      await createUserQuery(trimmed.slice(0, MAX_FEEDBACK_LENGTH));
      setMessage("");
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We couldn’t send your feedback. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <section className="dc-home-section dc-home-feedback-section" aria-labelledby="home-feedback-title">
        <GlassCard
          tint={0.25}
          blur={0}
          radius={20}
          contentClassName="p-4 sm:p-5"
          className="dc-scene-plate dc-home-card dc-home-feedback-card"
        >
          <div className="dc-home-feedback-content">
            <span className="dc-home-feedback-icon" aria-hidden="true"><MessageSquare size={19} /></span>
            <div className="dc-home-feedback-copy">
              <h2 id="home-feedback-title">Have something to share?</h2>
              <p>Help us improve your learning experience.</p>
            </div>
            <button type="button" onClick={openComposer} className="dc-home-feedback-button">
              Share Feedback <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </GlassCard>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Share feedback" maxWidth="max-w-lg">
        {sent ? (
          <div className="dc-home-feedback-success" role="status">
            <span className="dc-home-feedback-success-icon" aria-hidden="true">✓</span>
            <h3>Thank you for sharing.</h3>
            <p>Your feedback helps us make learning better.</p>
            <button type="button" className="dc-home-feedback-submit" onClick={() => setOpen(false)}>Done</button>
          </div>
        ) : canSubmit ? (
          <form className="dc-home-feedback-form" onSubmit={submit}>
            <p>Tell us what’s working well or what we could improve.</p>
            <label className="sr-only" htmlFor="home-feedback-message">Your feedback</label>
            <textarea
              id="home-feedback-message"
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, MAX_FEEDBACK_LENGTH))}
              maxLength={MAX_FEEDBACK_LENGTH}
              rows={5}
              placeholder="Write your feedback…"
              autoFocus
              required
            />
            <div className="dc-home-feedback-form-footer">
              <span className="dc-home-feedback-count" aria-live="polite">{message.length}/{MAX_FEEDBACK_LENGTH}</span>
              <button type="submit" disabled={!message.trim() || sending} className="dc-home-feedback-submit">
                <Send size={15} aria-hidden="true" /> {sending ? "Sending…" : "Send feedback"}
              </button>
            </div>
            {error ? <p className="dc-home-feedback-error" role="alert">{error}</p> : null}
          </form>
        ) : (
          <div className="dc-home-feedback-signin">
            <p>Sign in to send a note to the learning team.</p>
            <button type="button" className="dc-home-feedback-submit" onClick={onSignIn}>Sign in to continue</button>
          </div>
        )}
      </Modal>
    </>
  );
}
