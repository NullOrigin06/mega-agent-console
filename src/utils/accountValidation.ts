// Mirrors mega-agent-api's Services/AccountValidation.cs so mock mode
// enforces the same signup rules as the real backend - without this, a demo
// running in mock mode (e.g. the public Vercel deployment, which has no real
// API to talk to) would silently accept disposable emails and weak
// passwords that the real API rejects, making the backend hardening
// invisible wherever mock mode is what's actually deployed.

const EMAIL_FORMAT_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Trimmed subset of mega-agent-api's Services/DisposableEmailDomains.cs -
// the most common providers, kept short since this duplicate list only
// needs to make the mock demo's behavior recognizable as "the same rule",
// not byte-for-byte identical to the server's authoritative list.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com", "mailinator.net", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "sharklasers.com", "10minutemail.com", "10minutemail.net",
  "20minutemail.com", "temp-mail.org", "tempmail.com", "tempmail.net",
  "yopmail.com", "yopmail.fr", "yopmail.net", "trashmail.com", "trashmail.net",
  "throwawaymail.com", "fakeinbox.com", "fakemailgenerator.com", "dispostable.com",
  "maildrop.cc", "getnada.com", "mytemp.email", "emailondeck.com", "mintemail.com",
  "mohmal.com", "mailnesia.com", "mailcatch.com", "discard.email", "discardmail.com",
  "burnermail.io", "dropmail.me", "emailfake.com", "email-fake.com",
  "wegwerfmail.de", "wegwerfmail.net", "33mail.com", "mailsac.com", "1secmail.com",
]);

// Mirrors mega-agent-api's Services/CommonWeakPasswords.cs.
const COMMON_WEAK_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789", "1234567890",
  "qwerty123", "qwertyuiop", "letmein123", "welcome123", "admin1234", "iloveyou1",
  "sunshine1", "princess1", "football1", "baseball1", "dragon123", "monkey123",
  "abc123456", "trustno1", "superman1", "master123", "hello1234", "freedom123",
  "whatever1", "qazwsx123", "passw0rd", "p@ssw0rd", "p@ssword", "changeme123",
  "letmein", "welcome1", "admin123", "root12345", "test12345", "12345678910",
  "1qaz2wsx3edc", "zaq1zaq1", "asdfghjkl", "1q2w3e4r5t", "aaaaaaaa", "11111111",
  "00000000", "87654321", "starwars1", "michael123", "jennifer1", "computer1",
  "internet1", "1234abcd", "abcd1234", "qwer1234", "pass1234", "mypassword",
]);

export function validateEmail(email: string | undefined | null): { normalized: string; error: string | null } {
  const trimmed = (email ?? "").trim();
  if (!trimmed) {
    return { normalized: "", error: "A valid email address is required." };
  }
  if (trimmed.length > 254 || !EMAIL_FORMAT_REGEX.test(trimmed)) {
    return { normalized: "", error: "Enter a valid email address." };
  }

  const normalized = trimmed.toLowerCase();
  const domain = normalized.slice(normalized.indexOf("@") + 1);
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      normalized: "",
      error: "Disposable or temporary email addresses aren't allowed. Please use a permanent email address.",
    };
  }

  return { normalized, error: null };
}

export function validatePassword(password: string | undefined | null): string | null {
  if (!password || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 256) {
    return "Password is too long.";
  }
  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    return "That password is too common. Please choose a stronger, less guessable password.";
  }
  return null;
}
