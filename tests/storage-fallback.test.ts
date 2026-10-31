import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, validateOrganizationUpload } from "@/lib/storage";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const gif = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x00]);
const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const text = Buffer.from("registration certificate notes");

describe("validateOrganizationUpload", () => {
  it("accepts logo images with matching content", () => {
    expect(validateOrganizationUpload("image/png", png.length, png)).toBeNull();
    expect(validateOrganizationUpload("image/jpeg", jpeg.length, jpeg)).toBeNull();
    expect(validateOrganizationUpload("image/gif", gif.length, gif)).toBeNull();
    expect(validateOrganizationUpload("image/webp", webp.length, webp)).toBeNull();
    expect(validateOrganizationUpload("image/svg+xml", svg.length, svg)).toBeNull();
  });

  it("accepts verification evidence files with matching content", () => {
    expect(validateOrganizationUpload("application/pdf", pdf.length, pdf)).toBeNull();
    expect(validateOrganizationUpload("text/plain", text.length, text)).toBeNull();
    expect(
      validateOrganizationUpload(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        zip.length,
        zip,
      ),
    ).toBeNull();
  });

  it("rejects unsupported types, empty files, and oversized files", () => {
    expect(validateOrganizationUpload("application/x-msdownload", 10, text)).not.toBeNull();
    expect(validateOrganizationUpload("image/png", 0, png)).toMatch(/empty/i);
    expect(validateOrganizationUpload("image/png", MAX_UPLOAD_BYTES + 1, png)).toMatch(/10 MB/);
  });

  it("rejects content that does not match the claimed type", () => {
    expect(validateOrganizationUpload("image/jpeg", png.length, png)).toMatch(/match/);
    expect(validateOrganizationUpload("image/svg+xml", text.length, text)).toMatch(/valid SVG|match/);
  });
});
