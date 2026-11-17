export interface SnapSessionRequest {
  orderId: string;
  amountIdr: number;
  customerName: string;
  customerEmail: string;
  itemName: string;
}

export interface SnapSessionResult {
  snapToken: string;
  redirectUrl: string;
}

export interface PaymentProviderAdapter {
  createSnapSession(request: SnapSessionRequest): Promise<SnapSessionResult>;
}
