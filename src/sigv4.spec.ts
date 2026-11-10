import { signRequest } from "./sigv4";

const suite = { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" };

const vanilla = {
  method: "GET",
  url: "https://example.amazonaws.com/",
  region: "us-east-1",
  service: "service",
  headers: {},
  body: "",
};

const at = new Date("2015-08-30T12:36:00Z");

describe("signRequest", () => {
  it("signs the vanilla request of the AWS test suite to its published signature", () => {
    expect(signRequest(vanilla, suite, at).Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, " +
        "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("sorts the query the way the AWS test suite expects", () => {
    const signed = signRequest(
      { ...vanilla, url: "https://example.amazonaws.com/?Param2=value2&Param1=value1" },
      suite,
      at,
    );

    expect(signed.Authorization).toMatch(/Signature=b97d918cfa904a5beff61c982a1b6f458b799221646efd99d3219ec94cdf2500$/);
  });

  it("signs the S3 GET object example to the signature the S3 documentation publishes", () => {
    const signed = signRequest(
      {
        method: "GET",
        url: "https://examplebucket.s3.amazonaws.com/test.txt",
        region: "us-east-1",
        service: "s3",
        headers: {
          Range: "bytes=0-9",
          "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        },
        body: "",
      },
      { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" },
      new Date("2013-05-24T00:00:00Z"),
    );

    expect(signed.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, " +
        "SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, " +
        "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  it("sends and signs the session token that temporary credentials carry", () => {
    const signed = signRequest(vanilla, { ...suite, sessionToken: "a-session-token" }, at);

    expect(signed["x-amz-security-token"]).toBe("a-session-token");
    expect(signed.Authorization).toContain("SignedHeaders=host;x-amz-date;x-amz-security-token, ");
  });

  it("leaves the session token out when the credentials carry none", () => {
    expect(signRequest(vanilla, suite, at)).not.toHaveProperty("x-amz-security-token");
  });

  it("answers with the headers it signed, named in lower case", () => {
    const signed = signRequest({ ...vanilla, headers: { "Content-Type": "application/json" } }, suite, at);

    expect(signed).toEqual({
      "content-type": "application/json",
      host: "example.amazonaws.com",
      "x-amz-date": "20150830T123600Z",
      Authorization: expect.stringContaining("SignedHeaders=content-type;host;x-amz-date, "),
    });
  });
});
