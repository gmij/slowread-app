export function mailConfigured(env){return env.EMAIL_PROVIDER==='resend'&&!!env.RESEND_API_KEY&&!!env.EMAIL_FROM&&/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(env.EMAIL_FROM)}
export async function sendVerificationEmail(email,code,env,idempotencyKey){
 if(!mailConfigured(env))throw Error('邮箱验证服务尚未配置');
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':idempotencyKey},body:JSON.stringify({from:env.EMAIL_FROM,to:[email],subject:'慢读 · 邮箱验证码',text:`你的慢读验证码是：${code}\n\n10 分钟内有效。若非本人操作，请忽略此邮件。`}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('验证码邮件暂时发送失败，请稍后重试');
 return true;
}
