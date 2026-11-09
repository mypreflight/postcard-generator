import { BucketClient } from "./bucket";
import { type Credentials, sha256Hex, signRequest } from "./sigv4";

const SERVICE = "s3";

export type S3ClientOptions = {
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  prefix: string;
  credentials: () => Credentials;
};

export class S3Client extends BucketClient {
  private readonly region: string;
  private readonly credentials: () => Credentials;

  constructor(options: S3ClientOptions) {
    super(options, "S3");
    this.region = options.region;
    this.credentials = options.credentials;
  }

  protected sign(url: string, body: Buffer, contentType: string): Record<string, string> {
    return signRequest(
      {
        method: "PUT",
        url,
        region: this.region,
        service: SERVICE,
        headers: {
          "content-type": contentType,
          "x-amz-content-sha256": sha256Hex(body),
        },
        body,
      },
      this.credentials(),
    );
  }
}
