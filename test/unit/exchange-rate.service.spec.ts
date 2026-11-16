/// <reference types="jest" />
import { ConfigService } from '@nestjs/config';
import { ExchangeRateService } from '../../src/modules/tariffs/exchange-rate.service';

describe('ExchangeRateService (Dynamic USD to IDR)', () => {
  let service: ExchangeRateService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        if (key === 'DEFAULT_USD_TO_IDR_RATE') return 16000;
        if (key === 'EXCHANGE_RATE_CACHE_TTL_MS') return 3600000;
        return defaultValue;
      }),
    } as unknown as ConfigService;

    service = new ExchangeRateService(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('1. Honors manual override rate when provided', async () => {
    const rate = await service.getLiveUsdToIdrRate(16500);
    expect(rate).toBe(16500);
  });

  it('2. Successfully fetches and caches live exchange rate from free API', async () => {
    const mockApiResponse = {
      result: 'success',
      rates: {
        IDR: 16275.5,
      },
    };

    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockApiResponse),
      } as any),
    );

    const details = await service.getExchangeRateDetails();

    expect(details.baseCurrency).toBe('USD');
    expect(details.targetCurrency).toBe('IDR');
    expect(details.rate).toBe(16275.5);
    expect(details.isFallback).toBe(false);
    expect(details.source).toContain('open.er-api.com');

    // Second call should return cached without additional fetch
    const cached = await service.getExchangeRateDetails();
    expect(cached.rate).toBe(16275.5);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('3. Falls back smoothly to secondary provider if primary fails', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockImplementationOnce(() => Promise.reject(new Error('Network error on primary')))
      .mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ rates: { IDR: 16300.0 } }),
        } as any),
      );

    const details = await service.getExchangeRateDetails(true);

    expect(details.rate).toBe(16300.0);
    expect(details.source).toContain('api.exchangerate-api.com');
  });

  it('4. Falls back to DEFAULT_USD_TO_IDR_RATE if all external providers fail', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(() => Promise.reject(new Error('All APIs down')));

    const details = await service.getExchangeRateDetails(true);

    expect(details.rate).toBe(16000);
    expect(details.isFallback).toBe(true);
    expect(details.source).toBe('LOCAL_ENV_DEFAULT');
  });
});
