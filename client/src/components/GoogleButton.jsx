import { useEffect, useRef } from 'react';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SRC = 'https://accounts.google.com/gsi/client';

const loadGis = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${SRC}"]`);
    const script = existing || Object.assign(document.createElement('script'), { src: SRC, async: true });
    script.addEventListener('load', resolve);
    script.addEventListener('error', reject);
    if (!existing) document.head.appendChild(script);
  });

// Renders Google's own button. Hidden entirely when no client ID is configured.
export default function GoogleButton({ onCredential, onError }) {
  const slot = useRef(null);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled || !slot.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: ({ credential }) => onCredential(credential),
        });
        window.google.accounts.id.renderButton(slot.current, {
          theme: 'outline',
          size: 'large',
          width: slot.current.offsetWidth,
          text: 'continue_with',
        });
      })
      .catch(() => onError?.('Could not load Google sign-in'));

    return () => { cancelled = true; };
  }, [onCredential, onError]);

  if (!CLIENT_ID) return null;

  return (
    <div>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div ref={slot} className="flex justify-center" />
    </div>
  );
}
