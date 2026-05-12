/**
 * Delta Gestão Pública — Cloudflare Worker (Backend Brasil)
 * Consulta o portal TCE-RS a partir de nós da Cloudflare no Brasil (GRU).
 */

const TCERS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
};

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Bypass-Tunnel-Reminder'
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
}

// ── Roteador principal ────────────────────────────────────────────────────────
export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const { pathname, searchParams } = url;

        if (pathname === '/api/health') {
            return json({ status: 'ok', region: 'cloudflare-gru' });
        }

        if (pathname === '/api/pad-deadline') {
            return handleDeadline(searchParams);
        }

        if (pathname === '/api/pad-status') {
            return handlePadStatus(searchParams);
        }

        if (pathname === '/api/pad-status-batch') {
            return handlePadStatusBatch(request);
        }

        return new Response('Not Found', { status: 404 });
    }
};

// ── /api/pad-deadline ─────────────────────────────────────────────────────────
async function handleDeadline(params) {
    const ano = parseInt(params.get('ano'));
    const mes = parseInt(params.get('mes'));
    if (!ano || !mes) return json({ error: 'Parâmetros obrigatórios: ano e mes.' }, 400);

    let deadline = null;
    let source = 'formula';

    try {
        deadline = await fetchDeadlineFromAgendaTCERS(ano, mes);
        if (deadline) source = 'tcers';
    } catch (e) {}

    if (!deadline) {
        deadline = computeDeadlineFormula(ano, mes);
    }

    return json({ ano, mes, deadline: formatDateBR(deadline), source });
}

// ── /api/pad-status ───────────────────────────────────────────────────────────
async function handlePadStatus(params) {
    const orgao = params.get('orgao');
    const ano = params.get('ano');
    const mes = params.get('mes');

    if (!orgao || !ano) return json({ error: 'Parâmetros orgao e ano são obrigatórios.' }, 400);

    try {
        const url = `https://portal.tce.rs.gov.br/pcdi2/relatorios-recibos-envio.action?&cdOrgao=${orgao}&ano=${ano}`;
        const response = await fetchWithTimeout(url, { headers: TCERS_HEADERS }, 25000);

        if (!response.ok) return json({ error: 'Falha ao consultar TCE-RS', code: response.status }, 502);

        const html = await response.text();
        const result = parsePadStatus(html, orgao, ano, mes ? parseInt(mes) : null);
        return json(result);
    } catch (err) {
        return json({ error: 'Timeout ou erro de conexão com TCE-RS', message: err.message }, 503);
    }
}

// ── /api/pad-status-batch ─────────────────────────────────────────────────────
async function handlePadStatusBatch(request) {
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Body JSON inválido.' }, 400); }

    const { orgaos, ano, mes } = body;
    if (!orgaos || !ano) return json({ error: 'Parâmetros orgaos[] e ano são obrigatórios.' }, 400);

    const results = {};
    const CONCURRENCY = 15; // Workers têm limite de conexões simultâneas

    for (let i = 0; i < orgaos.length; i += CONCURRENCY) {
        const chunk = orgaos.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(async (orgao) => {
            try {
                const url = `https://portal.tce.rs.gov.br/pcdi2/relatorios-recibos-envio.action?&cdOrgao=${orgao}&ano=${ano}`;
                const response = await fetchWithTimeout(url, { headers: TCERS_HEADERS }, 22000);
                if (!response.ok) { results[orgao] = { orgao, status: 'pending' }; return; }
                const html = await response.text();
                results[orgao] = parsePadStatus(html, orgao, ano, mes ? parseInt(mes) : null);
            } catch (e) {
                results[orgao] = { orgao, status: 'pending' };
            }
        }));
    }

    return json(results);
}

