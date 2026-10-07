export const languageNames={'zh-CN':'简体中文',en:'English'};
export function supportedLanguage(value){const base=String(value||'').toLowerCase().split('-')[0];return base==='zh'?'zh-CN':base==='en'?'en':null}
export function resolveLanguage({userPreference,linkLanguage,savedPreference,browserLanguages=[]}={}){
 for(const value of [userPreference,linkLanguage,savedPreference]){const target=supportedLanguage(value);if(target)return target}
 for(const value of browserLanguages){const target=supportedLanguage(value);if(target)return target}
 return 'en';
}
