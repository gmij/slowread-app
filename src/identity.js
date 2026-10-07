export const validAccountId=id=>typeof id==='string'&&/^(github:[0-9]+|(?:google|apple):[A-Za-z0-9._-]{1,200})$/.test(id);
