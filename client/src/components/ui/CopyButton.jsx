import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

export default function CopyButton({ value, label = 'Copy link', toastMessage = 'Link copied' }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard is blocked outside a secure context — fall back to a prompt.
      window.prompt('Copy this link', value);
      return;
    }
    setCopied(true);
    toast.success(toastMessage);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-emerald-700 hover:underline"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
