import type { ReactNode } from 'react';

/** A settings card: title and explanation on the left (on top on phones), the controls beside them. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const id = title.toLowerCase().replaceAll(' ', '-');
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 rounded-xl border border-border bg-surface p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-8"
    >
      <div>
        <h2 id={id} className="text-base font-bold">
          {title}
        </h2>
        <p className="mt-1 text-ink-muted">{description}</p>
      </div>
      <div>{children}</div>
    </section>
  );
}
