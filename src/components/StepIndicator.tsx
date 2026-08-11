interface StepIndicatorProps {
  currentStep: number;
  steps: { label: string; icon: string }[];
}

export default function StepIndicator({ currentStep, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between px-2 py-4">
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
                    ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-200'
                    : isActive
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200 scale-110'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                  }
                `}
              >
                {isCompleted ? '✓' : step.icon}
              </div>
              <span
                className={`
                  text-[11px] mt-1.5 font-medium text-center leading-tight
                  ${isActive ? 'text-indigo-700' : isCompleted ? 'text-emerald-600' : 'text-gray-400'}
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
                  ${stepNum < currentStep ? 'bg-emerald-400' : 'bg-gray-200'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
