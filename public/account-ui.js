export function setupAccountUi({api,user,providers}){
 const $=id=>document.getElementById(id);
 for(const provider of ['github','google','apple']){$('login-'+provider).disabled=!providers[provider];$('login-'+provider).onclick=()=>location.assign('/api/auth/'+provider+'/start')}
 $('closeLogin').onclick=()=>$('loginDialog').close();$('closeEmail').onclick=()=>$('emailDialog').close();
 const showLogin=()=>$('loginDialog').showModal();
 const showEmail=()=>{if(!user){showLogin();return}$('contactEmail').value=user.email||'';$('emailStatus').textContent=providers.emailVerification?'确认联系邮箱后，输入收到的六位验证码。':'邮箱验证暂未开放，请稍后再试。';$('sendEmailCode').disabled=!providers.emailVerification;$('verifyEmailCode').disabled=!providers.emailVerification;$('emailDialog').showModal()};
 $('requestLogin').onclick=showLogin;
 $('sendEmailCode').onclick=async()=>{const button=$('sendEmailCode');button.disabled=true;$('emailStatus').textContent='正在发送验证码…';try{await api('/auth/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:$('contactEmail').value.trim()})});$('emailStatus').textContent='验证码已发送，十分钟内有效。请检查收件箱和垃圾邮件。'}catch(e){$('emailStatus').textContent=e.message}finally{button.disabled=!providers.emailVerification}};
 $('emailForm').onsubmit=async e=>{e.preventDefault();$('verifyEmailCode').disabled=true;try{await api('/auth/email/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:$('emailCode').value.trim()})});location.assign('/')}catch(e){$('emailStatus').textContent=e.message;$('verifyEmailCode').disabled=false}};
 const center=document.createElement('dialog');center.id='personalCenter';center.innerHTML='<h2>个人中心</h2><p id="profileIdentity"></p><div id="profileActions" class="profile-actions"></div><section><h3>用户权益</h3><p>原文和已有译文免费阅读；登录后可使用云端书架和阅读进度。</p><p>学习翻译：登录账号每天200次，游客每天50次（同一网络共用）。单词、短语或短句均可；命中共享缓存不扣次数，新请求失败也可能计次。</p><p>每天北京时间早上8点恢复；新翻译还受全站每日共享额度限制，不会自动收费。</p><p id="entitlementStatus" role="status"></p><button id="refreshEntitlements" type="button">刷新权益用量</button></section><button id="closePersonalCenter" type="button">关闭</button>';document.body.append(center);
 $('profileIdentity').textContent=user?user.name+' · 已登录':'游客 · 登录后可使用账号权益';
 const email=document.createElement('button');email.textContent=user?.emailVerified?'联系邮箱已验证':'验证联系邮箱';email.onclick=()=>{center.close();showEmail()};$('profileActions').append(email);
 const preferences=$('readingSettings');preferences.textContent='阅读偏好';const openPreferences=preferences.onclick;preferences.onclick=()=>{center.close();openPreferences()};$('profileActions').append(preferences);
 if(user){const logout=document.createElement('button');logout.textContent='退出登录';logout.onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload()};$('profileActions').append(logout)}
 const refresh=async()=>{$('entitlementStatus').textContent='正在读取权益用量…';try{const q=await api('/entitlements');$('entitlementStatus').textContent=`今日学习翻译：已用 ${q.used} / ${q.limit} 次，剩余 ${q.remaining} 次。${q.scope==='account'?'按当前账号计算。':'游客按当前网络计算。'} 全站共享额度剩余 ${q.sharedRemaining} 字符。`}catch(e){$('entitlementStatus').textContent=e.message}};
 $('refreshEntitlements').onclick=refresh;$('closePersonalCenter').onclick=()=>center.close();const settings=document.createElement('button');settings.id='openPersonalCenter';settings.textContent=user?user.name+' · 设置':'设置';settings.onclick=()=>{center.showModal();refresh()};document.querySelector('.header-actions').append(settings);
 if(user&&!user.emailVerified&&(user.provider!=='github'||providers.emailVerification))showEmail();
 return {showLogin,showEmail};
}
