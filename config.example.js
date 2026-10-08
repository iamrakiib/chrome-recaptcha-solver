const ALLOWED_DOMAIN = "google.com";
const TWOCAPTCHA_API_KEY = "YOUR_2CAPTCHA_API_KEY";

const CONFIG = {
  ALLOWED_DOMAIN,
  TWOCAPTCHA_API_KEY,
  POLL_INTERVAL_MS: 8000,      // 8 seconds between polls
  MAX_POLL_ATTEMPTS: 60,       // 60 * 8 = 8 minutes
  RECAPTCHA_V3_DEFAULT_ACTION: "submit",
  RECAPTCHA_V3_MIN_SCORE: 0.3,
  AUTO_SUBMIT_FORM: true       // <-- NOW DEFINED
};