import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ================== TELEGRAM ==================
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID  = process.env.TG_CHAT_ID;

// ================== MEMORY ==================
let memory = {
  lastPeriod: "",
  history: [],
  accuracy: { win: 0, loss: 0 },
  breakerSplit: { Big: 0, Small: 0 },
  signal: "-",
  prediction: "WAIT",
  strength: 0
};

// ================== HELPERS ==================
const bigSmall = n => (n >= 5 ? "Big" : "Small");

async function sendTG(msg){
  if(!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  await axios.post(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    { chat_id: TG_CHAT_ID, text: msg }
  );
}

// ================== RESTORE ==================
async function restoreFromTelegram(){
  try{
    const res = await axios.get(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/getUpdates`
    );

    res.data.result.forEach(u=>{
      const t = u.message?.text || "";
      const m = t.match(/^(\d+)\|(\d+)\|(Big|Small)$/);
      if(!m) return;

      if(memory.history.find(x=>x.period===m[1])) return;

      memory.history.push({
        period:m[1],
        number:+m[2],
        bs:m[3]
      });
      memory.lastPeriod = m[1];
    });
  }catch(e){
    console.log("Telegram restore failed");
  }
}

// ================== ANALYSIS ==================
function analyze(){
  const h = memory.history;
  if(h.length < 6){
    memory.signal = "-";
    memory.prediction = "WAIT";
    memory.strength = 0;
    return;
  }

  const last = h.slice(-5).map(x=>x.bs);
  const same = last.every(v=>v===last[0]);

  if(same){
    memory.signal = "STABLE";
    memory.prediction = last[0];
    memory.strength = 80;
  }else{
    memory.signal = "BREAK";
    memory.prediction = last[4]==="Big"?"Small":"Big";
    memory.strength = 65;
    memory.breakerSplit[memory.prediction]++;
  }
}

// ================== AUTO FETCH ==================
async function autoFetch(){
  await restoreFromTelegram();
  analyze();
}
setInterval(autoFetch,5000);

// ================== API ==================
app.get("/state",(req,res)=>{
  const total = memory.accuracy.win + memory.accuracy.loss;
  const acc = total ? Math.round((memory.accuracy.win/total)*100):0;

  res.json({
    history: memory.history.slice(-30),
    signal: memory.signal,
    prediction: memory.prediction,
    strength: memory.strength,
    accuracy: acc,
    breakerSplit: memory.breakerSplit
  });
});

app.get("/",(req,res)=>{
  res.send("Wingo backend running ✅");
});

// ================== START ==================
app.listen(PORT, async ()=>{
  console.log("Server running on",PORT);
  await restoreFromTelegram();
});
