export type AisScopeId = 'poumako' | 'papua' | 'indonesia';

export interface AisVesselTelemetry {
  mmsi: string;
  shipName: string;
  lat: number;
  lng: number;
  cog: number;
  sog: number;
  heading: number;
  navStatus?: number;
  shipType?: number;
  destination?: string;
  imoNumber?: number;
  callSign?: string;
  lengthMeters?: number;
  beamMeters?: number;
  draughtMeters?: number;
  updatedAt: string;
}

export const AIS_BOUNDING_BOXES: Record<
  AisScopeId,
  [[[number, number], [number, number]]]
> = {
  poumako: [[[-6.8, 134.5], [-3.5, 139.0]]],
  papua: [[[-9.0, 128.0], [1.5, 141.5]]],
  indonesia: [[[-11.5, 94.5], [6.5, 141.5]]],
};
