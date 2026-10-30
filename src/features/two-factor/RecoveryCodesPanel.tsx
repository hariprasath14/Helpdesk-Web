import { Copy, Download, Printer } from 'lucide-react';
import { Button } from '../../components/Button';
import { useToast } from '../../components/toast-context';
import { PRODUCT_NAME } from '../../product';

const TITLE = `${PRODUCT_NAME} recovery codes`;

function asText(codes: string[]): string {
  return [TITLE, '', 'Each code works once.', '', ...codes].join('\n');
}

/** The recovery codes, shown once, with ways to keep them: copy, download, print. */
export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const toast = useToast();

  const copy = () => {
    navigator.clipboard.writeText(asText(codes)).then(
      () => {
        toast({ tone: 'success', message: 'Recovery codes copied.' });
      },
      () => {
        toast({ tone: 'danger', message: 'Could not copy. Download or print them instead.' });
      },
    );
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([asText(codes)], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${PRODUCT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-recovery-codes.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    const page = window.open('', '_blank', 'width=480,height=640');
    if (!page) {
      toast({ tone: 'danger', message: 'Could not open the print window. Download them instead.' });
      return;
    }
    page.document.title = TITLE;
    const text = page.document.createElement('pre');
    text.style.font = '16px/1.8 monospace';
    text.textContent = asText(codes);
    page.document.body.append(text);
    page.print();
  };

  return (
    <div className="flex flex-col gap-3">
      <ul
        aria-label="Recovery codes"
        className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-border bg-surface-sunken p-4 font-mono text-sm text-ink"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" icon={<Copy aria-hidden />} onClick={copy}>
          Copy
        </Button>
        <Button variant="outline" size="sm" icon={<Download aria-hidden />} onClick={download}>
          Download
        </Button>
        <Button variant="outline" size="sm" icon={<Printer aria-hidden />} onClick={print}>
          Print
        </Button>
      </div>
    </div>
  );
}
