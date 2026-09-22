import { describe, expect, it, vi, afterEach } from "vitest";
import { SignJWT } from "jose";

const SECRET = "secreto-de-prueba-de-al-menos-32-chars";

vi.mock("./env", () => ({ getEnv: () => ({ JWT_SECRET: SECRET }) }));

const { signGroupToken, verifyGroupToken, extractBearerToken, TOKEN_TTL_SECONDS } =
  await import("./jwt");

const key = new TextEncoder().encode(SECRET);
const claims = { sub: "g02_transferencias", usuarioId: 42, grupo: 2, curso: 1 };

afterEach(() => {
  vi.useRealTimers();
});

describe("signGroupToken / verifyGroupToken", () => {
  it("round-trips the claims", async () => {
    const { token, expiresIn } = await signGroupToken(claims);

    expect(expiresIn).toBe(TOKEN_TTL_SECONDS);
    await expect(verifyGroupToken(token)).resolves.toEqual(claims);
  });

  it("returns null for a token signed with another secret", async () => {
    const otro = await new SignJWT({ usuarioId: 42, grupo: 2, curso: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("g02_transferencias")
      .setIssuer("aiquaa-sandbox")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode("otro-secreto-igual-de-largo-32-ch"));

    await expect(verifyGroupToken(otro)).resolves.toBeNull();
  });

  it("returns null when the payload was tampered with", async () => {
    const { token } = await signGroupToken(claims);
    const [header, payload, signature] = token.split(".");
    const alterado = JSON.parse(Buffer.from(payload, "base64url").toString());
    alterado.grupo = 7;
    const payloadFalso = Buffer.from(JSON.stringify(alterado)).toString("base64url");

    await expect(verifyGroupToken(`${header}.${payloadFalso}.${signature}`)).resolves.toBeNull();
  });

  // Alg confusion: verifyGroupToken fija algorithms: ["HS256"], asi que un
  // token sin firma no pasa aunque su header lo declare valido.
  it("returns null for an unsigned alg:none token", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({ sub: "g02_transferencias", grupo: 2, curso: 1, usuarioId: 42 }),
    ).toString("base64url");

    await expect(verifyGroupToken(`${header}.${payload}.`)).resolves.toBeNull();
  });

  it("returns null once the token has expired", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const { token } = await signGroupToken(claims);

    vi.setSystemTime(new Date("2026-01-01T00:59:00Z"));
    await expect(verifyGroupToken(token)).resolves.toEqual(claims);

    vi.setSystemTime(new Date("2026-01-01T01:00:01Z"));
    await expect(verifyGroupToken(token)).resolves.toBeNull();
  });

  it("returns null for an issuer we did not mint", async () => {
    const ajeno = await new SignJWT({ usuarioId: 42, grupo: 2, curso: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("g02_transferencias")
      .setIssuer("otro-emisor")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    await expect(verifyGroupToken(ajeno)).resolves.toBeNull();
  });

  it("returns null when a required claim is missing or the wrong type", async () => {
    const incompleto = await new SignJWT({ usuarioId: "42", grupo: 2, curso: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("g02_transferencias")
      .setIssuer("aiquaa-sandbox")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key);

    await expect(verifyGroupToken(incompleto)).resolves.toBeNull();
  });

  it("returns null for garbage", async () => {
    await expect(verifyGroupToken("no-es-un-jwt")).resolves.toBeNull();
    await expect(verifyGroupToken("")).resolves.toBeNull();
  });
});

describe("extractBearerToken", () => {
  it.each([
    ["Bearer abc.def.ghi", "abc.def.ghi"],
    ["bearer abc.def.ghi", "abc.def.ghi"],
    ["BEARER abc.def.ghi", "abc.def.ghi"],
  ])("accepts %s regardless of case", (header, expected) => {
    expect(extractBearerToken(new Headers({ authorization: header }))).toBe(expected);
  });

  it.each([
    ["Basic dXNlcjpwYXNz", "otro esquema"],
    ["Bearer", "sin valor"],
    ["Bearer   ", "solo espacios"],
    ["abc.def.ghi", "sin esquema"],
  ])("rejects %s (%s)", (header) => {
    expect(extractBearerToken(new Headers({ authorization: header }))).toBeNull();
  });

  it("returns null when the header is absent", () => {
    expect(extractBearerToken(new Headers())).toBeNull();
  });
});
