import crypto from "node:crypto";
import { kvGet, kvSet, log } from "./_lib.js";

const MAX_AGE_MS = 10 * 60 * 1000; // commands older than this are never run (phone was offline)

function valid(req){
  const got=String(req.headers["x-device-token"]||"");
  const want=String(process.env.DEVICE_TOKEN||"");
  if(!got||!want) return false;
  const a=Buffer.from(got),b=Buffer.from(want);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

export default async function handler(req,res){
  if(!valid(req)) return res.status(401).json({error:"Invalid device token."});

  if(req.method==="GET"){
    const q=await kvGet("device_queue",[]);
    const now=Date.now();
    let changed=false;
    for(const x of q){
      if(x.status==="pending"&&now-(x.createdAt||0)>MAX_AGE_MS){ x.status="failed"; x.result="expired (phone was offline)"; x.finishedAt=now; changed=true; }
    }
    if(changed) await kvSet("device_queue",q);
    // oldest first, so multi-step jobs (open app -> tap -> type) run in the order they were spoken
    const pending=q.filter(x=>x.status==="pending").sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)).slice(0,5);
    return res.status(200).json({commands:pending});
  }

  if(req.method==="POST"){
    const {id,status,result}=req.body||{};
    if(!id||!["done","failed"].includes(status)) return res.status(400).json({error:"id and status are required."});
    const q=await kvGet("device_queue",[]);
    const item=q.find(x=>x.id===id);
    if(!item) return res.status(404).json({error:"Command not found."});
    item.status=status; item.result=result||null; item.finishedAt=Date.now();
    await kvSet("device_queue",q.slice(0,80));
    await log(`Device command ${status}: ${item.command}${result?" - "+String(result).slice(0,80):""}`,"device");
    return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:"Method not allowed."});
}
