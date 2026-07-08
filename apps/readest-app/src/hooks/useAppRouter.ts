import { useEnv } from '@/context/EnvContext';
import { useRouter } from 'next/navigation';
import { useTransitionRouter } from 'next-view-transitions';

export const useAppRouter = () => {
  const { appService } = useEnv();
  const transitionRouter = useTransitionRouter();
  const plainRouter = useRouter();

  // View Transitions API support varies by engine. WebKitGTK (Linux) crashes
  // on it, and even engines that ship startViewTransition may not support the
  // nested view-transition-group syntax the paginator's layered turns need.
  // Gate the transition router on the runtime capability flag instead of a
  // platform check so we fall back to a plain router whenever the API is
  // missing or known-broken (#4989 / READEST-9).
  return appService?.supportsViewTransitionsAPI ? transitionRouter : plainRouter;
};
