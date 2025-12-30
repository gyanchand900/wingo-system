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
    const res = await axios.get(
      `https://api.telegram.org/bot${TG_BOT_TOKEN}/getUpdates`
    );
    const updates = res.data.result || [];

    updates.forEach(u=>{
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

    console.log("Telegram restored:", memory.history.length);
  }catch(e){
    console.log("Restore failed");
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

// ================= SEND TO HTML =================
app.get("/", (req, res) => {
  res.send("Wingo backend running ✅");
});

// ================= START =================
app.listen(PORT, async ()=>{
  console.log("Server running on", PORT);
  await restoreFromTelegram();
});
