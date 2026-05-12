/**
 * Delta Gestão Pública - Servidor Local PAD
 * Consulta o portal TCE-RS e retorna o status de envio de cada cliente.
 * 
 * Iniciar: node server.js
 * Porta: 3131
 */

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3131;

const TCERS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
};
const TCERS_TIMEOUT = 28000; // 28s — dentro do limite de 30s do Vercel Hobby

app.use(cors());

// Arquivo principal do dashboard (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

// Portal do Colaborador
app.get('/colaborador', (req, res) => {
    res.sendFile(path.join(__dirname, '../index_colaborador.html'));
});

app.use(express.static(path.join(__dirname, '..')));

// Cache em memória para evitar requisições repetidas
const cache = {};

/**
 * GET /api/pad-status?orgao=88023&ano=2026&mes=1
 *  - orgao: código numérico da entidade
 *  - ano: ano de referência
 *  - mes: mês (1-12, 0 = "qualquer mês no ano")
 * 
 * Retorna JSON:
 *   { orgao, ano, mes, status: 'on-time'|'pending', sentReceipts: [...] }
 */
app.get('/api/pad-status', async (req, res) => {
    const { orgao, ano, mes } = req.query;

    if (!orgao || !ano) {
        return res.status(400).json({ error: 'Parâmetros orgao e ano são obrigatórios.' });
    }

    const cacheKey = `${orgao}_${ano}_${mes || 'all'}`;
    /* if (cache[cacheKey]) {
        return res.json(cache[cacheKey]);
    } */

    try {
        const url = `https://portal.tce.rs.gov.br/pcdi2/relatorios-recibos-envio.action?&cdOrgao=${orgao}&ano=${ano}`;
        const response = await fetch(url, { headers: TCERS_HEADERS, timeout: TCERS_TIMEOUT });

        if (!response.ok) {
            return res.status(502).json({ error: 'Falha ao consultar TCE-RS', code: response.status });
        }

        const html = await response.text();
        const result = parsePadStatus(html, orgao, ano, mes ? parseInt(mes) : null);

        // Cache por 30 minutos
        cache[cacheKey] = result;
        setTimeout(() => delete cache[cacheKey], 30 * 60 * 1000);

        res.json(result);
    } catch (err) {
        console.error(`Erro ao consultar orgao ${orgao}:`, err.message);
        res.status(503).json({ error: 'Timeout ou erro de conexão com TCE-RS', message: err.message });
    }
});

/**
 * POST /api/pad-status-batch
 * Body: { orgaos: ["88023","45700",...], ano: "2026", mes: 1 }
 * Retorna status de múltiplas entidades de uma vez.
 */
app.use(express.json());
app.post('/api/pad-status-batch', async (req, res) => {
    const { orgaos, ano, mes } = req.body;
    if (!orgaos || !ano) {
        return res.status(400).json({ error: 'Parâmetros orgaos[] e ano são obrigatórios.' });
    }

    const results = {};

    // Processar em paralelo com limite de concorrência (máx 40 simultâneos)
    const concurrency = 40;
    const chunks = [];
    for (let i = 0; i < orgaos.length; i += concurrency) {
        chunks.push(orgaos.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (orgao) => {
            const cacheKey = `${orgao}_${ano}_${mes || 'all'}`;
            if (cache[cacheKey]) {
                results[orgao] = cache[cacheKey];
                return;
            }

            try {
                const url = `https://portal.tce.rs.gov.br/pcdi2/relatorios-recibos-envio.action?&cdOrgao=${orgao}&ano=${ano}`;
                const response = await fetch(url, { headers: TCERS_HEADERS, timeout: TCERS_TIMEOUT });

                if (!response.ok) {
                    results[orgao] = { orgao, status: 'pending' }; // Assume pending on fetch error for resilience
                    return;
                }

                const html = await response.text();
                const parsed = parsePadStatus(html, orgao, ano, mes ? parseInt(mes) : null);
                
                cache[cacheKey] = parsed;
                setTimeout(() => delete cache[cacheKey], 30 * 60 * 1000);
                
                results[orgao] = parsed;
            } catch (err) {
                results[orgao] = { orgao, status: 'pending' };
            }
        }));
    }

    res.json(results);
});

