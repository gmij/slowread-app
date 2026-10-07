export function originalResponse(book,chapter){
 const sourceLanguage=book.sourceLanguage||'en';
 return {bookId:book.id,id:chapter.id,title:chapter.title,language:sourceLanguage,sourceLanguage,paragraphs:chapter.paragraphs.map(p=>({id:p.id,en:p.text})),source:book.source};
}
