import crypto from "node:crypto";
import { kvGet, kvSet, log } from "./_lib.js";

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
    return res.status(200).json({commands:q.filter(x=>x.status==="pending").slice(0,5)});
  }

  if(req.method==="POST"){
    const {id,status,result}=req.body||{};
    if(!id||!["done","failed"].includes(status)) return res.status(400).json({error:"id and status are required."});
    const q=await kvGet("device_queue",[]);
    const item=q.find(x=>x.id===id);
    if(!item) return res.status(404).json({error:"Command not found."});
    item.status=status; item.result=result||null; item.finishedAt=Date.now();
    await kvSet("device_queue",q.slice(0,80));
    await log(`Device command ${status}: ${item.command}`,"device");
    return res.status(200).json({ok:true});
  }
  return res.status(405).json({error:"Method not allowed."});
}
