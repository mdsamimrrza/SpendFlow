/**
 * Curated per-country institution data for the account creation flow.
 *
 * These are real, licensed banks and wallet providers per country — bundled
 * statically (instead of fetched from an API) so the picker works offline,
 * loads instantly, and only ever offers legitimate institutions. Each country
 * carries its official currency, which drives the account's `currency` field
 * and therefore the transfer engine's conversion.
 */

export interface InstitutionPreset {
  name: string;
  color: string;
}

export interface CountryData {
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  name: string;
  flag: string;
  currency: string;
  banks: InstitutionPreset[];
  wallets: InstitutionPreset[];
}

export const COUNTRIES: CountryData[] = [
  {
    code: 'NP',
    name: 'Nepal',
    flag: '🇳🇵',
    currency: 'NPR',
    banks: [
      { name: 'Nabil Bank', color: '#1D4ED8' },
      { name: 'NIC Asia Bank', color: '#B91C1C' },
      { name: 'Global IME Bank', color: '#047857' },
      { name: 'Himalayan Bank', color: '#7C3AED' },
      { name: 'Nepal Investment Mega Bank', color: '#0369A1' },
      { name: 'Standard Chartered Nepal', color: '#047857' },
      { name: 'Everest Bank', color: '#1E3A8A' },
      { name: 'Siddhartha Bank', color: '#B45309' },
      { name: 'Kumari Bank', color: '#9D174D' },
      { name: 'Prabhu Bank', color: '#C2410C' },
      { name: 'Rastriya Banijya Bank', color: '#15803D' },
      { name: 'Agriculture Development Bank', color: '#166534' },
    ],
    wallets: [
      { name: 'eSewa', color: '#16A34A' },
      { name: 'Khalti', color: '#7C3AED' },
      { name: 'IME Pay', color: '#DC2626' },
      { name: 'CellPay', color: '#2563EB' },
      { name: 'Fonepay', color: '#0F766E' },
    ],
  },
  {
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    banks: [
      { name: 'HDFC Bank', color: '#1E3A8A' },
      { name: 'State Bank of India', color: '#0284C7' },
      { name: 'ICICI Bank', color: '#DC2626' },
      { name: 'Axis Bank', color: '#991B1B' },
      { name: 'Punjab National Bank', color: '#B91C1C' },
      { name: 'Bank of Baroda', color: '#D97706' },
      { name: 'Kotak Mahindra Bank', color: '#991B1B' },
      { name: 'IndusInd Bank', color: '#7C2D12' },
      { name: 'IDFC First Bank', color: '#0E7490' },
      { name: 'Canara Bank', color: '#1D4ED8' },
      { name: 'Union Bank of India', color: '#0369A1' },
      { name: 'Yes Bank', color: '#7E22CE' },
    ],
    wallets: [
      { name: 'Google Pay', color: '#2563EB' },
      { name: 'PhonePe', color: '#5B21B6' },
      { name: 'Paytm', color: '#0284C7' },
      { name: 'Amazon Pay', color: '#D97706' },
      { name: 'CRED', color: '#111827' },
      { name: 'Mobikwik', color: '#0F766E' },
    ],
  },
  {
    code: 'QA',
    name: 'Qatar',
    flag: '🇶🇦',
    currency: 'QAR',
    banks: [
      { name: 'Qatar National Bank (QNB)', color: '#7E22CE' },
      { name: 'Qatar Islamic Bank', color: '#047857' },
      { name: 'Commercial Bank of Qatar', color: '#B91C1C' },
      { name: 'Doha Bank', color: '#1D4ED8' },
      { name: 'Masraf Al Rayan', color: '#0F766E' },
      { name: 'Dukhan Bank', color: '#B45309' },
    ],
    wallets: [
      { name: 'Ooredoo Money', color: '#DC2626' },
      { name: 'Vodafone Cash', color: '#E11D48' },
    ],
  },
  {
    code: 'AE',
    name: 'UAE',
    flag: '🇦🇪',
    currency: 'AED',
    banks: [
      { name: 'Emirates NBD', color: '#1E40AF' },
      { name: 'First Abu Dhabi Bank', color: '#0F766E' },
      { name: 'Abu Dhabi Commercial Bank', color: '#B91C1C' },
      { name: 'Mashreq Bank', color: '#C2410C' },
      { name: 'Dubai Islamic Bank', color: '#15803D' },
      { name: 'Emirates Islamic', color: '#047857' },
      { name: 'RAKBank', color: '#B45309' },
    ],
    wallets: [
      { name: 'e& money', color: '#DC2626' },
      { name: 'Payit', color: '#0284C7' },
      { name: 'Careem Pay', color: '#16A34A' },
    ],
  },
  {
    code: 'SA',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    currency: 'SAR',
    banks: [
      { name: 'Al Rajhi Bank', color: '#1D4ED8' },
      { name: 'Saudi National Bank', color: '#0369A1' },
      { name: 'Riyad Bank', color: '#15803D' },
      { name: 'Saudi Awwal Bank (SAB)', color: '#0E7490' },
      { name: 'Alinma Bank', color: '#047857' },
      { name: 'Bank Albilad', color: '#166534' },
    ],
    wallets: [
      { name: 'STC Pay', color: '#7C3AED' },
      { name: 'urpay', color: '#1D4ED8' },
    ],
  },
  {
    code: 'US',
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    banks: [
      { name: 'Chase', color: '#1E3A8A' },
      { name: 'Bank of America', color: '#B91C1C' },
      { name: 'Wells Fargo', color: '#B45309' },
      { name: 'Citibank', color: '#0E7490' },
      { name: 'U.S. Bank', color: '#1D4ED8' },
      { name: 'PNC Bank', color: '#D97706' },
      { name: 'Capital One', color: '#0F766E' },
      { name: 'Truist', color: '#312E81' },
    ],
    wallets: [
      { name: 'PayPal', color: '#1D4ED8' },
      { name: 'Venmo', color: '#2563EB' },
      { name: 'Cash App', color: '#16A34A' },
      { name: 'Apple Cash', color: '#334155' },
    ],
  },
  {
    code: 'GB',
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    banks: [
      { name: 'Barclays', color: '#0369A1' },
      { name: 'HSBC', color: '#B91C1C' },
      { name: 'Lloyds Bank', color: '#15803D' },
      { name: 'NatWest', color: '#7E22CE' },
      { name: 'Santander UK', color: '#DC2626' },
      { name: 'Nationwide', color: '#1D4ED8' },
      { name: 'Monzo', color: '#F97316' },
      { name: 'Starling Bank', color: '#0E7490' },
    ],
    wallets: [
      { name: 'Revolut', color: '#111827' },
      { name: 'Wise', color: '#15803D' },
      { name: 'PayPal', color: '#1D4ED8' },
    ],
  },
  {
    code: 'MY',
    name: 'Malaysia',
    flag: '🇲🇾',
    currency: 'MYR',
    banks: [
      { name: 'Maybank', color: '#D97706' },
      { name: 'CIMB Bank', color: '#B91C1C' },
      { name: 'Public Bank', color: '#1D4ED8' },
      { name: 'RHB Bank', color: '#0E7490' },
      { name: 'Hong Leong Bank', color: '#B45309' },
      { name: 'Bank Islam', color: '#15803D' },
    ],
    wallets: [
      { name: "Touch 'n Go eWallet", color: '#2563EB' },
      { name: 'Boost', color: '#E11D48' },
      { name: 'GrabPay', color: '#16A34A' },
      { name: 'ShopeePay', color: '#F97316' },
    ],
  },
  {
    code: 'KR',
    name: 'South Korea',
    flag: '🇰🇷',
    currency: 'KRW',
    banks: [
      { name: 'KB Kookmin Bank', color: '#7C3AED' },
      { name: 'Shinhan Bank', color: '#0E7490' },
      { name: 'Woori Bank', color: '#1D4ED8' },
      { name: 'Hana Bank', color: '#15803D' },
      { name: 'NH NongHyup Bank', color: '#B45309' },
    ],
    wallets: [
      { name: 'Toss', color: '#2563EB' },
      { name: 'Kakao Pay', color: '#D97706' },
      { name: 'Naver Pay', color: '#16A34A' },
    ],
  },
  {
    code: 'JP',
    name: 'Japan',
    flag: '🇯🇵',
    currency: 'JPY',
    banks: [
      { name: 'MUFG Bank', color: '#B91C1C' },
      { name: 'Sumitomo Mitsui (SMBC)', color: '#15803D' },
      { name: 'Mizuho Bank', color: '#1D4ED8' },
      { name: 'Japan Post Bank', color: '#DC2626' },
    ],
    wallets: [
      { name: 'PayPay', color: '#DC2626' },
      { name: 'Rakuten Pay', color: '#B91C1C' },
      { name: 'LINE Pay', color: '#16A34A' },
    ],
  },
  {
    code: 'AU',
    name: 'Australia',
    flag: '🇦🇺',
    currency: 'AUD',
    banks: [
      { name: 'Commonwealth Bank', color: '#D97706' },
      { name: 'Westpac', color: '#B91C1C' },
      { name: 'ANZ', color: '#0E7490' },
      { name: 'NAB', color: '#B45309' },
    ],
    wallets: [
      { name: 'PayPal', color: '#1D4ED8' },
      { name: 'Wise', color: '#15803D' },
    ],
  },
  {
    code: 'CA',
    name: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    banks: [
      { name: 'RBC Royal Bank', color: '#1D4ED8' },
      { name: 'TD Canada Trust', color: '#15803D' },
      { name: 'Scotiabank', color: '#B91C1C' },
      { name: 'BMO', color: '#0E7490' },
      { name: 'CIBC', color: '#7E22CE' },
    ],
    wallets: [
      { name: 'PayPal', color: '#1D4ED8' },
      { name: 'Wise', color: '#15803D' },
    ],
  },
];

/**
 * Countries currently offered in the account setup wizard — the same set as the
 * app's supported currencies (CURRENCIES in constants/app.ts). The full
 * registry above stays intact; widen this list to expose more countries.
 */
export const ENABLED_COUNTRY_CODES = ['NP', 'IN', 'QA', 'US', 'GB'];

export const WIZARD_COUNTRIES: CountryData[] = COUNTRIES.filter((c) =>
  ENABLED_COUNTRY_CODES.includes(c.code),
);

/** Pseudo-country for currencies not covered above; keeps the profile's preferred currency. */
export const OTHER_COUNTRY_CODE = 'OTHER';

export function getCountryByCode(code: string): CountryData | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function countryForCurrency(currency?: string | null): CountryData | undefined {
  if (!currency) return undefined;
  return COUNTRIES.find((c) => c.currency === currency.toUpperCase());
}

/**
 * Best-effort flag for an account: its stored country code first, then the
 * country matching its currency, then the generic globe.
 */
export function countryFlag(country?: string | null, currency?: string | null): string {
  const byCode = country ? getCountryByCode(country) : undefined;
  if (byCode) return byCode.flag;
  return countryForCurrency(currency)?.flag ?? '🌐';
}
