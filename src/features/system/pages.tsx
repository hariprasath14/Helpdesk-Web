import { CircleAlert, Compass } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { buttonClasses } from '../../components/button-styles';
import { StateMessage } from '../../components/StateMessage';

const homeLink = (
  <Link to="/" className={buttonClasses('outline')}>
    Go to the home page
  </Link>
);

export function NotFoundPage() {
  return (
    <StateMessage
      tone="neutral"
      icon={Compass}
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      actions={homeLink}
    />
  );
}

/**
 * Shown when a page crashes, instead of a blank screen. It sits outside the app shell (the shell
 * itself may be what failed) and never shows the error.
 */
export function RouteErrorPage() {
  const error = useRouteError();
  const content =
    isRouteErrorResponse(error) && error.status === 404 ? (
      <NotFoundPage />
    ) : (
      <StateMessage
        role="alert"
        tone="danger"
        icon={CircleAlert}
        title="Something went wrong"
        description="This page could not be shown. Reload to try again."
        actions={homeLink}
      />
    );
  return <main className="mx-auto max-w-2xl px-4 py-16">{content}</main>;
}
