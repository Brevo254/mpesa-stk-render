// server.js
const express = require("express");
const axios = require("axios");
const moment = require("moment-timezone");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// ---- Environment (set these in Render, NOT here) ----
const AUTH_URL = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const STK_PUSH_URL = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

// Helpers
async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${key}:${secret}`).toString("base64");
  const resp = await axios.get(AUTH_URL, { headers: { Authorization: `Basic ${auth}` } });
  return resp.data.access_token;
}

function generatePassword() {
  const shortcode = process.env.MPESA_SHORTCODE || "174379";
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = moment().tz("Africa/Nairobi").format("YYYYMMDDHHmmss");
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");
  return { password, timestamp };
}

function formatPhone(p) {
  let msisdn = String(p).trim();
  if (msisdn.startsWith("0")) msisdn = "254" + msisdn.slice(1);
  return msisdn;
}

// Routes
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.post("/stkpush", async (req, res) => {
  try {
    const { phone, amount } = req.body || {};
    if (!phone || !amount) return res.status(400).json({ error: "Provide phone and amount" });

    const token = await getAccessToken();
    const { password, timestamp } = generatePassword();

    const shortcode = process.env.MPESA_SHORTCODE || "174379";
    const callbackUrl = process.env.MPESA_CALLBACK_URL || "https://mpesa-stk-render.onrender.com";
    const msisdn = formatPhone(phone);

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Number(amount),
      PartyA: msisdn,
      PartyB: shortcode,
      PhoneNumber: msisdn,
      CallBackURL: callbackUrl,
      AccountReference: "PDFBUKS",
      TransactionDesc: `Payment of ${amount}`
    };

    const stkResp = await axios.post(STK_PUSH_URL, payload, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    });

    res.json(stkResp.data);
  } catch (err) {
    console.error("STK Push Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Receive M-Pesa callbacks here (point your MPESA_CALLBACK_URL to this path)
app.post("/mpesa-callback", (req, res) => {
  console.log("📥 M-Pesa Callback:", JSON.stringify(req.body));
  // You could parse & save to a DB here. For now, just log & acknowledge.
  res.status(200).json({ received: true });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Listening on ${PORT}`));
