interface StepIndicatorProps {
  currentStep: number;
  steps: { label: string; icon: string }[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  // Goal-gradient effect: a single continuous rail above the circles shows how
  // much of the checkout is already behind the user. Discrete circles alone
  // read as "three unrelated screens"; a filling rail reads as momentum, which
  // is what keeps people finishing a flow.
  const progress = steps.length > 1
    ? Math.min(100, Math.max(0, ((currentStep - 1) / (steps.length - 1)) * 100))
    : 100;

  return (
    <div className="px-2 py-3" data-step-indicator>
      <div className="mb-3 flex items-center gap-2">
        <div className="dc-goal-rail flex-1" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={currentStep} aria-label="Checkout progress">
          <div className="dc-goal-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-wide dc-ink-3">
          Step {currentStep} of {steps.length}
        </span>
      </div>
      <div className="flex items-center justify-between">
      {steps.map((step, index) => {
        const stepNum = index + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <div key={index} className="flex flex-1 items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center flex-1">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold
                  transition-all duration-300 border-2
                  ${isCompleted
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : isActive
                      ? 'bg-indigo-600 border-indigo-600 text-white scale-110 shadow-[var(--dc-elev-accent)]'
                      : 'border-white/20 dc-ink-3'
                  }
                `}
              >
                {isCompleted ? '✓' : step.icon}
              </div>
              <span
                className={`
                  text-[11px] mt-1.5 font-medium text-center leading-tight
                  ${isActive ? 'text-indigo-200' : isCompleted ? 'text-emerald-300' : 'dc-ink-3'}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`
                  h-0.5 flex-1 mx-1 -mt-5 rounded-full transition-all duration-500
                  ${stepNum < currentStep ? 'bg-emerald-400' : 'bg-white/15'}
                `}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
