import { BucketClient } from "./bucket";
import { sha256Hex, signRequest } from "./sigv4";

const SERVICE = "s3";

export type SpacesClientOptions = {
  endpoint: string;
  publicBaseUrl: string;
  region: string;
  accessKey: string;
  secretKey: string;
  prefix: string;
  acl: string;
};

export class SpacesClient extends BucketClient {
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly acl: string;

  constructor(options: SpacesClientOptions) {
    super(options, "Spaces");
    this.region = options.region;
    this.accessKey = options.accessKey;
    this.secretKey = options.secretKey;
    this.acl = options.acl;
  }

  /**
   * Signs the upload the way S3 expects, so Spaces accepts it without an SDK on board.
   * https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-authenticating-requests.html
   */
  protected sign(url: string, body: Buffer, contentType: string): Record<string, string> {
    return signRequest(
      {
        method: "PUT",
        url,
        region: this.region,
        service: SERVICE,
        headers: {
          "content-type": contentType,
          "x-amz-acl": this.acl,
          "x-amz-content-sha256": sha256Hex(body),
        },
        body,
      },
      { accessKeyId: this.accessKey, secretAccessKey: this.secretKey },
    );
  }
}
