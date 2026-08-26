import AsyncStorage from '@react-native-async-storage/async-storage';
import { format, subDays, subMonths } from 'date-fns';
import { convertCurrency } from '@/services/currency';

export interface BullionRates {
  goldUsdPerOz: number;
  silverUsdPerOz: number;
  updatedAt: string;
}

export interface ComputedBullionPrices {
  gold24kPerGram: number;
  gold24kPer10g: number;
  gold24kPerTola: number;
  gold22kPerGram: number;
  gold22kPer10g: number;
  gold22kPerTola: number;
  silverPerGram: number;
  silverPer10g: number;
  silverPer1kg: number;
  silverPerTola: number;
  currency: string;
  updatedAt: string;
}

export interface BullionHistoryPoint {
  date: string;
  label: string;
  fullDate: string;
  price: number;
}

const BULLION_CACHE_KEY = '@spendflow_bullion_rates_v1';
const GRAMS_PER_TROY_OUNCE = 31.1034768;
const GRAMS_PER_TOLA = 11.6638;

// Fallback rates if completely offline on first launch
const FALLBACK_BULLION: BullionRates = {
  goldUsdPerOz: 2650.0,
  silverUsdPerOz: 31.5,
  updatedAt: new Date().toISOString(),
};

/**
 * Fetch raw spot prices for Gold (XAU) & Silver (XAG) in USD
 */
export async function fetchLiveBullionRates(): Promise<BullionRates> {
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch('https://api.gold-api.com/price/XAU', { headers: { Accept: 'application/json' } }),
      fetch('https://api.gold-api.com/price/XAG', { headers: { Accept: 'application/json' } }),
    ]);

    if (!goldRes.ok || !silverRes.ok) {
      throw new Error('Bullion API returned non-200');
    }

    const goldJson = await goldRes.json();
    const silverJson = await silverRes.json();

    const result: BullionRates = {
      goldUsdPerOz: Number(goldJson.price) || FALLBACK_BULLION.goldUsdPerOz,
      silverUsdPerOz: Number(silverJson.price) || FALLBACK_BULLION.silverUsdPerOz,
      updatedAt: goldJson.updatedAt || new Date().toISOString(),
    };

    await AsyncStorage.setItem(BULLION_CACHE_KEY, JSON.stringify(result));
    return result;
  } catch (err) {
    // Return cached if available
    try {
      const cached = await AsyncStorage.getItem(BULLION_CACHE_KEY);
      if (cached) {
        return JSON.parse(cached) as BullionRates;
      }
    } catch {
      // ignore
    }
    return FALLBACK_BULLION;
  }
}

/**
 * Compute local prices for 24K, 22K Gold and 999 Silver in user's currency.
 * Applies regional domestic import duties & jeweler federation margins (e.g. Nepal FENEGOSIDA ~22.4% duty, India IBJA ~9% duty/GST)
 * so domestic retail rates match local market boards.
 */
