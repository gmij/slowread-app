export const MODEL='@cf/meta/m2m100-1.2b';
export const languages={'zh-CN':'zh','ja':'ja'};
const translations=new Map();
export function quote(paragraphs,target,enabled){
 if(!languages[target])throw new Error('暂不支持此目标语言');
 const characters=paragraphs.reduce((n,p)=>n+p.text.length,0);
 const inputTokens=Math.ceil(characters/3),outputTokens=Math.ceil(inputTokens*1.5);
 return {target,paragraphs:paragraphs.length,characters,inputTokens,outputTokens,estimatedProviderCostUsd:Number(((inputTokens+outputTokens)*0.342/1000000).toFixed(6)),readerPriceUsd:0,model:MODEL,available:enabled,pricingBasis:'按每百万输入/输出 token 各 $0.342 粗估，实际分词及输出长度会不同。试用向读者收费 0 元。',scope:'仅当前章节',maximumCharacters:50000};
}
export function chunks(text){
 const result=[];let remaining=text;
 while(remaining.length>600){let end=remaining.lastIndexOf(' ',600);if(end<200)end=600;result.push(remaining.slice(0,end));remaining=remaining.slice(end).trimStart();}if(remaining)result.push(remaining);return result;
}
export async function translateParagraph(text,target,ai){
 if(!languages[target])throw new Error('暂不支持此目标语言');
 if(!text||text.length>12000)throw new Error('段落过长，请改用原文阅读');
 const key=target+':'+text;const cached=translations.get(key);if(cached&&cached.expires>Date.now())return {text:cached.text,cached:true};
 const output=[];
 for(const part of chunks(text)){const r=await ai.run(MODEL,{text:part,source_lang:'en',target_lang:languages[target]});if(typeof r?.translated_text!=='string'||!r.translated_text.trim())throw new Error('翻译服务未返回有效文本');output.push(r.translated_text.trim());}
 const translated=output.join(' ');if(translations.size>=500)translations.delete(translations.keys().next().value);translations.set(key,{text:translated,expires:Date.now()+3600000});return {text:translated,cached:false};
}
