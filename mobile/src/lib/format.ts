export function formatPrice(cents: number, currency: string, localeTag = 'fr-CA') {
  return new Intl.NumberFormat(localeTag, { style: 'currency', currency }).format(cents / 100);
}
