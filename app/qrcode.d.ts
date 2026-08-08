declare module "qrcode" {
  type CanvasOptions = {
    width?: number;
    margin?: number;
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    color?: {
      dark?: string;
      light?: string;
    };
  };

  const QRCode: {
    toCanvas(canvas: HTMLCanvasElement, text: string, options?: CanvasOptions): Promise<void>;
  };

  export default QRCode;
}
