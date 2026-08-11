import { Receipt } from "lucide-react";

interface Props {
  cycle: string;
  basePrice: number;
  coursesTotal: number;
  coursesCount: number;
  featuresTotal: number;
  featuresCount: number;
  couponDiscount: number;
  couponCode: string | null;
  referralDiscount: number;
  referralCode: string | null;
  total: number;
}

export default function PriceSummary({
  cycle,
  basePrice,
  coursesTotal,
  coursesCount,
  featuresTotal,
  featuresCount,
  couponDiscount,
  couponCode,
  referralDiscount,
  referralCode,
  total,
}: Props) {
  return (
    <div className="px-5 pt-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/50">
        <div className="mb-3 flex items-center gap-2">
          <Receipt className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-800">Order Summary</h3>
        </div>
        <div className="space-y-2 text-sm">
          {/* Base plan */}
          <div className="flex justify-between text-slate-500">
            <span>Base Plan ({cycle})</span>
            <span className="font-medium text-slate-700">
              ${basePrice.toFixed(2)}
            </span>
          </div>

          {/* Courses */}
          {coursesCount > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>
                Courses ({coursesCount})
              </span>
              <span className="font-medium text-slate-700">
                ${coursesTotal.toFixed(2)}
              </span>
            </div>
          )}

          {/* Features */}
          {featuresCount > 0 && (
            <div className="flex justify-between text-slate-500">
              <span>
                Features ({featuresCount})
              </span>
              <span className="font-medium text-slate-700">
                ${featuresTotal.toFixed(2)}
              </span>
            </div>
          )}

          {/* Subtotal line */}
          <div className="flex justify-between border-t border-dotted border-slate-200 pt-2 text-slate-600">
            <span className="font-medium">Subtotal</span>
            <span className="font-semibold text-slate-800">
              ${(basePrice + coursesTotal + featuresTotal).toFixed(2)}
            </span>
          </div>

          {/* Coupon */}
          {couponDiscount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Coupon ({couponCode})</span>
              <span className="font-medium">
                -${couponDiscount.toFixed(2)}
              </span>
            </div>
          )}

          {/* Referral */}
          {referralDiscount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Referral ({referralCode})</span>
              <span className="font-medium">
                -${referralDiscount.toFixed(2)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-dashed border-slate-200 pt-3">
          <span className="text-sm font-bold text-slate-900">
            Total due today
          </span>
          <span className="text-lg font-extrabold text-slate-900">
            ${total.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
