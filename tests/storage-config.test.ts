import { describe, expect, it } from "vitest";
import { STORAGE_BUCKET, getStorageConfig, objectStorageConfigured } from "@/lib/storage-config";

const FULL = {
  NEON_STORAGE_BUCKET: "tixconneckt",
  AWS_REGION: "us-east-1",
  AWS_ENDPOINT_URL_S3: "https://storage.neon.example",
  AWS_ACCESS_KEY_ID: "key",
  AWS_SECRET_ACCESS_KEY: "secret",
};

describe("getStorageConfig", () => {
  it("resolves the full config when every value is present", () => {
    expect(getStorageConfig(FULL)).toEqual({
      bucket: "tixconneckt",
      region: "us-east-1",
      endpoint: "https://storage.neon.example",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
  });

  it("defaults the bucket to tixconneckt when unset or blank", () => {
    expect(getStorageConfig({ ...FULL, NEON_STORAGE_BUCKET: undefined })?.bucket).toBe("tixconneckt");
    expect(getStorageConfig({ ...FULL, NEON_STORAGE_BUCKET: "  " })?.bucket).toBe("tixconneckt");
  });

  it("returns null when endpoint, region, or credentials are missing", () => {
    expect(getStorageConfig({})).toBeNull();
    expect(getStorageConfig({ ...FULL, AWS_ENDPOINT_URL_S3: "" })).toBeNull();
    expect(getStorageConfig({ ...FULL, AWS_REGION: undefined })).toBeNull();
    expect(getStorageConfig({ ...FULL, AWS_ACCESS_KEY_ID: "  " })).toBeNull();
    expect(getStorageConfig({ ...FULL, AWS_SECRET_ACCESS_KEY: undefined })).toBeNull();
  });
});

describe("objectStorageConfigured", () => {
  it("is true only for a complete configuration", () => {
    expect(objectStorageConfigured(FULL)).toBe(true);
    expect(objectStorageConfigured({})).toBe(false);
    expect(objectStorageConfigured({ NEON_STORAGE_BUCKET: "tixconneckt" })).toBe(false);
  });

  it("names the application bucket", () => {
    expect(STORAGE_BUCKET).toBe("tixconneckt");
  });
});
