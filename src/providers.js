// Provider describes the adapter; origin describes the edition namespace.
export const providers=Object.freeze([
 {id:'gutenberg-catalog',origin:'gutenberg',name:'Project Gutenberg 官方目录',enabled:true,priority:100,capabilities:{metadata:true,search:true,fullText:true,incrementalSync:true},adapter:'csv+rdf'},
 {id:'gutendex',origin:'gutenberg',name:'Gutendex',enabled:false,priority:50,capabilities:{metadata:true,search:true,fullText:false,incrementalSync:false},adapter:'json'}
]);
export function editionIdentity(providerId,externalId){const provider=providers.find(p=>p.id===providerId);if(!provider||externalId==null||!String(externalId).trim()||String(externalId).length>200||/[\x00-\x1f]/.test(String(externalId)))throw Error('书源标识无效');return `${provider.origin}:${String(externalId).trim()}`}
export function legacyIdentity(edition){const m=/^gutenberg:([1-9]\d{0,6})$/.exec(edition);if(!m)throw Error('当前阅读器尚不支持此书源');return 'gutenberg-'+m[1]}
