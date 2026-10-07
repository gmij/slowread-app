export function setupAccountUi({api,user,providers}){
 const $=id=>document.getElementById(id);
 for(const provider of ['github','google','apple']){$('login-'+provider).disabled=!providers[provider];$('login-'+provider).onclick=()=>location.assign('/api/auth/'+provider+'/start')}
 $('closeLogin').onclick=()=>$('loginDialog').close();$('closeEmail').onclick=()=>$('emailDialog').close();
 const showLogin=()=>$('loginDialog').showModal();
 const showEmail=()=>{if(!user){showLogin();return}$('contactEmail').value=user.email||'';$('emailStatus').textContent=providers.emailVerification?'确认联系邮箱后，输入收到的六位验证码。':'邮箱验证暂未开放，请稍后再试。';$('sendEmailCode').disabled=!providers.emailVerification;$('verifyEmailCode').disabled=!providers.emailVerification;$('emailDialog').showModal()};
 $('requestLogin').onclick=showLogin;
 $('sendEmailCode').onclick=async()=>{const button=$('sendEmailCode');button.disabled=true;$('emailStatus').textContent='正在发送验证码…';try{await api('/auth/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('contactEmail').value.trim()})});$('emailStatus').textContent='验证码已发送，十分钟内有效。请检查收件箱和垃圾邮件。'}catch(e){$('emailStatus').textContent=e.message}finally{button.disabled=!providers.emailVerification}};
 $('emailForm').onsubmit=async e=>{e.preventDefault();$('verifyEmailCode').disabled=true;try{await api('/auth/email/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('emailCode').value.trim()})});location.assign('/')}catch(e){$('emailStatus').textContent=e.message;$('verifyEmailCode').disabled=false}};
 if(user){const button=document.createElement('button');button.textContent=user.emailVerified?'联系邮箱已验证':'验证联系邮箱';button.onclick=showEmail;document.querySelector('.header-actions').append(button);if(!user.emailVerified&&(user.provider!=='github'||providers.emailVerification))showEmail()}
 return {showLogin,showEmail};
}
