import { initials } from '../utils/format.js';

const sizes = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs' };

export default function Avatar({ name, avatarUrl, size = 'sm', muted = false }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${sizes[size]} rounded-full object-cover ring-2 ring-white`} />;
  }
  return (
    <span
      title={name}
      className={`${sizes[size]} grid shrink-0 place-items-center rounded-full font-medium ring-2 ring-white
        ${muted ? 'bg-slate-200 text-slate-500' : 'bg-emerald-100 text-emerald-800'}`}
    >
      {initials(name)}
    </span>
  );
}
