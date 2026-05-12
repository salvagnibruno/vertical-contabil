const fs = require('fs');
const html = fs.readFileSync('pad_test.html', 'utf8');

const mes = 1;
const ano = 2026;

const sections = html.split(/<h[34][^>]*>/i);
let padSection = '';
for (let i = 0; i < sections.length; i++) {
    if (sections[i].includes('Auditoria e Prestação de Contas') && 
        !sections[i].includes('Informações Complementares')) {
        if (sections[i + 1]) padSection = sections[i + 1];
        break;
    }
}

const rows = padSection.split(/<tr[^>]*>/i);
const monthStrEncoded = `${mes}&ordm; m&ecirc;s/${ano}`;
const monthStrPlain = `${mes}º mês/${ano}`;

console.log(`Looking for: ${monthStrEncoded}`);
console.log(`Found entries: ${rows.length}`);

let found = false;
rows.forEach((row, i) => {
    if (row.includes(monthStrEncoded) || row.includes(monthStrPlain)) {
        found = true;
        console.log(`Matched row ${i} size ${row.length}`);
        const subMatch = row.match(/imprimir-recibo\/(\d+)/);
        console.log('Sub match:', subMatch ? subMatch[1] : 'None');
    }
});

if (!found) {
    console.log("No row matched the string!");
    console.log("Checking if the string exists anywhere in padSection...", padSection.includes(monthStrEncoded));
    if (!padSection.includes(monthStrEncoded)) {
        const idx = padSection.indexOf('1&ordm;');
        if (idx !== -1) {
            console.log("Found 1&ordm; Context: ", padSection.substring(idx, idx + 50));
        }
    }
}