// ── Fetch com timeout via AbortController ────────────────────────────────────
async function fetchWithTimeout(url, options = {}, ms = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ── Parsing do HTML TCE-RS ────────────────────────────────────────────────────
function parsePadStatus(html, orgao, ano, mes) {
    const startIdx = html.indexOf('Sistema Informatizado de Auditoria e Prestação de Contas');
    const endIdx = html.indexOf('Informações Complementares');

    let padSection = '';
    if (startIdx !== -1) {
        padSection = (endIdx !== -1 && endIdx > startIdx)
            ? html.substring(startIdx, endIdx)
            : html.substring(startIdx);
    }

    const receiptLinks = [];
    const reReceipt = /imprimir-recibo\/(\d+)/g;
    let sentDateStr = null;

    if (!mes) {
        let match;
        while ((match = reReceipt.exec(padSection)) !== null) receiptLinks.push(match[1]);
    } else {
        const rows = padSection.split(/<tr[^>]*>/i);
        const monthStrEncoded = `${mes}&ordm; m&ecirc;s/${ano}`;
        const monthStrPlain = `${mes}º mês/${ano}`;

        rows.forEach(row => {
            if (row.includes(monthStrEncoded) || row.includes(monthStrPlain)) {
                const subMatch = row.match(/imprimir-recibo\/(\d+)/);
                if (subMatch) {
                    receiptLinks.push(subMatch[1]);
                    const cols = row.split(/<td[^>]*>/i);
                    if (cols.length >= 4) {
                        const dateText = cols[3].split('</td>')[0].trim();
                        if (dateText.match(/\d{2}\/\d{2}\/\d{4}/)) sentDateStr = dateText;
                    }
                }
            }
        });
    }

    let status = receiptLinks.length > 0 ? 'on-time' : 'pending';

    if (status === 'on-time' && sentDateStr && mes) {
        const deadline = computeDeadlineFormula(parseInt(ano), parseInt(mes));
        const [day, month, rest] = sentDateStr.split('/');
        const year = rest.split(' ')[0];
        const sentDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        if (sentDate > deadline) status = 'late';
    }

    return { orgao, ano, mes, status, sentDate: sentDateStr, sentReceipts: receiptLinks, consultedAt: new Date().toISOString() };
}

// ── Prazo: último dia do mês + 30, desliza fim de semana para segunda ─────────
function computeDeadlineFormula(ano, mes) {
    const lastDay = new Date(ano, mes, 0);
    const d = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 30);
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() + 2);
    if (dow === 0) d.setDate(d.getDate() + 1);
    return d;
}

function formatDateBR(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── Agenda TCE-RS ─────────────────────────────────────────────────────────────
async function fetchDeadlineFromAgendaTCERS(ano, mes) {
    const mesNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const mesName = mesNames[mes - 1];

    for (let offset = 1; offset <= 2; offset++) {
        const calMes = ((mes - 1 + offset) % 12) + 1;
        const calAno = mes + offset > 12 ? ano + 1 : ano;
        const url = `https://tcers.tc.br/agenda-tce/?section=compromissos&mes=${calMes}&ano=${calAno}`;

        try {
            const response = await fetchWithTimeout(url, { headers: TCERS_HEADERS }, 8000);
            if (!response.ok) continue;
            const html = await response.text();
            const date = parseSiapcDeadline(html, mesName, ano, calAno, calMes);
            if (date) return date;
        } catch (e) { continue; }
    }
    return null;
}

function parseSiapcDeadline(html, mesName, anoRef, calAno, calMes) {
    const lower = html.toLowerCase();
    let searchFrom = 0;

    while (true) {
        const siapcIdx = lower.indexOf('siapc', searchFrom);
        if (siapcIdx === -1) break;

        const ctx = html.substring(Math.max(0, siapcIdx - 400), siapcIdx + 800);
        const ctxLower = ctx.toLowerCase();

        if (ctxLower.includes(mesName.toLowerCase()) && ctxLower.includes(String(anoRef))) {
            const isoMatch = ctx.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));

            const brMatch = ctx.match(/(\d{1,2})\/(\d{2})\/(\d{4})/);
            if (brMatch) return new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));

            const dayMatch = ctx.match(/>(\d{1,2})<\/(?:td|div|span|a)/);
            if (dayMatch) {
                const day = parseInt(dayMatch[1]);
                if (day >= 1 && day <= 31) return new Date(calAno, calMes - 1, day);
            }
        }

        searchFrom = siapcIdx + 1;
    }
    return null;
}
