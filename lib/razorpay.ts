import Razorpay from "razorpay";

const keyId     = process.env.RAZORPAY_KEY_ID     ?? "";
const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";

if (!keyId || !keySecret) {
  throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env");
}

// Reject placeholder / obviously-invalid keys at startup so the server
// fails fast instead of producing confusing 401s at payment time.
if (!/^rzp_(test|live)_[A-Za-z0-9]{14,}$/.test(keyId)) {
  throw new Error(
    `RAZORPAY_KEY_ID "${keyId}" looks invalid. ` +
    "Get real API keys from https://dashboard.razorpay.com → Settings → API Keys"
  );
}

export const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
export { keyId as RAZORPAY_KEY_ID };