/**
 * Interpreta o HTML do TCE-RS e determina o status de envio do PAD.
 * 
 * A página contém seções como:
 *   "Sistema Informatizado de Auditoria e Prestação de Contas"
 *     -> Sem recibos = NÃO enviou PAD
 *     -> Com recibos = Enviou PAD
 * 
 * Os recibos contêm o período no link ou texto. Verificamos se o mês/ano
 * corresponde ao solicitado.
 */
function parsePadStatus(html, orgao, ano, mes) {
    // Definitive Isolation of the first PAD section only
    const startIdx = html.indexOf('Sistema Informatizado de Auditoria e Prestação de Contas');
    const endIdx = html.indexOf('Informações Complementares');
    
    let padSection = '';
    if (startIdx !== -1) {
        if (endIdx !== -1 && endIdx > startIdx) {
            padSection = html.substring(startIdx, endIdx);
        } else {
            padSection = html.substring(startIdx);
        }
    }

    const receiptLinks = [];
    const reReceipt = /imprimir-recibo\/(\d+)/g;
    let sentDateStr = null;
    
    if (!mes) {
        let match;
        while ((match = reReceipt.exec(padSection)) !== null) {
            receiptLinks.push(match[1]);
        }
    } else {
        const rows = padSection.split(/<tr[^>]*>/i);
        const monthStrEncoded = `${mes}&ordm; m&ecirc;s/${ano}`;
        const monthStrPlain = `${mes}º mês/${ano}`;
        
        rows.forEach(row => {
            if (row.includes(monthStrEncoded) || row.includes(monthStrPlain)) {
                const subMatch = row.match(/imprimir-recibo\/(\d+)/);
                if (subMatch) {
                    receiptLinks.push(subMatch[1]);
                    // Extract Date: typically the 3rd <td>
                    const cols = row.split(/<td[^>]*>/i);
                    if (cols.length >= 4) {
                        const dateText = cols[3].split('</td>')[0].trim();
                        if (dateText.match(/\d{2}\/\d{2}\/\d{4}/)) {
                            sentDateStr = dateText;
                        }
                    }
                }
            }
        });
    }

    let status = receiptLinks.length > 0 ? 'on-time' : 'pending';

    // If sent, check if it was late
    if (status === 'on-time' && sentDateStr && mes) {
        const lastDayOfMonth = new Date(parseInt(ano), parseInt(mes), 0);
        const deadline = new Date(lastDayOfMonth.getFullYear(), lastDayOfMonth.getMonth(), lastDayOfMonth.getDate() + 30);
        
        const [day, month, rest] = sentDateStr.split('/');
        const year = rest.split(' ')[0];
        const sentDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        
        if (sentDate > deadline) {
            status = 'late';
        }
    }

    return {
        orgao,
        ano,
        mes,
        status,
        sentDate: sentDateStr,
        sentReceipts: receiptLinks,
        consultedAt: new Date().toISOString(),
        hasAnySent: !mes && receiptLinks.length > 0
    };
}

// FNDE SIOPE
const FNDE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Connection': 'keep-alive'
};
const FNDE_TIMEOUT = 20000;
const siopeCache = {};

/**
 * POST /api/siope-status-batch
 * Body: { ibges: ["430245", ...], bimestre: 2, ano: 2026 }
 * Returns: { "430245": { ibge, status: 'on-time'|'late'|'pending', sentDate }, ... }
 */
