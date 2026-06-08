import React from 'react';

type NavigateOptions = { replace?: boolean; state?: unknown };
type NavigateTo = string | number;

export const useNavigate = () => React.useCallback((to: NavigateTo, options: NavigateOptions = {}) => {
  if (typeof window === 'undefined') return;
  if (typeof to === 'number') {
    window.history.go(to);
    return;
  }
  const nextState = { ...(window.history.state || {}), routeState: options.state || null };
  if (options.replace) {
    window.history.replaceState(nextState, '', to);
    return;
  }
  window.history.pushState(nextState, '', to);
}, []);
