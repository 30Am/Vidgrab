import { AppError, ErrorCode } from "@vidgrab/shared";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verifies a Cloudflare Turnstile token. When the secret is empty (local dev),
 * verification is skipped. Throws AppError(TURNSTILE_FAILED) on failure.
 */
export async function verifyTurnstile(
  secret: string,
  token: string | undefined,
  remoteIp?: string,
): Promise<void> {
  if (!secret) return; // disabled in local dev

  if (!token) {
    throw new AppError(ErrorCode.TURNSTILE_FAILED);
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  let ok = false;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success?: boolean };
    ok = data.success === true;
  } catch {
    ok = false;
  }

  if (!ok) {
    throw new AppError(ErrorCode.TURNSTILE_FAILED);
  }
}