app.post('/api/siope-status-batch', async (req, res) => {
    const { ibges, bimestre, ano } = req.body;
    if (!ibges || !bimestre || !ano) {
        return res.status(400).json({ error: 'Parâmetros ibges[], bimestre e ano são obrigatórios.' });
    }

    const results = {};
    const concurrency = 10;
    const chunks = [];
    for (let i = 0; i < ibges.length; i += concurrency) {
        chunks.push(ibges.slice(i, i + concurrency));
    }

    for (const chunk of chunks) {
        await Promise.all(chunk.map(async (ibge) => {
            const key = `siope_${ibge}_${bimestre}_${ano}`;
            if (siopeCache[key]) { results[ibge] = siopeCache[key]; return; }
            try {
                const url = `https://www.fnde.gov.br/siope/recibosTransmissao.do?tipoDeRecibo=1&cod_uf_mun=43&municipios=${ibge}&consultar=Consultar`;
                const r = await fetch(url, { headers: FNDE_HEADERS, timeout: FNDE_TIMEOUT });
                if (!r.ok) throw new Error(`FNDE HTTP ${r.status}`);
                const html = await r.text();
                const parsed = parseSiopeStatus(html, ibge, parseInt(bimestre), parseInt(ano));
                siopeCache[key] = parsed;
                setTimeout(() => delete siopeCache[key], 30 * 60 * 1000);
                results[ibge] = parsed;
            } catch (err) {
                console.error(`SIOPE ibge ${ibge}:`, err.message);
                results[ibge] = { ibge, status: 'pending', sentDate: null };
            }
        }));
    }

    res.json(results);
});

/**
 * Checks if a municipality submitted SIOPE for a given bimestre/year by parsing the FNDE HTML.
 * The FNDE page lists rows with "ANO - Nº Bimestre" and transmission dates.
 */
function parseSiopeStatus(html, ibge, bimestre, ano) {
    // Bimester end dates (month 0-based): 1º=Feb, 2º=Apr, 3º=Jun, 4º=Aug, 5º=Oct, 6º=Dec
    const endMonths = [1, 3, 5, 7, 9, 11];
    const bimEndDate = new Date(ano, endMonths[bimestre - 1] + 1, 0);
    const deadlineDate = new Date(bimEndDate.getFullYear(), bimEndDate.getMonth(), bimEndDate.getDate() + 30);

    const rows = html.split(/<tr[^>]*>/i);
    for (const row of rows) {
        // Match "ANO - N[º/&ordm;/&#186;] Bimestre" in any encoding
        const periodRe = new RegExp(
            `${ano}[^<]{0,20}${bimestre}(?:&(?:ordm|#186);|º)\\s*Bimestre`, 'i'
        );
        if (!periodRe.test(row)) continue;

        // Extract all DD/MM/YYYY dates; last one is the transmission date
        const dates = row.match(/\d{2}\/\d{2}\/\d{4}/g);
        const sentDateStr = dates ? dates[dates.length - 1] : null;

        let status = 'on-time';
        if (sentDateStr) {
            const [d, m, y] = sentDateStr.split('/');
            const sentDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            if (sentDate > deadlineDate) status = 'late';
        }

        return { ibge, status, sentDate: sentDateStr };
    }

    return { ibge, status: 'pending', sentDate: null };
}

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', port: PORT, cacheSize: Object.keys(cache).length });
});

/**
 * GET /api/pad-deadline?ano=2026&mes=4
 * Retorna a data-limite real de envio do PAD consultando a agenda TCE-RS.
 * Fallback: último dia do mês + 30 dias, deslizando para segunda-feira se cair no fim de semana.
 */
const deadlineCache = {};

app.get('/api/pad-deadline', async (req, res) => {
    const { ano, mes } = req.query;
    if (!ano || !mes) return res.status(400).json({ error: 'Parâmetros obrigatórios: ano e mes.' });

    const key = `${ano}_${mes}`;
    if (deadlineCache[key]) return res.json(deadlineCache[key]);

    const anoNum = parseInt(ano);
    const mesNum = parseInt(mes);

    let deadline = null;
    let source = 'formula';

    try {
        deadline = await fetchDeadlineFromAgendaTCERS(anoNum, mesNum);
        if (deadline) source = 'tcers';
    } catch (e) {
        console.warn(`pad-deadline: falha ao consultar agenda TCE-RS para ${mes}/${ano}:`, e.message);
    }

    if (!deadline) {
        deadline = computeDeadlineFormula(anoNum, mesNum);
    }

    const result = {
        ano: anoNum,
        mes: mesNum,
        deadline: formatDateBR(deadline),
        source
    };

    deadlineCache[key] = result;
    setTimeout(() => delete deadlineCache[key], 24 * 60 * 60 * 1000);

    res.json(result);
});

