import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, ScanLine, AlertCircle } from 'lucide-react';
import { scanReceipt, getReceipt, listReceipts } from '../api/receipts.js';
import { listGroups } from '../api/groups.js';
import { useAsync } from '../hooks/useAsync.js';
import { formatMoney, formatDate } from '../utils/format.js';
import { EmptyState } from '../components/States.jsx';
import VerifyReceiptModal from '../components/VerifyReceiptModal.jsx';

const STEPS = ['Uploading the image', 'Reading the receipt', 'Matching line items'];

export default function Scan() {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle | working | verify
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [dragging, setDragging] = useState(false);

  const groups = useAsync(listGroups);
  const history = useAsync(listReceipts);

  // Advance the step text while the background job runs.
  useEffect(() => {
    if (phase !== 'working') return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2500);
    return () => clearInterval(timer);
  }, [phase]);

  const upload = async (file) => {
    if (!file) return;
    setError('');
    setStep(0);
    setPhase('working');

    try {
      const { receiptId } = await scanReceipt(file);

      // Poll until the background OCR job finishes.
      for (let i = 0; i < 60; i += 1) {
        const { receipt: current } = await getReceipt(receiptId);
        if (current.ocrStatus === 'done') {
          setReceipt(current);
          setPhase('verify');
          return;
        }
        if (current.ocrStatus === 'failed') {
          setError(current.ocrError || 'We could not read that receipt. Try a clearer photo.');
          setPhase('idle');
          return;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setError('Reading the receipt is taking too long. Check the scan history in a moment.');
      setPhase('idle');
    } catch (err) {
      setError(err.message || 'Upload failed');
      setPhase('idle');
    }
  };

  const onCommitted = (result, target) => {
    setPhase('idle');
    setReceipt(null);
    history.reload();

    if (target === 'personal') {
      navigate('/personal');
    } else {
      // Hand the pre-filled LINE_ITEM draft to the Add Expense page.
      navigate(`/expenses/new?group=${result.draft.groupId}`, { state: { draft: result.draft } });
    }
  };

  return (
    <>
      <h1 className="text-2xl font-semibold">Scan a receipt</h1>
      <p className="text-sm text-slate-500">
        The AI reads the lines; you check them before anything is saved.
      </p>

      {error && (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      {phase === 'working' ? (
        <div className="mt-6 rounded-2xl bg-white p-10 text-center ring-1 ring-slate-200">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-500" />
          <p className="mt-4 font-medium text-slate-800">{STEPS[step]}…</p>
          <p className="mt-1 text-xs text-slate-400">This usually takes a few seconds.</p>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            upload(e.dataTransfer.files?.[0]);
          }}
          onClick={() => fileInput.current?.click()}
          className={`mt-6 cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition ${
            dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-white hover:border-slate-400'
          }`}
        >
          <ScanLine className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700">Drop a receipt photo here</p>
          <p className="mt-1 text-xs text-slate-400">or click to choose · JPG or PNG up to 8MB</p>
          <span className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white">
            <Camera className="h-4 w-4" /> Choose image
          </span>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
        </div>
      )}

      <section className="mt-8">
        <h2 className="font-medium">Recent scans</h2>
        <div className="mt-3">
          {history.data?.receipts.length === 0 && <EmptyState title="No scans yet" hint="Your scanned receipts will appear here." />}
          {history.data && history.data.receipts.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
              {history.data.receipts.map((r) => (
                <li key={r.id} className="flex items-center justify-between px-4 py-3">
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{r.store || 'Receipt'}</span>
                    <span className="text-xs text-slate-400">
                      {formatDate(r.receiptDate || r.createdAt)} · {r.lineItems.length} items
                      {r.committedTo && ' · saved'}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">{formatMoney(r.itemsTotal)}</span>
                    {r.ocrStatus === 'done' && !r.committedTo && (
                      <button
                        onClick={() => {
                          setReceipt(r);
                          setPhase('verify');
                        }}
                        className="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100"
                      >
                        Review
                      </button>
                    )}
                    {r.ocrStatus === 'failed' && <span className="text-xs text-red-500">failed</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {phase === 'verify' && receipt && (
        <VerifyReceiptModal
          receipt={receipt}
          groups={groups.data?.groups ?? []}
          onClose={() => {
            setPhase('idle');
            setReceipt(null);
            history.reload();
          }}
          onCommitted={onCommitted}
        />
      )}
    </>
  );
}
