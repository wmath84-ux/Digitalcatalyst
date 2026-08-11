export type BillingCycle = "monthly" | "yearly";

export interface PromoState {
  input: string;
  appliedCode: string | null;
  status: "idle" | "success" | "error";
  message: string;
}
