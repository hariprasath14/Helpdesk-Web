import { AuthLayout } from './AuthLayout';
import { PRODUCT_NAME } from '../../product';

/**
 * Placeholder Terms and Privacy pages until the legal text is ready (to be provided before launch).
 * Sign-up links here so the checkbox always points somewhere real.
 */
export function LegalPage({ title }: { title: 'Terms of Service' | 'Privacy Policy' }) {
  return (
    <AuthLayout title={title}>
      <p>
        The full {title} will be published here before {PRODUCT_NAME} launches.
      </p>
      <p className="mt-3 text-ink-muted">
        Until then, questions about how we handle your data can be sent to our support team.
      </p>
    </AuthLayout>
  );
}
