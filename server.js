import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

/* ================= CONFIG ================= */
const API =
  "https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

const TG_BOT_TOKEN = process.env.8297180938:AAHmCdIYnuf2vfidz3wfJXHAOZ9rE5J-lhk;
const TG_CHAT_ID   = process.env.8455379007;

/* ================= MEMORY ================= */
let memory = {
  lastPeriod: "",
  history: [] // { period, number, bs, time }
};

let countdown = 30;

/* ================= HELPERS ================= */
const bigSmall = (n) => (n >= 5 ? "Big" : "Small");

async function sendTelegram(text) {
  await axios.post(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    { chat_id: TG_CHAT_ID, text }
  );
}

/* ================= RESTORE FROM TELEGRAM ================= */
async function restoreFromTelegram() {
  const res = await axios.get(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/getUpdates`
  );
  const updates = res.data.result || [];

  updates.forEach(u => {
    const t = u.message?.text || "";
    const m = t.match(/^(\d+)\|(\d+)\|(Big|Small)\|(\d+)/);
    if (!m) return;

    if (memory.history.find(x => x.period === m[1])) return;

    memory.history.push({
      period: m[1],
      number: +m[2],
      bs: m[3],
      time: +m[4]
    });

    memory.lastPeriod = m[1];
  });

  console.log("🔁 Telegram memory restored:", memory.history.length);
}

/* ================= ANALYSIS ================= */
function analyse() {
  const bsArr = memory.history.map(x => x.bs === "Big" ? "B" : "S");

  let stable = 0;
  let activePattern = "";

  for (let i = 3; i < bsArr.length; i++) {
    const s = bsArr.slice(i - 3, i + 1).join("");
    if (s === "BSBS" || s === "SBSB") {
      activePattern = "Alternate";
      stable++;
    } else if (s === "BBSS" || s === "SSBB") {
      activePattern = "Dual";
      stable++;
    }
  }

  const strength = activePattern
    ? Math.min(100, Math.floor((stable / 5) * 100))
    : 0;

  let prediction = "WAIT";
  if (strength >= 60 && bsArr.length) {
    prediction = bsArr.at(-1) === "B" ? "Small" : "Big";
  }

  return { activePattern, strength, prediction };
}

/* ================= POLL API ================= */
async function pollAPI() {
  const res = await axios.get(API);
  const latest = res.data.data.list[0];

  if (latest.issueNumber === memory.lastPeriod) return;

  const number = +latest.number;
  const bs = bigSmall(number);
  const time = Date.now();

  memory.history.push({
    period: latest.issueNumber,
    number,
    bs,
    time
  });

  memory.lastPeriod = latest.issueNumber;
  countdown = 30;

  // save raw data to Telegram
  await sendTelegram(
    `${latest.issueNumber}|${number}|${bs}|${time}`
  );

  console.log("🆕 New period saved:", latest.issueNumber);
}

/* ================= SEND FULL TABLE ON START ================= */
async function sendFullTable() {
  if (!memory.history.length) return;

  let msg = "📊 SYSTEM STARTED\nPeriod | Number | Big/Small\n";
  memory.history.slice(-10).forEach(r => {
    msg += `${r.period} | ${r.number} | ${r.bs}\n`;
  });

  await sendTelegram(msg);
}

/* ================= HTML UI ================= */
app.get("/", (req, res) => {
  const a = analyse();
  const rows = memory.history.slice(-10).reverse();

  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Wingo System</title>
<style>
body{margin:0;font-family:Arial;background:#f4f6fb}
.box{background:#fff;padding:10px;text-align:center;font-weight:700;border-bottom:1px solid #ddd}
.timer{color:#ff4d4f;font-size:14px;margin-top:4px}
.header,.row{display:grid;grid-template-columns:2.6fr 1fr 1fr;padding:10px}
.header{background:#ff5b5b;color:#fff}
.row{border-bottom:1px solid #eee}
.big{color:#18b660;font-weight:700}
.small{color:#ff4d4f;font-weight:700}
</style>
</head>
<body>

<div class="box">
Pattern: ${a.activePattern || "None"} |
Strength: ${a.strength}% |
Prediction: ${a.prediction}
<div class="timer">Next round in ${countdown}s</div>
</div>

<div class="header">
  <div>Period</div>
  <div>Number</div>
  <div>Big / Small</div>
</div>

${rows.map(r => `
<div class="row">
  <div>${r.period}</div>
  <div>${r.number}</div>
  <div class="${r.bs === "Big" ? "big" : "small"}">${r.bs}</div>
</div>`).join("")}

</body>
</html>
`);
});

/* ================= START ================= */
(async () => {
  await restoreFromTelegram(); // 🔁 restart learning
  await sendFullTable();       // 📊 full table once

  setInterval(pollAPI, 3000);  // fetch new result
  setInterval(() => {
    countdown--;
    if (countdown < 0) countdown = 0;
  }, 1000);

  app.listen(PORT, () =>
    console.log("🚀 Server running on port", PORT)
  );
})();