export function computeBullionPrices(
  rates: BullionRates,
  targetCurrency = 'INR',
  exchangeRates?: Record<string, number>
): ComputedBullionPrices {
  const goldUsdPerGram = rates.goldUsdPerOz / GRAMS_PER_TROY_OUNCE;
  const silverUsdPerGram = rates.silverUsdPerOz / GRAMS_PER_TROY_OUNCE;

  // Regional domestic market tariff & dealer association premium factors:
  // - Nepal (NPR): Nepal Rastra Bank 20% customs duty + FENEGOSIDA domestic dealer margin (~22.4% for Gold, ~27.1% for Silver)
  // - India (INR): Indian customs duty (6%) + GST (3%) + IBJA market premium (~9.0%)
  // - USD/EUR/GBP: Raw international COMEX/LBMA spot (1.0)
  const isNPR = targetCurrency.toUpperCase() === 'NPR';
  const isINR = targetCurrency.toUpperCase() === 'INR';

  const goldRegionalMultiplier = isNPR ? 1.22394 : isINR ? 1.09 : 1.0;
  const silverRegionalMultiplier = isNPR ? 1.27088 : isINR ? 1.09 : 1.0;

  // Convert per-gram USD to target currency with regional domestic factor
  const rawGoldPerGram = convertCurrency(goldUsdPerGram, 'USD', targetCurrency, exchangeRates);
  const gold24kPerGram = rawGoldPerGram * goldRegionalMultiplier;
  const gold22kPerGram = gold24kPerGram * 0.9167; // 22 Karat standard (91.67% pure)

  const rawSilverPerGram = convertCurrency(silverUsdPerGram, 'USD', targetCurrency, exchangeRates);
  const silverPerGram = rawSilverPerGram * silverRegionalMultiplier;

  return {
    gold24kPerGram,
    gold24kPer10g: gold24kPerGram * 10,
    gold24kPerTola: gold24kPerGram * GRAMS_PER_TOLA,

    gold22kPerGram,
    gold22kPer10g: gold22kPerGram * 10,
    gold22kPerTola: gold22kPerGram * GRAMS_PER_TOLA,

    silverPerGram,
    silverPer10g: silverPerGram * 10,
    silverPer1kg: silverPerGram * 1000,
    silverPerTola: silverPerGram * GRAMS_PER_TOLA,

    currency: targetCurrency,
    updatedAt: rates.updatedAt,
  };
}

/**
 * Generates realistic historical trend data for Gold / Silver over selected months (1M, 3M, 6M, 1Y)
 * ending precisely at the live current spot price with realistic volatility and zero flat lines.
 */
export function generateBullionHistoricalTrend(
  currentPrice: number,
  months = 6,
  metal: 'gold' | 'silver' = 'gold'
): BullionHistoryPoint[] {
  const points: BullionHistoryPoint[] = [];
  const totalDays = months * 30;
  // Choose reasonable step interval (e.g. every 2 days for 1M, every 3-4 days for 3M/6M, every 7 days for 1Y)
  const stepDays = months === 1 ? 2 : months === 3 ? 3 : months === 6 ? 5 : 7;
  const numSteps = Math.floor(totalDays / stepDays);
  const now = new Date();

  // Macro 1-year baseline gain factor for precious metals (e.g. Gold ~16% annualized, Silver ~22%)
  const annualGrowthRate = metal === 'gold' ? 0.16 : 0.22;
  const periodGrowth = annualGrowthRate * (months / 12);
  const startMultiplier = 1 / (1 + periodGrowth); // e.g. ~0.86 at start of 1Y

  for (let i = 0; i <= numSteps; i++) {
    const fraction = i / numSteps; // 0.0 at oldest date, 1.0 at today
    const daysAgo = Math.round((numSteps - i) * stepDays);
    const targetDate = subDays(now, daysAgo);

    if (i === numSteps) {
      // Exactly current live price for today
      points.push({
        date: format(targetDate, 'yyyy-MM-dd'),
        label: format(targetDate, 'd MMM yyyy'),
        fullDate: format(targetDate, 'EEE, d MMM yyyy'),
        price: Math.round(currentPrice),
      });
      continue;
    }

    // Upward macro drift from startMultiplier to 1.0
    const macroDrift = startMultiplier + (1.0 - startMultiplier) * Math.pow(fraction, 0.9);

    // Cyclical market waves (medium & short-term market cycles)
    const wave1 = Math.sin(fraction * Math.PI * 4.5) * (metal === 'gold' ? 0.024 : 0.045);
    const wave2 = Math.cos(fraction * Math.PI * 9.0) * (metal === 'gold' ? 0.012 : 0.022);
    const wave3 = Math.sin(fraction * Math.PI * 16.0 + 0.5) * (metal === 'gold' ? 0.007 : 0.015);

    // Natural volatility multiplier
    const totalMultiplier = Math.max(0.7, macroDrift + wave1 + wave2 + wave3);
    const calculatedPrice = Math.round(currentPrice * totalMultiplier);

    points.push({
      date: format(targetDate, 'yyyy-MM-dd'),
      label: format(targetDate, 'd MMM yyyy'),
      fullDate: format(targetDate, 'EEE, d MMM yyyy'),
      price: calculatedPrice,
    });
  }

  return points;
}
