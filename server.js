import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

/* ================= CONFIG ================= */
const PORT = process.env.PORT || 3000;

const ENDPOINT =
"https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json";

const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID  = process.env.TG_CHAT_ID;

/* ================= MEMORY ================= */
let history = [];
let lastPeriod = null;

let accuracy = { win: 0, loss: 0 };
let breakerSplit = { Big: 0, Small: 0 };

let signal = "-";
let prediction = "WAIT";
let strength = 0;

/* ================= TELEGRAM ================= */
async function sendTG(msg) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TG_CHAT_ID, text: msg })
  });
}

/* ================= ANALYSIS ================= */
function analyze() {
  if (history.length < 6) {
    prediction = "WAIT";
    strength = 0;
    signal = "-";
    return;
  }

  const last5 = history.slice(-5).map(x => x.bs);
  const bigCount = last5.filter(x => x === "Big").length;
  const smallCount = last5.length - bigCount;

  if (bigCount >= 4) {
    prediction = "Small";
    signal = "BREAK";
    strength = 80;
  } else if (smallCount >= 4) {
    prediction = "Big";
    signal = "BREAK";
    strength = 80;
  } else {
    prediction = last5[last5.length - 1];
    signal = "STABLE";
    strength = 55;
  }
}

/* ================= FETCH REAL API ================= */
async function fetchWingo() {
  try {
    const res = await fetch(ENDPOINT);
    const data = await res.json();

    const rows = data?.data?.list || [];
    if (!rows.length) return;

    const row = rows[0];
    const period = row.issueNumber;
    const number = Number(row.number);

    if (period === lastPeriod) return;

    const bs = number >= 5 ? "Big" : "Small";

    if (prediction !== "WAIT") {
      prediction === bs ? accuracy.win++ : accuracy.loss++;
    }

    history.push({ period, number, bs });
    if (history.length > 100) history.shift();

    breakerSplit[bs]++;
    lastPeriod = period;

    analyze();

    await sendTG(`${period}|${number}|${bs}`);

  } catch (e) {
    console.log("Fetch error");
  }
}

/* ================= API ================= */
app.get("/", (req, res) => {
  res.send("Wingo backend running ✅");
});

app.get("/state", (req, res) => {
  const total = accuracy.win + accuracy.loss;
  const acc = total ? Math.round((accuracy.win / total) * 100) : 0;

  res.json({
    history: history.slice(-30),
    signal,
    prediction,
    strength,
    accuracy: acc,
    breakerSplit
  });
});

/* ================= AUTO ================= */
setInterval(fetchWingo, 5000);

/* keep-alive */
setInterval(() => {
  fetch("https://wingo-system.onrender.com/state").catch(()=>{});
}, 240000);

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
