import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ExchangeRateInfo {
  baseCurrency: string;
  targetCurrency: string;
  rate: number;
  source: string;
  lastUpdated: Date;
  isFallback: boolean;
}

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  private cachedRate: ExchangeRateInfo | null = null;
  private lastFetchTime = 0;
  private readonly cacheTtlMs: number;
  private readonly defaultFallbackRate: number;

  constructor(private readonly configService: ConfigService) {
    this.defaultFallbackRate = Number(
      this.configService.get<number>('DEFAULT_USD_TO_IDR_RATE') || 16000,
    );
    this.cacheTtlMs = Number(
      this.configService.get<number>('EXCHANGE_RATE_CACHE_TTL_MS') || 3600000, // 1 hour default
    );
  }

  /**
   * Get the current USD to IDR exchange rate.
   * Uses cached live rate if valid; otherwise queries free internet APIs with fallback.
   */
  async getLiveUsdToIdrRate(manualOverride?: number): Promise<number> {
    if (manualOverride && manualOverride > 0) {
      return manualOverride;
    }
    const info = await this.getExchangeRateDetails();
    return info.rate;
  }

  /**
   * Retrieve full details of current USD/IDR exchange rate, including provider source and timestamp.
   */
  async getExchangeRateDetails(forceRefresh = false): Promise<ExchangeRateInfo> {
    const now = Date.now();

    if (!forceRefresh && this.cachedRate && now - this.lastFetchTime < this.cacheTtlMs) {
      return this.cachedRate;
    }

    try {
      const liveRate = await this.fetchFromLiveApis();
      this.cachedRate = liveRate;
      this.lastFetchTime = now;
      this.logger.log(
        `USD to IDR rate updated: Rp ${liveRate.rate.toLocaleString('id-ID')} (Source: ${liveRate.source})`,
      );
      return liveRate;
    } catch (err: any) {
      this.logger.warn(
        `Failed to fetch live exchange rate from external APIs: ${err?.message || err}. Using fallback.`,
      );

      // If we have an existing cache (even if expired), prefer it over hardcoded default
      if (this.cachedRate) {
        return {
          ...this.cachedRate,
          isFallback: true,
        };
      }

      // Final fallback to DEFAULT_USD_TO_IDR_RATE from .env
      const fallbackInfo: ExchangeRateInfo = {
        baseCurrency: 'USD',
        targetCurrency: 'IDR',
        rate: this.defaultFallbackRate,
        source: 'LOCAL_ENV_DEFAULT',
        lastUpdated: new Date(),
        isFallback: true,
      };
      this.cachedRate = fallbackInfo;
      return fallbackInfo;
    }
  }

  /**
   * Multi-tier resilient fetcher trying free, open-access currency APIs sequentially.
   */
  private async fetchFromLiveApis(): Promise<ExchangeRateInfo> {
    // Provider 1: open.er-api.com (Open Exchange Rates / ExchangeRate-API free open endpoint)
    try {
      const rate = await this.fetchWithTimeout(
        'https://open.er-api.com/v6/latest/USD',
        (data) => {
          if (data?.result === 'success' && data?.rates?.IDR) {
            return Number(data.rates.IDR);
          }
          return null;
        },
      );
      if (rate) {
        return {
          baseCurrency: 'USD',
          targetCurrency: 'IDR',
          rate: Math.round(rate * 100) / 100,
          source: 'https://open.er-api.com/v6/latest/USD',
          lastUpdated: new Date(),
          isFallback: false,
        };
      }
    } catch (e: any) {
      this.logger.debug(`Provider 1 (open.er-api.com) failed: ${e?.message}`);
    }

    // Provider 2: api.exchangerate-api.com/v4/latest/USD (Secondary open endpoint)
    try {
      const rate = await this.fetchWithTimeout(
        'https://api.exchangerate-api.com/v4/latest/USD',
        (data) => {
          if (data?.rates?.IDR) {
            return Number(data.rates.IDR);
          }
          return null;
        },
      );
      if (rate) {
        return {
          baseCurrency: 'USD',
          targetCurrency: 'IDR',
          rate: Math.round(rate * 100) / 100,
          source: 'https://api.exchangerate-api.com/v4/latest/USD',
          lastUpdated: new Date(),
          isFallback: false,
        };
      }
    } catch (e: any) {
      this.logger.debug(`Provider 2 (exchangerate-api.com/v4) failed: ${e?.message}`);
    }

    // Provider 3: Fawaz Ahmed Open Currency API on jsDelivr CDN
    try {
      const rate = await this.fetchWithTimeout(
        'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
        (data) => {
          if (data?.usd?.idr) {
            return Number(data.usd.idr);
          }
          return null;
        },
      );
      if (rate) {
        return {
          baseCurrency: 'USD',
          targetCurrency: 'IDR',
          rate: Math.round(rate * 100) / 100,
          source: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api (jsDelivr CDN)',
          lastUpdated: new Date(),
          isFallback: false,
        };
      }
    } catch (e: any) {
      this.logger.debug(`Provider 3 (jsdelivr currency-api) failed: ${e?.message}`);
    }

    throw new Error('All external exchange rate providers were unreachable');
  }

  private async fetchWithTimeout<T>(
    url: string,
    extractor: (json: any) => number | null,
    timeoutMs = 4000,
  ): Promise<number | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PORTA-Mimika-Port-Revenue-System/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const json = await response.json();
      return extractor(json);
    } finally {
      clearTimeout(timeout);
    }
  }
}

