const fs = require('fs');
const html = fs.readFileSync('pad_test.html', 'utf8');

const mes = 1;
const ano = 2026;

const sections = html.split(/<h[34][^>]*>/i);
let padSection = '';
for (let i = 0; i < sections.length; i++) {
    if (sections[i].includes('Auditoria e Prestação de Contas') && 
        !sections[i].includes('Informações Complementares')) {
        padSection = sections[i]; // FIX: it's IN this section!
        break;
    }
}

const rows = padSection.split(/<tr[^>]*>/i);
const monthStrEncoded = `${mes}&ordm; m&ecirc;s/${ano}`;
const monthStrPlain = `${mes}º mês/${ano}`;

console.log(`Looking for: ${monthStrEncoded} in padSection size ${padSection.length}`);
console.log(`Found rows: ${rows.length}`);

let found = false;
let receiptLinks = [];
rows.forEach((row, i) => {
    if (row.includes(monthStrEncoded) || row.includes(monthStrPlain)) {
        found = true;
        const subMatch = row.match(/imprimir-recibo\/(\d+)/);
        if (subMatch) receiptLinks.push(subMatch[1]);
    }
});

console.log("ReceiptLinks:", receiptLinks);

// If no month is specified, what happens? Let's assume mes = null.
let receiptLinksAll = [];
const reReceipt = /imprimir-recibo\/(\d+)/g;
let match;
while ((match = reReceipt.exec(padSection)) !== null) {
    receiptLinksAll.push(match[1]);
}
console.log("All Links:", receiptLinksAll);
