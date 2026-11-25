import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIS_BOUNDING_BOXES,
  AisScopeId,
  AisVesselTelemetry,
} from './ais.types';

interface RawAisStreamPayload {
  MetaData?: {
    MMSI?: number | string;
    ShipName?: string;
    latitude?: number;
    longitude?: number;
    time_utc?: string;
  };
  Message?: {
    PositionReport?: {
      Cog?: number;
      Sog?: number;
      TrueHeading?: number;
      NavigationalStatus?: number;
      Latitude?: number;
      Longitude?: number;
    };
    StandardClassBPositionReport?: {
      Cog?: number;
      Sog?: number;
      TrueHeading?: number;
      Latitude?: number;
      Longitude?: number;
    };
    ShipStaticData?: {
      Name?: string;
      Type?: number;
      Destination?: string;
      ImoNumber?: number;
      CallSign?: string;
      MaximumStaticDraught?: number;
      Dimension?: {
        A?: number;
        B?: number;
        C?: number;
        D?: number;
      };
    };
  };
  error?: string;
}

@Injectable()
export class AisService {
  constructor(private readonly configService: ConfigService) {}

  getApiKey(): string {
    return this.configService.get<string>('aisStreamApiKey') || '';
  }

  resolveScope(rawScope?: string): AisScopeId {
    if (rawScope === 'papua' || rawScope === 'indonesia') {
      return rawScope;
    }
    return 'poumako';
  }

  private normalizeMessage(
    raw: RawAisStreamPayload,
  ): Partial<AisVesselTelemetry> | null {
    const mmsi = raw.MetaData?.MMSI ? String(raw.MetaData.MMSI) : '';
    if (!mmsi) return null;

    const pos =
      raw.Message?.PositionReport ?? raw.Message?.StandardClassBPositionReport;
    const staticData = raw.Message?.ShipStaticData;

    const lat = pos?.Latitude ?? raw.MetaData?.latitude;
    const lng = pos?.Longitude ?? raw.MetaData?.longitude;

    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      (lat === 0 && lng === 0)
    ) {
      return null;
    }

    const rawName = (staticData?.Name || raw.MetaData?.ShipName || '').trim();
    const dim = staticData?.Dimension;
    const lengthMeters =
      dim && (typeof dim.A === 'number' || typeof dim.B === 'number')
        ? (dim.A || 0) + (dim.B || 0)
        : undefined;
    const beamMeters =
      dim && (typeof dim.C === 'number' || typeof dim.D === 'number')
        ? (dim.C || 0) + (dim.D || 0)
        : undefined;

    return {
      mmsi,
      shipName: rawName || `KAPAL ${mmsi}`,
      lat,
      lng,
      cog: typeof pos?.Cog === 'number' ? pos.Cog : 0,
      sog: typeof pos?.Sog === 'number' ? pos.Sog : 0,
      heading:
        typeof pos?.TrueHeading === 'number' && pos.TrueHeading < 360
          ? pos.TrueHeading
          : typeof pos?.Cog === 'number'
            ? pos.Cog
            : 0,
      navStatus:
        raw.Message?.PositionReport?.NavigationalStatus !== undefined
          ? raw.Message.PositionReport.NavigationalStatus
          : undefined,
      shipType: staticData?.Type,
      destination: staticData?.Destination?.trim() || undefined,
      imoNumber:
        typeof staticData?.ImoNumber === 'number' && staticData.ImoNumber > 0
          ? staticData.ImoNumber
          : undefined,
      callSign: staticData?.CallSign?.trim() || undefined,
      lengthMeters: lengthMeters && lengthMeters > 0 ? lengthMeters : undefined,
      beamMeters: beamMeters && beamMeters > 0 ? beamMeters : undefined,
      draughtMeters:
        typeof staticData?.MaximumStaticDraught === 'number' &&
        staticData.MaximumStaticDraught > 0
          ? staticData.MaximumStaticDraught
          : undefined,
      updatedAt: raw.MetaData?.time_utc || new Date().toISOString(),
    };
  }

  openUpstreamStream(
    scope: AisScopeId,
    onEvent: (event: string, data: unknown) => void,
    onClosed: () => void,
  ): () => void {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      onEvent('status', {
        status: 'error',
        message: 'AISSTREAM_API_KEY belum dikonfigurasi di backend (.env)',
      });
      onClosed();
      return () => {};
    }

    let isClosed = false;
    let socket: WebSocket | null = null;

    const close = () => {
      if (isClosed) return;
      isClosed = true;
      if (socket && socket.readyState <= WebSocket.OPEN) {
        try {
          socket.close();
        } catch {
          // ignore close error
        }
      }
      onClosed();
    };

    onEvent('status', { status: 'connecting', scope });

    try {
      socket = new WebSocket('wss://stream.aisstream.io/v0/stream');

      socket.addEventListener('open', () => {
        if (!socket || isClosed) return;
        socket.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: AIS_BOUNDING_BOXES[scope],
            FilterMessageTypes: [
              'PositionReport',
              'StandardClassBPositionReport',
              'ShipStaticData',
            ],
          }),
        );
        onEvent('status', { status: 'connected', scope });
      });

      socket.addEventListener('message', async (event) => {
        if (isClosed) return;
        try {
          const text =
            typeof event.data === 'string'
              ? event.data
              : event.data instanceof Blob
                ? await event.data.text()
                : String(event.data);
          const parsed = JSON.parse(text) as RawAisStreamPayload;

          if (parsed.error) {
            onEvent('status', { status: 'error', message: parsed.error });
            return;
          }

          const vessel = this.normalizeMessage(parsed);
          if (vessel) {
            onEvent('vessel', vessel);
          }
        } catch {
          // ignore malformed frame
        }
      });

      socket.addEventListener('error', () => {
        onEvent('status', {
          status: 'error',
          message: 'Koneksi WebSocket ke AISStream.io terputus.',
        });
      });

      socket.addEventListener('close', () => {
        close();
      });
    } catch (err) {
      onEvent('status', {
        status: 'error',
        message:
          err instanceof Error ? err.message : 'Gagal membuka stream AIS.',
      });
      close();
    }

    return close;
  }
}
