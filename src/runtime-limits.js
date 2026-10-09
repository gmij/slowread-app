// Operational settings live in Worker variables; defaults support local development.
export const LIMIT_DEFAULTS={TRANSLATION_DAILY_CHARACTERS:600000,LEARNING_GUEST_DAILY_LIMIT:50,LEARNING_ACCOUNT_DAILY_LIMIT:200,TRANSLATION_MAX_CONCURRENT:2,SEARCH_INTENT_BUDGET_CHARACTERS:1000,EMAIL_DAILY_LIMIT:90,EMAIL_MONTHLY_LIMIT:2800,EMAIL_ACCOUNT_DAILY_LIMIT:3};
export function runtimeLimit(env,name){
 const raw=env[name]??LIMIT_DEFAULTS[name];
 if(typeof raw==='string'&&!/^\d+$/.test(raw))throw Error('额度配置无效');
 const value=Number(raw);if(!Number.isSafeInteger(value)||value<0)throw Error('额度配置无效');return value;
}
