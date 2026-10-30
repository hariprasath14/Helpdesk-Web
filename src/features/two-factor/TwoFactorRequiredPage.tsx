import type { Me } from '../../api/generated/model';
import { AuthLayout } from '../auth/AuthLayout';
import { useSignOut } from '../auth/use-sign-out';
import { TwoFactorSetup } from './TwoFactorSetup';

/**
 * Shown instead of the app when the workspace requires two-step verification and this person has
 * not set it up. There is no way past it except setting it up, or signing out.
 */
export function TwoFactorRequiredPage({ me }: { me: Me }) {
  const signOut = useSignOut();
  return (
    <AuthLayout
      wide
      title="Set up two-step verification"
      subtitle={`${me.workspace.name} requires it for everyone. It takes about a minute.`}
    >
      {/* Done refreshes the session's status, and the app opens. */}
      <TwoFactorSetup onDone={() => undefined} />
      <p className="mt-6 border-t border-border pt-4 text-xs text-ink-muted">
        Signed in as {me.user.email}.{' '}
        <button
          type="button"
          onClick={signOut}
          className="font-medium text-brand-link hover:underline"
        >
          Sign out
        </button>
      </p>
    </AuthLayout>
  );
}
