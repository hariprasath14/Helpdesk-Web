import { usePostApiV1AuthLogout } from '../../api/generated/auth/auth';
import { useToast } from '../../components/toast-context';
import { goTo } from '../../lib/go-to';

/**
 * Signs out on this device: ends the session on the server, then loads the login page afresh, so
 * nothing from the session (cached data, the CSRF token) stays in memory.
 */
export function useSignOut() {
  const toast = useToast();
  const logout = usePostApiV1AuthLogout({
    mutation: {
      onSuccess: () => {
        goTo('/login?reason=signed-out');
      },
      onError: () => {
        toast({
          tone: 'danger',
          message: 'Could not sign out. Check your connection and try again.',
        });
      },
    },
  });
  return () => {
    logout.mutate();
  };
}
