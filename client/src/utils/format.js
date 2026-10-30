// Money is integer rupees everywhere. Display only: "Rs 4,200". Foreign amounts
// (as typed on a trip expense) keep up to 2 decimals: "AED 12.50".
export const formatMoney = (amount, currency = 'PKR') => {
  if (currency !== 'PKR') {
    return `${currency} ${(Number(amount) || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `Rs ${Math.round(Number(amount) || 0).toLocaleString('en-PK')}`;
};

export const formatSigned = (amount, currency = 'PKR') =>
  `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatMoney(Math.abs(amount), currency)}`;

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