/**
 * Calcula o prazo como: último dia do mês + 30 dias,
 * deslizando para segunda-feira se cair em sábado ou domingo.
 */
function computeDeadlineFormula(ano, mes) {
    const lastDay = new Date(ano, mes, 0);
    const d = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + 30);
    const dow = d.getDay();
    if (dow === 6) d.setDate(d.getDate() + 2); // sábado → segunda
    if (dow === 0) d.setDate(d.getDate() + 1); // domingo → segunda
    return d;
}

function formatDateBR(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Consulta a agenda do TCE-RS e extrai a data-limite do SIAPC para o mês de referência.
 * Verifica o mês seguinte e, se não encontrar, o subsequente (pois o prazo pode cair 2 meses depois).
 */
async function fetchDeadlineFromAgendaTCERS(ano, mes) {
    const mesNames = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    const mesName = mesNames[mes - 1];

    for (let offset = 1; offset <= 2; offset++) {
        const calMes = ((mes - 1 + offset) % 12) + 1;
        const calAno = mes + offset > 12 ? ano + 1 : ano;

        const url = `https://tcers.tc.br/agenda-tce/?section=compromissos&mes=${calMes}&ano=${calAno}`;
        const response = await fetch(url, { headers: TCERS_HEADERS, timeout: TCERS_TIMEOUT });

        if (!response.ok) continue;
        const html = await response.text();

        const date = parseSiapcDeadline(html, mesName, ano, calAno, calMes);
        if (date) return date;
    }
    return null;
}

/**
 * Extrai do HTML da agenda TCE-RS a data de um evento SIAPC referente ao mês dado.
 * A agenda mostra os eventos por dia; buscamos o dia que contém o texto SIAPC + mês de referência.
 */
function parseSiapcDeadline(html, mesName, anoRef, calAno, calMes) {
    // A agenda TCE-RS costuma ter eventos em blocos como:
    //   <div class="day" data-date="2026-06-01"> ... SIAPC ... mês de abril ... </div>
    // Ou em tabelas com a data na linha/coluna anterior.
    // Buscamos a tag que contém SIAPC + referência ao mês.

    const lower = html.toLowerCase();
    let searchFrom = 0;

    while (true) {
        const siapcIdx = lower.indexOf('siapc', searchFrom);
        if (siapcIdx === -1) break;

        // Extrai contexto ao redor do evento
        const ctx = html.substring(Math.max(0, siapcIdx - 400), siapcIdx + 800);
        const ctxLower = ctx.toLowerCase();

        if (ctxLower.includes(mesName.toLowerCase()) && ctxLower.includes(String(anoRef))) {
            // Tenta extrair data no formato DD/MM/YYYY ou YYYY-MM-DD
            const isoMatch = ctx.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) {
                const [, y, m, d] = isoMatch;
                return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            }
            const brMatch = ctx.match(/(\d{1,2})\/(\d{2})\/(\d{4})/);
            if (brMatch) {
                const [, d, m, y] = brMatch;
                return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            }
            // Tenta extrair apenas o dia do calendário (ex: <td>1</td> antes do evento)
            const dayMatch = ctx.match(/>(\d{1,2})<\/(?:td|div|span|a)/);
            if (dayMatch) {
                const day = parseInt(dayMatch[1]);
                if (day >= 1 && day <= 31) {
                    return new Date(calAno, calMes - 1, day);
                }
            }
        }

        searchFrom = siapcIdx + 1;
    }
    return null;
}

// Inicia servidor apenas quando executado diretamente (não quando importado pelo Vercel)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\n✅ Servidor Delta PAD rodando em http://localhost:${PORT}`);
        console.log(`📊 Dashboard disponível em http://localhost:${PORT}/index_dashboard.html`);
        console.log(`🔍 API disponível em http://localhost:${PORT}/api/pad-status?orgao=88023&ano=2026&mes=1`);
        console.log(`\nPressione Ctrl+C para parar.\n`);
    });
}

module.exports = app;
