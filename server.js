import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 🔐 Telegram ENV
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

// ================= MEMORY =================
let memory = {
  lastPeriod: "",
  history: [],        // {period, number, bs}
  accuracy: { win:0, loss:0 },
  breakerSplit: { Big:0, Small:0 }
};

// ================= TELEGRAM =================
async function sendTG(msg){
  await axios.post(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    { chat_id: TG_CHAT_ID, text: msg }
  );
}

// ================= RESTORE =================
async function restoreFromTelegram(){
  try{
async function fetchWingo() {
  try {
    const r = await axios.get(API);
    const item = r.data?.data?.list?.[0];
    if (!item) return;

    const period = item.issueNumber;
    const number = Number(item.number);

    if (memory.lastPeriod === period) return;

    const bs = number >= 5 ? "Big" : "Small";

    const a = analyze();
    if (a.prediction !== "WAIT") {
      if (a.prediction === bs) memory.accuracy.win++;
      else memory.accuracy.loss++;
    }

    memory.lastPeriod = period;
    memory.history.push({ period, number, bs });

    if (!memory.prevBS) memory.prevBS = bs;
    if (memory.prevBS !== bs) {
      memory.breakerSplit[bs]++;
      memory.prevBS = bs;
    }

    sendTG(`${period}|${number}|${bs}`);
    console.log("Auto fetch:", period, number, bs);
  } catch (e) {
    console.log("Fetch error");
  }
}

// ================= ANALYSIS =================
function analyze(){
  const h = memory.history;
  if(h.length < 2){
    return { signal:"WAIT", prediction:"WAIT", strength:0 };
  }

  // streak count
  let count=1;
  for(let i=h.length-1;i>0;i--){
    if(h[i].bs===h[i-1].bs) count++;
    else break;
  }

  const last = h[h.length-1].bs;

  // strength score (advanced)
  const strength = Math.min(100, count * 20);

  if(count >= 4){
    return { signal:"BREAKER", prediction:"WAIT", strength };
  }
  if(count === 3){
    // breaker split
    memory.breakerSplit[last]++;
    return {
      signal:"BREAK",
      prediction: last==="Big"?"Small":"Big",
      strength
    };
  }
  return {
    signal:"STABLE",
    prediction:last,
    strength
  };
}

// ================= RECEIVE FROM HTML =================
app.post("/push",(req,res)=>{
  const { period, number } = req.body;
  if(!period && number===undefined) return res.json({ok:false});

  if(memory.lastPeriod === period){
    return res.json({ok:false,dup:true});
  }

  const bs = number>=5?"Big":"Small";
  memory.lastPeriod = period;

  // accuracy check (previous prediction)
  const a = analyze();
  if(a.prediction!=="WAIT"){
    if(a.prediction === bs) memory.accuracy.win++;
    else memory.accuracy.loss++;
  }

  memory.history.push({period, number, bs});

  sendTG(`${period}|${number}|${bs}`);
  res.json({ok:true});
});

// ================== STATE API (FOR HTML) ==================
app.get("/state", (req, res) => {
  const total = memory.accuracy.win + memory.accuracy.loss;
  const acc = total
    ? Math.round((memory.accuracy.win / total) * 100)
    : 0;

  res.json({
    history: memory.history.slice(-30),
    signal: memory.signal || "-",
    prediction: memory.prediction || "WAIT",
    strength: memory.strength || 0,
    accuracy: acc,
    breakerSplit: memory.breakerSplit || { Big: 0, Small: 0 }
  });
});

// ================= START =================
setInterval(fetchWingo, 5000);

app.listen(PORT, async () => {
  console.log("Server running on", PORT);
  await restoreFromTelegram();
});
