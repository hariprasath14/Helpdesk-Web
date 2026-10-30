import { Building2 } from 'lucide-react';
import { buttonClasses } from '../../components/button-styles';
import { StateMessage } from '../../components/StateMessage';
import { config } from '../../config';
import { mainOrigin } from '../../app/host';
import { AuthLayout } from '../auth/AuthLayout';

/** An address that is not an active workspace (mistyped, or never confirmed). */
export function WorkspaceNotFoundPage() {
  return (
    <AuthLayout title="Workspace not found">
      <StateMessage
        icon={Building2}
        tone="neutral"
        title="There's no workspace at this address"
        description="Check the address, or create a new workspace."
        actions={
          <a
            href={`${mainOrigin(config.appDomain, window.location)}/signup`}
            className={buttonClasses()}
          >
            Create a workspace
          </a>
        }
      />
    </AuthLayout>
  );
}
