export function currency(amount: number, currency = 'MXN') {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(amount);
}

// Alias para compatibilidad
export function formatCurrency(amount: number | string | undefined | null) {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : (amount || 0);
  return `C$${numAmount.toFixed(2)}`;
}

export function timeAgo(date: Date | number) {
  const d = typeof date === 'number' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace unos segundos';
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  return `${Math.floor(diff / 3600)} h`;
}
